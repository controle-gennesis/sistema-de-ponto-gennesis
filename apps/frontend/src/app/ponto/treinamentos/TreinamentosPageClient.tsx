'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  Award,
  CheckCircle2,
  Clock3,
  Download,
  FileText,
  GraduationCap,
  ListChecks,
  PlayCircle,
  Search,
  X
} from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import {
  CadastroListEmpty,
  CadastroListLoading
} from '@/components/ui/CadastroListSummary';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { exportTrainingCertificatePdf } from '@/lib/exportTrainingCertificatePdf';
import {
  ENROLLMENT_STATUS_LABELS,
  trainingEmbedUrl,
  type TrainingCertificateData,
  type TrainingCourseStudentDetail,
  type TrainingCourseStudentRow,
  type TrainingQuizResult
} from './trainingTypes';

function statusBadgeClass(status: string | undefined) {
  switch (status) {
    case 'COMPLETED':
      return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300';
    case 'IN_PROGRESS':
      return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300';
    case 'FAILED':
      return 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300';
    case 'ENROLLED':
      return 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300';
    default:
      return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300';
  }
}

function formatWorkload(hours: number | null) {
  if (hours == null || hours <= 0) return null;
  const label = Number.isInteger(hours) ? String(hours) : hours.toFixed(1).replace('.', ',');
  return `${label}h`;
}

export default function TreinamentosPageClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [openCourseId, setOpenCourseId] = useState<string | null>(null);
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [quizOpen, setQuizOpen] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});
  const [quizResult, setQuizResult] = useState<TrainingQuizResult | null>(null);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });
  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  const { data: courses = [], isLoading } = useQuery({
    queryKey: ['training-my-courses'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: TrainingCourseStudentRow[] }>(
        '/training/my-courses'
      );
      return res.data?.data ?? [];
    }
  });

  const { data: courseDetail, isLoading: loadingDetail } = useQuery({
    queryKey: ['training-course-student', openCourseId],
    enabled: !!openCourseId,
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: TrainingCourseStudentDetail }>(
        `/training/courses/${openCourseId}/student`
      );
      return res.data?.data;
    }
  });

  useEffect(() => {
    if (!courseDetail) return;
    setActiveLessonId((current) => {
      if (current && courseDetail.lessons.some((l) => l.id === current)) return current;
      const firstPending = courseDetail.lessons.find((l) => !l.completed);
      return firstPending?.id ?? courseDetail.lessons[0]?.id ?? null;
    });
  }, [courseDetail]);

  const categories = useMemo(
    () => [...new Set(courses.map((c) => c.category).filter(Boolean))] as string[],
    [courses]
  );

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return courses.filter((course) => {
      if (categoryFilter && course.category !== categoryFilter) return false;
      if (!q) return true;
      return [course.title, course.description, course.category]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [courses, search, categoryFilter]);

  const totals = useMemo(
    () => ({
      available: courses.length,
      inProgress: courses.filter((c) => c.enrollment?.status === 'IN_PROGRESS').length,
      completed: courses.filter((c) => c.enrollment?.status === 'COMPLETED').length,
      certificates: courses.filter((c) => c.enrollment?.certificate).length
    }),
    [courses]
  );

  const invalidate = (courseId?: string | null) => {
    void queryClient.invalidateQueries({ queryKey: ['training-my-courses'] });
    if (courseId) {
      void queryClient.invalidateQueries({ queryKey: ['training-course-student', courseId] });
    }
  };

  const enrollMutation = useMutation({
    mutationFn: async (courseId: string) => {
      await api.post(`/training/courses/${courseId}/enroll`, {});
    },
    onSuccess: (_d, courseId) => {
      toast.success('Matrícula realizada.');
      invalidate(courseId);
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Não foi possível matricular.');
    }
  });

  const completeLessonMutation = useMutation({
    mutationFn: async ({ courseId, lessonId }: { courseId: string; lessonId: string }) => {
      await api.post(`/training/courses/${courseId}/lessons/${lessonId}/complete`, {});
    },
    onSuccess: (_d, vars) => {
      toast.success('Aula concluída.');
      invalidate(vars.courseId);
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Não foi possível registrar a aula.');
    }
  });

  const submitQuizMutation = useMutation({
    mutationFn: async (courseId: string) => {
      const answers = Object.entries(quizAnswers).map(([questionId, optionId]) => ({
        questionId,
        optionId
      }));
      const res = await api.post<{ success: boolean; data: TrainingQuizResult }>(
        `/training/courses/${courseId}/quiz`,
        { answers }
      );
      return res.data?.data;
    },
    onSuccess: (result, courseId) => {
      setQuizResult(result ?? null);
      invalidate(courseId);
      if (result?.passed) toast.success(`Aprovado com ${result.score}%!`);
      else toast.error(`Aproveitamento de ${result?.score ?? 0}% — tente novamente.`);
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Não foi possível enviar a avaliação.');
    }
  });

  const downloadCertificate = async (code: string) => {
    try {
      const res = await api.get<{ success: boolean; data: TrainingCertificateData }>(
        `/training/certificates/${code}`
      );
      const data = res.data?.data;
      if (!data) throw new Error('sem dados');
      await exportTrainingCertificatePdf(data);
    } catch {
      toast.error('Não foi possível gerar o certificado.');
    }
  };

  const openCourse = (courseId: string) => {
    setOpenCourseId(courseId);
    setActiveLessonId(null);
    setQuizOpen(false);
    setQuizAnswers({});
    setQuizResult(null);
  };

  const closeCourse = () => {
    setOpenCourseId(null);
    setActiveLessonId(null);
    setQuizOpen(false);
    setQuizAnswers({});
    setQuizResult(null);
  };

  const activeLesson = courseDetail?.lessons.find((l) => l.id === activeLessonId) ?? null;
  const embedUrl = activeLesson
    ? trainingEmbedUrl(activeLesson.videoUrl, activeLesson.videoProvider)
    : null;
  const allLessonsDone =
    !!courseDetail && courseDetail.totalLessons > 0 && courseDetail.completedLessons >= courseDetail.totalLessons;

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/treinamentos">
      <MainLayout userRole={user.role || 'EMPLOYEE'} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Central de Treinamentos
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Assista às videoaulas, faça a avaliação e emita seu certificado de conclusão.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: 'Cursos disponíveis', value: totals.available, tone: 'text-blue-600 dark:text-blue-400' },
              { label: 'Em andamento', value: totals.inProgress, tone: 'text-amber-600 dark:text-amber-400' },
              { label: 'Concluídos', value: totals.completed, tone: 'text-emerald-600 dark:text-emerald-400' },
              { label: 'Certificados', value: totals.certificates, tone: 'text-red-600 dark:text-red-400' }
            ].map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
              >
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  {item.label}
                </p>
                <p className={`mt-1 text-2xl font-bold ${item.tone}`}>{item.value}</p>
              </div>
            ))}
          </div>

          <Card className={cadastroListClasses.card}>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <div className={cadastroListClasses.cardHeaderRow}>
                <div className={cadastroListClasses.cardHeaderIconRow}>
                  <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                    <GraduationCap className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Meus cursos
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {rows.length} curso(s)
                    </p>
                  </div>
                </div>
                <div className={cadastroListClasses.cardToolbar}>
                  <div className={cadastroListClasses.searchField}>
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      placeholder="Buscar curso..."
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                    {search ? (
                      <button
                        type="button"
                        onClick={() => setSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                        aria-label="Limpar busca"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
              {categories.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setCategoryFilter('')}
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${
                      categoryFilter === ''
                        ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300'
                        : 'border-gray-300 bg-white text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300'
                    }`}
                  >
                    Todas
                  </button>
                  {categories.map((category) => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => setCategoryFilter(category)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${
                        categoryFilter === category
                          ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300'
                          : 'border-gray-300 bg-white text-gray-600 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-300'
                      }`}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              ) : null}
            </CardHeader>
            <CardContent className={cadastroListClasses.cardContent}>
              {isLoading ? (
                <CadastroListLoading message="Carregando cursos..." />
              ) : rows.length === 0 ? (
                <CadastroListEmpty
                  icon={GraduationCap}
                  title="Nenhum curso disponível"
                  hint={
                    search.trim() || categoryFilter
                      ? 'Tente ajustar a busca ou a categoria'
                      : 'Quando um curso for publicado ele aparece aqui'
                  }
                />
              ) : (
                <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2 xl:grid-cols-3">
                  {rows.map((course) => {
                    const status = course.enrollment?.status;
                    const workload = formatWorkload(course.workloadHours);
                    return (
                      <div
                        key={course.id}
                        className="flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800"
                      >
                        {course.coverImageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={course.coverImageUrl}
                            alt={course.title}
                            className="h-32 w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-32 w-full items-center justify-center bg-gradient-to-br from-red-500/10 to-red-700/20">
                            <GraduationCap className="h-10 w-10 text-red-500/70" />
                          </div>
                        )}
                        <div className="flex flex-1 flex-col gap-3 p-4">
                          <div className="flex items-start justify-between gap-2">
                            <h4 className="min-w-0 text-base font-semibold text-gray-900 dark:text-gray-100">
                              {course.title}
                            </h4>
                            {status ? (
                              <span
                                className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(status)}`}
                              >
                                {ENROLLMENT_STATUS_LABELS[status]}
                              </span>
                            ) : null}
                          </div>
                          {course.description ? (
                            <p className="line-clamp-3 text-sm text-gray-600 dark:text-gray-400">
                              {course.description}
                            </p>
                          ) : null}
                          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400">
                            {course.category ? <span>{course.category}</span> : null}
                            <span className="inline-flex items-center gap-1">
                              <PlayCircle className="h-3.5 w-3.5" />
                              {course._count.lessons} aula(s)
                            </span>
                            {course._count.questions > 0 ? (
                              <span className="inline-flex items-center gap-1">
                                <ListChecks className="h-3.5 w-3.5" />
                                {course._count.questions} questão(ões)
                              </span>
                            ) : null}
                            {workload ? (
                              <span className="inline-flex items-center gap-1">
                                <Clock3 className="h-3.5 w-3.5" />
                                {workload}
                              </span>
                            ) : null}
                          </div>

                          <div>
                            <div className="mb-1 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
                              <span>Progresso</span>
                              <span className="tabular-nums">{course.progressPercent}%</span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-700">
                              <div
                                className="h-full rounded-full bg-red-500"
                                style={{ width: `${course.progressPercent}%` }}
                              />
                            </div>
                          </div>

                          <div className="mt-auto flex flex-wrap gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => openCourse(course.id)}
                              className="flex-1 rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
                            >
                              {course.enrollment ? 'Continuar' : 'Acessar curso'}
                            </button>
                            {!course.enrollment ? (
                              <button
                                type="button"
                                disabled={enrollMutation.isPending}
                                onClick={() => enrollMutation.mutate(course.id)}
                                className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                              >
                                Matricular
                              </button>
                            ) : null}
                            {course.enrollment?.certificate ? (
                              <button
                                type="button"
                                onClick={() =>
                                  void downloadCertificate(course.enrollment!.certificate!.code)
                                }
                                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-300"
                              >
                                <Award className="h-4 w-4" />
                                Certificado
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {openCourseId ? (
          <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={closeCourse} />
            <div className="relative max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-800">
              <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold text-gray-900 dark:text-gray-100">
                    {courseDetail?.title || 'Curso'}
                  </h2>
                  {courseDetail ? (
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {courseDetail.completedLessons} de {courseDetail.totalLessons} aula(s)
                      concluída(s) · nota mínima {courseDetail.passingScore}%
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={closeCourse}
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {loadingDetail || !courseDetail ? (
                <div className="p-6">
                  <CadastroListLoading message="Carregando conteúdo..." />
                </div>
              ) : quizOpen ? (
                <div className="space-y-5 p-6">
                  {quizResult ? (
                    <div
                      className={`rounded-lg border p-4 ${
                        quizResult.passed
                          ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800/60 dark:bg-emerald-950/30'
                          : 'border-rose-300 bg-rose-50 dark:border-rose-800/60 dark:bg-rose-950/30'
                      }`}
                    >
                      <p className="text-base font-semibold text-gray-900 dark:text-gray-100">
                        {quizResult.passed ? 'Aprovado!' : 'Não atingiu a nota mínima'}
                      </p>
                      <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                        Você acertou {quizResult.correctCount} de {quizResult.questionCount} —
                        aproveitamento de {quizResult.score}% (mínimo {quizResult.passingScore}%).
                      </p>
                      {quizResult.certificate ? (
                        <button
                          type="button"
                          onClick={() =>
                            void downloadCertificate(quizResult.certificate!.code)
                          }
                          className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                        >
                          <Download className="h-4 w-4" />
                          Baixar certificado
                        </button>
                      ) : null}
                    </div>
                  ) : null}

                  <ol className="space-y-4">
                    {courseDetail.questions.map((question, index) => {
                      const review = quizResult?.review.find((r) => r.questionId === question.id);
                      return (
                        <li
                          key={question.id}
                          className="rounded-lg border border-gray-200 p-4 dark:border-gray-700"
                        >
                          <p className="mb-3 text-sm font-medium text-gray-900 dark:text-gray-100">
                            {index + 1}. {question.statement}
                          </p>
                          <div className="space-y-2">
                            {question.options.map((option) => {
                              const selected = quizAnswers[question.id] === option.id;
                              const isCorrect = review?.correctOptionId === option.id;
                              const isWrongChoice =
                                !!review && review.chosenOptionId === option.id && !review.correct;
                              return (
                                <label
                                  key={option.id}
                                  className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                                    isCorrect
                                      ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-800/60 dark:bg-emerald-950/30'
                                      : isWrongChoice
                                        ? 'border-rose-300 bg-rose-50 dark:border-rose-800/60 dark:bg-rose-950/30'
                                        : selected
                                          ? 'border-red-300 bg-red-50 dark:border-red-800/60 dark:bg-red-950/30'
                                          : 'border-gray-200 dark:border-gray-700'
                                  }`}
                                >
                                  <input
                                    type="radio"
                                    name={`q-${question.id}`}
                                    checked={selected}
                                    disabled={!!quizResult}
                                    onChange={() =>
                                      setQuizAnswers((prev) => ({
                                        ...prev,
                                        [question.id]: option.id
                                      }))
                                    }
                                    className="h-4 w-4 border-gray-300 text-red-600 focus:ring-red-500"
                                  />
                                  <span className="text-gray-900 dark:text-gray-100">
                                    {option.label}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </li>
                      );
                    })}
                  </ol>

                  <div className="flex flex-wrap gap-3">
                    {quizResult ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setQuizResult(null);
                            setQuizAnswers({});
                          }}
                          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
                        >
                          Refazer avaliação
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setQuizOpen(false);
                            setQuizResult(null);
                            setQuizAnswers({});
                          }}
                          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                        >
                          Voltar às aulas
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          disabled={
                            submitQuizMutation.isPending ||
                            Object.keys(quizAnswers).length < courseDetail.questions.length
                          }
                          onClick={() => submitQuizMutation.mutate(courseDetail.id)}
                          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          {submitQuizMutation.isPending ? 'Enviando...' : 'Enviar respostas'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setQuizOpen(false)}
                          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                        >
                          Cancelar
                        </button>
                        {Object.keys(quizAnswers).length < courseDetail.questions.length ? (
                          <p className="w-full text-xs text-gray-500 dark:text-gray-400">
                            Responda todas as questões para enviar.
                          </p>
                        ) : null}
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid gap-5 p-6 lg:grid-cols-[1fr_18rem]">
                  <div className="space-y-4">
                    {activeLesson ? (
                      <>
                        {embedUrl ? (
                          <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
                            <iframe
                              src={embedUrl}
                              title={activeLesson.title}
                              className="h-full w-full"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                              allowFullScreen
                            />
                          </div>
                        ) : (
                          <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-dashed border-gray-300 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
                            Esta aula não possui vídeo cadastrado.
                          </div>
                        )}

                        <div>
                          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                            {activeLesson.title}
                          </h3>
                          {activeLesson.description ? (
                            <p className="mt-1 whitespace-pre-line text-sm text-gray-600 dark:text-gray-400">
                              {activeLesson.description}
                            </p>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={activeLesson.completed || completeLessonMutation.isPending}
                            onClick={() =>
                              completeLessonMutation.mutate({
                                courseId: courseDetail.id,
                                lessonId: activeLesson.id
                              })
                            }
                            className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            {activeLesson.completed ? 'Aula concluída' : 'Marcar como concluída'}
                          </button>
                          {activeLesson.attachmentUrl ? (
                            <a
                              href={activeLesson.attachmentUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                            >
                              <FileText className="h-4 w-4" />
                              {activeLesson.attachmentName || 'Material de apoio'}
                            </a>
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <CadastroListEmpty
                        icon={PlayCircle}
                        title="Curso sem aulas publicadas"
                        hint="Assim que houver conteúdo, ele aparece aqui."
                      />
                    )}
                  </div>

                  <div className="space-y-4">
                    <div>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                        Aulas
                      </p>
                      <ul className="space-y-1">
                        {courseDetail.lessons.map((lesson, index) => (
                          <li key={lesson.id}>
                            <button
                              type="button"
                              onClick={() => setActiveLessonId(lesson.id)}
                              className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm ${
                                lesson.id === activeLessonId
                                  ? 'bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300'
                                  : 'text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-gray-700/50'
                              }`}
                            >
                              {lesson.completed ? (
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                              ) : (
                                <PlayCircle className="h-4 w-4 shrink-0 text-gray-400" />
                              )}
                              <span className="min-w-0 truncate">
                                {index + 1}. {lesson.title}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {courseDetail.questions.length > 0 ? (
                      <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                          Avaliação final
                        </p>
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          {courseDetail.questions.length} questão(ões) · mínimo{' '}
                          {courseDetail.passingScore}% de acerto
                        </p>
                        {courseDetail.enrollment?.bestScore != null ? (
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            Melhor nota: {courseDetail.enrollment.bestScore}%
                          </p>
                        ) : null}
                        <button
                          type="button"
                          disabled={!allLessonsDone}
                          onClick={() => {
                            setQuizAnswers({});
                            setQuizResult(null);
                            setQuizOpen(true);
                          }}
                          className="mt-3 w-full rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          Fazer avaliação
                        </button>
                        {!allLessonsDone ? (
                          <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                            Conclua todas as aulas para liberar a avaliação.
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    {courseDetail.enrollment?.certificate ? (
                      <button
                        type="button"
                        onClick={() =>
                          void downloadCertificate(courseDetail.enrollment!.certificate!.code)
                        }
                        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 dark:border-emerald-800/60 dark:bg-emerald-950/30 dark:text-emerald-300"
                      >
                        <Award className="h-4 w-4" />
                        Baixar certificado
                      </button>
                    ) : null}
                  </div>
                </div>
              )}
            </div>
          </AppModalOverlay>
        ) : null}
      </MainLayout>
    </ProtectedRoute>
  );
}
