'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  Camera,
  ClipboardList,
  ChevronDown,
  FileText,
  HardHat,
  Link2Off,
  MoreVertical,
  Paperclip,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import {
  CadastroListEmpty,
  CadastroListLoading,
} from '@/components/ui/CadastroListSummary';
import {
  RowActionMenuPortal,
  cadastroListClasses,
} from '@/components/ui/RowActionMenu';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import { useCadastroCrudPermissions } from '@/hooks/useCadastroCrudPermissions';
import { usePermissions } from '@/hooks/usePermissions';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { formatCpfInput, onlyDigits } from '@/lib/cpf';
import {
  formatCurrencyInputBrFromNumber,
  maskCurrencyInputBrOrEmpty,
  parseCurrencyInputBr,
} from '@/lib/maskCurrencyBr';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import { formatDateBr as formatDateBrLib, parseDateSafe } from '@/lib/dateTimeBr';
import { useCostCenters } from '@/hooks/useCostCenters';
import { useModalCloseConfirm } from '@/hooks/useModalCloseConfirm';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { Z_LIGHTBOX } from '@/lib/zIndex';
import { EmpreiteiroDailyMeasurements, ContractFinanceStats } from './EmpreiteiroDailyMeasurements';

type DocumentKind = 'CPF' | 'CNPJ';

type EmpreiteiroContractStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'OVERDUE';

interface PaymentFile {
  url: string;
  name: string;
  key?: string;
}

type InstallmentStatus = 'PENDING' | 'RELEASED' | 'PAID';

interface ServiceInstallment {
  id: string;
  number: number;
  amount: number;
  dueDate?: string | null;
  status: InstallmentStatus | string;
  measurementId?: string | null;
  proofFiles?: PaymentFile[];
}

interface ServiceAddendum {
  id: string;
  number: number;
  reason: string;
  effectiveDate: string;
  amount: number;
  servicesAdded?: string | null;
  servicesRemoved?: string | null;
  files?: PaymentFile[];
  approvedByName?: string | null;
  createdAt?: string;
}

interface EmpreiteiroContractLink {
  id: string;
  empreiteiroId: string;
  name?: string | null;
  description?: string | null;
  plannedValue?: number | null;
  addendaTotal?: number | null;
  currentValue?: number | null;
  location?: string | null;
  contractId?: string | null;
  costCenterId?: string | null;
  costCenter?: { id: string; name: string; code?: string | null } | null;
  startDate?: string | null;
  endDate?: string | null;
  isActive: boolean;
  status?: EmpreiteiroContractStatus | string | null;
  note?: string | null;
  files?: PaymentFile[];
  installments?: ServiceInstallment[];
  installmentsPending?: number;
  installmentsReleased?: number;
  installmentsPaid?: number;
  addenda?: ServiceAddendum[];
  addendaCount?: number;
  contratoNome?: string;
  contractNumber?: string;
  centroCustoNome?: string;
  measurementCount?: number;
  /** Soma das baixas do gestor (independente de parcelas). */
  executedAmountTotal?: number | null;
  /** Equipe deste contrato de serviço. */
  team?: TeamMemberRow[];
  teamCount?: number;
}

function formatMoneyBr(value?: number | null) {
  if (value == null || !Number.isFinite(value)) return null;
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function installmentStatusMeta(status?: string | null) {
  const key = String(status || 'PENDING').toUpperCase();
  if (key === 'PAID') {
    return {
      label: 'Paga',
      className:
        'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
    };
  }
  if (key === 'RELEASED') {
    return {
      label: 'Liberada',
      className: 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-300',
    };
  }
  return {
    label: 'Pendente',
    className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
  };
}

const CONTRACT_STATUS_OPTIONS: Array<{ value: EmpreiteiroContractStatus; label: string }> = [
  { value: 'NOT_STARTED', label: 'Não iniciado' },
  { value: 'IN_PROGRESS', label: 'Em andamento' },
  { value: 'COMPLETED', label: 'Concluído' },
  { value: 'CANCELLED', label: 'Cancelado' },
  { value: 'OVERDUE', label: 'Em atraso' },
];

function contractStatusMeta(status?: string | null) {
  const key = String(status || 'IN_PROGRESS').toUpperCase();
  if (key === 'NOT_STARTED') {
    return {
      label: 'Não iniciado',
      className:
        'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
    };
  }
  if (key === 'COMPLETED') {
    return {
      label: 'Concluído',
      className:
        'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300',
    };
  }
  if (key === 'CANCELLED') {
    return {
      label: 'Cancelado',
      className: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
    };
  }
  if (key === 'OVERDUE') {
    return {
      label: 'Em atraso',
      className: 'bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-300',
    };
  }
  return {
    label: 'Em andamento',
    className: 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300',
  };
}

interface EmpreiteiroRow {
  id: string;
  name: string;
  tradeName?: string | null;
  documentKind: DocumentKind | string;
  document: string;
  cpf?: string | null;
  cnpj?: string | null;
  phone: string;
  specialty: string;
  contractId: string;
  contratoNome?: string;
  centroCustoNome?: string;
  contract?: {
    id: string;
    name: string;
    number?: string;
    costCenter?: { id: string; name: string } | null;
  } | null;
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
  userId?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  contracts?: EmpreiteiroContractLink[];
  contractsCount?: number;
}

interface TeamMemberRow {
  id?: string;
  name: string;
  role: string;
  phone?: string | null;
  document?: string | null;
  photoUrl?: string | null;
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

function empreiteiroCpfDigits(item: Pick<EmpreiteiroRow, 'cpf' | 'documentKind' | 'document'>): string {
  const fromField = onlyDigits(item.cpf || '');
  if (fromField.length === 11) return fromField;
  if (item.documentKind === 'CPF') return onlyDigits(item.document).slice(0, 11);
  return '';
}

function empreiteiroCnpjDigits(item: Pick<EmpreiteiroRow, 'cnpj' | 'documentKind' | 'document'>): string {
  const fromField = onlyDigits(item.cnpj || '');
  if (fromField.length === 14) return fromField;
  if (item.documentKind === 'CNPJ' || onlyDigits(item.document).length === 14) {
    return onlyDigits(item.document).slice(0, 14);
  }
  return '';
}

function formatEmpreiteiroDocs(item: Pick<EmpreiteiroRow, 'cpf' | 'cnpj' | 'documentKind' | 'document'>): string {
  const parts: string[] = [];
  const cpf = empreiteiroCpfDigits(item);
  const cnpj = empreiteiroCnpjDigits(item);
  if (cpf) parts.push(formatCpfInput(cpf));
  if (cnpj) parts.push(maskCnpjInput(cnpj));
  return parts.join(' · ') || '—';
}

function formatPhoneDisplay(phone: string): string {
  const digits = onlyDigits(phone);
  return digits ? maskPhoneInput(digits) : '—';
}

/** YYYY-MM-DD do calendário (não usa toISOString — evita -1 dia no BR). */
function toDateInputValue(value?: string | null): string {
  if (!value) return '';
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const d = parseDateSafe(value);
  if (!d) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function formatDateBr(value?: string | null): string {
  return formatDateBrLib(value, '—');
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

function teamDraftFromMembers(members?: TeamMemberRow[] | null): TeamMemberForm[] {
  return (members || []).map((member) => ({
    name: member.name || '',
    role: member.role || '',
    phone: member.phone ? maskPhoneInput(member.phone) : '',
    document: member.document ? formatCpfInput(member.document) : '',
    photo: resolveApiMediaUrl(member.photoUrl) || member.photoUrl || '',
  }));
}

function teamDraftsFromContracts(
  contracts?: EmpreiteiroContractLink[] | null
): Record<string, TeamMemberForm[]> {
  const map: Record<string, TeamMemberForm[]> = {};
  for (const link of contracts || []) {
    map[link.id] = teamDraftFromMembers(link.team);
  }
  return map;
}

const emptyForm = {
  userId: '',
  name: '',
  tradeName: '',
  cpf: '',
  cnpj: '',
  phone: '',
  specialty: '',
  costCenterId: '',
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

type LinkableLogin = {
  id: string;
  name: string;
  email: string;
  cpf?: string | null;
  linkedEmpreiteiroId?: string | null;
};

const inputClass =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100';
const labelClass = 'mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300';

function TeamMemberPhotoField({
  value,
  onChange,
  alt,
}: {
  value: string;
  onChange: (value: string) => void;
  alt: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const handleFile = async (file: File | null | undefined) => {
    if (!file) return;
    setLoading(true);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Não foi possível ler a foto'));
        reader.readAsDataURL(file);
      });
      onChange(dataUrl);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative h-14 w-14 shrink-0">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        disabled={loading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          void handleFile(file);
        }}
      />
      <button
        type="button"
        disabled={loading}
        onClick={() => inputRef.current?.click()}
        className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-red-50 text-red-600 ring-1 ring-black/5 transition hover:bg-red-100 disabled:opacity-60 dark:bg-red-950/50 dark:text-red-300"
        aria-label={value ? 'Trocar foto' : 'Adicionar foto'}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt={alt} className="h-full w-full object-cover" />
        ) : (
          <Camera className="h-5 w-5" />
        )}
      </button>
      {value ? (
        <button
          type="button"
          onClick={() => onChange('')}
          className="absolute -right-1 -top-1 rounded-full bg-gray-900 p-0.5 text-white shadow dark:bg-gray-100 dark:text-gray-900"
          aria-label="Remover foto"
        >
          <X className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
}

export default function EmpreiteirosPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const crud = useCadastroCrudPermissions('/ponto/empreiteiros');
  const { isLinkedEmpreiteiro, canApproveEmpreiteiroDaily } = usePermissions();
  const { costCenters } = useCostCenters();
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [viewingItem, setViewingItem] = useState<EmpreiteiroRow | null>(null);
  const [pageSection, setPageSection] = useState<
    'cadastro' | 'medicao' | 'detalhe'
  >('cadastro');
  const [medicaoEmpreitaId, setMedicaoEmpreitaId] = useState<string | null>(null);
  const [medicaoContractFilterId, setMedicaoContractFilterId] = useState<string | null>(null);
  const [previewPhoto, setPreviewPhoto] = useState<{ url: string; alt: string } | null>(null);
  const [editingItem, setEditingItem] = useState<EmpreiteiroRow | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [showDeleteId, setShowDeleteId] = useState<string | null>(null);
  const [showUnlinkId, setShowUnlinkId] = useState<string | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [addingContract, setAddingContract] = useState(false);
  const [newServiceName, setNewServiceName] = useState('');
  const [newServiceDescription, setNewServiceDescription] = useState('');
  const [newServicePlannedValue, setNewServicePlannedValue] = useState('');
  const [newServiceLocation, setNewServiceLocation] = useState('');
  /** avista = 1 parcela · parcelado = N parcelas · null = não informar agora */
  const [newServicePayMode, setNewServicePayMode] = useState<'avista' | 'parcelado' | null>(null);
  const [newServiceParcelCount, setNewServiceParcelCount] = useState('6');
  const [newServiceParcelAmounts, setNewServiceParcelAmounts] = useState<string[]>([]);
  const [newServiceFiles, setNewServiceFiles] = useState<PaymentFile[]>([]);
  const [newServiceCostCenterId, setNewServiceCostCenterId] = useState('');
  const [newContractStart, setNewContractStart] = useState('');
  const [newContractEnd, setNewContractEnd] = useState('');
  const [newContractStatus, setNewContractStatus] =
    useState<EmpreiteiroContractStatus>('IN_PROGRESS');
  const [savingContractLink, setSavingContractLink] = useState(false);
  const [addingAddendumForId, setAddingAddendumForId] = useState<string | null>(null);
  const [addendumReason, setAddendumReason] = useState('');
  const [addendumAmount, setAddendumAmount] = useState('');
  const [addendumDate, setAddendumDate] = useState('');
  const [addendumServicesAdded, setAddendumServicesAdded] = useState('');
  const [addendumServicesRemoved, setAddendumServicesRemoved] = useState('');
  const [addendumApprovedBy, setAddendumApprovedBy] = useState('');
  const [addendumFiles, setAddendumFiles] = useState<PaymentFile[]>([]);
  const [addendumCreateParcel, setAddendumCreateParcel] = useState(true);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [editServiceName, setEditServiceName] = useState('');
  const [editServiceDescription, setEditServiceDescription] = useState('');
  const [editServicePlannedValue, setEditServicePlannedValue] = useState('');
  const [editServiceLocation, setEditServiceLocation] = useState('');
  const [editServiceCostCenterId, setEditServiceCostCenterId] = useState('');
  const [editServiceStart, setEditServiceStart] = useState('');
  const [editServiceEnd, setEditServiceEnd] = useState('');
  const [editServiceStatus, setEditServiceStatus] =
    useState<EmpreiteiroContractStatus>('IN_PROGRESS');
  const [editServicePayMode, setEditServicePayMode] = useState<'avista' | 'parcelado' | null>(
    null
  );
  const [editServiceParcelCount, setEditServiceParcelCount] = useState('6');
  const [editServiceParcelAmounts, setEditServiceParcelAmounts] = useState<string[]>([]);
  const [editServicePayLocked, setEditServicePayLocked] = useState(false);

  const buildEqualParcelAmountInputs = (total: number | null, count: number): string[] => {
    if (!Number.isFinite(count) || count < 1) return [];
    if (!(total != null && total > 0)) return Array.from({ length: count }, () => '');
    const cents = Math.round(total * 100);
    const base = Math.floor(cents / count);
    const remainder = cents - base * count;
    return Array.from({ length: count }, (_, i) =>
      formatCurrencyInputBrFromNumber((base + (i < remainder ? 1 : 0)) / 100)
    );
  };

  /** Ao editar uma parcela, redistribui o restante do planejado nas outras. */
  const redistributeParcelAmounts = (
    current: string[],
    editedIndex: number,
    rawValue: string,
    plannedTotal: number | null
  ): string[] => {
    const count = current.length;
    if (count < 1) return current;
    const next = [...current];
    next[editedIndex] = maskCurrencyInputBrOrEmpty(rawValue);
    if (!(plannedTotal != null && plannedTotal > 0) || count === 1) return next;

    const edited = parseCurrencyInputBr(next[editedIndex]) || 0;
    const others = count - 1;
    const remainingCents = Math.max(0, Math.round(plannedTotal * 100) - Math.round(edited * 100));
    const base = Math.floor(remainingCents / others);
    let leftover = remainingCents - base * others;
    for (let i = 0; i < count; i += 1) {
      if (i === editedIndex) continue;
      const extra = leftover > 0 ? 1 : 0;
      if (leftover > 0) leftover -= 1;
      next[i] = formatCurrencyInputBrFromNumber((base + extra) / 100);
    }
    return next;
  };

  const parseParcelAmountInputs = (inputs: string[]) => {
    const amounts: number[] = [];
    for (let i = 0; i < inputs.length; i += 1) {
      const n = parseCurrencyInputBr(inputs[i] || '');
      if (n == null || n <= 0) {
        return { error: `Informe o valor da parcela ${i + 1}`, amounts: [] as number[] };
      }
      amounts.push(n);
    }
    return { error: null as string | null, amounts };
  };

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

  const ownEmpreiteiroId = userData?.data?.empreiteiro?.id as string | undefined;
  const isOwnEmpreiteiroAccount = isLinkedEmpreiteiro;
  /** Gennesis (não o próprio empreiteiro) cadastra/completa a empreita nesta página. */
  const canCreate = crud.canCreate && !isLinkedEmpreiteiro;
  const canManageCadastro = crud.canEdit && !isLinkedEmpreiteiro;
  const canDelete = crud.canDelete && !isLinkedEmpreiteiro;
  const canEditDaily = Boolean(ownEmpreiteiroId) && (crud.canEdit || isLinkedEmpreiteiro);
  const canApproveDaily = !isOwnEmpreiteiroAccount && canApproveEmpreiteiroDaily;
  const showActions = canManageCadastro || canDelete;
  /** Rascunho de equipe por id do contrato de serviço. */
  const [contractTeamDraftById, setContractTeamDraftById] = useState<
    Record<string, TeamMemberForm[]>
  >({});
  const [savingTeamLinkId, setSavingTeamLinkId] = useState<string | null>(null);
  const [openTeamLinkIds, setOpenTeamLinkIds] = useState<Record<string, boolean>>({});
  const [openParcelLinkIds, setOpenParcelLinkIds] = useState<Record<string, boolean>>({});
  const [openServiceDetailIds, setOpenServiceDetailIds] = useState<Record<string, boolean>>({});
  /** Evita reabrir o detalhe automaticamente após o empreiteiro clicar em Voltar. */
  const [empSkipAutoDetail, setEmpSkipAutoDetail] = useState(false);

  const { data: listData, isLoading } = useQuery({
    queryKey: ['empreiteiros', searchTerm],
    queryFn: async () => {
      const res = await api.get('/empreiteiros', {
        params: { search: searchTerm || undefined, limit: 500 },
      });
      return res.data;
    },
  });

  const { data: linkableUsersData } = useQuery({
    queryKey: ['empreiteiros-linkable-users', editingItem?.id || 'new', showForm],
    queryFn: async () => {
      const res = await api.get('/empreiteiros/linkable-users', {
        params: editingItem?.id ? { empreiteiroId: editingItem.id } : undefined,
      });
      return (res.data?.data || []) as LinkableLogin[];
    },
    enabled: showForm && (canCreate || canManageCadastro),
  });

  const linkableLoginOptions = useMemo(
    () =>
      labeledToSelectOptions(
        (linkableUsersData || []).map((u) => ({
          value: u.id,
          label: `${u.name}${u.email ? ` · ${u.email}` : ''}`,
        }))
      ),
    [linkableUsersData]
  );

  const costCenterSelectOptions = useMemo(
    () =>
      labeledToSelectOptions(
        costCenters
          .filter((cc) => cc.id && (cc.name || cc.code))
          .map((cc) => ({
            value: cc.id as string,
            label: cc.name || String(cc.code || ''),
          }))
      ),
    [costCenters]
  );

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

  const openCreateForm = () => {
    if (!canCreate) {
      toast.error('Você não tem permissão para cadastrar empreita.');
      return;
    }
    setPreviewPhoto(null);
    setViewingItem(null);
    setPageSection('cadastro');
    resetForm();
    setShowForm(true);
  };

  const patchForm = (partial: Partial<typeof emptyForm>) => {
    setForm((prev) => ({ ...prev, ...partial }));
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
      toast.success('Empreita salva com sucesso!');
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
      toast.success('Empreita atualizada!');
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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['empreiteiros'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      setShowDeleteId(null);
      toast.success(data?.message || 'Cadastro da empreita excluído. O login foi mantido.');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao excluir');
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/empreiteiros/${id}/unlink`);
      return res.data;
    },
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: ['empreiteiros'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      setShowUnlinkId(null);
      setViewingItem((prev) => {
        if (prev?.id === id) {
          setPageSection('cadastro');
          return null;
        }
        return prev;
      });
      toast.success(
        data?.message ||
          'Empreita encerrada. O login permanece ativo para vincular a outra empreita.'
      );
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Não foi possível encerrar a empreita');
    },
  });

  const closeDetails = () => {
    if (isOwnEmpreiteiroAccount) setEmpSkipAutoDetail(true);
    setPreviewPhoto(null);
    setViewingItem(null);
    setEditingServiceId(null);
    setAddingContract(false);
    setAddingAddendumForId(null);
    setPageSection('cadastro');
  };

  const openDetails = (item: EmpreiteiroRow) => {
    setEmpSkipAutoDetail(false);
    setPageSection('detalhe');
    setViewingItem(item);
    setContractTeamDraftById(teamDraftsFromContracts(item.contracts));
    setAddingContract(false);
    setEditingServiceId(null);
    setAddingAddendumForId(null);
    setNewServiceName('');
    setNewServiceDescription('');
    setNewServicePlannedValue('');
    setNewServiceLocation('');
    setNewServicePayMode(null);
    setNewServiceParcelCount('6');
    setNewServiceParcelAmounts([]);
    setNewServiceFiles([]);
    setNewContractStart('');
    setNewContractEnd('');
    setNewContractStatus('IN_PROGRESS');
    void api
      .get(`/empreiteiros/${item.id}`)
      .then((res) => {
        const data = res.data?.data as EmpreiteiroRow | undefined;
        if (data?.id) {
          setViewingItem(data);
          setContractTeamDraftById(teamDraftsFromContracts(data.contracts));
        }
      })
      .catch(() => undefined);
  };

  const handleAddContractLink = async () => {
    const name = newServiceName.trim();
    if (!viewingItem?.id || !name) {
      toast.error('Informe o nome do contrato de serviço');
      return;
    }
    if (!newServiceCostCenterId.trim()) {
      toast.error('Selecione o centro de custo do serviço');
      return;
    }
    if (newContractStart && newContractEnd && newContractEnd < newContractStart) {
      toast.error('A data de fim não pode ser anterior à de início');
      return;
    }
    const plannedValue = parseCurrencyInputBr(newServicePlannedValue);
    if (newServicePlannedValue.trim() && (plannedValue == null || plannedValue < 0)) {
      toast.error('Valor planejado inválido');
      return;
    }
    let parcelCount: number | undefined;
    let installments:
      | Array<{ number: number; amount: number; status: 'PENDING' }>
      | undefined;
    if (newServicePayMode === 'avista') {
      parcelCount = 1;
    } else if (newServicePayMode === 'parcelado') {
      const n = Math.floor(Number(newServiceParcelCount.trim()));
      if (!Number.isFinite(n) || n < 2 || n > 60) {
        toast.error('No parcelado, informe de 2 a 60 parcelas');
        return;
      }
      parcelCount = n;
      const parsed = parseParcelAmountInputs(
        newServiceParcelAmounts.length === n
          ? newServiceParcelAmounts
          : buildEqualParcelAmountInputs(plannedValue, n)
      );
      if (parsed.error) {
        toast.error(parsed.error);
        return;
      }
      const sum = parsed.amounts.reduce((a, b) => a + b, 0);
      if (plannedValue != null && Math.abs(sum - plannedValue) > 0.009) {
        toast.error(
          `A soma das parcelas (${formatMoneyBr(sum)}) deve ser igual ao valor planejado (${formatMoneyBr(plannedValue)})`
        );
        return;
      }
      installments = parsed.amounts.map((amount, index) => ({
        number: index + 1,
        amount,
        status: 'PENDING' as const,
      }));
    }
    if (parcelCount && !(plannedValue && plannedValue > 0)) {
      toast.error('Informe o valor planejado para gerar o pagamento');
      return;
    }
    setSavingContractLink(true);
    try {
      const res = await api.post(`/empreiteiros/${viewingItem.id}/contracts`, {
        name,
        description: newServiceDescription.trim() || null,
        plannedValue,
        location: newServiceLocation.trim() || null,
        parcelCount,
        ...(installments ? { installments } : {}),
        costCenterId: newServiceCostCenterId || null,
        startDate: newContractStart || null,
        endDate: newContractEnd || null,
        status: newContractStatus,
        files: newServiceFiles,
      });
      const data = res.data?.data as EmpreiteiroRow | undefined;
      if (data?.id) {
        setViewingItem(data);
        setContractTeamDraftById((prev) => ({
          ...prev,
          ...teamDraftsFromContracts(data.contracts),
        }));
        queryClient.invalidateQueries({ queryKey: ['empreiteiros'] });
      }
      setAddingContract(false);
      setNewServiceName('');
      setNewServiceDescription('');
      setNewServicePlannedValue('');
      setNewServiceLocation('');
      setNewServiceCostCenterId('');
      setNewServicePayMode(null);
      setNewServiceParcelCount('6');
      setNewServiceParcelAmounts([]);
      setNewServiceFiles([]);
      setNewContractStart('');
      setNewContractEnd('');
      setNewContractStatus('IN_PROGRESS');
      toast.success(res.data?.message || 'Contrato de serviço criado');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Não foi possível criar o contrato de serviço');
    } finally {
      setSavingContractLink(false);
    }
  };

  const handleReleaseInstallment = async (linkId: string, installmentId: string) => {
    if (!viewingItem?.id || !canManageCadastro) return;
    setSavingContractLink(true);
    try {
      const res = await api.patch(
        `/empreiteiros/${viewingItem.id}/contracts/${linkId}/installments/${installmentId}`,
        { status: 'RELEASED' }
      );
      const row = res.data?.data as EmpreiteiroRow | undefined;
      if (row?.id) {
        setViewingItem(row);
        queryClient.invalidateQueries({ queryKey: ['empreiteiros'] });
      }
      toast.success(res.data?.message || 'Parcela liberada para pagamento');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Não foi possível liberar a parcela');
    } finally {
      setSavingContractLink(false);
    }
  };

  const handleAttachInstallmentProof = async (
    linkId: string,
    installmentId: string,
    file: File | null | undefined
  ) => {
    if (!viewingItem?.id || !file || !canManageCadastro) return;
    setUploadingFile(true);
    setSavingContractLink(true);
    try {
      const data = new FormData();
      data.append('file', file);
      const uploadRes = await api.post('/empreiteiros/upload-file', data);
      const uploaded = uploadRes.data?.data as
        | { url?: string; name?: string; key?: string }
        | undefined;
      if (!uploaded?.url) throw new Error('Upload sem URL');
      const res = await api.patch(
        `/empreiteiros/${viewingItem.id}/contracts/${linkId}/installments/${installmentId}`,
        {
          status: 'PAID',
          proofFiles: [
            {
              url: uploaded.url,
              name: uploaded.name || file.name,
              key: uploaded.key,
            },
          ],
        }
      );
      const row = res.data?.data as EmpreiteiroRow | undefined;
      if (row?.id) {
        setViewingItem(row);
        queryClient.invalidateQueries({ queryKey: ['empreiteiros'] });
      }
      toast.success(res.data?.message || 'Comprovante anexado · parcela paga');
    } catch (error: any) {
      toast.error(
        error.response?.data?.message || error.message || 'Não foi possível anexar o comprovante'
      );
    } finally {
      setUploadingFile(false);
      setSavingContractLink(false);
    }
  };

  const resetAddendumForm = () => {
    setAddingAddendumForId(null);
    setAddendumReason('');
    setAddendumAmount('');
    setAddendumDate('');
    setAddendumServicesAdded('');
    setAddendumServicesRemoved('');
    setAddendumApprovedBy('');
    setAddendumFiles([]);
    setAddendumCreateParcel(true);
  };

  const uploadAddendumFile = async (file: File | null | undefined) => {
    if (!file) return;
    setUploadingFile(true);
    try {
      const data = new FormData();
      data.append('file', file);
      const res = await api.post('/empreiteiros/upload-file', data);
      const uploaded = res.data?.data as { url?: string; name?: string; key?: string } | undefined;
      if (!uploaded?.url) throw new Error('Upload sem URL');
      setAddendumFiles((prev) => [
        ...prev,
        {
          url: uploaded.url as string,
          name: uploaded.name || file.name,
          key: uploaded.key,
        },
      ]);
      toast.success('Documento anexado');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Falha no upload do documento');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleAddAddendum = async (linkId: string) => {
    if (!viewingItem?.id) return;
    const reason = addendumReason.trim();
    if (!reason) {
      toast.error('Informe o motivo do aditivo');
      return;
    }
    let amountRaw = addendumAmount.trim().replace(/R\$\s?/gi, '');
    const sign = amountRaw.startsWith('-') ? -1 : 1;
    if (amountRaw.startsWith('-') || amountRaw.startsWith('+')) amountRaw = amountRaw.slice(1).trim();
    if (amountRaw.includes(',')) amountRaw = amountRaw.replace(/\./g, '').replace(',', '.');
    const amount = sign * Number(amountRaw);
    if (!Number.isFinite(amount) || amount === 0) {
      toast.error('Informe o valor do aditivo (diferente de zero)');
      return;
    }
    setSavingContractLink(true);
    try {
      const res = await api.post(`/empreiteiros/${viewingItem.id}/contracts/${linkId}/addenda`, {
        reason,
        amount,
        effectiveDate: addendumDate || null,
        servicesAdded: addendumServicesAdded.trim() || null,
        servicesRemoved: addendumServicesRemoved.trim() || null,
        approvedByName: addendumApprovedBy.trim() || null,
        files: addendumFiles,
        createInstallment: amount > 0 && addendumCreateParcel,
      });
      const data = res.data?.data as EmpreiteiroRow | undefined;
      if (data?.id) {
        setViewingItem(data);
        queryClient.invalidateQueries({ queryKey: ['empreiteiros'] });
      }
      resetAddendumForm();
      toast.success(res.data?.message || 'Aditivo lançado');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Não foi possível lançar o aditivo');
    } finally {
      setSavingContractLink(false);
    }
  };

  const handleDeleteAddendum = async (linkId: string, addendumId: string) => {
    if (!viewingItem?.id) return;
    if (!window.confirm('Excluir este aditivo? Só o último do histórico pode ser removido.')) {
      return;
    }
    setSavingContractLink(true);
    try {
      const res = await api.delete(
        `/empreiteiros/${viewingItem.id}/contracts/${linkId}/addenda/${addendumId}`
      );
      const data = res.data?.data as EmpreiteiroRow | undefined;
      if (data?.id) {
        setViewingItem(data);
        queryClient.invalidateQueries({ queryKey: ['empreiteiros'] });
      }
      toast.success(res.data?.message || 'Aditivo removido');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Não foi possível remover o aditivo');
    } finally {
      setSavingContractLink(false);
    }
  };

  const handleEndContractLink = async (
    linkId: string,
    status: 'COMPLETED' | 'CANCELLED' = 'COMPLETED'
  ) => {
    if (!viewingItem?.id || linkId.startsWith('legacy-')) {
      toast.error('Salve o cadastro antes de alterar este vínculo');
      return;
    }
    setSavingContractLink(true);
    try {
      const res = await api.post(`/empreiteiros/${viewingItem.id}/contracts/${linkId}/end`, {
        status,
      });
      const data = res.data?.data as EmpreiteiroRow | undefined;
      if (data?.id) {
        setViewingItem(data);
        queryClient.invalidateQueries({ queryKey: ['empreiteiros'] });
      }
      toast.success(res.data?.message || 'Contrato atualizado');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Não foi possível atualizar o contrato');
    } finally {
      setSavingContractLink(false);
    }
  };

  const handleDeleteContractLink = async (link: EmpreiteiroContractLink) => {
    if (!viewingItem?.id) return;
    const label = link.contratoNome || link.name || 'este contrato de serviço';
    const count = link.measurementCount ?? 0;
    const ok = window.confirm(
      count > 0
        ? `Excluir "${label}" e as ${count} medição(ões) ligadas a ele? Esta ação não pode ser desfeita.`
        : `Excluir "${label}"? Esta ação não pode ser desfeita.`
    );
    if (!ok) return;
    setSavingContractLink(true);
    try {
      const res = await api.delete(`/empreiteiros/${viewingItem.id}/contracts/${link.id}`);
      const data = res.data?.data as EmpreiteiroRow | undefined;
      if (data?.id) {
        setViewingItem(data);
        queryClient.invalidateQueries({ queryKey: ['empreiteiros'] });
      }
      if (editingServiceId === link.id) setEditingServiceId(null);
      toast.success(res.data?.message || 'Contrato de serviço excluído');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Não foi possível excluir o contrato');
    } finally {
      setSavingContractLink(false);
    }
  };

  const paymentLabelForLink = (link: EmpreiteiroContractLink) => {
    const n = link.installments?.length || 0;
    if (n === 1) return 'À vista';
    if (n > 1) return `Parcelado · ${n}x`;
    return 'Sem parcelas';
  };

  const openEditService = (link: EmpreiteiroContractLink) => {
    setAddingContract(false);
    setEditingServiceId(link.id);
    setEditServiceName(link.contratoNome || link.name || '');
    setEditServiceDescription(link.description || '');
    setEditServicePlannedValue(
      link.plannedValue != null && Number.isFinite(link.plannedValue)
        ? formatCurrencyInputBrFromNumber(link.plannedValue)
        : ''
    );
    setEditServiceLocation(link.location || '');
    setEditServiceCostCenterId(link.costCenterId || link.costCenter?.id || '');
    setEditServiceStart(toDateInputValue(link.startDate));
    setEditServiceEnd(toDateInputValue(link.endDate));
    setEditServiceStatus(
      (String(link.status || 'IN_PROGRESS').toUpperCase() as EmpreiteiroContractStatus) ||
        'IN_PROGRESS'
    );
    const n = link.installments?.length || 0;
    if (n === 1) {
      setEditServicePayMode('avista');
      setEditServiceParcelCount('6');
      setEditServiceParcelAmounts([]);
    } else if (n > 1) {
      setEditServicePayMode('parcelado');
      setEditServiceParcelCount(String(n));
      setEditServiceParcelAmounts(
        (link.installments || []).map((p) =>
          formatCurrencyInputBrFromNumber(Number(p.amount) || 0)
        )
      );
    } else {
      setEditServicePayMode(null);
      setEditServiceParcelCount('6');
      setEditServiceParcelAmounts([]);
    }
    // Só trava se já houver parcela paga; liberada ainda permite corrigir para à vista.
    setEditServicePayLocked(
      (link.installments || []).some((p) => String(p.status || '').toUpperCase() === 'PAID')
    );
  };

  const handleUpdateContractLink = async () => {
    if (!viewingItem?.id || !editingServiceId) return;
    const name = editServiceName.trim();
    if (!name) {
      toast.error('Informe o nome do contrato de serviço');
      return;
    }
    if (!editServiceCostCenterId.trim()) {
      toast.error('Selecione o centro de custo do serviço');
      return;
    }
    if (editServiceStart && editServiceEnd && editServiceEnd < editServiceStart) {
      toast.error('A data de fim não pode ser anterior à de início');
      return;
    }
    const plannedValue = parseCurrencyInputBr(editServicePlannedValue);
    if (editServicePlannedValue.trim() && (plannedValue == null || plannedValue < 0)) {
      toast.error('Valor planejado inválido');
      return;
    }

    let parcelCount: number | undefined;
    let installments:
      | Array<{ number: number; amount: number; status: 'PENDING' }>
      | undefined;
    if (!editServicePayLocked) {
      if (editServicePayMode === 'avista') {
        parcelCount = 1;
      } else if (editServicePayMode === 'parcelado') {
        const n = Math.floor(Number(editServiceParcelCount.trim()));
        if (!Number.isFinite(n) || n < 2 || n > 60) {
          toast.error('No parcelado, informe de 2 a 60 parcelas');
          return;
        }
        parcelCount = n;
        const parsed = parseParcelAmountInputs(
          editServiceParcelAmounts.length === n
            ? editServiceParcelAmounts
            : buildEqualParcelAmountInputs(plannedValue, n)
        );
        if (parsed.error) {
          toast.error(parsed.error);
          return;
        }
        const sum = parsed.amounts.reduce((a, b) => a + b, 0);
        if (plannedValue != null && Math.abs(sum - plannedValue) > 0.009) {
          toast.error(
            `A soma das parcelas (${formatMoneyBr(sum)}) deve ser igual ao valor planejado (${formatMoneyBr(plannedValue)})`
          );
          return;
        }
        installments = parsed.amounts.map((amount, index) => ({
          number: index + 1,
          amount,
          status: 'PENDING' as const,
        }));
      } else {
        parcelCount = 0;
      }
      if (parcelCount > 0 && !(plannedValue && plannedValue > 0)) {
        toast.error('Informe o valor planejado para gerar o pagamento');
        return;
      }
    }

    setSavingContractLink(true);
    try {
      const res = await api.patch(
        `/empreiteiros/${viewingItem.id}/contracts/${editingServiceId}`,
        {
          name,
          description: editServiceDescription.trim() || null,
          plannedValue,
          location: editServiceLocation.trim() || null,
          costCenterId: editServiceCostCenterId || null,
          startDate: editServiceStart || null,
          endDate: editServiceEnd || null,
          status: editServiceStatus,
          ...(parcelCount !== undefined ? { parcelCount } : {}),
          ...(installments ? { installments } : {}),
        }
      );
      const data = res.data?.data as EmpreiteiroRow | undefined;
      if (data?.id) {
        setViewingItem(data);
        queryClient.invalidateQueries({ queryKey: ['empreiteiros'] });
      }
      setEditingServiceId(null);
      toast.success(res.data?.message || 'Contrato de serviço atualizado');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Não foi possível atualizar o contrato');
    } finally {
      setSavingContractLink(false);
    }
  };

  const handleUpdateContractStatus = async (
    linkId: string,
    status: EmpreiteiroContractStatus
  ) => {
    if (!viewingItem?.id || linkId.startsWith('legacy-')) {
      toast.error('Salve o cadastro antes de alterar este vínculo');
      return;
    }
    if (status === 'COMPLETED' || status === 'CANCELLED') {
      await handleEndContractLink(linkId, status);
      return;
    }
    setSavingContractLink(true);
    try {
      const res = await api.patch(`/empreiteiros/${viewingItem.id}/contracts/${linkId}`, {
        status,
      });
      const data = res.data?.data as EmpreiteiroRow | undefined;
      if (data?.id) {
        setViewingItem(data);
        queryClient.invalidateQueries({ queryKey: ['empreiteiros'] });
      }
      toast.success(res.data?.message || 'Status atualizado');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Não foi possível atualizar o status');
    } finally {
      setSavingContractLink(false);
    }
  };

  const uploadNewServiceFile = async (file: File | null | undefined) => {
    if (!file) return;
    setUploadingFile(true);
    try {
      const data = new FormData();
      data.append('file', file);
      const res = await api.post('/empreiteiros/upload-file', data);
      const uploaded = res.data?.data as { url?: string; name?: string; key?: string } | undefined;
      if (!uploaded?.url) throw new Error('Upload sem URL');
      setNewServiceFiles((prev) => [
        ...prev,
        {
          url: uploaded.url as string,
          name: uploaded.name || file.name,
          key: uploaded.key,
        },
      ]);
      toast.success('Contrato anexado');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Falha no upload do contrato');
    } finally {
      setUploadingFile(false);
    }
  };

  const persistServiceContractFiles = async (linkId: string, files: PaymentFile[]) => {
    if (!viewingItem?.id || linkId.startsWith('legacy-')) {
      toast.error('Salve o cadastro antes de anexar o contrato');
      return;
    }
    setSavingContractLink(true);
    try {
      const res = await api.patch(`/empreiteiros/${viewingItem.id}/contracts/${linkId}`, {
        files,
      });
      const data = res.data?.data as EmpreiteiroRow | undefined;
      if (data?.id) {
        setViewingItem(data);
        queryClient.invalidateQueries({ queryKey: ['empreiteiros'] });
      }
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Não foi possível atualizar o anexo');
      throw error;
    } finally {
      setSavingContractLink(false);
    }
  };

  const uploadServiceContractFile = async (
    linkId: string,
    currentFiles: PaymentFile[] | undefined,
    file: File | null | undefined
  ) => {
    if (!file || !canManageCadastro) return;
    setUploadingFile(true);
    try {
      const data = new FormData();
      data.append('file', file);
      const res = await api.post('/empreiteiros/upload-file', data);
      const uploaded = res.data?.data as { url?: string; name?: string; key?: string } | undefined;
      if (!uploaded?.url) throw new Error('Upload sem URL');
      await persistServiceContractFiles(linkId, [
        ...(currentFiles || []),
        {
          url: uploaded.url as string,
          name: uploaded.name || file.name,
          key: uploaded.key,
        },
      ]);
      toast.success('Contrato anexado');
    } catch (error: any) {
      if (!error?.response) {
        toast.error(error?.message || 'Falha no upload do contrato');
      }
    } finally {
      setUploadingFile(false);
    }
  };

  const removeServiceContractFile = async (
    linkId: string,
    currentFiles: PaymentFile[] | undefined,
    fileIndex: number
  ) => {
    if (!canManageCadastro) return;
    try {
      await persistServiceContractFiles(
        linkId,
        (currentFiles || []).filter((_, i) => i !== fileIndex)
      );
      toast.success('Anexo removido');
    } catch {
      // toast já tratado em persist
    }
  };

  const applySelfUpdate = (data: EmpreiteiroRow) => {
    setViewingItem(data);
    setContractTeamDraftById(teamDraftsFromContracts(data.contracts));
    queryClient.invalidateQueries({ queryKey: ['empreiteiros'] });
  };

  const canEditTeamOnDetail = isOwnEmpreiteiroAccount || canManageCadastro;

  const patchContractTeamMember = (
    linkId: string,
    index: number,
    partial: Partial<TeamMemberForm>
  ) => {
    setContractTeamDraftById((prev) => {
      const draft = prev[linkId] || [];
      return {
        ...prev,
        [linkId]: draft.map((member, i) => (i === index ? { ...member, ...partial } : member)),
      };
    });
  };

  const addContractTeamMember = (linkId: string) => {
    setContractTeamDraftById((prev) => ({
      ...prev,
      [linkId]: [...(prev[linkId] || []), emptyTeamMember()],
    }));
  };

  const removeContractTeamMember = (linkId: string, index: number) => {
    setContractTeamDraftById((prev) => ({
      ...prev,
      [linkId]: (prev[linkId] || []).filter((_, i) => i !== index),
    }));
  };

  useEffect(() => {
    if (!isOwnEmpreiteiroAccount || !ownEmpreiteiroId || empSkipAutoDetail) return;
    if (isLoading || showForm) return;
    if (pageSection !== 'cadastro') return;
    const own = (listData?.data || []).find(
      (item: EmpreiteiroRow) => item.id === ownEmpreiteiroId
    ) as EmpreiteiroRow | undefined;
    if (!own) return;
    openDetails(own);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- abrir uma vez ao carregar a empreita vinculada
  }, [
    isOwnEmpreiteiroAccount,
    ownEmpreiteiroId,
    empSkipAutoDetail,
    isLoading,
    showForm,
    pageSection,
    listData?.data,
  ]);

  const saveContractTeam = async (linkId: string) => {
    if (!viewingItem || !canEditTeamOnDetail) return;
    const draft = contractTeamDraftById[linkId] || [];
    for (let i = 0; i < draft.length; i += 1) {
      const member = draft[i];
      if (!member.name.trim()) {
        toast.error(`Nome da pessoa ${i + 1} da equipe é obrigatório`);
        return;
      }
      if (!member.role.trim()) {
        toast.error(`Função da pessoa ${i + 1} da equipe é obrigatória`);
        return;
      }
      const document = onlyDigits(member.document);
      if (document && document.length !== 11) {
        toast.error(`CPF da pessoa ${i + 1} da equipe deve ter 11 dígitos`);
        return;
      }
    }
    setSavingTeamLinkId(linkId);
    try {
      const res = await api.patch(`/empreiteiros/${viewingItem.id}/contracts/${linkId}/team`, {
        team: draft.map((member) => ({
          name: member.name.trim(),
          role: member.role.trim(),
          phone: onlyDigits(member.phone),
          document: onlyDigits(member.document),
          photo: member.photo || null,
        })),
      });
      const data = res.data?.data as EmpreiteiroRow | undefined;
      if (data?.id) applySelfUpdate(data);
      toast.success(res.data?.message || 'Equipe do contrato atualizada');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Não foi possível salvar a equipe');
    } finally {
      setSavingTeamLinkId(null);
    }
  };

  const handleEdit = (item: EmpreiteiroRow) => {
    if (!canManageCadastro) return;
    setPreviewPhoto(null);
    setViewingItem(null);
    setPageSection('cadastro');
    setEditingItem(item);
    setForm({
      userId: item.userId || '',
      name: item.name || '',
      tradeName: item.tradeName || '',
      cpf: (() => {
        const digits = empreiteiroCpfDigits(item);
        return digits ? formatCpfInput(digits) : '';
      })(),
      cnpj: (() => {
        const digits = empreiteiroCnpjDigits(item);
        return digits ? maskCnpjInput(digits) : '';
      })(),
      phone: item.phone ? maskPhoneInput(item.phone) : '',
      specialty: item.specialty || '',
      costCenterId: item.contract?.costCenter?.id || '',
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
      team: [],
    });
    setShowForm(true);
  };

  const buildPayload = () => ({
    userId: form.userId.trim() || null,
    name: form.name.trim(),
    tradeName: form.tradeName.trim() || null,
    cpf: onlyDigits(form.cpf),
    cnpj: onlyDigits(form.cnpj),
    phone: onlyDigits(form.phone),
    specialty: form.specialty.trim(),
    isActive: form.isActive,
    contactName: form.contactName.trim() || null,
    email: form.email.trim() || null,
    city: form.city.trim() || null,
    state: form.state.trim() || null,
    pixKey: form.pixKey.trim() || null,
    bank: form.bank.trim() || null,
    agency: form.agency.trim() || null,
    account: form.account.trim() || null,
    files: form.files,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = buildPayload();
    if (!payload.userId) {
      toast.error('Selecione o login do empreiteiro para vincular');
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
    if (payload.cpf.length !== 11) {
      toast.error('CPF é obrigatório e deve ter 11 dígitos');
      return;
    }
    if (payload.cnpj.length !== 14) {
      toast.error('CNPJ é obrigatório e deve ter 14 dígitos');
      return;
    }
    if (payload.phone.length < 10) {
      toast.error('Telefone é obrigatório');
      return;
    }
    if (editingItem) {
      if (!canManageCadastro) {
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

  const items: EmpreiteiroRow[] = (listData?.data || []).filter((item: EmpreiteiroRow) => {
    if (!isLinkedEmpreiteiro) return true;
    return Boolean(ownEmpreiteiroId) && item.id === ownEmpreiteiroId;
  });
  const ownEmpreitaItem =
    items.find((item) => item.id === ownEmpreiteiroId) || items[0] || null;
  const medicaoTargetItem =
    items.find((item) => item.id === medicaoEmpreitaId) ||
    (isOwnEmpreiteiroAccount ? ownEmpreitaItem : null);
  const showMedicaoPage = pageSection === 'medicao' && Boolean(medicaoTargetItem);
  const showDetailPage = pageSection === 'detalhe' && Boolean(viewingItem);

  const openMedicaoPage = (item?: EmpreiteiroRow | null, contractId?: string | null) => {
    const target =
      item ||
      (isOwnEmpreiteiroAccount ? ownEmpreitaItem : null) ||
      items.find((row) => row.isActive) ||
      items[0] ||
      null;
    if (!target) {
      toast.error('Nenhuma empreita disponível para medição de entrega');
      return;
    }
    setMedicaoEmpreitaId(target.id);
    setMedicaoContractFilterId(contractId || null);
    setPageSection('medicao');
    setViewingItem(null);
  };

  const medicaoFilterContract = medicaoContractFilterId
    ? (medicaoTargetItem?.contracts || []).find(
        (link) => link.id === medicaoContractFilterId
      ) || null
    : null;

  const {
    rowActionMenu,
    rowForActionMenu,
    toggleRowActionMenu,
    closeRowActionMenu,
    isRowMenuOpen,
  } = useRowActionMenu(items);

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };
  const saving = createMutation.isPending || updateMutation.isPending;

  const renderContractTeamSection = (link: EmpreiteiroContractLink) => {
    const draft = contractTeamDraftById[link.id] ?? teamDraftFromMembers(link.team);
    const savedTeam = link.team || [];
    const saving = savingTeamLinkId === link.id;
    const teamCount = Math.max(savedTeam.length, draft.length);
    const teamOpen = Boolean(openTeamLinkIds[link.id]);
    return (
      <div
        className="mt-4 border-t border-gray-100 pt-4 dark:border-gray-800"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() =>
            setOpenTeamLinkIds((prev) => ({ ...prev, [link.id]: !prev[link.id] }))
          }
          className="inline-flex items-center gap-1.5 rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-800 transition hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
        >
          <Users className="h-3.5 w-3.5" />
          {teamOpen ? 'Ocultar equipe' : 'Ver equipe do serviço'}
          <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-bold text-gray-600 dark:bg-gray-900 dark:text-gray-300">
            {teamCount}
          </span>
        </button>
        {teamOpen ? (
        <>
        {canEditTeamOnDetail ? (
          <div className="mb-2 mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => addContractTeamMember(link.id)}
              className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <Plus className="h-4 w-4" />
              Adicionar pessoa
            </button>
          </div>
        ) : null}
        {canEditTeamOnDetail ? (
          <div className="space-y-3">
            {draft.length === 0 ? (
              <p className="rounded-xl border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
                Nenhuma pessoa neste contrato ainda.
              </p>
            ) : (
              draft.map((member, index) => (
                <div
                  key={`${link.id}-team-${index}`}
                  className="rounded-xl border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-800/40"
                >
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Pessoa {index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeContractTeamMember(link.id, index)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                      aria-label={`Remover pessoa ${index + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex items-start gap-3">
                    <TeamMemberPhotoField
                      value={member.photo}
                      onChange={(value) =>
                        patchContractTeamMember(link.id, index, { photo: value })
                      }
                      alt={`Foto de ${member.name || `pessoa ${index + 1}`}`}
                    />
                    <div className="grid min-w-0 flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className={labelClass}>Nome *</label>
                        <input
                          type="text"
                          value={member.name}
                          onChange={(e) =>
                            patchContractTeamMember(link.id, index, { name: e.target.value })
                          }
                          placeholder="Nome completo"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Função *</label>
                        <StringSingleSelectDropdown
                          value={member.role}
                          onChange={(value) =>
                            patchContractTeamMember(link.id, index, { role: value })
                          }
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
                            patchContractTeamMember(link.id, index, {
                              phone: maskPhoneInput(e.target.value),
                            })
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
                            patchContractTeamMember(link.id, index, {
                              document: formatCpfInput(e.target.value),
                            })
                          }
                          placeholder="000.000.000-00"
                          className={inputClass}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
            <div className="flex justify-end">
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveContractTeam(link.id)}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Salvar equipe'}
              </button>
            </div>
          </div>
        ) : savedTeam.length === 0 ? (
          <p className="rounded-lg border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
            Nenhuma pessoa neste contrato.
          </p>
        ) : (
          <div className="space-y-2">
            {savedTeam.map((member, index) => (
              <div
                key={member.id || `${link.id}-view-${index}`}
                className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900/40"
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
                    {member.document ? ` · ${formatCpfInput(member.document)}` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
        </>
        ) : null}
      </div>
    );
  };

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
          <div className="relative flex flex-col items-center gap-4 text-center">
            <div className="min-w-0 w-full">
              {showMedicaoPage || showDetailPage ? (
                <div className="mb-2 flex w-full justify-start">
                  <button
                    type="button"
                    onClick={() => {
                      if (showDetailPage) {
                        closeDetails();
                        return;
                      }
                      if (showMedicaoPage && isOwnEmpreiteiroAccount && ownEmpreitaItem) {
                        setMedicaoContractFilterId(null);
                        openDetails(ownEmpreitaItem);
                        return;
                      }
                      setPageSection('cadastro');
                      setMedicaoContractFilterId(null);
                    }}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 transition hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    {isOwnEmpreiteiroAccount && showMedicaoPage
                      ? 'Voltar ao meu cadastro'
                      : 'Voltar às empreitas'}
                  </button>
                </div>
              ) : null}
              <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-3xl">
                {showMedicaoPage
                    ? 'Medições de entrega'
                    : showDetailPage
                      ? viewingItem?.name || 'Empreita'
                      : 'Empreitas'}
              </h1>
              <p className="mx-auto mt-1.5 max-w-xl text-sm text-gray-600 dark:text-gray-400">
                {showMedicaoPage
                    ? medicaoFilterContract
                      ? `${medicaoTargetItem?.name || 'Empreita'} · ${medicaoFilterContract.contratoNome}`
                      : medicaoTargetItem?.name
                        ? `${medicaoTargetItem.name} · todos os contratos`
                        : 'Registro das entregas da empreita'
                    : showDetailPage
                      ? isOwnEmpreiteiroAccount
                        ? 'Cadastre a equipe de cada contrato e consulte os serviços. Medições à parte.'
                        : 'Contratos de serviço, equipe por contrato e dados da empreita'
                      : isOwnEmpreiteiroAccount
                        ? 'Sua equipe e medições de entrega nos serviços vinculados'
                        : canCreate
                          ? 'Cadastre a empreita, vincule o login e os contratos de serviço'
                          : 'Mão de obra por contrato e especialidade'}
              </p>
            </div>
            {!showMedicaoPage &&
            !showDetailPage &&
            (canCreate || items.length > 0 || (isOwnEmpreiteiroAccount && ownEmpreitaItem)) ? (
              <div className="flex flex-wrap justify-center gap-2 sm:absolute sm:right-0 sm:top-0 sm:justify-end">
                {canCreate ? (
                  <button
                    type="button"
                    onClick={openCreateForm}
                    className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
                  >
                    <Plus className="h-4 w-4" />
                    Cadastrar empreita
                  </button>
                ) : null}
                {isOwnEmpreiteiroAccount && ownEmpreitaItem ? (
                  <button
                    type="button"
                    onClick={() => openDetails(ownEmpreitaItem)}
                    className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-semibold text-gray-800 shadow-sm transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
                  >
                    <Users className="h-4 w-4" />
                    Contratos e equipe
                  </button>
                ) : null}
                {items.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => openMedicaoPage()}
                    className={`inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold shadow-sm transition ${
                      canCreate
                        ? 'border border-gray-200 bg-white text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800'
                        : 'bg-red-600 text-white hover:bg-red-700'
                    }`}
                  >
                    <ClipboardList className="h-4 w-4" />
                    {isOwnEmpreiteiroAccount ? 'Medição de entrega' : 'Medições de entrega'}
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>

          {showMedicaoPage && medicaoTargetItem ? (
            <Card className={cadastroListClasses.card}>
              <CardHeader className={cadastroListClasses.cardHeader}>
                <div className={cadastroListClasses.cardHeaderRow}>
                  <div className={cadastroListClasses.cardHeaderIconRow}>
                    <div className="rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
                      <ClipboardList className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {medicaoTargetItem.name}
                      </h3>
                      <p className="truncate text-sm text-gray-600 dark:text-gray-400">
                        {medicaoFilterContract
                          ? [
                              medicaoFilterContract.contratoNome,
                              medicaoFilterContract.centroCustoNome,
                            ]
                              .filter(Boolean)
                              .join(' · ')
                          : (medicaoTargetItem.contractsCount ||
                                medicaoTargetItem.contracts?.length ||
                                0) > 1
                            ? 'Todos os contratos'
                            : medicaoTargetItem.contratoNome || 'Medição de entrega da empreita'}
                      </p>
                    </div>
                  </div>
                  {!isOwnEmpreiteiroAccount && items.length > 1 ? (
                    <div className="w-full min-w-0 sm:max-w-xs">
                      <StringSingleSelectDropdown
                        value={medicaoTargetItem.id}
                        onChange={(value) => {
                          setMedicaoEmpreitaId(value);
                          setMedicaoContractFilterId(null);
                        }}
                        options={labeledToSelectOptions(
                          items.map((row) => ({
                            value: row.id,
                            label: row.contratoNome
                              ? `${row.name} · ${row.contratoNome}`
                              : row.name,
                          }))
                        )}
                        placeholder="Selecionar empreita"
                        matchTriggerWidth
                      />
                    </div>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className={cadastroListClasses.cardContent}>
                <EmpreiteiroDailyMeasurements
                  empreiteiroId={medicaoTargetItem.id}
                  contracts={(medicaoTargetItem.contracts || []).map((link) => ({
                    contractId: link.id,
                    contratoNome: link.contratoNome || link.name || 'Contrato de serviço',
                    centroCustoNome: link.centroCustoNome,
                    isActive: link.isActive,
                    status: link.status,
                    plannedValue: link.plannedValue,
                    currentValue: link.currentValue,
                    executedAmountTotal: link.executedAmountTotal ?? 0,
                    team: (link.team || []).map((member) => ({
                      id: member.id,
                      name: member.name,
                      role: member.role,
                    })),
                    installments: (link.installments || []).map((p) => ({
                      amount: p.amount,
                      status: p.status,
                    })),
                  }))}
                  defaultContractId={
                    medicaoContractFilterId ||
                    (medicaoTargetItem.contracts || []).find((c) => c.isActive)?.id ||
                    (medicaoTargetItem.contracts || [])[0]?.id ||
                    ''
                  }
                  filterContractId={medicaoContractFilterId}
                  onClearContractFilter={() => setMedicaoContractFilterId(null)}
                  onSelectContractFilter={(contractId) =>
                    setMedicaoContractFilterId(contractId)
                  }
                  canEdit={
                    isOwnEmpreiteiroAccount
                      ? canEditDaily
                      : canManageCadastro || canEditDaily
                  }
                  canApprove={canApproveDaily}
                  onPreviewPhoto={openPreviewPhoto}
                />
              </CardContent>
            </Card>
          ) : showDetailPage ? null : (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {isLoading
                  ? 'Carregando…'
                  : `${items.length} empreita${items.length === 1 ? '' : 's'}`}
              </p>
              {isLinkedEmpreiteiro ? null : (
                <div className="relative w-full sm:max-w-sm">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                  <input
                    type="text"
                    placeholder="Buscar nome, documento ou centro de custo…"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-11 w-full rounded-xl border border-gray-200 bg-white py-2 pl-9 pr-9 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500/30 dark:border-gray-600 dark:bg-gray-900/70 dark:text-gray-100"
                  />
                  {searchTerm ? (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      aria-label="Limpar busca"
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
              )}
            </div>

            {isLoading ? (
              <CadastroListLoading message="Carregando empreitas..." />
            ) : items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-white/50 px-4 py-10 dark:border-gray-600 dark:bg-gray-900/30">
                <CadastroListEmpty
                  icon={HardHat}
                  title="Nenhuma empreita encontrada"
                  hint={
                    isLinkedEmpreiteiro
                      ? ownEmpreiteiroId
                        ? 'Seu cadastro de empreita não está disponível. Fale com a Gennesis.'
                        : 'A Gennesis ainda não vinculou uma empreita ao seu login. Aguarde o cadastro.'
                      : searchTerm.trim()
                        ? 'Tente ajustar a busca'
                        : canCreate
                          ? 'Cadastre a empreita e vincule o login criado em Funcionários'
                          : 'Sem permissão para cadastrar. Peça acesso de criar em Empreitas.'
                  }
                />
                {canCreate && !searchTerm.trim() ? (
                  <div className="mt-4 flex justify-center">
                    <button
                      type="button"
                      onClick={openCreateForm}
                      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-red-700"
                    >
                      <Plus className="h-4 w-4" />
                      Cadastrar empreita
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((it) => {
                  const teamSize =
                    (it.contracts || []).reduce(
                      (sum, link) => sum + (link.teamCount ?? link.team?.length ?? 0),
                      0
                    ) ||
                    it.teamCount ||
                    it.team?.length ||
                    0;
                  const photo = resolveApiMediaUrl(it.photoUrl);
                  const cityUf = [it.city, it.state].filter(Boolean).join(' / ');
                  const extraFields = [
                    it.email ? { label: 'E-mail', value: it.email } : null,
                    cityUf ? { label: 'Cidade / UF', value: cityUf } : null,
                    it.pixKey ? { label: 'PIX', value: it.pixKey } : null,
                    it.bank ? { label: 'Banco', value: it.bank } : null,
                    it.agency ? { label: 'Agência', value: it.agency } : null,
                    it.account ? { label: 'Conta', value: it.account } : null,
                  ].filter((field): field is { label: string; value: string } => Boolean(field));
                  return (
                    <article
                      key={it.id}
                      className="group relative flex flex-col overflow-hidden rounded-2xl border border-gray-200/90 bg-white shadow-sm transition hover:border-red-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-900/55 dark:hover:border-red-900/60"
                    >
                      <button
                        type="button"
                        onClick={() => openDetails(it)}
                        className="flex flex-1 flex-col p-4 text-left sm:p-5"
                      >
                        <div className="flex items-start gap-3">
                          {photo ? (
                            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-gray-200 ring-1 ring-black/5 dark:bg-gray-700">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={photo}
                                alt=""
                                className="h-full w-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            </div>
                          ) : (
                            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-300">
                              <HardHat className="h-6 w-6" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <h3 className="truncate text-base font-semibold text-gray-900 group-hover:text-red-700 dark:text-gray-50 dark:group-hover:text-red-300">
                                  {it.name}
                                </h3>
                                <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-gray-400">
                                  {formatEmpreiteiroDocs(it)}
                                </p>
                              </div>
                              <span
                                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                  it.isActive
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                                    : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                                }`}
                              >
                                {it.isActive ? 'Ativo' : 'Inativo'}
                              </span>
                            </div>
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {it.specialty ? (
                                <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                                  {it.specialty}
                                </span>
                              ) : null}
                              <span
                                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                                  it.userId
                                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                                    : 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200'
                                }`}
                              >
                                {it.userId
                                  ? it.userName || it.contactName || 'Login vinculado'
                                  : it.contactName || 'Sem login'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-4 space-y-2 border-t border-gray-100 pt-3 dark:border-gray-800">
                          <p className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300">
                            <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
                            <span className="line-clamp-2">
                              {it.centroCustoNome || 'Sem centro de custo'}
                            </span>
                          </p>
                          <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm text-gray-600 dark:text-gray-400">
                            <span className="inline-flex items-center gap-1.5">
                              <Phone className="h-3.5 w-3.5 text-gray-400" />
                              {formatPhoneDisplay(it.phone) || '—'}
                            </span>
                            <span className="inline-flex items-center gap-1.5">
                              <Users className="h-3.5 w-3.5 text-gray-400" />
                              {teamSize > 0 ? `${teamSize} na equipe` : 'Sem equipe'}
                            </span>
                          </div>
                          {extraFields.length > 0 ? (
                            <div className="grid grid-cols-2 gap-x-3 gap-y-2 pt-1">
                              {extraFields.map((field) => (
                                <div key={field.label} className="min-w-0">
                                  <p className="text-[10px] font-medium uppercase tracking-wide text-gray-400">
                                    {field.label}
                                  </p>
                                  <p className="truncate text-xs text-gray-700 dark:text-gray-300">
                                    {field.value}
                                  </p>
                                </div>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      </button>

                      <div className="flex items-center gap-2 border-t border-gray-100 px-3 py-2.5 dark:border-gray-800">
                        {isOwnEmpreiteiroAccount ? (
                          <button
                            type="button"
                            onClick={() => openDetails(it)}
                            className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-800 transition hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
                          >
                            <Users className="h-3.5 w-3.5" />
                            Contratos e equipe
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() => openMedicaoPage(it)}
                          className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/70"
                        >
                          <ClipboardList className="h-3.5 w-3.5" />
                          Medição de entrega
                        </button>
                        {showActions ? (
                          <button
                            type="button"
                            aria-label="Mais ações"
                            aria-expanded={isRowMenuOpen(it.id)}
                            onClick={(e) =>
                              toggleRowActionMenu(it.id, e.currentTarget as HTMLButtonElement)
                            }
                            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            )}

            {rowActionMenu && rowForActionMenu ? (
              <RowActionMenuPortal
                menu={rowActionMenu}
                onClose={closeRowActionMenu}
                onEdit={canManageCadastro ? () => handleEdit(rowForActionMenu) : undefined}
                onDelete={canDelete ? () => setShowDeleteId(rowForActionMenu.id) : undefined}
                extraItems={[
                  {
                    label: 'Medição de entrega',
                    icon: (
                      <ClipboardList className="h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
                    ),
                    onClick: () => openMedicaoPage(rowForActionMenu),
                  },
                  ...((canManageCadastro || canDelete) &&
                  rowForActionMenu.userId &&
                  rowForActionMenu.isActive
                    ? [
                        {
                          label: 'Encerrar e desvincular',
                          tone: 'danger' as const,
                          icon: (
                            <Link2Off className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
                          ),
                          onClick: () => setShowUnlinkId(rowForActionMenu.id),
                        },
                      ]
                    : []),
                ]}
              />
            ) : null}
          </div>
          )}
        </div>

        {showForm ? (
          <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={requestCloseForm} />
            <div className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg bg-white shadow-xl dark:bg-gray-800">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  {editingItem ? 'Editar empreita' : 'Cadastrar empreita'}
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
                  <div className="sm:col-span-2 rounded-xl border border-sky-200 bg-sky-50/80 p-4 dark:border-sky-900 dark:bg-sky-950/30">
                    <label className={labelClass}>Login de acesso *</label>
                    <StringSingleSelectDropdown
                      value={form.userId}
                      onChange={(value) => {
                        const selected = (linkableUsersData || []).find((u) => u.id === value);
                        patchForm({
                          userId: value,
                          contactName: selected?.name || '',
                          email: selected?.email || '',
                          ...(selected?.cpf
                            ? { cpf: formatCpfInput(onlyDigits(selected.cpf)) }
                            : {}),
                        });
                      }}
                      options={linkableLoginOptions}
                      placeholder="Selecione o login do empreiteiro"
                      emptyOptionLabel="Selecione o login do empreiteiro"
                      searchPlaceholder="Pesquisar por nome ou e-mail..."
                      matchTriggerWidth
                    />
                    <p className="mt-2 text-xs text-sky-900/80 dark:text-sky-200/80">
                      Continuação do login criado em Funcionários. A foto dele aparece no card.
                      Centro de custo, prazo e equipe ficam em cada contrato de serviço.
                    </p>
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
                    <label className={labelClass}>CPF *</label>
                    <input
                      type="text"
                      required
                      value={form.cpf}
                      onChange={(e) => patchForm({ cpf: formatCpfInput(e.target.value) })}
                      placeholder="000.000.000-00"
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>CNPJ *</label>
                    <input
                      type="text"
                      required
                      value={form.cnpj}
                      onChange={(e) => patchForm({ cnpj: maskCnpjInput(e.target.value) })}
                      placeholder="00.000.000/0001-00"
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
                  <p className="sm:col-span-2 text-xs text-gray-500 dark:text-gray-400">
                    Centro de custo e prazo ficam no contrato de serviço. A equipe é cadastrada
                    pelo empreiteiro (login vinculado) no detalhe da empreita.
                  </p>
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

        {showDetailPage && viewingItem ? (
          <Card className={cadastroListClasses.card}>
            <CardContent className={`${cadastroListClasses.cardContent} space-y-6`}>
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
                    {isOwnEmpreiteiroAccount ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openMedicaoPage(viewingItem)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                        >
                          <ClipboardList className="h-3.5 w-3.5" />
                          Medição de entrega
                        </button>
                      </div>
                    ) : null}
                  </div>
                </div>

                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Contratos de serviço
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {isOwnEmpreiteiroAccount
                          ? 'Cadastre a equipe de cada serviço e consulte medições'
                          : 'Serviços com valor, equipe própria e medições de cada um'}
                      </p>
                    </div>
                    {canManageCadastro ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingServiceId(null);
                          setAddingContract((open) => !open);
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {addingContract ? 'Cancelar' : 'Adicionar serviço'}
                      </button>
                    ) : null}
                  </div>
                  {addingContract ? (
                    <div className="mb-3 space-y-3 rounded-xl border border-dashed border-red-300 bg-red-50/40 p-3 dark:border-red-900/50 dark:bg-red-950/20">
                      <div>
                        <label className={labelClass}>Nome do serviço *</label>
                        <input
                          type="text"
                          value={newServiceName}
                          onChange={(e) => setNewServiceName(e.target.value)}
                          placeholder=""
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Descrição</label>
                        <textarea
                          value={newServiceDescription}
                          onChange={(e) => setNewServiceDescription(e.target.value)}
                          rows={2}
                          placeholder=""
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Valor planejado (R$)</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={newServicePlannedValue}
                          onChange={(e) =>
                            setNewServicePlannedValue(maskCurrencyInputBrOrEmpty(e.target.value))
                          }
                          placeholder="R$ 0,00"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Local de execução</label>
                        <input
                          type="text"
                          value={newServiceLocation}
                          onChange={(e) => setNewServiceLocation(e.target.value)}
                          placeholder=""
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Centro de custo *</label>
                        <StringSingleSelectDropdown
                          value={newServiceCostCenterId}
                          onChange={setNewServiceCostCenterId}
                          options={costCenterSelectOptions}
                          placeholder="Selecione o centro de custo"
                          emptyOptionLabel="Selecione o centro de custo"
                          searchPlaceholder="Pesquisar centro de custo..."
                          matchTriggerWidth
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Forma de pagamento</label>
                        <div className="flex flex-wrap gap-1.5">
                          {(
                            [
                              { value: 'avista' as const, label: 'À vista' },
                              { value: 'parcelado' as const, label: 'Parcelado' },
                            ] as const
                          ).map((opt) => {
                            const active = newServicePayMode === opt.value;
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => {
                                  setNewServicePayMode((prev) => {
                                    const next = prev === opt.value ? null : opt.value;
                                    if (next === 'parcelado') {
                                      const n = Math.floor(Number(newServiceParcelCount)) || 6;
                                      setNewServiceParcelCount(String(n));
                                      setNewServiceParcelAmounts(
                                        buildEqualParcelAmountInputs(
                                          parseCurrencyInputBr(newServicePlannedValue),
                                          n
                                        )
                                      );
                                    } else {
                                      setNewServiceParcelAmounts([]);
                                    }
                                    return next;
                                  });
                                }}
                                className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                                  active
                                    ? 'border-red-500 bg-red-50 text-red-700 dark:border-red-500 dark:bg-red-950/40 dark:text-red-300'
                                    : 'border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800'
                                }`}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                        {newServicePayMode === 'avista' ? (
                          <p className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                            1 parcela com o valor total — a baixa na aprovação libera a parcela
                            com esse valor; pago só ao anexar o comprovante.
                          </p>
                        ) : null}
                        {newServicePayMode === 'parcelado' ? (
                          <div className="mt-2 space-y-2">
                            <label className={labelClass}>Nº de parcelas</label>
                            <input
                              type="number"
                              min={2}
                              max={60}
                              value={newServiceParcelCount}
                              onChange={(e) => {
                                const value = e.target.value;
                                setNewServiceParcelCount(value);
                                const n = Math.floor(Number(value));
                                if (Number.isFinite(n) && n >= 2 && n <= 60) {
                                  setNewServiceParcelAmounts(
                                    buildEqualParcelAmountInputs(
                                      parseCurrencyInputBr(newServicePlannedValue),
                                      n
                                    )
                                  );
                                } else {
                                  setNewServiceParcelAmounts([]);
                                }
                              }}
                              placeholder=""
                              className={inputClass}
                            />
                            {(() => {
                              const n = Math.floor(Number(newServiceParcelCount.trim()));
                              if (!Number.isFinite(n) || n < 2 || n > 60) return null;
                              const amounts =
                                newServiceParcelAmounts.length === n
                                  ? newServiceParcelAmounts
                                  : buildEqualParcelAmountInputs(
                                      parseCurrencyInputBr(newServicePlannedValue),
                                      n
                                    );
                              const sum = amounts.reduce(
                                (acc, raw) => acc + (parseCurrencyInputBr(raw) || 0),
                                0
                              );
                              const planned = parseCurrencyInputBr(newServicePlannedValue);
                              return (
                                <div className="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                      Valor de cada parcela
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setNewServiceParcelAmounts(
                                          buildEqualParcelAmountInputs(planned, n)
                                        )
                                      }
                                      className="text-[11px] font-semibold text-sky-700 hover:underline dark:text-sky-300"
                                    >
                                      Dividir igualmente
                                    </button>
                                  </div>
                                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                    {amounts.map((amount, index) => (
                                      <div key={`new-parcel-${index}`}>
                                        <label className="mb-1 block text-[11px] text-gray-500 dark:text-gray-400">
                                          Parcela {index + 1}
                                        </label>
                                        <input
                                          type="text"
                                          inputMode="numeric"
                                          value={amount}
                                          onChange={(e) => {
                                            setNewServiceParcelAmounts(
                                              redistributeParcelAmounts(
                                                amounts,
                                                index,
                                                e.target.value,
                                                planned
                                              )
                                            );
                                          }}
                                          placeholder="R$ 0,00"
                                          className={inputClass}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                                    Soma: {formatMoneyBr(sum) || 'R$ 0,00'}
                                    {planned != null
                                      ? ` · Planejado: ${formatMoneyBr(planned)}`
                                      : ''}
                                    . Ao mudar uma, as outras dividem o que sobra.
                                  </p>
                                </div>
                              );
                            })()}
                          </div>
                        ) : null}
                      </div>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label className={labelClass}>Início</label>
                          <input
                            type="date"
                            value={newContractStart}
                            onChange={(e) => setNewContractStart(e.target.value)}
                            className={inputClass}
                          />
                        </div>
                        <div>
                          <label className={labelClass}>Fim</label>
                          <input
                            type="date"
                            value={newContractEnd}
                            onChange={(e) => setNewContractEnd(e.target.value)}
                            className={inputClass}
                          />
                        </div>
                      </div>
                      <div>
                        <label className={labelClass}>Status</label>
                        <select
                          value={newContractStatus}
                          onChange={(e) =>
                            setNewContractStatus(e.target.value as EmpreiteiroContractStatus)
                          }
                          className={inputClass}
                        >
                          {CONTRACT_STATUS_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className={labelClass}>Anexo do contrato</label>
                        <p className="mb-1.5 text-xs text-gray-500 dark:text-gray-400">
                          PDF ou Word do contrato assinado
                        </p>
                        <input
                          type="file"
                          accept=".pdf,.doc,.docx,image/*,application/pdf"
                          className="hidden"
                          id="empreiteiro-new-service-file"
                          disabled={uploadingFile}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            void uploadNewServiceFile(file);
                          }}
                        />
                        <div className="space-y-2">
                          {newServiceFiles.map((file, fileIndex) => {
                            const href = resolveApiMediaUrl(file.url) || file.url;
                            return (
                              <div
                                key={`${file.url}-${fileIndex}`}
                                className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-gray-600 dark:bg-gray-900/60"
                              >
                                <FileText className="h-4 w-4 shrink-0 text-gray-500" />
                                <a
                                  href={href}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="min-w-0 flex-1 truncate text-sm text-red-700 hover:underline dark:text-red-300"
                                >
                                  {file.name || 'contrato'}
                                </a>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setNewServiceFiles((prev) =>
                                      prev.filter((_, i) => i !== fileIndex)
                                    )
                                  }
                                  className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                                  aria-label="Remover anexo"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            );
                          })}
                          <button
                            type="button"
                            disabled={uploadingFile}
                            onClick={() =>
                              document.getElementById('empreiteiro-new-service-file')?.click()
                            }
                            className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 text-sm font-medium text-gray-600 hover:bg-white disabled:opacity-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
                          >
                            <Paperclip className="h-4 w-4" />
                            {uploadingFile ? 'Enviando…' : 'Anexar contrato'}
                          </button>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={savingContractLink || !newServiceName.trim()}
                        onClick={() => void handleAddContractLink()}
                        className="rounded-lg bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {savingContractLink ? 'Salvando…' : 'Criar contrato de serviço'}
                      </button>
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    {(viewingItem.contracts || []).length === 0 ? (
                      <p className="rounded-xl border border-dashed border-gray-300 px-3 py-4 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
                        Nenhum contrato de serviço. Use “Adicionar serviço” para cadastrar.
                      </p>
                    ) : null}
                    {(viewingItem.contracts || []).map((link) => {
                      const statusMeta = contractStatusMeta(link.status);
                      const contractValue =
                        link.currentValue != null && Number.isFinite(link.currentValue)
                          ? link.currentValue
                          : link.plannedValue != null && Number.isFinite(link.plannedValue)
                            ? link.plannedValue
                            : null;
                      let paidTotal = 0;
                      for (const parcel of link.installments || []) {
                        const amount = Number(parcel.amount) || 0;
                        if (String(parcel.status || '').toUpperCase() === 'PAID') {
                          paidTotal += amount;
                        }
                      }
                      const executedTotal =
                        link.executedAmountTotal != null &&
                        Number.isFinite(Number(link.executedAmountTotal))
                          ? Number(link.executedAmountTotal)
                          : 0;
                      const saldoValue =
                        contractValue != null
                          ? Number((contractValue - paidTotal).toFixed(2))
                          : null;
                      const executedPct =
                        contractValue != null && contractValue > 0
                          ? Math.min(100, Math.round((executedTotal / contractValue) * 100))
                          : null;
                      const measurementLabel =
                        (link.measurementCount ?? 0) === 1
                          ? '1 medição'
                          : `${link.measurementCount ?? 0} medições`;
                      const serviceDetailsOpen = Boolean(openServiceDetailIds[link.id]);
                      const lastAddendumNumber = (link.addenda || []).reduce(
                        (max, a) => Math.max(max, a.number),
                        0
                      );
                      return (
                        <article
                          key={link.id}
                          className="rounded-2xl border border-gray-200/90 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900/55 sm:p-5"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-base font-semibold text-gray-900 dark:text-gray-100">
                                {link.contratoNome || link.name || 'Contrato de serviço'}
                              </p>
                              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                {[
                                  link.location,
                                  link.centroCustoNome,
                                  `${formatDateBr(link.startDate)} – ${formatDateBr(link.endDate)}`,
                                ]
                                  .filter(Boolean)
                                  .join(' · ')}
                              </p>
                            </div>
                            <div
                              className="flex shrink-0 flex-wrap items-center gap-1.5"
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              <span
                                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusMeta.className}`}
                              >
                                {statusMeta.label}
                              </span>
                              <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-semibold text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                                {paymentLabelForLink(link)}
                              </span>
                              {canManageCadastro ? (
                                <select
                                  disabled={savingContractLink}
                                  value={String(link.status || 'IN_PROGRESS').toUpperCase()}
                                  onChange={(e) => {
                                    void handleUpdateContractStatus(
                                      link.id,
                                      e.target.value as EmpreiteiroContractStatus
                                    );
                                  }}
                                  className="max-w-[9.5rem] rounded-lg border border-gray-300 bg-white px-1.5 py-1 text-[11px] font-medium text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
                                  aria-label="Alterar status do contrato"
                                >
                                  {CONTRACT_STATUS_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              ) : null}
                              {canManageCadastro ? (
                                <button
                                  type="button"
                                  disabled={savingContractLink}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openEditService(link);
                                  }}
                                  className="rounded-lg border border-gray-300 p-1.5 text-gray-500 hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 disabled:opacity-50 dark:border-gray-600 dark:hover:border-sky-800 dark:hover:bg-sky-950/40 dark:hover:text-sky-300"
                                  title="Editar contrato de serviço"
                                  aria-label="Editar contrato de serviço"
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                </button>
                              ) : null}
                              {canManageCadastro ? (
                                <button
                                  type="button"
                                  disabled={savingContractLink}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void handleDeleteContractLink(link);
                                  }}
                                  className="rounded-lg border border-gray-300 p-1.5 text-gray-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:border-gray-600 dark:hover:border-red-800 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                                  title="Excluir contrato de serviço"
                                  aria-label="Excluir contrato de serviço"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              ) : null}
                            </div>
                          </div>

                          {editingServiceId === link.id ? (
                            <div
                              className="mt-3 space-y-3 rounded-xl border border-dashed border-sky-300 bg-sky-50/40 p-3 dark:border-sky-900/50 dark:bg-sky-950/20"
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              <div>
                                <label className={labelClass}>Nome do serviço *</label>
                                <input
                                  type="text"
                                  value={editServiceName}
                                  onChange={(e) => setEditServiceName(e.target.value)}
                                  className={inputClass}
                                />
                              </div>
                              <div>
                                <label className={labelClass}>Descrição</label>
                                <textarea
                                  value={editServiceDescription}
                                  onChange={(e) => setEditServiceDescription(e.target.value)}
                                  rows={2}
                                  className={inputClass}
                                />
                              </div>
                              <div>
                                <label className={labelClass}>Valor planejado (R$)</label>
                                <input
                                  type="text"
                                  inputMode="numeric"
                                  value={editServicePlannedValue}
                                  onChange={(e) =>
                                    setEditServicePlannedValue(
                                      maskCurrencyInputBrOrEmpty(e.target.value)
                                    )
                                  }
                                  placeholder="R$ 0,00"
                                  className={inputClass}
                                />
                              </div>
                              <div>
                                <label className={labelClass}>Local de execução</label>
                                <input
                                  type="text"
                                  value={editServiceLocation}
                                  onChange={(e) => setEditServiceLocation(e.target.value)}
                                  className={inputClass}
                                />
                              </div>
                              <div>
                                <label className={labelClass}>Centro de custo *</label>
                                <StringSingleSelectDropdown
                                  value={editServiceCostCenterId}
                                  onChange={setEditServiceCostCenterId}
                                  options={costCenterSelectOptions}
                                  placeholder="Selecione o centro de custo"
                                  emptyOptionLabel="Selecione o centro de custo"
                                  searchPlaceholder="Pesquisar centro de custo..."
                                  matchTriggerWidth
                                />
                              </div>
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div>
                                  <label className={labelClass}>Início</label>
                                  <input
                                    type="date"
                                    value={editServiceStart}
                                    onChange={(e) => setEditServiceStart(e.target.value)}
                                    className={inputClass}
                                  />
                                </div>
                                <div>
                                  <label className={labelClass}>Fim</label>
                                  <input
                                    type="date"
                                    value={editServiceEnd}
                                    onChange={(e) => setEditServiceEnd(e.target.value)}
                                    className={inputClass}
                                  />
                                </div>
                              </div>
                              <div>
                                <label className={labelClass}>Status</label>
                                <select
                                  value={editServiceStatus}
                                  onChange={(e) =>
                                    setEditServiceStatus(
                                      e.target.value as EmpreiteiroContractStatus
                                    )
                                  }
                                  className={inputClass}
                                >
                                  {CONTRACT_STATUS_OPTIONS.map((opt) => (
                                    <option key={opt.value} value={opt.value}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className={labelClass}>Forma de pagamento</label>
                                {editServicePayLocked ? (
                                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                                    Há parcelas liberadas ou pagas — não é possível alterar a forma
                                    de pagamento. Atual: {paymentLabelForLink(link)}.
                                  </p>
                                ) : (
                                  <>
                                    <div className="flex flex-wrap gap-1.5">
                                      {(
                                        [
                                          { value: 'avista' as 'avista' | 'parcelado', label: 'À vista' },
                                          { value: 'parcelado' as 'avista' | 'parcelado', label: 'Parcelado' },
                                        ]
                                      ).map((opt) => {
                                        const active = editServicePayMode === opt.value;
                                        return (
                                          <button
                                            key={opt.value}
                                            type="button"
                                            onClick={() => {
                                              setEditServicePayMode((prev) => {
                                                const next = prev === opt.value ? null : opt.value;
                                                if (next === 'parcelado') {
                                                  const n =
                                                    Math.floor(Number(editServiceParcelCount)) || 6;
                                                  setEditServiceParcelCount(String(n));
                                                  setEditServiceParcelAmounts(
                                                    buildEqualParcelAmountInputs(
                                                      parseCurrencyInputBr(editServicePlannedValue),
                                                      n
                                                    )
                                                  );
                                                } else {
                                                  setEditServiceParcelAmounts([]);
                                                }
                                                return next;
                                              });
                                            }}
                                            className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                                              active
                                                ? 'border-sky-500 bg-sky-50 text-sky-800 dark:border-sky-500 dark:bg-sky-950/40 dark:text-sky-200'
                                                : 'border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800'
                                            }`}
                                          >
                                            {opt.label}
                                          </button>
                                        );
                                      })}
                                    </div>
                                    {editServicePayMode === 'avista' ? (
                                      <p className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                                        1 parcela com o valor total — a baixa na aprovação libera
                                        a parcela; pago ao anexar comprovante.
                                      </p>
                                    ) : null}
                                    {editServicePayMode === 'parcelado' ? (
                                      <div className="mt-2 space-y-2">
                                        <label className={labelClass}>Nº de parcelas</label>
                                        <input
                                          type="number"
                                          min={2}
                                          max={60}
                                          value={editServiceParcelCount}
                                          onChange={(e) => {
                                            const value = e.target.value;
                                            setEditServiceParcelCount(value);
                                            const n = Math.floor(Number(value));
                                            if (Number.isFinite(n) && n >= 2 && n <= 60) {
                                              setEditServiceParcelAmounts(
                                                buildEqualParcelAmountInputs(
                                                  parseCurrencyInputBr(editServicePlannedValue),
                                                  n
                                                )
                                              );
                                            } else {
                                              setEditServiceParcelAmounts([]);
                                            }
                                          }}
                                          className={inputClass}
                                        />
                                        {(() => {
                                          const n = Math.floor(
                                            Number(editServiceParcelCount.trim())
                                          );
                                          if (!Number.isFinite(n) || n < 2 || n > 60) return null;
                                          const amounts =
                                            editServiceParcelAmounts.length === n
                                              ? editServiceParcelAmounts
                                              : buildEqualParcelAmountInputs(
                                                  parseCurrencyInputBr(editServicePlannedValue),
                                                  n
                                                );
                                          const sum = amounts.reduce(
                                            (acc, raw) => acc + (parseCurrencyInputBr(raw) || 0),
                                            0
                                          );
                                          const planned =
                                            parseCurrencyInputBr(editServicePlannedValue);
                                          return (
                                            <div className="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                                              <div className="flex items-center justify-between gap-2">
                                                <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                                  Valor de cada parcela
                                                </p>
                                                <button
                                                  type="button"
                                                  onClick={() =>
                                                    setEditServiceParcelAmounts(
                                                      buildEqualParcelAmountInputs(planned, n)
                                                    )
                                                  }
                                                  className="text-[11px] font-semibold text-sky-700 hover:underline dark:text-sky-300"
                                                >
                                                  Dividir igualmente
                                                </button>
                                              </div>
                                              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                {amounts.map((amount, index) => (
                                                  <div key={`edit-parcel-${index}`}>
                                                    <label className="mb-1 block text-[11px] text-gray-500 dark:text-gray-400">
                                                      Parcela {index + 1}
                                                    </label>
                                                    <input
                                                      type="text"
                                                      inputMode="numeric"
                                                      value={amount}
                                                      onChange={(e) => {
                                                        setEditServiceParcelAmounts(
                                                          redistributeParcelAmounts(
                                                            amounts,
                                                            index,
                                                            e.target.value,
                                                            planned
                                                          )
                                                        );
                                                      }}
                                                      placeholder="R$ 0,00"
                                                      className={inputClass}
                                                    />
                                                  </div>
                                                ))}
                                              </div>
                                              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                                                Soma: {formatMoneyBr(sum) || 'R$ 0,00'}
                                                {planned != null
                                                  ? ` · Planejado: ${formatMoneyBr(planned)}`
                                                  : ''}
                                                . Ao mudar uma, as outras dividem o que sobra.
                                              </p>
                                            </div>
                                          );
                                        })()}
                                      </div>
                                    ) : null}
                                    {!editServicePayMode ? (
                                      <p className="mt-1.5 text-[11px] text-gray-500 dark:text-gray-400">
                                        Sem seleção = remove o cronograma de parcelas.
                                      </p>
                                    ) : null}
                                  </>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  disabled={savingContractLink || !editServiceName.trim()}
                                  onClick={() => void handleUpdateContractLink()}
                                  className="rounded-lg bg-sky-600 px-3 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                                >
                                  {savingContractLink ? 'Salvando…' : 'Salvar alterações'}
                                </button>
                                <button
                                  type="button"
                                  disabled={savingContractLink}
                                  onClick={() => setEditingServiceId(null)}
                                  className="rounded-lg border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          ) : null}

                          <div className="mt-4">
                            <ContractFinanceStats
                              items={[
                                {
                                  label: 'Contrato',
                                  value: formatMoneyBr(contractValue) || '—',
                                },
                                {
                                  label: 'Executado',
                                  value: executedPct != null ? `${executedPct}%` : '—',
                                },
                                {
                                  label: 'Pago',
                                  value: formatMoneyBr(paidTotal) || 'R$ 0,00',
                                },
                                {
                                  label: 'Saldo',
                                  value: formatMoneyBr(saldoValue) || '—',
                                },
                              ]}
                            />
                          </div>

                          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {measurementLabel}
                              {(link.teamCount ?? link.team?.length ?? 0) > 0
                                ? ` · ${link.teamCount ?? link.team?.length} na equipe`
                                : ' · Sem equipe'}
                              {(link.addendaCount || 0) > 0
                                ? ` · ${link.addendaCount} aditivo${
                                    (link.addendaCount || 0) === 1 ? '' : 's'
                                  }`
                                : ''}
                              {(link.plannedValue != null || (link.addendaTotal || 0) !== 0) &&
                              (link.addendaCount || 0) > 0
                                ? ` · original ${formatMoneyBr(link.plannedValue) || '—'}`
                                : ''}
                            </p>
                            <button
                              type="button"
                              onClick={() => openMedicaoPage(viewingItem, link.id)}
                              className="inline-flex items-center gap-1.5 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-950/70"
                            >
                              <ClipboardList className="h-3.5 w-3.5" />
                              Ver medições
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              setOpenServiceDetailIds((prev) => ({
                                ...prev,
                                [link.id]: !prev[link.id],
                              }))
                            }
                            className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-800 transition hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                          >
                            <ChevronDown
                              className={`h-3.5 w-3.5 transition ${serviceDetailsOpen ? 'rotate-180' : ''}`}
                            />
                            {serviceDetailsOpen ? 'Ocultar detalhes' : 'Ver detalhes do serviço'}
                          </button>

                          {serviceDetailsOpen ? (
                          <>
                          {!isOwnEmpreiteiroAccount ? (
                          <div
                            className="mt-4 space-y-4 border-t border-gray-100 pt-4 dark:border-gray-800"
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                Aditivos
                              </p>
                              {canManageCadastro ? (
                                <button
                                  type="button"
                                  disabled={savingContractLink}
                                  onClick={() => {
                                    if (addingAddendumForId === link.id) {
                                      resetAddendumForm();
                                      return;
                                    }
                                    setAddendumReason('');
                                    setAddendumAmount('');
                                    setAddendumDate('');
                                    setAddendumServicesAdded('');
                                    setAddendumServicesRemoved('');
                                    setAddendumApprovedBy('');
                                    setAddendumFiles([]);
                                    setAddendumCreateParcel(true);
                                    setAddingAddendumForId(link.id);
                                  }}
                                  className="inline-flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                  {addingAddendumForId === link.id ? 'Cancelar' : 'Adicionar aditivo'}
                                </button>
                              ) : null}
                            </div>
                            {(link.addenda || []).length === 0 ? (
                              <p className="rounded-xl border border-dashed border-gray-300 px-3 py-3 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
                                Nenhum aditivo neste contrato.
                              </p>
                            ) : (
                              <div className="space-y-1">
                                {(link.addenda || []).map((ad) => {
                                  const hrefFiles = ad.files || [];
                                  return (
                                    <div
                                      key={ad.id}
                                      className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs dark:border-gray-600 dark:bg-gray-800/80"
                                    >
                                      <div className="flex flex-wrap items-center gap-2">
                                        <span className="font-semibold text-gray-800 dark:text-gray-100">
                                          Aditivo nº {ad.number}
                                        </span>
                                        <span
                                          className={
                                            ad.amount >= 0
                                              ? 'font-semibold text-emerald-700 dark:text-emerald-300'
                                              : 'font-semibold text-red-700 dark:text-red-300'
                                          }
                                        >
                                          {ad.amount >= 0 ? '+' : ''}
                                          {formatMoneyBr(ad.amount)}
                                        </span>
                                        <span className="text-gray-400">
                                          {formatDateBr(ad.effectiveDate)}
                                        </span>
                                        {canManageCadastro && ad.number === lastAddendumNumber ? (
                                          <button
                                            type="button"
                                            disabled={savingContractLink}
                                            onClick={() =>
                                              void handleDeleteAddendum(link.id, ad.id)
                                            }
                                            className="ml-auto text-gray-400 hover:text-red-600"
                                            aria-label="Excluir aditivo"
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </button>
                                        ) : null}
                                      </div>
                                      <p className="mt-0.5 text-gray-600 dark:text-gray-300">
                                        {ad.reason}
                                      </p>
                                      {[
                                        ad.servicesAdded
                                          ? `+ Serviços: ${ad.servicesAdded}`
                                          : null,
                                        ad.servicesRemoved
                                          ? `− Serviços: ${ad.servicesRemoved}`
                                          : null,
                                        ad.approvedByName
                                          ? `Aprovado por: ${ad.approvedByName}`
                                          : null,
                                      ]
                                        .filter(Boolean)
                                        .map((line) => (
                                          <p
                                            key={String(line)}
                                            className="text-[11px] text-gray-500 dark:text-gray-400"
                                          >
                                            {line}
                                          </p>
                                        ))}
                                      {hrefFiles.map((file, fi) => {
                                        const href = resolveApiMediaUrl(file.url) || file.url;
                                        return (
                                          <a
                                            key={`${file.url}-${fi}`}
                                            href={href}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-red-700 hover:underline dark:text-red-300"
                                          >
                                            <Paperclip className="h-3 w-3" />
                                            {file.name || 'documento'}
                                          </a>
                                        );
                                      })}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                            {addingAddendumForId === link.id ? (
                              <div className="space-y-2 rounded-lg border border-dashed border-red-300 bg-red-50/30 p-2.5 dark:border-red-900/50 dark:bg-red-950/20">
                                <div>
                                  <label className={labelClass}>Motivo *</label>
                                  <input
                                    type="text"
                                    value={addendumReason}
                                    onChange={(e) => setAddendumReason(e.target.value)}
                                    className={inputClass}
                                    placeholder=""
                                  />
                                </div>
                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                  <div>
                                    <label className={labelClass}>Valor (R$) *</label>
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      value={addendumAmount}
                                      onChange={(e) => setAddendumAmount(e.target.value)}
                                      className={inputClass}
                                      placeholder="0,00"
                                    />
                                  </div>
                                  <div>
                                    <label className={labelClass}>Data</label>
                                    <input
                                      type="date"
                                      value={addendumDate}
                                      onChange={(e) => setAddendumDate(e.target.value)}
                                      className={inputClass}
                                    />
                                  </div>
                                </div>
                                <div>
                                  <label className={labelClass}>Serviços adicionados</label>
                                  <input
                                    type="text"
                                    value={addendumServicesAdded}
                                    onChange={(e) => setAddendumServicesAdded(e.target.value)}
                                    className={inputClass}
                                  />
                                </div>
                                <div>
                                  <label className={labelClass}>Serviços retirados</label>
                                  <input
                                    type="text"
                                    value={addendumServicesRemoved}
                                    onChange={(e) => setAddendumServicesRemoved(e.target.value)}
                                    className={inputClass}
                                  />
                                </div>
                                <div>
                                  <label className={labelClass}>Responsável pela aprovação</label>
                                  <input
                                    type="text"
                                    value={addendumApprovedBy}
                                    onChange={(e) => setAddendumApprovedBy(e.target.value)}
                                    className={inputClass}
                                    placeholder=""
                                  />
                                </div>
                                <div>
                                  <label className={labelClass}>Documento</label>
                                  <input
                                    type="file"
                                    accept=".pdf,.doc,.docx,image/*,application/pdf"
                                    className="hidden"
                                    id={`empreiteiro-addendum-file-${link.id}`}
                                    disabled={uploadingFile}
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      e.target.value = '';
                                      void uploadAddendumFile(file);
                                    }}
                                  />
                                  <div className="space-y-1">
                                    {addendumFiles.map((file, fi) => (
                                      <div
                                        key={`${file.url}-${fi}`}
                                        className="flex items-center gap-2 text-xs"
                                      >
                                        <Paperclip className="h-3 w-3 text-gray-500" />
                                        <span className="truncate">{file.name}</span>
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setAddendumFiles((prev) =>
                                              prev.filter((_, i) => i !== fi)
                                            )
                                          }
                                          className="text-gray-400 hover:text-red-600"
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </button>
                                      </div>
                                    ))}
                                    <button
                                      type="button"
                                      disabled={uploadingFile}
                                      onClick={() =>
                                        document
                                          .getElementById(`empreiteiro-addendum-file-${link.id}`)
                                          ?.click()
                                      }
                                      className="text-[11px] font-semibold text-gray-600 hover:text-red-700 dark:text-gray-300"
                                    >
                                      {uploadingFile ? 'Enviando…' : 'Anexar documento'}
                                    </button>
                                  </div>
                                </div>
                                <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
                                  <input
                                    type="checkbox"
                                    checked={addendumCreateParcel}
                                    onChange={(e) => setAddendumCreateParcel(e.target.checked)}
                                  />
                                  Se valor positivo, gerar parcela pendente com esse valor
                                </label>
                                <button
                                  type="button"
                                  disabled={savingContractLink || !addendumReason.trim()}
                                  onClick={() => void handleAddAddendum(link.id)}
                                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                                >
                                  {savingContractLink ? 'Salvando…' : 'Lançar aditivo'}
                                </button>
                              </div>
                            ) : null}
                          </div>
                          {(link.installments || []).length > 0 ? (
                            <div className="space-y-2">
                              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                Parcelas
                                <span className="ml-2 text-xs font-medium text-gray-500 dark:text-gray-400">
                                  {(link.installments || []).length}
                                </span>
                              </p>
                              <div className="space-y-2">
                                {(openParcelLinkIds[link.id]
                                  ? link.installments || []
                                  : (link.installments || []).slice(0, 2)
                                ).map((parcel) => {
                                  const meta = installmentStatusMeta(parcel.status);
                                  const statusKey = String(parcel.status || '').toUpperCase();
                                  return (
                                    <div
                                      key={parcel.id}
                                      className="flex flex-wrap items-center gap-3 rounded-xl bg-gray-50 px-3 py-2.5 dark:bg-gray-800/50"
                                    >
                                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-xs font-semibold text-gray-700 dark:bg-gray-900 dark:text-gray-200">
                                        {parcel.number}ª
                                      </span>
                                      <div className="min-w-0">
                                        <p className="text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100">
                                          {formatMoneyBr(parcel.amount) || '—'}
                                        </p>
                                        {parcel.dueDate ? (
                                          <p className="text-[11px] text-gray-500 dark:text-gray-400">
                                            Vence em {formatDateBr(parcel.dueDate)}
                                          </p>
                                        ) : null}
                                      </div>
                                      <span
                                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.className}`}
                                      >
                                        {meta.label}
                                      </span>
                                      {canManageCadastro && statusKey === 'PENDING' ? (
                                        <button
                                          type="button"
                                          disabled={savingContractLink}
                                          onClick={() =>
                                            void handleReleaseInstallment(link.id, parcel.id)
                                          }
                                          className="ml-auto inline-flex items-center rounded-xl bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 disabled:opacity-50 dark:bg-amber-950/40 dark:text-amber-200 dark:hover:bg-amber-950/70"
                                        >
                                          Liberar pagamento
                                        </button>
                                      ) : null}
                                      {canManageCadastro && statusKey === 'RELEASED' ? (
                                        <>
                                          <input
                                            type="file"
                                            accept=".pdf,.doc,.docx,image/*,application/pdf"
                                            className="hidden"
                                            id={`empreiteiro-parcel-proof-${parcel.id}`}
                                            disabled={uploadingFile || savingContractLink}
                                            onChange={(e) => {
                                              const file = e.target.files?.[0];
                                              e.target.value = '';
                                              void handleAttachInstallmentProof(
                                                link.id,
                                                parcel.id,
                                                file
                                              );
                                            }}
                                          />
                                          <button
                                            type="button"
                                            disabled={uploadingFile || savingContractLink}
                                            onClick={() =>
                                              document
                                                .getElementById(
                                                  `empreiteiro-parcel-proof-${parcel.id}`
                                                )
                                                ?.click()
                                            }
                                            className="ml-auto inline-flex items-center rounded-xl bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50 dark:bg-emerald-950/40 dark:text-emerald-200 dark:hover:bg-emerald-950/70"
                                          >
                                            Anexar comprovante
                                          </button>
                                        </>
                                      ) : null}
                                      {statusKey === 'PAID' &&
                                      (parcel.proofFiles || []).length > 0 ? (
                                        <a
                                          href={
                                            resolveApiMediaUrl(parcel.proofFiles![0].url) ||
                                            parcel.proofFiles![0].url
                                          }
                                          target="_blank"
                                          rel="noreferrer"
                                          className="ml-auto inline-flex items-center rounded-xl bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-800 transition hover:bg-sky-100 dark:bg-sky-950/40 dark:text-sky-200 dark:hover:bg-sky-950/70"
                                        >
                                          Ver comprovante
                                        </a>
                                      ) : null}
                                    </div>
                                  );
                                })}
                                {(link.installments || []).length > 2 ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setOpenParcelLinkIds((prev) => ({
                                        ...prev,
                                        [link.id]: !prev[link.id],
                                      }))
                                    }
                                    className="inline-flex items-center rounded-xl bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-800 transition hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 dark:hover:bg-gray-700"
                                  >
                                    {openParcelLinkIds[link.id]
                                      ? 'Mostrar menos'
                                      : `Ver mais ${(link.installments || []).length - 2} parcelas`}
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                          <div className="space-y-2">
                            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                              Contrato
                            </p>
                            <input
                              type="file"
                              accept=".pdf,.doc,.docx,image/*,application/pdf"
                              className="hidden"
                              id={`empreiteiro-service-file-${link.id}`}
                              disabled={uploadingFile || !canManageCadastro}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                e.target.value = '';
                                void uploadServiceContractFile(link.id, link.files, file);
                              }}
                            />
                            {(link.files || []).map((file, fileIndex) => {
                              const href = resolveApiMediaUrl(file.url) || file.url;
                              return (
                                <div
                                  key={`${file.url}-${fileIndex}`}
                                  className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-2.5 dark:bg-gray-800/50"
                                >
                                  <Paperclip className="h-4 w-4 shrink-0 text-gray-400" />
                                  <a
                                    href={href}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="min-w-0 flex-1 truncate text-sm text-gray-800 hover:text-red-700 dark:text-gray-100 dark:hover:text-red-300"
                                    title={file.name || 'contrato'}
                                  >
                                    {file.name || 'contrato'}
                                  </a>
                                  {canManageCadastro ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        void removeServiceContractFile(
                                          link.id,
                                          link.files,
                                          fileIndex
                                        )
                                      }
                                      className="rounded p-0.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                                      aria-label="Remover anexo"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  ) : null}
                                </div>
                              );
                            })}
                            {canManageCadastro ? (
                              <button
                                type="button"
                                disabled={uploadingFile || savingContractLink}
                                onClick={() =>
                                  document
                                    .getElementById(`empreiteiro-service-file-${link.id}`)
                                    ?.click()
                                }
                                className="inline-flex items-center gap-1.5 rounded-xl border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                              >
                                <Paperclip className="h-3.5 w-3.5" />
                                {(link.files || []).length > 0
                                  ? 'Anexar outro'
                                  : 'Anexar contrato'}
                              </button>
                            ) : (link.files || []).length === 0 ? (
                              <p className="rounded-xl border border-dashed border-gray-300 px-3 py-3 text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
                                Nenhum contrato anexado.
                              </p>
                            ) : null}
                          </div>
                          </div>
                          ) : null}
                          {renderContractTeamSection(link)}
                          </>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                </div>

              <div className="flex flex-wrap justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                <button
                  type="button"
                  onClick={closeDetails}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                  Voltar
                </button>
                {isOwnEmpreiteiroAccount ? (
                  <button
                    type="button"
                    onClick={() => openMedicaoPage(viewingItem)}
                    className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700"
                  >
                    <ClipboardList className="h-4 w-4" />
                    Medição de entrega
                  </button>
                ) : null}
                {canManageCadastro ? (
                  <button
                    type="button"
                    onClick={() => handleEdit(viewingItem)}
                    className="rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700"
                  >
                    Editar
                  </button>
                ) : null}
              </div>
            </CardContent>
          </Card>
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

        {showUnlinkId ? (
          <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowUnlinkId(null)} />
            <div className="relative mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
              <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
                Encerrar e desvincular?
              </h3>
              <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                A empreita fica inativa e o login continua no sistema, sem cadastro de empreita.
                Depois você religa em Funcionários e Externos → Recriar e vincular cadastro de
                empreita.
              </p>
              <div className="flex justify-center gap-3">
                <button
                  type="button"
                  onClick={() => setShowUnlinkId(null)}
                  disabled={unlinkMutation.isPending}
                  className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => unlinkMutation.mutate(showUnlinkId)}
                  disabled={unlinkMutation.isPending}
                  className="rounded-lg bg-amber-600 px-4 py-2 text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  {unlinkMutation.isPending ? 'Encerrando...' : 'Encerrar'}
                </button>
              </div>
            </div>
          </AppModalOverlay>
        ) : null}

        {showDeleteId ? (
          <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowDeleteId(null)} />
            <div className="relative mx-4 w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
              <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-gray-100">
                Excluir cadastro da empreita?
              </h3>
              <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
                Apaga o cadastro, equipe e medições desta empreita. O login do usuário continua
                ativo para vincular a outra empreita depois.
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
