'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  Megaphone,
  Plus,
  Search,
  Pencil,
  Send,
  Ban,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { DateTimePickerField } from '@/components/ui/DateTimePickerField';
import { FileDropZone } from '@/components/ui/FileDropZone';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { FORM_FIELD_INPUT_CLS, FORM_FIELD_TEXTAREA_CLS } from '@/lib/formFieldUi';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary,
  getCadastroListRange,
} from '@/components/ui/CadastroListSummary';
import { ListPagination } from '@/components/ui/ListPagination';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { ListPageHeader, PageStack } from '@/components/ui/pageLayout';
import {
  MultiSelectSearchDropdown,
  type MultiSelectSearchOption,
} from '@/components/ui/MultiSelectSearchDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { DEPARTMENTS_LIST } from '@/constants/payrollFilters';
import { CARGOS_AVAILABLE } from '@/constants/cargos';
import { toPersonSelectOptions } from '@/lib/personSelectOptions';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import { useCadastroCrudPermissions } from '@/hooks/useCadastroCrudPermissions';

type ScheduledNewsStatus = 'DRAFT' | 'SCHEDULED' | 'PUBLISHED' | 'CANCELLED';
type ScheduledNewsAudienceType = 'ALL' | 'DEPARTMENTS' | 'POSITIONS' | 'USERS';

type ScheduledNewsRow = {
  id: string;
  title: string;
  summary: string;
  content: string;
  imageUrl: string | null;
  imageKey: string | null;
  status: ScheduledNewsStatus;
  audienceType: ScheduledNewsAudienceType;
  audienceDepartments: string[];
  audiencePositions: string[];
  audienceUserIds: string[];
  priority: number;
  publishAt: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  viewsCount: number;
};

type NewsListResponse = {
  data: ScheduledNewsRow[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type UserOptionRow = {
  id: string;
  name: string;
  cpf?: string | null;
  profilePhotoUrl?: string | null;
  employee?: {
    department?: string | null;
    position?: string | null;
  } | null;
};

type FormState = {
  title: string;
  summary: string;
  content: string;
  status: ScheduledNewsStatus;
  audienceType: ScheduledNewsAudienceType;
  audienceDepartments: string[];
  audiencePositions: string[];
  audienceUserIds: string[];
  priority: number;
  publishAt: string;
  expiresAt: string;
  imageUrl: string | null;
};

const STATUS_OPTIONS = labeledToSelectOptions([
  { value: 'DRAFT', label: 'Rascunho' },
  { value: 'SCHEDULED', label: 'Agendada' },
  { value: 'PUBLISHED', label: 'Publicada' },
  { value: 'CANCELLED', label: 'Cancelada' },
]);

const AUDIENCE_OPTIONS = labeledToSelectOptions([
  { value: 'ALL', label: 'Todos os usuários' },
  { value: 'DEPARTMENTS', label: 'Setores específicos' },
  { value: 'POSITIONS', label: 'Cargos específicos' },
  { value: 'USERS', label: 'Usuários específicos' },
]);

const FILTER_STATUS_OPTIONS = labeledToSelectOptions([
  { value: 'ALL', label: 'Todos os status' },
  { value: 'DRAFT', label: 'Rascunho' },
  { value: 'SCHEDULED', label: 'Agendada' },
  { value: 'PUBLISHED', label: 'Publicada' },
  { value: 'CANCELLED', label: 'Cancelada' },
]);

const departmentOptions: MultiSelectSearchOption[] = DEPARTMENTS_LIST.map((value) => ({
  value,
  label: value,
}));

const positionOptions: MultiSelectSearchOption[] = CARGOS_AVAILABLE.map((value) => ({
  value,
  label: value,
}));

const inputClass = FORM_FIELD_INPUT_CLS;
const textAreaClass = FORM_FIELD_TEXTAREA_CLS;
const labelClass = 'mb-1.5 block text-xs font-medium text-gray-500 dark:text-gray-400';

function emptyForm(): FormState {
  const now = new Date();
  now.setSeconds(0, 0);
  return {
    title: '',
    summary: '',
    content: '',
    status: 'SCHEDULED',
    audienceType: 'ALL',
    audienceDepartments: [],
    audiencePositions: [],
    audienceUserIds: [],
    priority: 0,
    publishAt: now.toISOString().slice(0, 16),
    expiresAt: '',
    imageUrl: null,
  };
}

function toDateTimeInput(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const timezoneOffset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
}

function rowToForm(row: ScheduledNewsRow): FormState {
  return {
    title: row.title,
    summary: row.summary,
    content: row.content,
    status: row.status,
    audienceType: row.audienceType,
    audienceDepartments: row.audienceDepartments,
    audiencePositions: row.audiencePositions,
    audienceUserIds: row.audienceUserIds,
    priority: row.priority,
    publishAt: toDateTimeInput(row.publishAt),
    expiresAt: toDateTimeInput(row.expiresAt),
    imageUrl: row.imageUrl,
  };
}

function statusLabel(status: ScheduledNewsStatus): string {
  return (
    {
      DRAFT: 'Rascunho',
      SCHEDULED: 'Agendada',
      PUBLISHED: 'Publicada',
      CANCELLED: 'Cancelada',
    }[status] || status
  );
}

function audienceLabel(row: ScheduledNewsRow): string {
  if (row.audienceType === 'ALL') return 'Todos os usuários';
  if (row.audienceType === 'DEPARTMENTS') return `Setores: ${row.audienceDepartments.join(', ')}`;
  if (row.audienceType === 'POSITIONS') return `Cargos: ${row.audiencePositions.join(', ')}`;
  return `${row.audienceUserIds.length} usuário(s) específico(s)`;
}

function formatDateTime(value?: string | null): string {
  if (!value) return 'Sem expiração';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Data inválida';
  return date.toLocaleString('pt-BR');
}

export default function NoticiasPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { canCreate, canEdit } = useCadastroCrudPermissions('/ponto/noticias');
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduledNewsRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null);

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });

  const { data: newsResp, isLoading: loadingList } = useQuery({
    queryKey: ['scheduled-news-admin', page, search, statusFilter],
    queryFn: async () => {
      const res = await api.get('/news/admin', {
        params: {
          page,
          limit: 10,
          q: search || undefined,
          status: statusFilter === 'ALL' ? undefined : statusFilter,
        },
      });
      return res.data as NewsListResponse;
    },
  });

  const { data: usersResp } = useQuery({
    queryKey: ['scheduled-news-users'],
    queryFn: async () => {
      const res = await api.get('/news/admin-audience-users');
      return res.data as { data: UserOptionRow[] };
    },
  });

  const userOptions = useMemo(
    () =>
      toPersonSelectOptions(
        (usersResp?.data || []).map((user) => ({
          value: user.id,
          name: user.name,
          cpf: user.cpf,
          profilePhotoUrl: user.profilePhotoUrl,
          extraSearchText: [user.employee?.department, user.employee?.position].filter(Boolean).join(' '),
        })),
      ),
    [usersResp],
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editing ? !canEdit : !canCreate) {
        throw new Error(editing ? 'Você não tem permissão para editar.' : 'Você não tem permissão para criar.');
      }
      const payload = {
        title: form.title,
        summary: form.summary,
        content: form.content,
        status: form.status,
        audienceType: form.audienceType,
        audienceDepartments: form.audienceDepartments,
        audiencePositions: form.audiencePositions,
        audienceUserIds: form.audienceUserIds,
        priority: form.priority,
        publishAt: form.publishAt,
        expiresAt: form.expiresAt || null,
      };

      const res = editing
        ? await api.patch(`/news/admin/${editing.id}`, payload)
        : await api.post('/news/admin', payload);

      const saved = res.data?.data as ScheduledNewsRow;
      if (imageFile) {
        const formData = new FormData();
        formData.append('image', imageFile);
        await api.post(`/news/admin/${saved.id}/image`, formData);
      }
      return saved;
    },
    onSuccess: () => {
      toast.success(editing ? 'Notícia atualizada com sucesso' : 'Notícia criada com sucesso');
      void queryClient.invalidateQueries({ queryKey: ['scheduled-news-admin'] });
      setIsModalOpen(false);
      setEditing(null);
      setForm(emptyForm());
      setImageFile(null);
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || error?.message || 'Não foi possível salvar a notícia');
    },
  });

  const publishMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!canEdit) throw new Error('Você não tem permissão para editar.');
      return api.post(`/news/admin/${id}/publish`);
    },
    onSuccess: () => {
      toast.success('Notícia publicada');
      void queryClient.invalidateQueries({ queryKey: ['scheduled-news-admin'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || error?.message || 'Erro ao publicar notícia');
    },
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!canEdit) throw new Error('Você não tem permissão para editar.');
      return api.post(`/news/admin/${id}/cancel`);
    },
    onSuccess: () => {
      toast.success('Notícia cancelada');
      void queryClient.invalidateQueries({ queryKey: ['scheduled-news-admin'] });
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.message || error?.message || 'Erro ao cancelar notícia');
    },
  });

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };
  const rows = newsResp?.data || [];
  const pagination = newsResp?.pagination;
  const listRange = pagination
    ? getCadastroListRange(pagination.page, pagination.limit, pagination.total)
    : { startItem: 0, endItem: 0, totalPages: 1 };

  useEffect(() => {
    if (!imageFile) {
      setImagePreviewUrl(null);
      return;
    }
    const objectUrl = URL.createObjectURL(imageFile);
    setImagePreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [imageFile]);

  const imagePreview = imagePreviewUrl || resolveApiMediaUrl(form.imageUrl ?? null) || null;

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setImageFile(null);
    setIsModalOpen(true);
  };

  const openEdit = (row: ScheduledNewsRow) => {
    setEditing(row);
    setForm(rowToForm(row));
    setImageFile(null);
    setIsModalOpen(true);
  };

  if (loadingUser) {
    return (
      <ProtectedRoute route="/ponto/noticias">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/noticias">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <PageStack>
          <ListPageHeader
            title="Notícias Agendadas"
            description="Programe flyers e comunicados para aparecer no primeiro acesso dos usuários."
          />

          <Card className={cadastroListClasses.card}>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <div className={cadastroListClasses.cardHeaderRow}>
                <div className={cadastroListClasses.cardHeaderIconRow}>
                  <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                    <Megaphone className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 sm:text-xl">
                      Comunicados e flyers
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Escolha a data, o público e a arte que será exibida no login.
                    </p>
                  </div>
                </div>
                <div className={cadastroListClasses.cardToolbar}>
                  <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => {
                        setPage(1);
                        setSearch(e.target.value);
                      }}
                      placeholder="Buscar notícia..."
                      className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </div>
                  <div className="min-w-[220px]">
                    <StringSingleSelectDropdown
                      value={statusFilter}
                      onChange={(value) => {
                        setPage(1);
                        setStatusFilter(value);
                      }}
                      options={FILTER_STATUS_OPTIONS}
                      placeholder="Filtrar status"
                    />
                  </div>
                  {canCreate && (
                  <button
                    type="button"
                    onClick={openCreate}
                    className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    <span>Nova notícia</span>
                  </button>
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent>
              {loadingList ? (
                <CadastroListLoading message="Carregando notícias..." />
              ) : rows.length === 0 ? (
                <CadastroListEmpty
                  icon={Megaphone}
                  title="Nenhuma notícia cadastrada"
                  hint="Crie um comunicado para exibir no primeiro acesso dos usuários."
                />
              ) : (
                <>
                  <CadastroListSummary
                    startItem={listRange.startItem}
                    endItem={listRange.endItem}
                    total={pagination?.total || 0}
                    itemLabel="notícia"
                    itemLabelPlural="notícias"
                    currentPage={pagination?.page}
                    totalPages={pagination?.totalPages}
                  />

                  <div className="space-y-3">
                    {rows.map((row) => (
                      <div
                        key={row.id}
                        className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-800"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">
                                {row.title}
                              </h4>
                              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                                {statusLabel(row.status)}
                              </span>
                            </div>
                            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{row.summary}</p>
                            <div className="mt-3 grid gap-2 text-xs text-gray-500 dark:text-gray-400 sm:grid-cols-2 xl:grid-cols-4">
                              <span>Público: {audienceLabel(row)}</span>
                              <span>Publicação: {formatDateTime(row.publishAt)}</span>
                              <span>Expira em: {formatDateTime(row.expiresAt)}</span>
                              <span>Visualizações: {row.viewsCount}</span>
                            </div>
                          </div>
                          {canEdit && (
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => openEdit(row)}
                              className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                            >
                              <Pencil className="h-4 w-4" />
                              Editar
                            </button>
                            <button
                              type="button"
                              onClick={() => publishMutation.mutate(row.id)}
                              disabled={publishMutation.isPending}
                              className="inline-flex h-10 items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-3 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300"
                            >
                              <Send className="h-4 w-4" />
                              Publicar
                            </button>
                            <button
                              type="button"
                              onClick={() => cancelMutation.mutate(row.id)}
                              disabled={cancelMutation.isPending}
                              className="inline-flex h-10 items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-3 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
                            >
                              <Ban className="h-4 w-4" />
                              Cancelar
                            </button>
                          </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <ListPagination
                    currentPage={pagination?.page || 1}
                    totalPages={pagination?.totalPages || 1}
                    onPageChange={setPage}
                    className="mt-6"
                  />
                </>
              )}
            </CardContent>
          </Card>
        </PageStack>

        <Modal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          title={editing ? 'Editar notícia' : 'Nova notícia'}
          size="2xl"
          footer={
            <>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Fechar
              </button>
              <button
                type="button"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {saveMutation.isPending ? 'Salvando...' : editing ? 'Salvar alterações' : 'Criar notícia'}
              </button>
            </>
          }
        >
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className={labelClass}>Título</label>
                <input
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  className={inputClass}
                  placeholder="Ex.: Feliz Dia dos Pais"
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Resumo</label>
                <textarea
                  value={form.summary}
                  onChange={(e) => setForm((prev) => ({ ...prev, summary: e.target.value }))}
                  className={textAreaClass}
                  placeholder="Texto curto que aparece junto ao comunicado."
                />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Conteúdo</label>
                <textarea
                  value={form.content}
                  onChange={(e) => setForm((prev) => ({ ...prev, content: e.target.value }))}
                  className={`${textAreaClass} min-h-[180px]`}
                  placeholder="Mensagem completa do comunicado."
                />
              </div>
              <div>
                <label className={labelClass}>Status</label>
                <StringSingleSelectDropdown
                  value={form.status}
                  onChange={(value) => setForm((prev) => ({ ...prev, status: value as ScheduledNewsStatus }))}
                  options={STATUS_OPTIONS}
                />
              </div>
              <div>
                <label className={labelClass}>Público-alvo</label>
                <StringSingleSelectDropdown
                  value={form.audienceType}
                  onChange={(value) =>
                    setForm((prev) => ({
                      ...prev,
                      audienceType: value as ScheduledNewsAudienceType,
                      audienceDepartments: value === 'DEPARTMENTS' ? prev.audienceDepartments : [],
                      audiencePositions: value === 'POSITIONS' ? prev.audiencePositions : [],
                      audienceUserIds: value === 'USERS' ? prev.audienceUserIds : [],
                    }))
                  }
                  options={AUDIENCE_OPTIONS}
                />
              </div>
              <div>
                <label className={labelClass}>Data e hora da publicação</label>
                <DateTimePickerField
                  value={form.publishAt}
                  onChange={(publishAt) => setForm((prev) => ({ ...prev, publishAt }))}
                  placeholder="dd/mm/aaaa hh:mm"
                  noFocusRing
                  aria-label="Data e hora da publicação"
                />
              </div>
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400">
                    Expira em
                  </label>
                  {form.expiresAt ? (
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, expiresAt: '' }))}
                      className="text-xs font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                      Remover data
                    </button>
                  ) : null}
                </div>
                <DateTimePickerField
                  value={form.expiresAt}
                  onChange={(expiresAt) => setForm((prev) => ({ ...prev, expiresAt }))}
                  placeholder="Sem data de expiração"
                  noFocusRing
                  aria-label="Expira em"
                />
              </div>
              <div>
                <label className={labelClass}>Prioridade</label>
                <input
                  type="number"
                  min={0}
                  value={form.priority}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      priority: Math.max(0, Number(e.target.value || 0)),
                    }))
                  }
                  className={inputClass}
                />
              </div>

              {form.audienceType === 'DEPARTMENTS' ? (
                <div className="md:col-span-2">
                  <label className={labelClass}>Setores liberados</label>
                  <MultiSelectSearchDropdown
                    options={departmentOptions}
                    selected={form.audienceDepartments}
                    onChange={(selected) => setForm((prev) => ({ ...prev, audienceDepartments: selected }))}
                    placeholder="Selecionar setores"
                    searchPlaceholder="Buscar setor"
                  />
                </div>
              ) : null}

              {form.audienceType === 'POSITIONS' ? (
                <div className="md:col-span-2">
                  <label className={labelClass}>Cargos liberados</label>
                  <MultiSelectSearchDropdown
                    options={positionOptions}
                    selected={form.audiencePositions}
                    onChange={(selected) => setForm((prev) => ({ ...prev, audiencePositions: selected }))}
                    placeholder="Selecionar cargos"
                    searchPlaceholder="Buscar cargo"
                  />
                </div>
              ) : null}

              {form.audienceType === 'USERS' ? (
                <div className="md:col-span-2">
                  <label className={labelClass}>Usuários liberados</label>
                  <MultiSelectSearchDropdown
                    options={userOptions}
                    selected={form.audienceUserIds}
                    onChange={(selected) => setForm((prev) => ({ ...prev, audienceUserIds: selected }))}
                    placeholder="Selecionar usuários"
                    searchPlaceholder="Buscar usuário"
                  />
                </div>
              ) : null}

              <div className="md:col-span-2">
                <label className={labelClass}>Flyer / imagem</label>
                <FileDropZone
                  label={imageFile ? imageFile.name : 'Clique ou arraste uma imagem'}
                  hint="JPG, PNG ou WEBP. A arte será mostrada no modal do usuário."
                  accept="image/png,image/jpeg,image/webp"
                  onFiles={(files) => setImageFile(files[0] || null)}
                />
                {imagePreview ? (
                  <div className="mt-3 overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={imagePreview}
                      alt="Prévia da notícia"
                      className="max-h-[22rem] w-full object-cover"
                    />
                  </div>
                ) : null}
              </div>
            </div>

          </div>
        </Modal>
      </MainLayout>
    </ProtectedRoute>
  );
}
