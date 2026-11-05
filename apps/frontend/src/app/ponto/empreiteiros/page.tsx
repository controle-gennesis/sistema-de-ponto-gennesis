'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  Camera,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  Link2,
  FileText,
  HardHat,
  Link2Off,
  MoreVertical,
  Paperclip,
  Pencil,
  Phone,
  Plus,
  Info,
  Search,
  Trash2,
  TrendingUp,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary,
  getCadastroListRange,
} from '@/components/ui/CadastroListSummary';
import { ListPagination } from '@/components/ui/ListPagination';
import {
  RowActionMenuCell,
  RowActionMenuPortal,
  cadastroListClasses,
} from '@/components/ui/RowActionMenu';
import { getListTableRowClassName, ListRowNavigableLabel, listTableRowClasses } from '@/components/ui/listTableUi';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import { useCadastroCrudPermissions } from '@/hooks/useCadastroCrudPermissions';
import { usePermissions } from '@/hooks/usePermissions';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ListPageHeader, PageStack } from '@/components/ui/pageLayout';
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
import { useBreadcrumbEntity } from '@/hooks/useBreadcrumbEntity';
import { useCostCenters } from '@/hooks/useCostCenters';
import { useModalCloseConfirm } from '@/hooks/useModalCloseConfirm';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';
import { Modal } from '@/components/ui/Modal';
import { buildFluigWorkflowProcessViewUrl } from '@/lib/fluigWorkflowApproval';
import { faseExibicao } from './EmpreiteiroFluigSolicitacoesModal';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { ButtonSeg } from '@/app/ponto/solicitacoes-dp/DpSolicitacaoTypeFields';
import { FileDropZone } from '@/components/ui/FileDropZone';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { Z_LIGHTBOX } from '@/lib/zIndex';
import { EmpreiteiroDailyMeasurements, ContractFinanceStats } from './EmpreiteiroDailyMeasurements';
import {
  EmpreiteiroFluigResumoCards,
  EmpreiteiroFluigSolicitacoesPainel,
} from './EmpreiteiroFluigSolicitacoesModal';
import { AppUnderlineTabButton, AppUnderlineTabList } from '@/components/ui/AppTabButton';

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
  /** Número da solicitação desta parcela no Fluig (status e vencimento vêm de lá). */
  fluigRequestNumber?: string | null;
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
  /** PENDING (aguarda aprovação) | APPROVED | CORRECTION (devolvido). Só APPROVED vale no contrato. */
  status?: 'PENDING' | 'APPROVED' | 'CORRECTION' | string;
  correctionNote?: string | null;
  paymentMode?: 'new' | 'redistribute';
  installments?: number[];
  createdAt?: string;
}

interface EmpreiteiroContractLink {
  id: string;
  empreiteiroId: string;
  name?: string | null;
  description?: string | null;
  plannedValue?: number | null;
  addendaTotal?: number | null;
  /** Aditivos aguardando aprovação (ainda não valem no contrato). */
  addendaPendingCount?: number;
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
  'Ar-condicionado',
  'Cobertura / Telhado',
  'Elétrica',
  'Generalista',
  'Gesso / Drywall',
  'Hidráulica',
  'Impermeabilização',
  'Limpeza',
  'Marcenaria',
  'Pintura',
  'Serralheria',
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
  password: '',
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

/** Reduz a foto (lado maior 800px, JPEG) para o envio não estourar o tempo limite; em caso de falha mantém a original. */
async function reduzirImagem(dataUrl: string, maxLado = 800): Promise<string> {
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('imagem inválida'));
      el.src = dataUrl;
    });
    const escala = Math.min(1, maxLado / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.width * escala));
    canvas.height = Math.max(1, Math.round(img.height * escala));
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  } catch {
    return dataUrl;
  }
}

function TeamMemberPhotoField({
  value,
  onChange,
  alt,
  redondo = false,
}: {
  value: string;
  onChange: (value: string) => void;
  alt: string;
  /** Foto circular e maior (cadastro da empreita). */
  redondo?: boolean;
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
      onChange(await reduzirImagem(dataUrl));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`relative shrink-0 ${redondo ? 'h-20 w-20' : 'h-14 w-14'}`}>
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
        className={`flex items-center justify-center overflow-hidden bg-red-50 text-red-600 ring-1 ring-black/5 transition hover:bg-red-100 disabled:opacity-60 dark:bg-red-950/50 dark:text-red-300 ${
          redondo ? 'h-20 w-20 rounded-full' : 'h-14 w-14 rounded-2xl'
        }`}
        aria-label={value ? 'Trocar foto' : 'Adicionar foto'}
      >
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt={alt} className="h-full w-full object-cover" />
        ) : (
          <Camera className={redondo ? 'h-6 w-6' : 'h-5 w-5'} />
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
  const [newServicePayDate, setNewServicePayDate] = useState('');
  const [newServiceParcelCount, setNewServiceParcelCount] = useState('6');
  const [newServiceParcelAmounts, setNewServiceParcelAmounts] = useState<string[]>([]);
  const [newServiceFiles, setNewServiceFiles] = useState<PaymentFile[]>([]);
  const [newServiceContractId, setNewServiceContractId] = useState('');
  const [newContractStart, setNewContractStart] = useState('');
  const [newContractEnd, setNewContractEnd] = useState('');
  const [newContractStatus, setNewContractStatus] =
    useState<EmpreiteiroContractStatus>('IN_PROGRESS');
  const [savingContractLink, setSavingContractLink] = useState(false);
  const [addingAddendumForId, setAddingAddendumForId] = useState<string | null>(null);
  /** Aditivo devolvido que está sendo corrigido (null = lançando um novo). */
  const [editingAddendum, setEditingAddendum] = useState<{ id: string; number: number } | null>(null);
  const [addendumReason, setAddendumReason] = useState('');
  const [addendumAmount, setAddendumAmount] = useState('');
  const [addendumDate, setAddendumDate] = useState('');
  const [addendumServicesAdded, setAddendumServicesAdded] = useState('');
  const [addendumFiles, setAddendumFiles] = useState<PaymentFile[]>([]);
  /** new = nova condição (à vista ou parcelado) · redistribute = divide nas parcelas em aberto */
  const [addendumPayMode, setAddendumPayMode] = useState<'new' | 'redistribute'>('new');
  const [addendumScheduleMode, setAddendumScheduleMode] = useState<'avista' | 'parcelado'>('avista');
  const [addendumParcelCount, setAddendumParcelCount] = useState('6');
  const [addendumParcelAmounts, setAddendumParcelAmounts] = useState<string[]>([]);
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null);
  const [editServiceName, setEditServiceName] = useState('');
  const [editServiceDescription, setEditServiceDescription] = useState('');
  const [editServicePlannedValue, setEditServicePlannedValue] = useState('');
  const [editServiceLocation, setEditServiceLocation] = useState('');
  const [editServiceContractId, setEditServiceContractId] = useState('');
  const [editServiceStart, setEditServiceStart] = useState('');
  const [editServiceEnd, setEditServiceEnd] = useState('');
  const [editServiceStatus, setEditServiceStatus] =
    useState<EmpreiteiroContractStatus>('IN_PROGRESS');
  const [editServicePayMode, setEditServicePayMode] = useState<'avista' | 'parcelado' | null>(
    null
  );
  const [editServicePayDate, setEditServicePayDate] = useState('');
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
  const [serviceDetailLinkId, setServiceDetailLinkId] = useState<string | null>(null);
  const [anexoModalLinkId, setAnexoModalLinkId] = useState<string | null>(null);
  const [medActionsEl, setMedActionsEl] = useState<HTMLDivElement | null>(null);
  const [fluigModal, setFluigModal] = useState<{ linkId: string; parcelId: string; number: number } | null>(null);
  const [fluigNumeroInput, setFluigNumeroInput] = useState('');
  const [savingFluigNumero, setSavingFluigNumero] = useState(false);
  const [teamModal, setTeamModal] = useState<{ linkId: string; index: number | null } | null>(null);
  const [teamModalForm, setTeamModalForm] = useState<TeamMemberForm>(() => emptyTeamMember());
  const [abaServico, setAbaServico] = useState<'parcelas' | 'aditivos' | 'anexos' | 'equipe' | 'medicoes' | 'dados'>('parcelas');
  useEffect(() => {
    setAbaServico(isLinkedEmpreiteiro ? 'equipe' : 'parcelas');
  }, [serviceDetailLinkId, isLinkedEmpreiteiro]);
  const [abaDetalhe, setAbaDetalhe] = useState<'contratos' | 'medicoes' | 'fluig' | 'dados'>('contratos');
  const [listPage, setListPage] = useState(1);
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

  const { data: contratosData } = useQuery({
    queryKey: ['contracts-para-empreitas'],
    queryFn: async () => {
      const res = await api.get('/contracts', { params: { limit: 500, page: 1 } });
      return res.data;
    },
    staleTime: 5 * 60_000,
  });
  const contractSelectOptions = useMemo(
    () =>
      labeledToSelectOptions(
        ((contratosData?.data ?? []) as Array<{ id: string; name?: string | null; number?: string | null }>)
          .filter((c) => c.id && (c.name || c.number))
          .map((c) => ({ value: c.id, label: c.name || String(c.number || '') }))
      ),
    [contratosData]
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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['empreiteiros'] });
      if (data?.data?.id) {
        setViewingItem((prev) => (prev && prev.id === data.data.id ? data.data : prev));
      }
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
    setServiceDetailLinkId(null);
    setPageSection('cadastro');
  };

  const closeServiceDetailModal = () => {
    setServiceDetailLinkId(null);
    setEditingServiceId(null);
    if (addingAddendumForId) resetAddendumForm();
  };

  const openDetails = (item: EmpreiteiroRow) => {
    setAbaDetalhe('contratos');
    setEmpSkipAutoDetail(false);
    setPageSection('detalhe');
    setViewingItem(item);
    setContractTeamDraftById(teamDraftsFromContracts(item.contracts));
    setAddingContract(false);
    setEditingServiceId(null);
    setServiceDetailLinkId(null);
    setAddingAddendumForId(null);
    setNewServiceName('');
    setNewServiceDescription('');
    setNewServicePlannedValue('');
    setNewServiceLocation('');
    setNewServicePayMode(null);
    setNewServicePayDate('');
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
    if (!newServiceContractId.trim()) {
      toast.error('Selecione o contrato do serviço');
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
      | Array<{ number: number; amount: number; status: 'PENDING'; dueDate?: string | null }>
      | undefined;
    if (newServicePayMode === 'avista') {
      if (!(plannedValue && plannedValue > 0)) {
        toast.error('Informe o valor planejado para gerar o pagamento');
        return;
      }
      installments = [
        {
          number: 1,
          amount: plannedValue,
          status: 'PENDING',
          dueDate: newServicePayDate || null,
        },
      ];
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
        contractId: newServiceContractId || null,
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
      setNewServiceContractId('');
      setNewServicePayMode(null);
      setNewServicePayDate('');
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
    setEditingAddendum(null);
    setAddendumReason('');
    setAddendumAmount('');
    setAddendumDate('');
    setAddendumServicesAdded('');
    setAddendumFiles([]);
    setAddendumPayMode('new');
    setAddendumScheduleMode('avista');
    setAddendumParcelCount('6');
    setAddendumParcelAmounts([]);
  };

  /** Abre o formulário preenchido com os dados do aditivo devolvido. */
  const startEditAddendum = (linkId: string, ad: ServiceAddendum) => {
    const parcels = ad.installments ?? [];
    setEditingAddendum({ id: ad.id, number: ad.number });
    setAddendumReason(ad.reason || '');
    setAddendumAmount(formatCurrencyInputBrFromNumber(ad.amount));
    setAddendumDate(ad.effectiveDate ? String(ad.effectiveDate).slice(0, 10) : '');
    setAddendumServicesAdded(ad.servicesAdded || '');
    setAddendumFiles(Array.isArray(ad.files) ? ad.files : []);
    setAddendumPayMode(ad.paymentMode === 'redistribute' ? 'redistribute' : 'new');
    if (parcels.length >= 2) {
      setAddendumScheduleMode('parcelado');
      setAddendumParcelCount(String(parcels.length));
      setAddendumParcelAmounts(parcels.map((value) => formatCurrencyInputBrFromNumber(value)));
    } else {
      setAddendumScheduleMode('avista');
      setAddendumParcelCount('6');
      setAddendumParcelAmounts([]);
    }
    setAddingAddendumForId(linkId);
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
      toast.success('Contrato atualizado anexado');
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
    const amount = parseCurrencyInputBr(addendumAmount);
    if (amount == null || amount <= 0) {
      toast.error('Informe o valor do aditivo');
      return;
    }
    let installments: Array<{ amount: number }> | undefined;
    if (addendumPayMode === 'new' && amount > 0) {
      if (addendumScheduleMode === 'parcelado') {
        const n = Math.floor(Number(addendumParcelCount.trim()));
        if (!Number.isFinite(n) || n < 2 || n > 60) {
          toast.error('No parcelado, informe de 2 a 60 parcelas');
          return;
        }
        const parsed = parseParcelAmountInputs(
          addendumParcelAmounts.length === n
            ? addendumParcelAmounts
            : buildEqualParcelAmountInputs(amount, n)
        );
        if (parsed.error) {
          toast.error(parsed.error);
          return;
        }
        const sum = parsed.amounts.reduce((a, b) => a + b, 0);
        if (Math.abs(sum - amount) > 0.009) {
          toast.error(
            `A soma das parcelas (${formatMoneyBr(sum)}) deve ser igual ao valor do aditivo (${formatMoneyBr(amount)})`
          );
          return;
        }
        installments = parsed.amounts.map((value) => ({ amount: value }));
      } else {
        installments = [{ amount }];
      }
    }
    setSavingContractLink(true);
    try {
      const payload = {
        reason,
        amount,
        effectiveDate: addendumDate || null,
        servicesAdded: addendumServicesAdded.trim() || null,
        files: addendumFiles,
        paymentMode: addendumPayMode,
        ...(installments ? { installments } : {}),
      };
      const baseUrl = `/empreiteiros/${viewingItem.id}/contracts/${linkId}/addenda`;
      const res = editingAddendum
        ? await api.patch(`${baseUrl}/${editingAddendum.id}`, payload)
        : await api.post(baseUrl, payload);
      const data = res.data?.data as EmpreiteiroRow | undefined;
      if (data?.id) {
        setViewingItem(data);
        queryClient.invalidateQueries({ queryKey: ['empreiteiros'] });
      }
      resetAddendumForm();
      toast.success(res.data?.message || (editingAddendum ? 'Aditivo corrigido e reenviado' : 'Aditivo lançado'));
    } catch (error: any) {
      toast.error(
        error.response?.data?.message ||
          (editingAddendum ? 'Não foi possível corrigir o aditivo' : 'Não foi possível lançar o aditivo')
      );
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
      if (serviceDetailLinkId === link.id) setServiceDetailLinkId(null);
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
    setServiceDetailLinkId(link.id);
    setEditingServiceId(link.id);
    setEditServiceName(link.contratoNome || link.name || '');
    setEditServiceDescription(link.description || '');
    setEditServicePlannedValue(
      link.plannedValue != null && Number.isFinite(link.plannedValue)
        ? formatCurrencyInputBrFromNumber(link.plannedValue)
        : ''
    );
    setEditServiceLocation(link.location || '');
    setEditServiceContractId(link.contractId || '');
    setEditServiceStart(toDateInputValue(link.startDate));
    setEditServiceEnd(toDateInputValue(link.endDate));
    setEditServiceStatus(
      (String(link.status || 'IN_PROGRESS').toUpperCase() as EmpreiteiroContractStatus) ||
        'IN_PROGRESS'
    );
    const n = link.installments?.length || 0;
    if (n === 1) {
      setEditServicePayMode('avista');
      setEditServicePayDate(toDateInputValue(link.installments?.[0]?.dueDate));
      setEditServiceParcelCount('6');
      setEditServiceParcelAmounts([]);
    } else if (n > 1) {
      setEditServicePayMode('parcelado');
      setEditServicePayDate('');
      setEditServiceParcelCount(String(n));
      setEditServiceParcelAmounts(
        (link.installments || []).map((p) =>
          formatCurrencyInputBrFromNumber(Number(p.amount) || 0)
        )
      );
    } else {
      setEditServicePayMode(null);
      setEditServicePayDate('');
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
    if (!editServiceContractId.trim()) {
      toast.error('Selecione o contrato do serviço');
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
      | Array<{ number: number; amount: number; status: 'PENDING'; dueDate?: string | null }>
      | undefined;
    if (!editServicePayLocked) {
      if (editServicePayMode === 'avista') {
        if (!(plannedValue && plannedValue > 0)) {
          toast.error('Informe o valor planejado para gerar o pagamento');
          return;
        }
        installments = [
          {
            number: 1,
            amount: plannedValue,
            status: 'PENDING',
            dueDate: editServicePayDate || null,
          },
        ];
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
      if ((parcelCount ?? 0) > 0 && !(plannedValue && plannedValue > 0)) {
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
          contractId: editServiceContractId || null,
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
    // Vindo da página da empreita, o formulário abre por cima sem voltar para a lista.
    if (pageSection !== 'detalhe') {
      setViewingItem(null);
      setPageSection('cadastro');
    }
    setEditingItem(item);
    setForm({
      userId: item.userId || '',
      password: '',
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
    ...(editingItem && form.userId.trim() ? { userId: form.userId.trim() } : {}),
    ...(form.password ? { password: form.password } : {}),
    // Foto: só vai quando foi trocada (imagem nova) ou removida.
    ...(form.photo.startsWith('data:image/')
      ? { photo: form.photo }
      : editingItem?.photoUrl && !form.photo
        ? { photo: '' }
        : {}),
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
    if (!editingItem) {
      if (!form.password || form.password.length < 6) {
        toast.error('A senha deve ter pelo menos 6 caracteres');
        return;
      }
    } else if (form.password && form.password.length < 6) {
      toast.error('A nova senha deve ter pelo menos 6 caracteres');
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
  /** Contrato de serviço aberto como página própria (dentro da empreita). */
  const servicePageLink =
    showDetailPage && viewingItem && serviceDetailLinkId
      ? (viewingItem.contracts || []).find((c) => c.id === serviceDetailLinkId) || null
      : null;
  const breadcrumbEmpreitaName = showDetailPage
    ? viewingItem?.name
    : showMedicaoPage
      ? medicaoTargetItem?.name
      : null;
  const medicaoServicoCrumb =
    showMedicaoPage && medicaoContractFilterId
      ? (medicaoTargetItem?.contracts || []).find((l) => l.id === medicaoContractFilterId) || null
      : null;
  useBreadcrumbEntity(
    showMedicaoPage && breadcrumbEmpreitaName
      ? [
          ...(isOwnEmpreiteiroAccount
            ? []
            : [
                {
                  label: 'Empreitas',
                  onClick: () => {
                    setMedicaoContractFilterId(null);
                    closeDetails();
                  },
                },
              ]),
          {
            label: breadcrumbEmpreitaName,
            // Volta para a empreita (a tela troca de seção por estado, não por URL).
            onClick: medicaoTargetItem
              ? () => {
                  setMedicaoContractFilterId(null);
                  openDetails(medicaoTargetItem);
                }
              : undefined,
          },
          ...(medicaoServicoCrumb && medicaoTargetItem
            ? [
                {
                  label: medicaoServicoCrumb.contratoNome || medicaoServicoCrumb.name || 'Contrato de serviço',
                  onClick: () => {
                    setMedicaoContractFilterId(null);
                    openDetails(medicaoTargetItem);
                    setServiceDetailLinkId(medicaoServicoCrumb.id);
                  },
                },
              ]
            : []),
          { label: 'Medições de entrega' },
        ]
      : servicePageLink && breadcrumbEmpreitaName
        ? [
            { label: 'Empreitas', onClick: closeDetails },
            { label: breadcrumbEmpreitaName, onClick: closeServiceDetailModal },
            { label: servicePageLink.contratoNome || servicePageLink.name || 'Contrato de serviço' },
          ]
        : showDetailPage && breadcrumbEmpreitaName
        ? [{ label: 'Empreitas', onClick: closeDetails }, { label: breadcrumbEmpreitaName }]
        : breadcrumbEmpreitaName
          ? { label: breadcrumbEmpreitaName }
          : null,
  );

  // Botão voltar do navegador: a tela troca de seção por estado, então cada nível aberto
  // (empreita, serviço/medições) ganha uma entrada no histórico e o "voltar" desfaz um nível.
  const navLevel = showMedicaoPage ? 2 : servicePageLink ? 2 : showDetailPage ? 1 : 0;
  const navLevelRef = useRef(0);
  const navFromPopRef = useRef(false);
  const navPopHandlerRef = useRef<(target: number) => void>(() => undefined);
  navPopHandlerRef.current = (target: number) => {
    if (target > navLevelRef.current) {
      // Avançar do navegador: reabre a empreita/serviço indicados na URL.
      const params = new URLSearchParams(window.location.search);
      const alvo = items.find((row) => row.id === params.get('empreita'));
      if (!alvo) return;
      navFromPopRef.current = true;
      if (navLevelRef.current < 1) openDetails(alvo);
      const servicoId = params.get('servico');
      if (target >= 2 && servicoId && (alvo.contracts || []).some((c) => c.id === servicoId)) {
        setServiceDetailLinkId(servicoId);
      }
      return;
    }
    if (target === navLevelRef.current) return;
    navFromPopRef.current = true;
    if (target <= 0) {
      setMedicaoContractFilterId(null);
      closeDetails();
      return;
    }
    if (showMedicaoPage && medicaoTargetItem) {
      setMedicaoContractFilterId(null);
      openDetails(medicaoTargetItem);
      return;
    }
    setServiceDetailLinkId(null);
  };
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const prev = navLevelRef.current;
    if (navFromPopRef.current) {
      navFromPopRef.current = false;
    } else if (navLevel > prev) {
      // A URL acompanha a navegação: ?empreita=ID e, no segundo nível, &servico=ID (ou &medicoes=1).
      const empreitaId = viewingItem?.id || medicaoTargetItem?.id || '';
      for (let l = prev + 1; l <= navLevel; l += 1) {
        const params = new URLSearchParams();
        if (empreitaId) params.set('empreita', empreitaId);
        if (l >= 2) {
          if (servicePageLink?.id) params.set('servico', servicePageLink.id);
          else if (showMedicaoPage) params.set('medicoes', '1');
        }
        const query = params.toString();
        window.history.pushState(
          { ...(window.history.state || {}), empLevel: l },
          '',
          `${window.location.pathname}${query ? `?${query}` : ''}`
        );
      }
    } else if (navLevel < prev) {
      // Voltou por breadcrumb/botão da tela: descarta as entradas extras do histórico.
      window.history.go(-(prev - navLevel));
      navFromPopRef.current = true;
    }
    navLevelRef.current = navLevel;
  }, [navLevel]);
  const deepLinkTratadoRef = useRef(false);
  useEffect(() => {
    if (typeof window === 'undefined' || deepLinkTratadoRef.current) return;
    if (isLoading || isLinkedEmpreiteiro) return;
    const params = new URLSearchParams(window.location.search);
    const empreitaId = params.get('empreita');
    deepLinkTratadoRef.current = true;
    if (!empreitaId) return;
    const alvo = items.find((row) => row.id === empreitaId);
    // Volta a URL para a lista; os níveis abaixo são empilhados de novo ao abrir a empreita.
    window.history.replaceState(
      { ...(window.history.state || {}), empLevel: 0 },
      '',
      window.location.pathname
    );
    if (!alvo) return;
    openDetails(alvo);
    const servicoId = params.get('servico');
    if (servicoId && (alvo.contracts || []).some((c) => c.id === servicoId)) {
      setServiceDetailLinkId(servicoId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, isLinkedEmpreiteiro, items]);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onPop = (event: PopStateEvent) => {
      const target = Number((event.state as { empLevel?: number } | null)?.empLevel ?? 0);
      if (navFromPopRef.current && target >= navLevelRef.current) {
        navFromPopRef.current = false;
        return;
      }
      navPopHandlerRef.current(target);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

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

  const renderMedicoesCard = (target: EmpreiteiroRow, comSeletor: boolean, lockContractId?: string) => (
            <Card className={cadastroListClasses.card}>
              <CardHeader className={cadastroListClasses.cardHeader}>
                <div className={cadastroListClasses.cardHeaderRow}>
                  <div className={cadastroListClasses.cardHeaderIconRow}>
                    <div className="rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
                      <ClipboardList className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-lg font-semibold text-gray-900 dark:text-gray-100">
                        {lockContractId ? 'Medições de Entrega' : target.name}
                      </h3>
                      <p className="truncate text-sm text-gray-600 dark:text-gray-400">
                        {lockContractId
                          ? 'Entregas registradas neste serviço'
                          : medicaoFilterContract
                          ? [
                              medicaoFilterContract.contratoNome,
                              medicaoFilterContract.centroCustoNome,
                            ]
                              .filter(Boolean)
                              .join(' · ')
                          : (target.contractsCount ||
                                target.contracts?.length ||
                                0) > 1
                            ? 'Todos os contratos'
                            : target.contratoNome || 'Medição de entrega da empreita'}
                      </p>
                    </div>
                  </div>
                  {lockContractId ? <div ref={setMedActionsEl} className="flex shrink-0 items-center gap-2" /> : null}
                  {comSeletor && !isOwnEmpreiteiroAccount && items.length > 1 ? (
                    <div className="w-full min-w-0 sm:max-w-xs">
                      <StringSingleSelectDropdown
                        value={target.id}
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
                  empreiteiroId={target.id}
                  empreiteiroName={target.name || ''}
                  contracts={(target.contracts || [])
                    .filter((link) => !lockContractId || link.id === lockContractId)
                    .map((link) => ({
                    contractId: link.id,
                    contratoNome: link.contratoNome || link.name || 'Contrato de serviço',
                    description: link.description,
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
                    lockContractId ||
                    medicaoContractFilterId ||
                    (target.contracts || []).find((c) => c.isActive)?.id ||
                    (target.contracts || [])[0]?.id ||
                    ''
                  }
                  filterContractId={lockContractId || medicaoContractFilterId}
                  onClearContractFilter={() => (lockContractId ? undefined : setMedicaoContractFilterId(null))}
                  onSelectContractFilter={(contractId) =>
                    lockContractId ? undefined : setMedicaoContractFilterId(contractId)
                  }
                  canEdit={
                    isOwnEmpreiteiroAccount
                      ? canEditDaily
                      : canManageCadastro || canEditDaily
                  }
                  canApprove={canApproveDaily}
                  onPreviewPhoto={openPreviewPhoto}
                  hideSummary={Boolean(lockContractId)}
                  actionsContainer={lockContractId ? medActionsEl : undefined}
                />
              </CardContent>
            </Card>
  );

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

  const LISTA_POR_PAGINA = 20;
  const listaTotalPaginas = Math.max(1, Math.ceil(items.length / LISTA_POR_PAGINA));
  const listaOffset = (listPage - 1) * LISTA_POR_PAGINA;
  const itensDaPagina = items.slice(listaOffset, listaOffset + LISTA_POR_PAGINA);
  const { startItem: listaInicio, endItem: listaFim } = getCadastroListRange(
    listPage,
    LISTA_POR_PAGINA,
    items.length
  );
  useEffect(() => {
    setListPage(1);
  }, [searchTerm]);
  useEffect(() => {
    if (listPage > listaTotalPaginas) setListPage(listaTotalPaginas);
  }, [listPage, listaTotalPaginas]);

  const contractLinksForMenu = viewingItem?.contracts ?? [];
  const {
    rowActionMenu: contractRowActionMenu,
    rowForActionMenu: contractRowForActionMenu,
    toggleRowActionMenu: toggleContractRowActionMenu,
    closeRowActionMenu: closeContractRowActionMenu,
    isRowMenuOpen: isContractRowMenuOpen,
  } = useRowActionMenu(contractLinksForMenu);

  const equipeMenuRows = (viewingItem?.contracts || []).flatMap((link) =>
    (contractTeamDraftById[link.id] ?? teamDraftFromMembers(link.team)).map((member, index) => ({
      id: `${link.id}::${index}`,
      linkId: link.id,
      index,
      member,
    }))
  );
  const {
    rowActionMenu: equipeRowActionMenu,
    rowForActionMenu: equipeRowForActionMenu,
    toggleRowActionMenu: toggleEquipeRowActionMenu,
    closeRowActionMenu: closeEquipeRowActionMenu,
    isRowMenuOpen: isEquipeRowMenuOpen,
  } = useRowActionMenu(equipeMenuRows);

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };
  const saving = createMutation.isPending || updateMutation.isPending;

  const numerosFluigDasParcelas = (viewingItem?.contracts || [])
    .flatMap((c) => c.installments || [])
    .map((p) => p.fluigRequestNumber || '')
    .filter(Boolean)
    .join(',');
  const { data: fluigParcelasData } = useQuery({
    queryKey: ['empreiteiro-fluig-parcelas', viewingItem?.id, numerosFluigDasParcelas],
    queryFn: async () => {
      const res = await api.get(`/empreiteiros/${viewingItem!.id}/fluig-parcelas`);
      // O backend quita as parcelas pagas no Fluig e recalcula as seguintes: recarrega os dados da empreita.
      if (res.data?.changed) {
        void queryClient.invalidateQueries({ queryKey: ['empreiteiros'] });
      }
      return (res.data?.data ?? {}) as Record<string, { fase: string; vencimento: string | null; pagamento: string | null }>;
    },
    enabled: Boolean(viewingItem?.id) && numerosFluigDasParcelas.length > 0,
    staleTime: 60_000,
  });

  // Solicitações do Fluig da empreita (para escolher na lista ao vincular a parcela).
  const { data: fluigSolicitacoesData, isLoading: carregandoSolicitacoesFluig } = useQuery({
    queryKey: ['empreiteiro-fluig-solicitacoes-opcoes', viewingItem?.id],
    queryFn: async () => {
      const res = await api.get(`/empreiteiros/${viewingItem!.id}/fluig-solicitacoes`);
      return (res.data?.data?.itens ?? []) as Array<{
        numero: string;
        titulo: string;
        fase: string;
        valor: number;
        pagamento: string | null;
      }>;
    },
    enabled: Boolean(viewingItem?.id) && Boolean(fluigModal),
    staleTime: 60_000,
  });

  const opcoesSolicitacaoFluig = useMemo(() => {
    const jaLigadas = new Set(
      (viewingItem?.contracts || [])
        .flatMap((c) => c.installments || [])
        .filter((p) => p.id !== fluigModal?.parcelId)
        .map((p) => p.fluigRequestNumber || '')
        .filter(Boolean),
    );
    const itens = (Array.isArray(fluigSolicitacoesData) ? fluigSolicitacoesData : []).filter(
      (s) => s.numero && !jaLigadas.has(s.numero),
    );
    const opcoes = itens.map((s) => ({
      value: s.numero,
      label: `${s.numero} · ${s.titulo || 'Solicitação'}`,
      description: `${formatMoneyBr(s.valor) || '—'} · ${s.fase ? faseExibicao(s.fase).texto : 'Sem fase'}`,
      searchText: `${s.numero} ${s.titulo} ${s.valor}`,
    }));
    // Número já vinculado antes (digitado à mão) continua selecionável mesmo fora da lista.
    if (fluigNumeroInput && !opcoes.some((o) => o.value === fluigNumeroInput)) {
      opcoes.unshift({
        value: fluigNumeroInput,
        label: `${fluigNumeroInput} · (informado manualmente)`,
        description: '',
        searchText: fluigNumeroInput,
      });
    }
    return opcoes;
  }, [fluigSolicitacoesData, viewingItem, fluigModal, fluigNumeroInput]);

  const abrirModalFluig = (linkId: string, parcel: ServiceInstallment) => {
    setFluigNumeroInput(parcel.fluigRequestNumber || '');
    setFluigModal({ linkId, parcelId: parcel.id, number: parcel.number });
  };

  const salvarSolicitacaoFluig = async () => {
    if (!fluigModal || !viewingItem) return;
    const numero = fluigNumeroInput.replace(/[^0-9]/g, '');
    if (!numero) {
      toast.error('Informe o número da solicitação do Fluig');
      return;
    }
    setSavingFluigNumero(true);
    try {
      const res = await api.patch(
        `/empreiteiros/${viewingItem.id}/contracts/${fluigModal.linkId}/installments/${fluigModal.parcelId}`,
        { fluigRequestNumber: numero }
      );
      const data = res.data?.data as EmpreiteiroRow | undefined;
      if (data?.id) applySelfUpdate(data);
      toast.success(res.data?.message || 'Solicitação vinculada à parcela');
      setFluigModal(null);
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Não foi possível salvar a solicitação');
    } finally {
      setSavingFluigNumero(false);
    }
  };

  const validarPessoa = (member: TeamMemberForm): string | null => {
    if (!member.name.trim()) return 'Nome da pessoa é obrigatório';
    if (!member.role.trim()) return 'Função da pessoa é obrigatória';
    const document = onlyDigits(member.document);
    if (document && document.length !== 11) return 'CPF da pessoa deve ter 11 dígitos';
    return null;
  };

  /** Salva a equipe do serviço com a lista informada; devolve se deu certo. */
  const salvarEquipeDoServico = async (linkId: string, draft: TeamMemberForm[]): Promise<boolean> => {
    if (!viewingItem || !canEditTeamOnDetail) return false;
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
      return true;
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Não foi possível salvar a equipe');
      return false;
    } finally {
      setSavingTeamLinkId(null);
    }
  };

  const abrirModalPessoa = (linkId: string, index: number | null, atual?: TeamMemberForm) => {
    setTeamModalForm(atual ? { ...atual } : emptyTeamMember());
    setTeamModal({ linkId, index });
  };

  const confirmarModalPessoa = async () => {
    if (!teamModal) return;
    const erro = validarPessoa(teamModalForm);
    if (erro) {
      toast.error(erro);
      return;
    }
    const link = (viewingItem?.contracts || []).find((c) => c.id === teamModal.linkId);
    const atual = contractTeamDraftById[teamModal.linkId] ?? teamDraftFromMembers(link?.team);
    const proxima =
      teamModal.index === null
        ? [...atual, teamModalForm]
        : atual.map((m, i) => (i === teamModal.index ? teamModalForm : m));
    if (await salvarEquipeDoServico(teamModal.linkId, proxima)) setTeamModal(null);
  };

  const removerPessoaDoServico = async (linkId: string, index: number) => {
    if (!window.confirm('Remover esta pessoa da equipe do serviço?')) return;
    const link = (viewingItem?.contracts || []).find((c) => c.id === linkId);
    const atual = contractTeamDraftById[linkId] ?? teamDraftFromMembers(link?.team);
    await salvarEquipeDoServico(
      linkId,
      atual.filter((_, i) => i !== index)
    );
  };

  const renderContractTeamSection = (link: EmpreiteiroContractLink, embedded = false) => {
    const draft = contractTeamDraftById[link.id] ?? teamDraftFromMembers(link.team);
    const savedTeam = link.team || [];
    const saving = savingTeamLinkId === link.id;
    const teamCount = Math.max(savedTeam.length, draft.length);
    const teamOpen = embedded || Boolean(openTeamLinkIds[link.id]);
    return (
      <div
        className={embedded ? '' : 'mt-4 border-t border-gray-100 pt-4 dark:border-gray-800'}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        {embedded ? null : (
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
        )}
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
        <PageStack>
          {showMedicaoPage ? (
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
              <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-600 dark:text-gray-400 sm:text-base">
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
          </div>
          ) : showDetailPage ? null : (
            <ListPageHeader
              title="Empreitas"
              description={
                isOwnEmpreiteiroAccount
              ? 'Sua equipe e medições de entrega nos serviços vinculados'
              : 'Acompanhe as empreitas e seus contratos de serviço'
              }
            />
          )}

          {showMedicaoPage && medicaoTargetItem ? (
            renderMedicoesCard(medicaoTargetItem, true)
          ) : showDetailPage ? null : (
          <Card className="w-full">
            <CardHeader className="border-b-0 pb-1">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center space-x-3">
                  <div className="rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
                    <HardHat className="h-5 w-5 text-red-600 sm:h-6 sm:w-6 dark:text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Empreitas</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {isOwnEmpreiteiroAccount ? 'Seu cadastro, contratos e equipe' : 'Empreitas cadastradas e seus contratos'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  {isLinkedEmpreiteiro ? null : (
                    <div className="relative min-w-[240px] flex-1 sm:w-[320px] sm:flex-none">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                      <input
                        type="text"
                        placeholder="Buscar nome, documento ou centro de custo..."
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
                  )}
                  {isOwnEmpreiteiroAccount && ownEmpreitaItem ? (
                    <button
                      type="button"
                      onClick={() => openDetails(ownEmpreitaItem)}
                      className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                    >
                      <Users className="h-4 w-4" />
                      Contratos e equipe
                    </button>
                  ) : null}
                  {canCreate ? (
                    <button
                      type="button"
                      onClick={openCreateForm}
                      className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                    >
                      <Plus className="h-4 w-4 shrink-0" />
                      <span>Nova Empreita</span>
                    </button>
                  ) : null}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {isLoading ? (
                  <CadastroListLoading message="Carregando empreitas..." />
                ) : items.length === 0 ? (
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
                            ? 'Cadastre a primeira empreita'
                            : 'Sem permissão para cadastrar. Peça acesso de criar em Empreitas.'
                    }
                  />
                ) : (
                  <>
                    <CadastroListSummary
                      startItem={listaInicio}
                      endItem={listaFim}
                      total={items.length}
                      itemLabel="empreita"
                      itemLabelPlural="empreitas"
                      currentPage={listPage}
                      totalPages={listaTotalPaginas}
                    />
                    <div className="table-scroll">
                      <table className="w-full text-sm">
                        <thead className="border-b border-gray-200 dark:border-gray-700">
                          <tr>
                            <th className={cadastroListClasses.th}>Empreita</th>
                            <th className={cadastroListClasses.thCenter}>Especialidade</th>
                            <th className={cadastroListClasses.thCenter}>Contratos</th>
                            <th className={`${cadastroListClasses.th} text-center`}>Valor</th>
                            <th className={cadastroListClasses.thCenter}>Contato</th>
                            <th className={cadastroListClasses.thCenter}>Status</th>
                            {showActions ? <th className={cadastroListClasses.thRight}>Ação</th> : null}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                          {itensDaPagina.map((it) => {
                            const teamSize =
                              (it.contracts || []).reduce(
                                (sum, link) => sum + (link.teamCount ?? link.team?.length ?? 0),
                                0
                              ) ||
                              it.teamCount ||
                              it.team?.length ||
                              0;
                            const photo = resolveApiMediaUrl(it.photoUrl);
                            const links = it.contracts || [];
                            const nContratos = links.length || it.contractsCount || 0;
                            const contratado = links.reduce(
                              (sum, l) => sum + (l.currentValue ?? l.plannedValue ?? 0),
                              0
                            );
                            return (
                              <tr
                                key={it.id}
                                onClick={() => openDetails(it)}
                                className={getListTableRowClassName(true)}
                              >
                                <td className="px-3 py-3 align-middle text-left text-sm sm:px-6">
                                  <div className="flex items-center gap-3">
                                    {photo ? (
                                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img
                                          src={photo}
                                          alt=""
                                          className="h-full w-full object-cover"
                                          referrerPolicy="no-referrer"
                                        />
                                      </div>
                                    ) : (
                                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500">
                                        <HardHat className="h-6 w-6" />
                                      </div>
                                    )}
                                    <div className="min-w-0">
                                      <ListRowNavigableLabel className="font-medium">{it.name}</ListRowNavigableLabel>
                                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                                        {empreiteiroCnpjDigits(it) ? maskCnpjInput(empreiteiroCnpjDigits(it)) : '—'}
                                      </p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-3 align-middle text-center text-sm text-gray-700 dark:text-gray-300 sm:px-6">
                                  {it.specialty || '—'}
                                </td>
                                <td className="whitespace-nowrap px-3 py-3 align-middle text-center text-sm text-gray-700 dark:text-gray-300 sm:px-6">
                                  {nContratos > 0 ? `${nContratos} ${nContratos === 1 ? 'contrato' : 'contratos'}` : 'Nenhum'}
                                </td>
                                <td className="whitespace-nowrap px-3 py-3 align-middle text-center text-sm tabular-nums text-gray-900 dark:text-gray-100 sm:px-6">
                                  {formatMoneyBr(contratado > 0 ? contratado : 0)}
                                </td>
                                <td className="px-3 py-3 align-middle text-center text-sm text-gray-700 dark:text-gray-300 sm:px-6">
                                  <div className="flex flex-col items-center gap-0.5">
                                    <span className="whitespace-nowrap">{formatPhoneDisplay(it.phone) || '—'}</span>
                                    {it.email ? (
                                      <span className="text-xs text-gray-500 dark:text-gray-400">{it.email}</span>
                                    ) : null}
                                  </div>
                                </td>
                                <td className="px-3 py-3 align-middle text-center sm:px-6">
                                  <span
                                    className={`inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-medium ${
                                      it.isActive
                                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                                        : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                                    }`}
                                  >
                                    {it.isActive ? 'Ativo' : 'Inativo'}
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
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <ListPagination
                      currentPage={listPage}
                      totalPages={listaTotalPaginas}
                      onPageChange={setListPage}
                    />
                  </>
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
            </CardContent>
          </Card>
          )}
        </PageStack>

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
                  <div className="flex items-center gap-4 sm:col-span-2">
                    <TeamMemberPhotoField
                      value={form.photo}
                      onChange={(value) => patchForm({ photo: value })}
                      alt="Foto da empreita"
                      redondo
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Foto da empreita</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Opcional. Aparece na lista, no cadastro e no perfil do login.
                      </p>
                    </div>
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
                      autoComplete="off"
                      className={inputClass}
                    />
                  </div>
                  {!editingItem || form.userId ? (
                    <div>
                      <label className={labelClass}>{editingItem ? 'Nova senha' : 'Senha *'}</label>
                      <input
                        type="password"
                        required={!editingItem}
                        value={form.password}
                        onChange={(e) => patchForm({ password: e.target.value })}
                        placeholder={editingItem ? 'Deixe em branco para manter' : 'Mínimo de 6 caracteres'}
                        autoComplete="new-password"
                        className={inputClass}
                      />
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        O empreiteiro entra no sistema com o CPF e esta senha.
                      </p>
                    </div>
                  ) : null}
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
          <div className="space-y-6">
            {servicePageLink ? (() => {
                        const link = servicePageLink;
                        if (!link) return null;
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
                          // Paga: marcada como PAID no sistema OU concluída no Fluig (etapa final / data de pagamento).
                          const noFluig = parcel.fluigRequestNumber
                            ? fluigParcelasData?.[parcel.fluigRequestNumber]
                            : undefined;
                          const pagaNoFluig = Boolean(
                            noFluig && (noFluig.pagamento || (noFluig.fase && faseExibicao(noFluig.fase).finalizada)),
                          );
                          if (String(parcel.status || '').toUpperCase() === 'PAID' || pagaNoFluig) {
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
                        const lastAddendumNumber = (link.addenda || []).reduce(
                          (max, a) => Math.max(max, a.number),
                          0
                        );
                        return (
                          <div className="space-y-6">
                            <div className="space-y-4">
                              <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
                                <div className="flex min-w-0 items-center gap-4">
                                  <div className="min-w-0">
                                    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                                      <h1 className="truncate text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-3xl">
                                        {link.contratoNome || link.name || 'Contrato de serviço'}
                                      </h1>
                                      <span
                                        className={`inline-flex shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${statusMeta.className}`}
                                      >
                                        {statusMeta.label}
                                      </span>
                                    </div>
                                    {link.location ? (
                                      <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{link.location}</p>
                                    ) : null}
                                    {link.centroCustoNome || link.costCenter?.name ? (
                                      <p
                                        className={`${link.location ? '' : 'mt-1 '}text-sm text-gray-600 dark:text-gray-400`}
                                      >
                                        {link.centroCustoNome || link.costCenter?.name}
                                      </p>
                                    ) : null}
                                    <p className="text-sm text-gray-600 dark:text-gray-400">
                                      {`${formatDateBr(link.startDate)} à ${formatDateBr(link.endDate)}`}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                                  {[
                                    { rotulo: 'Contrato', valor: formatMoneyBr(contractValue) || '—', Icon: FileText },
                                    { rotulo: 'Executado', valor: executedPct != null ? `${executedPct}%` : '—', Icon: TrendingUp },
                                    { rotulo: 'Pago', valor: formatMoneyBr(paidTotal) || 'R$ 0,00', Icon: CheckCircle2 },
                                    { rotulo: 'Saldo', valor: formatMoneyBr(saldoValue) || '—', Icon: Wallet },
                                  ].map((k) => (
                                    <div key={k.rotulo} className="flex items-center gap-3">
                                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                                        <k.Icon className="h-4 w-4" />
                                      </span>
                                      <div>
                                        <p className="text-xs text-gray-500 dark:text-gray-400">{k.rotulo}</p>
                                        <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100">{k.valor}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <AppUnderlineTabList aria-label="Seções do contrato de serviço" centered={false} className="mt-1">
                                {(
                                  [
                                    ...(isOwnEmpreiteiroAccount
                                      ? []
                                      : [
                                          { id: 'parcelas', label: 'Parcelas' },
                                          { id: 'aditivos', label: 'Aditivos' },
                                          { id: 'anexos', label: 'Anexos' },
                                        ]),
                                    { id: 'equipe', label: 'Equipe' },
                                    { id: 'medicoes', label: 'Medições' },
                                    { id: 'dados', label: 'Dados' },
                                  ] as const
                                ).map((aba) => (
                                  <AppUnderlineTabButton
                                    key={aba.id}
                                    active={abaServico === aba.id}
                                    onClick={() => setAbaServico(aba.id as typeof abaServico)}
                                    className="whitespace-nowrap px-3 py-2.5 text-sm"
                                  >
                                    {aba.label}
                                  </AppUnderlineTabButton>
                                ))}
                              </AppUnderlineTabList>
                            </div>


                            <Modal
                            isOpen={editingServiceId === link.id}
                            onClose={() => setEditingServiceId(null)}
                            title="Editar Serviço"
                            size="lg"
                          >
                            <div className="space-y-4">
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
                                <label className={labelClass}>Contrato *</label>
                                <StringSingleSelectDropdown
                                  value={editServiceContractId}
                                  onChange={setEditServiceContractId}
                                  options={contractSelectOptions}
                                  placeholder="Selecione o contrato"
                                  emptyOptionLabel="Selecione o contrato"
                                  searchPlaceholder="Pesquisar contrato..."
                                  matchTriggerWidth
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
                                      <div className="mt-2 max-w-xs">
                                        <label className={labelClass}>Data do pagamento</label>
                                        <input
                                          type="date"
                                          value={editServicePayDate}
                                          onChange={(e) => setEditServicePayDate(e.target.value)}
                                          className={inputClass}
                                        />
                                      </div>
                                    ) : null}
                                    {editServicePayMode === 'parcelado' ? (
                                      <div className="mt-2 space-y-2">
                                        <label className={labelClass}>Número de parcelas</label>
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
                          </Modal>

                            {!isOwnEmpreiteiroAccount && abaServico === 'parcelas' ? (
                              <Card className={cadastroListClasses.card}>
                                <CardHeader className="border-b-0 pb-1">
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center space-x-3">
                              <div className="rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
                                <Wallet className="h-5 w-5 text-red-600 sm:h-6 sm:w-6 dark:text-red-400" />
                              </div>
                              <div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Parcelas</h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400">Pagamentos previstos e liberados deste serviço</p>
                              </div>
                            </div>
                          </div>
                        </CardHeader>
                                <CardContent className={`${cadastroListClasses.cardContent} space-y-4`}>
                                  {(link.installments || []).length === 0 ? (
                                    <CadastroListEmpty
                                      icon={Wallet}
                                      title="Nenhuma parcela encontrada"
                                      hint="Defina a forma de pagamento ao editar o serviço"
                                    />
                                  ) : null}
                          {(link.installments || []).length > 0 ? (
                            <div className="table-scroll">
                              <table className={`${cadastroListClasses.table} text-sm`}>
                                <thead className="border-b border-gray-200 dark:border-gray-700">
                                  <tr>
                                    <th className={`${cadastroListClasses.th} w-24 text-center`}>Parcela</th>
                                    <th className={`${cadastroListClasses.th} text-center`}>Valor</th>
                                    <th className={`${cadastroListClasses.th} text-center`}>Vencimento</th>
                                    <th className={`${cadastroListClasses.th} text-center`}>Status</th>
                                    <th className={`${cadastroListClasses.th} text-center`}>Ação</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                                  {(link.installments || []).map((parcel) => {
                                    const meta = installmentStatusMeta(parcel.status);
                                    const statusKey = String(parcel.status || '').toUpperCase();
                                    return (
                                      <tr key={parcel.id}>
                                        <td className={`${cadastroListClasses.td} w-24 text-center font-medium`}>
                                          {parcel.number}ª
                                        </td>
                                        <td className={`${cadastroListClasses.td} text-center tabular-nums`}>
                                          {formatMoneyBr(parcel.amount) || '—'}
                                        </td>
                                        {(() => {
                                          const numeroFluig = parcel.fluigRequestNumber || '';
                                          const noFluig = numeroFluig ? fluigParcelasData?.[numeroFluig] : undefined;
                                          const fase = noFluig?.fase ? faseExibicao(noFluig.fase) : null;
                                          return (
                                            <>
                                              <td className={`${cadastroListClasses.td} whitespace-nowrap text-center`}>
                                                {noFluig?.vencimento ? formatDateBr(noFluig.vencimento) : '—'}
                                              </td>
                                              <td className={`${cadastroListClasses.td} text-center`}>
                                                {!numeroFluig ? (
                                                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                                                    Sem solicitação
                                                  </span>
                                                ) : fase ? (
                                                  <span
                                                    className={`inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                                                      fase.finalizada
                                                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300'
                                                        : 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200'
                                                    }`}
                                                  >
                                                    {fase.texto}
                                                  </span>
                                                ) : (
                                                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                                                    Não encontrada no Fluig
                                                  </span>
                                                )}
                                              </td>
                                              <td className={`${cadastroListClasses.td} text-center`}>
                                                {numeroFluig ? (
                                                  <div className="flex items-center justify-center gap-2">
                                                    <a
                                                      href={buildFluigWorkflowProcessViewUrl(numeroFluig)}
                                                      target="_blank"
                                                      rel="noopener noreferrer"
                                                      className="inline-flex items-center gap-1 text-sm font-medium text-red-600 hover:underline dark:text-red-400"
                                                      title="Abrir no Fluig"
                                                    >
                                                      Solicitação {numeroFluig}
                                                      <ExternalLink className="h-3.5 w-3.5" />
                                                    </a>
                                                    {canManageCadastro ? (
                                                      <button
                                                        type="button"
                                                        onClick={() => abrirModalFluig(link.id, parcel)}
                                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700"
                                                        aria-label="Alterar solicitação"
                                                        title="Alterar solicitação"
                                                      >
                                                        <Pencil className="h-4 w-4" />
                                                      </button>
                                                    ) : null}
                                                  </div>
                                                ) : canManageCadastro ? (
                                                  <button
                                                    type="button"
                                                    onClick={() => abrirModalFluig(link.id, parcel)}
                                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                                                    aria-label="Informar solicitação do Fluig"
                                                    title="Informar solicitação do Fluig"
                                                  >
                                                    <Link2 className="h-4 w-4" />
                                                  </button>
                                                ) : (
                                                  '—'
                                                )}
                                              </td>
                                            </>
                                          );
                                        })()}
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          ) : null}
                          <Modal
                            isOpen={fluigModal?.linkId === link.id}
                            onClose={() => setFluigModal(null)}
                            title={`Parcela ${fluigModal?.number ?? ''}`}
                            size="md"
                          >
                            <div className="space-y-4">
                              <div>
                                <label className={labelClass}>Solicitação do Fluig *</label>
                                {carregandoSolicitacoesFluig || opcoesSolicitacaoFluig.length > 0 ? (
                                  <StringSingleSelectDropdown
                                    value={fluigNumeroInput}
                                    onChange={(v) => setFluigNumeroInput(v)}
                                    options={opcoesSolicitacaoFluig}
                                    allowEmpty={false}
                                    placeholder={
                                      carregandoSolicitacoesFluig ? 'Buscando no Fluig…' : 'Selecione a solicitação'
                                    }
                                    searchPlaceholder="Buscar por número, descrição ou valor"
                                    emptySearchMessage="Nenhuma solicitação encontrada"
                                    wrapLabel
                                    matchTriggerWidth
                                    className="w-full"
                                  />
                                ) : (
                                  <>
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      value={fluigNumeroInput}
                                      onChange={(e) => setFluigNumeroInput(e.target.value.replace(/[^0-9]/g, ''))}
                                      placeholder="Ex.: 123456"
                                      className={inputClass}
                                      autoFocus
                                    />
                                    <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                                      Nenhuma solicitação deste CPF/CNPJ foi encontrada no Fluig. Informe o número manualmente.
                                    </p>
                                  </>
                                )}
                              </div>
                              <div className="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                                <button
                                  type="button"
                                  onClick={() => setFluigModal(null)}
                                  className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="button"
                                  disabled={savingFluigNumero || !fluigNumeroInput.trim()}
                                  onClick={() => void salvarSolicitacaoFluig()}
                                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                                >
                                  {savingFluigNumero ? 'Salvando…' : 'Salvar'}
                                </button>
                              </div>
                            </div>
                          </Modal>

                                </CardContent>
                              </Card>
                            ) : null}

                            {!isOwnEmpreiteiroAccount && abaServico === 'aditivos' ? (
                              <Card className={cadastroListClasses.card}>
                                <CardHeader className="border-b-0 pb-1">
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center space-x-3">
                              <div className="rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
                                <ClipboardList className="h-5 w-5 text-red-600 sm:h-6 sm:w-6 dark:text-red-400" />
                              </div>
                              <div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Aditivos</h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400">Alterações de valor e prazo do contrato de serviço</p>
                              </div>
                            </div>
                            {canManageCadastro ? (
                              <button
                                type="button"
                                disabled={savingContractLink}
                                onClick={() => {
                                  if (addingAddendumForId === link.id) {
                                    resetAddendumForm();
                                    return;
                                  }
                                  resetAddendumForm();
                                  setAddingAddendumForId(link.id);
                                }}
                                className="flex h-10 flex-shrink-0 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                              >
                                <Plus className="h-4 w-4 shrink-0" />
                                <span>{addingAddendumForId === link.id ? 'Cancelar' : 'Adicionar Aditivo'}</span>
                              </button>
                            ) : null}
                          </div>
                        </CardHeader>
                                <CardContent className={`${cadastroListClasses.cardContent} space-y-4`}>
                          {(link.addenda || []).length === 0 ? (
                            <CadastroListEmpty
                              icon={ClipboardList}
                              title="Nenhum aditivo encontrado"
                              hint={canManageCadastro ? 'Use “Adicionar Aditivo” para cadastrar o primeiro' : 'Nenhum aditivo neste contrato'}
                            />
                          ) : (
                            <div className="table-scroll">
                              <table className={`${cadastroListClasses.table} text-sm`}>
                                <thead className="border-b border-gray-200 dark:border-gray-700">
                                  <tr>
                                    <th className={`${cadastroListClasses.th} text-center`}>Nº</th>
                                    <th className={cadastroListClasses.th}>Motivo</th>
                                    <th className={`${cadastroListClasses.th} text-center`}>Valor</th>
                                    <th className={`${cadastroListClasses.th} text-center`}>Data</th>
                                    <th className={`${cadastroListClasses.th} text-center`}>Status</th>
                                    <th className={`${cadastroListClasses.th} text-center`}>Ação</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                                  {(link.addenda || []).map((ad) => (
                                    <tr key={ad.id}>
                                      <td className={`${cadastroListClasses.td} text-center font-medium`}>{ad.number}º</td>
                                      <td className={cadastroListClasses.td}>
                                        <p className="text-gray-900 dark:text-gray-100">{ad.reason}</p>
                                        {[
                                          ad.servicesAdded ? `+ Serviços: ${ad.servicesAdded}` : null,
                                          ad.servicesRemoved ? `− Serviços: ${ad.servicesRemoved}` : null,
                                          ad.approvedByName ? `Aprovado por: ${ad.approvedByName}` : null,
                                          ad.status === 'CORRECTION' && ad.correctionNote
                                            ? `Motivo da devolução: ${ad.correctionNote}`
                                            : null,
                                        ]
                                          .filter(Boolean)
                                          .map((line) => (
                                            <p key={String(line)} className="text-xs text-gray-500 dark:text-gray-400">
                                              {line}
                                            </p>
                                          ))}
                                        {(ad.files || []).map((file, fi) => (
                                          <a
                                            key={`${file.url}-${fi}`}
                                            href={resolveApiMediaUrl(file.url) || file.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="mt-0.5 inline-flex items-center gap-1 text-xs text-red-700 hover:underline dark:text-red-300"
                                          >
                                            <Paperclip className="h-3 w-3" />
                                            {file.name || 'contrato atualizado'}
                                          </a>
                                        ))}
                                      </td>
                                      <td
                                        className={`${cadastroListClasses.td} whitespace-nowrap text-center font-semibold tabular-nums ${
                                          ad.amount >= 0
                                            ? 'text-emerald-700 dark:text-emerald-300'
                                            : 'text-red-700 dark:text-red-300'
                                        }`}
                                      >
                                        {ad.amount >= 0 ? '+' : ''}
                                        {formatMoneyBr(ad.amount)}
                                      </td>
                                      <td className={`${cadastroListClasses.td} whitespace-nowrap text-center`}>
                                        {formatDateBr(ad.effectiveDate)}
                                      </td>
                                      <td className={`${cadastroListClasses.td} text-center`}>
                                        {ad.status === 'PENDING' ? (
                                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
                                            Aguardando aprovação
                                          </span>
                                        ) : ad.status === 'CORRECTION' ? (
                                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800 dark:bg-red-900/30 dark:text-red-300">
                                            Devolvido
                                          </span>
                                        ) : (
                                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
                                            Aprovado
                                          </span>
                                        )}
                                      </td>
                                      <td className={`${cadastroListClasses.td} text-center`}>
                                        {canManageCadastro &&
                                        (ad.status === 'CORRECTION' || ad.number === lastAddendumNumber) ? (
                                          <div className="flex items-center justify-center gap-1">
                                            {ad.status === 'CORRECTION' ? (
                                              <button
                                                type="button"
                                                disabled={savingContractLink}
                                                onClick={() => startEditAddendum(link.id, ad)}
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700"
                                                aria-label="Corrigir e reenviar"
                                                title="Corrigir e reenviar"
                                              >
                                                <Pencil className="h-4 w-4" />
                                              </button>
                                            ) : null}
                                            {ad.number === lastAddendumNumber ? (
                                              <button
                                                type="button"
                                                disabled={savingContractLink}
                                                onClick={() => void handleDeleteAddendum(link.id, ad.id)}
                                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 hover:text-red-600"
                                                aria-label="Excluir aditivo"
                                                title="Excluir aditivo"
                                              >
                                                <Trash2 className="h-4 w-4" />
                                              </button>
                                            ) : null}
                                          </div>
                                        ) : (
                                          '—'
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                          <Modal
                            isOpen={addingAddendumForId === link.id}
                            onClose={resetAddendumForm}
                            title={editingAddendum ? `Corrigir Aditivo nº ${editingAddendum.number}` : 'Novo Aditivo'}
                            size="lg"
                          >
                            <div className="space-y-4">
                                <div>
                                  <label className={labelClass}>Motivo *</label>
                                  <input
                                    type="text"
                                    value={addendumReason}
                                    onChange={(e) => setAddendumReason(e.target.value)}
                                    className={inputClass}
                                    placeholder="Descreva o motivo do aditivo"
                                  />
                                </div>
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                  <div>
                                    <label className={labelClass}>Valor (R$) *</label>
                                    <input
                                      type="text"
                                      inputMode="numeric"
                                      value={addendumAmount}
                                      onChange={(e) => {
                                        const masked = maskCurrencyInputBrOrEmpty(e.target.value);
                                        setAddendumAmount(masked);
                                        if (addendumPayMode === 'new' && addendumScheduleMode === 'parcelado') {
                                          const n = Math.floor(Number(addendumParcelCount));
                                          if (Number.isFinite(n) && n >= 2 && n <= 60) {
                                            setAddendumParcelAmounts(
                                              buildEqualParcelAmountInputs(parseCurrencyInputBr(masked), n)
                                            );
                                          }
                                        }
                                      }}
                                      className={inputClass}
                                      placeholder="R$ 0,00"
                                    />
                                  </div>
                                  <div>
                                    <label className={labelClass}>Data</label>
                                    <DatePickerField value={addendumDate} onChange={setAddendumDate} />
                                  </div>
                                </div>
                                <div>
                                  <label className={labelClass}>Serviços adicionados</label>
                                  <input
                                    type="text"
                                    value={addendumServicesAdded}
                                    onChange={(e) => setAddendumServicesAdded(e.target.value)}
                                    className={inputClass}
                                    placeholder="Ex.: Reboco do Bloco C"
                                  />
                                </div>
                                <div>
                                  <label className={labelClass}>Contrato atualizado</label>
                                  <div className="space-y-1">
                                    <FileDropZone
                                      label="Anexar contrato atualizado"
                                      hint="Clique ou arraste PDF, Word ou imagem"
                                      accept=".pdf,.doc,.docx,image/*,application/pdf"
                                      uploading={uploadingFile}
                                      onFiles={(files) => void uploadAddendumFile(files[0])}
                                    />
                                    {addendumFiles.length > 0 ? (
                                      <ul className="space-y-1">
                                        {addendumFiles.map((file, fileIndex) => (
                                          <li
                                            key={`${file.url}-${fileIndex}`}
                                            className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-200"
                                          >
                                            <Paperclip className="h-3 w-3 shrink-0 text-emerald-600" />
                                            <span className="truncate">{file.name || 'contrato atualizado'}</span>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                setAddendumFiles((prev) =>
                                                  prev.filter((_, index) => index !== fileIndex)
                                                )
                                              }
                                              className="ml-auto text-gray-400 hover:text-red-600"
                                              aria-label="Remover anexo"
                                            >
                                              <X className="h-3.5 w-3.5" />
                                            </button>
                                          </li>
                                        ))}
                                      </ul>
                                    ) : null}
                                  </div>
                                </div>
                                <div>
                                  <label className={labelClass}>Como aplicar o valor</label>
                                  <div className="mt-1 flex gap-2">
                                    <ButtonSeg
                                      active={addendumPayMode === 'new'}
                                      label="Nova condição de pagamento"
                                      onClick={() => setAddendumPayMode('new')}
                                    />
                                    <ButtonSeg
                                      active={addendumPayMode === 'redistribute'}
                                      label="Redistribuir nas parcelas"
                                      onClick={() => setAddendumPayMode('redistribute')}
                                    />
                                  </div>
                                  {addendumPayMode === 'new' ? (
                                    <div className="mt-2">
                                      <label className={labelClass}>Forma de pagamento</label>
                                      <div className="flex gap-2">
                                        <ButtonSeg
                                          active={addendumScheduleMode === 'avista'}
                                          label="À vista"
                                          onClick={() => {
                                            setAddendumScheduleMode('avista');
                                            setAddendumParcelAmounts([]);
                                          }}
                                        />
                                        <ButtonSeg
                                          active={addendumScheduleMode === 'parcelado'}
                                          label="Parcelado"
                                          onClick={() => {
                                            setAddendumScheduleMode('parcelado');
                                            const n = Math.floor(Number(addendumParcelCount)) || 6;
                                            setAddendumParcelCount(String(n));
                                            setAddendumParcelAmounts(
                                              buildEqualParcelAmountInputs(parseCurrencyInputBr(addendumAmount), n)
                                            );
                                          }}
                                        />
                                      </div>
                                      {addendumScheduleMode === 'avista' ? (
                                        <></>
                                      ) : (
                                        <div className="mt-2 space-y-2">
                                          <label className={labelClass}>Número de parcelas</label>
                                          <input
                                            type="number"
                                            min={2}
                                            max={60}
                                            value={addendumParcelCount}
                                            onChange={(e) => {
                                              const value = e.target.value;
                                              setAddendumParcelCount(value);
                                              const n = Math.floor(Number(value));
                                              if (Number.isFinite(n) && n >= 2 && n <= 60) {
                                                setAddendumParcelAmounts(
                                                  buildEqualParcelAmountInputs(
                                                    parseCurrencyInputBr(addendumAmount),
                                                    n
                                                  )
                                                );
                                              } else {
                                                setAddendumParcelAmounts([]);
                                              }
                                            }}
                                            className={inputClass}
                                          />
                                          {(() => {
                                            const n = Math.floor(Number(addendumParcelCount.trim()));
                                            if (!Number.isFinite(n) || n < 2 || n > 60) return null;
                                            const total = parseCurrencyInputBr(addendumAmount);
                                            const amounts =
                                              addendumParcelAmounts.length === n
                                                ? addendumParcelAmounts
                                                : buildEqualParcelAmountInputs(total, n);
                                            const sum = amounts.reduce(
                                              (acc, raw) => acc + (parseCurrencyInputBr(raw) || 0),
                                              0
                                            );
                                            return (
                                              <div className="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                                                <div className="flex items-center justify-between gap-2">
                                                  <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                                                    Valor de cada parcela
                                                  </p>
                                                  <button
                                                    type="button"
                                                    onClick={() =>
                                                      setAddendumParcelAmounts(
                                                        buildEqualParcelAmountInputs(total, n)
                                                      )
                                                    }
                                                    className="text-[11px] font-semibold text-sky-700 hover:underline dark:text-sky-300"
                                                  >
                                                    Dividir igualmente
                                                  </button>
                                                </div>
                                                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                                                  {amounts.map((parcelAmount, index) => (
                                                    <div key={`addendum-parcel-${index}`}>
                                                      <label className="mb-1 block text-[11px] text-gray-500 dark:text-gray-400">
                                                        Parcela {index + 1}
                                                      </label>
                                                      <input
                                                        type="text"
                                                        inputMode="numeric"
                                                        value={parcelAmount}
                                                        onChange={(e) => {
                                                          setAddendumParcelAmounts(
                                                            redistributeParcelAmounts(
                                                              amounts,
                                                              index,
                                                              e.target.value,
                                                              total
                                                            )
                                                          );
                                                        }}
                                                        placeholder="R$ 0,00"
                                                        className={inputClass}
                                                      />
                                                    </div>
                                                  ))}
                                                </div>
                                              </div>
                                            );
                                          })()}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <></>
                                  )}
                                </div>
                              <div className="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                                <button type="button" onClick={resetAddendumForm} className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600">
                                  Cancelar
                                </button>
                                <button
                                  type="button"
                                  disabled={savingContractLink || !addendumReason.trim()}
                                  onClick={() => void handleAddAddendum(link.id)}
                                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                                >
                                  {savingContractLink
                                    ? 'Enviando…'
                                    : editingAddendum
                                      ? 'Reenviar para Aprovação'
                                      : 'Enviar para Aprovação'}
                                </button>
                              </div>
                            </div>
                          </Modal>

                                </CardContent>
                              </Card>
                            ) : null}

                            {!isOwnEmpreiteiroAccount && abaServico === 'anexos' ? (
                              <Card className={cadastroListClasses.card}>
                                <CardHeader className="border-b-0 pb-1">
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center space-x-3">
                              <div className="rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
                                <Paperclip className="h-5 w-5 text-red-600 sm:h-6 sm:w-6 dark:text-red-400" />
                              </div>
                              <div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Anexos do Contrato</h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400">Contrato assinado e demais documentos</p>
                              </div>
                            </div>
                            {canManageCadastro ? (
                              <button type="button" onClick={() => setAnexoModalLinkId(link.id)} className="flex h-10 flex-shrink-0 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40">
                                <Plus className="h-4 w-4 shrink-0" />
                                <span>Anexar Contrato</span>
                              </button>
                            ) : null}
                          </div>
                        </CardHeader>
                                <CardContent className={`${cadastroListClasses.cardContent} space-y-4`}>
                          {(link.files || []).length === 0 ? (
                            <CadastroListEmpty
                              icon={Paperclip}
                              title="Nenhum anexo encontrado"
                              hint={canManageCadastro ? 'Use “Anexar Contrato” para enviar o primeiro' : 'Nenhum contrato anexado'}
                            />
                          ) : (
                            <div className="table-scroll">
                              <table className={`${cadastroListClasses.table} text-sm`}>
                                <thead className="border-b border-gray-200 dark:border-gray-700">
                                  <tr>
                                    <th className={cadastroListClasses.th}>Arquivo</th>
                                    {canManageCadastro ? (
                                      <th className={`${cadastroListClasses.th} text-center`}>Ação</th>
                                    ) : null}
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                                  {(link.files || []).map((file, fileIndex) => (
                                    <tr key={`${file.url}-${fileIndex}`}>
                                      <td className={cadastroListClasses.td}>
                                        <a
                                          href={resolveApiMediaUrl(file.url) || file.url}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="inline-flex items-center gap-2 text-gray-900 hover:text-red-700 dark:text-gray-100 dark:hover:text-red-300"
                                        >
                                          <Paperclip className="h-4 w-4 shrink-0 text-gray-400" />
                                          <span className="truncate">{file.name || 'contrato'}</span>
                                        </a>
                                      </td>
                                      {canManageCadastro ? (
                                        <td className={`${cadastroListClasses.td} text-center`}>
                                          <button
                                            type="button"
                                            onClick={() => void removeServiceContractFile(link.id, link.files, fileIndex)}
                                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 hover:text-red-600"
                                            aria-label="Remover anexo"
                                            title="Remover anexo"
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
                          <Modal
                            isOpen={anexoModalLinkId === link.id}
                            onClose={() => setAnexoModalLinkId(null)}
                            title="Anexar Contrato"
                            size="md"
                          >
                            <FileDropZone
                              label="Anexar contrato"
                              hint="Clique ou arraste PDF, Word ou imagem do contrato"
                              accept=".pdf,.doc,.docx,image/*,application/pdf"
                              uploading={uploadingFile}
                              disabled={savingContractLink}
                              onFiles={(files) => {
                                void uploadServiceContractFile(link.id, link.files, files[0]).then(() =>
                                  setAnexoModalLinkId(null)
                                );
                              }}
                            />
                          </Modal>

                                </CardContent>
                              </Card>
                            ) : null}

                            {abaServico === 'medicoes' ? (
                              <>
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-4">
                                  <FilterStatCard
                                    label="Contrato"
                                    count={formatMoneyBr(contractValue) || '—'}
                                    icon={FileText}
                                    iconBg="bg-violet-100 dark:bg-violet-900/30"
                                    iconColor="text-violet-600 dark:text-violet-400"
                                  />
                                  <FilterStatCard
                                    label="Executado"
                                    count={executedPct != null ? `${executedPct}%` : '—'}
                                    icon={TrendingUp}
                                    iconBg="bg-blue-100 dark:bg-blue-900/30"
                                    iconColor="text-blue-600 dark:text-blue-400"
                                  />
                                  <FilterStatCard
                                    label="Pago"
                                    count={formatMoneyBr(paidTotal) || 'R$ 0,00'}
                                    icon={CheckCircle2}
                                    iconBg="bg-emerald-100 dark:bg-emerald-900/30"
                                    iconColor="text-emerald-600 dark:text-emerald-400"
                                  />
                                  <FilterStatCard
                                    label="Saldo"
                                    count={formatMoneyBr(saldoValue) || '—'}
                                    icon={Wallet}
                                    iconBg="bg-amber-100 dark:bg-amber-900/30"
                                    iconColor="text-amber-600 dark:text-amber-400"
                                  />
                                </div>
                                {renderMedicoesCard(viewingItem, false, link.id)}
                              </>
                            ) : null}

                            {abaServico === 'dados' ? (
                              <Card className={cadastroListClasses.card}>
                                <CardHeader className="border-b-0 pb-1">
                                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="flex items-center space-x-3">
                                      <div className="rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
                                        <FileText className="h-5 w-5 text-red-600 sm:h-6 sm:w-6 dark:text-red-400" />
                                      </div>
                                      <div>
                                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Dados do Serviço</h3>
                                        <p className="text-sm text-gray-600 dark:text-gray-400">
                                          Informações, valores e situação do contrato de serviço
                                        </p>
                                      </div>
                                    </div>
                                    {canManageCadastro ? (
                                      <button
                                        type="button"
                                        onClick={() => openEditService(link)}
                                        className="flex h-10 flex-shrink-0 items-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
                                      >
                                        Editar
                                      </button>
                                    ) : null}
                                  </div>
                                </CardHeader>
                                <CardContent className={`${cadastroListClasses.cardContent} space-y-6`}>
                                  <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                                    {[
                                      { rotulo: 'Serviço', valor: link.contratoNome || link.name },
                                      { rotulo: 'Contrato', valor: link.centroCustoNome || link.costCenter?.name },
                                      { rotulo: 'Local de execução', valor: link.location },
                                      {
                                        rotulo: 'Período',
                                        valor: `${formatDateBr(link.startDate)} à ${formatDateBr(link.endDate)}`,
                                      },
                                      { rotulo: 'Valor planejado', valor: formatMoneyBr(link.plannedValue) },
                                      { rotulo: 'Valor atual (com aditivos)', valor: formatMoneyBr(contractValue) },
                                      { rotulo: 'Forma de pagamento', valor: paymentLabelForLink(link) },
                                      { rotulo: 'Descrição', valor: link.description?.trim() },
                                    ].map((campo) => (
                                      <div key={campo.rotulo} className="min-w-0">
                                        <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                          {campo.rotulo}
                                        </dt>
                                        <dd className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-900 dark:text-gray-100">
                                          {campo.valor || '—'}
                                        </dd>
                                      </div>
                                    ))}
                                  </dl>
                                  {canManageCadastro ? (
                                    <div className="max-w-xs">
                                      <label className={labelClass}>Status do serviço</label>
                                      <StringSingleSelectDropdown
                                        value={String(link.status || 'IN_PROGRESS').toUpperCase()}
                                        onChange={(value) => {
                                          if (!value) return;
                                          void handleUpdateContractStatus(link.id, value as EmpreiteiroContractStatus);
                                        }}
                                        options={labeledToSelectOptions(
                                          CONTRACT_STATUS_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))
                                        )}
                                        placeholder="Selecione o status"
                                        matchTriggerWidth
                                      />
                                    </div>
                                  ) : null}
                                </CardContent>
                              </Card>
                            ) : null}


                            {abaServico === 'equipe' ? (
                              <Card className={cadastroListClasses.card}>
                                <CardHeader className="border-b-0 pb-1">
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex items-center space-x-3">
                              <div className="rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
                                <Users className="h-5 w-5 text-red-600 sm:h-6 sm:w-6 dark:text-red-400" />
                              </div>
                              <div>
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Equipe do Serviço</h3>
                                <p className="text-sm text-gray-600 dark:text-gray-400">Pessoas que atuam neste serviço</p>
                              </div>
                            </div>
                            {canEditTeamOnDetail ? (
                              <button type="button" onClick={() => abrirModalPessoa(link.id, null)} className="flex h-10 flex-shrink-0 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:opacity-50 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40">
                                <Plus className="h-4 w-4 shrink-0" />
                                <span>Adicionar Pessoa</span>
                              </button>
                            ) : null}
                          </div>
                        </CardHeader>
                                <CardContent className={`${cadastroListClasses.cardContent} space-y-4`}>
                                  {(() => {
                                    const equipe = contractTeamDraftById[link.id] ?? teamDraftFromMembers(link.team);
                                    if (equipe.length === 0) {
                                      return (
                                        <CadastroListEmpty
                                          icon={Users}
                                          title="Nenhuma pessoa encontrada"
                                          hint={
                                            canEditTeamOnDetail
                                              ? 'Use “Adicionar Pessoa” para cadastrar a primeira'
                                              : 'Nenhuma pessoa neste serviço'
                                          }
                                        />
                                      );
                                    }
                                    return (
                                      <div className="table-scroll">
                                        <table className={`${cadastroListClasses.table} text-sm`}>
                                          <thead className="border-b border-gray-200 dark:border-gray-700">
                                            <tr>
                                              <th className={cadastroListClasses.th}>Pessoa</th>
                                              <th className={`${cadastroListClasses.th} text-center`}>Função</th>
                                              <th className={`${cadastroListClasses.th} text-center`}>Telefone</th>
                                              {canEditTeamOnDetail ? (
                                                <th className={listTableRowClasses.actionTh}>Ação</th>
                                              ) : null}
                                            </tr>
                                          </thead>
                                          <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                                            {equipe.map((member, index) => (
                                              <tr key={`${link.id}-pessoa-${index}`}>
                                                <td className={cadastroListClasses.td}>
                                                  <div className="flex items-center gap-3">
                                                    {member.photo ? (
                                                      // eslint-disable-next-line @next/next/no-img-element
                                                      <img
                                                        src={member.photo}
                                                        alt={member.name}
                                                        className="h-10 w-10 shrink-0 rounded-full object-cover"
                                                      />
                                                    ) : (
                                                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500">
                                                        <HardHat className="h-5 w-5" />
                                                      </div>
                                                    )}
                                                    <div className="min-w-0">
                                                      <p className="font-medium text-gray-900 dark:text-gray-100">
                                                        {member.name}
                                                      </p>
                                                      {member.document ? (
                                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                                          {member.document}
                                                        </p>
                                                      ) : null}
                                                    </div>
                                                  </div>
                                                </td>
                                                <td className={`${cadastroListClasses.td} text-center`}>{member.role || '—'}</td>
                                                <td className={`${cadastroListClasses.td} whitespace-nowrap text-center`}>
                                                  {member.phone || '—'}
                                                </td>
                                                {canEditTeamOnDetail ? (
                                                  <RowActionMenuCell
                                                    isOpen={isEquipeRowMenuOpen(`${link.id}::${index}`)}
                                                    onToggle={(e) =>
                                                      toggleEquipeRowActionMenu(
                                                        `${link.id}::${index}`,
                                                        e.currentTarget as HTMLButtonElement
                                                      )
                                                    }
                                                  />
                                                ) : null}
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                        {equipeRowActionMenu && equipeRowForActionMenu?.linkId === link.id ? (
                                          <RowActionMenuPortal
                                            menu={equipeRowActionMenu}
                                            onClose={closeEquipeRowActionMenu}
                                            onEdit={() =>
                                              abrirModalPessoa(
                                                equipeRowForActionMenu.linkId,
                                                equipeRowForActionMenu.index,
                                                equipeRowForActionMenu.member
                                              )
                                            }
                                            onDelete={() => {
                                              void removerPessoaDoServico(
                                                equipeRowForActionMenu.linkId,
                                                equipeRowForActionMenu.index
                                              );
                                            }}
                                          />
                                        ) : null}
                                      </div>
                                    );
                                  })()}
                                  <Modal
                                    isOpen={teamModal?.linkId === link.id}
                                    onClose={() => setTeamModal(null)}
                                    title={teamModal?.index === null ? 'Nova Pessoa' : 'Editar Pessoa'}
                                    size="lg"
                                  >
                                    <div className="space-y-4">
                                      <div className="flex items-center gap-4">
                                        <TeamMemberPhotoField
                                          value={teamModalForm.photo}
                                          onChange={(value) => setTeamModalForm((prev) => ({ ...prev, photo: value }))}
                                          alt="Foto da pessoa"
                                          redondo
                                        />
                                        <div>
                                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Foto</p>
                                          <p className="text-xs text-gray-500 dark:text-gray-400">Opcional</p>
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                        <div>
                                          <label className={labelClass}>Nome *</label>
                                          <input
                                            type="text"
                                            value={teamModalForm.name}
                                            onChange={(e) => setTeamModalForm((prev) => ({ ...prev, name: e.target.value }))}
                                            placeholder="Nome completo"
                                            className={inputClass}
                                          />
                                        </div>
                                        <div>
                                          <label className={labelClass}>Função *</label>
                                          <StringSingleSelectDropdown
                                            value={teamModalForm.role}
                                            onChange={(value) => setTeamModalForm((prev) => ({ ...prev, role: value }))}
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
                                            value={teamModalForm.phone}
                                            onChange={(e) =>
                                              setTeamModalForm((prev) => ({ ...prev, phone: maskPhoneInput(e.target.value) }))
                                            }
                                            placeholder="(00) 90000-0000"
                                            className={inputClass}
                                          />
                                        </div>
                                        <div>
                                          <label className={labelClass}>CPF</label>
                                          <input
                                            type="text"
                                            value={teamModalForm.document}
                                            onChange={(e) =>
                                              setTeamModalForm((prev) => ({ ...prev, document: formatCpfInput(e.target.value) }))
                                            }
                                            placeholder="000.000.000-00"
                                            className={inputClass}
                                          />
                                        </div>
                                      </div>
                                      <div className="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                                        <button type="button" onClick={() => setTeamModal(null)} className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600">
                                          Cancelar
                                        </button>
                                        <button
                                          type="button"
                                          disabled={savingTeamLinkId === link.id}
                                          onClick={() => void confirmarModalPessoa()}
                                          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                                        >
                                          {savingTeamLinkId === link.id ? 'Salvando…' : 'Salvar'}
                                        </button>
                                      </div>
                                    </div>
                                  </Modal>
                                </CardContent>
                              </Card>
                            ) : null}
                          </div>
                        );
                      })() : null}
            {servicePageLink ? null : (
            <>
            {(() => {
              const links = viewingItem.contracts || [];
              const contratado = links.reduce(
                (sum, l) => sum + (l.currentValue ?? l.plannedValue ?? 0),
                0
              );
              const executado = links.reduce((sum, l) => sum + (l.executedAmountTotal ?? 0), 0);
              const kpis = [
                { rotulo: 'Contratado', valor: formatMoneyBr(contratado) || 'R$ 0,00', Icon: Wallet },
                { rotulo: 'Executado', valor: formatMoneyBr(executado) || 'R$ 0,00', Icon: TrendingUp },
                { rotulo: 'Contratos', valor: String(links.length), Icon: FileText },
              ];
              return (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
                    <div className="flex min-w-0 items-center gap-4">
                      {resolveApiMediaUrl(viewingItem.photoUrl) ? (
                        <button
                          type="button"
                          onClick={() => openPreviewPhoto(viewingItem.photoUrl, viewingItem.name)}
                          className="shrink-0 rounded-full ring-offset-2 ring-offset-white hover:ring-2 hover:ring-red-500 dark:ring-offset-gray-900"
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
                        <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500">
                          <HardHat className="h-8 w-8" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                          <h1 className="truncate text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-3xl">
                            {viewingItem.name}
                          </h1>
                          <span
                            className={`inline-flex shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
                              viewingItem.isActive
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                                : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'
                            }`}
                          >
                            {viewingItem.isActive ? 'Ativo' : 'Inativo'}
                          </span>
                        </div>
                        {empreiteiroCnpjDigits(viewingItem) ? (
                          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                            {maskCnpjInput(empreiteiroCnpjDigits(viewingItem))}
                          </p>
                        ) : null}
                        {viewingItem.specialty ? (
                          <p className="text-sm text-gray-600 dark:text-gray-400">{viewingItem.specialty}</p>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
                      {kpis.map((k) => (
                        <div key={k.rotulo} className="flex items-center gap-3">
                          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                            <k.Icon className="h-4 w-4" />
                          </span>
                          <div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{k.rotulo}</p>
                            <p className="text-lg font-bold tabular-nums text-gray-900 dark:text-gray-100">{k.valor}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <AppUnderlineTabList aria-label="Seções da empreita" centered={false} className="mt-1">
                    {(
                      [
                        { id: 'contratos', label: 'Contratos de Serviço' },
                        ...(isOwnEmpreiteiroAccount ? [] : [{ id: 'fluig', label: 'Solicitações Fluig' }]),
                        { id: 'dados', label: 'Dados' },
                      ] as const
                    ).map((aba) => (
                      <AppUnderlineTabButton
                        key={aba.id}
                        active={abaDetalhe === aba.id}
                        onClick={() => setAbaDetalhe(aba.id as typeof abaDetalhe)}
                        className="whitespace-nowrap px-3 py-2.5 text-sm"
                      >
                        {aba.label}
                      </AppUnderlineTabButton>
                    ))}
                  </AppUnderlineTabList>
                </div>
              );
            })()}

            {abaDetalhe === 'contratos' ? (
              <Card className={cadastroListClasses.card}>
                <CardHeader className="border-b-0 pb-1">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
                        <FileText className="h-5 w-5 text-red-600 sm:h-6 sm:w-6 dark:text-red-400" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                          Contratos de Serviço
                        </h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {isOwnEmpreiteiroAccount
                            ? 'Cadastre a equipe de cada serviço e consulte medições'
                            : 'Serviços com valor, equipe própria e medições de cada um'}
                        </p>
                      </div>
                    </div>
                    {canManageCadastro ? (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingServiceId(null);
                          setAddingContract(true);
                        }}
                        className="flex h-10 flex-shrink-0 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                      >
                        <Plus className="h-4 w-4 shrink-0" />
                        <span>Adicionar Serviço</span>
                      </button>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className={`${cadastroListClasses.cardContent} space-y-6`}>
                <div>
                  <Modal
                    isOpen={addingContract}
                    onClose={() => setAddingContract(false)}
                    title="Novo Contrato de Serviço"
                    size="lg"
                  >
                    <div className="space-y-4">
                      <div>
                        <label className={labelClass}>Nome do serviço *</label>
                        <input
                          type="text"
                          value={newServiceName}
                          onChange={(e) => setNewServiceName(e.target.value)}
                          placeholder="Ex.: Alvenaria do Bloco B"
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Descrição</label>
                        <textarea
                          value={newServiceDescription}
                          onChange={(e) => setNewServiceDescription(e.target.value)}
                          rows={3}
                          placeholder="Descreva o escopo do serviço"
                          className={inputClass}
                        />
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className={labelClass}>Contrato *</label>
                        <StringSingleSelectDropdown
                          value={newServiceContractId}
                          onChange={setNewServiceContractId}
                          options={contractSelectOptions}
                          placeholder="Selecione o contrato"
                          emptyOptionLabel="Selecione o contrato"
                          searchPlaceholder="Pesquisar contrato..."
                          matchTriggerWidth
                        />
                      </div>
                      <div>
                        <label className={labelClass}>Local de execução</label>
                        <input
                          type="text"
                          value={newServiceLocation}
                          onChange={(e) => setNewServiceLocation(e.target.value)}
                          placeholder="Ex.: Bloco B, 2º pavimento"
                          className={inputClass}
                        />
                      </div>
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                        <label className={labelClass}>Status</label>
                        <StringSingleSelectDropdown
                          value={newContractStatus}
                          onChange={(value) => setNewContractStatus((value || 'IN_PROGRESS') as EmpreiteiroContractStatus)}
                          options={labeledToSelectOptions(CONTRACT_STATUS_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label })))}
                          placeholder="Selecione o status"
                          matchTriggerWidth
                        />
                      </div>
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <label className={labelClass}>Início</label>
                          <DatePickerField value={newContractStart} onChange={setNewContractStart} />
                        </div>
                        <div>
                          <label className={labelClass}>Fim</label>
                          <DatePickerField value={newContractEnd} onChange={setNewContractEnd} />
                        </div>
                      </div>
                      <div>
                        <label className={labelClass}>Forma de pagamento</label>
                        <div className="flex gap-2">
                          {(
                            [
                              { value: 'avista' as const, label: 'À vista' },
                              { value: 'parcelado' as const, label: 'Parcelado' },
                            ] as const
                          ).map((opt) => (
                            <ButtonSeg
                              key={opt.value}
                              active={newServicePayMode === opt.value}
                              label={opt.label}
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
                            />
                          ))}
                        </div>
                        {newServicePayMode === 'avista' ? (
                          <div className="mt-4 space-y-2">
                            <label className={labelClass}>Data do pagamento</label>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                            <DatePickerField value={newServicePayDate} onChange={setNewServicePayDate} />
                            </div>
                            </div>
                          </div>
                        ) : null}
                        {newServicePayMode === 'parcelado' ? (
                          <div className="mt-4 space-y-4">
                            <div className="sm:w-[calc(50%-0.5rem)]">
                            <label className={labelClass}>Número de parcelas</label>
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
                              placeholder="Ex.: 6"
                              className={`${inputClass} h-10 text-sm [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
                            />
                            </div>
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
                                <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50/60 p-4 dark:border-gray-700 dark:bg-gray-900/30">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                                      Valor de cada parcela
                                    </p>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setNewServiceParcelAmounts(
                                          buildEqualParcelAmountInputs(planned, n)
                                        )
                                      }
                                      className="text-xs font-semibold text-red-600 hover:underline dark:text-red-400"
                                    >
                                      Dividir igualmente
                                    </button>
                                  </div>
                                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                                    {amounts.map((amount, index) => (
                                      <div key={`new-parcel-${index}`}>
                                        <label className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">
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
                                          className={`${inputClass} py-1.5 text-sm`}
                                        />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        ) : null}
                      </div>
                      <div>
                        <label className={labelClass}>Anexo do contrato</label>
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
                          <FileDropZone
                            label="Anexar contrato"
                            hint="Clique ou arraste PDF, Word ou imagem do contrato assinado"
                            accept=".pdf,.doc,.docx,image/*,application/pdf"
                            multiple
                            uploading={uploadingFile}
                            onFiles={(files) => {
                              for (const file of files) void uploadNewServiceFile(file);
                            }}
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
                        <button
                          type="button"
                          onClick={() => setAddingContract(false)}
                          className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          disabled={savingContractLink || !newServiceName.trim()}
                          onClick={() => void handleAddContractLink()}
                          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          {savingContractLink ? 'Salvando…' : 'Criar Contrato'}
                        </button>
                      </div>
                    </div>
                  </Modal>
                  {(viewingItem.contracts || []).length === 0 ? (
                    <CadastroListEmpty
                      icon={FileText}
                      title="Nenhum contrato de serviço encontrado"
                      hint={
                        canManageCadastro
                          ? 'Use “Adicionar Serviço” para cadastrar o primeiro'
                          : 'Nenhum serviço cadastrado para esta empreita'
                      }
                    />
                  ) : (
                    <>
                      <div className="table-scroll">
                        <table className={`${cadastroListClasses.table} text-sm`}>
                          <thead className="border-b border-gray-200 dark:border-gray-700">
                            <tr>
                              <th className={cadastroListClasses.th}>Serviço</th>
                              <th className={`${cadastroListClasses.th} text-center`}>Contrato</th>
                              <th className={`${cadastroListClasses.th} text-center`}>Período</th>
                              <th className={`${cadastroListClasses.th} text-center`}>Valor</th>
                              <th className={`${cadastroListClasses.th} text-center`}>Equipe</th>
                              <th className={`${cadastroListClasses.th} text-center`}>Status</th>
                              {canManageCadastro ? (
                                <th className={listTableRowClasses.actionTh}>Ação</th>
                              ) : null}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                            {(viewingItem.contracts || []).map((link) => {
                              const statusMeta = contractStatusMeta(link.status);
                              const contractValue =
                                link.currentValue != null && Number.isFinite(link.currentValue)
                                  ? link.currentValue
                                  : link.plannedValue != null && Number.isFinite(link.plannedValue)
                                    ? link.plannedValue
                                    : null;
                              const localCc = [
                                link.location,
                                link.centroCustoNome || link.costCenter?.name,
                              ]
                                .filter(Boolean)
                                .join(' · ');
                              return (
                                <tr
                                  key={link.id}
                                  className={`${listTableRowClasses.tr} cursor-pointer`}
                                  onClick={() => setServiceDetailLinkId(link.id)}
                                >
                                  <td className={cadastroListClasses.td}>
                                    <ListRowNavigableLabel>
                                      {link.contratoNome || link.name || 'Contrato de serviço'}
                                    </ListRowNavigableLabel>
                                  </td>
                                  <td className={`${cadastroListClasses.td} text-center`}>
                                    <span className="text-sm text-gray-700 dark:text-gray-300">
                                      {link.centroCustoNome || link.costCenter?.name || '—'}
                                    </span>
                                  </td>
                                  <td className={`${cadastroListClasses.td} text-center`}>
                                    <span className="whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                                      {formatDateBr(link.startDate)} à {formatDateBr(link.endDate)}
                                    </span>
                                  </td>
                                  <td className={`${cadastroListClasses.td} text-center`}>
                                    <span className="whitespace-nowrap text-sm tabular-nums text-gray-900 dark:text-gray-100">
                                      {formatMoneyBr(contractValue) || '—'}
                                    </span>
                                  </td>
                                  <td className={`${cadastroListClasses.td} text-center`}>
                                    <span className="whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                                      {(() => {
                                        const n = link.teamCount ?? link.team?.length ?? 0;
                                        return n > 0 ? `${n} ${n === 1 ? 'pessoa' : 'pessoas'}` : 'Sem equipe';
                                      })()}
                                    </span>
                                  </td>
                                  <td className={`${cadastroListClasses.td} text-center`}>
                                    <span
                                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusMeta.className}`}
                                    >
                                      {statusMeta.label}
                                    </span>
                                  </td>
                                  {canManageCadastro ? (
                                    <RowActionMenuCell
                                      isOpen={isContractRowMenuOpen(link.id)}
                                      onToggle={(e) =>
                                        toggleContractRowActionMenu(
                                          link.id,
                                          e.currentTarget as HTMLButtonElement
                                        )
                                      }
                                    />
                                  ) : null}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      {contractRowActionMenu && contractRowForActionMenu ? (
                        <RowActionMenuPortal
                          menu={contractRowActionMenu}
                          onClose={closeContractRowActionMenu}
                          onEdit={() => openEditService(contractRowForActionMenu)}
                          onDelete={() => {
                            void handleDeleteContractLink(contractRowForActionMenu);
                          }}
                        />
                      ) : null}
                    </>
                  )}

                </div>

                </CardContent>
              </Card>
            ) : null}


            {abaDetalhe === 'fluig' && !isOwnEmpreiteiroAccount ? (
              <EmpreiteiroFluigResumoCards empreiteiroId={viewingItem.id} />
            ) : null}

            {abaDetalhe === 'fluig' && !isOwnEmpreiteiroAccount ? (
              <Card className={cadastroListClasses.card}>
                <CardHeader className="border-b-0 pb-1">
                  <div className="flex items-center space-x-3">
                    <div className="rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
                      <FileText className="h-5 w-5 text-red-600 sm:h-6 sm:w-6 dark:text-red-400" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Solicitações no Fluig</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        Serviços tomados desta empreita, ligados pelo CPF ou CNPJ
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <EmpreiteiroFluigSolicitacoesPainel empreiteiroId={viewingItem.id} />
                </CardContent>
              </Card>
            ) : null}

            {abaDetalhe === 'dados' ? (
              <Card className={cadastroListClasses.card}>
                <CardHeader className="border-b-0 pb-1">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
                        <FileText className="h-5 w-5 text-red-600 sm:h-6 sm:w-6 dark:text-red-400" />
                      </div>
                      <div>
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Dados da Empreita</h3>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Documento, contato, dados bancários e login de acesso
                        </p>
                      </div>
                    </div>
                    {canManageCadastro ? (
                      <button
                        type="button"
                        onClick={() => handleEdit(viewingItem)}
                        className="flex h-10 flex-shrink-0 items-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
                      >
                        Editar
                      </button>
                    ) : null}
                  </div>
                </CardHeader>
                <CardContent className={`${cadastroListClasses.cardContent} space-y-6`}>
                  <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                    {[
                      { rotulo: 'CPF / CNPJ', valor: formatEmpreiteiroDocs(viewingItem) },
                      { rotulo: 'Especialidade', valor: viewingItem.specialty },
                      { rotulo: 'Responsável', valor: viewingItem.contactName },
                      { rotulo: 'Telefone / WhatsApp', valor: formatPhoneDisplay(viewingItem.phone) },
                      { rotulo: 'E-mail', valor: viewingItem.email },
                      {
                        rotulo: 'Cidade / UF',
                        valor: [viewingItem.city, viewingItem.state].filter(Boolean).join(' / '),
                      },
                      { rotulo: 'PIX', valor: viewingItem.pixKey },
                      { rotulo: 'Banco', valor: viewingItem.bank },
                      { rotulo: 'Agência', valor: viewingItem.agency },
                      { rotulo: 'Conta', valor: viewingItem.account },
                      {
                        rotulo: 'Login vinculado',
                        valor: viewingItem.userId ? viewingItem.userName || 'Vinculado' : 'Sem login',
                      },
                    ].map((campo) => (
                      <div key={campo.rotulo} className="min-w-0">
                        <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
                          {campo.rotulo}
                        </dt>
                        <dd className="mt-1 break-words text-sm text-gray-900 dark:text-gray-100">
                          {campo.valor || '—'}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </CardContent>
              </Card>
            ) : null}
            </>
            )}
          </div>
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
