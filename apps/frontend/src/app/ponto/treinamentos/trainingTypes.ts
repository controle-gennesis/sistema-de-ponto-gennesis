export type TrainingEnrollmentStatus = 'ENROLLED' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

export const ENROLLMENT_STATUS_LABELS: Record<TrainingEnrollmentStatus, string> = {
  ENROLLED: 'Matriculado',
  IN_PROGRESS: 'Em andamento',
  COMPLETED: 'Concluído',
  FAILED: 'Reprovado'
};

export type TrainingVideoProvider = 'YOUTUBE' | 'VIMEO' | 'URL';

export type TrainingCertificateRef = {
  id: string;
  code: string;
  issuedAt: string;
};

export type TrainingLesson = {
  id: string;
  courseId?: string;
  title: string;
  description: string | null;
  videoUrl: string | null;
  videoProvider: TrainingVideoProvider;
  attachmentUrl: string | null;
  attachmentName: string | null;
  durationMinutes: number | null;
  position: number;
  isActive?: boolean;
};

export type TrainingQuestionOption = { id: string; label: string; correct?: boolean };

export type TrainingQuestion = {
  id: string;
  courseId?: string;
  statement: string;
  options: TrainingQuestionOption[];
  position: number;
  isActive?: boolean;
};

/** Curso na listagem administrativa. */
export type TrainingCourseAdminRow = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  coverImageUrl: string | null;
  workloadHours: number | null;
  passingScore: number;
  certificateEnabled: boolean;
  isPublished: boolean;
  isActive: boolean;
  createdAt: string;
  createdBy?: { id: string; name: string } | null;
  completedCount: number;
  _count: { enrollments: number; lessons: number; questions: number };
};

export type TrainingCourseAdminDetail = TrainingCourseAdminRow & {
  lessons: TrainingLesson[];
  questions: TrainingQuestion[];
};

export type TrainingEnrollmentAdminRow = {
  id: string;
  courseId: string;
  userId: string;
  status: TrainingEnrollmentStatus;
  enrolledAt: string;
  startedAt: string | null;
  completedAt: string | null;
  bestScore: number | null;
  attemptCount: number;
  totalLessons: number;
  completedLessons: number;
  progressPercent: number;
  user: {
    id: string;
    name: string;
    email: string | null;
    employee?: { position?: string | null; department?: string | null } | null;
  };
  certificate?: TrainingCertificateRef | null;
};

/** Curso na vitrine do aluno. */
export type TrainingCourseStudentRow = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  coverImageUrl: string | null;
  workloadHours: number | null;
  passingScore: number;
  certificateEnabled: boolean;
  totalLessons: number;
  completedLessons: number;
  progressPercent: number;
  _count: { lessons: number; questions: number };
  enrollment: {
    id: string;
    status: TrainingEnrollmentStatus;
    bestScore: number | null;
    attemptCount: number;
    completedAt: string | null;
    certificate?: TrainingCertificateRef | null;
  } | null;
};

export type TrainingCourseStudentDetail = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  coverImageUrl: string | null;
  workloadHours: number | null;
  passingScore: number;
  certificateEnabled: boolean;
  isPublished: boolean;
  lessons: Array<TrainingLesson & { completed: boolean }>;
  questions: Array<{ id: string; statement: string; position: number; options: Array<{ id: string; label: string }> }>;
  totalLessons: number;
  completedLessons: number;
  progressPercent: number;
  enrollment: {
    id: string;
    status: TrainingEnrollmentStatus;
    bestScore: number | null;
    attemptCount: number;
    startedAt: string | null;
    completedAt: string | null;
    certificate?: TrainingCertificateRef | null;
    attempts: Array<{
      id: string;
      score: number;
      passed: boolean;
      correctCount: number;
      questionCount: number;
      createdAt: string;
    }>;
  } | null;
};

export type TrainingQuizResult = {
  attemptId: string;
  score: number;
  passed: boolean;
  correctCount: number;
  questionCount: number;
  passingScore: number;
  bestScore: number;
  certificate: TrainingCertificateRef | null;
  review: Array<{
    questionId: string;
    statement: string;
    chosenOptionId: string | null;
    correctOptionId: string | null;
    correct: boolean;
  }>;
};

export type TrainingCertificateData = {
  code: string;
  issuedAt: string;
  score: number | null;
  workloadHours: number | null;
  studentName: string;
  studentCpf: string | null;
  courseTitle: string;
  courseCategory: string | null;
  completedAt: string | null;
};

/** Converte a URL informada no cadastro em URL embutível no player. */
export function trainingEmbedUrl(
  videoUrl: string | null | undefined,
  provider: TrainingVideoProvider
): string | null {
  if (!videoUrl) return null;
  const url = videoUrl.trim();
  if (!url) return null;

  if (provider === 'YOUTUBE') {
    const id =
      url.match(/[?&]v=([\w-]{6,})/)?.[1] ||
      url.match(/youtu\.be\/([\w-]{6,})/)?.[1] ||
      url.match(/youtube\.com\/embed\/([\w-]{6,})/)?.[1] ||
      url.match(/youtube\.com\/shorts\/([\w-]{6,})/)?.[1];
    return id ? `https://www.youtube.com/embed/${id}` : null;
  }
  if (provider === 'VIMEO') {
    const id = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)?.[1];
    return id ? `https://player.vimeo.com/video/${id}` : null;
  }
  return url;
}
