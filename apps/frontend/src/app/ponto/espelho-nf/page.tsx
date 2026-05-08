'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  FileSpreadsheet,
  FileText,
  Pencil,
  Plus,
  Search,
  Trash2,
  X
} from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import {
  buildEspelhoDetailRows,
  computeEspelhoBasesCalculoInssIss,
  computeEspelhoMaterialLimits,
  espelhoMirrorForExport,
  exportEspelhoNfPdf,
  fmtEspelhoBrl,
  parseEspelhoBrCurrencyToNumber,
  parseEspelhoPercentToNumber,
  round2
} from '@/lib/exportEspelhoNfLayout';
import {
  ESPELHO_APPROVAL_STATUS_LABELS,
  type EspelhoApprovalStatus,
  removeEspelhoApprovalStatus,
  resolveEspelhoApprovalStatus,
  updateEspelhoApprovalStatus
} from '@/lib/espelhoNfApproval';
import { useCostCenters } from '@/hooks/useCostCenters';

type MirrorDraft = {
  measurementRef: string;
  costCenterId: string;
  dueDate: string;
  municipality: string;
  cnae: string;
  serviceIssqn: string;
  empenhoNumber: string;
  processNumber: string;
  serviceOrder: string;
  measurementStartDate: string;
  measurementEndDate: string;
  buildingUnit: string;
  observations: string;
  notes: string;
  measurementAmount: string;
  laborAmount: string;
  materialAmount: string;
  providerId: string;
  providerName: string;
  takerId: string;
  takerName: string;
  bankAccountId: string;
  bankAccountName: string;
  taxCodeId: string;
  taxCodeCityName: string;
};

type MirrorAttachment = {
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
};

type SavedMirror = MirrorDraft & {
  id: string;
  /** ISO — momento em que o espelho foi salvo pela primeira vez */
  createdAt?: string;
  approvalStatus?: EspelhoApprovalStatus;
  nfAttachment?: MirrorAttachment;
  xmlAttachment?: MirrorAttachment;
};

function newSavedMirrorId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function normalizeMirrorAttachment(raw: unknown): MirrorAttachment | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const name = String(o.name ?? '').trim();
  const dataUrl = String(o.dataUrl ?? '').trim();
  if (!name || !dataUrl) return undefined;
  return {
    name,
    mimeType: String(o.mimeType ?? 'application/octet-stream'),
    size: Number.isFinite(Number(o.size)) ? Math.max(0, Number(o.size)) : 0,
    dataUrl
  };
}

function normalizeSavedMirrorsFromStorage(raw: unknown): SavedMirror[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const o = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const createdRaw = o.createdAt;
    const normalizedId = String(o.id || `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`);
    return {
      id: normalizedId,
      createdAt:
        createdRaw != null && String(createdRaw).trim() !== '' ? String(createdRaw) : undefined,
      nfAttachment: normalizeMirrorAttachment(o.nfAttachment),
      xmlAttachment: normalizeMirrorAttachment(o.xmlAttachment),
      measurementRef: String(o.measurementRef ?? ''),
      costCenterId: String(o.costCenterId ?? ''),
      dueDate: String(o.dueDate ?? ''),
      municipality: String(o.municipality ?? ''),
      cnae: String(o.cnae ?? '41.20-4-00'),
      serviceIssqn: String(o.serviceIssqn ?? ''),
      empenhoNumber: String(o.empenhoNumber ?? ''),
      processNumber: String(o.processNumber ?? ''),
      serviceOrder: String(o.serviceOrder ?? ''),
      measurementStartDate: String(o.measurementStartDate ?? ''),
      measurementEndDate: String(o.measurementEndDate ?? ''),
      buildingUnit: String(o.buildingUnit ?? ''),
      observations: String(o.observations ?? ''),
      notes: String(o.notes ?? ''),
      measurementAmount: String(o.measurementAmount ?? ''),
      laborAmount: String(o.laborAmount ?? ''),
      materialAmount: String(o.materialAmount ?? ''),
      providerId: String(o.providerId ?? ''),
      providerName: String(o.providerName ?? ''),
      takerId: String(o.takerId ?? ''),
      takerName: String(o.takerName ?? ''),
      bankAccountId: String(o.bankAccountId ?? ''),
      bankAccountName: String(o.bankAccountName ?? ''),
      taxCodeId: String(o.taxCodeId ?? ''),
      taxCodeCityName: String(o.taxCodeCityName ?? ''),
      approvalStatus: resolveEspelhoApprovalStatus(normalizedId, String(o.approvalStatus ?? ''))
    };
  });
}

type ServiceProvider = {
  id: string;
  cnpj: string;
  municipalRegistration: string;
  stateRegistration: string;
  corporateName: string;
  tradeName: string;
  address: string;
  city: string;
  state: string;
  email: string;
};

type ServiceTaker = {
  id: string;
  name: string;
  cnpj: string;
  municipalRegistration: string;
  stateRegistration: string;
  corporateName: string;
  costCenterId: string;
  taxCodeId: string;
  bankAccountId: string;
  address: string;
  municipality: string;
  city: string;
  state: string;
  contractRef: string;
  serviceDescription: string;
};

type BankAccount = {
  id: string;
  name: string;
  bank: string;
  agency: string;
  account: string;
};

type FederalTaxRates = {
  cofins: string;
  csll: string;
  inss: string;
  irpj: string;
  pis: string;
};

type FederalTaxContextKey =
  | 'gdfObra'
  | 'gdfManutencaoReforma'
  | 'gdfMaoObraSemMaterial'
  | 'foraGdfObra'
  | 'foraGdfManutencaoReforma'
  | 'foraGdfMaoObraSemMaterial';

type FederalTaxRatesByContext = Record<FederalTaxContextKey, FederalTaxRates>;
type FederalTaxContextEnabled = Record<FederalTaxContextKey, boolean>;

type TaxRule = {
  collectionType: 'RETIDO' | 'RECOLHIDO';
};

type TaxCode = {
  id: string;
  cityName: string;
  abatesMaterial: boolean;
  issRate: string;
  cofins: TaxRule;
  csll: TaxRule;
  inss: TaxRule;
  irpj: TaxRule;
  pis: TaxRule;
  iss: TaxRule;
  inssMaterialLimit: string;
  issMaterialLimit: string;
};

const INITIAL_DRAFT: MirrorDraft = {
  measurementRef: '',
  costCenterId: '',
  dueDate: '',
  municipality: '',
  cnae: '41.20-4-00',
  serviceIssqn: '',
  empenhoNumber: '',
  processNumber: '',
  serviceOrder: '',
  measurementStartDate: '',
  measurementEndDate: '',
  buildingUnit: '',
  observations: '',
  notes: '',
  measurementAmount: '',
  laborAmount: '',
  materialAmount: '',
  providerId: '',
  providerName: '',
  takerId: '',
  takerName: '',
  bankAccountId: '',
  bankAccountName: '',
  taxCodeId: '',
  taxCodeCityName: ''
};

function sanitizeEspelhoMoneyTyping(raw: string): string {
  return raw
    .replace(/R\$/gi, '')
    .replace(/\u00a0/g, '')
    .replace(/\s/g, '')
    .replace(/[^\d,.-]/g, '');
}

function normalizeEspelhoMoneyBlurToBrl(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  const n = parseEspelhoBrCurrencyToNumber(t);
  if (n === null || !Number.isFinite(n)) return '';
  return fmtEspelhoBrl(Math.max(0, n));
}

/** Digitando percentual pt-BR: permite vírgula decimal (ex.: 3,65). */
function sanitizeEspelhoPercentTyping(raw: string): string {
  let s = String(raw ?? '')
    .replace(/%/g, '')
    .replace(/[^\d,.]/g, '')
    .replace(/\./g, ',');
  if (!s) return '';
  const firstComma = s.indexOf(',');
  if (firstComma !== -1) {
    s = s.slice(0, firstComma + 1) + s.slice(firstComma + 1).replace(/,/g, '');
  }
  const parts = s.split(',');
  const intPart = (parts[0] ?? '').replace(/\D/g, '').slice(0, 6);
  const decPartRaw = parts[1] ?? '';
  const decPart = decPartRaw.replace(/\D/g, '').slice(0, 8);

  const hasComma = s.includes(',');
  if (hasComma && parts.length >= 2 && parts[1] === '' && decPart === '') {
    if (intPart === '') return '';
    return `${intPart},`;
  }
  if (hasComma) {
    const left = intPart === '' ? '0' : intPart;
    return `${left},${decPart}`;
  }
  return intPart;
}

function formatEspelhoPercentNormalized(n: number): string {
  const c = Math.max(0, Math.min(100, n));
  const rounded = Math.round(c * 1e12) / 1e12;
  const s = rounded.toFixed(12).replace(/\.?0+$/, '');
  return s.includes('.') ? s.replace('.', ',') : s;
}

/** No blur: interpreta número, limita ao intervalo [0, 100]. */
function normalizeEspelhoPercentBlur(raw: string): string {
  const s = sanitizeEspelhoPercentTyping(raw);
  if (!s || s === ',') return '';
  let numStr = s;
  if (numStr.endsWith(',')) numStr = numStr.slice(0, -1);
  else numStr = numStr.replace(',', '.');
  const n = Number(numStr);
  if (!Number.isFinite(n)) return '';
  return formatEspelhoPercentNormalized(n);
}

function formatEspelhoDraftMoneyFields(d: MirrorDraft): MirrorDraft {
  return {
    ...d,
    measurementAmount: normalizeEspelhoMoneyBlurToBrl(d.measurementAmount),
    laborAmount: normalizeEspelhoMoneyBlurToBrl(d.laborAmount),
    materialAmount: normalizeEspelhoMoneyBlurToBrl(d.materialAmount)
  };
}

function round2EspelhoMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Diferença máxima aceita (R$) entre medição e mão de obra + material — ajuste fino de até 1 centavo. */
const ESPELHO_MONEY_TRIPLET_TOLERANCE_RS = 0.01;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Falha ao ler o arquivo.'));
    reader.readAsDataURL(file);
  });
}

function humanFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** `null` se válido ou nenhum valor informado; senão mensagem para etiqueta / toast. */
function espelhoSavedCalendarPartsFromIso(iso: string): { y: number; m: number } | null {
  const t = iso.trim();
  if (!t) return null;
  const d = new Date(t.length === 10 ? `${t}T12:00:00` : t);
  if (Number.isNaN(d.getTime())) return null;
  return { y: d.getFullYear(), m: d.getMonth() + 1 };
}

function espelhoSavedCreatedParts(item: SavedMirror): { y: number; m: number } | null {
  return item.createdAt ? espelhoSavedCalendarPartsFromIso(item.createdAt) : null;
}

function getEspelhoMoneyTripletMessage(d: MirrorDraft): string | null {
  const touched =
    d.measurementAmount.trim() !== '' ||
    d.laborAmount.trim() !== '' ||
    d.materialAmount.trim() !== '';
  if (!touched) return null;
  const m = parseEspelhoBrCurrencyToNumber(d.measurementAmount);
  const l = parseEspelhoBrCurrencyToNumber(d.laborAmount);
  const mat = parseEspelhoBrCurrencyToNumber(d.materialAmount);
  if (m === null) return 'Informe um valor válido para a medição.';
  if (m < 0) return 'O valor da medição não pode ser negativo.';
  if (l === null || mat === null) {
    return 'Informe valores válidos para mão de obra e material (a soma deve fechar o valor da medição).';
  }
  if (l < 0 || mat < 0) return 'Mão de obra e material não podem ser negativos.';
  const sum = round2EspelhoMoney(l + mat);
  const med = round2EspelhoMoney(m);
  const diffAbs = Math.abs(sum - med);
  if (diffAbs <= ESPELHO_MONEY_TRIPLET_TOLERANCE_RS + 1e-9) return null;
  if (sum > med) {
    return 'A soma de mão de obra e material é maior que o valor da medição. Ajuste os valores para que fechem a medição.';
  }
  return 'A soma de mão de obra e material é menor que o valor da medição. Ajuste os valores para que fechem a medição.';
}

const INITIAL_PROVIDER_FORM: Omit<ServiceProvider, 'id'> = {
  cnpj: '',
  municipalRegistration: '',
  stateRegistration: '',
  corporateName: '',
  tradeName: '',
  address: '',
  city: '',
  state: '',
  email: ''
};

const PROVIDERS_STORAGE_KEY = 'espelho-nf-service-providers';
const TAKERS_STORAGE_KEY = 'espelho-nf-service-takers';
const BANK_ACCOUNTS_STORAGE_KEY = 'espelho-nf-bank-accounts';
const TAX_CODES_STORAGE_KEY = 'espelho-nf-tax-codes';
const FEDERAL_TAX_RATES_STORAGE_KEY = 'espelho-nf-federal-tax-rates';
const FEDERAL_TAX_CONTEXT_ENABLED_STORAGE_KEY = 'espelho-nf-federal-tax-context-enabled';
const SAVED_MIRRORS_STORAGE_KEY = 'espelho-nf-saved-mirrors';
const MIRROR_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
const ESPELHO_APPROVAL_BADGE_CLASS: Record<EspelhoApprovalStatus, string> = {
  PENDING_APPROVAL:
    'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-800',
  APPROVED:
    'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-800',
  SENT_FOR_CORRECTION:
    'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-800',
  CANCELLED:
    'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-200 dark:border-red-800'
};

const INITIAL_TAKER_FORM: Omit<ServiceTaker, 'id'> = {
  name: '',
  cnpj: '',
  municipalRegistration: '',
  stateRegistration: '',
  corporateName: '',
  costCenterId: '',
  taxCodeId: '',
  bankAccountId: '',
  address: '',
  municipality: '',
  city: '',
  state: '',
  contractRef: '',
  serviceDescription: ''
};

const INITIAL_BANK_ACCOUNT_FORM: Omit<BankAccount, 'id'> = {
  name: '',
  bank: '',
  agency: '',
  account: ''
};

const INITIAL_TAX_RULE: TaxRule = {
  collectionType: 'RETIDO'
};

const INITIAL_FEDERAL_TAX_RATES: FederalTaxRates = {
  cofins: '',
  csll: '',
  inss: '',
  irpj: '',
  pis: ''
};

const INITIAL_FEDERAL_TAX_RATES_BY_CONTEXT: FederalTaxRatesByContext = {
  gdfObra: { ...INITIAL_FEDERAL_TAX_RATES },
  gdfManutencaoReforma: { ...INITIAL_FEDERAL_TAX_RATES },
  gdfMaoObraSemMaterial: { ...INITIAL_FEDERAL_TAX_RATES },
  foraGdfObra: { ...INITIAL_FEDERAL_TAX_RATES },
  foraGdfManutencaoReforma: { ...INITIAL_FEDERAL_TAX_RATES },
  foraGdfMaoObraSemMaterial: { ...INITIAL_FEDERAL_TAX_RATES }
};

const INITIAL_FEDERAL_TAX_CONTEXT_ENABLED: FederalTaxContextEnabled = {
  gdfObra: false,
  gdfManutencaoReforma: false,
  gdfMaoObraSemMaterial: false,
  foraGdfObra: false,
  foraGdfManutencaoReforma: false,
  foraGdfMaoObraSemMaterial: false
};

const FEDERAL_TAX_LAYOUT: Array<{
  title: string;
  contexts: Array<{ key: FederalTaxContextKey; label: string }>;
}> = [
  {
    title: 'Cliente do GDF ou possui convêncio com GDF',
    contexts: [
      { key: 'gdfObra', label: 'Obra' },
      { key: 'gdfManutencaoReforma', label: 'Manutenção ou reforma' },
      { key: 'gdfMaoObraSemMaterial', label: 'Fornecimento de mão de obra. Sem material.' }
    ]
  },
  {
    title: 'Cliente fora da esfera GDF',
    contexts: [
      { key: 'foraGdfObra', label: 'Obra' },
      { key: 'foraGdfManutencaoReforma', label: 'Manutenção ou reforma' },
      { key: 'foraGdfMaoObraSemMaterial', label: 'Fornecimento de mão de obra. Sem material.' }
    ]
  }
];

const INITIAL_TAX_CODE_FORM: Omit<TaxCode, 'id'> = {
  cityName: '',
  abatesMaterial: false,
  issRate: '',
  cofins: { ...INITIAL_TAX_RULE },
  csll: { ...INITIAL_TAX_RULE },
  inss: { ...INITIAL_TAX_RULE },
  irpj: { ...INITIAL_TAX_RULE },
  pis: { ...INITIAL_TAX_RULE },
  iss: { ...INITIAL_TAX_RULE },
  inssMaterialLimit: '',
  issMaterialLimit: ''
};

function EspelhoCentStepperMoneyInput({
  label,
  value,
  onChange,
  onBlur,
  showStepper = true,
  canStepDown,
  onStepUp,
  onStepDown
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlur: () => void;
  showStepper?: boolean;
  canStepDown: boolean;
  onStepUp: () => void;
  onStepDown: () => void;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">{label}</label>
      <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 overflow-hidden focus-within:ring-2 focus-within:ring-blue-500/80 dark:focus-within:ring-blue-400/80">
        <input
          type="text"
          inputMode="decimal"
          placeholder="R$ 0,00"
          value={value}
          onChange={onChange}
          onBlur={onBlur}
          className="flex-1 min-w-0 border-0 bg-transparent px-3 py-2 text-gray-900 dark:text-gray-100 text-right tabular-nums outline-none ring-0"
        />
        <div
          className="flex flex-col border-l border-gray-300 dark:border-gray-600 shrink-0 w-9"
          role={showStepper ? 'group' : undefined}
          aria-label={showStepper ? `Ajuste fino por centavo: ${label}` : undefined}
          aria-hidden={showStepper ? undefined : true}
        >
          <button
            type="button"
            onClick={showStepper ? onStepUp : undefined}
            disabled={!showStepper}
            className={`flex flex-1 items-center justify-center min-h-[28px] transition-colors ${
              showStepper
                ? 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700/80'
                : 'text-transparent pointer-events-none'
            }`}
            title={showStepper ? 'Somar R$ 0,01' : undefined}
            aria-label={showStepper ? 'Somar um centavo' : undefined}
          >
            <ChevronUp className="w-4 h-4" strokeWidth={2.25} aria-hidden />
          </button>
          <button
            type="button"
            onClick={showStepper ? onStepDown : undefined}
            disabled={showStepper ? !canStepDown : true}
            className={`flex flex-1 items-center justify-center min-h-[28px] border-t border-gray-300 dark:border-gray-600 transition-colors ${
              showStepper
                ? 'text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent disabled:cursor-not-allowed dark:text-gray-300 dark:hover:bg-gray-700/80 dark:disabled:hover:bg-transparent'
                : 'text-transparent pointer-events-none'
            }`}
            title={showStepper ? 'Subtrair R$ 0,01' : undefined}
            aria-label={showStepper ? 'Subtrair um centavo' : undefined}
          >
            <ChevronDown className="w-4 h-4" strokeWidth={2.25} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EspelhoNfPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<
    'espelho' | 'prestadores' | 'tomadores' | 'contas-bancarias' | 'codigo-tributario'
  >('espelho');
  const [draft, setDraft] = useState<MirrorDraft>(INITIAL_DRAFT);
  const [savedDrafts, setSavedDrafts] = useState<SavedMirror[]>([]);
  const [savedMirrorsHydrated, setSavedMirrorsHydrated] = useState(false);
  const [espelhoDbHydrated, setEspelhoDbHydrated] = useState(false);
  const [editingSavedMirrorId, setEditingSavedMirrorId] = useState<string | null>(null);
  const [detailMirror, setDetailMirror] = useState<SavedMirror | null>(null);
  const [serviceProviders, setServiceProviders] = useState<ServiceProvider[]>([]);
  const [serviceTakers, setServiceTakers] = useState<ServiceTaker[]>([]);
  const [providerForm, setProviderForm] = useState(INITIAL_PROVIDER_FORM);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [takerForm, setTakerForm] = useState(INITIAL_TAKER_FORM);
  const [editingTakerId, setEditingTakerId] = useState<string | null>(null);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [bankAccountForm, setBankAccountForm] = useState(INITIAL_BANK_ACCOUNT_FORM);
  const [editingBankAccountId, setEditingBankAccountId] = useState<string | null>(null);
  const [taxCodes, setTaxCodes] = useState<TaxCode[]>([]);
  const [taxCodeForm, setTaxCodeForm] = useState(INITIAL_TAX_CODE_FORM);
  const [editingTaxCodeId, setEditingTaxCodeId] = useState<string | null>(null);
  const [federalTaxRatesByContext, setFederalTaxRatesByContext] = useState<FederalTaxRatesByContext>(
    INITIAL_FEDERAL_TAX_RATES_BY_CONTEXT
  );
  const [federalTaxContextEnabled, setFederalTaxContextEnabled] = useState<FederalTaxContextEnabled>(
    INITIAL_FEDERAL_TAX_CONTEXT_ENABLED
  );
  const [espelhoProviderSearch, setEspelhoProviderSearch] = useState('');
  const [espelhoTakerSearch, setEspelhoTakerSearch] = useState('');
  const [espelhoSavedFilterCostCenter, setEspelhoSavedFilterCostCenter] = useState('');
  const [espelhoSavedFilterTaker, setEspelhoSavedFilterTaker] = useState('');
  const [espelhoSavedFilterMonth, setEspelhoSavedFilterMonth] = useState('');
  const [espelhoSavedFilterYear, setEspelhoSavedFilterYear] = useState('');

  const { costCenters: costCentersHook, isLoading: loadingCostCenters } = useCostCenters();

  const selectedFederalTaxContextKey = useMemo(
    () =>
      (Object.keys(federalTaxContextEnabled) as FederalTaxContextKey[]).find(
        (k) => federalTaxContextEnabled[k]
      ) ?? null,
    [federalTaxContextEnabled]
  );

  const federalTaxRates = useMemo(
    () =>
      selectedFederalTaxContextKey
        ? federalTaxRatesByContext[selectedFederalTaxContextKey]
        : INITIAL_FEDERAL_TAX_RATES,
    [federalTaxRatesByContext, selectedFederalTaxContextKey]
  );

  const costCentersForEspelho = useMemo(
    () =>
      costCentersHook.map((cc) => ({
        id: cc.id,
        code: cc.code,
        name: cc.name
      })),
    [costCentersHook]
  );

  const espelhoSavedYearOptions = useMemo(() => {
    const y = new Date().getFullYear();
    const fromDrafts = new Set<number>();
    savedDrafts.forEach((s) => {
      const p = espelhoSavedCreatedParts(s);
      if (p) fromDrafts.add(p.y);
    });
    for (let i = 0; i <= 5; i++) fromDrafts.add(y - i);
    fromDrafts.add(y + 1);
    return Array.from(fromDrafts).sort((a, b) => b - a);
  }, [savedDrafts]);

  const filteredSavedDrafts = useMemo(() => {
    return savedDrafts.filter((item) => {
      if (espelhoSavedFilterCostCenter && item.costCenterId !== espelhoSavedFilterCostCenter) {
        return false;
      }
      if (espelhoSavedFilterTaker && item.takerId !== espelhoSavedFilterTaker) {
        return false;
      }
      const needDate = espelhoSavedFilterMonth !== '' || espelhoSavedFilterYear !== '';
      if (needDate) {
        const parts = espelhoSavedCreatedParts(item);
        if (!parts) return false;
        if (espelhoSavedFilterMonth !== '' && parts.m !== Number(espelhoSavedFilterMonth)) {
          return false;
        }
        if (espelhoSavedFilterYear !== '' && parts.y !== Number(espelhoSavedFilterYear)) {
          return false;
        }
      }
      return true;
    });
  }, [
    savedDrafts,
    espelhoSavedFilterCostCenter,
    espelhoSavedFilterTaker,
    espelhoSavedFilterMonth,
    espelhoSavedFilterYear
  ]);

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };

  const normalizeForSearch = (value: string) =>
    value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const espelhoMoneyTripletError = useMemo(() => getEspelhoMoneyTripletMessage(draft), [draft]);

  const canSave = useMemo(
    () =>
      Boolean(
        draft.measurementRef.trim() &&
          draft.costCenterId &&
          draft.providerId &&
          draft.takerId &&
          draft.bankAccountId &&
          draft.taxCodeId &&
          draft.measurementStartDate &&
          draft.measurementEndDate &&
          !espelhoMoneyTripletError
      ),
    [draft, espelhoMoneyTripletError]
  );

  const filteredEspelhoProviders = useMemo(() => {
    const q = normalizeForSearch(espelhoProviderSearch.trim());
    if (!q) return serviceProviders;
    return serviceProviders.filter((p) =>
      normalizeForSearch(
        `${p.corporateName} ${p.tradeName} ${p.cnpj} ${p.city} ${p.state}`
      ).includes(q)
    );
  }, [serviceProviders, espelhoProviderSearch]);

  const filteredEspelhoTakers = useMemo(() => {
    const q = normalizeForSearch(espelhoTakerSearch.trim());
    if (!q) return serviceTakers;
    return serviceTakers.filter((t) =>
      normalizeForSearch(
        `${t.name} ${t.corporateName} ${t.cnpj} ${t.contractRef} ${t.city} ${t.state}`
      ).includes(q)
    );
  }, [serviceTakers, espelhoTakerSearch]);

  const draftTaxCode = useMemo(
    () => taxCodes.find((t) => t.id === draft.taxCodeId) ?? null,
    [taxCodes, draft.taxCodeId]
  );
  const draftTakerUf = useMemo(
    () => (serviceTakers.find((t) => t.id === draft.takerId)?.state ?? '').trim().toUpperCase(),
    [serviceTakers, draft.takerId]
  );
  const draftMunicipalityWithUf = useMemo(() => {
    const mun = draft.municipality.trim();
    if (!mun) return '—';
    return draftTakerUf ? `${mun} (${draftTakerUf})` : mun;
  }, [draft.municipality, draftTakerUf]);

  const espelhoIssRetidoPeloTomadorLabel = useMemo(() => {
    if (!draftTaxCode) return '—';
    if (draftTaxCode.iss.collectionType === 'RETIDO') return 'Sim';
    if (draftTaxCode.iss.collectionType === 'RECOLHIDO') return 'Não';
    return '—';
  }, [draftTaxCode]);

  const draftCostCenterLabel = useMemo(() => {
    const cc = costCentersForEspelho.find((row) => row.id === draft.costCenterId);
    if (!cc) return '';
    return [cc.code, cc.name].filter(Boolean).join(' — ') || cc.name || '';
  }, [costCentersForEspelho, draft.costCenterId]);

  const espelhoMaterialLimits = useMemo(
    () =>
      computeEspelhoMaterialLimits(
        draft.measurementAmount,
        draftTaxCode?.inssMaterialLimit,
        draftTaxCode?.issMaterialLimit
      ),
    [draft.measurementAmount, draftTaxCode]
  );

  const espelhoBasesCalculo = useMemo(
    () =>
      computeEspelhoBasesCalculoInssIss(
        draft.measurementAmount,
        draft.materialAmount,
        draftTaxCode?.inssMaterialLimit,
        draftTaxCode?.issMaterialLimit
      ),
    [draft.measurementAmount, draft.materialAmount, draftTaxCode]
  );

  const limitMaterialPctHint = (raw: string | undefined): string | null => {
    const t = (raw ?? '').trim();
    if (!t) return null;
    return t.endsWith('%') ? t : `${t}%`;
  };

  const espelhoImpostos = useMemo(() => {
    const med = parseEspelhoBrCurrencyToNumber(draft.measurementAmount);
    const baseInss = parseEspelhoBrCurrencyToNumber(espelhoBasesCalculo.baseInss);
    const baseIss = parseEspelhoBrCurrencyToNumber(espelhoBasesCalculo.baseIss);
    const zero = fmtEspelhoBrl(0);

    const buildTaxLine = (
      base: number | null,
      aliquotaRaw: string | undefined,
      collectionType: 'RETIDO' | 'RECOLHIDO' | undefined
    ) => {
      const aliquota = parseEspelhoPercentToNumber(aliquotaRaw);
      if (base === null || aliquota === null) {
        return { value: '—', recolher: null as string | null };
      }
      const calculado = fmtEspelhoBrl((base * aliquota) / 100);
      if (collectionType === 'RECOLHIDO') {
        return { value: zero, recolher: `Recolher ${calculado}` };
      }
      return { value: calculado, recolher: null as string | null };
    };

    return {
      cofins: buildTaxLine(med, federalTaxRates.cofins, draftTaxCode?.cofins.collectionType),
      csll: buildTaxLine(med, federalTaxRates.csll, draftTaxCode?.csll.collectionType),
      irpj: buildTaxLine(med, federalTaxRates.irpj, draftTaxCode?.irpj.collectionType),
      pis: buildTaxLine(med, federalTaxRates.pis, draftTaxCode?.pis.collectionType),
      inss: buildTaxLine(baseInss, federalTaxRates.inss, draftTaxCode?.inss.collectionType),
      iss: buildTaxLine(baseIss, draftTaxCode?.issRate, draftTaxCode?.iss.collectionType)
    };
  }, [draft.measurementAmount, espelhoBasesCalculo.baseInss, espelhoBasesCalculo.baseIss, federalTaxRates, draftTaxCode]);

  const espelhoValorLiquidoMeta = useMemo(() => {
    const med = parseEspelhoBrCurrencyToNumber(draft.measurementAmount);
    if (med === null) return { display: '—', saldoNegativo: false };
    const retidos = [
      espelhoImpostos.cofins.value,
      espelhoImpostos.csll.value,
      espelhoImpostos.irpj.value,
      espelhoImpostos.pis.value,
      espelhoImpostos.inss.value,
      espelhoImpostos.iss.value
    ].reduce((acc, raw) => acc + (parseEspelhoBrCurrencyToNumber(raw) ?? 0), 0);
    const liquid = round2(med - retidos);
    return {
      display: fmtEspelhoBrl(liquid),
      saldoNegativo: liquid < 0
    };
  }, [draft.measurementAmount, espelhoImpostos]);

  const onEspelhoMoneyChange =
    (field: 'measurementAmount' | 'laborAmount' | 'materialAmount') =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = sanitizeEspelhoMoneyTyping(e.target.value);
      setDraft((prev) => ({ ...prev, [field]: v }));
    };

  const onEspelhoMoneyBlur =
    (field: 'measurementAmount' | 'laborAmount' | 'materialAmount') => () => {
      setDraft((prev) => ({
        ...prev,
        [field]: normalizeEspelhoMoneyBlurToBrl(prev[field])
      }));
    };

  const nudgeEspelhoLaborMaterialCent =
    (field: 'laborAmount' | 'materialAmount', deltaCents: 1 | -1) => () => {
      setDraft((prev) => {
        const parsed = parseEspelhoBrCurrencyToNumber(prev[field]);
        const currentCents = Math.round((parsed ?? 0) * 100);
        const nextCents = Math.max(0, currentCents + deltaCents);
        return {
          ...prev,
          [field]: fmtEspelhoBrl(round2EspelhoMoney(nextCents / 100))
        };
      });
    };

  const laborCentCount = useMemo(() => {
    const n = parseEspelhoBrCurrencyToNumber(draft.laborAmount);
    return Math.round((n ?? 0) * 100);
  }, [draft.laborAmount]);

  const materialCentCount = useMemo(() => {
    const n = parseEspelhoBrCurrencyToNumber(draft.materialAmount);
    return Math.round((n ?? 0) * 100);
  }, [draft.materialAmount]);

  useEffect(() => {
    const raw = localStorage.getItem(PROVIDERS_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as ServiceProvider[];
      if (Array.isArray(parsed)) {
        setServiceProviders(parsed);
      }
    } catch {
      localStorage.removeItem(PROVIDERS_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(PROVIDERS_STORAGE_KEY, JSON.stringify(serviceProviders));
  }, [serviceProviders]);

  useEffect(() => {
    const raw = localStorage.getItem(TAKERS_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<ServiceTaker>[];
      if (Array.isArray(parsed)) {
        const normalized = parsed.map((item) => ({
          id: String(item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
          name: String(item.name || item.corporateName || ''),
          cnpj: String(item.cnpj || ''),
          municipalRegistration: String(item.municipalRegistration || ''),
          stateRegistration: String(item.stateRegistration || ''),
          corporateName: String(item.corporateName || ''),
          costCenterId: String(item.costCenterId || ''),
          taxCodeId: String(item.taxCodeId || ''),
          bankAccountId: String(item.bankAccountId || ''),
          address: String(item.address || ''),
          municipality: String(item.municipality || item.city || ''),
          city: String(item.city || ''),
          state: String(item.state || ''),
          contractRef: String(item.contractRef || ''),
          serviceDescription: String(item.serviceDescription || '')
        }));
        setServiceTakers(normalized);
      }
    } catch {
      localStorage.removeItem(TAKERS_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(TAKERS_STORAGE_KEY, JSON.stringify(serviceTakers));
  }, [serviceTakers]);

  useEffect(() => {
    const raw = localStorage.getItem(BANK_ACCOUNTS_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<BankAccount>[];
      if (Array.isArray(parsed)) {
        const normalized = parsed.map((item) => ({
          id: String(item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
          name: String(item.name || ''),
          bank: String(item.bank || ''),
          agency: String(item.agency || ''),
          account: String(item.account || '')
        }));
        setBankAccounts(normalized);
      }
    } catch {
      localStorage.removeItem(BANK_ACCOUNTS_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(BANK_ACCOUNTS_STORAGE_KEY, JSON.stringify(bankAccounts));
  }, [bankAccounts]);

  useEffect(() => {
    const raw = localStorage.getItem(TAX_CODES_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<TaxCode>[];
      if (Array.isArray(parsed)) {
        const normalizeRule = (rule?: Partial<TaxRule>, forceRetido = false): TaxRule => ({
          collectionType: forceRetido ? 'RETIDO' : rule?.collectionType === 'RECOLHIDO' ? 'RECOLHIDO' : 'RETIDO'
        });
        const normalized = parsed.map((item) => ({
          id: String(item.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`),
          cityName: String(item.cityName || ''),
          abatesMaterial: Boolean(item.abatesMaterial),
          issRate: String(item.issRate || ''),
          cofins: normalizeRule(item.cofins, true),
          csll: normalizeRule(item.csll, true),
          inss: normalizeRule(item.inss, true),
          irpj: normalizeRule(item.irpj, true),
          pis: normalizeRule(item.pis, true),
          iss: normalizeRule(item.iss),
          inssMaterialLimit: String(item.inssMaterialLimit || ''),
          issMaterialLimit: String(item.issMaterialLimit || '')
        }));
        setTaxCodes(normalized);
      }
    } catch {
      localStorage.removeItem(TAX_CODES_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(TAX_CODES_STORAGE_KEY, JSON.stringify(taxCodes));
  }, [taxCodes]);

  useEffect(() => {
    const raw = localStorage.getItem(FEDERAL_TAX_RATES_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<FederalTaxRatesByContext> & Partial<FederalTaxRates>;
      const looksLikeLegacy =
        typeof parsed?.cofins !== 'undefined' ||
        typeof parsed?.csll !== 'undefined' ||
        typeof parsed?.inss !== 'undefined' ||
        typeof parsed?.irpj !== 'undefined' ||
        typeof parsed?.pis !== 'undefined';
      if (looksLikeLegacy) {
        const legacy: FederalTaxRates = {
          cofins: String(parsed?.cofins || ''),
          csll: String(parsed?.csll || ''),
          inss: String(parsed?.inss || ''),
          irpj: String(parsed?.irpj || ''),
          pis: String(parsed?.pis || '')
        };
        setFederalTaxRatesByContext({
          gdfObra: { ...legacy },
          gdfManutencaoReforma: { ...legacy },
          gdfMaoObraSemMaterial: { ...legacy },
          foraGdfObra: { ...legacy },
          foraGdfManutencaoReforma: { ...legacy },
          foraGdfMaoObraSemMaterial: { ...legacy }
        });
        return;
      }
      const normalizeRates = (v: unknown): FederalTaxRates => {
        const o = v && typeof v === 'object' ? (v as Partial<FederalTaxRates>) : {};
        return {
          cofins: String(o.cofins || ''),
          csll: String(o.csll || ''),
          inss: String(o.inss || ''),
          irpj: String(o.irpj || ''),
          pis: String(o.pis || '')
        };
      };
      setFederalTaxRatesByContext({
        gdfObra: normalizeRates(parsed?.gdfObra),
        gdfManutencaoReforma: normalizeRates(parsed?.gdfManutencaoReforma),
        gdfMaoObraSemMaterial: normalizeRates(parsed?.gdfMaoObraSemMaterial),
        foraGdfObra: normalizeRates(parsed?.foraGdfObra),
        foraGdfManutencaoReforma: normalizeRates(parsed?.foraGdfManutencaoReforma),
        foraGdfMaoObraSemMaterial: normalizeRates(parsed?.foraGdfMaoObraSemMaterial)
      });
    } catch {
      localStorage.removeItem(FEDERAL_TAX_RATES_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(FEDERAL_TAX_RATES_STORAGE_KEY, JSON.stringify(federalTaxRatesByContext));
  }, [federalTaxRatesByContext]);

  useEffect(() => {
    const raw = localStorage.getItem(FEDERAL_TAX_CONTEXT_ENABLED_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Partial<FederalTaxContextEnabled>;
      setFederalTaxContextEnabled({
        gdfObra: Boolean(parsed?.gdfObra),
        gdfManutencaoReforma: Boolean(parsed?.gdfManutencaoReforma),
        gdfMaoObraSemMaterial: Boolean(parsed?.gdfMaoObraSemMaterial),
        foraGdfObra: Boolean(parsed?.foraGdfObra),
        foraGdfManutencaoReforma: Boolean(parsed?.foraGdfManutencaoReforma),
        foraGdfMaoObraSemMaterial: Boolean(parsed?.foraGdfMaoObraSemMaterial)
      });
    } catch {
      localStorage.removeItem(FEDERAL_TAX_CONTEXT_ENABLED_STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(FEDERAL_TAX_CONTEXT_ENABLED_STORAGE_KEY, JSON.stringify(federalTaxContextEnabled));
  }, [federalTaxContextEnabled]);

  useEffect(() => {
    const raw = localStorage.getItem(SAVED_MIRRORS_STORAGE_KEY);
    if (!raw) {
      setSavedMirrorsHydrated(true);
      return;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      setSavedDrafts(normalizeSavedMirrorsFromStorage(parsed));
    } catch {
      localStorage.removeItem(SAVED_MIRRORS_STORAGE_KEY);
    } finally {
      setSavedMirrorsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (!savedMirrorsHydrated) return;
    localStorage.setItem(SAVED_MIRRORS_STORAGE_KEY, JSON.stringify(savedDrafts));
  }, [savedDrafts, savedMirrorsHydrated]);

  useEffect(() => {
    let cancelled = false;
    const loadFromDb = async () => {
      try {
        const res = await api.get('/espelho-nf/bootstrap');
        const data = res?.data?.data || {};
        const providers = Array.isArray(data.providers) ? (data.providers as ServiceProvider[]) : [];
        const takers = Array.isArray(data.takers) ? (data.takers as ServiceTaker[]) : [];
        const banks = Array.isArray(data.bankAccounts) ? (data.bankAccounts as BankAccount[]) : [];
        const codes = Array.isArray(data.taxCodes) ? (data.taxCodes as TaxCode[]) : [];
        const mirrors = Array.isArray(data.mirrors) ? (data.mirrors as SavedMirror[]) : [];
        if (cancelled) return;
        setServiceProviders(providers);
        setServiceTakers(takers);
        setBankAccounts(banks);
        setTaxCodes(codes);
        const providerById = new Map(providers.map((p) => [p.id, p]));
        const takerById = new Map(takers.map((t) => [t.id, t]));
        const bankById = new Map(banks.map((b) => [b.id, b]));
        const taxById = new Map(codes.map((t) => [t.id, t]));
        setSavedDrafts(
          mirrors.map((m) => ({
            ...m,
            measurementStartDate: String(m.measurementStartDate ?? ''),
            measurementEndDate: String(m.measurementEndDate ?? ''),
            approvalStatus: resolveEspelhoApprovalStatus(m.id, m.approvalStatus),
            providerName: m.providerName || providerById.get(m.providerId)?.corporateName || '',
            takerName: m.takerName || takerById.get(m.takerId)?.corporateName || '',
            bankAccountName: m.bankAccountName || bankById.get(m.bankAccountId)?.name || '',
            taxCodeCityName: m.taxCodeCityName || taxById.get(m.taxCodeId)?.cityName || ''
          }))
        );
      } catch {
        // Mantém fallback local para não bloquear a operação.
      } finally {
        if (!cancelled) setEspelhoDbHydrated(true);
      }
    };
    loadFromDb();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!espelhoDbHydrated) return;
    const timer = setTimeout(() => {
      void api.put('/espelho-nf/bootstrap', {
        providers: serviceProviders,
        takers: serviceTakers,
        bankAccounts,
        taxCodes,
        mirrors: savedDrafts
      });
    }, 600);
    return () => clearTimeout(timer);
  }, [espelhoDbHydrated, serviceProviders, serviceTakers, bankAccounts, taxCodes, savedDrafts]);

  const canSaveProvider = useMemo(
    () =>
      Boolean(
        providerForm.cnpj.trim() &&
          providerForm.municipalRegistration.trim() &&
          providerForm.stateRegistration.trim() &&
          providerForm.corporateName.trim() &&
          providerForm.tradeName.trim() &&
          providerForm.address.trim() &&
          providerForm.state.trim()
      ),
    [providerForm]
  );

  const handleCreateOrUpdateProvider = () => {
    if (!canSaveProvider) {
      toast.error('Preencha os campos obrigatórios do prestador de serviço.');
      return;
    }
    if (editingProviderId) {
      setServiceProviders((prev) =>
        prev.map((provider) =>
          provider.id === editingProviderId
            ? {
                ...provider,
                cnpj: providerForm.cnpj.trim(),
                municipalRegistration: providerForm.municipalRegistration.trim(),
                stateRegistration: providerForm.stateRegistration.trim(),
                corporateName: providerForm.corporateName.trim(),
                tradeName: providerForm.tradeName.trim(),
                address: providerForm.address.trim(),
                city: providerForm.city.trim(),
                state: providerForm.state.trim().toUpperCase(),
                email: providerForm.email.trim()
              }
            : provider
        )
      );
      setEditingProviderId(null);
      setProviderForm(INITIAL_PROVIDER_FORM);
      toast.success('Prestador de serviço atualizado.');
      return;
    }
    const newProvider: ServiceProvider = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      cnpj: providerForm.cnpj.trim(),
      municipalRegistration: providerForm.municipalRegistration.trim(),
      stateRegistration: providerForm.stateRegistration.trim(),
      corporateName: providerForm.corporateName.trim(),
      tradeName: providerForm.tradeName.trim(),
      address: providerForm.address.trim(),
      city: providerForm.city.trim(),
      state: providerForm.state.trim().toUpperCase(),
      email: providerForm.email.trim()
    };
    setServiceProviders((prev) => [newProvider, ...prev]);
    setProviderForm(INITIAL_PROVIDER_FORM);
    toast.success('Prestador de serviço cadastrado.');
  };

  const handleEditProvider = (provider: ServiceProvider) => {
    setEditingProviderId(provider.id);
    setProviderForm({
      cnpj: provider.cnpj,
      municipalRegistration: provider.municipalRegistration,
      stateRegistration: provider.stateRegistration,
      corporateName: provider.corporateName,
      tradeName: provider.tradeName,
      address: provider.address,
      city: provider.city,
      state: provider.state,
      email: provider.email
    });
    setActiveTab('prestadores');
  };

  const handleDeleteProvider = (providerId: string) => {
    setServiceProviders((prev) => prev.filter((provider) => provider.id !== providerId));
    setDraft((prev) =>
      prev.providerId === providerId ? { ...prev, providerId: '', providerName: '' } : prev
    );
    if (editingProviderId === providerId) {
      setEditingProviderId(null);
      setProviderForm(INITIAL_PROVIDER_FORM);
    }
    toast.success('Prestador de serviço excluído.');
  };

  const canSaveTaker = useMemo(
    () =>
      Boolean(
        takerForm.cnpj.trim() &&
          takerForm.name.trim() &&
          takerForm.municipalRegistration.trim() &&
          takerForm.stateRegistration.trim() &&
          takerForm.corporateName.trim() &&
          takerForm.costCenterId.trim() &&
          takerForm.taxCodeId.trim() &&
          takerForm.bankAccountId.trim() &&
          takerForm.address.trim() &&
          takerForm.municipality.trim() &&
          takerForm.state.trim() &&
          takerForm.contractRef.trim() &&
          takerForm.serviceDescription.trim()
      ),
    [takerForm]
  );

  const handleCreateOrUpdateTaker = () => {
    if (!canSaveTaker) {
      toast.error('Preencha os campos obrigatórios do tomador de serviço.');
      return;
    }
    if (editingTakerId) {
      setServiceTakers((prev) =>
        prev.map((taker) =>
          taker.id === editingTakerId
            ? {
                ...taker,
                name: takerForm.name.trim(),
                cnpj: takerForm.cnpj.trim(),
                municipalRegistration: takerForm.municipalRegistration.trim(),
                stateRegistration: takerForm.stateRegistration.trim(),
                corporateName: takerForm.corporateName.trim(),
                costCenterId: takerForm.costCenterId.trim(),
                taxCodeId: takerForm.taxCodeId.trim(),
                bankAccountId: takerForm.bankAccountId.trim(),
                address: takerForm.address.trim(),
                municipality: takerForm.municipality.trim(),
                city: takerForm.city.trim(),
                state: takerForm.state.trim().toUpperCase(),
                contractRef: takerForm.contractRef.trim(),
                serviceDescription: takerForm.serviceDescription.trim()
              }
            : taker
        )
      );
      setEditingTakerId(null);
      setTakerForm(INITIAL_TAKER_FORM);
      toast.success('Tomador de serviço atualizado.');
      return;
    }

    const newTaker: ServiceTaker = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: takerForm.name.trim(),
      cnpj: takerForm.cnpj.trim(),
      municipalRegistration: takerForm.municipalRegistration.trim(),
      stateRegistration: takerForm.stateRegistration.trim(),
      corporateName: takerForm.corporateName.trim(),
      costCenterId: takerForm.costCenterId.trim(),
      taxCodeId: takerForm.taxCodeId.trim(),
      bankAccountId: takerForm.bankAccountId.trim(),
      address: takerForm.address.trim(),
      municipality: takerForm.municipality.trim(),
      city: takerForm.city.trim(),
      state: takerForm.state.trim().toUpperCase(),
      contractRef: takerForm.contractRef.trim(),
      serviceDescription: takerForm.serviceDescription.trim()
    };
    setServiceTakers((prev) => [newTaker, ...prev]);
    setTakerForm(INITIAL_TAKER_FORM);
    toast.success('Tomador de serviço cadastrado.');
  };

  const handleEditTaker = (taker: ServiceTaker) => {
    setEditingTakerId(taker.id);
    setTakerForm({
      name: taker.name || taker.corporateName || '',
      cnpj: taker.cnpj,
      municipalRegistration: taker.municipalRegistration,
      stateRegistration: taker.stateRegistration,
      corporateName: taker.corporateName,
      costCenterId: taker.costCenterId,
      taxCodeId: taker.taxCodeId,
      bankAccountId: taker.bankAccountId,
      address: taker.address,
      municipality: taker.municipality || taker.city || '',
      city: taker.city,
      state: taker.state,
      contractRef: taker.contractRef,
      serviceDescription: taker.serviceDescription
    });
    setActiveTab('tomadores');
  };

  const handleDeleteTaker = (takerId: string) => {
    setServiceTakers((prev) => prev.filter((taker) => taker.id !== takerId));
    setDraft((prev) =>
      prev.takerId === takerId ? { ...prev, takerId: '', takerName: '', municipality: '' } : prev
    );
    if (editingTakerId === takerId) {
      setEditingTakerId(null);
      setTakerForm(INITIAL_TAKER_FORM);
    }
    toast.success('Tomador de serviço excluído.');
  };

  const canSaveBankAccount = useMemo(
    () =>
      Boolean(
        bankAccountForm.name.trim() &&
          bankAccountForm.bank.trim() &&
          bankAccountForm.agency.trim() &&
          bankAccountForm.account.trim()
      ),
    [bankAccountForm]
  );

  const handleCreateOrUpdateBankAccount = () => {
    if (!canSaveBankAccount) {
      toast.error('Preencha os campos obrigatórios da conta bancária.');
      return;
    }

    if (editingBankAccountId) {
      setBankAccounts((prev) =>
        prev.map((account) =>
          account.id === editingBankAccountId
            ? {
                ...account,
                name: bankAccountForm.name.trim(),
                bank: bankAccountForm.bank.trim(),
                agency: bankAccountForm.agency.trim(),
                account: bankAccountForm.account.trim()
              }
            : account
        )
      );
      setEditingBankAccountId(null);
      setBankAccountForm(INITIAL_BANK_ACCOUNT_FORM);
      toast.success('Conta bancária atualizada.');
      return;
    }

    const newAccount: BankAccount = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: bankAccountForm.name.trim(),
      bank: bankAccountForm.bank.trim(),
      agency: bankAccountForm.agency.trim(),
      account: bankAccountForm.account.trim()
    };
    setBankAccounts((prev) => [newAccount, ...prev]);
    setBankAccountForm(INITIAL_BANK_ACCOUNT_FORM);
    toast.success('Conta bancária cadastrada.');
  };

  const handleEditBankAccount = (account: BankAccount) => {
    setEditingBankAccountId(account.id);
    setBankAccountForm({
      name: account.name,
      bank: account.bank,
      agency: account.agency,
      account: account.account
    });
    setActiveTab('contas-bancarias');
  };

  const handleDeleteBankAccount = (accountId: string) => {
    setBankAccounts((prev) => prev.filter((account) => account.id !== accountId));
    setDraft((prev) =>
      prev.bankAccountId === accountId
        ? { ...prev, bankAccountId: '', bankAccountName: '' }
        : prev
    );
    if (editingBankAccountId === accountId) {
      setEditingBankAccountId(null);
      setBankAccountForm(INITIAL_BANK_ACCOUNT_FORM);
    }
    toast.success('Conta bancária excluída.');
  };

  const canSaveTaxCode = useMemo(
    () =>
      Boolean(
        taxCodeForm.cityName.trim() &&
          taxCodeForm.issRate.trim() &&
          (!taxCodeForm.abatesMaterial ||
            (taxCodeForm.inssMaterialLimit.trim() && taxCodeForm.issMaterialLimit.trim()))
      ),
    [taxCodeForm]
  );

  const handleTaxRuleFieldChange = (
    taxName: 'cofins' | 'csll' | 'inss' | 'irpj' | 'pis' | 'iss',
    value: 'RETIDO' | 'RECOLHIDO'
  ) => {
    setTaxCodeForm((prev) => ({
      ...prev,
      [taxName]: {
        ...prev[taxName],
        collectionType: value
      }
    }));
  };

  const handleFederalTaxRateChange = (
    contextKey: FederalTaxContextKey,
    taxName: keyof FederalTaxRates,
    value: string
  ) => {
    setFederalTaxRatesByContext((prev) => ({
      ...prev,
      [contextKey]: { ...prev[contextKey], [taxName]: sanitizeEspelhoPercentTyping(value) }
    }));
  };

  const handleFederalTaxRateBlur = (
    contextKey: FederalTaxContextKey,
    taxName: keyof FederalTaxRates,
    value: string
  ) => {
    setFederalTaxRatesByContext((prev) => ({
      ...prev,
      [contextKey]: {
        ...prev[contextKey],
        [taxName]: normalizeEspelhoPercentBlur(value)
      }
    }));
  };

  const handleFederalTaxContextEnabledChange = (contextKey: FederalTaxContextKey, checked: boolean) => {
    setFederalTaxContextEnabled((prev) => {
      if (!checked) {
        return { ...prev, [contextKey]: false };
      }
      return {
        gdfObra: false,
        gdfManutencaoReforma: false,
        gdfMaoObraSemMaterial: false,
        foraGdfObra: false,
        foraGdfManutencaoReforma: false,
        foraGdfMaoObraSemMaterial: false,
        [contextKey]: true
      };
    });
  };

  const handleCreateOrUpdateTaxCode = () => {
    if (!canSaveTaxCode) {
      toast.error('Preencha todos os campos obrigatórios do código tributário.');
      return;
    }
    const normalizedIssRate = normalizeEspelhoPercentBlur(taxCodeForm.issRate.trim());
    const normalizedInssLimit = taxCodeForm.abatesMaterial
      ? normalizeEspelhoPercentBlur(taxCodeForm.inssMaterialLimit.trim())
      : '0';
    const normalizedIssLimit = taxCodeForm.abatesMaterial
      ? normalizeEspelhoPercentBlur(taxCodeForm.issMaterialLimit.trim())
      : '0';
    if (editingTaxCodeId) {
      setTaxCodes((prev) =>
        prev.map((taxCode) =>
          taxCode.id === editingTaxCodeId
            ? {
                ...taxCode,
                cityName: taxCodeForm.cityName.trim(),
                abatesMaterial: taxCodeForm.abatesMaterial,
                issRate: normalizedIssRate,
                cofins: { collectionType: 'RETIDO' },
                csll: { collectionType: 'RETIDO' },
                inss: { collectionType: 'RETIDO' },
                irpj: { collectionType: 'RETIDO' },
                pis: { collectionType: 'RETIDO' },
                iss: { ...taxCodeForm.iss },
                inssMaterialLimit: normalizedInssLimit,
                issMaterialLimit: normalizedIssLimit
              }
            : taxCode
        )
      );
      setEditingTaxCodeId(null);
      setTaxCodeForm(INITIAL_TAX_CODE_FORM);
      toast.success('Código tributário atualizado.');
      return;
    }

    const newTaxCode: TaxCode = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      cityName: taxCodeForm.cityName.trim(),
      abatesMaterial: taxCodeForm.abatesMaterial,
      issRate: normalizedIssRate,
      cofins: { collectionType: 'RETIDO' },
      csll: { collectionType: 'RETIDO' },
      inss: { collectionType: 'RETIDO' },
      irpj: { collectionType: 'RETIDO' },
      pis: { collectionType: 'RETIDO' },
      iss: { ...taxCodeForm.iss },
      inssMaterialLimit: normalizedInssLimit,
      issMaterialLimit: normalizedIssLimit
    };
    setTaxCodes((prev) => [newTaxCode, ...prev]);
    setTaxCodeForm(INITIAL_TAX_CODE_FORM);
    toast.success('Código tributário cadastrado.');
  };

  const handleEditTaxCode = (taxCode: TaxCode) => {
    setEditingTaxCodeId(taxCode.id);
    setTaxCodeForm({
      cityName: taxCode.cityName,
      abatesMaterial: taxCode.abatesMaterial,
      issRate: taxCode.issRate,
      cofins: { collectionType: 'RETIDO' },
      csll: { collectionType: 'RETIDO' },
      inss: { collectionType: 'RETIDO' },
      irpj: { collectionType: 'RETIDO' },
      pis: { collectionType: 'RETIDO' },
      iss: { ...taxCode.iss },
      inssMaterialLimit: taxCode.inssMaterialLimit,
      issMaterialLimit: taxCode.issMaterialLimit
    });
    setActiveTab('codigo-tributario');
  };

  const handleDeleteTaxCode = (taxCodeId: string) => {
    setTaxCodes((prev) => prev.filter((taxCode) => taxCode.id !== taxCodeId));
    setDraft((prev) =>
      prev.taxCodeId === taxCodeId
        ? { ...prev, taxCodeId: '', taxCodeCityName: '' }
        : prev
    );
    if (editingTaxCodeId === taxCodeId) {
      setEditingTaxCodeId(null);
      setTaxCodeForm(INITIAL_TAX_CODE_FORM);
    }
    toast.success('Código tributário excluído.');
  };

  const handleSaveDraft = () => {
    if (espelhoMoneyTripletError) {
      toast.error(espelhoMoneyTripletError);
      return;
    }
    if (!canSave) {
      toast.error(
        'Preencha a referência da medição, as datas de início/fim da medição, e selecione centro de custo, prestador, tomador, conta bancária e código tributário.'
      );
      return;
    }
    const snapshot = formatEspelhoDraftMoneyFields(draft);
    if (editingSavedMirrorId) {
      updateEspelhoApprovalStatus(editingSavedMirrorId, 'PENDING_APPROVAL');
      setSavedDrafts((prev) =>
        prev.map((s) =>
          s.id === editingSavedMirrorId
            ? {
                ...snapshot,
                id: editingSavedMirrorId,
                createdAt: s.createdAt ?? new Date().toISOString(),
                approvalStatus: 'PENDING_APPROVAL',
                nfAttachment: s.nfAttachment,
                xmlAttachment: s.xmlAttachment
              }
            : s
        )
      );
      setEditingSavedMirrorId(null);
      setDraft(INITIAL_DRAFT);
      toast.success('Espelho atualizado.');
      return;
    }
    const newId = newSavedMirrorId();
    updateEspelhoApprovalStatus(newId, 'PENDING_APPROVAL');
    setSavedDrafts((prev) => [
      {
        ...snapshot,
        id: newId,
        createdAt: new Date().toISOString(),
        approvalStatus: 'PENDING_APPROVAL'
      },
      ...prev
    ]);
    setDraft(INITIAL_DRAFT);
    toast.success('Espelho salvo.');
  };

  const handleExportDraftPdf = () => {
    if (espelhoMoneyTripletError) {
      toast.error(espelhoMoneyTripletError);
      return;
    }
    if (!canSave) {
      toast.error('Preencha o formulário para exportar o espelho em elaboração.');
      return;
    }
    exportEspelhoNfPdf(
      espelhoMirrorForExport(draft, costCentersForEspelho),
      serviceProviders,
      serviceTakers,
      bankAccounts,
      taxCodes,
      federalTaxRates
    );
    toast.success('Arquivo PDF gerado.');
  };

  const handleEditSavedMirror = (saved: SavedMirror) => {
    const {
      id,
      createdAt: _createdAt,
      nfAttachment: _nfAttachment,
      xmlAttachment: _xmlAttachment,
      ...rest
    } = saved;
    setDraft(formatEspelhoDraftMoneyFields(rest));
    setEditingSavedMirrorId(id);
    setActiveTab('espelho');
    toast.success('Altere os campos e clique em Salvar para concluir a edição.');
  };

  const handleAttachDetailFile = async (kind: 'nfAttachment' | 'xmlAttachment', file: File | null) => {
    if (!detailMirror || !file) return;
    if (file.size > MIRROR_ATTACHMENT_MAX_BYTES) {
      toast.error('Arquivo muito grande. Limite de 10 MB.');
      return;
    }
    try {
      const attachment: MirrorAttachment = {
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        dataUrl: await fileToDataUrl(file)
      };
      const mirrorId = detailMirror.id;
      setSavedDrafts((prev) =>
        prev.map((m) => (m.id === mirrorId ? { ...m, [kind]: attachment } : m))
      );
      setDetailMirror((prev) => (prev && prev.id === mirrorId ? { ...prev, [kind]: attachment } : prev));
      toast.success(kind === 'nfAttachment' ? 'Nota fiscal anexada.' : 'XML anexado.');
    } catch {
      toast.error('Não foi possível anexar o arquivo.');
    }
  };

  const handleRemoveDetailAttachment = (kind: 'nfAttachment' | 'xmlAttachment') => {
    if (!detailMirror) return;
    const mirrorId = detailMirror.id;
    setSavedDrafts((prev) => prev.map((m) => (m.id === mirrorId ? { ...m, [kind]: undefined } : m)));
    setDetailMirror((prev) => (prev && prev.id === mirrorId ? { ...prev, [kind]: undefined } : prev));
    toast.success('Anexo removido.');
  };

  const handleDownloadAttachment = (attachment: MirrorAttachment) => {
    const anchor = document.createElement('a');
    anchor.href = attachment.dataUrl;
    anchor.download = attachment.name;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  const handleDeleteSavedMirror = (id: string) => {
    removeEspelhoApprovalStatus(id);
    setSavedDrafts((prev) => prev.filter((s) => s.id !== id));
    if (editingSavedMirrorId === id) {
      setEditingSavedMirrorId(null);
      setDraft(INITIAL_DRAFT);
    }
    toast.success('Espelho excluído.');
  };

  const handleCancelSavedMirrorEdit = () => {
    setEditingSavedMirrorId(null);
    setDraft(INITIAL_DRAFT);
  };

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/espelho-nf">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Espelho NF</h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Base para emissão de nota fiscal com regras tributárias (em evolução).
            </p>
          </div>

          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="-mb-px flex space-x-6">
              <button
                type="button"
                onClick={() => setActiveTab('espelho')}
                className={`py-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'espelho'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 dark:text-gray-400'
                }`}
              >
                Espelho NF
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('prestadores')}
                className={`py-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'prestadores'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 dark:text-gray-400'
                }`}
              >
                Prestadores de Serviço
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('tomadores')}
                className={`py-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'tomadores'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 dark:text-gray-400'
                }`}
              >
                Tomadores de Serviço
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('contas-bancarias')}
                className={`py-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'contas-bancarias'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 dark:text-gray-400'
                }`}
              >
                Contas Bancárias
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('codigo-tributario')}
                className={`py-3 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'codigo-tributario'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 dark:text-gray-400'
                }`}
              >
                Código Tributário
              </button>
            </nav>
          </div>

          {activeTab === 'espelho' && (
            <Card>
              <CardHeader className="border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center">
                  <div className="flex items-center gap-2">
                    <FileSpreadsheet className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Novo espelho</h3>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                {editingSavedMirrorId && (
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-900/25">
                    <p className="text-sm text-amber-900 dark:text-amber-100">
                      Você está editando um espelho já salvo. Salve para aplicar ou cancele para descartar as
                      alterações no formulário.
                    </p>
                    <button
                      type="button"
                      onClick={handleCancelSavedMirrorEdit}
                      className="shrink-0 text-sm px-3 py-1.5 rounded-lg border border-amber-700 text-amber-900 hover:bg-amber-100 dark:border-amber-500 dark:text-amber-100 dark:hover:bg-amber-900/40"
                    >
                      Cancelar edição
                    </button>
                  </div>
                )}
                <div className="mb-6 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                  <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                    Prestador de serviço
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                    Selecione apenas 1 opção. Clique no card inteiro para marcar.
                  </p>
                  {serviceProviders.length === 0 ? (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Cadastre pelo menos um prestador na aba Prestadores de Serviço para selecionar no espelho.
                    </p>
                  ) : (
                    <>
                      <div className="relative mb-2">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                        <input
                          type="search"
                          placeholder="Pesquisar prestador..."
                          value={espelhoProviderSearch}
                          onChange={(e) => setEspelhoProviderSearch(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                        />
                      </div>
                      <div className="max-h-64 overflow-y-auto overscroll-y-contain pr-1 space-y-2 [scrollbar-gutter:stable]">
                        {filteredEspelhoProviders.length === 0 ? (
                          <p className="text-xs text-gray-500 dark:text-gray-400 py-2">
                            Nenhum prestador encontrado para a pesquisa.
                          </p>
                        ) : (
                          filteredEspelhoProviders.map((provider) => (
                            <label
                              key={provider.id}
                              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                draft.providerId === provider.id
                                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                  : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/60'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={draft.providerId === provider.id}
                                onChange={() =>
                                  setDraft((prev) => ({
                                    ...prev,
                                    providerId: prev.providerId === provider.id ? '' : provider.id,
                                    providerName:
                                      prev.providerId === provider.id ? '' : provider.corporateName
                                  }))
                                }
                                className="h-5 w-5 min-h-5 min-w-5 accent-blue-600 shrink-0"
                              />
                              <span className="text-sm text-gray-800 dark:text-gray-200 break-words">
                                {provider.corporateName} ({provider.cnpj}) - {provider.city}/{provider.state}
                              </span>
                            </label>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </div>
                <div className="mb-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="space-y-4">
                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                        Tomador de serviço
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                        Selecione apenas 1 opção. Clique no card inteiro para marcar.
                      </p>
                      {serviceTakers.length === 0 ? (
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Cadastre pelo menos um tomador na aba Tomadores de Serviço para selecionar no espelho.
                        </p>
                      ) : (
                        <>
                          <div className="relative mb-2">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                            <input
                              type="search"
                              placeholder="Pesquisar tomador..."
                              value={espelhoTakerSearch}
                              onChange={(e) => setEspelhoTakerSearch(e.target.value)}
                              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                            />
                          </div>
                          <div className="max-h-64 overflow-y-auto overscroll-y-contain pr-1 space-y-2 [scrollbar-gutter:stable]">
                            {filteredEspelhoTakers.length === 0 ? (
                              <p className="text-xs text-gray-500 dark:text-gray-400 py-2">
                                Nenhum tomador encontrado para a pesquisa.
                              </p>
                            ) : (
                              filteredEspelhoTakers.map((taker) => (
                                <label
                                  key={taker.id}
                                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                    draft.takerId === taker.id
                                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                      : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800/60'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    checked={draft.takerId === taker.id}
                                    onChange={() =>
                                      setDraft((prev) => {
                                        const deselect = prev.takerId === taker.id;
                                        if (deselect) {
                                          return {
                                            ...prev,
                                            takerId: '',
                                            takerName: '',
                                            municipality: '',
                                            costCenterId: '',
                                            bankAccountId: '',
                                            bankAccountName: '',
                                            taxCodeId: '',
                                            taxCodeCityName: ''
                                          };
                                        }
                                        const linkedTaxCode =
                                          taxCodes.find((code) => code.id === taker.taxCodeId) ?? null;
                                        const linkedBank =
                                          bankAccounts.find((account) => account.id === taker.bankAccountId) ?? null;
                                        return {
                                          ...prev,
                                          takerId: taker.id,
                                          takerName: taker.corporateName,
                                          municipality: taker.municipality || taker.city || '',
                                          costCenterId: taker.costCenterId || '',
                                          bankAccountId: taker.bankAccountId || '',
                                          bankAccountName: linkedBank?.name || '',
                                          taxCodeId: taker.taxCodeId || '',
                                          taxCodeCityName: linkedTaxCode?.cityName || ''
                                        };
                                      })
                                    }
                                    className="h-5 w-5 min-h-5 min-w-5 accent-blue-600 shrink-0"
                                  />
                                  <span className="text-sm text-gray-800 dark:text-gray-200 break-words">
                                    {taker.name} - {taker.corporateName} ({taker.cnpj}) - Contrato: {taker.contractRef}
                                  </span>
                                </label>
                              ))
                            )}
                          </div>
                        </>
                      )}
                    </div>
                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-4 space-y-1">
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Centro de custo</label>
                      <input
                        type="text"
                        readOnly
                        tabIndex={-1}
                        value={draftCostCenterLabel || 'Será preenchido automaticamente pelo tomador selecionado'}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-800/80 text-gray-900 dark:text-gray-100 cursor-not-allowed"
                      />
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
                        Código tributário
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
                        Campo automático conforme o tomador selecionado.
                      </p>
                      <input
                        type="text"
                        readOnly
                        tabIndex={-1}
                        value={draft.taxCodeCityName || 'Será preenchido automaticamente pelo tomador selecionado'}
                        className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-800/80 text-gray-900 dark:text-gray-100 cursor-not-allowed"
                      />
                    </div>
                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-1">
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Município</label>
                      <input
                        type="text"
                        readOnly
                        tabIndex={-1}
                        value={draft.municipality || 'Será preenchido automaticamente pelo tomador selecionado'}
                        className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-800/80 text-gray-900 dark:text-gray-100 cursor-not-allowed"
                      />
                    </div>
                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-1">
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Conta bancária</label>
                      <input
                        type="text"
                        readOnly
                        tabIndex={-1}
                        value={draft.bankAccountName || 'Será preenchido automaticamente pelo tomador selecionado'}
                        className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-800/80 text-gray-900 dark:text-gray-100 cursor-not-allowed"
                      />
                    </div>
                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-1">
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">CNAE</label>
                      <input
                        type="text"
                        value={draft.cnae}
                        onChange={(e) => setDraft((prev) => ({ ...prev, cnae: e.target.value }))}
                        className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      />
                    </div>
                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-1">
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                        Lista de Serviços - ISSQN
                      </label>
                      <select
                        value={draft.serviceIssqn}
                        onChange={(e) => setDraft((prev) => ({ ...prev, serviceIssqn: e.target.value }))}
                        className="w-full px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                      >
                        <option value="">Selecione...</option>
                        <option value="07.02 - Obra">07.02 - Obra</option>
                        <option value="07.05 - Manutenção">07.05 - Manutenção</option>
                      </select>
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input
                    type="text"
                    placeholder="Referência da medição (ex.: Medição 87 - Abril/2026)"
                    value={draft.measurementRef}
                    onChange={(e) => setDraft((prev) => ({ ...prev, measurementRef: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 md:col-span-2"
                  />
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Vencimento</label>
                    <input
                      type="date"
                      value={draft.dueDate}
                      onChange={(e) => setDraft((prev) => ({ ...prev, dueDate: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Nº Empenho</label>
                    <input
                      type="text"
                      value={draft.empenhoNumber}
                      onChange={(e) => setDraft((prev) => ({ ...prev, empenhoNumber: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Nº Processo</label>
                    <input
                      type="text"
                      value={draft.processNumber}
                      onChange={(e) => setDraft((prev) => ({ ...prev, processNumber: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Ordem de Serviço</label>
                    <input
                      type="text"
                      value={draft.serviceOrder}
                      onChange={(e) => setDraft((prev) => ({ ...prev, serviceOrder: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Unidade Predial</label>
                    <input
                      type="text"
                      value={draft.buildingUnit}
                      onChange={(e) => setDraft((prev) => ({ ...prev, buildingUnit: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 self-end">
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                          Início da medição
                        </label>
                        <input
                          type="date"
                          value={draft.measurementStartDate}
                          onChange={(e) => setDraft((prev) => ({ ...prev, measurementStartDate: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                          required
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                          Fim da medição
                        </label>
                        <input
                          type="date"
                          value={draft.measurementEndDate}
                          onChange={(e) => setDraft((prev) => ({ ...prev, measurementEndDate: e.target.value }))}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                          required
                        />
                      </div>
                  </div>
                  <div className="space-y-1 md:col-span-2">
                    <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Observações</label>
                    <textarea
                      rows={3}
                      placeholder="Observações sobre este espelho..."
                      value={draft.observations}
                      onChange={(e) => setDraft((prev) => ({ ...prev, observations: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-y min-h-[4.5rem]"
                    />
                  </div>
                </div>
                <div className="mt-4 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <EspelhoCentStepperMoneyInput
                      label="Medição (R$)"
                      value={draft.measurementAmount}
                      onChange={onEspelhoMoneyChange('measurementAmount')}
                      onBlur={onEspelhoMoneyBlur('measurementAmount')}
                      showStepper={false}
                      canStepDown={false}
                      onStepUp={() => undefined}
                      onStepDown={() => undefined}
                    />
                    <EspelhoCentStepperMoneyInput
                      label="Mão de obra (R$)"
                      value={draft.laborAmount}
                      onChange={onEspelhoMoneyChange('laborAmount')}
                      onBlur={onEspelhoMoneyBlur('laborAmount')}
                      canStepDown={laborCentCount >= 1}
                      onStepUp={nudgeEspelhoLaborMaterialCent('laborAmount', 1)}
                      onStepDown={nudgeEspelhoLaborMaterialCent('laborAmount', -1)}
                    />
                    <EspelhoCentStepperMoneyInput
                      label="Material (R$)"
                      value={draft.materialAmount}
                      onChange={onEspelhoMoneyChange('materialAmount')}
                      onBlur={onEspelhoMoneyBlur('materialAmount')}
                      canStepDown={materialCentCount >= 1}
                      onStepUp={nudgeEspelhoLaborMaterialCent('materialAmount', 1)}
                      onStepDown={nudgeEspelhoLaborMaterialCent('materialAmount', -1)}
                    />
                  </div>
                  {espelhoMoneyTripletError && (
                    <p className="text-xs font-medium text-red-600 dark:text-red-400" role="alert">
                      {espelhoMoneyTripletError}
                    </p>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                          Limite Material INSS
                        </label>
                        <div className="space-y-0.5">
                          {limitMaterialPctHint(draftTaxCode?.inssMaterialLimit) && (
                            <p className="text-[11px] font-medium leading-tight text-blue-700 dark:text-blue-300">
                              Percentual: {limitMaterialPctHint(draftTaxCode?.inssMaterialLimit)}
                            </p>
                          )}
                          <input
                            type="text"
                            readOnly
                            tabIndex={-1}
                            value={espelhoMaterialLimits.inssBrl}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-800/80 text-gray-900 dark:text-gray-100 cursor-not-allowed"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                          Base de cálculo INSS
                        </label>
                        <input
                          type="text"
                          readOnly
                          tabIndex={-1}
                          value={espelhoBasesCalculo.baseInss}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-800/80 text-gray-900 dark:text-gray-100 cursor-not-allowed"
                        />
                      </div>
                    </div>
                    <div className="space-y-3 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                          Limite Material ISS
                        </label>
                        <div className="space-y-0.5">
                          {limitMaterialPctHint(draftTaxCode?.issMaterialLimit) && (
                            <p className="text-[11px] font-medium leading-tight text-blue-700 dark:text-blue-300">
                              Percentual: {limitMaterialPctHint(draftTaxCode?.issMaterialLimit)}
                            </p>
                          )}
                          <input
                            type="text"
                            readOnly
                            tabIndex={-1}
                            value={espelhoMaterialLimits.issBrl}
                            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-800/80 text-gray-900 dark:text-gray-100 cursor-not-allowed"
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                          Base de cálculo ISS
                        </label>
                        <input
                          type="text"
                          readOnly
                          tabIndex={-1}
                          value={espelhoBasesCalculo.baseIss}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-800/80 text-gray-900 dark:text-gray-100 cursor-not-allowed"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:items-stretch">
                    <div className="flex h-full flex-col gap-1">
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">COFINS</label>
                      <div className="space-y-0.5">
                        <p className="text-[11px] font-medium leading-tight text-blue-700 dark:text-blue-300">
                          Percentual: {limitMaterialPctHint(federalTaxRates.cofins) ?? '—'}
                        </p>
                        <input
                          type="text"
                          readOnly
                          tabIndex={-1}
                          value={espelhoImpostos.cofins.value}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-800/80 text-gray-900 dark:text-gray-100 cursor-not-allowed"
                        />
                      </div>
                      <div className="min-h-[2.75rem]">
                        {espelhoImpostos.cofins.recolher && (
                          <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                            {espelhoImpostos.cofins.recolher}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex h-full flex-col gap-1">
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">CSLL</label>
                      <div className="space-y-0.5">
                        <p className="text-[11px] font-medium leading-tight text-blue-700 dark:text-blue-300">
                          Percentual: {limitMaterialPctHint(federalTaxRates.csll) ?? '—'}
                        </p>
                        <input
                          type="text"
                          readOnly
                          tabIndex={-1}
                          value={espelhoImpostos.csll.value}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-800/80 text-gray-900 dark:text-gray-100 cursor-not-allowed"
                        />
                      </div>
                      <div className="min-h-[2.75rem]">
                        {espelhoImpostos.csll.recolher && (
                          <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                            {espelhoImpostos.csll.recolher}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex h-full flex-col gap-1">
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">IRPJ</label>
                      <div className="space-y-0.5">
                        <p className="text-[11px] font-medium leading-tight text-blue-700 dark:text-blue-300">
                          Percentual: {limitMaterialPctHint(federalTaxRates.irpj) ?? '—'}
                        </p>
                        <input
                          type="text"
                          readOnly
                          tabIndex={-1}
                          value={espelhoImpostos.irpj.value}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-800/80 text-gray-900 dark:text-gray-100 cursor-not-allowed"
                        />
                      </div>
                      <div className="min-h-[2.75rem]">
                        {espelhoImpostos.irpj.recolher && (
                          <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                            {espelhoImpostos.irpj.recolher}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex h-full flex-col gap-1">
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">PIS</label>
                      <div className="space-y-0.5">
                        <p className="text-[11px] font-medium leading-tight text-blue-700 dark:text-blue-300">
                          Percentual: {limitMaterialPctHint(federalTaxRates.pis) ?? '—'}
                        </p>
                        <input
                          type="text"
                          readOnly
                          tabIndex={-1}
                          value={espelhoImpostos.pis.value}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-800/80 text-gray-900 dark:text-gray-100 cursor-not-allowed"
                        />
                      </div>
                      <div className="min-h-[2.75rem]">
                        {espelhoImpostos.pis.recolher && (
                          <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                            {espelhoImpostos.pis.recolher}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex h-full flex-col gap-1">
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">INSS</label>
                      <div className="space-y-0.5">
                        <p className="text-[11px] font-medium leading-tight text-blue-700 dark:text-blue-300">
                          Percentual: {limitMaterialPctHint(federalTaxRates.inss) ?? '—'}
                        </p>
                        <input
                          type="text"
                          readOnly
                          tabIndex={-1}
                          value={espelhoImpostos.inss.value}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-800/80 text-gray-900 dark:text-gray-100 cursor-not-allowed"
                        />
                      </div>
                      <div className="min-h-[2.75rem]">
                        {espelhoImpostos.inss.recolher && (
                          <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                            {espelhoImpostos.inss.recolher}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex h-full flex-col gap-1">
                      <label className="text-xs font-medium text-gray-600 dark:text-gray-400">ISS</label>
                      <div className="space-y-0.5">
                        <p className="text-[11px] font-medium leading-tight text-blue-700 dark:text-blue-300">
                          Percentual: {limitMaterialPctHint(draftTaxCode?.issRate) ?? '—'}
                        </p>
                        <input
                          type="text"
                          readOnly
                          tabIndex={-1}
                          value={espelhoImpostos.iss.value}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-800/80 text-gray-900 dark:text-gray-100 cursor-not-allowed"
                        />
                      </div>
                      <div className="min-h-[2.75rem]">
                        {espelhoImpostos.iss.recolher && (
                          <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300">
                            {espelhoImpostos.iss.recolher}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-stretch">
                    <div className="flex min-h-[140px] flex-1 flex-col gap-2">
                      <label className="text-sm font-medium text-gray-700 dark:text-gray-200">Outras informações</label>
                      <div className="space-y-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50/90 dark:bg-gray-900/50 px-3 py-3 text-sm text-gray-800 dark:text-gray-200 leading-relaxed">
                        <p>
                          Retenção do INSS no Percentual de 11%. Dedução da BC do INSS conforme art. 117, inciso IV
                          da IN RFB No 2110/2022.
                        </p>
                        <p>
                          O ISS desta NF-e será RETIDO pelo TOMADOR DE SERVIÇO? —{' '}
                          <span className="font-semibold text-gray-900 dark:text-gray-100">
                            {espelhoIssRetidoPeloTomadorLabel}
                          </span>
                        </p>
                        <p>
                          O ISS desta NF-e é devido no Município de - {' '}
                          <span className="font-semibold text-gray-900 dark:text-gray-100">
                            {draftMunicipalityWithUf}
                          </span>
                          .
                        </p>
                      </div>
                      <textarea
                        rows={3}
                        placeholder="Informações complementares (opcional)..."
                        value={draft.notes}
                        onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))}
                        className="min-h-[72px] w-full flex-1 resize-y px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                      />
                    </div>
                    <div
                      className={
                        espelhoValorLiquidoMeta.saldoNegativo
                          ? 'w-full shrink-0 rounded-lg border-2 border-amber-400/80 bg-amber-50/80 dark:bg-amber-950/40 p-3 md:w-[320px] md:self-stretch md:flex md:flex-col'
                          : 'w-full shrink-0 rounded-lg border-2 border-emerald-400/70 bg-emerald-50/80 dark:bg-emerald-900/20 p-3 md:w-[320px] md:self-stretch md:flex md:flex-col'
                      }
                    >
                      <label
                        className={
                          espelhoValorLiquidoMeta.saldoNegativo
                            ? 'mb-2 block text-sm font-semibold text-amber-900 dark:text-amber-200'
                            : 'mb-2 block text-sm font-semibold text-emerald-800 dark:text-emerald-300'
                        }
                      >
                        Valor Líquido
                      </label>
                      <input
                        type="text"
                        readOnly
                        tabIndex={-1}
                        value={espelhoValorLiquidoMeta.display}
                        className={
                          espelhoValorLiquidoMeta.saldoNegativo
                            ? 'w-full flex-1 px-3 py-2 text-base font-bold text-center border border-amber-400/70 rounded-lg bg-white dark:bg-gray-800 text-amber-900 dark:text-amber-200 cursor-not-allowed md:min-h-0'
                            : 'w-full flex-1 px-3 py-2 text-base font-bold text-center border border-emerald-400/60 rounded-lg bg-white dark:bg-gray-800 text-emerald-700 dark:text-emerald-300 cursor-not-allowed md:min-h-0'
                        }
                      />
                      {espelhoValorLiquidoMeta.saldoNegativo ? (
                        <p className="mt-2 text-xs text-amber-900/90 dark:text-amber-200/90">
                          A soma das retenções excede o valor da medição; o saldo fica negativo. Revise
                          alíquotas ou valores de medição/material.
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={!canSave}
                    title={espelhoMoneyTripletError ?? undefined}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    {editingSavedMirrorId ? (
                      <Pencil className="w-4 h-4" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    {editingSavedMirrorId ? 'Salvar alterações' : 'Salvar espelho'}
                  </button>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'prestadores' && (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Cadastro de prestador de serviço
                </h3>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <input
                    type="text"
                    placeholder="CNPJ *"
                    value={providerForm.cnpj}
                    onChange={(e) => setProviderForm((prev) => ({ ...prev, cnpj: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <input
                    type="text"
                    placeholder="Inscrição Municipal *"
                    value={providerForm.municipalRegistration}
                    onChange={(e) =>
                      setProviderForm((prev) => ({ ...prev, municipalRegistration: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <input
                    type="text"
                    placeholder="Inscrição Estadual *"
                    value={providerForm.stateRegistration}
                    onChange={(e) =>
                      setProviderForm((prev) => ({ ...prev, stateRegistration: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <input
                    type="text"
                    placeholder="Nome/Razão Social *"
                    value={providerForm.corporateName}
                    onChange={(e) =>
                      setProviderForm((prev) => ({ ...prev, corporateName: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 md:col-span-2"
                  />
                  <input
                    type="text"
                    placeholder="Nome Fantasia *"
                    value={providerForm.tradeName}
                    onChange={(e) => setProviderForm((prev) => ({ ...prev, tradeName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <input
                    type="text"
                    placeholder="Endereço *"
                    value={providerForm.address}
                    onChange={(e) => setProviderForm((prev) => ({ ...prev, address: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 md:col-span-2"
                  />
                  <input
                    type="text"
                    placeholder="UF *"
                    value={providerForm.state}
                    onChange={(e) => setProviderForm((prev) => ({ ...prev, state: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <input
                    type="email"
                    placeholder="E-mail"
                    value={providerForm.email}
                    onChange={(e) => setProviderForm((prev) => ({ ...prev, email: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleCreateOrUpdateProvider}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    {editingProviderId ? 'Salvar alteração' : 'Cadastrar prestador'}
                  </button>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'tomadores' && (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Cadastro de tomador de serviço
                </h3>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <input
                    type="text"
                    placeholder="Nome do Tomador *"
                    value={takerForm.name}
                    onChange={(e) => setTakerForm((prev) => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <input
                    type="text"
                    placeholder="CNPJ *"
                    value={takerForm.cnpj}
                    onChange={(e) => setTakerForm((prev) => ({ ...prev, cnpj: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <input
                    type="text"
                    placeholder="Inscrição Municipal *"
                    value={takerForm.municipalRegistration}
                    onChange={(e) =>
                      setTakerForm((prev) => ({ ...prev, municipalRegistration: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <input
                    type="text"
                    placeholder="Inscrição Estadual *"
                    value={takerForm.stateRegistration}
                    onChange={(e) =>
                      setTakerForm((prev) => ({ ...prev, stateRegistration: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <input
                    type="text"
                    placeholder="Nome do contrato *"
                    value={takerForm.corporateName}
                    onChange={(e) =>
                      setTakerForm((prev) => ({ ...prev, corporateName: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 md:col-span-2"
                  />
                  <select
                    value={takerForm.costCenterId}
                    onChange={(e) => setTakerForm((prev) => ({ ...prev, costCenterId: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">Centro de Custo *</option>
                    {costCentersForEspelho
                      .filter((cc): cc is typeof cc & { id: string } => Boolean(cc.id))
                      .map((cc) => (
                        <option key={cc.id} value={cc.id}>
                          {[cc.code, cc.name].filter(Boolean).join(' — ') || cc.name || '—'}
                        </option>
                      ))}
                  </select>
                  <select
                    value={takerForm.taxCodeId}
                    onChange={(e) => setTakerForm((prev) => ({ ...prev, taxCodeId: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">Código Tributário *</option>
                    {[...taxCodes]
                      .sort((a, b) => a.cityName.localeCompare(b.cityName, 'pt-BR'))
                      .map((taxCode) => (
                        <option key={taxCode.id} value={taxCode.id}>
                          {taxCode.cityName}
                        </option>
                      ))}
                  </select>
                  <select
                    value={takerForm.bankAccountId}
                    onChange={(e) => setTakerForm((prev) => ({ ...prev, bankAccountId: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">Conta Bancária *</option>
                    {[...bankAccounts]
                      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
                      .map((acc) => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name} - {acc.bank} | Ag: {acc.agency} | C/C: {acc.account}
                        </option>
                      ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Contrato *"
                    value={takerForm.contractRef}
                    onChange={(e) => setTakerForm((prev) => ({ ...prev, contractRef: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <input
                    type="text"
                    placeholder="Endereço *"
                    value={takerForm.address}
                    onChange={(e) => setTakerForm((prev) => ({ ...prev, address: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 md:col-span-2"
                  />
                  <input
                    type="text"
                    placeholder="Município *"
                    value={takerForm.municipality}
                    onChange={(e) =>
                      setTakerForm((prev) => ({
                        ...prev,
                        municipality: e.target.value,
                        city: e.target.value
                      }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <input
                    type="text"
                    placeholder="UF *"
                    value={takerForm.state}
                    onChange={(e) => setTakerForm((prev) => ({ ...prev, state: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <input
                    type="text"
                    placeholder="Discriminação dos serviços *"
                    value={takerForm.serviceDescription}
                    onChange={(e) =>
                      setTakerForm((prev) => ({ ...prev, serviceDescription: e.target.value }))
                    }
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 md:col-span-2"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleCreateOrUpdateTaker}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    {editingTakerId ? 'Salvar alteração' : 'Cadastrar tomador'}
                  </button>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'contas-bancarias' && (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Cadastro de conta bancária
                </h3>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <input
                    type="text"
                    placeholder="NOME *"
                    value={bankAccountForm.name}
                    onChange={(e) => setBankAccountForm((prev) => ({ ...prev, name: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <input
                    type="text"
                    placeholder="BANCO *"
                    value={bankAccountForm.bank}
                    onChange={(e) => setBankAccountForm((prev) => ({ ...prev, bank: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <input
                    type="text"
                    placeholder="AGÊNCIA *"
                    value={bankAccountForm.agency}
                    onChange={(e) => setBankAccountForm((prev) => ({ ...prev, agency: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                  <input
                    type="text"
                    placeholder="C/C *"
                    value={bankAccountForm.account}
                    onChange={(e) => setBankAccountForm((prev) => ({ ...prev, account: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleCreateOrUpdateBankAccount}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    {editingBankAccountId ? 'Salvar alteração' : 'Cadastrar conta'}
                  </button>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'codigo-tributario' && (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Cadastro de código tributário
                </h3>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="grid grid-cols-1 gap-4 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
                  <p className="text-base md:text-lg font-bold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 pb-2 mb-2">
                    Cadastro de código do contrato
                  </p>
                  <input
                    type="text"
                    placeholder="Nome do Contrato *"
                    value={taxCodeForm.cityName}
                    onChange={(e) => setTaxCodeForm((prev) => ({ ...prev, cityName: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {FEDERAL_TAX_LAYOUT.map((group) => (
                      <div
                        key={group.title}
                        className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-800/40 p-3 space-y-2"
                      >
                        <p className="text-xs sm:text-sm font-semibold text-gray-800 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 pb-2">
                          {group.title}
                        </p>
                        {group.contexts.map((ctx) => (
                          <div key={ctx.key} className="space-y-1.5">
                            <label className="inline-flex items-center gap-2 text-xs font-medium text-gray-600 dark:text-gray-300 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={federalTaxContextEnabled[ctx.key]}
                                onChange={(e) =>
                                  handleFederalTaxContextEnabledChange(ctx.key, e.currentTarget.checked)
                                }
                                className="h-4 w-4 accent-blue-600"
                              />
                              <span>{ctx.label}</span>
                            </label>
                            <div className="flex flex-nowrap gap-1.5 pb-1">
                              {([
                                ['cofins', 'COFINS'],
                                ['csll', 'CSLL'],
                                ['inss', 'INSS'],
                                ['irpj', 'IRPJ'],
                                ['pis', 'PIS']
                              ] as const).map(([taxKey, label]) => (
                                <div
                                  key={`${ctx.key}-${taxKey}`}
                                  className={`inline-flex items-center rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-900/60 ${
                                    taxKey === 'pis' ? 'gap-1 px-2 py-1' : 'gap-1.5 px-2.5 py-1.5'
                                  }`}
                                >
                                  <span
                                    className={`text-xs font-semibold tabular-nums text-gray-700 dark:text-gray-200 shrink-0 ${
                                      taxKey === 'cofins' ? 'w-11' : 'w-8'
                                    }`}
                                  >
                                    {label}
                                  </span>
                                  <div className="flex items-center gap-0.5">
                                    <input
                                      type="text"
                                      inputMode="decimal"
                                      placeholder="0"
                                      value={federalTaxRatesByContext[ctx.key][taxKey]}
                                      onChange={(e) => handleFederalTaxRateChange(ctx.key, taxKey, e.target.value)}
                                      onBlur={(e) => handleFederalTaxRateBlur(ctx.key, taxKey, e.target.value)}
                                      className={`px-1.5 py-1 text-sm text-right tabular-nums border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 ${
                                        taxKey === 'pis' ? 'min-w-[3.5rem] w-14 sm:w-[4.25rem]' : 'min-w-[3.5rem] w-16 sm:w-[4.5rem]'
                                      }`}
                                    />
                                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400 w-4 shrink-0">
                                      %
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}

                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-4 text-sm text-gray-900 dark:text-gray-100">
                      <p className="font-medium mb-2">Abate material?</p>
                      <div className="flex items-center gap-6">
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={taxCodeForm.abatesMaterial}
                            onChange={() =>
                              setTaxCodeForm((prev) => ({
                                ...prev,
                                abatesMaterial: true,
                                inssMaterialLimit: prev.inssMaterialLimit === '0' ? '' : prev.inssMaterialLimit,
                                issMaterialLimit: prev.issMaterialLimit === '0' ? '' : prev.issMaterialLimit
                              }))
                            }
                            className="h-5 w-5 accent-blue-600"
                          />
                          <span>Sim</span>
                        </label>
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!taxCodeForm.abatesMaterial}
                            onChange={() =>
                              setTaxCodeForm((prev) => ({
                                ...prev,
                                abatesMaterial: false,
                                inssMaterialLimit: '0',
                                issMaterialLimit: '0'
                              }))
                            }
                            className="h-5 w-5 accent-blue-600"
                          />
                          <span>Não</span>
                        </label>
                      </div>
                      {taxCodeForm.abatesMaterial && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="flex items-center rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800">
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="Limite Material INSS *"
                              value={taxCodeForm.inssMaterialLimit}
                              onChange={(e) =>
                                setTaxCodeForm((prev) => ({
                                  ...prev,
                                  inssMaterialLimit: sanitizeEspelhoPercentTyping(e.target.value)
                                }))
                              }
                              onBlur={(e) =>
                                setTaxCodeForm((prev) => ({
                                  ...prev,
                                  inssMaterialLimit: normalizeEspelhoPercentBlur(e.target.value)
                                }))
                              }
                              className="w-full px-3 py-2 rounded-l-lg bg-transparent text-gray-900 dark:text-gray-100"
                            />
                            <span className="px-3 text-sm text-gray-500 dark:text-gray-400">%</span>
                          </div>
                          <div className="flex items-center rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800">
                            <input
                              type="text"
                              inputMode="decimal"
                              placeholder="Limite Material ISS *"
                              value={taxCodeForm.issMaterialLimit}
                              onChange={(e) =>
                                setTaxCodeForm((prev) => ({
                                  ...prev,
                                  issMaterialLimit: sanitizeEspelhoPercentTyping(e.target.value)
                                }))
                              }
                              onBlur={(e) =>
                                setTaxCodeForm((prev) => ({
                                  ...prev,
                                  issMaterialLimit: normalizeEspelhoPercentBlur(e.target.value)
                                }))
                              }
                              className="w-full px-3 py-2 rounded-l-lg bg-transparent text-gray-900 dark:text-gray-100"
                            />
                            <span className="px-3 text-sm text-gray-500 dark:text-gray-400">%</span>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 space-y-2.5">
                      <p className="text-sm md:text-base font-bold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 pb-1.5 mb-1.5">
                        Impostos (apenas tipo por contrato)
                      </p>
                      {([
                        ['iss', 'ISS'],
                        ['cofins', 'COFINS'],
                        ['csll', 'CSLL'],
                        ['inss', 'INSS'],
                        ['irpj', 'IRPJ'],
                        ['pis', 'PIS']
                      ] as const).map(([taxKey, label]) => (
                        <div
                          key={taxKey}
                          className="grid grid-cols-1 md:grid-cols-[110px_220px_220px] md:justify-start gap-2 items-center"
                        >
                          <p className="text-xs font-semibold tracking-wide text-gray-800 dark:text-gray-200">
                            {label}
                          </p>
                          {taxKey === 'iss' ? (
                            <div className="flex items-center rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800">
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder="Alíquota ISS *"
                                value={taxCodeForm.issRate}
                                onChange={(e) =>
                                  setTaxCodeForm((prev) => ({
                                    ...prev,
                                    issRate: sanitizeEspelhoPercentTyping(e.target.value)
                                  }))
                                }
                                onBlur={(e) =>
                                  setTaxCodeForm((prev) => ({
                                    ...prev,
                                    issRate: normalizeEspelhoPercentBlur(e.target.value)
                                  }))
                                }
                                className="w-full px-2.5 py-1.5 text-sm rounded-l-md bg-transparent text-gray-900 dark:text-gray-100"
                              />
                              <span className="px-2 text-xs text-gray-500 dark:text-gray-400">%</span>
                            </div>
                          ) : (
                            <input
                              type="text"
                              value={
                                federalTaxRates[taxKey as Exclude<keyof FederalTaxRates, 'iss'>]
                                  ? `${federalTaxRates[taxKey as Exclude<keyof FederalTaxRates, 'iss'>]}%`
                                  : ''
                              }
                              readOnly
                              placeholder={`Alíquota ${label} (%)`}
                              className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-gray-100 dark:bg-gray-700/60 text-gray-700 dark:text-gray-300 cursor-not-allowed"
                            />
                          )}
                          {taxKey === 'iss' ? (
                            <select
                              value={taxCodeForm.iss.collectionType}
                              onChange={(e) =>
                                handleTaxRuleFieldChange('iss', e.target.value as 'RETIDO' | 'RECOLHIDO')
                              }
                              className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                            >
                              <option value="RETIDO">Retido</option>
                              <option value="RECOLHIDO">Recolhido</option>
                            </select>
                          ) : (
                            <input
                              type="text"
                              value="Retido"
                              readOnly
                              className="w-full px-2.5 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-gray-100 dark:bg-gray-700/60 text-gray-700 dark:text-gray-300 cursor-not-allowed"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleCreateOrUpdateTaxCode}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    {editingTaxCodeId ? 'Salvar alteração' : 'Cadastrar código tributário'}
                  </button>
                </div>
              </CardContent>
            </Card>
          )}

          {activeTab === 'espelho' ? (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Espelho criado</h3>
              </CardHeader>
              <CardContent className="p-6">
                {savedDrafts.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Nenhum espelho salvo ainda. Use o formulário acima para criar a base.
                  </p>
                ) : (
                  <>
                    <div className="mb-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/80 dark:bg-gray-900/40 p-4 space-y-3">
                      <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                        Filtrar lista
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                            Centro de custo
                          </label>
                          <select
                            value={espelhoSavedFilterCostCenter}
                            onChange={(e) => setEspelhoSavedFilterCostCenter(e.target.value)}
                            disabled={loadingCostCenters}
                            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                          >
                            <option value="">Todos</option>
                            {costCentersForEspelho
                              .filter((cc): cc is typeof cc & { id: string } => Boolean(cc.id))
                              .map((cc) => (
                                <option key={cc.id} value={cc.id}>
                                  {[cc.code, cc.name].filter(Boolean).join(' — ') || cc.name || '—'}
                                </option>
                              ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                            Tomador
                          </label>
                          <select
                            value={espelhoSavedFilterTaker}
                            onChange={(e) => setEspelhoSavedFilterTaker(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                          >
                            <option value="">Todos</option>
                            {[...serviceTakers]
                              .sort((a, b) =>
                                (a.corporateName || a.name).localeCompare(b.corporateName || b.name, 'pt-BR')
                              )
                              .map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.corporateName || t.name}
                                </option>
                              ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Mês</label>
                          <select
                            value={espelhoSavedFilterMonth}
                            onChange={(e) => setEspelhoSavedFilterMonth(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                          >
                            <option value="">Todos</option>
                            {[
                              [1, 'Janeiro'],
                              [2, 'Fevereiro'],
                              [3, 'Março'],
                              [4, 'Abril'],
                              [5, 'Maio'],
                              [6, 'Junho'],
                              [7, 'Julho'],
                              [8, 'Agosto'],
                              [9, 'Setembro'],
                              [10, 'Outubro'],
                              [11, 'Novembro'],
                              [12, 'Dezembro']
                            ].map(([num, label]) => (
                              <option key={num} value={String(num)}>
                                {label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Ano</label>
                          <select
                            value={espelhoSavedFilterYear}
                            onChange={(e) => setEspelhoSavedFilterYear(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                          >
                            <option value="">Todos</option>
                            {espelhoSavedYearOptions.map((yr) => (
                              <option key={yr} value={String(yr)}>
                                {yr}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEspelhoSavedFilterCostCenter('');
                            setEspelhoSavedFilterTaker('');
                            setEspelhoSavedFilterMonth('');
                            setEspelhoSavedFilterYear('');
                          }}
                          className="text-xs px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                        >
                          Limpar filtros
                        </button>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {filteredSavedDrafts.length} de {savedDrafts.length} espelho(s)
                        </span>
                      </div>
                    </div>
                    {filteredSavedDrafts.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        Nenhum espelho corresponde aos filtros selecionados.
                      </p>
                    ) : (
                  <div className="space-y-2 max-h-[min(28rem,70vh)] overflow-y-auto pr-1">
                    {filteredSavedDrafts.map((item) => {
                      const approvalStatus = resolveEspelhoApprovalStatus(item.id, item.approvalStatus);
                      const ccRow = costCentersForEspelho.find((c) => c.id === item.costCenterId);
                      const ccLabel = ccRow
                        ? [ccRow.code, ccRow.name].filter(Boolean).join(' — ')
                        : item.costCenterId
                          ? 'Centro não encontrado no cadastro'
                          : '—';
                      const takerTitle = item.takerName.trim() || 'Tomador não informado';
                      const medValue = parseEspelhoBrCurrencyToNumber(item.measurementAmount);
                      const medTitle = medValue !== null ? fmtEspelhoBrl(medValue) : 'Medição não informada';
                      const refTitle = item.measurementRef.trim() || 'Sem referência';
                      return (
                      <div
                        key={item.id}
                        className="p-3 rounded-lg border border-gray-200 dark:border-gray-700"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {`${takerTitle} | ${medTitle} | ${refTitle}`}
                          </p>
                          <span
                            className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                              ESPELHO_APPROVAL_BADGE_CLASS[approvalStatus]
                            }`}
                          >
                            {ESPELHO_APPROVAL_STATUS_LABELS[approvalStatus]}
                          </span>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                          CC: {ccLabel} | Prestador: {item.providerName} | Tomador:{' '}
                          {item.takerName} | Conta: {item.bankAccountName} | Cód. trib.:{' '}
                          {item.taxCodeCityName}{' '}
                          {item.dueDate ? `| Vencimento: ${item.dueDate}` : ''}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setDetailMirror(item)}
                            className="text-xs px-2 py-1 rounded border border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800 inline-flex items-center gap-1"
                          >
                            <Eye className="w-3 h-3" />
                            Ver detalhes
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEditSavedMirror(item)}
                            className="text-xs px-2 py-1 rounded border border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20 inline-flex items-center gap-1"
                          >
                            <Pencil className="w-3 h-3" />
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSavedMirror(item.id)}
                            disabled={approvalStatus === 'APPROVED'}
                            title={
                              approvalStatus === 'APPROVED'
                                ? 'Espelho aprovado não pode ser excluído'
                                : 'Excluir espelho'
                            }
                            className="text-xs px-2 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20 inline-flex items-center gap-1 disabled:opacity-50 disabled:pointer-events-none"
                          >
                            <Trash2 className="w-3 h-3" />
                            Excluir
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const msg = getEspelhoMoneyTripletMessage(item);
                              if (msg) {
                                toast.error(msg);
                                return;
                              }
                              exportEspelhoNfPdf(
                                espelhoMirrorForExport(item, costCentersForEspelho),
                                serviceProviders,
                                serviceTakers,
                                bankAccounts,
                                taxCodes,
                                federalTaxRates
                              );
                              toast.success('Arquivo PDF gerado.');
                            }}
                            disabled={approvalStatus !== 'APPROVED'}
                            title={
                              approvalStatus === 'APPROVED'
                                ? 'Baixar PDF'
                                : 'Disponível apenas para espelhos aprovados'
                            }
                            className="text-xs px-2 py-1 rounded border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20 inline-flex items-center gap-1 disabled:opacity-50 disabled:pointer-events-none"
                          >
                            <FileText className="w-3 h-3" />
                            PDF
                          </button>
                        </div>
                      </div>
                    );
                    })}
                  </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          ) : activeTab === 'prestadores' ? (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Prestadores de serviço criados
                </h3>
              </CardHeader>
              <CardContent className="p-6">
                {serviceProviders.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Nenhum prestador cadastrado ainda.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {serviceProviders.map((provider) => (
                      <div
                        key={provider.id}
                        className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 flex items-start justify-between gap-3"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {provider.corporateName}
                          </p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            CNPJ: {provider.cnpj} | Município: {provider.city}/{provider.state}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleEditProvider(provider)}
                            className="text-xs px-2 py-1 rounded border border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20 inline-flex items-center gap-1"
                          >
                            <Pencil className="w-3 h-3" />
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteProvider(provider.id)}
                            className="text-xs px-2 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20 inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" />
                            Excluir
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : activeTab === 'tomadores' ? (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Tomadores de serviço criados
                </h3>
              </CardHeader>
              <CardContent className="p-6">
                {serviceTakers.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Nenhum tomador cadastrado ainda.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {serviceTakers.map((taker) => (
                      <div
                        key={taker.id}
                        className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 flex items-start justify-between gap-3"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {taker.name}
                          </p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            Razão Social: {taker.corporateName} | CNPJ: {taker.cnpj} | Contrato: {taker.contractRef}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleEditTaker(taker)}
                            className="text-xs px-2 py-1 rounded border border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20 inline-flex items-center gap-1"
                          >
                            <Pencil className="w-3 h-3" />
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTaker(taker.id)}
                            className="text-xs px-2 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20 inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" />
                            Excluir
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : activeTab === 'contas-bancarias' ? (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Contas bancárias criadas
                </h3>
              </CardHeader>
              <CardContent className="p-6">
                {bankAccounts.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Nenhuma conta bancária cadastrada ainda.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {bankAccounts.map((account) => (
                      <div
                        key={account.id}
                        className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 flex items-start justify-between gap-3"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {account.name}
                          </p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            Banco: {account.bank} | Agência: {account.agency} | C/C: {account.account}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleEditBankAccount(account)}
                            className="text-xs px-2 py-1 rounded border border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20 inline-flex items-center gap-1"
                          >
                            <Pencil className="w-3 h-3" />
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteBankAccount(account.id)}
                            className="text-xs px-2 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20 inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" />
                            Excluir
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Códigos tributários criados
                </h3>
              </CardHeader>
              <CardContent className="p-6">
                {taxCodes.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Nenhum código tributário cadastrado ainda.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {taxCodes.map((taxCode) => (
                      <div
                        key={taxCode.id}
                        className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 flex items-start justify-between gap-3"
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {taxCode.cityName}
                          </p>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            {taxCode.abatesMaterial ? 'Abate material' : 'Não abate material'}
                          </p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            COFINS ({taxCode.cofins.collectionType}) | CSLL ({taxCode.csll.collectionType}) | INSS (
                            {taxCode.inss.collectionType}) | IRPJ ({taxCode.irpj.collectionType}) | PIS (
                            {taxCode.pis.collectionType}) | ISS ({taxCode.iss.collectionType})
                          </p>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            Alíquotas gerais: COFINS {federalTaxRates.cofins || '-'}% | CSLL{' '}
                            {federalTaxRates.csll || '-'}% | INSS {federalTaxRates.inss || '-'}% | IRPJ{' '}
                            {federalTaxRates.irpj || '-'}% | PIS {federalTaxRates.pis || '-'}%
                          </p>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            Alíquota ISS (contrato): {taxCode.issRate || '-'}%
                          </p>
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                            Limite Material INSS: {taxCode.inssMaterialLimit}% | Limite Material ISS:{' '}
                            {taxCode.issMaterialLimit}%
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleEditTaxCode(taxCode)}
                            className="text-xs px-2 py-1 rounded border border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/20 inline-flex items-center gap-1"
                          >
                            <Pencil className="w-3 h-3" />
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteTaxCode(taxCode.id)}
                            className="text-xs px-2 py-1 rounded border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20 inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" />
                            Excluir
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {detailMirror && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
              role="dialog"
              aria-modal="true"
              aria-labelledby="espelho-detalhe-titulo"
            >
              <button
                type="button"
                className="absolute inset-0 cursor-default"
                aria-label="Fechar"
                onClick={() => setDetailMirror(null)}
              />
              <div className="relative z-10 flex w-full max-w-lg max-h-[min(90vh,40rem)] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900">
                <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-4 py-3 shrink-0">
                  <h4
                    id="espelho-detalhe-titulo"
                    className="text-base font-semibold text-gray-900 dark:text-gray-100 pr-2"
                  >
                    Detalhes do espelho
                  </h4>
                  <button
                    type="button"
                    onClick={() => setDetailMirror(null)}
                    className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 dark:text-gray-400"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="overflow-y-auto p-4 space-y-3 text-sm">
                  {buildEspelhoDetailRows(
                    detailMirror,
                    costCentersForEspelho,
                    taxCodes.find((t) => t.id === detailMirror.taxCodeId) ?? null,
                    taxCodes.find((t) => t.id === detailMirror.taxCodeId)?.iss ?? null
                  ).map(([label, value]) => (
                    <div
                      key={label}
                      className="grid grid-cols-1 gap-1 border-b border-gray-100 pb-3 dark:border-gray-800 sm:grid-cols-[10rem_1fr] sm:gap-3"
                    >
                      <span className="font-medium text-gray-700 dark:text-gray-300">{label}</span>
                      <span className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap break-words">
                        {value}
                      </span>
                    </div>
                  ))}
                  <div className="rounded-xl border border-gray-200/80 dark:border-gray-700/80 bg-gray-50/60 dark:bg-gray-800/30 p-4 space-y-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
                      Anexos
                    </p>
                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-900/50 p-3 space-y-2">
                      <p className="text-xs text-gray-600 dark:text-gray-400">Nota fiscal (PDF ou imagem)</p>
                      <label className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer transition-colors">
                        <Plus className="w-3.5 h-3.5" />
                        Selecionar arquivo
                        <input
                          type="file"
                          accept=".pdf,image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0] ?? null;
                            void handleAttachDetailFile('nfAttachment', file);
                            e.currentTarget.value = '';
                          }}
                          className="hidden"
                        />
                      </label>
                      {detailMirror.nfAttachment ? (
                        <div className="flex flex-wrap items-center gap-2 text-xs rounded-lg bg-gray-100/80 dark:bg-gray-800/60 px-2.5 py-2">
                          <span className="text-gray-700 dark:text-gray-300 break-all grow min-w-[12rem]">
                            {detailMirror.nfAttachment.name} ({humanFileSize(detailMirror.nfAttachment.size)})
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDownloadAttachment(detailMirror.nfAttachment!)}
                            className="px-2.5 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-700 inline-flex items-center gap-1 transition-colors"
                          >
                            <Download className="w-3 h-3" />
                            Baixar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveDetailAttachment('nfAttachment')}
                            className="px-2.5 py-1.5 rounded-md border border-red-300/90 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          >
                            Remover
                          </button>
                        </div>
                      ) : null}
                    </div>
                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white/70 dark:bg-gray-900/50 p-3 space-y-2">
                      <p className="text-xs text-gray-600 dark:text-gray-400">XML da nota fiscal</p>
                      <label className="inline-flex items-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-xs font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer transition-colors">
                        <Plus className="w-3.5 h-3.5" />
                        Selecionar arquivo
                        <input
                          type="file"
                          accept=".xml,text/xml,application/xml"
                          onChange={(e) => {
                            const file = e.target.files?.[0] ?? null;
                            void handleAttachDetailFile('xmlAttachment', file);
                            e.currentTarget.value = '';
                          }}
                          className="hidden"
                        />
                      </label>
                      {detailMirror.xmlAttachment ? (
                        <div className="flex flex-wrap items-center gap-2 text-xs rounded-lg bg-gray-100/80 dark:bg-gray-800/60 px-2.5 py-2">
                          <span className="text-gray-700 dark:text-gray-300 break-all grow min-w-[12rem]">
                            {detailMirror.xmlAttachment.name} ({humanFileSize(detailMirror.xmlAttachment.size)})
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDownloadAttachment(detailMirror.xmlAttachment!)}
                            className="px-2.5 py-1.5 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-700 inline-flex items-center gap-1 transition-colors"
                          >
                            <Download className="w-3 h-3" />
                            Baixar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveDetailAttachment('xmlAttachment')}
                            className="px-2.5 py-1.5 rounded-md border border-red-300/90 dark:border-red-700 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          >
                            Remover
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 border-t border-gray-200 dark:border-gray-700 px-4 py-3 shrink-0 bg-gray-50 dark:bg-gray-900/80">
                  <button
                    type="button"
                    onClick={() => {
                      if (!detailMirror) return;
                      const detailApprovalStatus = resolveEspelhoApprovalStatus(
                        detailMirror.id,
                        detailMirror.approvalStatus
                      );
                      if (detailApprovalStatus !== 'APPROVED') {
                        toast.error('O PDF só pode ser baixado quando o espelho estiver aprovado.');
                        return;
                      }
                      const msg = getEspelhoMoneyTripletMessage(detailMirror);
                      if (msg) {
                        toast.error(msg);
                        return;
                      }
                      exportEspelhoNfPdf(
                        espelhoMirrorForExport(detailMirror, costCentersForEspelho),
                        serviceProviders,
                        serviceTakers,
                        bankAccounts,
                        taxCodes,
                        federalTaxRates
                      );
                      toast.success('Arquivo PDF gerado.');
                    }}
                    disabled={
                      !detailMirror ||
                      resolveEspelhoApprovalStatus(detailMirror.id, detailMirror.approvalStatus) !==
                        'APPROVED'
                    }
                    className="text-xs px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 inline-flex items-center gap-1.5 disabled:opacity-50 disabled:pointer-events-none"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    Exportar PDF
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
