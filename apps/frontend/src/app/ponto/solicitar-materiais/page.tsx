'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShoppingCart,
  Plus,
  X,
  AlertCircle,
  Send,
  Pencil,
  Paperclip,
  ExternalLink,
  Loader2,
  Search,
  Filter,
  Eye,
  RotateCcw,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';
import { absoluteUploadUrl } from '@/lib/apiOrigin';
import toast from 'react-hot-toast';
import { getListTableRowClassName, ListRowNavigableLabel, rowActionMenuButtonClass } from '@/components/ui/listTableUi';
import { useCostCenters } from '@/hooks/useCostCenters';
import { useServiceOrdersByCostCenter } from '@/hooks/useServiceOrdersByCostCenter';
import { ServiceOrderSearchSelect } from '@/components/suprimentos/ServiceOrderSearchSelect';
import {
  purchaseOrderPhaseLabel,
  ocStatusTextClass,
  OC_STATUS_LABELS_PT
} from '@/components/oc/ocStatusLabels';

/** Rótulo da OC sem prefixo "OC -" para caber melhor na coluna Fase atual. */
function purchaseOrderPhaseShortLabel(status: string): string {
  const full = purchaseOrderPhaseLabel(status);
  return full.replace(/^OC\s*-\s*/i, '').trim() || full;
}

function rmPriorityLabelPt(p: string | undefined): string {
  const m: Record<string, string> = {
    LOW: 'Baixa',
    MEDIUM: 'Média',
    HIGH: 'Alta',
    URGENT: 'Urgente'
  };
  return p ? m[p] || p : '—';
}

function rmPriorityBadgeClass(p: string | undefined): string {
  const base = 'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium';
  if (p === 'URGENT') return `${base} bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200`;
  if (p === 'HIGH') return `${base} bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200`;
  if (p === 'LOW') return `${base} bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300`;
  return `${base} bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200`;
}

function DetailField({
  label,
  children,
  className = ''
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
      <div className="mt-1 text-sm text-gray-900 dark:text-gray-100">{children}</div>
    </div>
  );
}

function rmStatusLabelPt(status: string): string {
  const m: Record<string, string> = {
    PENDING: 'Pendente',
    IN_REVIEW: 'Correção RM',
    APPROVED: 'Aprovada',
    PARTIALLY_FULFILLED: 'Parcialmente atendida',
    FULFILLED: 'Atendida',
    REJECTED: 'Rejeitada',
    CANCELLED: 'Cancelada'
  };
  return m[status] || status;
}

function rmStatusRowClass(status: string): string {
  if (status === 'APPROVED') return 'text-green-600 dark:text-green-400';
  if (status === 'PENDING') return 'text-amber-600 dark:text-amber-400';
  if (status === 'IN_REVIEW') return 'text-orange-600 dark:text-orange-400';
  if (status === 'REJECTED') return 'text-red-600 dark:text-red-400';
  if (status === 'CANCELLED') return 'text-gray-500 dark:text-gray-400';
  return 'text-gray-600 dark:text-gray-400';
}

function rmStatusBadgeClass(status: string): string {
  const base = 'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold';
  if (status === 'APPROVED')
    return `${base} bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200`;
  if (status === 'PENDING')
    return `${base} bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200`;
  if (status === 'IN_REVIEW')
    return `${base} bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200`;
  if (status === 'REJECTED')
    return `${base} bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200`;
  if (status === 'CANCELLED')
    return `${base} bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300`;
  if (status === 'PARTIALLY_FULFILLED' || status === 'FULFILLED')
    return `${base} bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200`;
  return `${base} bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300`;
}

type RmListPurchaseOrder = { id: string; status: string; orderNumber?: string | null };

const RM_POST_APPROVAL = new Set(['APPROVED', 'PARTIALLY_FULFILLED', 'FULFILLED']);

function sortPurchaseOrdersForDisplay(orders: RmListPurchaseOrder[]): RmListPurchaseOrder[] {
  return [...orders].sort((a, b) =>
    (a.orderNumber || '').localeCompare(b.orderNumber || '', 'pt-BR', { numeric: true })
  );
}

function materialRequestFaseAtualLines(request: {
  status?: string;
  purchaseOrders?: RmListPurchaseOrder[];
}): { key: string; text: string; className: string }[] {
  const rm = String(request.status || '');
  const pos = Array.isArray(request.purchaseOrders) ? request.purchaseOrders : [];

  if (!RM_POST_APPROVAL.has(rm)) {
    return [{ key: 'rm', text: `SC · ${rmStatusLabelPt(rm)}`, className: rmStatusRowClass(rm) }];
  }

  if (pos.length === 0) {
    if (rm === 'APPROVED') {
      return [{ key: 'rm', text: 'SC aprovada · aguardando OC', className: rmStatusRowClass('APPROVED') }];
    }
    return [{ key: 'rm', text: `SC · ${rmStatusLabelPt(rm)}`, className: rmStatusRowClass(rm) }];
  }

  const sorted = sortPurchaseOrdersForDisplay(pos);
  return [
    { key: 'rm', text: `SC · ${rmStatusLabelPt(rm)}`, className: rmStatusRowClass(rm) },
    ...sorted.map((po) => {
      const num = (po.orderNumber && String(po.orderNumber).trim()) || po.id.slice(0, 8);
      return {
        key: `po-${po.id}`,
        text: `OC ${num} · ${purchaseOrderPhaseShortLabel(po.status)}`,
        className: ocStatusTextClass(po.status)
      };
    })
  ];
}

const RM_FASE_FILTER_ORDER = [
  'PENDING',
  'IN_REVIEW',
  'APPROVED',
  'PARTIALLY_FULFILLED',
  'FULFILLED',
  'REJECTED',
  'CANCELLED'
] as const;

const OC_FASE_FILTER_ORDER = [
  'DRAFT',
  'PENDING_COMPRAS',
  'PENDING',
  'PENDING_DIRETORIA',
  'IN_REVIEW',
  'APPROVED',
  'PENDING_PROOF_VALIDATION',
  'PENDING_PROOF_CORRECTION',
  'PENDING_NF_ATTACHMENT',
  'SENT',
  'FINALIZED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'REJECTED',
  'CANCELLED'
] as const;

/** Filtro "Fase atual": `rm:STATUS` = fase da SC; `oc:STATUS` = alguma OC com esse status. */
function requestMatchesFaseAtualFilter(
  request: { status?: string; purchaseOrders?: RmListPurchaseOrder[] },
  filterKey: string
): boolean {
  if (!filterKey) return true;
  const pos = Array.isArray(request.purchaseOrders) ? request.purchaseOrders : [];
  if (filterKey.startsWith('rm:')) {
    const s = filterKey.slice(3);
    return String(request.status || '') === s;
  }
  if (filterKey.startsWith('oc:')) {
    const s = filterKey.slice(3);
    return pos.some((po) => po.status === s);
  }
  return true;
}

function rmOsLine(req: { serviceOrder?: string | null; project?: { code?: string | null; name?: string | null } | null; projectId?: string | null }) {
  if (req.serviceOrder?.trim()) return req.serviceOrder.trim();
  if (req.project?.code || req.project?.name) {
    return String(req.project?.code || req.project?.name || '').trim() || '—';
  }
  if (req.projectId && String(req.projectId).length === 25) return '—';
  if (req.projectId) return String(req.projectId);
  return '—';
}

function rmCostCenterLine(req: {
  costCenter?: { code?: string | null; name?: string | null } | null;
  costCenterId?: string | null;
}) {
  const cc = req.costCenter;
  if (cc?.code && cc?.name) return `${cc.code} — ${cc.name}`;
  if (cc?.code) return String(cc.code);
  if (cc?.name) return String(cc.name);
  if (req.costCenterId) return String(req.costCenterId);
  return '—';
}

function rmCostCenterName(req: {
  costCenter?: { code?: string | null; name?: string | null } | null;
  costCenterId?: string | null;
}) {
  const cc = req.costCenter;
  if (cc?.name) return String(cc.name);
  if (cc?.code) return String(cc.code);
  return '—';
}

const LIST_ITEMS_PER_PAGE = 12;

/** YYYY-MM-DD no fuso local (para comparar com input type="date"). */
function toYmdLocal(iso: string | undefined | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const emptyNewFormData = () => ({
  costCenterId: '',
  serviceOrderId: '',
  serviceOrder: '',
  obra: '',
  description: '',
  priority: 'MEDIUM',
  demandSheet: '',
  demandSheetAttachmentUrl: '',
  demandSheetAttachmentName: '',
  items: [{ materialId: '', quantity: 1, unit: '', observation: '', attachmentUrl: '', attachmentName: '' }]
});

const rmMaterialInputClass =
  'w-full min-w-0 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm';

const rmMaterialInputClassSm =
  'w-full min-w-0 px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100';

type NewMaterialRequestFormData = ReturnType<typeof emptyNewFormData>;

function validateNewMaterialRequestForm(formData: NewMaterialRequestFormData): string | null {
  if (!formData.costCenterId.trim()) return 'Selecione o centro de custo.';
  if (!formData.serviceOrderId.trim()) return 'Selecione a ordem de serviço.';
  if (!formData.obra.trim()) return 'Informe a obra.';
  if (!formData.demandSheet.trim()) return 'Informe a ficha de demanda.';
  if (!formData.demandSheetAttachmentUrl.trim()) return 'Anexe o arquivo da ficha de demanda.';

  const validItems = formData.items.filter((item) => item.materialId);
  if (validItems.length === 0) return 'Inclua ao menos um material.';

  for (let index = 0; index < formData.items.length; index += 1) {
    const item = formData.items[index];
    if (!item.materialId.trim()) {
      return `Selecione o material do item ${index + 1}.`;
    }
  }

  return null;
}

const rmNumberInputClass =
  'min-w-0 flex-1 bg-transparent px-3 py-2 text-sm text-gray-900 tabular-nums outline-none dark:text-gray-100 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]';

const rmNumberInputClassSm =
  'min-w-0 flex-1 bg-transparent px-2 py-1.5 text-sm text-gray-900 tabular-nums outline-none dark:text-gray-100 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]';

function RmQuantityInput({
  value,
  onChange,
  unit,
  min = 1,
  required = false,
  size = 'md'
}: {
  value: number;
  onChange: (value: number) => void;
  unit?: string;
  min?: number;
  required?: boolean;
  size?: 'md' | 'sm';
}) {
  const normalized = Number.isFinite(Number(value)) ? Math.max(min, Math.floor(Number(value))) : min;
  const shellClass =
    size === 'sm'
      ? 'flex overflow-hidden rounded border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800'
      : 'flex overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-700';
  const stepBtnClass =
    'flex flex-1 items-center justify-center text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-600 dark:hover:text-gray-200';
  const unitClass =
    size === 'sm'
      ? 'flex shrink-0 items-center border-l border-gray-300 px-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-600 dark:text-gray-400'
      : 'flex shrink-0 items-center border-l border-gray-300 px-2.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-gray-600 dark:text-gray-400';

  const bump = (delta: number) => {
    onChange(Math.max(min, normalized + delta));
  };

  return (
    <div className={shellClass}>
      <input
        type="number"
        required={required}
        min={min}
        value={normalized}
        onChange={(e) => {
          const parsed = parseInt(e.target.value, 10);
          onChange(Number.isFinite(parsed) && parsed >= min ? parsed : min);
        }}
        className={size === 'sm' ? rmNumberInputClassSm : rmNumberInputClass}
      />
      <span className={unitClass}>{unit?.trim() || '—'}</span>
      <div className="flex w-8 shrink-0 flex-col border-l border-gray-300 dark:border-gray-600">
        <button
          type="button"
          tabIndex={-1}
          aria-label="Aumentar quantidade"
          onClick={() => bump(1)}
          className={`${stepBtnClass} border-b border-gray-300 dark:border-gray-600`}
        >
          <ChevronUp className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
        <button
          type="button"
          tabIndex={-1}
          aria-label="Diminuir quantidade"
          onClick={() => bump(-1)}
          className={stepBtnClass}
        >
          <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}

type RmMaterialOption = {
  id: string;
  code?: string;
  description?: string;
  name?: string;
  unit?: string;
};

type RmCostCenterOption = {
  id?: string;
  code: string;
  name?: string;
  description?: string;
  label: string;
  value: string;
  polo?: string;
  isActive?: boolean;
};

function getCostCenterLabel(costCenter?: RmCostCenterOption | null) {
  if (!costCenter) return '';
  return String(costCenter.name ?? costCenter.label ?? '').trim();
}

function costCenterMatchesSearch(costCenter: RmCostCenterOption, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    costCenter.name,
    costCenter.label,
    costCenter.code,
    costCenter.description
  ]
    .map((part) => String(part ?? '').trim().toLowerCase())
    .filter(Boolean)
    .join(' ');
  return haystack.includes(q);
}

function RmCostCenterAutocomplete({
  searchValue,
  isOpen,
  onOpen,
  onClose,
  onSearchChange,
  onSelect,
  costCenters,
  loading,
  getCostCenterLabel: getLabel,
  inputClassName,
  placeholder = 'Digite para buscar centro de custo...'
}: {
  searchValue: string;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSearchChange: (value: string) => void;
  onSelect: (costCenter: RmCostCenterOption & { id: string }) => void;
  costCenters: RmCostCenterOption[];
  loading: boolean;
  getCostCenterLabel: (costCenter?: RmCostCenterOption | null) => string;
  inputClassName: string;
  placeholder?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; width: number } | null>(null);

  const syncMenuPosition = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuStyle({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) {
      setMenuStyle(null);
      return;
    }
    syncMenuPosition();
    const onReposition = () => syncMenuPosition();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [isOpen, syncMenuPosition, searchValue]);

  const filteredCostCenters = useMemo(() => {
    return costCenters
      .filter((costCenter): costCenter is RmCostCenterOption & { id: string } => Boolean(costCenter.id))
      .filter((costCenter) => costCenterMatchesSearch(costCenter, searchValue))
      .slice(0, 50);
  }, [costCenters, searchValue]);

  const dropdown =
    isOpen &&
    menuStyle &&
    typeof document !== 'undefined' &&
    createPortal(
      <div
        role="listbox"
        className="max-h-56 overflow-auto rounded-lg border border-gray-300 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800"
        style={{
          position: 'fixed',
          top: menuStyle.top,
          left: menuStyle.left,
          width: menuStyle.width,
          zIndex: 1200
        }}
      >
        {loading ? (
          <p className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">Carregando centros de custo…</p>
        ) : filteredCostCenters.length === 0 ? (
          <p className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
            {costCenters.length === 0
              ? 'Nenhum centro de custo disponível.'
              : 'Nenhum centro de custo encontrado para esta busca.'}
          </p>
        ) : (
          filteredCostCenters.map((costCenter) => (
            <button
              key={costCenter.id}
              type="button"
              role="option"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(costCenter)}
              className="w-full px-3 py-2 text-left text-sm text-gray-900 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700"
            >
              {getLabel(costCenter)}
            </button>
          ))
        )}
      </div>,
      document.body
    );

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        value={searchValue}
        onFocus={onOpen}
        onClick={onOpen}
        onBlur={() => setTimeout(onClose, 120)}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={placeholder}
        className={inputClassName}
        autoComplete="off"
      />
      {dropdown}
    </>
  );
}

function RmMaterialAutocomplete({
  searchValue,
  isOpen,
  onOpen,
  onClose,
  onSearchChange,
  onSelect,
  materials,
  loading,
  loadError,
  getMaterialLabel,
  inputClassName,
  placeholder = 'Digite para buscar material...'
}: {
  searchValue: string;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSearchChange: (value: string) => void;
  onSelect: (material: RmMaterialOption) => void;
  materials: RmMaterialOption[];
  loading: boolean;
  loadError: boolean;
  getMaterialLabel: (material?: RmMaterialOption | null) => string;
  inputClassName: string;
  placeholder?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [menuStyle, setMenuStyle] = useState<{ top: number; left: number; width: number } | null>(null);

  const syncMenuPosition = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setMenuStyle({ top: rect.bottom + 4, left: rect.left, width: rect.width });
  }, []);

  useLayoutEffect(() => {
    if (!isOpen) {
      setMenuStyle(null);
      return;
    }
    syncMenuPosition();
    const onReposition = () => syncMenuPosition();
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [isOpen, syncMenuPosition, searchValue]);

  const filteredMaterials = useMemo(() => {
    const q = searchValue.trim().toLowerCase();
    return materials
      .filter((material) => {
        if (!q) return true;
        return getMaterialLabel(material).toLowerCase().includes(q);
      })
      .slice(0, 50);
  }, [materials, searchValue, getMaterialLabel]);

  const dropdown =
    isOpen &&
    menuStyle &&
    typeof document !== 'undefined' &&
    createPortal(
      <div
        role="listbox"
        className="max-h-56 overflow-auto rounded-lg border border-gray-300 bg-white shadow-lg dark:border-gray-600 dark:bg-gray-800"
        style={{
          position: 'fixed',
          top: menuStyle.top,
          left: menuStyle.left,
          width: menuStyle.width,
          zIndex: 1200
        }}
      >
        {loading ? (
          <p className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">Carregando materiais…</p>
        ) : loadError ? (
          <p className="px-3 py-2 text-sm text-red-600 dark:text-red-400">Erro ao carregar materiais.</p>
        ) : filteredMaterials.length === 0 ? (
          <p className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
            {materials.length === 0
              ? 'Nenhum material ativo em Materiais e Serviços.'
              : 'Nenhum material encontrado para esta busca.'}
          </p>
        ) : (
          filteredMaterials.map((material) => (
            <button
              key={material.id}
              type="button"
              role="option"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(material)}
              className="w-full px-3 py-2 text-left text-sm text-gray-900 whitespace-normal break-words hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700"
            >
              {getMaterialLabel(material)}
            </button>
          ))
        )}
      </div>,
      document.body
    );

  return (
    <>
      <input
        ref={inputRef}
        type="text"
        value={searchValue}
        onFocus={onOpen}
        onClick={onOpen}
        onBlur={() => setTimeout(onClose, 120)}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={placeholder}
        className={inputClassName}
        title={searchValue || undefined}
        autoComplete="off"
      />
      {dropdown}
    </>
  );
}

function SolicitarMateriaisPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'list' | 'new'>('list');
  const [isNewRequestModalOpen, setIsNewRequestModalOpen] = useState(false);
  const [formData, setFormData] = useState(emptyNewFormData);

  const [correctionEditId, setCorrectionEditId] = useState<string | null>(null);
  const [detailViewId, setDetailViewId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState({
    costCenterId: '',
    serviceOrderId: '',
    serviceOrder: '',
    obra: '',
    description: '',
    priority: 'MEDIUM',
    demandSheet: '',
    demandSheetAttachmentUrl: '',
    demandSheetAttachmentName: '',
    items: [{ materialId: '', quantity: 1, unit: '', observation: '', attachmentUrl: '', attachmentName: '' }]
  });

  const [uploadingAttachment, setUploadingAttachment] = useState<{ form: 'new' | 'edit'; index: number } | null>(
    null
  );
  const [uploadingDemandSheetAttachment, setUploadingDemandSheetAttachment] = useState<'new' | 'edit' | null>(null);
  const [newItemMaterialSearch, setNewItemMaterialSearch] = useState<string[]>(['']);
  const [editItemMaterialSearch, setEditItemMaterialSearch] = useState<string[]>(['']);
  const [activeNewMaterialDropdownIndex, setActiveNewMaterialDropdownIndex] = useState<number | null>(null);
  const [activeEditMaterialDropdownIndex, setActiveEditMaterialDropdownIndex] = useState<number | null>(null);
  const [newCostCenterSearch, setNewCostCenterSearch] = useState('');
  const [editCostCenterSearch, setEditCostCenterSearch] = useState('');
  const [isNewCostCenterDropdownOpen, setIsNewCostCenterDropdownOpen] = useState(false);
  const [isEditCostCenterDropdownOpen, setIsEditCostCenterDropdownOpen] = useState(false);

  const [rmListSearch, setRmListSearch] = useState('');
  /** '' | `rm:PENDING` | `oc:APPROVED` … — fase da SC ou de alguma OC */
  const [rmListFaseAtual, setRmListFaseAtual] = useState<string>('');
  const [rmListObra, setRmListObra] = useState<string>('');
  const [rmListCostCenterId, setRmListCostCenterId] = useState('');
  const [rmListDateFrom, setRmListDateFrom] = useState('');
  const [rmListDateTo, setRmListDateTo] = useState('');
  const [isListFiltersModalOpen, setIsListFiltersModalOpen] = useState(false);
  const [listCurrentPage, setListCurrentPage] = useState(1);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  // Buscar dados do usuário
  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const { costCenters, isLoading: loadingCostCenters } = useCostCenters();
  const { serviceOrders: newFormServiceOrders, isLoading: loadingNewFormServiceOrders } =
    useServiceOrdersByCostCenter(formData.costCenterId);
  const { serviceOrders: editFormServiceOrders, isLoading: loadingEditFormServiceOrders } =
    useServiceOrdersByCostCenter(editFormData.costCenterId);

  const handleNewCostCenterChange = (costCenterId: string) => {
    setFormData((prev) => ({
      ...prev,
      costCenterId,
      serviceOrderId: '',
      serviceOrder: ''
    }));
  };

  const handleEditCostCenterChange = (costCenterId: string) => {
    setEditFormData((prev) => ({
      ...prev,
      costCenterId,
      serviceOrderId: '',
      serviceOrder: ''
    }));
  };

  const handleNewCostCenterSearchChange = (value: string) => {
    setNewCostCenterSearch(value);
    const normalized = value.trim().toLowerCase();
    const exactMatch = costCenters.find(
      (cc): cc is RmCostCenterOption & { id: string } =>
        Boolean(cc.id) && getCostCenterLabel(cc).trim().toLowerCase() === normalized
    );

    setFormData((prev) => {
      if (!normalized || !exactMatch) {
        if (!prev.costCenterId && !prev.serviceOrderId && !prev.serviceOrder) return prev;
        return { ...prev, costCenterId: '', serviceOrderId: '', serviceOrder: '' };
      }
      if (prev.costCenterId === exactMatch.id) return prev;
      return { ...prev, costCenterId: exactMatch.id, serviceOrderId: '', serviceOrder: '' };
    });
  };

  const handleEditCostCenterSearchChange = (value: string) => {
    setEditCostCenterSearch(value);
    const normalized = value.trim().toLowerCase();
    const exactMatch = costCenters.find(
      (cc): cc is RmCostCenterOption & { id: string } =>
        Boolean(cc.id) && getCostCenterLabel(cc).trim().toLowerCase() === normalized
    );

    setEditFormData((prev) => {
      if (!normalized || !exactMatch) {
        if (!prev.costCenterId && !prev.serviceOrderId && !prev.serviceOrder) return prev;
        return { ...prev, costCenterId: '', serviceOrderId: '', serviceOrder: '' };
      }
      if (prev.costCenterId === exactMatch.id) return prev;
      return { ...prev, costCenterId: exactMatch.id, serviceOrderId: '', serviceOrder: '' };
    });
  };

  const handleNewServiceOrderSelect = (serviceOrderId: string, serviceOrder: string) => {
    setFormData((prev) => ({ ...prev, serviceOrderId, serviceOrder }));
  };

  const handleNewServiceOrderClear = () => {
    setFormData((prev) => ({ ...prev, serviceOrderId: '', serviceOrder: '' }));
  };

  const handleEditServiceOrderSelect = (serviceOrderId: string, serviceOrder: string) => {
    setEditFormData((prev) => ({ ...prev, serviceOrderId, serviceOrder }));
  };

  const handleEditServiceOrderClear = () => {
    setEditFormData((prev) => ({ ...prev, serviceOrderId: '', serviceOrder: '' }));
  };

  // Materiais e Serviços ativos (espelhados para a RM)
  const {
    data: materialsData,
    isLoading: loadingMaterials,
    isError: materialsLoadError,
    refetch: refetchMaterials
  } = useQuery({
    queryKey: ['materials-rm-dropdown'],
    queryFn: async () => {
      const res = await api.get('/material-requests/materials');
      return res.data;
    }
  });

  useEffect(() => {
    if (isNewRequestModalOpen || correctionEditId) {
      void refetchMaterials();
    }
  }, [isNewRequestModalOpen, correctionEditId, refetchMaterials]);

  // Buscar requisições do usuário
  const { data: requestsData, isLoading: loadingRequests, isError: hasRequestsError, error: requestsError } = useQuery({
    queryKey: ['material-requests'],
    queryFn: async () => {
      const res = await api.get('/material-requests', {
        params: { requestedBy: userData?.data?.id, limit: 500 }
      });
      return res.data;
    },
    enabled: !!userData?.data?.id
  });

  const { data: detailRmData, isLoading: loadingDetailRm } = useQuery({
    queryKey: ['material-request-detail', detailViewId],
    queryFn: async () => {
      const res = await api.get(`/material-requests/${detailViewId}`);
      return res.data?.data ?? res.data;
    },
    enabled: !!detailViewId && !!userData?.data?.id
  });

  const { data: correctionRmDetail } = useQuery({
    queryKey: ['material-request', correctionEditId],
    queryFn: async () => {
      const res = await api.get(`/material-requests/${correctionEditId}`);
      return res.data?.data ?? res.data;
    },
    enabled: !!correctionEditId && !!userData?.data?.id
  });

  const resubmitAfterCorrectionMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.patch(`/material-requests/${id}/status`, { status: 'PENDING' });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-requests'] });
      queryClient.invalidateQueries({ queryKey: ['material-requests-manage'] });
      toast.success('Requisição reenviada para análise.');
    },
    onError: (error: { response?: { data?: { message?: string; error?: string } } }) => {
      toast.error(error.response?.data?.message || error.response?.data?.error || 'Não foi possível reenviar');
    }
  });

  type EditFormShape = typeof editFormData;

  const updateCorrectionMutation = useMutation({
    mutationFn: async ({
      id,
      submitForApproval,
      form
    }: {
      id: string;
      submitForApproval: boolean;
      form: EditFormShape;
    }) => {
      const res = await api.patch(`/material-requests/${id}`, {
        costCenterId: form.costCenterId,
        serviceOrderId: form.serviceOrderId || undefined,
        serviceOrder: form.serviceOrder || undefined,
        obra: form.obra || undefined,
        description: form.description,
        priority: form.priority,
        demandSheet: form.demandSheet || undefined,
        demandSheetAttachmentUrl: form.demandSheetAttachmentUrl || undefined,
        demandSheetAttachmentName: form.demandSheetAttachmentName || undefined,
        items: form.items.map((item) => ({
          materialId: item.materialId,
          quantity: item.quantity,
          observation: item.observation,
          attachmentUrl: item.attachmentUrl || undefined,
          attachmentName: item.attachmentName || undefined
        })),
        submitForApproval
      });
      return res.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['material-requests'] });
      queryClient.invalidateQueries({ queryKey: ['material-requests-manage'] });
      setCorrectionEditId(null);
      toast.success(
        variables.submitForApproval
          ? 'Alterações salvas e requisição reenviada para aprovação.'
          : 'Alterações salvas. Você pode continuar editando ou reenviar quando estiver pronto.'
      );
    },
    onError: (error: { response?: { data?: { message?: string; error?: string } } }) => {
      toast.error(error.response?.data?.message || error.response?.data?.error || 'Não foi possível salvar');
    }
  });

  const closeNewRequestModal = () => {
    setIsNewRequestModalOpen(false);
    setFormData(emptyNewFormData());
    setNewItemMaterialSearch(['']);
    setActiveNewMaterialDropdownIndex(null);
    setNewCostCenterSearch('');
    setIsNewCostCenterDropdownOpen(false);
    setUploadingAttachment(null);
    setUploadingDemandSheetAttachment(null);
  };

  // Criar requisição
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/material-requests', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-requests'] });
      setActiveTab('list');
      setFormData({
        costCenterId: '',
        serviceOrderId: '',
        serviceOrder: '',
        obra: '',
        description: '',
        priority: 'MEDIUM',
        demandSheet: '',
        demandSheetAttachmentUrl: '',
        demandSheetAttachmentName: '',
        items: [{ materialId: '', quantity: 1, unit: '', observation: '', attachmentUrl: '', attachmentName: '' }]
      });
      closeNewRequestModal();
      toast.success('Solicitação criada com sucesso!');
    },
    onError: (error: { response?: { data?: { message?: string; error?: string } } }) => {
      toast.error(
        error.response?.data?.message || error.response?.data?.error || 'Erro ao criar solicitação'
      );
    }
  });

  const requests = requestsData?.data?.requests || requestsData?.data || [];
  const materials = (materialsData?.data || []) as RmMaterialOption[];

  const getMaterialLabel = (material?: RmMaterialOption | null) =>
    material?.name?.trim() || material?.code?.trim() || material?.description?.trim() || 'Material sem nome';

  const obraOptionsFromRequests = useMemo(() => {
    const set = new Set<string>();
    for (const r of Array.isArray(requests) ? requests : []) {
      const o = String((r as { obra?: string | null }).obra ?? '').trim();
      if (o) set.add(o);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }));
  }, [requests]);

  const filteredRequests = useMemo(() => {
    let list = Array.isArray(requests) ? [...requests] : [];
    if (rmListFaseAtual) {
      list = list.filter((r: { status?: string; purchaseOrders?: RmListPurchaseOrder[] }) =>
        requestMatchesFaseAtualFilter(r, rmListFaseAtual)
      );
    }
    if (rmListObra) {
      list = list.filter((r: { obra?: string | null }) => String(r.obra ?? '').trim() === rmListObra);
    }
    if (rmListCostCenterId) {
      list = list.filter((r: { costCenterId?: string; costCenter?: { id?: string } | null }) => {
        const id = r.costCenterId || r.costCenter?.id;
        return id === rmListCostCenterId;
      });
    }
    if (rmListDateFrom || rmListDateTo) {
      list = list.filter((r: { requestedAt?: string }) => {
        const ymd = toYmdLocal(r.requestedAt);
        if (!ymd) return false;
        if (rmListDateFrom && ymd < rmListDateFrom) return false;
        if (rmListDateTo && ymd > rmListDateTo) return false;
        return true;
      });
    }
    const q = rmListSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((req: Record<string, unknown>) => {
        const rn = String(req.requestNumber ?? '').toLowerCase();
        const os = rmOsLine(req as Parameters<typeof rmOsLine>[0]).toLowerCase();
        const obra = String(req.obra ?? '').toLowerCase();
        const desc = String(req.description ?? '').toLowerCase();
        const ccLine = rmCostCenterLine(req as Parameters<typeof rmCostCenterLine>[0]).toLowerCase();
        return (
          rn.includes(q) || os.includes(q) || obra.includes(q) || desc.includes(q) || ccLine.includes(q)
        );
      });
    }
    list.sort((a: { requestedAt?: string }, b: { requestedAt?: string }) => {
      const ta = a.requestedAt ? new Date(a.requestedAt).getTime() : 0;
      const tb = b.requestedAt ? new Date(b.requestedAt).getTime() : 0;
      return tb - ta;
    });
    return list;
  }, [
    requests,
    rmListSearch,
    rmListFaseAtual,
    rmListObra,
    rmListCostCenterId,
    rmListDateFrom,
    rmListDateTo
  ]);

  const listTotal = filteredRequests.length;
  const listTotalPages = Math.max(1, Math.ceil(listTotal / LIST_ITEMS_PER_PAGE));
  const listStartIndex = (listCurrentPage - 1) * LIST_ITEMS_PER_PAGE;
  const paginatedRequests = filteredRequests.slice(listStartIndex, listStartIndex + LIST_ITEMS_PER_PAGE);
  const listStartItem = listTotal === 0 ? 0 : listStartIndex + 1;
  const listEndItem = Math.min(listStartIndex + LIST_ITEMS_PER_PAGE, listTotal);

  const clearListFilters = () => {
    setRmListFaseAtual('');
    setRmListObra('');
    setRmListCostCenterId('');
    setRmListDateFrom('');
    setRmListDateTo('');
    setListCurrentPage(1);
  };

  useEffect(() => {
    setListCurrentPage(1);
  }, [rmListSearch, rmListFaseAtual, rmListObra, rmListCostCenterId, rmListDateFrom, rmListDateTo]);

  useEffect(() => {
    if (listCurrentPage > listTotalPages) {
      setListCurrentPage(listTotalPages);
    }
  }, [listCurrentPage, listTotalPages]);

  useEffect(() => {
    const id = searchParams?.get('editRm') ?? null;
    if (!id) return;
    setCorrectionEditId(id);
    router.replace('/ponto/solicitar-materiais', { scroll: false });
  }, [searchParams, router]);

  useEffect(() => {
    if (!correctionEditId) return;
    const fromList = requests.find((x: { id: string }) => x.id === correctionEditId);
    const r = (correctionRmDetail as typeof fromList | undefined) || fromList;
    if (!r) return;
    const itemsFromApi = Array.isArray(r.items) ? r.items : [];
    const rmServiceOrderId = String((r as { serviceOrderId?: string }).serviceOrderId || '').trim();
    const rmServiceOrderText =
      (r as { serviceOrder?: string }).serviceOrder?.trim()
        ? String((r as { serviceOrder?: string }).serviceOrder)
        : (r as { projectId?: string }).projectId && (r as { project?: { code?: string; name?: string } }).project
          ? String(
              (r as { project?: { code?: string; name?: string } }).project?.code ||
                (r as { project?: { code?: string; name?: string } }).project?.name ||
                ''
            )
          : '';
    setEditFormData({
      costCenterId: (r as { costCenterId?: string }).costCenterId || (r as { costCenter?: { id?: string } }).costCenter?.id || '',
      serviceOrderId: rmServiceOrderId,
      serviceOrder: rmServiceOrderText,
      obra: String((r as { obra?: string }).obra || ''),
      description: (r.description as string) || '',
      priority: (r.priority as string) || 'MEDIUM',
      demandSheet: String((r as { demandSheet?: string }).demandSheet || ''),
      demandSheetAttachmentUrl: String((r as { demandSheetAttachmentUrl?: string }).demandSheetAttachmentUrl || ''),
      demandSheetAttachmentName: String((r as { demandSheetAttachmentName?: string }).demandSheetAttachmentName || ''),
      items:
        itemsFromApi.length > 0
          ? itemsFromApi.map(
              (it: {
                materialId?: string;
                material?: { id?: string; unit?: string };
                quantity?: unknown;
                unit?: string;
                notes?: string | null;
                attachmentUrl?: string | null;
                attachmentName?: string | null;
              }) => ({
                materialId: it.materialId || it.material?.id || '',
                quantity: Math.max(1, Math.floor(Number(it.quantity)) || 1),
                unit: it.unit || it.material?.unit || '',
                observation: it.notes || '',
                attachmentUrl: it.attachmentUrl || '',
                attachmentName: it.attachmentName || ''
              })
            )
          : [{ materialId: '', quantity: 1, unit: '', observation: '', attachmentUrl: '', attachmentName: '' }]
    });
  }, [correctionEditId, correctionRmDetail, requests]);

  useEffect(() => {
    if (!correctionEditId || editFormData.serviceOrderId) return;
    const text = editFormData.serviceOrder.trim();
    if (!text || editFormServiceOrders.length === 0) return;
    const match = editFormServiceOrders.find((o) => o.label.trim() === text);
    if (match) {
      setEditFormData((prev) => ({ ...prev, serviceOrderId: match.id }));
    }
  }, [correctionEditId, editFormData.serviceOrder, editFormData.serviceOrderId, editFormServiceOrders]);

  useEffect(() => {
    if (!isNewRequestModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeNewRequestModal();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isNewRequestModalOpen]);

  useEffect(() => {
    if (!detailViewId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDetailViewId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailViewId]);

  useEffect(() => {
    if (!formData.costCenterId) return;
    const selected = costCenters.find((cc) => cc.id === formData.costCenterId);
    if (selected) {
      setNewCostCenterSearch(getCostCenterLabel(selected));
    }
  }, [formData.costCenterId, costCenters]);

  useEffect(() => {
    if (!correctionEditId) {
      setEditCostCenterSearch('');
      return;
    }
    if (!editFormData.costCenterId) return;
    const selected = costCenters.find((cc) => cc.id === editFormData.costCenterId);
    if (selected) {
      setEditCostCenterSearch(getCostCenterLabel(selected));
    }
  }, [correctionEditId, editFormData.costCenterId, costCenters]);

  useEffect(() => {
    setNewItemMaterialSearch((prev) =>
      formData.items.map((item, index) => {
        if (item.materialId) {
          const selected = materials.find((m) => m.id === item.materialId);
          return selected ? getMaterialLabel(selected) : prev[index] || '';
        }
        return prev[index] || '';
      })
    );
  }, [formData.items, materials]);

  useEffect(() => {
    setEditItemMaterialSearch((prev) =>
      editFormData.items.map((item, index) => {
        if (item.materialId) {
          const selected = materials.find((m) => m.id === item.materialId);
          return selected ? getMaterialLabel(selected) : prev[index] || '';
        }
        return prev[index] || '';
      })
    );
  }, [editFormData.items, materials]);

  const user = userData?.data || {
    name: 'Usuário',
    role: 'EMPLOYEE'
  };

  if (loadingUser) {
    return (
      <Loading 
        message="Carregando..."
        fullScreen
        size="lg"
      />
    );
  }

  const handleAddItem = () => {
    setFormData({
      ...formData,
      items: [
        ...formData.items,
        { materialId: '', quantity: 1, unit: '', observation: '', attachmentUrl: '', attachmentName: '' }
      ]
    });
    setNewItemMaterialSearch((prev) => [...prev, '']);
  };

  const handleRemoveItem = (index: number) => {
    setFormData({
      ...formData,
      items: formData.items.filter((_, i) => i !== index)
    });
    setNewItemMaterialSearch((prev) => prev.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const newItems = [...formData.items];
    newItems[index] = { ...newItems[index], [field]: value };
    if (field === 'materialId') {
      if (value) {
        const material = (materialsData?.data || []).find((m: any) => m.id === value);
        newItems[index].unit = material?.unit || '';
      } else {
        newItems[index].unit = '';
      }
    }
    setFormData({ ...formData, items: newItems });
  };

  const handleNewItemMaterialSearchChange = (index: number, value: string) => {
    setNewItemMaterialSearch((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });

    const normalized = value.trim().toLowerCase();
    const exactMatch = materials.find((material) => getMaterialLabel(material).trim().toLowerCase() === normalized);

    if (!normalized || !exactMatch) {
      handleItemChange(index, 'materialId', '');
      return;
    }

    handleItemChange(index, 'materialId', exactMatch.id);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateNewMaterialRequestForm(formData);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    createMutation.mutate({
      costCenterId: formData.costCenterId,
      serviceOrderId: formData.serviceOrderId,
      serviceOrder: formData.serviceOrder || undefined,
      obra: formData.obra.trim(),
      description: formData.description,
      priority: formData.priority,
      demandSheet: formData.demandSheet.trim(),
      demandSheetAttachmentUrl: formData.demandSheetAttachmentUrl.trim(),
      demandSheetAttachmentName: formData.demandSheetAttachmentName.trim() || undefined,
      items: formData.items
        .filter((item) => item.materialId)
        .map((item) => ({
        materialId: item.materialId,
        quantity: Number(item.quantity),
        observation: item.observation.trim() || undefined,
        attachmentUrl: item.attachmentUrl?.trim() || undefined,
        attachmentName: item.attachmentName?.trim() || undefined
      }))
    });
  };

  const handleEditAddItem = () => {
    setEditFormData((prev) => ({
      ...prev,
      items: [
        ...prev.items,
        { materialId: '', quantity: 1, unit: '', observation: '', attachmentUrl: '', attachmentName: '' }
      ]
    }));
    setEditItemMaterialSearch((prev) => [...prev, '']);
  };

  const handleItemAttachmentFile = async (form: 'new' | 'edit', index: number, file: File | null) => {
    if (!file) return;
    setUploadingAttachment({ form, index });
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/material-requests/upload-item-attachment', fd);
      const d = res.data?.data as { url?: string; originalName?: string } | undefined;
      if (!d?.url) throw new Error('Resposta inválida do servidor');
      if (form === 'new') {
        setFormData((prev) => {
          const next = [...prev.items];
          next[index] = {
            ...next[index],
            attachmentUrl: d.url!,
            attachmentName: d.originalName || ''
          };
          return { ...prev, items: next };
        });
      } else {
        setEditFormData((prev) => {
          const next = [...prev.items];
          next[index] = {
            ...next[index],
            attachmentUrl: d.url!,
            attachmentName: d.originalName || ''
          };
          return { ...prev, items: next };
        });
      }
      toast.success('Anexo enviado');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Não foi possível enviar o anexo');
    } finally {
      setUploadingAttachment(null);
    }
  };

  const clearItemAttachment = (form: 'new' | 'edit', index: number) => {
    if (form === 'new') {
      setFormData((prev) => {
        const next = [...prev.items];
        next[index] = { ...next[index], attachmentUrl: '', attachmentName: '' };
        return { ...prev, items: next };
      });
    } else {
      setEditFormData((prev) => {
        const next = [...prev.items];
        next[index] = { ...next[index], attachmentUrl: '', attachmentName: '' };
        return { ...prev, items: next };
      });
    }
  };

  const handleDemandSheetAttachmentFile = async (form: 'new' | 'edit', file: File | null) => {
    if (!file) return;
    setUploadingDemandSheetAttachment(form);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await api.post('/material-requests/upload-item-attachment', fd);
      const d = res.data?.data as { url?: string; originalName?: string } | undefined;
      if (!d?.url) throw new Error('Resposta inválida do servidor');
      if (form === 'new') {
        setFormData((prev) => ({
          ...prev,
          demandSheetAttachmentUrl: d.url || '',
          demandSheetAttachmentName: d.originalName || ''
        }));
      } else {
        setEditFormData((prev) => ({
          ...prev,
          demandSheetAttachmentUrl: d.url || '',
          demandSheetAttachmentName: d.originalName || ''
        }));
      }
      toast.success('Anexo da FD enviado');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Não foi possível enviar o anexo da FD');
    } finally {
      setUploadingDemandSheetAttachment(null);
    }
  };

  const clearDemandSheetAttachment = (form: 'new' | 'edit') => {
    if (form === 'new') {
      setFormData((prev) => ({
        ...prev,
        demandSheetAttachmentUrl: '',
        demandSheetAttachmentName: ''
      }));
    } else {
      setEditFormData((prev) => ({
        ...prev,
        demandSheetAttachmentUrl: '',
        demandSheetAttachmentName: ''
      }));
    }
  };

  const handleEditRemoveItem = (index: number) => {
    setEditFormData((prev) => ({
      ...prev,
      items: prev.items.filter((_, i) => i !== index)
    }));
    setEditItemMaterialSearch((prev) => prev.filter((_, i) => i !== index));
  };

  const handleEditItemChange = (index: number, field: string, value: unknown) => {
    setEditFormData((prev) => {
      const newItems = [...prev.items];
      newItems[index] = { ...newItems[index], [field]: value };
      if (field === 'materialId' && typeof value === 'string' && value) {
        const material = (materialsData?.data || []).find((m: { id: string }) => m.id === value);
        newItems[index].unit = material?.unit || '';
      } else if (field === 'materialId' && value === '') {
        newItems[index].unit = '';
      }
      return { ...prev, items: newItems };
    });
  };

  const handleEditItemMaterialSearchChange = (index: number, value: string) => {
    setEditItemMaterialSearch((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });

    const normalized = value.trim().toLowerCase();
    const exactMatch = materials.find((material) => getMaterialLabel(material).trim().toLowerCase() === normalized);

    if (!normalized || !exactMatch) {
      handleEditItemChange(index, 'materialId', '');
      return;
    }

    handleEditItemChange(index, 'materialId', exactMatch.id);
  };

  const submitCorrectionEdit = (submitForApproval: boolean) => {
    if (!correctionEditId) return;
    if (!editFormData.costCenterId) {
      toast.error('Selecione o centro de custo.');
      return;
    }
    if (!editFormData.serviceOrderId) {
      toast.error('Selecione a ordem de serviço.');
      return;
    }
    const validItems = editFormData.items.filter((i) => i.materialId);
    if (validItems.length === 0) {
      toast.error('Inclua ao menos um material.');
      return;
    }
    updateCorrectionMutation.mutate({
      id: correctionEditId,
      submitForApproval,
      form: editFormData
    });
  };

  return (
    <ProtectedRoute route="/ponto/solicitar-materiais">
      <MainLayout 
        userRole={user.role} 
        userName={user.name} 
        onLogout={handleLogout}
      >
        <div className="space-y-6">
          {/* Cabeçalho */}
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Solicitação de Materiais</h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">Solicite materiais para seus projetos</p>
          </div>

          <Card>
            <CardHeader className="border-b-0 pb-1">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex-shrink-0">
                    <ShoppingCart className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Minhas Solicitações</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Visualize suas solicitações de materiais
                    </p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  <div className="relative min-w-[240px] flex-1 sm:w-[280px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="search"
                      value={rmListSearch}
                      onChange={(e) => setRmListSearch(e.target.value)}
                      placeholder="Nº SC, OS, obra, centro de custo..."
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-9 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                    {rmListSearch && (
                      <button
                        type="button"
                        onClick={() => setRmListSearch('')}
                        aria-label="Limpar busca"
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsListFiltersModalOpen(true)}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                    aria-label="Abrir filtro"
                    title="Filtro"
                  >
                    <Filter className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsNewRequestModalOpen(true)}
                    className="flex h-10 items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-800/60 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-900/40"
                  >
                    <Plus className="h-4 w-4 shrink-0" />
                    <span>Nova Solicitação</span>
                  </button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loadingRequests ? (
                <div className="text-center py-8">
                  <Loading message="Carregando solicitações..." />
                </div>
              ) : hasRequestsError ? (
                <div className="text-center py-8">
                  <p className="text-red-600 dark:text-red-400">
                    Não foi possível carregar suas solicitações.
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    {(requestsError as any)?.response?.data?.message ||
                      'Verifique se as migrations do backend foram aplicadas e tente novamente.'}
                  </p>
                </div>
              ) : requests.length === 0 ? (
                <div className="text-center py-8">
                  <ShoppingCart className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto mb-4" />
                  <p className="text-gray-500 dark:text-gray-400">Nenhuma solicitação encontrada</p>
                </div>
              ) : listTotal === 0 ? (
                <div className="text-center py-8 rounded-lg border border-dashed border-gray-300 dark:border-gray-600">
                  <p className="text-gray-500 dark:text-gray-400 text-sm">
                    Nenhuma solicitação corresponde aos filtros.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setRmListSearch('');
                      clearListFilters();
                    }}
                    className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Limpar filtros
                  </button>
                </div>
              ) : (
                <>
                  <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                    <span>
                      Mostrando {listStartItem} a {listEndItem} de {listTotal} solicitação(ões)
                    </span>
                    <span>
                      Página {listCurrentPage} de {listTotalPages}
                    </span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                            Nº SC
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                            Data
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Centro de Custo
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                            OS
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                            Obra
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Descrição
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider min-w-[160px]">
                            Fase Atual
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider whitespace-nowrap">
                            Ação
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {paginatedRequests.map(
                          (
                            request: Record<string, unknown> & {
                              id: string;
                              status?: string;
                              purchaseOrders?: RmListPurchaseOrder[];
                            }
                          ) => (
                            <tr
                              key={request.id}
                              onClick={() => setDetailViewId(request.id)}
                              className={getListTableRowClassName(true)}
                            >
                              <td className="px-3 sm:px-6 py-3 text-sm font-medium text-gray-900 dark:text-gray-100 whitespace-nowrap">
                                <ListRowNavigableLabel className="font-medium whitespace-nowrap">
                                  {String(request.requestNumber || '—')}
                                </ListRowNavigableLabel>
                              </td>
                              <td className="px-3 sm:px-6 py-3 text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap">
                                {request.requestedAt
                                  ? new Date(String(request.requestedAt)).toLocaleDateString('pt-BR')
                                  : '—'}
                              </td>
                              <td
                                className="px-3 sm:px-6 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-[200px]"
                                title={rmCostCenterName(request as Parameters<typeof rmCostCenterName>[0])}
                              >
                                <span className="line-clamp-2">
                                  {rmCostCenterName(request as Parameters<typeof rmCostCenterName>[0])}
                                </span>
                              </td>
                              <td
                                className="px-3 sm:px-6 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-[120px] truncate"
                                title={rmOsLine(request as Parameters<typeof rmOsLine>[0])}
                              >
                                {rmOsLine(request as Parameters<typeof rmOsLine>[0])}
                              </td>
                              <td
                                className="px-3 sm:px-6 py-3 text-sm text-gray-700 dark:text-gray-300 max-w-[120px] truncate"
                                title={String(request.obra || '')}
                              >
                                {request.obra ? String(request.obra) : '—'}
                              </td>
                              <td className="px-3 sm:px-6 py-3 text-sm text-gray-600 dark:text-gray-400 max-w-[220px]">
                                <span className="line-clamp-2" title={String(request.description || '')}>
                                  {request.description ? String(request.description) : '—'}
                                </span>
                              </td>
                              <td className="px-3 sm:px-6 py-3 align-middle">
                                <div className="flex flex-col justify-center gap-0.5 text-xs sm:text-sm">
                                  {materialRequestFaseAtualLines(request).map((line) => (
                                    <span
                                      key={line.key}
                                      className={`font-medium whitespace-normal break-words ${line.className}`}
                                      title={line.text}
                                    >
                                      {line.text}
                                    </span>
                                  ))}
                                </div>
                              </td>
                              <td className="px-3 sm:px-6 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                <div className="inline-flex items-center justify-end gap-1">
                                  {request.status === 'IN_REVIEW' ? (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => setCorrectionEditId(request.id)}
                                        className="inline-flex items-center justify-center gap-1 px-2 py-1 text-xs font-medium rounded-md border border-amber-600 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                        title="Editar correção"
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => resubmitAfterCorrectionMutation.mutate(request.id)}
                                        disabled={resubmitAfterCorrectionMutation.isPending}
                                        className="inline-flex items-center justify-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50"
                                        title="Reenviar"
                                      >
                                        <Send className="w-3.5 h-3.5" />
                                      </button>
                                    </>
                                  ) : null}
                                  <button
                                    type="button"
                                    onClick={() => setDetailViewId(request.id)}
                                    className={rowActionMenuButtonClass(false)}
                                    aria-label="Ver detalhes"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                  {listTotalPages > 1 && (
                    <div className="mt-4 flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setListCurrentPage((prev) => Math.max(prev - 1, 1))}
                        disabled={listCurrentPage === 1}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                      >
                        Anterior
                      </button>
                      <button
                        type="button"
                        onClick={() => setListCurrentPage((prev) => Math.min(prev + 1, listTotalPages))}
                        disabled={listCurrentPage === listTotalPages}
                        className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                      >
                        Próxima
                      </button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {isListFiltersModalOpen && (
            <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/40" onClick={() => setIsListFiltersModalOpen(false)} aria-hidden />
              <div className="relative mx-4 w-full max-w-2xl rounded-xl bg-white shadow-2xl dark:bg-gray-800">
                <div className="flex items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
                  <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">Filtro</h3>
                  <button
                    type="button"
                    onClick={() => setIsListFiltersModalOpen(false)}
                    className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                    aria-label="Fechar filtros"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="sm:col-span-2">
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Fase atual
                      </label>
                      <select
                        value={rmListFaseAtual}
                        onChange={(e) => setRmListFaseAtual(e.target.value)}
                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      >
                        <option value="">Todas</option>
                        <optgroup label="SC (solicitação)">
                          {RM_FASE_FILTER_ORDER.map((st) => (
                            <option key={`rm:${st}`} value={`rm:${st}`}>
                              {rmStatusLabelPt(st)}
                            </option>
                          ))}
                        </optgroup>
                        <optgroup label="OC (ordem de compra)">
                          {OC_FASE_FILTER_ORDER.filter((k) => k in OC_STATUS_LABELS_PT).map((st) => (
                            <option key={`oc:${st}`} value={`oc:${st}`}>
                              {purchaseOrderPhaseShortLabel(st)}
                            </option>
                          ))}
                        </optgroup>
                      </select>
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Obra</label>
                      <select
                        value={rmListObra}
                        onChange={(e) => setRmListObra(e.target.value)}
                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      >
                        <option value="">Todas</option>
                        {obraOptionsFromRequests.map((obra) => (
                          <option key={obra} value={obra}>
                            {obra}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Centro de custo
                      </label>
                      {loadingCostCenters ? (
                        <div className="w-full rounded-md border border-gray-300 bg-gray-50 px-3 py-2.5 text-sm text-gray-500 dark:border-gray-600 dark:bg-gray-800">
                          Carregando...
                        </div>
                      ) : (
                        <select
                          value={rmListCostCenterId}
                          onChange={(e) => setRmListCostCenterId(e.target.value)}
                          className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                        >
                          <option value="">Todos</option>
                          {costCenters
                            .filter((cc): cc is typeof cc & { id: string } => Boolean(cc.id))
                            .map((cc) => (
                              <option key={cc.id} value={cc.id}>
                                {cc.name}
                              </option>
                            ))}
                        </select>
                      )}
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Data inicial
                      </label>
                      <input
                        type="date"
                        value={rmListDateFrom}
                        onChange={(e) => setRmListDateFrom(e.target.value)}
                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      />
                    </div>
                    <div>
                      <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Data final
                      </label>
                      <input
                        type="date"
                        value={rmListDateTo}
                        onChange={(e) => setRmListDateTo(e.target.value)}
                        className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      />
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 sm:col-span-2">
                      Período pela data da solicitação (fuso local).
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between border-t border-gray-200 px-5 py-4 dark:border-gray-700">
                  <button
                    type="button"
                    onClick={clearListFilters}
                    className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100 dark:border-blue-800/60 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-900/40"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Limpar filtros
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsListFiltersModalOpen(false)}
                    className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
                  >
                    Fechar
                  </button>
                </div>
              </div>
            </div>
          )}

          {isNewRequestModalOpen && (
            <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black/40" onClick={closeNewRequestModal} aria-hidden />
              <div
                className="relative flex max-h-[min(92vh,720px)] w-full max-w-3xl flex-col rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800"
                role="dialog"
                aria-modal="true"
                aria-labelledby="new-request-modal-title"
              >
                <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-4 dark:border-gray-700">
                  <h3
                    id="new-request-modal-title"
                    className="text-lg font-semibold text-gray-900 dark:text-gray-100"
                  >
                    Nova Solicitação de Material
                  </h3>
                  <button
                    type="button"
                    onClick={closeNewRequestModal}
                    className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-0 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                    aria-label="Fechar"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="overflow-y-auto px-5 py-4 [&_*:focus]:outline-none [&_*:focus]:ring-0 [&_*:focus-visible]:outline-none [&_*:focus-visible]:ring-0">
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Centro de Custo *
                    </label>
                    {loadingCostCenters ? (
                      <input
                        type="text"
                        disabled
                        readOnly
                        value="Carregando centros de custo..."
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-500 dark:text-gray-400 focus:outline-none disabled:cursor-not-allowed disabled:opacity-100"
                      />
                    ) : (
                      <>
                        <RmCostCenterAutocomplete
                          searchValue={newCostCenterSearch}
                          isOpen={isNewCostCenterDropdownOpen}
                          onOpen={() => setIsNewCostCenterDropdownOpen(true)}
                          onClose={() => setIsNewCostCenterDropdownOpen(false)}
                          onSearchChange={handleNewCostCenterSearchChange}
                          onSelect={(costCenter) => {
                            handleNewCostCenterChange(costCenter.id);
                            setNewCostCenterSearch(getCostCenterLabel(costCenter));
                            setIsNewCostCenterDropdownOpen(false);
                          }}
                          costCenters={costCenters}
                          loading={loadingCostCenters}
                          getCostCenterLabel={getCostCenterLabel}
                          inputClassName="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <input type="hidden" required value={formData.costCenterId} readOnly />
                      </>
                    )}
                    {!loadingCostCenters && costCenters.length === 0 && (
                      <p className="mt-1 text-xs text-yellow-600 dark:text-yellow-400">
                        Nenhum centro de custo disponível. Execute o seed do banco de dados.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Ordem de Serviço *
                    </label>
                    <ServiceOrderSearchSelect
                      costCenterId={formData.costCenterId}
                      serviceOrders={newFormServiceOrders}
                      loading={loadingNewFormServiceOrders}
                      serviceOrderId={formData.serviceOrderId}
                      serviceOrderLabel={formData.serviceOrder}
                      onSelect={handleNewServiceOrderSelect}
                      onClear={handleNewServiceOrderClear}
                      required
                    />
                    <input type="hidden" required value={formData.serviceOrderId} readOnly />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Obra *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.obra}
                      onChange={(e) => setFormData({ ...formData, obra: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Identificação da obra"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Descrição
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      placeholder="Descreva a necessidade dos materiais..."
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Ficha de Demanda *
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.demandSheet}
                          onChange={(e) => setFormData({ ...formData, demandSheet: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                          placeholder="Número ou referência da FD"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Anexar FD *
                        </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50">
                        {uploadingDemandSheetAttachment === 'new' ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Paperclip className="w-4 h-4" />
                        )}
                        <span>{uploadingDemandSheetAttachment === 'new' ? 'Enviando...' : 'Escolher arquivo'}</span>
                        <input
                          type="file"
                          className="hidden"
                          disabled={!!uploadingDemandSheetAttachment}
                          accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"
                          onChange={(e) => {
                            const f = e.target.files?.[0] || null;
                            if (f) void handleDemandSheetAttachmentFile('new', f);
                            e.currentTarget.value = '';
                          }}
                        />
                      </label>
                      {formData.demandSheetAttachmentUrl && (
                        <>
                          <a
                            href={absoluteUploadUrl(formData.demandSheetAttachmentUrl)}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            {formData.demandSheetAttachmentName || 'Anexo FD'}
                          </a>
                          <button
                            type="button"
                            onClick={() => clearDemandSheetAttachment('new')}
                            className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-red-300 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                          >
                            <X className="w-3 h-3" />
                            Remover
                          </button>
                        </>
                      )}
                    </div>
                    <input type="hidden" required value={formData.demandSheetAttachmentUrl} readOnly />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        Prioridade *
                      </label>
                      <select
                        required
                        value={formData.priority}
                        onChange={(e) => setFormData({ ...formData, priority: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      >
                        <option value="LOW">Baixa</option>
                        <option value="MEDIUM">Média</option>
                        <option value="HIGH">Alta</option>
                        <option value="URGENT">Urgente</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Itens *
                      </label>
                      <button
                        type="button"
                        onClick={handleAddItem}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1"
                      >
                        <Plus className="w-4 h-4" />
                        Adicionar Item
                      </button>
                    </div>
                    <div className="space-y-3">
                      {formData.items.map((item, index) => (
                        <div key={index} className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                          <div className="flex items-start justify-between mb-3">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Item {index + 1}</span>
                            {formData.items.length > 1 && (
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(index)}
                                className="text-red-600 dark:text-red-400 hover:text-red-700"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                          <div className="space-y-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                Material *
                              </label>
                              <div>
                                <RmMaterialAutocomplete
                                  searchValue={newItemMaterialSearch[index] || ''}
                                  isOpen={activeNewMaterialDropdownIndex === index}
                                  onOpen={() => setActiveNewMaterialDropdownIndex(index)}
                                  onClose={() =>
                                    setActiveNewMaterialDropdownIndex((prev) => (prev === index ? null : prev))
                                  }
                                  onSearchChange={(value) => handleNewItemMaterialSearchChange(index, value)}
                                  onSelect={(material) => {
                                    handleItemChange(index, 'materialId', material.id);
                                    handleNewItemMaterialSearchChange(index, getMaterialLabel(material));
                                    setActiveNewMaterialDropdownIndex(null);
                                  }}
                                  materials={materials}
                                  loading={loadingMaterials}
                                  loadError={materialsLoadError}
                                  getMaterialLabel={getMaterialLabel}
                                  inputClassName={rmMaterialInputClass}
                                />
                                <input type="hidden" required value={item.materialId} readOnly />
                              </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                Quantidade *
                              </label>
                              <RmQuantityInput
                                required
                                value={item.quantity}
                                unit={item.unit}
                                onChange={(quantity) => handleItemChange(index, 'quantity', quantity)}
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                Observação
                              </label>
                              <input
                                type="text"
                                value={item.observation}
                                onChange={(e) => handleItemChange(index, 'observation', e.target.value)}
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                              />
                            </div>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                                Anexo (opcional)
                              </label>
                              <div className="flex flex-wrap items-center gap-2">
                                <label className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-800 dark:text-gray-200 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50">
                                  {uploadingAttachment?.form === 'new' && uploadingAttachment.index === index ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Paperclip className="w-4 h-4" />
                                  )}
                                  <span>
                                    {uploadingAttachment?.form === 'new' && uploadingAttachment.index === index
                                      ? 'Enviando...'
                                      : 'Escolher arquivo'}
                                  </span>
                                  <input
                                    key={`new-att-${index}-${item.attachmentUrl || 'empty'}`}
                                    type="file"
                                    className="hidden"
                                    disabled={!!uploadingAttachment}
                                    onChange={(e) => {
                                      const f = e.target.files?.[0];
                                      if (f) void handleItemAttachmentFile('new', index, f);
                                      e.target.value = '';
                                    }}
                                  />
                                </label>
                                {item.attachmentUrl ? (
                                  <>
                                    <span className="text-xs text-gray-600 dark:text-gray-400 truncate max-w-[200px]">
                                      {item.attachmentName || 'Anexo'}
                                    </span>
                                    <a
                                      href={absoluteUploadUrl(item.attachmentUrl)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                    >
                                      <ExternalLink className="w-3.5 h-3.5" />
                                      Abrir
                                    </a>
                                    <button
                                      type="button"
                                      onClick={() => clearItemAttachment('new', index)}
                                      className="text-xs text-red-600 dark:text-red-400 hover:underline"
                                    >
                                      Remover
                                    </button>
                                  </>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {createMutation.isError && (
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
                      <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                      <p className="text-sm text-red-700 dark:text-red-300">
                        {(createMutation.error as any)?.response?.data?.message || 'Erro ao criar solicitação'}
                      </p>
                    </div>
                  )}

                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      onClick={closeNewRequestModal}
                      className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={createMutation.isPending}
                      className="px-4 py-2 bg-blue-600 dark:bg-blue-700 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-800 disabled:opacity-50"
                    >
                      {createMutation.isPending ? 'Criando...' : 'Criar Solicitação'}
                    </button>
                  </div>
                </form>
                </div>
              </div>
            </div>
          )}
        </div>

        {detailViewId && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setDetailViewId(null)}
              aria-hidden
            />
            <div
              className="relative flex max-h-[min(92vh,720px)] w-full max-w-2xl flex-col rounded-xl border border-gray-200 bg-white shadow-2xl dark:border-gray-700 dark:bg-gray-800"
              role="dialog"
              aria-modal="true"
              aria-labelledby="rm-detail-modal-title"
            >
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-200 px-5 py-4 dark:border-gray-700">
                <div className="min-w-0">
                  <h3
                    id="rm-detail-modal-title"
                    className="text-lg font-semibold text-gray-900 dark:text-gray-100"
                  >
                    Detalhes da solicitação
                  </h3>
                  {!loadingDetailRm && detailRmData ? (
                    <p className="mt-0.5 truncate text-sm text-gray-500 dark:text-gray-400">
                      {String(
                        (detailRmData as { requestNumber?: string }).requestNumber || 'Solicitação'
                      )}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setDetailViewId(null)}
                  className="shrink-0 rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
                  aria-label="Fechar"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                {loadingDetailRm ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400" />
                  </div>
                ) : detailRmData ? (
                  (() => {
                    const d = detailRmData as Record<string, unknown> & {
                      requestNumber?: string;
                      requestedAt?: string;
                      status?: string;
                      description?: string;
                      obra?: string;
                      serviceOrder?: string;
                      priority?: string;
                      costCenter?: { code?: string; name?: string };
                      items?: Array<{
                        quantity?: unknown;
                        unit?: string;
                        notes?: string | null;
                        attachmentUrl?: string | null;
                        attachmentName?: string | null;
                        material?: {
                          description?: string | null;
                          name?: string | null;
                          sinapiCode?: string | null;
                        };
                      }>;
                      purchaseOrders?: Array<{ id: string; orderNumber?: string | null; status: string }>;
                    };
                    const pos = Array.isArray(d.purchaseOrders) ? d.purchaseOrders : [];
                    const requestedDate = d.requestedAt ? new Date(String(d.requestedAt)) : null;
                    const statusKey = d.status ? String(d.status) : '';

                    return (
                      <div className="space-y-5">
                        <div className="flex flex-wrap items-center gap-2">
                          {statusKey ? (
                            <span className={rmStatusBadgeClass(statusKey)}>
                              SC · {rmStatusLabelPt(statusKey)}
                            </span>
                          ) : null}
                          {d.priority ? (
                            <span className={rmPriorityBadgeClass(String(d.priority))}>
                              {rmPriorityLabelPt(String(d.priority))}
                            </span>
                          ) : null}
                        </div>

                        <section className="rounded-lg border border-gray-200 bg-gray-50/80 p-4 dark:border-gray-600 dark:bg-gray-900/40">
                          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                            Informações gerais
                          </h4>
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <DetailField label="Nº SC">
                              <span className="font-semibold">{String(d.requestNumber || '—')}</span>
                            </DetailField>
                            <DetailField label="Data da solicitação">
                              {requestedDate && !Number.isNaN(requestedDate.getTime()) ? (
                                <>
                                  <span className="block">
                                    {requestedDate.toLocaleDateString('pt-BR')}
                                  </span>
                                  <span className="text-xs text-gray-500 dark:text-gray-400">
                                    {requestedDate.toLocaleTimeString('pt-BR', {
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    })}
                                  </span>
                                </>
                              ) : (
                                '—'
                              )}
                            </DetailField>
                            <DetailField label="Centro de custo" className="sm:col-span-2">
                              {rmCostCenterName(d as Parameters<typeof rmCostCenterName>[0])}
                            </DetailField>
                            <DetailField label="OS">{rmOsLine(d as Parameters<typeof rmOsLine>[0])}</DetailField>
                            <DetailField label="Obra">{d.obra ? String(d.obra) : '—'}</DetailField>
                            {d.description ? (
                              <DetailField label="Descrição" className="sm:col-span-2">
                                <p className="whitespace-pre-wrap leading-relaxed">{String(d.description)}</p>
                              </DetailField>
                            ) : null}
                          </div>
                        </section>

                        {d.items && d.items.length > 0 ? (
                          <section>
                            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                              Itens ({d.items.length})
                            </h4>
                            <ul className="space-y-2">
                              {d.items.map((it, idx) => {
                                const mat = it.material;
                                const line =
                                  mat?.description?.trim() ||
                                  mat?.name?.trim() ||
                                  mat?.sinapiCode ||
                                  'Material';
                                const qty =
                                  it.quantity !== undefined && it.quantity !== null
                                    ? String(it.quantity)
                                    : '—';
                                const unit = it.unit ? String(it.unit) : '';
                                return (
                                  <li
                                    key={idx}
                                    className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-600 dark:bg-gray-800/60"
                                  >
                                    <p className="font-medium text-gray-900 dark:text-gray-100">{line}</p>
                                    <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
                                      <span className="font-medium text-gray-700 dark:text-gray-300">
                                        {qty}
                                      </span>
                                      {unit ? ` ${unit}` : ''}
                                      {typeof it.notes === 'string' && it.notes.trim() ? (
                                        <span className="text-gray-500 dark:text-gray-500">
                                          {' '}
                                          · {it.notes.trim()}
                                        </span>
                                      ) : null}
                                    </p>
                                    {it.attachmentUrl ? (
                                      <a
                                        href={absoluteUploadUrl(String(it.attachmentUrl))}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
                                      >
                                        <ExternalLink className="h-3.5 w-3.5" />
                                        {it.attachmentName || 'Ver anexo'}
                                      </a>
                                    ) : null}
                                  </li>
                                );
                              })}
                            </ul>
                          </section>
                        ) : null}

                        {pos.length > 0 ? (
                          <section>
                            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                              Ordens de compra ({pos.length})
                            </h4>
                            <ul className="space-y-2">
                              {sortPurchaseOrdersForDisplay(pos as RmListPurchaseOrder[]).map((po) => {
                                const num =
                                  (po.orderNumber && String(po.orderNumber).trim()) || po.id.slice(0, 8);
                                return (
                                  <li
                                    key={po.id}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-600 dark:bg-gray-800/60"
                                  >
                                    <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                      OC {num}
                                    </span>
                                    <span
                                      className={`text-xs font-medium ${ocStatusTextClass(po.status)}`}
                                    >
                                      {purchaseOrderPhaseShortLabel(po.status)}
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          </section>
                        ) : null}
                      </div>
                    );
                  })()
                ) : (
                  <p className="py-8 text-center text-sm text-red-600 dark:text-red-400">
                    Não foi possível carregar os detalhes.
                  </p>
                )}
              </div>

              <div className="flex shrink-0 justify-end border-t border-gray-200 px-5 py-4 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => setDetailViewId(null)}
                  className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
                >
                  Fechar
                </button>
              </div>
            </div>
          </div>
        )}

        {correctionEditId && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => !updateCorrectionMutation.isPending && setCorrectionEditId(null)}
            />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto p-4 sm:p-6">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1">
                Editar requisição (Correção RM)
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Ajuste os dados e salve. Use &quot;Salvar e reenviar&quot; quando quiser voltar a fila de aprovação do compras.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Centro de Custo *
                  </label>
                  <RmCostCenterAutocomplete
                    searchValue={editCostCenterSearch}
                    isOpen={isEditCostCenterDropdownOpen}
                    onOpen={() => setIsEditCostCenterDropdownOpen(true)}
                    onClose={() => setIsEditCostCenterDropdownOpen(false)}
                    onSearchChange={handleEditCostCenterSearchChange}
                    onSelect={(costCenter) => {
                      handleEditCostCenterChange(costCenter.id);
                      setEditCostCenterSearch(getCostCenterLabel(costCenter));
                      setIsEditCostCenterDropdownOpen(false);
                    }}
                    costCenters={costCenters}
                    loading={loadingCostCenters}
                    getCostCenterLabel={getCostCenterLabel}
                    inputClassName="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                  />
                  <input type="hidden" value={editFormData.costCenterId} readOnly />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Ordem de Serviço *
                  </label>
                  <ServiceOrderSearchSelect
                    costCenterId={editFormData.costCenterId}
                    serviceOrders={editFormServiceOrders}
                    loading={loadingEditFormServiceOrders}
                    serviceOrderId={editFormData.serviceOrderId}
                    serviceOrderLabel={editFormData.serviceOrder}
                    onSelect={handleEditServiceOrderSelect}
                    onClear={handleEditServiceOrderClear}
                    inputSize="sm"
                    emptyCostCenterHint="Selecione o centro de custo"
                    required
                  />
                  <input type="hidden" required value={editFormData.serviceOrderId} readOnly />
                  {editFormData.serviceOrder &&
                    !editFormData.serviceOrderId &&
                    editFormServiceOrders.length > 0 && (
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                        Valor anterior: {editFormData.serviceOrder}. Selecione a OS correspondente na lista, se existir.
                      </p>
                    )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Obra
                  </label>
                  <input
                    type="text"
                    value={editFormData.obra}
                    onChange={(e) => setEditFormData({ ...editFormData, obra: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                    placeholder="Identificação da obra (opcional)"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Descrição
                  </label>
                  <textarea
                    value={editFormData.description}
                    onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Prioridade
                  </label>
                  <select
                    value={editFormData.priority}
                    onChange={(e) => setEditFormData({ ...editFormData, priority: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                  >
                    <option value="LOW">Baixa</option>
                    <option value="MEDIUM">Média</option>
                    <option value="HIGH">Alta</option>
                    <option value="URGENT">Urgente</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Ficha de Demanda
                  </label>
                  <input
                    type="text"
                    value={editFormData.demandSheet}
                    onChange={(e) => setEditFormData({ ...editFormData, demandSheet: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                    placeholder="Número ou referência da FD (opcional)"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Anexar FD
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="inline-flex items-center gap-1.5 px-2 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
                      {uploadingDemandSheetAttachment === 'edit' ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Paperclip className="w-3.5 h-3.5" />
                      )}
                      <span>{uploadingDemandSheetAttachment === 'edit' ? 'Enviando...' : 'Arquivo'}</span>
                      <input
                        type="file"
                        className="hidden"
                        disabled={!!uploadingDemandSheetAttachment}
                        accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx"
                        onChange={(e) => {
                          const f = e.target.files?.[0] || null;
                          if (f) void handleDemandSheetAttachmentFile('edit', f);
                          e.currentTarget.value = '';
                        }}
                      />
                    </label>
                    {editFormData.demandSheetAttachmentUrl && (
                      <>
                        <a
                          href={absoluteUploadUrl(editFormData.demandSheetAttachmentUrl)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          {editFormData.demandSheetAttachmentName || 'Anexo FD'}
                        </a>
                        <button
                          type="button"
                          onClick={() => clearDemandSheetAttachment('edit')}
                          className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded border border-red-300 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
                        >
                          <X className="w-3 h-3" />
                          Remover
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Itens *</span>
                    <button
                      type="button"
                      onClick={handleEditAddItem}
                      className="text-sm text-blue-600 dark:text-blue-400 flex items-center gap-1"
                    >
                      <Plus className="w-4 h-4" />
                      Adicionar item
                    </button>
                  </div>
                  <div className="space-y-3">
                    {editFormData.items.map((item, index) => (
                      <div
                        key={index}
                        className="p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-600"
                      >
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Item {index + 1}</span>
                          {editFormData.items.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleEditRemoveItem(index)}
                              className="text-red-600 dark:text-red-400"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                        <div className="space-y-2">
                          <div>
                            <label className="block text-xs text-gray-500 mb-0.5">Material *</label>
                            <RmMaterialAutocomplete
                              searchValue={editItemMaterialSearch[index] || ''}
                              isOpen={activeEditMaterialDropdownIndex === index}
                              onOpen={() => setActiveEditMaterialDropdownIndex(index)}
                              onClose={() =>
                                setActiveEditMaterialDropdownIndex((prev) => (prev === index ? null : prev))
                              }
                              onSearchChange={(value) => handleEditItemMaterialSearchChange(index, value)}
                              onSelect={(material) => {
                                handleEditItemChange(index, 'materialId', material.id);
                                handleEditItemMaterialSearchChange(index, getMaterialLabel(material));
                                setActiveEditMaterialDropdownIndex(null);
                              }}
                              materials={materials}
                              loading={loadingMaterials}
                              loadError={materialsLoadError}
                              getMaterialLabel={getMaterialLabel}
                              inputClassName={rmMaterialInputClassSm}
                            />
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          <div>
                            <label className="block text-xs text-gray-500 mb-0.5">Quantidade *</label>
                            <RmQuantityInput
                              size="sm"
                              value={item.quantity}
                              unit={item.unit}
                              onChange={(quantity) =>
                                handleEditItemChange(index, 'quantity', quantity)
                              }
                            />
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block text-xs text-gray-500 mb-0.5">Observação</label>
                            <input
                              type="text"
                              value={item.observation}
                              onChange={(e) => handleEditItemChange(index, 'observation', e.target.value)}
                              className="w-full px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-800"
                            />
                          </div>
                          </div>
                          <div>
                            <label className="block text-xs text-gray-500 mb-0.5">Anexo (opcional)</label>
                            <div className="flex flex-wrap items-center gap-2">
                              <label className="inline-flex items-center gap-1.5 px-2 py-1.5 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50">
                                {uploadingAttachment?.form === 'edit' && uploadingAttachment.index === index ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Paperclip className="w-3.5 h-3.5" />
                                )}
                                <span>
                                  {uploadingAttachment?.form === 'edit' && uploadingAttachment.index === index
                                    ? 'Enviando...'
                                    : 'Arquivo'}
                                </span>
                                <input
                                  key={`edit-att-${index}-${item.attachmentUrl || 'empty'}`}
                                  type="file"
                                  className="hidden"
                                  disabled={!!uploadingAttachment}
                                  onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) void handleItemAttachmentFile('edit', index, f);
                                    e.target.value = '';
                                  }}
                                />
                              </label>
                              {item.attachmentUrl ? (
                                <>
                                  <span className="text-xs text-gray-500 dark:text-gray-400 truncate max-w-[180px]">
                                    {item.attachmentName || 'Anexo'}
                                  </span>
                                  <a
                                    href={absoluteUploadUrl(item.attachmentUrl)}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-0.5 text-xs text-blue-600 dark:text-blue-400"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    Abrir
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() => clearItemAttachment('edit', index)}
                                    className="text-xs text-red-600 dark:text-red-400"
                                  >
                                    Remover
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                <button
                  type="button"
                  disabled={updateCorrectionMutation.isPending}
                  onClick={() => setCorrectionEditId(null)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  disabled={updateCorrectionMutation.isPending}
                  onClick={() => submitCorrectionEdit(false)}
                  className="px-4 py-2 border border-blue-600 text-blue-700 dark:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-950/30"
                >
                  {updateCorrectionMutation.isPending ? 'Salvando...' : 'Salvar alterações'}
                </button>
                <button
                  type="button"
                  disabled={updateCorrectionMutation.isPending}
                  onClick={() => submitCorrectionEdit(true)}
                  className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50"
                >
                  {updateCorrectionMutation.isPending ? 'Enviando...' : 'Salvar e reenviar para aprovação'}
                </button>
              </div>
            </div>
          </div>
        )}
      </MainLayout>
    </ProtectedRoute>
  );
}

/** Next.js exige Suspense em volta de `useSearchParams` na geração estática. */
export default function SolicitarMateriaisPageWithSuspense() {
  return (
    <Suspense fallback={<Loading />}>
      <SolicitarMateriaisPage />
    </Suspense>
  );
}
