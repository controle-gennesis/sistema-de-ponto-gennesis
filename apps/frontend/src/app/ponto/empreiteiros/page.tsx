'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { FileText, HardHat, Paperclip, Plus, Search, Trash2, X } from 'lucide-react';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary,
  formatCadastroListId,
} from '@/components/ui/CadastroListSummary';
import {
  RowActionMenuCell,
  RowActionMenuPortal,
  ListRowNavigableLabel,
  cadastroListClasses,
  listTableRowClasses,
} from '@/components/ui/RowActionMenu';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import { useCadastroCrudPermissions } from '@/hooks/useCadastroCrudPermissions';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { formatCpfInput, onlyDigits } from '@/lib/cpf';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import { useModalCloseConfirm } from '@/hooks/useModalCloseConfirm';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { VehicleReturnPhotoField } from '@/components/ui/VehicleReturnPhotoField';
import { Z_LIGHTBOX } from '@/lib/zIndex';

type DocumentKind = 'CPF' | 'CNPJ';

interface EmpreiteiroRow {
  id: string;
  name: string;
  tradeName?: string | null;
  documentKind: DocumentKind | string;
  document: string;
  phone: string;
  specialty: string;
  contractId: string;
  contratoNome?: string;
  isActive: boolean;
  contactName?: string | null;
  email?: string | null;
  city?: string | null;
  state?: string | null;
  pixKey?: string | null;
  bank?: string | null;
  agency?: string | null;
  account?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  photoUrl?: string | null;
  files?: PaymentFile[];
  team?: TeamMemberRow[];
  teamCount?: number;
}

interface PaymentFile {
  url: string;
  name: string;
  key?: string;
}

interface TeamMemberRow {
  id?: string;
  name: string;
  role: string;
  phone?: string | null;
  document?: string | null;
  photoUrl?: string | null;
}

interface ContractOption {
  id: string;
  name: string;
}

const EMPREITEIRO_TEAM_ROLES = [
  'Pedreiro',
  'Servente',
  'Eletricista',
  'Encanador',
  'Pintor',
  'Ajudante',
  'Mestre de obras',
  'Outros',
];

const EMPREITEIRO_SPECIALTIES = [
  'Alvenaria / Civil',
  'Elétrica',
  'Hidráulica',
  'Pintura',
  'Gesso / Drywall',
  'Marcenaria',
  'Serralheria',
  'Impermeabilização',
  'Cobertura / Telhado',
  'Ar-condicionado',
  'Limpeza',
  'Outros',
];

const UF_OPTIONS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS',
  'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC',
  'SP', 'SE', 'TO',
];

function maskCnpjInput(raw: string): string {
  const digits = onlyDigits(raw).slice(0, 14);
  return digits
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

function maskPhoneInput(raw: string): string {
  const digits = onlyDigits(raw).slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : '';
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function formatDocumentDisplay(kind: string, document: string): string {
  const digits = onlyDigits(document);
  if (kind === 'CNPJ' || digits.length === 14) return maskCnpjInput(digits);
  if (digits.length === 11) return formatCpfInput(digits);
  return document || '—';
}

function formatPhoneDisplay(phone: string): string {
  const digits = onlyDigits(phone);
  return digits ? maskPhoneInput(digits) : '—';
}

function toDateInputValue(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function formatDateBr(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('pt-BR');
}

function isImageFile(file: { url: string; name?: string }) {
  const source = `${file.name || ''} ${file.url || ''}`.toLowerCase();
  return /\.(png|jpe?g|gif|webp|bmp|svg)(\?|$)/i.test(source) || source.includes('data:image/');
}

function DetailField({ label, value }: { label: string; value?: React.ReactNode }) {
  const empty = value === undefined || value === null || value === '';
  return (
    <div>
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <div className="text-sm text-gray-900 dark:text-gray-100">{empty ? '—' : value}</div>
    </div>
  );
}

type TeamMemberForm = {
  name: string;
  role: string;
  phone: string;
  document: string;
  photo: string;
};

const emptyTeamMember = (): TeamMemberForm => ({
  name: '',
  role: '',
  phone: '',
  document: '',
  photo: '',
});

const emptyForm = {
  name: '',
  tradeName: '',
  documentKind: 'CPF' as DocumentKind,
  document: '',
  phone: '',
  specialty: '',
  contractId: '',
  isActive: true,
  contactName: '',
  email: '',
  city: '',
  state: '',
  pixKey: '',
  bank: '',
  agency: '',
  account: '',
  startDate: '',
  endDate: '',
  photo: '',
  files: [] as PaymentFile[],
  team: [] as TeamMemberForm[],
};

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';
const labelClass = 'mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300';

export default function EmpreiteirosPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { canCreate, canEdit, canDelete } = useCadastroCrudPermissions('/ponto/empreiteiros');
  const showActions = canEdit || canDelete;
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [viewingItem, setViewingItem] = useState<EmpreiteiroRow | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<{ url: string; alt: string } | null>(null);
  const [editingItem, setEditingItem] = useState<EmpreiteiroRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showDeleteId, setShowDeleteId] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);

  const openPreviewPhoto = (url?: string | null, alt?: string) => {
    const resolved = resolveApiMediaUrl(url) || url || '';
    if (!resolved) return;
    setPreviewPhoto({ url: resolved, alt: alt || 'Foto' });
  };

  useEffect(() => {
    if (!previewPhoto) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setPreviewPhoto(null);
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [previewPhoto]);

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
    },
  });

  const { data: listData, isLoading } = useQuery({
    queryKey: ['empreiteiros', searchTerm],
    queryFn: async () => {
      const res = await api.get('/empreiteiros', {
        params: { search: searchTerm || undefined, limit: 500 },
      });
      return res.data;
    },
  });

  const { data: contractsData } = useQuery({
    queryKey: ['contracts-empreiteiros-cadastro'],
    queryFn: async () => {
      const res = await api.get('/contracts', { params: { limit: 500, page: 1 } });
      return res.data;
    },
  });

  const contratoSelectOptions = useMemo(() => {
    const rows = ((contractsData?.data || []) as ContractOption[]).filter((c) => c.id && c.name);
    return labeledToSelectOptions(rows.map((c) => ({ value: c.id, label: c.name })));
  }, [contractsData]);

  const specialtySelectOptions = useMemo(
    () => labeledToSelectOptions(EMPREITEIRO_SPECIALTIES.map((value) => ({ value, label: value }))),
    []
  );

  const teamRoleSelectOptions = useMemo(
    () => labeledToSelectOptions(EMPREITEIRO_TEAM_ROLES.map((value) => ({ value, label: value }))),
    []
  );

  const ufSelectOptions = useMemo(
    () => labeledToSelectOptions(UF_OPTIONS.map((value) => ({ value, label: value }))),
    []
  );

  const resetForm = () => {
    setEditingItem(null);
    setForm(emptyForm);
  };

  const patchForm = (partial: Partial<typeof emptyForm>) => {
    setForm((prev) => ({ ...prev, ...partial }));
  };

  const patchTeamMember = (index: number, partial: Partial<TeamMemberForm>) => {
    setForm((prev) => ({
      ...prev,
      team: prev.team.map((member, i) => (i === index ? { ...member, ...partial } : member)),
    }));
  };

  const addTeamMember = () => {
    setForm((prev) => ({ ...prev, team: [...prev.team, emptyTeamMember()] }));
  };

  const removeTeamMember = (index: number) => {
    setForm((prev) => ({ ...prev, team: prev.team.filter((_, i) => i !== index) }));
  };

  const uploadPaymentFile = async (file: File | null | undefined) => {
    if (!file) return;
    setUploadingFile(true);
    try {
      const data = new FormData();
      data.append('file', file);
      const res = await api.post('/empreiteiros/upload-file', data);
      const uploaded = res.data?.data as { url?: string; name?: string; key?: string } | undefined;
      if (!uploaded?.url) throw new Error('Upload sem URL');
      setForm((prev) => ({
        ...prev,
        files: [
          ...prev.files,
          {
            url: uploaded.url as string,
            name: uploaded.name || file.name,
            key: uploaded.key,
          },
        ],
      }));
      toast.success('Comprovante enviado');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Falha no upload do arquivo');
    } finally {
      setUploadingFile(false);
    }
  };

  const removePaymentFile = (fileIndex: number) => {
    setForm((prev) => ({
      ...prev,
      files: prev.files.filter((_, fi) => fi !== fileIndex),
    }));
  };

  const persistViewingFiles = async (files: PaymentFile[]) => {
    if (!viewingItem) return;
    const res = await api.patch(`/empreiteiros/${viewingItem.id}`, { files });
    const data = res.data?.data as EmpreiteiroRow | undefined;
    setViewingItem((prev) =>
      prev ? { ...prev, files: Array.isArray(data?.files) ? data.files : files } : prev
    );
    queryClient.invalidateQueries({ queryKey: ['empreiteiros'] });
  };

  const uploadViewingFile = async (file: File | null | undefined) => {
    if (!file || !viewingItem) return;
    if (!canEdit) {
      toast.error('Você não tem permissão para anexar.');
      return;
    }
    setUploadingFile(true);
    try {
      const data = new FormData();
      data.append('file', file);
      const res = await api.post('/empreiteiros/upload-file', data);
      const uploaded = res.data?.data as { url?: string; name?: string; key?: string } | undefined;
      if (!uploaded?.url) throw new Error('Upload sem URL');
      await persistViewingFiles([
        ...(viewingItem.files || []),
        {
          url: uploaded.url as string,
          name: uploaded.name || file.name,
          key: uploaded.key,
        },
      ]);
      toast.success('Comprovante anexado');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Falha no upload do arquivo');
    } finally {
      setUploadingFile(false);
    }
  };

  const removeViewingFile = async (fileIndex: number) => {
    if (!viewingItem || !canEdit) return;
    try {
      await persistViewingFiles((viewingItem.files || []).filter((_, fi) => fi !== fileIndex));
      toast.success('Arquivo removido');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Não foi possível remover o arquivo');
    }
  };

  const createMutation = useMutation({
    mutationFn: async (payload: Record<string, unknown>) => {
      const res = await api.post('/empreiteiros', payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empreiteiros'] });
      setShowForm(false);
      resetForm();
      toast.success('Empreiteiro salvo com sucesso!');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao salvar');
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Record<string, unknown> }) => {
      const res = await api.patch(`/empreiteiros/${id}`, payload);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empreiteiros'] });
      setShowForm(false);
      resetForm();
      toast.success('Empreiteiro atualizado!');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao atualizar');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/empreiteiros/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['empreiteiros'] });
      setShowDeleteId(null);
      toast.success('Registro excluído');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao excluir');
    },
  });

  const openDetails = (item: EmpreiteiroRow) => {
    setViewingItem(item);
    void api
      .get(`/empreiteiros/${item.id}`)
      .then((res) => {
        const data = res.data?.data as EmpreiteiroRow | undefined;
        if (data?.id) setViewingItem(data);
      })
      .catch(() => undefined);
  };

  const handleEdit = (item: EmpreiteiroRow) => {
    setPreviewPhoto(null);
    setViewingItem(null);
    setEditingItem(item);
    setForm({
      name: item.name || '',
      tradeName: item.tradeName || '',
      documentKind: item.documentKind === 'CNPJ' ? 'CNPJ' : 'CPF',
      document: item.document
        ? formatDocumentDisplay(item.documentKind, item.document)
        : '',
      phone: item.phone ? maskPhoneInput(item.phone) : '',
      specialty: item.specialty || '',
      contractId: item.contractId || '',
      isActive: item.isActive !== false,
      contactName: item.contactName || '',
      email: item.email || '',
      city: item.city || '',
      state: item.state || '',
      pixKey: item.pixKey || '',
      bank: item.bank || '',
      agency: item.agency || '',
      account: item.account || '',
      startDate: toDateInputValue(item.startDate),
      endDate: toDateInputValue(item.endDate),
      photo: resolveApiMediaUrl(item.photoUrl) || item.photoUrl || '',
      files: Array.isArray(item.files) ? item.files : [],
      team: (item.team || []).map((member) => ({
        name: member.name || '',
        role: member.role || '',
        phone: member.phone ? maskPhoneInput(member.phone) : '',
        document: member.document ? formatCpfInput(member.document) : '',
        photo: resolveApiMediaUrl(member.photoUrl) || member.photoUrl || '',
      })),
    });
    setShowForm(true);
  };

  const buildPayload = () => ({
    name: form.name.trim(),
    tradeName: form.tradeName.trim() || null,
    documentKind: form.documentKind,
    document: onlyDigits(form.document),
    phone: onlyDigits(form.phone),
    specialty: form.specialty.trim(),
    contractId: form.contractId.trim(),
    isActive: form.isActive,
    contactName: form.contactName.trim() || null,
    email: form.email.trim() || null,
    city: form.city.trim() || null,
    state: form.state.trim() || null,
    pixKey: form.pixKey.trim() || null,
    bank: form.bank.trim() || null,
    agency: form.agency.trim() || null,
    account: form.account.trim() || null,
    startDate: form.startDate || null,
    endDate: form.endDate || null,
    photo: form.photo || null,
    files: form.files,
    team: form.team.map((member) => ({
      name: member.name.trim(),
      role: member.role.trim(),
      phone: onlyDigits(member.phone),
      document: onlyDigits(member.document),
      photo: member.photo || null,
    })),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = buildPayload();
    if (!payload.contractId) {
      toast.error('Selecione o contrato');
      return;
    }
    if (!payload.name) {
      toast.error('Nome é obrigatório');
      return;
    }
    if (!payload.specialty) {
      toast.error('Especialidade é obrigatória');
      return;
    }
    if (payload.documentKind === 'CPF' && payload.document.length !== 11) {
      toast.error('CPF deve ter 11 dígitos');
      return;
    }
    if (payload.documentKind === 'CNPJ' && payload.document.length !== 14) {
      toast.error('CNPJ deve ter 14 dígitos');
      return;
    }
    if (payload.phone.length < 10) {
      toast.error('Telefone é obrigatório');
      return;
    }
    for (let i = 0; i < payload.team.length; i += 1) {
      const member = payload.team[i];
      const empty = !member.name && !member.role && !member.phone && !member.document;
      if (empty) continue;
      if (!member.name) {
        toast.error(`Nome da pessoa ${i + 1} da equipe é obrigatório`);
        return;
      }
      if (!member.role) {
        toast.error(`Função da pessoa ${i + 1} da equipe é obrigatória`);
        return;
      }
      if (member.phone && member.phone.length < 10) {
        toast.error(`Telefone da pessoa ${i + 1} da equipe é inválido`);
        return;
      }
      if (member.document && member.document.length !== 11) {
        toast.error(`CPF da pessoa ${i + 1} da equipe deve ter 11 dígitos`);
        return;
      }
    }
    if (
      payload.startDate &&
      payload.endDate &&
      String(payload.endDate) < String(payload.startDate)
    ) {
      toast.error('A data de fim não pode ser anterior à data de início');
      return;
    }
    if (editingItem) {
      if (!canEdit) {
        toast.error('Você não tem permissão para editar.');
        return;
      }
      updateMutation.mutate({ id: editingItem.id, payload });
    } else {
      if (!canCreate) {
        toast.error('Você não tem permissão para criar.');
        return;
      }
      createMutation.mutate(payload);
    }
  };

  const closeFormModal = useCallback(() => {
    setShowForm(false);
    resetForm();
  }, []);

  const { requestClose: requestCloseForm, confirmUi: formConfirmUi } = useModalCloseConfirm(
    closeFormModal,
    { isParentOpen: showForm }
  );

  const items: EmpreiteiroRow[] = listData?.data || [];

  const {
    rowActionMenu,
    rowForActionMenu,
    toggleRowActionMenu,
    closeRowActionMenu,
    isRowMenuOpen,
  } = useRowActionMenu(items);

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };
  const saving = createMutation.isPending || updateMutation.isPending;

  if (loadingUser) {
    return (
      <ProtectedRoute route="/ponto/empreiteiros">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/empreiteiros">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
              Empreiteiros
            </h1>
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
              Cadastre a mão de obra da obra por contrato e especialidade
            </p>
          </div>

          <Card className={cadastroListClasses.card}>
            <CardHeader className={cadastroListClasses.cardHeader}>
              <div className={cadastroListClasses.cardHeaderRow}>
                <div className={cadastroListClasses.cardHeaderIconRow}>
                  <div className="rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
                    <HardHat className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Empreiteiros
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {items.length} cadastrado(s)
                    </p>
                  </div>
                </div>
                <div className={cadastroListClasses.cardToolbar}>
                  <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      placeholder="Buscar por nome, documento ou contrato..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                    {searchTerm ? (
                      <button
                        type="button"
                        onClick={() => setSearchTerm('')}
                        aria-label="Limpar busca"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                  {canCreate ? (
                    <button
                      type="button"
                      onClick={() => {
                        resetForm();
                        setShowForm(true);
                      }}
                      className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                    >
                      <Plus className="h-4 w-4 shrink-0" />
                      <span>Novo empreiteiro</span>
                    </button>
                  ) : null}
                </div>
              </div>
            </CardHeader>
            <CardContent className={cadastroListClasses.cardContent}>
              {isLoading ? (
                <CadastroListLoading message="Carregando empreiteiros..." />
              ) : items.length === 0 ? (
                <CadastroListEmpty
                  icon={HardHat}
                  title="Nenhum empreiteiro encontrado"
                  hint={
                    searchTerm.trim()
                      ? 'Tente ajustar a busca'
                      : 'Cadastre um novo empreiteiro para começar'
                  }
                />
              ) : (
                <>
                  <CadastroListSummary
                    startItem={1}
                    endItem={items.length}
                    total={items.length}
                    itemLabel="empreiteiro"
                    itemLabelPlural="empreiteiros"
                  />
                  <div className="table-scroll">
                    <table className={cadastroListClasses.table}>
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className={cadastroListClasses.th}>ID</th>
                          <th className={cadastroListClasses.th}>Nome</th>
                          <th className={cadastroListClasses.th}>Telefone</th>
                          <th className={cadastroListClasses.th}>Especialidade</th>
                          <th className={cadastroListClasses.th}>Contrato</th>
                          <th className={cadastroListClasses.thCenter}>Equipe</th>
                          <th className={cadastroListClasses.thCenter}>Ativo</th>
                          {showActions ? (
                            <th className={cadastroListClasses.thRight}>Ação</th>
                          ) : null}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                        {items.map((it, index) => (
                          <tr
                            key={it.id}
                            role="button"
                            tabIndex={0}
                            className={listTableRowClasses.trNavigable}
                            onClick={() => openDetails(it)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                openDetails(it);
                              }
                            }}
                          >
                            <td className={cadastroListClasses.tdMono}>
                              {formatCadastroListId(undefined, index + 1)}
                            </td>
                            <td className="px-3 py-3 sm:px-6 align-middle text-left">
                              <div className="flex items-center gap-3">
                                {resolveApiMediaUrl(it.photoUrl) ? (
                                  <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={resolveApiMediaUrl(it.photoUrl)}
                                      alt=""
                                      className="h-full w-full object-cover"
                                      referrerPolicy="no-referrer"
                                    />
                                  </div>
                                ) : (
                                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500">
                                    <HardHat className="h-5 w-5" />
                                  </div>
                                )}
                                <div className="min-w-0 text-left">
                                  <ListRowNavigableLabel className="truncate font-semibold">
                                    {it.name}
                                  </ListRowNavigableLabel>
                                  <p className="text-xs text-gray-500 dark:text-gray-400">
                                    {formatDocumentDisplay(it.documentKind, it.document)}
                                  </p>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-4 sm:px-6">
                              <span className="text-sm text-gray-900 dark:text-gray-100">
                                {formatPhoneDisplay(it.phone)}
                              </span>
                            </td>
                            <td className="px-3 py-4 sm:px-6">
                              <span className="text-sm text-gray-900 dark:text-gray-100">
                                {it.specialty}
                              </span>
                            </td>
                            <td className="px-3 py-4 sm:px-6">
                              <span className="text-sm text-gray-900 dark:text-gray-100">
                                {it.contratoNome || '—'}
                              </span>
                            </td>
                            <td className="px-3 py-4 text-center sm:px-6">
                              <span className="text-sm text-gray-900 dark:text-gray-100">
                                {(it.teamCount ?? it.team?.length ?? 0) > 0
                                  ? `${it.teamCount ?? it.team?.length} na equipe`
                                  : '—'}
                              </span>
                            </td>
                            <td className="px-3 py-4 text-center sm:px-6">
                              <span
                                className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                                  it.isActive
                                    ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                                }`}
                              >
                                {it.isActive ? 'Sim' : 'Não'}
                              </span>
                            </td>
                            {showActions ? (
                              <RowActionMenuCell
                                isOpen={isRowMenuOpen(it.id)}
                                onToggle={(e) =>
                                  toggleRowActionMenu(it.id, e.currentTarget as HTMLButtonElement)
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
                  onEdit={canEdit ? () => handleEdit(rowForActionMenu) : undefined}
                  onDelete={canDelete ? () => setShowDeleteId(rowForActionMenu.id) : undefined}
                />
              ) : null}
            </CardContent>
          </Card>
        </div>

        {showForm ? (
          <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={requestCloseForm} />
            <div className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-800">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {editingItem ? 'Editar empreiteiro' : 'Novo empreiteiro'}
                </h2>
                <button
                  type="button"
                  onClick={requestCloseForm}
                  className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4 p-6">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Contrato *</label>
                    <StringSingleSelectDropdown
                      value={form.contractId}
                      onChange={(value) => patchForm({ contractId: value })}
                      options={contratoSelectOptions}
                      placeholder="Selecione o contrato"
                      emptyOptionLabel="Selecione o contrato"
                      matchTriggerWidth
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Nome / razão social *</label>
                    <input
                      type="text"
                      required
                      value={form.name}
                      onChange={(e) => patchForm({ name: e.target.value })}
                      placeholder="Ex.: João da Silva MEI"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Nome fantasia</label>
                    <input
                      type="text"
                      value={form.tradeName}
                      onChange={(e) => patchForm({ tradeName: e.target.value })}
                      placeholder="Opcional"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Tipo de documento *</label>
                    <div className="flex h-[42px] items-center gap-4">
                      {(['CPF', 'CNPJ'] as DocumentKind[]).map((kind) => (
                        <label key={kind} className="flex cursor-pointer items-center gap-2 text-sm text-gray-800 dark:text-gray-200">
                          <input
                            type="radio"
                            name="documentKind"
                            checked={form.documentKind === kind}
                            onChange={() =>
                              patchForm({
                                documentKind: kind,
                                document: '',
                              })
                            }
                          />
                          {kind}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>
                      {form.documentKind === 'CNPJ' ? 'CNPJ *' : 'CPF *'}
                    </label>
                    <input
                      type="text"
                      required
                      value={form.document}
                      onChange={(e) =>
                        patchForm({
                          document:
                            form.documentKind === 'CNPJ'
                              ? maskCnpjInput(e.target.value)
                              : formatCpfInput(e.target.value),
                        })
                      }
                      placeholder={
                        form.documentKind === 'CNPJ' ? '00.000.000/0001-00' : '000.000.000-00'
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Telefone / WhatsApp *</label>
                    <input
                      type="text"
                      required
                      value={form.phone}
                      onChange={(e) => patchForm({ phone: maskPhoneInput(e.target.value) })}
                      placeholder="(00) 90000-0000"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Especialidade *</label>
                    <StringSingleSelectDropdown
                      value={form.specialty}
                      onChange={(value) => patchForm({ specialty: value })}
                      options={specialtySelectOptions}
                      placeholder="Selecione a especialidade"
                      emptyOptionLabel="Selecione a especialidade"
                      matchTriggerWidth
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Responsável</label>
                    <input
                      type="text"
                      value={form.contactName}
                      onChange={(e) => patchForm({ contactName: e.target.value })}
                      placeholder="Nome de contato"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>E-mail</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => patchForm({ email: e.target.value })}
                      placeholder="email@exemplo.com"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Cidade</label>
                    <input
                      type="text"
                      value={form.city}
                      onChange={(e) => patchForm({ city: e.target.value })}
                      placeholder="Cidade"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>UF</label>
                    <StringSingleSelectDropdown
                      value={form.state}
                      onChange={(value) => patchForm({ state: value })}
                      options={ufSelectOptions}
                      placeholder="UF"
                      emptyOptionLabel="UF"
                      matchTriggerWidth
                    />
                  </div>
                  <div>
                    <label className={labelClass}>PIX</label>
                    <input
                      type="text"
                      value={form.pixKey}
                      onChange={(e) => patchForm({ pixKey: e.target.value })}
                      placeholder="Chave PIX"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Banco</label>
                    <input
                      type="text"
                      value={form.bank}
                      onChange={(e) => patchForm({ bank: e.target.value })}
                      placeholder="Ex.: Itaú, 341"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Agência</label>
                    <input
                      type="text"
                      value={form.agency}
                      onChange={(e) => patchForm({ agency: e.target.value })}
                      placeholder="Agência"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Conta</label>
                    <input
                      type="text"
                      value={form.account}
                      onChange={(e) => patchForm({ account: e.target.value })}
                      placeholder="Conta com dígito"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Data de início</label>
                    <input
                      type="date"
                      value={form.startDate}
                      onChange={(e) => patchForm({ startDate: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Data de fim</label>
                    <input
                      type="date"
                      value={form.endDate}
                      onChange={(e) => patchForm({ endDate: e.target.value })}
                      className={inputClass}
                    />
                  </div>
                  <div className="flex items-center pt-6">
                    <label className="group flex cursor-pointer items-center gap-3">
                      <div className="relative">
                        <input
                          type="checkbox"
                          checked={form.isActive}
                          onChange={(e) => patchForm({ isActive: e.target.checked })}
                          className="sr-only"
                        />
                        <div
                          className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-all duration-200 ${
                            form.isActive
                              ? 'border-red-600 bg-red-600 dark:border-red-500 dark:bg-red-500'
                              : 'border-gray-300 bg-white group-hover:border-red-500 dark:border-gray-600 dark:bg-gray-800 dark:group-hover:border-red-400'
                          }`}
                        >
                          {form.isActive ? (
                            <svg
                              className="h-3 w-3 text-white"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={3}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          ) : null}
                        </div>
                      </div>
                      <span className="text-sm font-medium text-gray-700 transition-colors group-hover:text-gray-900 dark:text-gray-300 dark:group-hover:text-gray-100">
                        Ativo
                      </span>
                    </label>
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Foto do empreiteiro</label>
                    <VehicleReturnPhotoField
                      value={form.photo}
                      onChange={(value) => patchForm({ photo: value })}
                      emptyLabel="Adicionar foto do empreiteiro"
                      photoAlt="Foto do empreiteiro"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={labelClass}>Notas / comprovantes de pagamento</label>
                    <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                      Recibos e notas do que já foi pago a este empreiteiro
                    </p>
                    <input
                      type="file"
                      accept="image/*,.pdf,.doc,.docx,application/pdf"
                      className="hidden"
                      id="empreiteiro-payment-file"
                      disabled={uploadingFile}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        void uploadPaymentFile(file);
                      }}
                    />
                    <div className="space-y-2">
                      {form.files.map((file, fileIndex) => (
                        <div
                          key={`${file.url}-${fileIndex}`}
                          className="flex items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 dark:border-gray-600 dark:bg-gray-900/60"
                        >
                          <FileText className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
                          <a
                            href={resolveApiMediaUrl(file.url) || file.url}
                            target="_blank"
                            rel="noreferrer"
                            className="min-w-0 flex-1 truncate text-sm text-red-700 hover:underline dark:text-red-300"
                          >
                            {file.name || 'arquivo'}
                          </a>
                          <button
                            type="button"
                            onClick={() => removePaymentFile(fileIndex)}
                            className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                            aria-label="Remover arquivo"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        disabled={uploadingFile}
                        onClick={() =>
                          document.getElementById('empreiteiro-payment-file')?.click()
                        }
                        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                      >
                        <Paperclip className="h-4 w-4" />
                        {uploadingFile ? 'Enviando...' : 'Adicionar arquivo'}
                      </button>
                    </div>
                  </div>
                  <div className="sm:col-span-2 space-y-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Equipe</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Pessoas da turma deste empreiteiro no mesmo contrato
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={addTeamMember}
                        className="inline-flex h-9 items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                      >
                        <Plus className="h-4 w-4" />
                        Adicionar pessoa
                      </button>
                    </div>
                    {form.team.length === 0 ? (
                      <p className="rounded-lg border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
                        Nenhuma pessoa na equipe ainda.
                      </p>
                    ) : (
                      form.team.map((member, index) => (
                        <div
                          key={index}
                          className="space-y-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                              Pessoa {index + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeTeamMember(index)}
                              className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                              aria-label={`Remover pessoa ${index + 1}`}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div>
                              <label className={labelClass}>Nome *</label>
                              <input
                                type="text"
                                value={member.name}
                                onChange={(e) => patchTeamMember(index, { name: e.target.value })}
                                placeholder="Nome completo"
                                className={inputClass}
                              />
                            </div>
                            <div>
                              <label className={labelClass}>Função *</label>
                              <StringSingleSelectDropdown
                                value={member.role}
                                onChange={(value) => patchTeamMember(index, { role: value })}
                                options={teamRoleSelectOptions}
                                placeholder="Selecione a função"
                                emptyOptionLabel="Selecione a função"
                                matchTriggerWidth
                              />
                            </div>
                            <div>
                              <label className={labelClass}>Telefone</label>
                              <input
                                type="text"
                                value={member.phone}
                                onChange={(e) =>
                                  patchTeamMember(index, { phone: maskPhoneInput(e.target.value) })
                                }
                                placeholder="(00) 90000-0000"
                                className={inputClass}
                              />
                            </div>
                            <div>
                              <label className={labelClass}>CPF</label>
                              <input
                                type="text"
                                value={member.document}
                                onChange={(e) =>
                                  patchTeamMember(index, { document: formatCpfInput(e.target.value) })
                                }
                                placeholder="000.000.000-00"
                                className={inputClass}
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className={labelClass}>Foto</label>
                              <VehicleReturnPhotoField
                                value={member.photo}
                                onChange={(value) => patchTeamMember(index, { photo: value })}
                                emptyLabel="Adicionar foto"
                                photoAlt={`Foto de ${member.name || `pessoa ${index + 1}`}`}
                              />
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                <div className="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={requestCloseForm}
                    className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                  >
                    {editingItem ? 'Atualizar' : 'Criar'}
                  </button>
                </div>
              </form>
            </div>
          </AppModalOverlay>
        ) : null}

        {viewingItem ? (
          <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => {
              setPreviewPhoto(null);
              setViewingItem(null);
            }} />
            <div className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-800">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {viewingItem.name}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewPhoto(null);
                    setViewingItem(null);
                  }}
                  className="rounded-lg p-2 text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                  aria-label="Fechar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="space-y-6 p-6">
                <div className="flex flex-wrap items-start gap-4">
                  {resolveApiMediaUrl(viewingItem.photoUrl) ? (
                    <button
                      type="button"
                      onClick={() => openPreviewPhoto(viewingItem.photoUrl, viewingItem.name)}
                      className="rounded-full ring-offset-2 ring-offset-white hover:ring-2 hover:ring-red-500 dark:ring-offset-gray-800"
                      aria-label={`Ver foto de ${viewingItem.name} em tamanho maior`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={resolveApiMediaUrl(viewingItem.photoUrl)}
                        alt={viewingItem.name}
                        className="h-20 w-20 cursor-zoom-in rounded-full object-cover"
                      />
                    </button>
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500">
                      <HardHat className="h-8 w-8" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {viewingItem.name}
                    </p>
                    {viewingItem.tradeName ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {viewingItem.tradeName}
                      </p>
                    ) : null}
                    <span
                      className={`mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                        viewingItem.isActive
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {viewingItem.isActive ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <DetailField label="Contrato" value={viewingItem.contratoNome} />
                  <DetailField label="Especialidade" value={viewingItem.specialty} />
                  <DetailField
                    label="Documento"
                    value={formatDocumentDisplay(viewingItem.documentKind, viewingItem.document)}
                  />
                  <DetailField label="Telefone" value={formatPhoneDisplay(viewingItem.phone)} />
                  <DetailField label="Responsável" value={viewingItem.contactName} />
                  <DetailField label="E-mail" value={viewingItem.email} />
                  <DetailField
                    label="Cidade / UF"
                    value={
                      [viewingItem.city, viewingItem.state].filter(Boolean).join(' / ') || undefined
                    }
                  />
                  <DetailField label="Data de início" value={formatDateBr(viewingItem.startDate)} />
                  <DetailField label="Data de fim" value={formatDateBr(viewingItem.endDate)} />
                  <DetailField label="PIX" value={viewingItem.pixKey} />
                  <DetailField label="Banco" value={viewingItem.bank} />
                  <DetailField label="Agência" value={viewingItem.agency} />
                  <DetailField label="Conta" value={viewingItem.account} />
                </div>

                <div>
                  <p className="mb-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                    Notas / comprovantes de pagamento
                  </p>
                  <p className="mb-2 text-xs text-gray-500 dark:text-gray-400">
                    Recibos e notas do que já foi pago a este empreiteiro
                  </p>
                  <input
                    type="file"
                    accept="image/*,.pdf,.doc,.docx,application/pdf"
                    className="hidden"
                    id="empreiteiro-view-payment-file"
                    disabled={uploadingFile || !canEdit}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      void uploadViewingFile(file);
                    }}
                  />
                  <div className="space-y-2">
                    {(viewingItem.files || []).map((file, fileIndex) => {
                      const href = resolveApiMediaUrl(file.url) || file.url;
                      const image = isImageFile(file);
                      return (
                        <div
                          key={`${file.url}-${fileIndex}`}
                          className="flex items-center gap-2 rounded-lg border border-gray-300 bg-gray-50 px-3 py-2 dark:border-gray-600 dark:bg-gray-900/60"
                        >
                          <FileText className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
                          {image ? (
                            <button
                              type="button"
                              onClick={() => openPreviewPhoto(file.url, file.name || 'Comprovante')}
                              className="min-w-0 flex-1 truncate text-left text-sm text-red-700 hover:underline dark:text-red-300"
                            >
                              {file.name || 'arquivo'}
                            </button>
                          ) : (
                            <a
                              href={href}
                              target="_blank"
                              rel="noreferrer"
                              className="min-w-0 flex-1 truncate text-sm text-red-700 hover:underline dark:text-red-300"
                            >
                              {file.name || 'arquivo'}
                            </a>
                          )}
                          {canEdit ? (
                            <button
                              type="button"
                              onClick={() => void removeViewingFile(fileIndex)}
                              className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                              aria-label="Remover arquivo"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                    {canEdit ? (
                      <button
                        type="button"
                        disabled={uploadingFile}
                        onClick={() =>
                          document.getElementById('empreiteiro-view-payment-file')?.click()
                        }
                        className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                      >
                        <Paperclip className="h-4 w-4" />
                        {uploadingFile ? 'Enviando...' : 'Adicionar arquivo'}
                      </button>
                    ) : (viewingItem.files || []).length === 0 ? (
                      <p className="rounded-lg border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
                        Nenhum comprovante anexado.
                      </p>
                    ) : null}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-medium text-gray-900 dark:text-gray-100">Equipe</p>
                  {(viewingItem.team || []).length === 0 ? (
                    <p className="rounded-lg border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
                      Nenhuma pessoa na equipe.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {(viewingItem.team || []).map((member, index) => (
                        <div
                          key={member.id || index}
                          className="flex items-start gap-3 rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                        >
                          {resolveApiMediaUrl(member.photoUrl) ? (
                            <button
                              type="button"
                              onClick={() => openPreviewPhoto(member.photoUrl, member.name)}
                              className="shrink-0 rounded-full ring-offset-2 ring-offset-white hover:ring-2 hover:ring-red-500 dark:ring-offset-gray-800"
                              aria-label={`Ver foto de ${member.name} em tamanho maior`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={resolveApiMediaUrl(member.photoUrl)}
                                alt={member.name}
                                className="h-12 w-12 cursor-zoom-in rounded-full object-cover"
                              />
                            </button>
                          ) : (
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500">
                              <HardHat className="h-5 w-5" />
                            </div>
                          )}
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {member.name}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{member.role}</p>
                            <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                              {member.phone ? formatPhoneDisplay(member.phone) : '—'}
                              {member.document
                                ? ` · ${formatCpfInput(member.document)}`
                                : ''}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex justify-end gap-3 border-t border-gray-200 p-6 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => {
                    setPreviewPhoto(null);
                    setViewingItem(null);
                  }}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                  Fechar
                </button>
                {canEdit ? (
                  <button
                    type="button"
                    onClick={() => handleEdit(viewingItem)}
                    className="rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700"
                  >
                    Editar
                  </button>
                ) : null}
              </div>
            </div>
          </AppModalOverlay>
        ) : null}

        {previewPhoto && typeof document !== 'undefined'
          ? createPortal(
              <div
                className="fixed inset-0 flex items-center justify-center bg-black/80 p-4"
                style={{ zIndex: Z_LIGHTBOX }}
                role="dialog"
                aria-modal="true"
                aria-label={previewPhoto.alt}
                onClick={() => setPreviewPhoto(null)}
              >
                <button
                  type="button"
                  onClick={() => setPreviewPhoto(null)}
                  className="absolute right-4 top-4 z-10 rounded-full bg-black/50 p-2 text-white transition-colors hover:bg-black/70"
                  aria-label="Fechar foto"
                >
                  <X className="h-[22px] w-[22px]" />
                </button>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewPhoto.url}
                  alt={previewPhoto.alt}
                  className="max-h-[85vh] max-w-[92vw] rounded-2xl object-contain shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>,
              document.body
            )
          : null}

        {showDeleteId ? (
          <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowDeleteId(null)} />
            <div className="relative mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
              <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
                Excluir registro?
              </h3>
              <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                Esta ação não pode ser desfeita.
              </p>
              <div className="flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteId(null)}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => deleteMutation.mutate(showDeleteId)}
                  className="rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700"
                >
                  Excluir
                </button>
              </div>
            </div>
          </AppModalOverlay>
        ) : null}

        {formConfirmUi}
      </MainLayout>
    </ProtectedRoute>
  );
}
