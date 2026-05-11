'use client';

import React, { useMemo, useState } from 'react';
import api from '@/lib/api';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { useRouter } from 'next/navigation';
import { usePermissions } from '@/hooks/usePermissions';
import { Check, Download, Eye, FileCheck, FileText, Wrench, Search, X } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import {
  exportEspelhoNfPdf,
  fmtEspelhoBrl,
  parseEspelhoBrCurrencyToNumber,
  type EspelhoFederalRates
} from '@/lib/exportEspelhoNfLayout';
import {
  ESPELHO_APPROVAL_STATUS_LABELS,
  type EspelhoApprovalStatus,
  resolveEspelhoApprovalStatus,
  updateEspelhoApprovalStatus
} from '@/lib/espelhoNfApproval';

type DpUrgency = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
type DpRequestStatus =
  | 'WAITING_MANAGER'
  | 'IN_REVIEW_DP'
  | 'IN_FINANCEIRO'
  | 'WAITING_RETURN'
  | 'WAITING_RETURN_ACCOUNTING'
  | 'WAITING_RETURN_ADM_TST'
  | 'WAITING_RETURN_ENGINEERING'
  | 'CONCLUDED'
  | 'CANCELLED';
type DpRequestType =
  | 'ADMISSAO'
  | 'ADVERTENCIA_SUSPENSAO'
  | 'ALTERACAO_FUNCAO_SALARIO'
  | 'ATESTADO_MEDICO'
  | 'BENEFICIOS_VIAGEM'
  | 'FERIAS'
  | 'HORA_EXTRA'
  | 'OUTRAS_SOLICITACOES'
  | 'RESCISAO'
  | 'RETIFICACAO_ALOCACAO';

type DpContractSummary = { id: string; number: string; name: string };
type EspelhoApprovalItem = {
  id: string;
  takerName: string;
  measurementRef: string;
  measurementAmount: string;
  dueDate: string;
  status: EspelhoApprovalStatus;
  mirror: any;
};
type EspelhoApprovalsData = {
  items: EspelhoApprovalItem[];
  providers: any[];
  takers: any[];
  bankAccounts: any[];
  taxCodes: any[];
};
type EspelhoPhaseFilter =
  | 'ALL'
  | 'PENDING_APPROVAL'
  | 'SENT_FOR_CORRECTION'
  | 'APPROVED'
  | 'CANCELLED';

type DpRequest = {
  id: string;
  displayNumber?: number;
  title: string;
  status: DpRequestStatus;
  urgency: DpUrgency;
  requestType: DpRequestType;
  prazoInicio: string;
  prazoFim: string;
  sectorSolicitante: string;
  solicitanteNome: string;
  solicitanteEmail: string;
  contractId?: string | null;
  contract?: DpContractSummary | null;
  company?: string | null;
  polo?: string | null;
  managerApprovalComment?: string | null;
  managerRejectionReason?: string | null;
  createdAt?: string;
  details?: Record<string, unknown> | null;
  employee?: { costCenter?: string | null } | null;
};

const STATUS_LABELS: Record<DpRequestStatus, string> = {
  WAITING_MANAGER: 'Aguardando aprovação do gestor',
  IN_REVIEW_DP: 'Em análise (DP)',
  IN_FINANCEIRO: 'No financeiro',
  WAITING_RETURN: 'Pendência colaborador',
  WAITING_RETURN_ACCOUNTING: 'Pendência contábil',
  WAITING_RETURN_ADM_TST: 'Pendência ADM/TST',
  WAITING_RETURN_ENGINEERING: 'Pendência engenharia',
  CONCLUDED: 'Concluída',
  CANCELLED: 'Cancelada',
};

/** Rótulos legíveis para chaves comuns em `details` (formulário por tipo). */
const DETAIL_KEY_LABELS: Record<string, string> = {
  employeeId: 'Colaborador',
  employeeIds: 'Colaboradores',
  costCenter: 'Centro de custo',
  punicao: 'Punição',
  motivo: 'Motivo',
  observacao: 'Observação',
  observacoes: 'Observações',
  setor: 'Setor',
  dataInicial: 'Data inicial',
  dataFinal: 'Data final',
  quantidadeNomeFuncaoContato: 'Qtd. / nome / função / contato',
  funcaoNomeQuantidadeContato: 'Função / nome / qtd. / contato',
  motivoContratacao: 'Motivo da contratação',
  funcaoSalarioAntigo: 'Função/salário (anterior)',
  funcaoSalarioNovo: 'Função/salário (novo)',
  justificativa: 'Justificativa',
  tipoAviso: 'Tipo de aviso',
  tipoRescisao: 'Tipo de rescisão',
  destinoViagem: 'Destino (viagem)',
  periodo: 'Período',
  horas: 'Horas',
  valor: 'Valor',
  descricao: 'Descrição',
};

function formatDateTime(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR');
}

function humanizeDetailKey(key: string): string {
  if (DETAIL_KEY_LABELS[key]) return DETAIL_KEY_LABELS[key];
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase()).trim();
}

function formatDetailValue(val: unknown): string {
  if (val == null) return '';
  if (Array.isArray(val)) {
    if (val.length === 0) return '';
    return val.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(', ');
  }
  if (typeof val === 'object') return JSON.stringify(val);
  return String(val);
}

function formatDetailEntryValue(
  key: string,
  v: unknown,
  employeeNameById?: Map<string, string>
): string {
  if (employeeNameById && key === 'employeeId' && typeof v === 'string') {
    const id = v.trim();
    if (!id) return '';
    const name = employeeNameById.get(id);
    return (name ?? id).trim();
  }
  if (employeeNameById && key === 'employeeIds' && Array.isArray(v)) {
    const parts = v
      .map((x) => {
        const id = String(x).trim();
        if (!id) return '';
        return employeeNameById.get(id) ?? id;
      })
      .filter(Boolean);
    return parts.join(', ');
  }
  return formatDetailValue(v);
}

function buildDetailRows(
  details: Record<string, unknown> | null | undefined,
  employeeNameById?: Map<string, string>
): { key: string; label: string; value: string }[] {
  if (!details || typeof details !== 'object') return [];
  const rows: { key: string; label: string; value: string }[] = [];
  for (const [k, v] of Object.entries(details)) {
    if (k === 'anexoAtestado') continue;
    const value = formatDetailEntryValue(k, v, employeeNameById).trim();
    if (!value) continue;
    rows.push({ key: k, label: humanizeDetailKey(k), value });
  }
  return rows.sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

function extractAtestadoAttachment(
  details: Record<string, unknown> | null | undefined
): { fileName: string; mimeType: string; previewUrl: string } | null {
  if (!details || typeof details !== 'object') return null;
  const raw = (details as any).anexoAtestado;
  if (!raw || typeof raw !== 'object') return null;
  const fileName = String(raw.fileName || 'atestado').trim() || 'atestado';
  const mimeType = String(raw.mimeType || 'application/octet-stream').trim() || 'application/octet-stream';
  const fileUrl = String(raw.fileUrl || '').trim();
  if (fileUrl) return { fileName, mimeType, previewUrl: fileUrl };
  const dataBase64 = String(raw.dataBase64 || '').trim();
  if (!dataBase64) return null;
  return { fileName, mimeType, previewUrl: `data:${mimeType};base64,${dataBase64}` };
}

function getDetailString(details: Record<string, unknown> | null | undefined, key: string): string | null {
  if (!details || typeof details !== 'object') return null;
  const v = (details as any)[key];
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
}

function formatYmd(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toISOString().slice(0, 10);
}

const URGENCY_LABELS: Record<DpUrgency, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Normal',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

const URGENCY_ROW_BADGE: Record<DpUrgency, string> = {
  LOW: 'text-yellow-800 dark:text-yellow-300',
  MEDIUM: 'text-yellow-800 dark:text-yellow-300',
  HIGH: 'text-red-700 dark:text-red-300',
  URGENT: 'text-red-700 dark:text-red-300',
};

/** Mesmo padrão do botão de ações na lista de funcionários (quadrado 9×9 com borda). */
const TABLE_ACTION_ICON_BTN_CLASS =
  'inline-flex items-center justify-center w-9 h-9 shrink-0 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors';

const TYPE_LABELS: Record<DpRequestType, string> = {
  ADMISSAO: 'Admissão',
  ADVERTENCIA_SUSPENSAO: 'Medida disciplinar',
  ALTERACAO_FUNCAO_SALARIO: 'Alteração de função/salário',
  ATESTADO_MEDICO: 'Atestado médico',
  BENEFICIOS_VIAGEM: 'Benefícios de viagem',
  FERIAS: 'Férias',
  HORA_EXTRA: 'Hora extra',
  OUTRAS_SOLICITACOES: 'Outras solicitações',
  RESCISAO: 'Rescisão',
  RETIFICACAO_ALOCACAO: 'Retificação de alocação',
};
const ESPELHO_BADGE_CLASS: Record<EspelhoApprovalStatus, string> = {
  PENDING_APPROVAL:
    'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:border-amber-800',
  APPROVED:
    'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-200 dark:border-emerald-800',
  SENT_FOR_CORRECTION:
    'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-200 dark:border-blue-800',
  CANCELLED:
    'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-200 dark:border-red-800'
};

export default function AprovacoesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [managerComment, setManagerComment] = useState<Record<string, string>>({});
  const [detailRequest, setDetailRequest] = useState<DpRequest | null>(null);
  const [espelhoPhase, setEspelhoPhase] = useState<EspelhoPhaseFilter>('PENDING_APPROVAL');
  const [attachmentPreview, setAttachmentPreview] = useState<{
    fileName: string;
    mimeType: string;
    previewUrl: string;
  } | null>(null);

  const downloadAttachment = async (att: { fileName: string; previewUrl: string }) => {
    try {
      const res = await fetch(att.previewUrl, { mode: 'cors', credentials: 'omit' });
      if (!res.ok) throw new Error('download failed');
      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = att.fileName || 'atestado';
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch {
      toast.error('Não foi possível baixar o anexo agora.');
    }
  };

  const { canAccessDpApproverPages, canApproveEspelhoNf } = usePermissions();
  const canApproveDp = canAccessDpApproverPages;

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });
  const user = userData?.data;

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const { data: dpResp, isLoading: loadingDp } = useQuery({
    queryKey: ['approvals', 'dp', 'WAITING_MANAGER'],
    queryFn: async () => {
      const res = await api.get('/solicitacoes-dp/aprovacoes');
      return (res.data?.data ?? []) as DpRequest[];
    },
    enabled: !loadingUser && canApproveDp,
  });
  const { data: espelhoResp, isLoading: loadingEspelhoApprovals } = useQuery({
    queryKey: ['approvals', 'espelho-nf'],
    enabled: !loadingUser && canApproveEspelhoNf,
    queryFn: async () => {
      const res = await api.get('/espelho-nf/bootstrap');
      const data = res.data?.data || {};
      const mirrors = Array.isArray(data.mirrors) ? data.mirrors : [];
      const providers = Array.isArray(data.providers) ? data.providers : [];
      const takers = Array.isArray(data.takers) ? data.takers : [];
      const bankAccounts = Array.isArray(data.bankAccounts) ? data.bankAccounts : [];
      const taxCodes = Array.isArray(data.taxCodes) ? data.taxCodes : [];
      const takerById = new Map(
        takers.map((t: any) => [
          String(t.id ?? ''),
          String(t.corporateName || t.name || '').trim()
        ])
      );
      const parsed: EspelhoApprovalItem[] = mirrors.map((m: any) => ({
        id: String(m.id ?? ''),
        takerName: String(m.takerName || takerById.get(String(m.takerId ?? '')) || '').trim(),
        measurementRef: String(m.measurementRef ?? ''),
        measurementAmount: String(m.measurementAmount ?? ''),
        dueDate: String(m.dueDate ?? ''),
        status: resolveEspelhoApprovalStatus(String(m.id ?? ''), String(m.approvalStatus ?? '')),
        mirror: m
      }));
      return {
        items: parsed,
        providers,
        takers,
        bankAccounts,
        taxCodes
      } as EspelhoApprovalsData;
    },
  });

  const dpRequests = (dpResp as DpRequest[]) || [];
  const espelhoData = (espelhoResp as EspelhoApprovalsData | undefined) ?? {
    items: [],
    providers: [],
    takers: [],
    bankAccounts: [],
    taxCodes: []
  };
  const espelhoApprovals = espelhoData.items;

  const detailPayrollMonthYear = React.useMemo(() => {
    const src = detailRequest?.createdAt;
    if (!src) {
      const n = new Date();
      return { month: n.getMonth() + 1, year: n.getFullYear() };
    }
    const d = new Date(src);
    if (Number.isNaN(d.getTime())) {
      const n = new Date();
      return { month: n.getMonth() + 1, year: n.getFullYear() };
    }
    return { month: d.getMonth() + 1, year: d.getFullYear() };
  }, [detailRequest?.createdAt]);

  const { data: payrollEmpForDetail } = useQuery({
    queryKey: [
      'payroll-employees-aprovacoes-detalhe',
      detailPayrollMonthYear.month,
      detailPayrollMonthYear.year,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        month: String(detailPayrollMonthYear.month),
        year: String(detailPayrollMonthYear.year),
        limit: '500',
        page: '1',
      });
      const res = await api.get(`/payroll/employees?${params.toString()}`);
      return (res.data?.data?.employees ?? []) as { id: string; name: string }[];
    },
    enabled: !loadingUser && canApproveDp && !!detailRequest,
  });

  const employeeNameByIdForDetail = React.useMemo(() => {
    const list = payrollEmpForDetail ?? [];
    return new Map(list.map((e) => [e.id, e.name]));
  }, [payrollEmpForDetail]);

  const detailModalRows = React.useMemo(
    () => (detailRequest ? buildDetailRows(detailRequest.details, employeeNameByIdForDetail) : []),
    [detailRequest, employeeNameByIdForDetail]
  );
  const detailAttachment = React.useMemo(
    () => (detailRequest ? extractAtestadoAttachment(detailRequest.details) : null),
    [detailRequest]
  );

  const getCostCenterLabel = (r: DpRequest): string | null => {
    const fromDetails =
      typeof r.details?.costCenter === 'string' ? r.details.costCenter.trim() : '';
    if (fromDetails) return fromDetails;
    const fromEmployee = typeof r.employee?.costCenter === 'string' ? r.employee.costCenter.trim() : '';
    return fromEmployee || null;
  };

  const getContratoColunaLabel = (r: DpRequest): string => {
    if (r.requestType === 'ATESTADO_MEDICO') return getCostCenterLabel(r) || '—';
    return r.contract?.name ?? '—';
  };

  const detailInfoRows = React.useMemo(() => {
    if (!detailRequest) return [] as Array<{ key: string; label: string; value: string }>;
    const rows: Array<{ key: string; label: string; value: string }> = [];
    const seen = new Set<string>();
    const push = (key: string, label: string, value?: string | null) => {
      const v = String(value ?? '').trim();
      if (!v || seen.has(key)) return;
      seen.add(key);
      rows.push({ key, label, value: v });
    };

    push('status', 'Status', STATUS_LABELS[detailRequest.status] ?? detailRequest.status);
    push('urgency', 'Urgência', URGENCY_LABELS[detailRequest.urgency]);
    push('tipo', 'Tipo', TYPE_LABELS[detailRequest.requestType] ?? detailRequest.requestType);
    push('criadaEm', 'Criada em', formatDateTime(detailRequest.createdAt));
    push('prazoInicio', 'Prazo (início)', formatYmd(detailRequest.prazoInicio));
    push('prazoFim', 'Prazo (fim)', formatYmd(detailRequest.prazoFim));
    push('centroCusto', 'Centro de custo', getCostCenterLabel(detailRequest));
    push('empresa', 'Empresa', detailRequest.company ?? null);
    push('polo', 'Polo', detailRequest.polo ?? null);
    if (!getCostCenterLabel(detailRequest)) {
      const contrato = `${detailRequest.contract?.name ?? ''}${
        detailRequest.contract?.number ? ` (${detailRequest.contract.number})` : ''
      }`.trim();
      push('contrato', 'Contrato', contrato || '—');
    }
    push('solicitante', 'Solicitante', detailRequest.solicitanteNome);
    push('setor', 'Setor', detailRequest.sectorSolicitante || '—');
    push('login', 'Login', detailRequest.solicitanteEmail || '—');

    // Ordem pedida: data inicial acima de data final.
    push('dataInicial', 'Data inicial', getDetailString(detailRequest.details, 'dataInicial'));
    push('dataFinal', 'Data final', getDetailString(detailRequest.details, 'dataFinal'));
    push('numeroDias', 'Número de dias', getDetailString(detailRequest.details, 'numeroDias'));
    push(
      'colaborador',
      'Colaborador',
      getDetailString(detailRequest.details, 'employeeId')
        ? formatDetailEntryValue('employeeId', getDetailString(detailRequest.details, 'employeeId')!, employeeNameByIdForDetail)
        : null
    );

    detailModalRows.forEach((row) => {
      if (['costCenter', 'dataInicial', 'dataFinal', 'numeroDias', 'employeeId'].includes(row.key)) return;
      push(`details_${row.key}`, row.label, row.value);
    });

    return rows;
  }, [detailRequest, detailModalRows, employeeNameByIdForDetail]);

  const dpFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return dpRequests;
    return dpRequests.filter((r) => {
      if (r.displayNumber != null && String(r.displayNumber).includes(q)) return true;
      return r.id.toLowerCase().includes(q);
    });
  }, [dpRequests, search]);
  const espelhoFiltered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const byPhase =
      espelhoPhase === 'ALL'
        ? espelhoApprovals
        : espelhoApprovals.filter((m) => m.status === espelhoPhase);
    if (!q) return byPhase;
    return byPhase.filter((m) => {
      const title = `${m.takerName} ${m.measurementRef} ${m.measurementAmount} ${m.id}`.toLowerCase();
      return title.includes(q);
    });
  }, [espelhoApprovals, espelhoPhase, search]);
  const espelhoPhaseCounts = useMemo(
    () => ({
      ALL: espelhoApprovals.length,
      PENDING_APPROVAL: espelhoApprovals.filter((m) => m.status === 'PENDING_APPROVAL').length,
      SENT_FOR_CORRECTION: espelhoApprovals.filter((m) => m.status === 'SENT_FOR_CORRECTION').length,
      APPROVED: espelhoApprovals.filter((m) => m.status === 'APPROVED').length,
      CANCELLED: espelhoApprovals.filter((m) => m.status === 'CANCELLED').length
    }),
    [espelhoApprovals]
  );

  const approveMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const comment = managerComment[id] || '';
      const res = await api.put(`/solicitacoes-dp/${id}/manager-approve`, { comment });
      return res.data?.data as DpRequest;
    },
    onSuccess: async (_, variables) => {
      toast.success('Solicitação aprovada');
      setDetailRequest((cur) => (cur?.id === variables.id ? null : cur));
      await queryClient.invalidateQueries({ queryKey: ['approvals', 'dp', 'WAITING_MANAGER'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || err?.message || 'Erro'),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const comment = managerComment[id] || '';
      const res = await api.put(`/solicitacoes-dp/${id}/manager-reject`, { comment });
      return res.data?.data as DpRequest;
    },
    onSuccess: async (_, variables) => {
      toast.success('Solicitação rejeitada');
      setDetailRequest((cur) => (cur?.id === variables.id ? null : cur));
      await queryClient.invalidateQueries({ queryKey: ['approvals', 'dp', 'WAITING_MANAGER'] });
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || err?.message || 'Erro'),
  });
  const applyEspelhoDecision = async (
    mirrorId: string,
    status: EspelhoApprovalStatus,
    successMessage: string
  ) => {
    updateEspelhoApprovalStatus(mirrorId, status);
    toast.success(successMessage);
    await queryClient.invalidateQueries({ queryKey: ['approvals', 'espelho-nf'] });
  };
  const handleDownloadEspelhoPdf = (item: EspelhoApprovalItem) => {
    const fallbackFederal: EspelhoFederalRates = {
      cofins: '0',
      csll: '0',
      inss: '0',
      irpj: '0',
      pis: '0'
    };
    let federal = fallbackFederal;
    try {
      const raw = localStorage.getItem('espelho-nf-federal-tax-rates');
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<EspelhoFederalRates>;
        federal = {
          cofins: String(parsed?.cofins ?? '0'),
          csll: String(parsed?.csll ?? '0'),
          inss: String(parsed?.inss ?? '0'),
          irpj: String(parsed?.irpj ?? '0'),
          pis: String(parsed?.pis ?? '0')
        };
      }
    } catch {
      federal = fallbackFederal;
    }
    exportEspelhoNfPdf(
      item.mirror,
      espelhoData.providers,
      espelhoData.takers,
      espelhoData.bankAccounts,
      espelhoData.taxCodes,
      federal
    );
    toast.success('PDF do espelho gerado.');
  };

  if (loadingUser) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  return (
    <ProtectedRoute route="/ponto/aprovacoes">
      <MainLayout userRole={'EMPLOYEE'} userName={user?.name || ''} onLogout={handleLogout}>
        <div className="space-y-6">
          <div className="text-center">
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">Aprovações</h1>
            <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
              Caixa de entrada de aprovações pendentes
            </p>
          </div>

          <Card className="w-full">
            <CardHeader className="border-b-0 pb-1">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center space-x-3">
                  <div className="p-2 sm:p-3 bg-red-100 dark:bg-red-900/30 rounded-lg">
                    <FileCheck className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Solicitações</h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Pendentes de aprovação
                    </p>
                  </div>
                </div>
                <div className="flex flex-shrink-0 flex-wrap items-center gap-2 sm:justify-end">
                  <div className="relative min-w-[240px] flex-1 sm:w-[280px] sm:flex-none">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Buscar por Nº ou ID..."
                      className="h-10 w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                    />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {!canApproveDp ? (
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  Você não tem permissão para aprovar solicitações do Departamento Pessoal.
                </div>
              ) : loadingDp ? (
                <Loading message="Carregando aprovações..." />
              ) : (
                <>
                  <div className="mb-2 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-400 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
                    <span>
                      Mostrando {dpFiltered.length === 0 ? 0 : 1} a {dpFiltered.length} de {dpFiltered.length}{' '}
                      solicitações
                    </span>
                    <span>Página 1 de 1</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="border-b border-gray-200 dark:border-gray-700">
                        <tr>
                          <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Nº
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Urgência
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Tipo
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Contrato
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Prazo início
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Prazo fim
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Solicitante
                          </th>
                          <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                            Ação
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                        {dpFiltered.map((r) => (
                          <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                            <td className="px-3 sm:px-6 py-3 align-middle text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100">
                              {r.displayNumber ?? '—'}
                            </td>
                            <td className="px-3 sm:px-6 py-3 align-middle text-center">
                              <span
                                className={`inline-flex items-center justify-center text-xs font-medium ${URGENCY_ROW_BADGE[r.urgency]}`}
                              >
                                {URGENCY_LABELS[r.urgency]}
                              </span>
                            </td>
                            <td className="px-3 sm:px-6 py-3 align-middle text-sm font-medium text-gray-900 dark:text-gray-100">
                              {TYPE_LABELS[r.requestType] ?? r.requestType}
                            </td>
                            <td className="px-3 sm:px-6 py-3 align-middle text-sm text-gray-700 dark:text-gray-300 max-w-[220px]">
                              {getContratoColunaLabel(r)}
                            </td>
                            <td className="px-3 sm:px-6 py-3 align-middle text-sm text-gray-700 dark:text-gray-300">
                              {formatYmd(r.prazoInicio)}
                            </td>
                            <td className="px-3 sm:px-6 py-3 align-middle text-sm text-gray-700 dark:text-gray-300">
                              {formatYmd(r.prazoFim)}
                            </td>
                            <td className="px-3 sm:px-6 py-3 align-middle text-sm text-gray-700 dark:text-gray-300">
                              <div className="font-medium text-gray-900 dark:text-gray-100">{r.solicitanteNome}</div>
                              <div className="text-xs text-gray-500 dark:text-gray-400">{r.sectorSolicitante}</div>
                            </td>
                            <td className="px-3 sm:px-6 py-3 align-middle text-center">
                              <div className="flex justify-center">
                                <button
                                  type="button"
                                  onClick={() => setDetailRequest(r)}
                                  className={TABLE_ACTION_ICON_BTN_CLASS}
                                  title="Ver detalhes"
                                  aria-label="Ver detalhes da solicitação"
                                >
                                  <FileText className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {dpFiltered.length === 0 && (
                          <tr>
                            <td className="py-8 text-center text-gray-500" colSpan={8}>
                              Nenhuma aprovação pendente.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {canApproveEspelhoNf && (
          <Card className="w-full">
            <CardHeader className="border-b-0 pb-1">
              <div className="flex items-center space-x-3">
                <div className="p-2 sm:p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Espelhos NF</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">Pendentes de aprovação/correção</p>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="mb-3 border-b border-gray-200 dark:border-gray-700">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs sm:text-sm">
                  {([
                    ['PENDING_APPROVAL', 'Pendentes'],
                    ['SENT_FOR_CORRECTION', 'Correção'],
                    ['APPROVED', 'Aprovados'],
                    ['CANCELLED', 'Cancelados'],
                    ['ALL', 'Todas']
                  ] as const).map(([phaseKey, label]) => (
                    <button
                      key={phaseKey}
                      type="button"
                      onClick={() => setEspelhoPhase(phaseKey)}
                      className={`relative pb-2 transition-colors ${
                        espelhoPhase === phaseKey
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                      }`}
                    >
                      <span>{label}</span>
                      <span className="ml-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] dark:bg-gray-700">
                        {espelhoPhaseCounts[phaseKey]}
                      </span>
                      {espelhoPhase === phaseKey ? (
                        <span className="absolute inset-x-0 -bottom-px h-0.5 bg-blue-600 dark:bg-blue-400" />
                      ) : null}
                    </button>
                  ))}
                </div>
              </div>
              {loadingEspelhoApprovals ? (
                <Loading message="Carregando espelhos..." />
              ) : espelhoFiltered.length === 0 ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">Nenhum espelho pendente de decisão.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b border-gray-200 dark:border-gray-700">
                      <tr>
                        <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Tomador | Medição | Referência
                        </th>
                        <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-3 sm:px-6 py-4 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Vencimento
                        </th>
                        <th className="px-3 sm:px-6 py-4 text-center text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                          Ações
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                      {espelhoFiltered.map((m) => {
                        const med = parseEspelhoBrCurrencyToNumber(m.measurementAmount);
                        const medTxt = med !== null ? fmtEspelhoBrl(med) : 'Medição não informada';
                        const title = `${m.takerName || 'Tomador não informado'} | ${medTxt} | ${m.measurementRef || 'Sem referência'}`;
                        return (
                          <tr key={m.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                            <td className="px-3 sm:px-6 py-3 align-middle text-sm font-medium text-gray-900 dark:text-gray-100">
                              <div className="space-y-0.5">
                                <div>{title}</div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">ID: {m.id}</div>
                              </div>
                            </td>
                            <td className="px-3 sm:px-6 py-3 align-middle">
                              <span
                                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                                  ESPELHO_BADGE_CLASS[m.status]
                                }`}
                              >
                                {ESPELHO_APPROVAL_STATUS_LABELS[m.status]}
                              </span>
                            </td>
                            <td className="px-3 sm:px-6 py-3 align-middle text-sm text-gray-700 dark:text-gray-300">
                              {m.dueDate || '—'}
                            </td>
                            <td className="px-3 sm:px-6 py-3 align-middle">
                              <div className="flex justify-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => void applyEspelhoDecision(m.id, 'APPROVED', 'Espelho aprovado.')}
                                  className={`${TABLE_ACTION_ICON_BTN_CLASS} text-emerald-600 dark:text-emerald-400`}
                                  title="Aprovar"
                                  aria-label="Aprovar espelho"
                                >
                                  <Check className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void applyEspelhoDecision(
                                      m.id,
                                      'SENT_FOR_CORRECTION',
                                      'Espelho enviado para correção.'
                                    )
                                  }
                                  className={`${TABLE_ACTION_ICON_BTN_CLASS} text-amber-500 dark:text-amber-400`}
                                  title="Enviar para correção"
                                  aria-label="Enviar espelho para correção"
                                >
                                  <Wrench className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void applyEspelhoDecision(m.id, 'CANCELLED', 'Espelho cancelado.')}
                                  className={`${TABLE_ACTION_ICON_BTN_CLASS} text-red-600 dark:text-red-400`}
                                  title="Cancelar"
                                  aria-label="Cancelar espelho"
                                >
                                  <X className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDownloadEspelhoPdf(m)}
                                  className={TABLE_ACTION_ICON_BTN_CLASS}
                                  title="Baixar PDF do espelho"
                                  aria-label="Baixar PDF do espelho"
                                >
                                  <Download className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
          )}

          <Modal
            isOpen={!!detailRequest}
            onClose={() => setDetailRequest(null)}
            title={
              detailRequest
                ? `Solicitação`
                : 'Detalhes'
            }
            size="lg"
          >
            {detailRequest && (
              <div className="space-y-6">
                {detailInfoRows.length > 0 ? (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                      Informações
                    </h3>
                    <div className="max-h-[240px] overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
                      <dl className="divide-y divide-gray-100 dark:divide-gray-700 text-sm">
                        {detailInfoRows.map((row) => (
                          <div key={row.key} className="grid gap-1 px-3 py-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] sm:gap-4">
                            <dt className="font-medium text-gray-700 dark:text-gray-300">{row.label}</dt>
                            <dd className="whitespace-pre-wrap break-words text-gray-600 dark:text-gray-400">
                              {row.value}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  </div>
                ) : null}

                {detailAttachment ? (
                  <div className="space-y-2">
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Anexo do atestado</h3>
                    <div className="rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">
                          {detailAttachment.fileName}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{detailAttachment.mimeType}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setAttachmentPreview(detailAttachment)}
                          className="inline-flex items-center justify-center w-9 h-9 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          title="Ver anexo"
                          aria-label="Ver anexo"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void downloadAttachment(detailAttachment)}
                          className="inline-flex items-center justify-center w-9 h-9 rounded-md border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          title="Baixar anexo"
                          aria-label="Baixar anexo"
                        >
                          <Download className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}

                <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
                  <h3 className="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Decisão</h3>
                  <div className="space-y-3">
                    <Input
                      value={managerComment[detailRequest.id] || ''}
                      onChange={(e) =>
                        setManagerComment((p) => ({ ...p, [detailRequest.id]: e.target.value }))
                      }
                      placeholder="Comentário (opcional)"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Button type="button" variant="outline" onClick={() => setDetailRequest(null)}>
                        Fechar
                      </Button>
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <Button
                          type="button"
                          variant="error"
                          onClick={() => rejectMutation.mutate({ id: detailRequest.id })}
                          disabled={
                            approveMutation.isPending ||
                            rejectMutation.isPending ||
                            detailRequest.status !== 'WAITING_MANAGER'
                          }
                        >
                          {rejectMutation.isPending ? 'Rejeitando…' : 'Rejeitar'}
                        </Button>
                        <Button
                          type="button"
                          onClick={() => approveMutation.mutate({ id: detailRequest.id })}
                          disabled={
                            approveMutation.isPending ||
                            rejectMutation.isPending ||
                            detailRequest.status !== 'WAITING_MANAGER'
                          }
                        >
                          {approveMutation.isPending ? 'Aprovando…' : 'Aprovar'}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </Modal>

          {attachmentPreview && (
            <div
              className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/85 p-4"
              role="dialog"
              aria-modal="true"
              aria-label="Visualizar anexo do atestado"
              onClick={() => setAttachmentPreview(null)}
            >
              <button
                type="button"
                onClick={() => setAttachmentPreview(null)}
                className="absolute top-4 right-4 p-2 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors z-10"
                aria-label="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="max-w-[92vw] max-h-[88vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                {attachmentPreview.mimeType.toLowerCase().includes('pdf') ? (
                  <iframe
                    title={attachmentPreview.fileName}
                    src={attachmentPreview.previewUrl}
                    className="w-[min(92vw,980px)] h-[85vh] rounded-xl bg-white"
                  />
                ) : (
                  <img
                    src={attachmentPreview.previewUrl}
                    alt={attachmentPreview.fileName}
                    className="max-w-full max-h-[85vh] object-contain rounded-xl"
                    referrerPolicy="no-referrer"
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </MainLayout>
    </ProtectedRoute>
  );
}
