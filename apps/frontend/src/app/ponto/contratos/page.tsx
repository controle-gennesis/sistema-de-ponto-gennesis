'use client';

import { KanbanLabelColorPicker } from '@/components/kanban/KanbanLabelColorPicker';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  FileText,
  Plus,
  Trash2,
  Search,
  X,
  AlertCircle,
  Shield,
  MoreVertical,
  Info,
  Eye,
  Pencil,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import {
  ListRowNavigableLabel,
  getListTableRowClassName,
  listTableRowClasses,
  rowActionMenuButtonClass,
} from '@/components/ui/RowActionMenu';
import { NotificationCountBadge } from '@/components/ui/NotificationCountBadge';
import { useMensalReportPendingCount } from '@/hooks/useMensalReportPendingCount';
import { ActionMenuOverlay } from '@/components/ui/ActionMenuOverlay';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { useModalCloseConfirm } from '@/hooks/useModalCloseConfirm';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { resolveOrcafascioClientIdForContractName } from '@/lib/orcafascioClients';
import { MainLayout } from '@/components/layout/MainLayout';
import { ListPageHeader, PageStack } from '@/components/ui/pageLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { CadastroListLoading } from '@/components/ui/CadastroListSummary';
import {
  UserPermissionsEditor,
  UserPermissionsTabBar,
  type PermissionEditorTab,
  type PermissionsTargetPreview,
} from '@/components/permissions/UserPermissionsEditor';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useCostCenters } from '@/hooks/useCostCenters';
import { usePermissions } from '@/hooks/usePermissions';
import { useLogout } from '@/hooks/useLogout';
import { pathToModuleKey } from '@sistema-ponto/permission-modules';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';

interface CostCenter {
  id: string;
  code?: string;
  name?: string;
  label?: string;
}

interface Contract {
  id: string;
  name: string;
  number: string;
  startDate: string;
  endDate: string;
  costCenterId: string;
  costCenter?: { id: string; code: string; name: string };
  valuePlusAddenda: number;
  allowBillingImportWithoutOsPleito?: boolean;
  orcafascioClientId?: string | null;
  defaultBdiPercent?: number | string | null;
  defaultDiscountPercent?: number | string | null;
  defaultReajustes?: Array<{ nome: string; percentual: string }> | null;
  defaultTituloFundo?: string | null;
}

type ContractPermissionUser = {
  id: string;
  name: string;
  cpf?: string;
  email: string;
  employee?: { position?: string; department?: string };
  hasContractsModule: boolean;
  hasContractAccess: boolean;
};

type UserPermissionPayload = {
  user: { id: string; name: string; email: string; employee?: { position?: string | null } };
  isAdmin: boolean;
  permissions: Array<{ module: string; action: string }>;
  allowedContractIds: string[];
};

const CONTRACT_ACTION_MENU_WIDTH_PX = 224; // w-56

const pk = pathToModuleKey;

function formatDate(dateStr: string) {
  if (!dateStr) return '-';
  const raw = String(dateStr).trim();
  const only = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = only
    ? new Date(Number(only[1]), Number(only[2]) - 1, Number(only[3]), 12, 0, 0, 0)
    : new Date(raw);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

/** Ícone "i" dentro do campo (canto direito) com a dica em tooltip ao passar o mouse. */
function FieldInfoIcon({ text }: { text: string }) {
  return (
    <span className="group/field-info absolute inset-y-0 right-0 z-10 flex items-center pr-2.5">
      <button
        type="button"
        tabIndex={-1}
        className="inline-flex text-gray-400 transition-colors hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
        aria-label={text}
      >
        <Info className="h-3.5 w-3.5" aria-hidden />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute bottom-full right-0 z-30 mb-1.5 w-max max-w-[16rem] rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-left text-[11px] font-normal leading-relaxed text-gray-700 opacity-0 shadow-lg transition-opacity duration-150 group-hover/field-info:visible group-hover/field-info:opacity-100 group-focus-within/field-info:visible group-focus-within/field-info:opacity-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
      >
        {text}
      </span>
    </span>
  );
}

function getSituacaoContrato(startDate: string, endDate: string): { label: string; className: string } {
  const toDay = (v: string) => {
    const m = String(v ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12).getTime() : NaN;
  };
  const hoje = Date.now();
  const ini = toDay(startDate);
  const fim = toDay(endDate);
  if (!Number.isNaN(ini) && hoje < ini) {
    return { label: 'A iniciar', className: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300' };
  }
  if (!Number.isNaN(fim) && hoje > fim + 24 * 60 * 60 * 1000) {
    return { label: 'Encerrado', className: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300' };
  }
  return { label: 'Vigente', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' };
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value);
}

function formatCurrencyInput(value: number | string): string {
  if (value === '' || value === null || value === undefined) return '';
  const num = typeof value === 'string' ? parseFloat(value.replace(/\./g, '').replace(',', '.')) : value;
  if (isNaN(num)) return '';
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseCurrencyInput(value: string): number {
  if (!value || typeof value !== 'string') return 0;
  const cleaned = value.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseYmdLocal(value: string): Date | null {
  if (!value) return null;
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function calendarMonthInVigencia(
  calendarYear: number,
  calendarMonth1to12: number,
  contractStart: Date,
  contractEnd: Date
): boolean {
  const ms = new Date(calendarYear, calendarMonth1to12 - 1, 1, 12, 0, 0, 0);
  const me = new Date(calendarYear, calendarMonth1to12, 0, 12, 0, 0, 0);
  return ms.getTime() < contractEnd.getTime() && me.getTime() >= contractStart.getTime();
}

function countVigenciaMonths(startDate: string, endDate: string): number {
  const start = parseYmdLocal(startDate);
  const end = parseYmdLocal(endDate);
  if (!start || !end || end.getTime() <= start.getTime()) return 0;
  let n = 0;
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1, 12, 0, 0, 0);
  const endCursor = new Date(end.getFullYear(), end.getMonth(), 1, 12, 0, 0, 0);
  while (cursor.getTime() <= endCursor.getTime()) {
    const y = cursor.getFullYear();
    const m = cursor.getMonth() + 1;
    if (calendarMonthInVigencia(y, m, start, end)) n += 1;
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return n;
}

/** Valor anual por ano civil: proporcional aos meses da vigência naquele ano. */
function getValorAnualPorAno(
  valuePlusAddenda: number,
  startDate: string,
  endDate: string
): Array<{ year: number; months: number; value: number }> {
  const start = parseYmdLocal(startDate);
  const end = parseYmdLocal(endDate);
  if (!start || !end || end.getTime() <= start.getTime()) return [];
  const totalMonths = countVigenciaMonths(startDate, endDate);
  if (totalMonths <= 0 || !Number.isFinite(valuePlusAddenda)) return [];
  const monthly = valuePlusAddenda / totalMonths;
  const rows: Array<{ year: number; months: number; value: number }> = [];
  for (let y = start.getFullYear(); y <= end.getFullYear(); y++) {
    let months = 0;
    for (let m = 1; m <= 12; m++) {
      if (calendarMonthInVigencia(y, m, start, end)) months += 1;
    }
    if (months > 0) rows.push({ year: y, months, value: monthly * months });
  }
  return rows;
}

function ContractAccessCheckbox({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label className={`inline-flex select-none items-center gap-2.5 ${disabled ? 'cursor-not-allowed opacity-50' : 'group cursor-pointer'}`}>
      <div className="relative shrink-0">
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => !disabled && onChange(e.target.checked)}
        />
        <div
          className={`flex h-[18px] w-[18px] items-center justify-center rounded border transition-colors duration-150 ${
            checked
              ? 'border-red-600 bg-red-600 dark:border-red-500 dark:bg-red-500'
              : 'border-gray-300 bg-white dark:border-gray-500 dark:bg-gray-800 group-hover:border-gray-400 dark:group-hover:border-gray-400'
          }`}
        >
          {checked && (
            <svg className="h-2.5 w-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </div>
      </div>
      <span className={`min-w-[1.75rem] text-sm font-medium tabular-nums ${checked ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'}`}>
        {checked ? 'Sim' : 'Não'}
      </span>
    </label>
  );
}


/** Percentual vindo da API (número ou "10.00") para o campo do formulário ("10", "28,35"). */
function formatPercentInput(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return '';
  return String(n).replace('.', ',');
}

/** '' → null (sem padrão); inválido → NaN. */
function parsePercentField(v: string): number | null {
  const t = String(v ?? '').trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

export default function ContratosPage() {
  const router = useRouter();
  const {
    isAdministrator,
    isElevatedUser,
    isLoading: loadingPermissions,
    can,
    canAction,
    permissions,
    canAccessContract,
    allowedContractIds,
  } = usePermissions();
  const queryClient = useQueryClient();
  const { pendingByContractId } = useMensalReportPendingCount(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [contractActionMenu, setContractActionMenu] = useState<{
    contractId: string;
    top: number;
    left: number;
  } | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    number: '',
    startDate: '',
    endDate: '',
    costCenterId: '',
    valuePlusAddenda: '',
    allowBillingImportWithoutOsPleito: false,
    orcafascioClientId: '',
    defaultBdiPercent: '',
    defaultDiscountPercent: '',
    defaultTituloFundo: '',
    reajustes: [] as Array<{ nome: string; percentual: string }>,
  });
  const [showDeleteModal, setShowDeleteModal] = useState<string | null>(null);
  const [permissionsContract, setPermissionsContract] = useState<Contract | null>(null);
  const [permissionsTarget, setPermissionsTarget] = useState<PermissionsTargetPreview | null>(null);
  const [permissionTab, setPermissionTab] = useState<PermissionEditorTab>('gerais');
  const [showContractsTab, setShowContractsTab] = useState(false);
  const [contractUsersSearch, setContractUsersSearch] = useState('');

  const closePermissionsEditor = () => {
    setPermissionsTarget(null);
    setPermissionTab('gerais');
    setShowContractsTab(false);
  };
  const canCreateContrato = isElevatedUser || permissions.canCreateContracts;
  const canEditContrato = isElevatedUser || permissions.canEditContracts;
  const canDeleteContrato = isElevatedUser || permissions.canDeleteContracts;
  const canManageUserPermissions =
    isAdministrator ||
    can(pk('/ponto/controle/alterar-permissoes')) ||
    canAction(pk('/ponto/controle/alterar-permissoes'), 'ver');
  /** Sempre exibe a coluna (ao menos «Ver detalhes»); criar/editar/excluir só com a ação marcada. */
  const showActionsColumn = true;

  const openContractDetails = useCallback(
    (contractId: string) => {
      router.push(`/ponto/contratos/${contractId}`);
    },
    [router]
  );

  const tableColSpan = showActionsColumn ? 8 : 7;

  const { costCenters, isLoading: loadingCostCenters } = useCostCenters();
  const costCentersList = (Array.isArray(costCenters) ? costCenters : []) as CostCenter[];

  const handleLogout = useLogout();

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    }
  });

  const { data: contractsData, isLoading: loadingContracts } = useQuery({
    queryKey: ['contracts', searchTerm],
    queryFn: async () => {
      const res = await api.get('/contracts', {
        params: { search: searchTerm || undefined, limit: 100 }
      });
      return res.data;
    }
  });

  const { data: contractUsers = [], isLoading: loadingContractUsers } = useQuery({
    queryKey: ['permission-contract-users', permissionsContract?.id],
    queryFn: async () =>
      (await api.get('/permissions/contract-users', { params: { contractId: permissionsContract?.id } })).data
        ?.data as ContractPermissionUser[],
    enabled: !!permissionsContract?.id,
    retry: false,
  });

  const toggleContractAccessMutation = useMutation({
    mutationFn: async ({ userId, allow }: { userId: string; allow: boolean }) => {
      if (!permissionsContract?.id) return;
      const source = (await api.get(`/permissions/users/${userId}`)).data?.data as UserPermissionPayload;
      if (!source || source.isAdmin) {
        throw new Error('Usuário inválido para edição.');
      }

      // Liberado no contrato não concede o módulo Contratos (página/ficha).
      const nextPermissions = Array.isArray(source.permissions) ? [...source.permissions] : [];

      const currentIds = new Set(source.allowedContractIds || []);
      if (allow) currentIds.add(permissionsContract.id);
      else currentIds.delete(permissionsContract.id);

      await api.put(`/permissions/users/${userId}`, {
        permissions: nextPermissions,
        allowedContractIds: Array.from(currentIds),
      });
      return { userId, allow };
    },
    onSuccess: (data) => {
      if (!data) return;
      const { userId, allow } = data;
      queryClient.setQueryData(['permission-contract-users', permissionsContract?.id], (prev: unknown) => {
        if (!Array.isArray(prev)) return prev;
        return (prev as ContractPermissionUser[]).map((u) =>
          u.id === userId ? { ...u, hasContractAccess: allow } : u
        );
      });
      toast.success(allow ? 'Contrato liberado para o usuário.' : 'Contrato removido para o usuário.');
    },
    onError: (error: unknown) => {
      const msg =
        error && typeof error === 'object' && 'response' in error
          ? (error as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || 'Não foi possível atualizar acesso ao contrato.');
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/contracts', data);
      return res.data;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['permission-contracts-list'] });
      /** Novo contrato entra em allowedContractIds no backend; sem refetch o ProtectedRoute nega o acesso até F5. */
      await queryClient.refetchQueries({ queryKey: ['me-permissions'] });
      setShowForm(false);
      resetForm();
      toast.success('Contrato criado com sucesso!');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao criar contrato');
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await api.patch(`/contracts/${id}`, data);
      return res.data;
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['permission-contracts-list'] });
      setPermissionsContract((prev) =>
        prev && prev.id === variables.id
          ? {
              ...prev,
              ...variables.data,
            }
          : prev
      );
      setShowForm(false);
      setEditingContract(null);
      resetForm();
      toast.success('Contrato atualizado com sucesso!');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao atualizar contrato');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/contracts/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contracts'] });
      queryClient.invalidateQueries({ queryKey: ['permission-contracts-list'] });
      setShowDeleteModal(null);
      toast.success('Contrato excluído com sucesso!');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.message || 'Erro ao excluir contrato');
    }
  });

  const resetForm = () => {
    setFormData({
      name: '',
      number: '',
      startDate: '',
      endDate: '',
      costCenterId: '',
      valuePlusAddenda: '',
      allowBillingImportWithoutOsPleito: false,
      orcafascioClientId: '',
      defaultBdiPercent: '',
      defaultDiscountPercent: '',
      defaultTituloFundo: '',
      reajustes: [],
    });
    setEditingContract(null);
  };

  const handleEdit = (contract: Contract) => {
    if (!canEditContrato) {
      toast.error('Você não tem permissão para editar contratos.');
      return;
    }
    setEditingContract(contract);
    setFormData({
      name: contract.name,
      number: contract.number,
      startDate: contract.startDate ? contract.startDate.split('T')[0] : '',
      endDate: contract.endDate ? contract.endDate.split('T')[0] : '',
      costCenterId: contract.costCenterId,
      valuePlusAddenda: contract.valuePlusAddenda ? formatCurrencyInput(contract.valuePlusAddenda) : '',
      allowBillingImportWithoutOsPleito: Boolean(contract.allowBillingImportWithoutOsPleito),
      orcafascioClientId:
        contract.orcafascioClientId?.trim() ||
        resolveOrcafascioClientIdForContractName(contract.name) ||
        '',
      defaultBdiPercent: formatPercentInput(contract.defaultBdiPercent),
      defaultDiscountPercent: formatPercentInput(contract.defaultDiscountPercent),
      defaultTituloFundo: contract.defaultTituloFundo || '',
      reajustes: Array.isArray(contract.defaultReajustes)
        ? contract.defaultReajustes.map((r) => ({
            nome: String(r?.nome ?? ''),
            percentual: String(r?.percentual ?? ''),
          }))
        : [],
    });
    setShowForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingContract && !canEditContrato) {
      toast.error('Você não tem permissão para editar contratos.');
      return;
    }
    if (!editingContract && !canCreateContrato) {
      toast.error('Você não tem permissão para criar contratos.');
      return;
    }
    if (!formData.name.trim()) {
      toast.error('Nome do contrato é obrigatório');
      return;
    }
    if (!formData.number.trim()) {
      toast.error('Número do contrato é obrigatório');
      return;
    }
    if (!formData.startDate) {
      toast.error('Data de início da vigência é obrigatória');
      return;
    }
    if (!formData.endDate) {
      toast.error('Data de fim da vigência é obrigatória');
      return;
    }
    if (!formData.costCenterId) {
      toast.error('Centro de custo é obrigatório');
      return;
    }
    const parsedValue = parseCurrencyInput(formData.valuePlusAddenda);
    if (!formData.valuePlusAddenda || parsedValue === 0) {
      toast.error('Valor mais aditivos é obrigatório');
      return;
    }
    const orcafascioClientId =
      String(formData.orcafascioClientId || '').trim() ||
      resolveOrcafascioClientIdForContractName(formData.name) ||
      '';
    if (orcafascioClientId && !/^[a-f0-9]{24}$/i.test(orcafascioClientId)) {
      toast.error('Código do cliente Orçafascio inválido. Cole o código de 24 caracteres do cliente.');
      return;
    }

    const bdiPadrao = parsePercentField(formData.defaultBdiPercent);
    const descontoPadrao = parsePercentField(formData.defaultDiscountPercent);
    if (Number.isNaN(bdiPadrao) || Number.isNaN(descontoPadrao)) {
      toast.error('BDI e desconto padrão devem ser percentuais válidos (ex.: 28,35).');
      return;
    }

    const reajustesPadrao = formData.reajustes
      .map((r) => ({ nome: r.nome.trim(), percentual: r.percentual.trim() }))
      .filter((r) => r.nome || r.percentual);
    if (reajustesPadrao.some((r) => r.percentual && Number.isNaN(parsePercentField(r.percentual)))) {
      toast.error('Os reajustes devem ter percentuais válidos (ex.: 5,5).');
      return;
    }

    const payload = {
      name: formData.name.trim(),
      number: formData.number.trim(),
      startDate: formData.startDate,
      endDate: formData.endDate,
      costCenterId: formData.costCenterId,
      valuePlusAddenda: parsedValue,
      allowBillingImportWithoutOsPleito: Boolean(formData.allowBillingImportWithoutOsPleito),
      orcafascioClientId,
      defaultBdiPercent: bdiPadrao,
      defaultDiscountPercent: descontoPadrao,
      defaultTituloFundo: formData.defaultTituloFundo.trim(),
      defaultReajustes: reajustesPadrao,
    };

    if (editingContract) {
      updateMutation.mutate({ id: editingContract.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleDelete = (id: string) => {
    if (!canDeleteContrato) {
      toast.error('Você não tem permissão para excluir contratos.');
      return;
    }
    deleteMutation.mutate(id);
  };

  const contracts = useMemo(() => {
    const list = (contractsData?.data || []) as Contract[];
    const visible = isElevatedUser
      ? list
      : loadingPermissions || allowedContractIds.length === 0
        ? []
        : list.filter((c) => canAccessContract(c.id));
    return [...visible].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', 'pt-BR', { sensitivity: 'base' })
    );
  }, [contractsData?.data, isElevatedUser, loadingPermissions, allowedContractIds, canAccessContract]);
  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };
  const totalFiltered = contracts.length;
  const startItem = totalFiltered > 0 ? 1 : 0;
  const endItem = totalFiltered;

  const contractForActionMenu = contractActionMenu
    ? contracts.find((c: Contract) => c.id === contractActionMenu.contractId) || null
    : null;
  const usersWithContractsModule = useMemo(
    () => (contractUsers || []).filter((u) => u.hasContractsModule),
    [contractUsers]
  );

  const filteredContractUsers = useMemo(() => {
    const q = contractUsersSearch.trim().toLowerCase();
    if (!q) return usersWithContractsModule;
    const qDigits = q.replace(/\D/g, '');
    return usersWithContractsModule.filter((u) => {
      const name = (u.name || '').toLowerCase();
      const email = (u.email || '').toLowerCase();
      const dept = (u.employee?.department || '').toLowerCase();
      const pos = (u.employee?.position || '').toLowerCase();
      const cpfDigits = (u.cpf || '').replace(/\D/g, '');
      if (name.includes(q) || email.includes(q) || dept.includes(q) || pos.includes(q)) return true;
      if (qDigits.length >= 2 && cpfDigits.includes(qDigits)) return true;
      return false;
    });
  }, [usersWithContractsModule, contractUsersSearch]);

  useEffect(() => {
    setContractUsersSearch('');
  }, [permissionsContract?.id]);

  if (loadingUser) {
    return (
      <ProtectedRoute route="/ponto/contratos">
        <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute route="/ponto/contratos">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <PageStack className="w-full">
          {permissionsContract ? (
            permissionsTarget ? (
              <PageStack className="w-full">
                <div className="relative flex min-h-[3.25rem] items-center justify-center py-1">
                  <button
                    type="button"
                    onClick={closePermissionsEditor}
                    className="absolute left-0 top-1/2 z-10 inline-flex -translate-y-1/2 items-center gap-2 rounded-lg px-1 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                  >
                    <ArrowLeft className="h-4 w-4 shrink-0" />
                    Voltar
                  </button>
                  <div className="w-full max-w-3xl px-14 text-center sm:px-20">
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-3xl">
                      Permissões de funcionário
                    </h1>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
                      Defina o que este colaborador pode acessar no sistema
                    </p>
                  </div>
                </div>
                <UserPermissionsTabBar
                  activeTab={permissionTab}
                  onChange={setPermissionTab}
                  showContracts={showContractsTab}
                  className="w-full pb-2"
                />
                <UserPermissionsEditor
                  userId={permissionsTarget.id}
                  preview={permissionsTarget}
                  onBack={closePermissionsEditor}
                  hideTopNavigation
                  permissionTab={permissionTab}
                  onPermissionTabChange={setPermissionTab}
                  onContractsTabAvailabilityChange={setShowContractsTab}
                />
              </PageStack>
            ) : (
              <PageStack className="w-full">
                <div className="relative flex min-h-[3.25rem] items-center justify-center py-1">
                  <button
                    type="button"
                    onClick={() => setPermissionsContract(null)}
                    className="absolute left-0 top-1/2 z-10 inline-flex -translate-y-1/2 items-center gap-2 rounded-lg px-1 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-400 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                  >
                    <ArrowLeft className="h-4 w-4 shrink-0" />
                    Voltar
                  </button>
                  <div className="w-full max-w-3xl px-14 text-center sm:px-20">
                    <h1 className="text-2xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-3xl">
                      Permissões do contrato
                    </h1>
                    <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
                      Defina quais usuários podem acessar o contrato selecionado
                    </p>
                  </div>
                </div>

                <Card
                  className="relative w-full overflow-hidden border-gray-200/80 shadow-sm dark:border-gray-700/80"
                  padding="none"
                >
                  <div className="border-b border-gray-200 bg-white px-4 py-5 dark:border-gray-700 dark:bg-gray-800 sm:px-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
                      <div className="flex min-w-0 items-start gap-4 sm:items-center">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-blue-500 bg-white text-sm font-bold text-blue-600 dark:border-blue-400 dark:bg-gray-800 dark:text-blue-400">
                          {permissionsContract.name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                            .slice(0, 2)
                            .toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                            {permissionsContract.name}
                          </h2>
                          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                            <span className="text-gray-700 dark:text-gray-300">
                              {usersWithContractsModule.length}{' '}
                              {usersWithContractsModule.length === 1
                                ? 'usuário com módulo de contratos'
                                : 'usuários com módulo de contratos'}
                            </span>
                            {contractUsersSearch.trim() && usersWithContractsModule.length > 0 ? (
                              <span className="text-gray-500 dark:text-gray-400">
                                {' · '}
                                {filteredContractUsers.length}{' '}
                                {filteredContractUsers.length === 1 ? 'resultado' : 'resultados'}
                              </span>
                            ) : null}
                          </p>
                        </div>
                      </div>
                      <div className="flex w-full shrink-0 flex-col gap-2 sm:max-w-sm sm:flex-row sm:items-center sm:justify-end">
                        <div className="relative w-full sm:max-w-xs">
                          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                          <input
                            type="search"
                            value={contractUsersSearch}
                            onChange={(e) => setContractUsersSearch(e.target.value)}
                            placeholder="Buscar colaborador…"
                            autoComplete="off"
                            className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500/30 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:placeholder:text-gray-500"
                            aria-label="Buscar colaborador na lista"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white px-4 pb-6 dark:bg-gray-800 sm:px-6">
                    <div className="table-scroll pt-4 first:pt-4">
                      <table className="w-full min-w-[640px] table-fixed text-sm">
                        <thead>
                          <tr className="border-b border-gray-100 align-bottom dark:border-gray-700/80">
                            <th
                              scope="col"
                              className="w-[46%] pb-3 pl-1 pr-4 text-left text-lg font-bold leading-tight tracking-tight text-gray-900 dark:text-gray-100"
                            >
                              Usuário
                            </th>
                            <th
                              scope="col"
                              className="w-[34%] pb-3 pl-1 pr-4 text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 dark:text-gray-500"
                            >
                              Setor
                            </th>
                            <th
                              scope="col"
                              className="w-[20%] px-1 pb-3 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 dark:text-gray-500"
                            >
                              Liberado
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                          {loadingContractUsers ? (
                            <tr>
                              <td colSpan={3} className="py-14 text-center text-sm text-gray-500 dark:text-gray-400">
                                Carregando usuários...
                              </td>
                            </tr>
                          ) : usersWithContractsModule.length === 0 ? (
                            <tr>
                              <td colSpan={3} className="py-14 text-center text-sm text-gray-500 dark:text-gray-400">
                                Nenhum usuário com módulo de contratos disponível para este contrato.
                              </td>
                            </tr>
                          ) : filteredContractUsers.length === 0 ? (
                            <tr>
                              <td colSpan={3} className="py-14 text-center text-sm text-gray-500 dark:text-gray-400">
                                Nenhum colaborador encontrado com essa busca. Tente nome, e-mail, setor ou CPF.
                              </td>
                            </tr>
                          ) : (
                            filteredContractUsers.map((u) => (
                              <tr
                                key={u.id}
                                onClick={() => {
                                  setShowContractsTab(false);
                                  setPermissionsTarget({
                                    id: u.id,
                                    name: u.name,
                                    email: u.email || '',
                                    position: u.employee?.position ?? undefined,
                                  });
                                  setPermissionTab('contratos');
                                }}
                                className="cursor-pointer transition-colors hover:bg-gray-50/90 dark:hover:bg-gray-700/25"
                              >
                                <td className="py-3.5 pl-1 pr-4 align-middle">
                                  <div className="text-sm font-medium leading-snug text-gray-900 dark:text-gray-100">
                                    {u.name}
                                  </div>
                                  {u.cpf ? (
                                    <div className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{u.cpf}</div>
                                  ) : null}
                                </td>
                                <td className="py-3.5 pl-1 pr-4 text-sm text-gray-700 dark:text-gray-300">
                                  {u.employee?.department || '-'}
                                </td>
                                <td
                                  className="px-1 py-3.5 text-center align-middle"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="flex justify-center">
                                    <ContractAccessCheckbox
                                      checked={!!u.hasContractAccess}
                                      disabled={toggleContractAccessMutation.isPending}
                                      onChange={(next) => {
                                        toggleContractAccessMutation.mutate({ userId: u.id, allow: next });
                                      }}
                                    />
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </Card>
              </PageStack>
            )
          )
          : (
          <>
          <ListPageHeader
            title="Contratos"
            description="Consulte e gerencie os contratos."
          />

          <Card>
            <CardHeader className="border-b-0 pb-1">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center">
                  <div className="p-2 sm:p-3 bg-red-100 dark:bg-red-900/30 rounded-lg flex-shrink-0">
                    <FileText className="w-6 h-6 text-red-600 dark:text-red-400" />
                  </div>
                  <div className="ml-3 sm:ml-4 min-w-0">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      Contratos
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {contracts.length} {contracts.length === 1 ? 'contrato' : 'contratos'} cadastrado(s)
                    </p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[240px] sm:w-[280px] sm:flex-none">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      placeholder="Buscar por nome ou número..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </div>
                  {canCreateContrato && (
                    <button
                      onClick={() => {
                        if (!canCreateContrato) {
                          toast.error('Você não tem permissão para criar contratos.');
                          return;
                        }
                        resetForm();
                        setShowForm(true);
                      }}
                      className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                    >
                      <Plus className="w-4 h-4" />
                      Novo Contrato
                    </button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                <span>
                  Mostrando {startItem} a {endItem} de {totalFiltered} contratos
                </span>
                <span>Página 1 de 1</span>
              </div>
              <div className="table-scroll">
                <table className="w-full table-fixed text-sm">
                  <thead className="border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="px-3 sm:px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-left w-[26%] min-w-[200px]">
                        Contrato
                      </th>
                      <th className="px-3 sm:px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center w-[10%]">
                        Início
                      </th>
                      <th className="px-3 sm:px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center w-[10%]">
                        Término
                      </th>
                      <th className="px-3 sm:px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center w-[11%]">
                        Situação
                      </th>
                      <th className="px-3 sm:px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-center w-[15%]">
                        Centro de Custo
                      </th>
                      <th className="px-3 sm:px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right w-[14%]">
                        Valor + Aditivos
                      </th>
                      <th className="px-3 sm:px-6 py-4 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider text-right w-[14%]">
                        Valor no Ano
                      </th>
                      {showActionsColumn && (
                        <th className={listTableRowClasses.actionTh}>
                          Ação
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {loadingContracts ? (
                      <tr>
                        <td colSpan={tableColSpan} className="px-6 py-8 text-center">
                          <CadastroListLoading message="Carregando contratos..." />
                        </td>
                      </tr>
                    ) : contracts.length === 0 ? (
                      <tr>
                        <td colSpan={tableColSpan} className="px-6 py-8 text-center">
                          <div className="text-gray-500 dark:text-gray-400">
                            <p>Nenhum contrato encontrado.</p>
                            <p className="text-sm mt-1">
                              Cadastre um novo contrato para começar.
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      contracts.map((c: Contract) => (
                        <tr
                          key={c.id}
                          onClick={() => openContractDetails(c.id)}
                          className={getListTableRowClassName(true)}
                          aria-label={`Abrir detalhes do contrato ${c.name}`}
                        >
                          <td className="min-w-0 overflow-hidden px-3 py-3 align-middle text-left sm:px-6">
                            <div className="flex min-w-0 items-stretch gap-3">
                              {/^#[0-9a-f]{6}$/i.test(c.defaultTituloFundo ?? '') ? (
                                <span
                                  aria-hidden
                                  className="w-1.5 shrink-0 self-stretch rounded-full"
                                  style={{ backgroundColor: c.defaultTituloFundo ?? undefined }}
                                />
                              ) : null}
                              <div className="min-w-0 flex-1">
                            <div className="flex min-w-0 items-center gap-2">
                              <ListRowNavigableLabel className="font-medium break-words whitespace-normal">
                                {c.name}
                                {pendingByContractId.has(c.id) ? (
                                  <span className="ml-2 inline-block align-middle">
                                    <NotificationCountBadge count={1} inline />
                                  </span>
                                ) : null}
                              </ListRowNavigableLabel>
                            </div>
                            <span
                              className="mt-0.5 block break-all font-mono text-xs text-gray-500 dark:text-gray-400"
                              title={c.number}
                            >
                              {c.number}
                            </span>
                              </div>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-center text-sm text-gray-700 dark:text-gray-300 sm:px-6">
                            {formatDate(c.startDate)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-center text-sm text-gray-700 dark:text-gray-300 sm:px-6">
                            {formatDate(c.endDate)}
                          </td>
                          <td className="px-3 py-3 text-center sm:px-6">
                            {(() => {
                              const sit = getSituacaoContrato(c.startDate, c.endDate);
                              return (
                                <span
                                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${sit.className}`}
                                >
                                  {sit.label}
                                </span>
                              );
                            })()}
                          </td>
                          <td
                            className="min-w-0 overflow-hidden px-3 py-3 text-center text-sm text-gray-700 dark:text-gray-300 sm:px-6"
                            title={c.costCenter?.name || c.costCenter?.code || '-'}
                          >
                            <span className="block truncate">
                              {c.costCenter?.name || c.costCenter?.code || '-'}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-medium text-gray-900 dark:text-gray-100 sm:px-6">
                            {formatCurrency(c.valuePlusAddenda)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right text-sm text-gray-700 dark:text-gray-300 sm:px-6">
                            {(() => {
                              const rows = getValorAnualPorAno(c.valuePlusAddenda, c.startDate, c.endDate);
                              if (!rows.length) return '-';
                              const anoAtual = new Date().getFullYear();
                              const atual =
                                rows.find((r) => r.year === anoAtual) ??
                                rows.find((r) => r.year > anoAtual) ??
                                rows[rows.length - 1];
                              const todos = rows.map((r) => `${r.year}: ${formatCurrency(r.value)}`).join('\n');
                              return (
                                <span title={todos}>
                                  {formatCurrency(atual.value)}
                                  {rows.length > 1 ? (
                                    <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">
                                      ({atual.year})
                                    </span>
                                  ) : null}
                                </span>
                              );
                            })()}
                          </td>
                          {showActionsColumn && (
                            <td
                              className={listTableRowClasses.actionTd}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                    setContractActionMenu((prev) => {
                                      if (prev?.contractId === c.id) return null;
                                      let left = r.right - CONTRACT_ACTION_MENU_WIDTH_PX;
                                      left = Math.max(
                                        8,
                                        Math.min(left, window.innerWidth - CONTRACT_ACTION_MENU_WIDTH_PX - 8)
                                      );
                                      return { contractId: c.id, top: r.bottom + 4, left };
                                    });
                                  }}
                                  className={rowActionMenuButtonClass(contractActionMenu?.contractId === c.id)}
                                  aria-label="Abrir ações"
                                  aria-expanded={contractActionMenu?.contractId === c.id}
                                  aria-haspopup="menu"
                                >
                                  <MoreVertical className="h-4 w-4" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {contractActionMenu && contractForActionMenu && (
                <ActionMenuOverlay
                  open
                  onClose={() => setContractActionMenu(null)}
                  top={contractActionMenu.top}
                  left={contractActionMenu.left}
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      setContractActionMenu(null);
                      openContractDetails(contractForActionMenu.id);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <Eye className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                    <span>Ver detalhes</span>
                  </button>
                  {canEditContrato && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={(e) => {
                        e.stopPropagation();
                        setContractActionMenu(null);
                        handleEdit(contractForActionMenu);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 border-t border-gray-200 dark:border-gray-700"
                    >
                      <Pencil className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                      <span>Editar contrato</span>
                    </button>
                  )}
                  {canDeleteContrato && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={(e) => {
                        e.stopPropagation();
                        setContractActionMenu(null);
                        setShowDeleteModal(contractForActionMenu.id);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 border-t border-gray-200 dark:border-gray-700"
                    >
                      <Trash2 className="w-4 h-4 text-red-600 dark:text-red-400 shrink-0" />
                      <span>Excluir contrato</span>
                    </button>
                  )}
                  {canManageUserPermissions && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={(e) => {
                        e.stopPropagation();
                        setContractActionMenu(null);
                        setPermissionsContract(contractForActionMenu);
                        setPermissionsTarget(null);
                        setPermissionTab('gerais');
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 border-t border-gray-200 dark:border-gray-700"
                    >
                      <Shield className="w-4 h-4 text-gray-600 dark:text-gray-400 shrink-0" />
                      <span>Gerenciar permissões</span>
                    </button>
                  )}
                </ActionMenuOverlay>
              )}
            </CardContent>
          </Card>
          </>
          )}
        </PageStack>

        {/* Modal Criar/Editar */}
        {showForm && (
          <ContractFormModal
            isOpen={showForm}
            onClose={() => {
              setShowForm(false);
              resetForm();
            }}
            editingContract={editingContract}
            formData={formData}
            setFormData={setFormData}
            onSubmit={handleSubmit}
            createMutation={createMutation}
            updateMutation={updateMutation}
            costCenters={costCentersList}
            loadingCostCenters={loadingCostCenters}
          />
        )}

        {/* Modal Exclusão */}
        {showDeleteModal && (
          <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setShowDeleteModal(null)}
            />
            <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
              <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-red-100 dark:bg-red-900/30 rounded-full">
                <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 text-center mb-2">
                Excluir Contrato?
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 text-center mb-6">
                Tem certeza que deseja excluir este contrato? Esta ação não pode ser desfeita.
              </p>
              <div className="flex items-center justify-center space-x-3">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(null)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(showDeleteModal)}
                  disabled={deleteMutation.isPending}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors text-sm"
                >
                  {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
                </button>
              </div>
            </div>
          </AppModalOverlay>
        )}
      </MainLayout>
    </ProtectedRoute>
  );
}

function ContractFormModal({
  isOpen,
  onClose,
  editingContract,
  formData,
  setFormData,
  onSubmit,
  createMutation,
  updateMutation,
  costCenters,
  loadingCostCenters
}: {
  isOpen: boolean;
  onClose: () => void;
  editingContract: Contract | null;
  formData: any;
  setFormData: React.Dispatch<React.SetStateAction<any>>;
  onSubmit: (e: React.FormEvent) => void;
  createMutation: any;
  updateMutation: any;
  costCenters: CostCenter[];
  loadingCostCenters: boolean;
}) {
  const ccList = Array.isArray(costCenters) ? costCenters : [];

  const costCenterSelectOptions = useMemo(
    () =>
      labeledToSelectOptions(
        ccList.map((cc) => {
          const label = `${cc.code ? `${cc.code} - ` : ''}${cc.name || 'Sem nome'}`;
          return { value: cc.id, label, searchText: label };
        })
      ),
    [ccList]
  );

  const closeForm = useCallback(() => {
    onClose();
  }, [onClose]);

  const { requestClose, confirmUi } = useModalCloseConfirm(closeForm, { isParentOpen: isOpen });

  if (!isOpen) return null;

  return (
    <>
    <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2000] flex items-center justify-center bg-black bg-opacity-50">
      <div className="absolute inset-0" onClick={requestClose} />
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] flex flex-col overflow-hidden">
        <div className="shrink-0 px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-white dark:bg-gray-800">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {editingContract ? 'Editar Contrato' : 'Cadastrar Contrato'}
          </h3>
          <button
            onClick={requestClose}
            className="p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-600 dark:text-gray-400"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-8 overflow-y-auto p-6">
            <section className="space-y-4">
              <div className="border-b border-gray-200 pb-2 dark:border-gray-700">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Dados do contrato</h4>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Identificação, vigência e centro de custo.</p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Nome do Contrato *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    const previousAuto = resolveOrcafascioClientIdForContractName(formData.name) || '';
                    const nextAuto = resolveOrcafascioClientIdForContractName(name) || '';
                    const current = String(formData.orcafascioClientId || '').trim();
                    const keepTyped = Boolean(current && current !== previousAuto);
                    setFormData({
                      ...formData,
                      name,
                      orcafascioClientId: keepTyped ? current : nextAuto,
                    });
                  }}
                  className="h-10 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="Digite o nome do contrato"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Número do Contrato *
                </label>
                <input
                  type="text"
                  required
                  value={formData.number}
                  onChange={(e) => setFormData({ ...formData, number: e.target.value })}
                  className="h-10 w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="Digite o número do contrato"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Início da Vigência *
                </label>
                <DatePickerField
                  value={formData.startDate}
                  onChange={(startDate) => setFormData({ ...formData, startDate })}
                  placeholder="dd/mm/aaaa"
                  aria-label="Início da vigência"
                  className="w-full"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Fim da Vigência *
                </label>
                <DatePickerField
                  value={formData.endDate}
                  onChange={(endDate) => setFormData({ ...formData, endDate })}
                  placeholder="dd/mm/aaaa"
                  aria-label="Fim da vigência"
                  className="w-full"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Centro de Custo *
                </label>
                <StringSingleSelectDropdown
                  value={formData.costCenterId || ''}
                  onChange={(costCenterId) => setFormData({ ...formData, costCenterId })}
                  options={costCenterSelectOptions}
                  allowEmpty={false}
                  disabled={loadingCostCenters}
                  placeholder={loadingCostCenters ? 'Carregando...' : 'Selecione o centro de custo'}
                  searchPlaceholder="Pesquisar centro de custo..."
                  emptyOptionsMessage="Nenhum centro de custo disponível."
                  className="w-full"
                />
              </div>
              </div>
            </section>
            <section className="space-y-4">
              <div className="border-b border-gray-200 pb-2 dark:border-gray-700">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Valores</h4>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Valor total com aditivos e o rateio por ano.</p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Valor mais Aditivos *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 font-medium">
                    R$
                  </span>
                  <input
                    type="text"
                    required
                    value={formData.valuePlusAddenda}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, '');
                      const formatted = v
                        ? (Number(v) / 100).toLocaleString('pt-BR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })
                        : '';
                      setFormData({ ...formData, valuePlusAddenda: formatted });
                    }}
                    className="h-10 w-full pl-12 pr-9 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                    placeholder="0,00"
                  />
                  <FieldInfoIcon text="Digite apenas números. Ex: 1500000 = R$ 15.000,00" />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Valor mais Aditivos Anual
                </label>
                {(() => {
                  const valor = parseCurrencyInput(formData.valuePlusAddenda);
                  const rows = getValorAnualPorAno(valor, formData.startDate, formData.endDate);
                  const totalMonths = countVigenciaMonths(formData.startDate, formData.endDate);
                  if (!rows.length) {
                    return (
                      <>
                        <div className="relative flex h-10 items-center pl-3 pr-9 border border-gray-200 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-sm text-gray-400 dark:text-gray-500">
                          Preencha o valor e a vigência
                          <FieldInfoIcon text="Rateio proporcional aos meses de cada ano." />
                        </div>
                      </>
                    );
                  }
                  const monthly = totalMonths > 0 ? valor / totalMonths : 0;
                  return (
                    <>
                      <div className="relative space-y-1.5 rounded-lg border border-gray-200 bg-gray-50 py-2.5 pl-3 pr-9 dark:border-gray-600 dark:bg-gray-700/50">
                        <FieldInfoIcon text="Calculado automaticamente: Valor ÷ meses × meses de cada ano." />
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {formatCurrency(monthly)}/mês × {totalMonths}{' '}
                          {totalMonths === 1 ? 'mês' : 'meses'}
                        </p>
                        {rows.map((r) => (
                          <div
                            key={r.year}
                            className="flex items-center justify-between gap-3 text-sm font-medium text-gray-900 dark:text-gray-100"
                          >
                            <span className="text-gray-600 dark:text-gray-300">
                              {r.year}{' '}
                              <span className="font-normal text-gray-400 dark:text-gray-500">
                                ({r.months} {r.months === 1 ? 'mês' : 'meses'})
                              </span>
                            </span>
                            <span>{formatCurrency(r.value)}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </div>
              </div>
            </section>
            <section className="space-y-4">
              <div className="border-b border-gray-200 pb-2 dark:border-gray-700">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Orçamentos</h4>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Padrões aplicados automaticamente nos orçamentos deste contrato.</p>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Código do cliente Orçafascio
                </label>
                <div className="relative">
                <input
                  type="text"
                  value={formData.orcafascioClientId}
                  onChange={(e) =>
                    setFormData({ ...formData, orcafascioClientId: e.target.value.trim() })
                  }
                  spellCheck={false}
                  autoComplete="off"
                  className="h-10 w-full pl-3 pr-9 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 font-mono text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="Digite o código do cliente"
                />
                <FieldInfoIcon text="Clientes já conhecidos preenchem este código sozinhos. Para um cliente novo, cole o código do Orçafascio." />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  BDI padrão (%)
                </label>
                <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  value={formData.defaultBdiPercent}
                  onChange={(e) => setFormData({ ...formData, defaultBdiPercent: e.target.value })}
                  className="h-10 w-full pl-3 pr-9 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="Digite o BDI"
                />
                <FieldInfoIcon text="Usado automaticamente nos orçamentos deste contrato." />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Desconto padrão (%)
                </label>
                <div className="relative">
                <input
                  type="text"
                  inputMode="decimal"
                  value={formData.defaultDiscountPercent}
                  onChange={(e) => setFormData({ ...formData, defaultDiscountPercent: e.target.value })}
                  className="h-10 w-full pl-3 pr-9 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                  placeholder="Digite o desconto"
                />
                <FieldInfoIcon text="Usado automaticamente nos orçamentos deste contrato." />
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Cor do título dos orçamentos
                </label>
                <div className="flex items-center gap-2">
                  <KanbanLabelColorPicker
                    className="[&_button]:shadow-none"
                    color={formData.defaultTituloFundo || '#DC2626'}
                    onChange={(cor) => setFormData({ ...formData, defaultTituloFundo: cor })}
                  />
                  <input
                    type="text"
                    value={formData.defaultTituloFundo}
                    onChange={(e) => {
                      let v = e.target.value.toUpperCase().replace(/[^#0-9A-F]/g, '');
                      if (v && !v.startsWith('#')) v = `#${v}`;
                      if (v.length <= 7) setFormData({ ...formData, defaultTituloFundo: v });
                    }}
                    className="h-10 w-28 rounded-lg border border-gray-300 bg-white px-3 py-2 text-center font-mono text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    placeholder="Padrão"
                    maxLength={7}
                    spellCheck={false}
                    aria-label="Cor do título dos orçamentos"
                  />
                  {formData.defaultTituloFundo ? (
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, defaultTituloFundo: '' })}
                      className="text-xs font-medium text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
                    >
                      Usar a cor padrão do sistema
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="md:col-span-2">
                <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4 dark:border-gray-700 dark:bg-gray-900/30">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                        Reajustes padrão (%)
                      </label>
                      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        Reajustes já preenchidos nos orçamentos deste contrato.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setFormData({
                          ...formData,
                          reajustes: [
                            ...formData.reajustes,
                            { nome: `${formData.reajustes.length + 1}º reajuste`, percentual: '' },
                          ],
                        })
                      }
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:border-red-800 dark:bg-gray-800 dark:text-red-300 dark:hover:bg-red-950/30"
                    >
                      <Plus className="h-3.5 w-3.5" aria-hidden />
                      Adicionar
                    </button>
                  </div>

                  {formData.reajustes.length === 0 ? (
                    <p className="mt-3 rounded-lg border border-dashed border-gray-300 px-3 py-4 text-center text-xs text-gray-500 dark:border-gray-600 dark:text-gray-400">
                      Nenhum reajuste adicionado.
                    </p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {formData.reajustes.map((r: { nome: string; percentual: string }, idx: number) => (
                        <div
                          key={`reajuste-${idx}`}
                          className="grid grid-cols-[1fr_7.5rem_auto] items-center gap-2"
                        >
                          <input
                            type="text"
                            value={r.nome}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                reajustes: formData.reajustes.map((rr: { nome: string; percentual: string }, i: number) =>
                                  i === idx ? { ...rr, nome: e.target.value } : rr
                                ),
                              })
                            }
                            className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                            placeholder="Nome do reajuste"
                            aria-label={`Nome do reajuste ${idx + 1}`}
                          />
                          <div className="relative">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={r.percentual}
                              onChange={(e) =>
                                setFormData({
                                  ...formData,
                                  reajustes: formData.reajustes.map((rr: { nome: string; percentual: string }, i: number) =>
                                    i === idx ? { ...rr, percentual: e.target.value } : rr
                                  ),
                                })
                              }
                              className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 pr-8 text-right"
                              placeholder="Percentual"
                              aria-label={`Percentual do reajuste ${idx + 1}`}
                            />
                            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-gray-400 dark:text-gray-500">
                              %
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setFormData({
                                ...formData,
                                reajustes: formData.reajustes.filter((_: unknown, i: number) => i !== idx),
                              })
                            }
                            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                            aria-label={`Remover reajuste ${idx + 1}`}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              </div>
            </section>
            <section className="space-y-4">
              <div className="border-b border-gray-200 pb-2 dark:border-gray-700">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Faturamento</h4>
                <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">Regras de importação de notas deste contrato.</p>
              </div>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 dark:border-gray-600 dark:bg-gray-700/40">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-red-600 focus:ring-red-500 dark:border-gray-500 dark:bg-gray-800"
                checked={Boolean(formData.allowBillingImportWithoutOsPleito)}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    allowBillingImportWithoutOsPleito: e.target.checked,
                  })
                }
              />
              <span>
                <span className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                  Permitir importar faturamento sem OS e pleito
                </span>
                <span className="mt-0.5 block text-xs text-gray-500 dark:text-gray-400">
                  Na seção Faturamento deste contrato, o botão Importar aceita planilha só com nota,
                  emissão e valores.
                </span>
              </span>
            </label>
            </section>

            {(createMutation.isError || updateMutation.isError) && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-700 dark:text-red-300">
                  {(createMutation.error as any)?.response?.data?.message ||
                    (updateMutation.error as any)?.response?.data?.message ||
                    'Erro ao salvar contrato'}
                </p>
              </div>
            )}

          </div>

            <div className="flex shrink-0 justify-end gap-3 border-t border-gray-200 bg-white px-6 py-4 dark:border-gray-700 dark:bg-gray-800">
              <button
                type="button"
                onClick={requestClose}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors text-sm"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors text-sm"
              >
                {createMutation.isPending || updateMutation.isPending
                  ? 'Salvando...'
                  : editingContract
                  ? 'Atualizar'
                  : 'Cadastrar'}
              </button>
            </div>
        </form>
      </div>
    </AppModalOverlay>
    {confirmUi}
    </>
  );
}
