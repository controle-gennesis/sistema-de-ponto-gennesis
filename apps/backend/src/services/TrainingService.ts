import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { prisma } from '../lib/prisma';
import { createError } from '../middleware/errorHandler';

export type TrainingEnrollmentStatus = 'ENROLLED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

const VIDEO_PROVIDERS = ['YOUTUBE', 'VIMEO', 'URL'] as const;
type TrainingVideoProvider = (typeof VIDEO_PROVIDERS)[number];

export type TrainingQuestionOption = { id: string; label: string; correct: boolean };

type QuizAnswerRecord = { questionId: string; optionId: string | null; correct: boolean };

function trimOrNull(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function parseVideoProvider(value: unknown, videoUrl: string | null): TrainingVideoProvider {
  const raw = String(value ?? '').trim().toUpperCase();
  if ((VIDEO_PROVIDERS as readonly string[]).includes(raw)) return raw as TrainingVideoProvider;
  if (!videoUrl) return 'URL';
  if (/youtu\.?be/i.test(videoUrl)) return 'YOUTUBE';
  if (/vimeo/i.test(videoUrl)) return 'VIMEO';
  return 'URL';
}

function parsePassingScore(value: unknown, fallback = 70): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(100, Math.max(0, Math.round(num)));
}

function parseWorkloadHours(value: unknown): number | null {
  if (value == null || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num * 100) / 100;
}

function parsePositiveInt(value: unknown): number | null {
  if (value == null || value === '') return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num);
}

/** Normaliza alternativas garantindo ids estáveis e exatamente uma correta. */
function parseQuestionOptions(value: unknown): TrainingQuestionOption[] {
  if (!Array.isArray(value) || value.length < 2) {
    throw createError('Informe ao menos duas alternativas para a pergunta', 400);
  }
  const options: TrainingQuestionOption[] = [];
  value.forEach((item, index) => {
    const raw = (item ?? {}) as Record<string, unknown>;
    const label = trimOrNull(raw.label ?? raw.text);
    if (!label) return;
    options.push({
      id: trimOrNull(raw.id) || `opt-${index + 1}`,
      label,
      correct: raw.correct === true
    });
  });
  if (options.length < 2) {
    throw createError('Informe ao menos duas alternativas para a pergunta', 400);
  }
  const correctCount = options.filter((o) => o.correct).length;
  if (correctCount !== 1) {
    throw createError('Marque exatamente uma alternativa correta', 400);
  }
  return options;
}

function readQuestionOptions(value: Prisma.JsonValue | null): TrainingQuestionOption[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item, index) => {
      const raw = (item ?? {}) as Record<string, unknown>;
      const label = trimOrNull(raw.label);
      if (!label) return null;
      return {
        id: trimOrNull(raw.id) || `opt-${index + 1}`,
        label,
        correct: raw.correct === true
      };
    })
    .filter((o): o is TrainingQuestionOption => !!o);
}

const COURSE_ADMIN_INCLUDE = {
  createdBy: { select: { id: true, name: true } },
  lessons: { orderBy: [{ position: 'asc' as const }, { createdAt: 'asc' as const }] },
  questions: { orderBy: [{ position: 'asc' as const }, { createdAt: 'asc' as const }] },
  _count: { select: { enrollments: true, lessons: true, questions: true } }
} satisfies Prisma.TrainingCourseInclude;

function certificateCode(): string {
  return randomBytes(6).toString('hex').toUpperCase();
}

export class TrainingService {
  // ── Administração de cursos ───────────────────────────────────────

  async listCourses(params: { search?: string; category?: string; includeUnpublished?: boolean }) {
    const where: Prisma.TrainingCourseWhereInput = { isActive: true };
    if (!params.includeUnpublished) where.isPublished = true;
    if (params.category) where.category = params.category;
    const search = params.search?.trim();
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } }
      ];
    }

    const courses = await prisma.trainingCourse.findMany({
      where,
      orderBy: [{ isPublished: 'desc' }, { title: 'asc' }],
      include: {
        createdBy: { select: { id: true, name: true } },
        _count: { select: { enrollments: true, lessons: true, questions: true } }
      }
    });

    const ids = courses.map((c) => c.id);
    const completed = ids.length
      ? await prisma.trainingEnrollment.groupBy({
          by: ['courseId'],
          where: { courseId: { in: ids }, status: 'COMPLETED' },
          _count: { _all: true }
        })
      : [];
    const completedMap = new Map(completed.map((row) => [row.courseId, row._count._all]));

    return courses.map((course) => ({
      ...course,
      completedCount: completedMap.get(course.id) ?? 0
    }));
  }

  async getCourseAdmin(id: string) {
    const course = await prisma.trainingCourse.findUnique({
      where: { id },
      include: COURSE_ADMIN_INCLUDE
    });
    if (!course) throw createError('Curso não encontrado', 404);
    return {
      ...course,
      questions: course.questions.map((q) => ({ ...q, options: readQuestionOptions(q.options) }))
    };
  }

  async createCourse(input: Record<string, unknown>, createdById: string) {
    const title = trimOrNull(input.title);
    if (!title) throw createError('Informe o título do curso', 400);
    return prisma.trainingCourse.create({
      data: {
        title,
        description: trimOrNull(input.description),
        category: trimOrNull(input.category),
        coverImageUrl: trimOrNull(input.coverImageUrl),
        workloadHours: parseWorkloadHours(input.workloadHours),
        passingScore: parsePassingScore(input.passingScore),
        certificateEnabled: input.certificateEnabled !== false,
        isPublished: input.isPublished === true,
        createdById
      },
      include: COURSE_ADMIN_INCLUDE
    });
  }

  async updateCourse(id: string, input: Record<string, unknown>) {
    const existing = await prisma.trainingCourse.findUnique({ where: { id } });
    if (!existing) throw createError('Curso não encontrado', 404);

    const data: Prisma.TrainingCourseUpdateInput = {};
    if (input.title !== undefined) {
      const title = trimOrNull(input.title);
      if (!title) throw createError('Informe o título do curso', 400);
      data.title = title;
    }
    if (input.description !== undefined) data.description = trimOrNull(input.description);
    if (input.category !== undefined) data.category = trimOrNull(input.category);
    if (input.coverImageUrl !== undefined) data.coverImageUrl = trimOrNull(input.coverImageUrl);
    if (input.workloadHours !== undefined) {
      data.workloadHours = parseWorkloadHours(input.workloadHours);
    }
    if (input.passingScore !== undefined) {
      data.passingScore = parsePassingScore(input.passingScore, existing.passingScore);
    }
    if (input.certificateEnabled !== undefined) {
      data.certificateEnabled = input.certificateEnabled === true;
    }
    if (input.isPublished !== undefined) data.isPublished = input.isPublished === true;
    if (input.isActive !== undefined) data.isActive = input.isActive === true;

    await prisma.trainingCourse.update({ where: { id }, data });
    return this.getCourseAdmin(id);
  }

  async deleteCourse(id: string) {
    const existing = await prisma.trainingCourse.findUnique({
      where: { id },
      include: { _count: { select: { enrollments: true } } }
    });
    if (!existing) throw createError('Curso não encontrado', 404);
    if (existing._count.enrollments > 0) {
      // Preserva histórico de matrículas e certificados: apenas arquiva o curso.
      await prisma.trainingCourse.update({
        where: { id },
        data: { isActive: false, isPublished: false }
      });
      return { archived: true, enrollments: existing._count.enrollments };
    }
    await prisma.trainingCourse.delete({ where: { id } });
    return { archived: false, enrollments: 0 };
  }

  // ── Aulas ─────────────────────────────────────────────────────────

  async createLesson(courseId: string, input: Record<string, unknown>) {
    const course = await prisma.trainingCourse.findUnique({ where: { id: courseId } });
    if (!course) throw createError('Curso não encontrado', 404);
    const title = trimOrNull(input.title);
    if (!title) throw createError('Informe o título da aula', 400);
    const videoUrl = trimOrNull(input.videoUrl);
    const last = await prisma.trainingLesson.findFirst({
      where: { courseId },
      orderBy: { position: 'desc' },
      select: { position: true }
    });
    return prisma.trainingLesson.create({
      data: {
        courseId,
        title,
        description: trimOrNull(input.description),
        videoUrl,
        videoProvider: parseVideoProvider(input.videoProvider, videoUrl),
        attachmentUrl: trimOrNull(input.attachmentUrl),
        attachmentName: trimOrNull(input.attachmentName),
        durationMinutes: parsePositiveInt(input.durationMinutes),
        position: (last?.position ?? -1) + 1
      }
    });
  }

  async updateLesson(lessonId: string, input: Record<string, unknown>) {
    const existing = await prisma.trainingLesson.findUnique({ where: { id: lessonId } });
    if (!existing) throw createError('Aula não encontrada', 404);

    const data: Prisma.TrainingLessonUpdateInput = {};
    if (input.title !== undefined) {
      const title = trimOrNull(input.title);
      if (!title) throw createError('Informe o título da aula', 400);
      data.title = title;
    }
    if (input.description !== undefined) data.description = trimOrNull(input.description);
    if (input.videoUrl !== undefined) {
      const videoUrl = trimOrNull(input.videoUrl);
      data.videoUrl = videoUrl;
      data.videoProvider = parseVideoProvider(input.videoProvider, videoUrl);
    } else if (input.videoProvider !== undefined) {
      data.videoProvider = parseVideoProvider(input.videoProvider, existing.videoUrl);
    }
    if (input.attachmentUrl !== undefined) data.attachmentUrl = trimOrNull(input.attachmentUrl);
    if (input.attachmentName !== undefined) data.attachmentName = trimOrNull(input.attachmentName);
    if (input.durationMinutes !== undefined) {
      data.durationMinutes = parsePositiveInt(input.durationMinutes);
    }
    if (input.position !== undefined) data.position = parsePositiveInt(input.position) ?? 0;
    if (input.isActive !== undefined) data.isActive = input.isActive === true;

    return prisma.trainingLesson.update({ where: { id: lessonId }, data });
  }

  async deleteLesson(lessonId: string) {
    const existing = await prisma.trainingLesson.findUnique({ where: { id: lessonId } });
    if (!existing) throw createError('Aula não encontrada', 404);
    await prisma.trainingLesson.delete({ where: { id: lessonId } });
    return { id: lessonId };
  }

  async reorderLessons(courseId: string, lessonIds: unknown) {
    if (!Array.isArray(lessonIds)) throw createError('Lista de aulas inválida', 400);
    const ids = lessonIds.map((id) => String(id ?? '').trim()).filter(Boolean);
    await prisma.$transaction(
      ids.map((id, index) =>
        prisma.trainingLesson.updateMany({ where: { id, courseId }, data: { position: index } })
      )
    );
    return { count: ids.length };
  }

  // ── Questionário ──────────────────────────────────────────────────

  async createQuestion(courseId: string, input: Record<string, unknown>) {
    const course = await prisma.trainingCourse.findUnique({ where: { id: courseId } });
    if (!course) throw createError('Curso não encontrado', 404);
    const statement = trimOrNull(input.statement);
    if (!statement) throw createError('Informe o enunciado da pergunta', 400);
    const options = parseQuestionOptions(input.options);
    const last = await prisma.trainingQuestion.findFirst({
      where: { courseId },
      orderBy: { position: 'desc' },
      select: { position: true }
    });
    const created = await prisma.trainingQuestion.create({
      data: {
        courseId,
        statement,
        options: options as unknown as Prisma.InputJsonValue,
        position: (last?.position ?? -1) + 1
      }
    });
    return { ...created, options };
  }

  async updateQuestion(questionId: string, input: Record<string, unknown>) {
    const existing = await prisma.trainingQuestion.findUnique({ where: { id: questionId } });
    if (!existing) throw createError('Pergunta não encontrada', 404);

    const data: Prisma.TrainingQuestionUpdateInput = {};
    if (input.statement !== undefined) {
      const statement = trimOrNull(input.statement);
      if (!statement) throw createError('Informe o enunciado da pergunta', 400);
      data.statement = statement;
    }
    if (input.options !== undefined) {
      data.options = parseQuestionOptions(input.options) as unknown as Prisma.InputJsonValue;
    }
    if (input.position !== undefined) data.position = parsePositiveInt(input.position) ?? 0;
    if (input.isActive !== undefined) data.isActive = input.isActive === true;

    const updated = await prisma.trainingQuestion.update({ where: { id: questionId }, data });
    return { ...updated, options: readQuestionOptions(updated.options) };
  }

  async deleteQuestion(questionId: string) {
    const existing = await prisma.trainingQuestion.findUnique({ where: { id: questionId } });
    if (!existing) throw createError('Pergunta não encontrada', 404);
    await prisma.trainingQuestion.delete({ where: { id: questionId } });
    return { id: questionId };
  }

  // ── Matrículas (visão do administrador) ───────────────────────────

  async listEnrollments(courseId: string) {
    const course = await prisma.trainingCourse.findUnique({
      where: { id: courseId },
      select: { id: true, _count: { select: { lessons: true } } }
    });
    if (!course) throw createError('Curso não encontrado', 404);

    const enrollments = await prisma.trainingEnrollment.findMany({
      where: { courseId },
      orderBy: [{ status: 'asc' }, { enrolledAt: 'desc' }],
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            employee: { select: { position: true, department: true } }
          }
        },
        certificate: { select: { id: true, code: true, issuedAt: true } },
        _count: { select: { lessonProgress: true, attempts: true } }
      }
    });

    const totalLessons = course._count.lessons;
    return enrollments.map((enrollment) => ({
      ...enrollment,
      totalLessons,
      completedLessons: enrollment._count.lessonProgress,
      progressPercent: totalLessons
        ? Math.round((enrollment._count.lessonProgress / totalLessons) * 100)
        : 0
    }));
  }

  async enrollUsers(courseId: string, userIds: unknown) {
    const course = await prisma.trainingCourse.findUnique({ where: { id: courseId } });
    if (!course) throw createError('Curso não encontrado', 404);
    if (!Array.isArray(userIds) || !userIds.length) {
      throw createError('Selecione ao menos um funcionário', 400);
    }
    const ids = [...new Set(userIds.map((id) => String(id ?? '').trim()).filter(Boolean))];
    const found = await prisma.user.count({ where: { id: { in: ids }, isActive: true } });
    if (found !== ids.length) {
      throw createError('Um ou mais funcionários não existem ou estão inativos', 400);
    }
    const result = await prisma.trainingEnrollment.createMany({
      data: ids.map((userId) => ({ courseId, userId })),
      skipDuplicates: true
    });
    return { enrolled: result.count };
  }

  async removeEnrollment(enrollmentId: string) {
    const existing = await prisma.trainingEnrollment.findUnique({ where: { id: enrollmentId } });
    if (!existing) throw createError('Matrícula não encontrada', 404);
    await prisma.trainingEnrollment.delete({ where: { id: enrollmentId } });
    return { id: enrollmentId };
  }

  // ── Visão do aluno ────────────────────────────────────────────────

  async listMyCourses(userId: string) {
    const courses = await prisma.trainingCourse.findMany({
      where: { isActive: true, isPublished: true },
      orderBy: [{ category: 'asc' }, { title: 'asc' }],
      include: {
        _count: { select: { lessons: true, questions: true } },
        enrollments: {
          where: { userId },
          include: {
            certificate: { select: { id: true, code: true, issuedAt: true } },
            _count: { select: { lessonProgress: true } }
          }
        }
      }
    });

    return courses.map((course) => {
      const enrollment = course.enrollments[0] ?? null;
      const totalLessons = course._count.lessons;
      const completedLessons = enrollment?._count.lessonProgress ?? 0;
      const { enrollments, ...rest } = course;
      void enrollments;
      return {
        ...rest,
        enrollment: enrollment
          ? {
              id: enrollment.id,
              status: enrollment.status,
              bestScore: enrollment.bestScore,
              attemptCount: enrollment.attemptCount,
              completedAt: enrollment.completedAt,
              certificate: enrollment.certificate
            }
          : null,
        totalLessons,
        completedLessons,
        progressPercent: totalLessons ? Math.round((completedLessons / totalLessons) * 100) : 0
      };
    });
  }

  async enrollSelf(courseId: string, userId: string) {
    const course = await prisma.trainingCourse.findUnique({ where: { id: courseId } });
    if (!course || !course.isActive || !course.isPublished) {
      throw createError('Curso não disponível para matrícula', 404);
    }
    const existing = await prisma.trainingEnrollment.findUnique({
      where: { courseId_userId: { courseId, userId } }
    });
    if (existing) return existing;
    return prisma.trainingEnrollment.create({ data: { courseId, userId } });
  }

  /** Curso na visão do aluno: aulas, progresso e questionário sem o gabarito. */
  async getCourseForStudent(courseId: string, userId: string) {
    const course = await prisma.trainingCourse.findUnique({
      where: { id: courseId },
      include: {
        lessons: {
          where: { isActive: true },
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }]
        },
        questions: {
          where: { isActive: true },
          orderBy: [{ position: 'asc' }, { createdAt: 'asc' }]
        }
      }
    });
    if (!course || !course.isActive) throw createError('Curso não encontrado', 404);

    const enrollment = await prisma.trainingEnrollment.findUnique({
      where: { courseId_userId: { courseId, userId } },
      include: {
        lessonProgress: { select: { lessonId: true, completedAt: true } },
        certificate: { select: { id: true, code: true, issuedAt: true } },
        attempts: { orderBy: { createdAt: 'desc' }, take: 10 }
      }
    });

    const completedLessonIds = new Set(enrollment?.lessonProgress.map((p) => p.lessonId) ?? []);
    const totalLessons = course.lessons.length;

    return {
      id: course.id,
      title: course.title,
      description: course.description,
      category: course.category,
      coverImageUrl: course.coverImageUrl,
      workloadHours: course.workloadHours,
      passingScore: course.passingScore,
      certificateEnabled: course.certificateEnabled,
      isPublished: course.isPublished,
      lessons: course.lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        description: lesson.description,
        videoUrl: lesson.videoUrl,
        videoProvider: lesson.videoProvider,
        attachmentUrl: lesson.attachmentUrl,
        attachmentName: lesson.attachmentName,
        durationMinutes: lesson.durationMinutes,
        position: lesson.position,
        completed: completedLessonIds.has(lesson.id)
      })),
      // O gabarito nunca é enviado para o aluno.
      questions: course.questions.map((question) => ({
        id: question.id,
        statement: question.statement,
        position: question.position,
        options: readQuestionOptions(question.options).map((o) => ({ id: o.id, label: o.label }))
      })),
      enrollment: enrollment
        ? {
            id: enrollment.id,
            status: enrollment.status,
            bestScore: enrollment.bestScore,
            attemptCount: enrollment.attemptCount,
            startedAt: enrollment.startedAt,
            completedAt: enrollment.completedAt,
            certificate: enrollment.certificate,
            attempts: enrollment.attempts.map((attempt) => ({
              id: attempt.id,
              score: attempt.score,
              passed: attempt.passed,
              correctCount: attempt.correctCount,
              questionCount: attempt.questionCount,
              createdAt: attempt.createdAt
            }))
          }
        : null,
      totalLessons,
      completedLessons: completedLessonIds.size,
      progressPercent: totalLessons
        ? Math.round((completedLessonIds.size / totalLessons) * 100)
        : 0
    };
  }

  async completeLesson(courseId: string, lessonId: string, userId: string) {
    const lesson = await prisma.trainingLesson.findFirst({ where: { id: lessonId, courseId } });
    if (!lesson) throw createError('Aula não encontrada neste curso', 404);

    const enrollment = await this.enrollSelf(courseId, userId);
    await prisma.trainingLessonProgress.upsert({
      where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } },
      update: {},
      create: { enrollmentId: enrollment.id, lessonId }
    });
    if (enrollment.status === 'ENROLLED') {
      await prisma.trainingEnrollment.update({
        where: { id: enrollment.id },
        data: { status: 'IN_PROGRESS', startedAt: enrollment.startedAt ?? new Date() }
      });
    }
    return this.getCourseForStudent(courseId, userId);
  }

  /** Corrige a avaliação, registra a tentativa e emite o certificado quando aprovado. */
  async submitQuiz(courseId: string, userId: string, answers: unknown) {
    const course = await prisma.trainingCourse.findUnique({
      where: { id: courseId },
      include: {
        questions: { where: { isActive: true } },
        lessons: { where: { isActive: true }, select: { id: true } }
      }
    });
    if (!course || !course.isActive) throw createError('Curso não encontrado', 404);
    if (!course.questions.length) throw createError('Este curso não possui avaliação', 400);
    if (!Array.isArray(answers)) throw createError('Respostas inválidas', 400);

    const answerMap = new Map<string, string>();
    for (const item of answers) {
      const raw = (item ?? {}) as Record<string, unknown>;
      const questionId = trimOrNull(raw.questionId);
      const optionId = trimOrNull(raw.optionId);
      if (questionId && optionId) answerMap.set(questionId, optionId);
    }

    const graded: QuizAnswerRecord[] = course.questions.map((question) => {
      const options = readQuestionOptions(question.options);
      const chosen = answerMap.get(question.id) ?? null;
      const correctOption = options.find((o) => o.correct);
      return {
        questionId: question.id,
        optionId: chosen,
        correct: !!chosen && !!correctOption && chosen === correctOption.id
      };
    });

    const correctCount = graded.filter((g) => g.correct).length;
    const questionCount = graded.length;
    const score = Math.round((correctCount / questionCount) * 100);
    const passed = score >= course.passingScore;

    const enrollment = await this.enrollSelf(courseId, userId);
    const attempt = await prisma.trainingQuizAttempt.create({
      data: {
        enrollmentId: enrollment.id,
        score,
        passed,
        correctCount,
        questionCount,
        answers: graded as unknown as Prisma.InputJsonValue
      }
    });

    const bestScore = Math.max(enrollment.bestScore ?? 0, score);
    await prisma.trainingEnrollment.update({
      where: { id: enrollment.id },
      data: {
        status: passed ? 'COMPLETED' : 'FAILED',
        bestScore,
        attemptCount: { increment: 1 },
        startedAt: enrollment.startedAt ?? new Date(),
        completedAt: passed ? new Date() : enrollment.completedAt
      }
    });

    let certificate = null as { id: string; code: string; issuedAt: Date } | null;
    if (passed && course.certificateEnabled) {
      certificate = await prisma.trainingCertificate.upsert({
        where: { enrollmentId: enrollment.id },
        update: { score: bestScore, workloadHours: course.workloadHours },
        create: {
          enrollmentId: enrollment.id,
          code: certificateCode(),
          score: bestScore,
          workloadHours: course.workloadHours
        },
        select: { id: true, code: true, issuedAt: true }
      });
    }

    return {
      attemptId: attempt.id,
      score,
      passed,
      correctCount,
      questionCount,
      passingScore: course.passingScore,
      bestScore,
      certificate,
      /** Devolve o gabarito só depois de responder, para o aluno revisar. */
      review: course.questions.map((question) => {
        const options = readQuestionOptions(question.options);
        const answer = graded.find((g) => g.questionId === question.id);
        return {
          questionId: question.id,
          statement: question.statement,
          chosenOptionId: answer?.optionId ?? null,
          correctOptionId: options.find((o) => o.correct)?.id ?? null,
          correct: answer?.correct ?? false
        };
      })
    };
  }

  /** Dados do certificado; `userId` restringe o acesso quando não é administrador. */
  async getCertificate(params: { code?: string; enrollmentId?: string; userId?: string }) {
    const where: Prisma.TrainingCertificateWhereInput = {};
    if (params.code) where.code = params.code.trim().toUpperCase();
    else if (params.enrollmentId) where.enrollmentId = params.enrollmentId;
    else throw createError('Informe o código do certificado', 400);

    const certificate = await prisma.trainingCertificate.findFirst({
      where,
      include: {
        enrollment: {
          include: {
            user: { select: { id: true, name: true, cpf: true } },
            course: { select: { id: true, title: true, workloadHours: true, category: true } }
          }
        }
      }
    });
    if (!certificate) throw createError('Certificado não encontrado', 404);
    if (params.userId && certificate.enrollment.userId !== params.userId) {
      throw createError('Sem permissão para acessar este certificado', 403);
    }

    return {
      code: certificate.code,
      issuedAt: certificate.issuedAt,
      score: certificate.score,
      workloadHours: certificate.workloadHours ?? certificate.enrollment.course.workloadHours,
      studentName: certificate.enrollment.user.name,
      studentCpf: certificate.enrollment.user.cpf,
      courseTitle: certificate.enrollment.course.title,
      courseCategory: certificate.enrollment.course.category,
      completedAt: certificate.enrollment.completedAt
    };
  }

  async listMyCertificates(userId: string) {
    const rows = await prisma.trainingCertificate.findMany({
      where: { enrollment: { userId } },
      orderBy: { issuedAt: 'desc' },
      include: {
        enrollment: {
          select: {
            completedAt: true,
            course: { select: { id: true, title: true, workloadHours: true, category: true } }
          }
        }
      }
    });
    return rows.map((row) => ({
      code: row.code,
      issuedAt: row.issuedAt,
      score: row.score,
      workloadHours: row.workloadHours ?? row.enrollment.course.workloadHours,
      courseId: row.enrollment.course.id,
      courseTitle: row.enrollment.course.title,
      courseCategory: row.enrollment.course.category,
      completedAt: row.enrollment.completedAt
    }));
  }
}

export const trainingService = new TrainingService();
