'use client';

import React, { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  GraduationCap,
  ListChecks,
  PlayCircle,
  Plus,
  Power,
  Search,
  Trash2,
  Users,
  X
} from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary,
  formatCadastroListId
} from '@/components/ui/CadastroListSummary';
import {
  RowActionMenuCell,
  RowActionMenuPortal,
  cadastroListClasses
} from '@/components/ui/RowActionMenu';
import { ListRowNavigableLabel, listTableRowClasses } from '@/components/ui/listTableUi';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import { useCadastroCrudPermissions } from '@/hooks/useCadastroCrudPermissions';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';
import { Checkbox, CheckboxIndicator } from '@/components/ui/Checkbox';
import { useModalCloseConfirm } from '@/hooks/useModalCloseConfirm';
import { FORM_FIELD_INPUT_CLS, FORM_FIELD_TEXTAREA_CLS } from '@/lib/formFieldUi';
import { formatCpfInput } from '@/lib/cpf';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import {
  ENROLLMENT_STATUS_LABELS,
  type TrainingCourseAdminDetail,
  type TrainingCourseAdminRow,
  type TrainingEnrollmentAdminRow,
  type TrainingQuestionOption
} from '../trainingTypes';

const VIDEO_PROVIDER_OPTIONS = labeledToSelectOptions([
  { value: 'YOUTUBE', label: 'YouTube' },
  { value: 'VIMEO', label: 'Vimeo' },
  { value: 'URL', label: 'Link direto' }
]);

function sanitizeDecimalInput(value: string): string {
  const cleaned = value.replace(/[^\d.,]/g, '').replace(',', '.');
  const parts = cleaned.split('.');
  if (parts.length <= 1) return cleaned;
  return `${parts[0]}.${parts.slice(1).join('')}`;
}

function sanitizeIntegerInput(value: string, max?: number): string {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  if (max == null) return digits;
  const n = Number(digits);
  if (!Number.isFinite(n)) return '';
  return String(Math.min(n, max));
}

function formatPersonCpf(cpf?: string | null) {
  const digits = (cpf || '').replace(/\D/g, '');
  if (digits.length === 11) return formatCpfInput(digits);
  return cpf?.trim() || '—';
}

function personInitials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?'
  );
}

function PersonIdentity({
  name,
  cpf,
  profilePhotoUrl
}: {
  name: string;
  cpf?: string | null;
  profilePhotoUrl?: string | null;
}) {
  const photoHref = resolveApiMediaUrl(profilePhotoUrl ?? null);
  const initials = personInitials(name);
  return (
    <span className="flex min-w-0 flex-1 items-center gap-3 text-left">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-semibold ${
          photoHref ? 'bg-gray-200 dark:bg-gray-700' : 'bg-red-600 text-white'
        }`}
      >
        {photoHref ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoHref}
            alt=""
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          initials
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-sm font-medium tracking-tight text-gray-900 dark:text-gray-100">
          {name}
        </span>
        <span className="truncate text-[11px] font-normal leading-tight text-gray-500 dark:text-gray-400">
          {formatPersonCpf(cpf)}
        </span>
      </span>
    </span>
  );
}

const COURSES_QUERY_KEY = ['training-admin-courses'] as const;

type CourseFormState = {
  title: string;
  description: string;
  category: string;
  coverImageUrl: string;
  workloadHours: string;
  passingScore: string;
  certificateEnabled: boolean;
  isPublished: boolean;
};

function emptyCourseForm(): CourseFormState {
  return {
    title: '',
    description: '',
    category: '',
    coverImageUrl: '',
    workloadHours: '',
    passingScore: '70',
    certificateEnabled: true,
    isPublished: false
  };
}

type LessonFormState = {
  id: string | null;
  title: string;
  description: string;
  videoUrl: string;
  videoProvider: 'YOUTUBE' | 'VIMEO' | 'URL';
  attachmentUrl: string;
  attachmentName: string;
  durationMinutes: string;
};

function emptyLessonForm(): LessonFormState {
  return {
    id: null,
    title: '',
    description: '',
    videoUrl: '',
    videoProvider: 'YOUTUBE',
    attachmentUrl: '',
    attachmentName: '',
    durationMinutes: ''
  };
}

type QuestionFormState = {
  id: string | null;
  statement: string;
  options: TrainingQuestionOption[];
};

function emptyQuestionForm(): QuestionFormState {
  return {
    id: null,
    statement: '',
    options: [
      { id: 'opt-1', label: '', correct: true },
      { id: 'opt-2', label: '', correct: false }
    ]
  };
}

type Technician = {
  id: string;
  name: string;
  email?: string | null;
  cpf?: string | null;
  profilePhotoUrl?: string | null;
};

export default function TreinamentosAdminPageClient() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { canCreate, canEdit, canDelete } = useCadastroCrudPermissions(
    '/ponto/treinamentos/administracao'
  );
  const showActions = canEdit || canDelete;

  const [searchTerm, setSearchTerm] = useState('');
  const [showCourseForm, setShowCourseForm] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [courseForm, setCourseForm] = useState<CourseFormState>(() => emptyCourseForm());
  const [detailCourseId, setDetailCourseId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'lessons' | 'quiz' | 'students'>('lessons');
  const [deleteTarget, setDeleteTarget] = useState<TrainingCourseAdminRow | null>(null);
  const [lessonForm, setLessonForm] = useState<LessonFormState | null>(null);
  const [questionForm, setQuestionForm] = useState<QuestionFormState | null>(null);
  const [enrollPickerOpen, setEnrollPickerOpen] = useState(false);
  const [enrollSearch, setEnrollSearch] = useState('');
  const [enrollSelection, setEnrollSelection] = useState<string[]>([]);

  const closeCourseForm = useCallback(() => {
    setShowCourseForm(false);
    setEditingCourseId(null);
  }, []);

  const { requestClose: requestCloseCourseForm, confirmUi: courseFormConfirmUi } =
    useModalCloseConfirm(closeCourseForm, { isParentOpen: showCourseForm });

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

  const {
    data: courses = [],
    isLoading,
    isError,
    error
  } = useQuery({
    queryKey: COURSES_QUERY_KEY,
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: TrainingCourseAdminRow[] }>(
        '/training/admin/courses'
      );
      return res.data?.data ?? [];
    }
  });

  const { data: courseDetail } = useQuery({
    queryKey: ['training-admin-course', detailCourseId],
    enabled: !!detailCourseId,
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: TrainingCourseAdminDetail }>(
        `/training/admin/courses/${detailCourseId}`
      );
      return res.data?.data;
    }
  });

  const { data: enrollments = [] } = useQuery({
    queryKey: ['training-admin-enrollments', detailCourseId],
    enabled: !!detailCourseId && detailTab === 'students',
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: TrainingEnrollmentAdminRow[] }>(
        `/training/admin/courses/${detailCourseId}/enrollments`
      );
      return res.data?.data ?? [];
    }
  });

  const { data: technicians = [] } = useQuery({
    queryKey: ['gestao-os-technicians'],
    enabled: enrollPickerOpen,
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: Technician[] }>('/gestao-os/technicians');
      return res.data?.data ?? [];
    }
  });

  const rows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter((course) =>
      [course.title, course.category, course.description]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [courses, searchTerm]);

  const {
    rowActionMenu,
    rowForActionMenu,
    toggleRowActionMenu,
    closeRowActionMenu,
    isRowMenuOpen
  } = useRowActionMenu(rows);

  const invalidateCourses = () => {
    void queryClient.invalidateQueries({ queryKey: COURSES_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: ['training-my-courses'] });
  };
  const invalidateDetail = () => {
    void queryClient.invalidateQueries({ queryKey: ['training-admin-course', detailCourseId] });
    invalidateCourses();
  };

  const coursePayload = () => ({
    title: courseForm.title.trim(),
    description: courseForm.description.trim() || null,
    category: courseForm.category.trim() || null,
    coverImageUrl: courseForm.coverImageUrl.trim() || null,
    workloadHours: courseForm.workloadHours.trim()
      ? Number(courseForm.workloadHours.replace(',', '.'))
      : null,
    passingScore: Number(courseForm.passingScore) || 70,
    certificateEnabled: courseForm.certificateEnabled,
    isPublished: courseForm.isPublished
  });

  const createCourseMutation = useMutation({
    mutationFn: async () => {
      await api.post('/training/admin/courses', coursePayload());
    },
    onSuccess: () => {
      toast.success('Curso criado.');
      setCourseForm(emptyCourseForm());
      closeCourseForm();
      invalidateCourses();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao criar curso.');
    }
  });

  const updateCourseMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/training/admin/courses/${id}`, coursePayload());
    },
    onSuccess: () => {
      toast.success('Curso atualizado.');
      setCourseForm(emptyCourseForm());
      closeCourseForm();
      invalidateDetail();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao atualizar curso.');
    }
  });

  const togglePublishMutation = useMutation({
    mutationFn: async ({ id, isPublished }: { id: string; isPublished: boolean }) => {
      await api.patch(`/training/admin/courses/${id}`, { isPublished });
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.isPublished ? 'Curso publicado.' : 'Curso despublicado.');
      invalidateCourses();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao alterar publicação.');
    }
  });

  const deleteCourseMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete<{ success: boolean; data?: { archived?: boolean } }>(
        `/training/admin/courses/${id}`
      );
      return res.data?.data;
    },
    onSuccess: (data) => {
      toast.success(
        data?.archived
          ? 'Curso possui matrículas e foi arquivado.'
          : 'Curso excluído.'
      );
      setDeleteTarget(null);
      setDetailCourseId(null);
      invalidateCourses();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao excluir curso.');
    }
  });

  const saveLessonMutation = useMutation({
    mutationFn: async (form: LessonFormState) => {
      const body = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        videoUrl: form.videoUrl.trim() || null,
        videoProvider: form.videoProvider,
        attachmentUrl: form.attachmentUrl.trim() || null,
        attachmentName: form.attachmentName.trim() || null,
        durationMinutes: form.durationMinutes.trim() ? Number(form.durationMinutes) : null
      };
      if (form.id) await api.patch(`/training/admin/lessons/${form.id}`, body);
      else await api.post(`/training/admin/courses/${detailCourseId}/lessons`, body);
    },
    onSuccess: () => {
      toast.success('Aula salva.');
      setLessonForm(null);
      invalidateDetail();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao salvar aula.');
    }
  });

  const deleteLessonMutation = useMutation({
    mutationFn: async (lessonId: string) => {
      await api.delete(`/training/admin/lessons/${lessonId}`);
    },
    onSuccess: () => {
      toast.success('Aula removida.');
      invalidateDetail();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao remover aula.');
    }
  });

  const saveQuestionMutation = useMutation({
    mutationFn: async (form: QuestionFormState) => {
      const body = {
        statement: form.statement.trim(),
        options: form.options.map((option, index) => ({
          id: option.id || `opt-${index + 1}`,
          label: option.label.trim(),
          correct: !!option.correct
        }))
      };
      if (form.id) await api.patch(`/training/admin/questions/${form.id}`, body);
      else await api.post(`/training/admin/courses/${detailCourseId}/questions`, body);
    },
    onSuccess: () => {
      toast.success('Pergunta salva.');
      setQuestionForm(null);
      invalidateDetail();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao salvar pergunta.');
    }
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: async (questionId: string) => {
      await api.delete(`/training/admin/questions/${questionId}`);
    },
    onSuccess: () => {
      toast.success('Pergunta removida.');
      invalidateDetail();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao remover pergunta.');
    }
  });

  const enrollMutation = useMutation({
    mutationFn: async (userIds: string[]) => {
      await api.post(`/training/admin/courses/${detailCourseId}/enrollments`, { userIds });
    },
    onSuccess: () => {
      toast.success('Funcionários matriculados.');
      setEnrollPickerOpen(false);
      setEnrollSearch('');
      setEnrollSelection([]);
      void queryClient.invalidateQueries({
        queryKey: ['training-admin-enrollments', detailCourseId]
      });
      invalidateCourses();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao matricular.');
    }
  });

  const removeEnrollmentMutation = useMutation({
    mutationFn: async (enrollmentId: string) => {
      await api.delete(`/training/admin/enrollments/${enrollmentId}`);
    },
    onSuccess: () => {
      toast.success('Matrícula removida.');
      void queryClient.invalidateQueries({
        queryKey: ['training-admin-enrollments', detailCourseId]
      });
      invalidateCourses();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => {
      toast.error(e.response?.data?.message || 'Erro ao remover matrícula.');
    }
  });

  const openCreateCourse = () => {
    setEditingCourseId(null);
    setCourseForm(emptyCourseForm());
    setShowCourseForm(true);
  };

  const openEditCourse = (course: TrainingCourseAdminRow) => {
    setEditingCourseId(course.id);
    setCourseForm({
      title: course.title ?? '',
      description: course.description ?? '',
      category: course.category ?? '',
      coverImageUrl: course.coverImageUrl ?? '',
      workloadHours: course.workloadHours != null ? String(course.workloadHours) : '',
      passingScore: String(course.passingScore ?? 70),
      certificateEnabled: course.certificateEnabled,
      isPublished: course.isPublished
    });
    setShowCourseForm(true);
  };

  const handleCourseSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseForm.title.trim()) {
      toast.error('Informe o título do curso.');
      return;
    }
    if (editingCourseId) {
      if (!canEdit) {
        toast.error('Você não tem permissão para editar.');
        return;
      }
      updateCourseMutation.mutate(editingCourseId);
    } else {
      if (!canCreate) {
        toast.error('Você não tem permissão para criar.');
        return;
      }
      createCourseMutation.mutate();
    }
  };

  const handleQuestionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!questionForm) return;
    if (!questionForm.statement.trim()) {
      toast.error('Informe o enunciado.');
      return;
    }
    const filled = questionForm.options.filter((o) => o.label.trim());
    if (filled.length < 2) {
      toast.error('Informe ao menos duas alternativas.');
      return;
    }
    if (filled.filter((o) => o.correct).length !== 1) {
      toast.error('Marque exatamente uma alternativa correta.');
      return;
    }
    saveQuestionMutation.mutate({ ...questionForm, options: filled });
  };

  const enrollmentByUserId = useMemo(() => {
    const map = new Map(enrollments.map((e) => [e.userId, e]));
    return map;
  }, [enrollments]);

  const filteredTechnicians = useMemo(() => {
    const q = enrollSearch.trim().toLowerCase();
    if (!q) return technicians;
    return technicians.filter((t) =>
      [t.name, t.email, t.cpf].filter(Boolean).join(' ').toLowerCase().includes(q)
    );
  }, [technicians, enrollSearch]);

  const toggleEnrollSelection = (userId: string, checked: boolean) => {
    const existing = enrollmentByUserId.get(userId);
    if (existing) {
      if (!checked && canDelete) {
        removeEnrollmentMutation.mutate(existing.id);
      }
      return;
    }
    setEnrollSelection((prev) =>
      checked
        ? prev.includes(userId)
          ? prev
          : [...prev, userId]
        : prev.filter((id) => id !== userId)
    );
  };

  const closeEnrollPicker = () => {
    setEnrollPickerOpen(false);
    setEnrollSearch('');
    setEnrollSelection([]);
  };

  const loadError =
    isError &&
    ((error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
      (error as Error)?.message ||
      'Não foi possível carregar os cursos.');

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/treinamentos/administracao">
      <MainLayout userRole={user.role || 'EMPLOYEE'} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Treinamentos
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Crie múltiplos cursos com videoaulas, questionário de avaliação e certificado.
            </p>
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
                      Cursos
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {isError ? 'Erro ao carregar.' : `${rows.length} curso(s)`}
                    </p>
                  </div>
                </div>
                <div className={cadastroListClasses.cardToolbar}>
                  <div className={cadastroListClasses.searchField}>
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      placeholder="Pesquisar por título ou categoria..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                    {searchTerm ? (
                      <button
                        type="button"
                        onClick={() => setSearchTerm('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                        aria-label="Limpar busca"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  {canCreate && (
                    <button
                      type="button"
                      onClick={openCreateCourse}
                      className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                    >
                      <Plus className="h-4 w-4 shrink-0" />
                      Novo Curso
                    </button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className={cadastroListClasses.cardContent}>
              {isError ? (
                <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
                  <AlertCircle className="h-10 w-10 text-red-500" />
                  <p className="max-w-md text-sm text-gray-700 dark:text-gray-300">{loadError}</p>
                </div>
              ) : isLoading ? (
                <CadastroListLoading message="Carregando cursos..." />
              ) : rows.length === 0 ? (
                <CadastroListEmpty
                  icon={GraduationCap}
                  title="Nenhum curso cadastrado"
                  hint={
                    searchTerm.trim()
                      ? 'Tente ajustar a busca'
                      : 'Crie o primeiro curso para começar'
                  }
                />
              ) : (
                <>
                  <CadastroListSummary
                    startItem={1}
                    endItem={rows.length}
                    total={rows.length}
                    itemLabel="curso"
                    itemLabelPlural="cursos"
                  />
                  <div className={cadastroListClasses.tableScroll}>
                    <table className={cadastroListClasses.table}>
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className={`${cadastroListClasses.th} w-14 whitespace-nowrap !px-2 sm:!px-3`}>
                            ID
                          </th>
                          <th className={`${cadastroListClasses.th} !pl-2 sm:!pl-3`}>Curso</th>
                          <th className={cadastroListClasses.th}>Categoria</th>
                          <th className={`${cadastroListClasses.thCenter} w-24`}>Aulas</th>
                          <th className={`${cadastroListClasses.thCenter} w-24`}>Questões</th>
                          <th className={`${cadastroListClasses.thCenter} w-32`}>Matrículas</th>
                          <th className={`${cadastroListClasses.thCenter} w-32`}>Publicação</th>
                          {showActions ? (
                            <th className={cadastroListClasses.thRight}>Ação</th>
                          ) : null}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {rows.map((course, index) => (
                          <tr
                            key={course.id}
                            role="button"
                            tabIndex={0}
                            className={listTableRowClasses.trNavigable}
                            onClick={() => {
                              setDetailCourseId(course.id);
                              setDetailTab('lessons');
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setDetailCourseId(course.id);
                                setDetailTab('lessons');
                              }
                            }}
                          >
                            <td className={`${cadastroListClasses.tdMono} w-14 !px-2 sm:!px-3`}>
                              {formatCadastroListId(null, index + 1)}
                            </td>
                            <td className={`${cadastroListClasses.tdTruncate} !pl-2 sm:!pl-3`}>
                              <ListRowNavigableLabel className="block truncate">
                                {course.title}
                              </ListRowNavigableLabel>
                              {!course.isActive ? (
                                <span className="block text-xs text-gray-500 dark:text-gray-400">
                                  Arquivado
                                </span>
                              ) : null}
                            </td>
                            <td className={cadastroListClasses.tdMuted}>
                              {course.category || '—'}
                            </td>
                            <td className={cadastroListClasses.tdCenter}>
                              {course._count.lessons}
                            </td>
                            <td className={cadastroListClasses.tdCenter}>
                              {course._count.questions}
                            </td>
                            <td className={cadastroListClasses.tdCenter}>
                              <span className="font-semibold">{course._count.enrollments}</span>
                              {course.completedCount > 0 ? (
                                <span className="ml-1 text-xs text-emerald-600 dark:text-emerald-400">
                                  ({course.completedCount} concluíram)
                                </span>
                              ) : null}
                            </td>
                            <td className={cadastroListClasses.tdCenter}>
                              <span
                                className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                                  course.isPublished
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                                }`}
                              >
                                {course.isPublished ? 'Publicado' : 'Rascunho'}
                              </span>
                            </td>
                            {showActions ? (
                              <RowActionMenuCell
                                isOpen={isRowMenuOpen(course.id)}
                                onToggle={(e) =>
                                  toggleRowActionMenu(
                                    course.id,
                                    e.currentTarget as HTMLButtonElement
                                  )
                                }
                              />
                            ) : null}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {rowActionMenu && rowForActionMenu ? (
                <RowActionMenuPortal
                  menu={rowActionMenu}
                  onClose={closeRowActionMenu}
                  onEdit={canEdit ? () => openEditCourse(rowForActionMenu) : undefined}
                  onDelete={canDelete ? () => setDeleteTarget(rowForActionMenu) : undefined}
                  extraItems={
                    canEdit
                      ? [
                          {
                            label: rowForActionMenu.isPublished ? 'Despublicar' : 'Publicar',
                            icon: <Power className="h-4 w-4 shrink-0" />,
                            tone: rowForActionMenu.isPublished ? 'danger' : 'success',
                            onClick: () =>
                              togglePublishMutation.mutate({
                                id: rowForActionMenu.id,
                                isPublished: !rowForActionMenu.isPublished
                              })
                          }
                        ]
                      : []
                  }
                />
              ) : null}
            </CardContent>
          </Card>
        </div>

        {showCourseForm ? (
          <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={requestCloseCourseForm} />
            <div className="relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-800">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {editingCourseId ? 'Editar Curso' : 'Novo Curso'}
                </h2>
                <button
                  type="button"
                  onClick={requestCloseCourseForm}
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleCourseSubmit} className="grid gap-4 p-6 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Título *
                  </label>
                  <input
                    value={courseForm.title}
                    onChange={(e) => setCourseForm({ ...courseForm, title: e.target.value })}
                    placeholder="Ex.: Boas práticas de limpeza hospitalar"
                    className={FORM_FIELD_INPUT_CLS}
                    required
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Descrição
                  </label>
                  <textarea
                    value={courseForm.description}
                    onChange={(e) => setCourseForm({ ...courseForm, description: e.target.value })}
                    placeholder="Objetivo do curso, público-alvo, pré-requisitos..."
                    className={FORM_FIELD_TEXTAREA_CLS}
                    rows={3}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Categoria
                  </label>
                  <input
                    value={courseForm.category}
                    onChange={(e) => setCourseForm({ ...courseForm, category: e.target.value })}
                    placeholder="Ex.: Limpeza"
                    className={FORM_FIELD_INPUT_CLS}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Carga horária (horas)
                  </label>
                  <input
                    value={courseForm.workloadHours}
                    onChange={(e) =>
                      setCourseForm({
                        ...courseForm,
                        workloadHours: sanitizeDecimalInput(e.target.value)
                      })
                    }
                    placeholder="Ex.: 8"
                    inputMode="decimal"
                    className={FORM_FIELD_INPUT_CLS}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Nota mínima de aprovação (%)
                  </label>
                  <input
                    value={courseForm.passingScore}
                    onChange={(e) =>
                      setCourseForm({
                        ...courseForm,
                        passingScore: sanitizeIntegerInput(e.target.value, 100)
                      })
                    }
                    inputMode="numeric"
                    className={FORM_FIELD_INPUT_CLS}
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Imagem de capa (URL)
                  </label>
                  <input
                    value={courseForm.coverImageUrl}
                    onChange={(e) =>
                      setCourseForm({ ...courseForm, coverImageUrl: e.target.value })
                    }
                    placeholder="https://..."
                    className={FORM_FIELD_INPUT_CLS}
                  />
                </div>
                <div className="sm:col-span-2 space-y-3">
                  <Checkbox
                    checked={courseForm.certificateEnabled}
                    onChange={(checked) =>
                      setCourseForm({ ...courseForm, certificateEnabled: checked })
                    }
                    label="Emitir certificado de conclusão"
                  />
                  <Checkbox
                    checked={courseForm.isPublished}
                    onChange={(checked) =>
                      setCourseForm({ ...courseForm, isPublished: checked })
                    }
                    label="Publicar para os funcionários"
                  />
                </div>
                <div className="sm:col-span-2 flex gap-3 pt-2">
                  <button
                    type="submit"
                    disabled={createCourseMutation.isPending || updateCourseMutation.isPending}
                    className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {createCourseMutation.isPending || updateCourseMutation.isPending
                      ? 'Salvando...'
                      : 'Salvar'}
                  </button>
                  <button
                    type="button"
                    onClick={requestCloseCourseForm}
                    className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </AppModalOverlay>
        ) : null}

        {detailCourseId ? (
          <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setDetailCourseId(null)} />
            <div className="relative max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-800">
              <div className="sticky top-0 z-10 border-b border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {courseDetail?.title || 'Curso'}
                    </h2>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Conteúdo, avaliação e alunos matriculados
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDetailCourseId(null)}
                    className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="mt-4 flex gap-2">
                  {(
                    [
                      { id: 'lessons' as const, label: 'Aulas', icon: PlayCircle },
                      { id: 'quiz' as const, label: 'Avaliação', icon: ListChecks },
                      { id: 'students' as const, label: 'Alunos', icon: Users }
                    ]
                  ).map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setDetailTab(tab.id)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium ${
                        detailTab === tab.id
                          ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300'
                          : 'border-gray-300 bg-white text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200'
                      }`}
                    >
                      <tab.icon className="h-4 w-4" />
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-4 p-6">
                {detailTab === 'lessons' ? (
                  <>
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => setLessonForm(emptyLessonForm())}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300"
                      >
                        <Plus className="h-4 w-4" />
                        Nova aula
                      </button>
                    ) : null}

                    {lessonForm ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          if (!lessonForm.title.trim()) {
                            toast.error('Informe o título da aula.');
                            return;
                          }
                          saveLessonMutation.mutate(lessonForm);
                        }}
                        className="grid gap-3 rounded-lg border border-gray-200 p-4 dark:border-gray-700 sm:grid-cols-2"
                      >
                        <div className="sm:col-span-2">
                          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Título da aula *
                          </label>
                          <input
                            value={lessonForm.title}
                            onChange={(e) =>
                              setLessonForm({ ...lessonForm, title: e.target.value })
                            }
                            className={FORM_FIELD_INPUT_CLS}
                            required
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Plataforma do vídeo
                          </label>
                          <StringSingleSelectDropdown
                            value={lessonForm.videoProvider}
                            onChange={(v) =>
                              setLessonForm({
                                ...lessonForm,
                                videoProvider: v as LessonFormState['videoProvider']
                              })
                            }
                            options={VIDEO_PROVIDER_OPTIONS}
                            allowEmpty={false}
                            disableSearch
                            placeholder="Plataforma do vídeo"
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Duração (minutos)
                          </label>
                          <input
                            value={lessonForm.durationMinutes}
                            onChange={(e) =>
                              setLessonForm({
                                ...lessonForm,
                                durationMinutes: sanitizeIntegerInput(e.target.value)
                              })
                            }
                            inputMode="numeric"
                            className={FORM_FIELD_INPUT_CLS}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            URL do vídeo
                          </label>
                          <input
                            value={lessonForm.videoUrl}
                            onChange={(e) =>
                              setLessonForm({ ...lessonForm, videoUrl: e.target.value })
                            }
                            placeholder="https://www.youtube.com/watch?v=..."
                            className={FORM_FIELD_INPUT_CLS}
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Descrição
                          </label>
                          <textarea
                            value={lessonForm.description}
                            onChange={(e) =>
                              setLessonForm({ ...lessonForm, description: e.target.value })
                            }
                            className={FORM_FIELD_TEXTAREA_CLS}
                            rows={2}
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Material de apoio (URL)
                          </label>
                          <input
                            value={lessonForm.attachmentUrl}
                            onChange={(e) =>
                              setLessonForm({ ...lessonForm, attachmentUrl: e.target.value })
                            }
                            className={FORM_FIELD_INPUT_CLS}
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Nome do material
                          </label>
                          <input
                            value={lessonForm.attachmentName}
                            onChange={(e) =>
                              setLessonForm({ ...lessonForm, attachmentName: e.target.value })
                            }
                            className={FORM_FIELD_INPUT_CLS}
                          />
                        </div>
                        <div className="sm:col-span-2 flex gap-2">
                          <button
                            type="submit"
                            disabled={saveLessonMutation.isPending}
                            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            {saveLessonMutation.isPending ? 'Salvando...' : 'Salvar aula'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setLessonForm(null)}
                            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                          >
                            Cancelar
                          </button>
                        </div>
                      </form>
                    ) : null}

                    {(courseDetail?.lessons ?? []).length === 0 ? (
                      <CadastroListEmpty
                        icon={PlayCircle}
                        title="Nenhuma aula cadastrada"
                        hint="Adicione videoaulas para compor o curso."
                      />
                    ) : (
                      <ul className="divide-y divide-gray-200 rounded-lg border border-gray-200 dark:divide-gray-700 dark:border-gray-700">
                        {(courseDetail?.lessons ?? []).map((lesson, index) => (
                          <li
                            key={lesson.id}
                            className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                                {index + 1}. {lesson.title}
                              </p>
                              <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                                {[
                                  lesson.videoUrl ? lesson.videoProvider : 'Sem vídeo',
                                  lesson.durationMinutes
                                    ? `${lesson.durationMinutes} min`
                                    : null,
                                  lesson.attachmentUrl ? 'Com material' : null
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </p>
                            </div>
                            {showActions ? (
                              <div className="flex shrink-0 gap-2">
                                {canEdit ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setLessonForm({
                                        id: lesson.id,
                                        title: lesson.title,
                                        description: lesson.description ?? '',
                                        videoUrl: lesson.videoUrl ?? '',
                                        videoProvider: lesson.videoProvider,
                                        attachmentUrl: lesson.attachmentUrl ?? '',
                                        attachmentName: lesson.attachmentName ?? '',
                                        durationMinutes:
                                          lesson.durationMinutes != null
                                            ? String(lesson.durationMinutes)
                                            : ''
                                      })
                                    }
                                    className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                                  >
                                    Editar
                                  </button>
                                ) : null}
                                {canDelete ? (
                                  <button
                                    type="button"
                                    onClick={() => deleteLessonMutation.mutate(lesson.id)}
                                    className="rounded-md border border-rose-300 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-800/60 dark:text-rose-300"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </button>
                                ) : null}
                              </div>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                  </>
                ) : null}

                {detailTab === 'quiz' ? (
                  <>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      O aluno precisa acertar ao menos {courseDetail?.passingScore ?? 70}% das
                      questões para concluir o curso
                      {courseDetail?.certificateEnabled ? ' e receber o certificado.' : '.'}
                    </p>
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => setQuestionForm(emptyQuestionForm())}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300"
                      >
                        <Plus className="h-4 w-4" />
                        Nova pergunta
                      </button>
                    ) : null}

                    {questionForm ? (
                      <form
                        onSubmit={handleQuestionSubmit}
                        className="space-y-3 rounded-lg border border-gray-200 p-4 dark:border-gray-700"
                      >
                        <div>
                          <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Enunciado *
                          </label>
                          <textarea
                            value={questionForm.statement}
                            onChange={(e) =>
                              setQuestionForm({ ...questionForm, statement: e.target.value })
                            }
                            className={FORM_FIELD_TEXTAREA_CLS}
                            rows={2}
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                            Alternativas (marque a correta)
                          </p>
                          {questionForm.options.map((option, index) => (
                            <div key={option.id} className="flex items-center gap-2">
                              <input
                                type="radio"
                                name="correct-option"
                                checked={!!option.correct}
                                onChange={() =>
                                  setQuestionForm({
                                    ...questionForm,
                                    options: questionForm.options.map((o, i) => ({
                                      ...o,
                                      correct: i === index
                                    }))
                                  })
                                }
                                className="h-4 w-4 shrink-0 border-gray-300 text-red-600 focus:ring-red-500"
                              />
                              <input
                                value={option.label}
                                onChange={(e) =>
                                  setQuestionForm({
                                    ...questionForm,
                                    options: questionForm.options.map((o, i) =>
                                      i === index ? { ...o, label: e.target.value } : o
                                    )
                                  })
                                }
                                placeholder={`Alternativa ${index + 1}`}
                                className={FORM_FIELD_INPUT_CLS}
                              />
                              {questionForm.options.length > 2 ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setQuestionForm({
                                      ...questionForm,
                                      options: questionForm.options.filter((_, i) => i !== index)
                                    })
                                  }
                                  className="shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                                  aria-label="Remover alternativa"
                                >
                                  <X className="h-4 w-4" />
                                </button>
                              ) : null}
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() =>
                              setQuestionForm({
                                ...questionForm,
                                options: [
                                  ...questionForm.options,
                                  {
                                    id: `opt-${questionForm.options.length + 1}`,
                                    label: '',
                                    correct: false
                                  }
                                ]
                              })
                            }
                            className="text-sm font-medium text-red-700 hover:underline dark:text-red-300"
                          >
                            + Adicionar alternativa
                          </button>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="submit"
                            disabled={saveQuestionMutation.isPending}
                            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            {saveQuestionMutation.isPending ? 'Salvando...' : 'Salvar pergunta'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setQuestionForm(null)}
                            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                          >
                            Cancelar
                          </button>
                        </div>
                      </form>
                    ) : null}

                    {(courseDetail?.questions ?? []).length === 0 ? (
                      <CadastroListEmpty
                        icon={ListChecks}
                        title="Nenhuma pergunta cadastrada"
                        hint="Sem questionário o curso é concluído apenas assistindo às aulas."
                      />
                    ) : (
                      <ol className="space-y-3">
                        {(courseDetail?.questions ?? []).map((question, index) => (
                          <li
                            key={question.id}
                            className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <p className="min-w-0 text-sm font-medium text-gray-900 dark:text-gray-100">
                                {index + 1}. {question.statement}
                              </p>
                              {showActions ? (
                                <div className="flex shrink-0 gap-2">
                                  {canEdit ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setQuestionForm({
                                          id: question.id,
                                          statement: question.statement,
                                          options: question.options.map((o) => ({ ...o }))
                                        })
                                      }
                                      className="rounded-md border border-gray-300 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                                    >
                                      Editar
                                    </button>
                                  ) : null}
                                  {canDelete ? (
                                    <button
                                      type="button"
                                      onClick={() => deleteQuestionMutation.mutate(question.id)}
                                      className="rounded-md border border-rose-300 px-2.5 py-1 text-xs font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-800/60 dark:text-rose-300"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  ) : null}
                                </div>
                              ) : null}
                            </div>
                            <ul className="mt-2 space-y-1">
                              {question.options.map((option) => (
                                <li
                                  key={option.id}
                                  className={`text-sm ${
                                    option.correct
                                      ? 'font-medium text-emerald-700 dark:text-emerald-400'
                                      : 'text-gray-600 dark:text-gray-400'
                                  }`}
                                >
                                  {option.correct ? '✓ ' : '• '}
                                  {option.label}
                                </li>
                              ))}
                            </ul>
                          </li>
                        ))}
                      </ol>
                    )}
                  </>
                ) : null}

                {detailTab === 'students' ? (
                  <>
                    {canEdit ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEnrollSelection([]);
                          setEnrollSearch('');
                          setEnrollPickerOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300"
                      >
                        <Plus className="h-4 w-4" />
                        Matricular funcionários
                      </button>
                    ) : null}

                    {enrollments.length === 0 ? (
                      <CadastroListEmpty
                        icon={Users}
                        title="Nenhum aluno matriculado"
                        hint="Matricule funcionários ou deixe que se matriculem pela Central de Treinamentos."
                      />
                    ) : (
                      <div className={cadastroListClasses.tableScroll}>
                        <table className={`${cadastroListClasses.table} min-w-[38rem]`}>
                          <thead className="border-b border-gray-200 dark:border-gray-700">
                            <tr>
                              <th className={cadastroListClasses.th}>Aluno</th>
                              <th className={cadastroListClasses.thCenter}>Situação</th>
                              <th className={cadastroListClasses.thCenter}>Progresso</th>
                              <th className={cadastroListClasses.thCenter}>Melhor nota</th>
                              <th className={cadastroListClasses.thCenter}>Certificado</th>
                              {canDelete ? (
                                <th className={cadastroListClasses.thCenter}>Ação</th>
                              ) : null}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                            {enrollments.map((row) => (
                              <tr key={row.id}>
                                <td className={cadastroListClasses.td}>
                                  <span className="block truncate font-medium">
                                    {row.user.name}
                                  </span>
                                  {row.user.employee?.position ? (
                                    <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                                      {row.user.employee.position}
                                    </span>
                                  ) : null}
                                </td>
                                <td className={cadastroListClasses.tdCenter}>
                                  {ENROLLMENT_STATUS_LABELS[row.status]}
                                </td>
                                <td className={cadastroListClasses.tdCenter}>
                                  <span className="tabular-nums">
                                    {row.completedLessons}/{row.totalLessons} ({row.progressPercent}
                                    %)
                                  </span>
                                </td>
                                <td className={cadastroListClasses.tdCenter}>
                                  <span className="tabular-nums">
                                    {row.bestScore != null ? `${row.bestScore}%` : '—'}
                                  </span>
                                </td>
                                <td className={cadastroListClasses.tdCenter}>
                                  {row.certificate ? row.certificate.code : '—'}
                                </td>
                                {canDelete ? (
                                  <td className={cadastroListClasses.tdCenter}>
                                    <button
                                      type="button"
                                      onClick={() => removeEnrollmentMutation.mutate(row.id)}
                                      className="inline-flex items-center justify-center rounded-lg p-2 text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/30"
                                      aria-label="Remover matrícula"
                                      title="Remover"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </button>
                                  </td>
                                ) : null}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                ) : null}
              </div>
            </div>
          </AppModalOverlay>
        ) : null}

        {enrollPickerOpen ? (
          <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2100] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={closeEnrollPicker} />
            <div className="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-lg bg-white shadow-xl dark:bg-gray-800">
              <div className="flex items-center justify-between border-b border-gray-200 p-5 dark:border-gray-700">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Matricular funcionários
                </h2>
                <button
                  type="button"
                  onClick={closeEnrollPicker}
                  className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-3 p-5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    value={enrollSearch}
                    onChange={(e) => setEnrollSearch(e.target.value)}
                    placeholder="Buscar funcionário..."
                    className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    autoFocus
                  />
                </div>
                <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
                  {filteredTechnicians.length === 0 ? (
                    <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">
                      {technicians.length === 0
                        ? 'Nenhum funcionário disponível.'
                        : 'Nenhum funcionário encontrado.'}
                    </p>
                  ) : (
                    filteredTechnicians.map((tech) => {
                      const enrolled = enrollmentByUserId.has(tech.id);
                      const checked = enrolled || enrollSelection.includes(tech.id);
                      return (
                        <label
                          key={tech.id}
                          className="group flex cursor-pointer items-center gap-3 rounded-md px-1 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700/40"
                        >
                          <span className="relative inline-flex size-5 shrink-0 items-center justify-center">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) => toggleEnrollSelection(tech.id, e.target.checked)}
                              className="absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0"
                            />
                            <CheckboxIndicator checked={checked} />
                          </span>
                          <PersonIdentity
                            name={tech.name}
                            cpf={tech.cpf}
                            profilePhotoUrl={tech.profilePhotoUrl}
                          />
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
              <div className="flex gap-2 border-t border-gray-200 p-4 dark:border-gray-700">
                <button
                  type="button"
                  disabled={!enrollSelection.length || enrollMutation.isPending}
                  onClick={() => enrollMutation.mutate(enrollSelection)}
                  className="flex-1 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {enrollMutation.isPending
                    ? 'Matriculando...'
                    : `Matricular (${enrollSelection.length})`}
                </button>
                <button
                  type="button"
                  onClick={closeEnrollPicker}
                  className="rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  Concluir
                </button>
              </div>
            </div>
          </AppModalOverlay>
        ) : null}

        {deleteTarget ? (
          <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteTarget(null)} />
            <div className="relative mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <AlertCircle className="h-6 w-6 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="mb-2 text-center text-lg font-semibold text-gray-900 dark:text-gray-100">
                Excluir {deleteTarget.title}?
              </h3>
              <p className="mb-6 text-center text-sm text-gray-600 dark:text-gray-400">
                Cursos com matrículas são apenas arquivados, preservando certificados já emitidos.
              </p>
              <div className="flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setDeleteTarget(null)}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 dark:bg-gray-700 dark:text-gray-200"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={deleteCourseMutation.isPending}
                  onClick={() => deleteCourseMutation.mutate(deleteTarget.id)}
                  className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700 disabled:opacity-50"
                >
                  {deleteCourseMutation.isPending ? 'Excluindo...' : 'Excluir'}
                </button>
              </div>
            </div>
          </AppModalOverlay>
        ) : null}

        {courseFormConfirmUi}
      </MainLayout>
    </ProtectedRoute>
  );
}
