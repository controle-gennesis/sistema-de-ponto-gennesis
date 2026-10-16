'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { FileSpreadsheet, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { ListPagination } from '@/components/ui/ListPagination';
import {
  CadastroListEmpty,
  CadastroListLoading,
  CadastroListSummary,
  getCadastroListRange,
} from '@/components/ui/CadastroListSummary';
import { getListTableRowClassName, ListRowNavigableLabel } from '@/components/ui/listTableUi';
import { ListPageHeader, PageStack } from '@/components/ui/pageLayout';
import {
  DetailInfoActions,
  DetailInfoSection,
  type DetailInfoField,
} from '@/components/ui/DetailInfoLayout';
import {
  INITIAL_FEDERAL_TAX_RATES,
  mergeFederalTaxStateFromApi,
  type FederalTaxContextKey,
} from '@/components/espelho-nf/EspelhoNfTaxCodeContractFields';
import {
  buildEspelhoDetailRows,
  espelhoMirrorForExport,
  exportEspelhoNfPdf,
  fmtEspelhoBrl,
  parseEspelhoBrCurrencyToNumber,
  type EspelhoExportBank,
  type EspelhoExportProvider,
  type EspelhoExportTaker,
  type EspelhoExportTaxCode,
  type EspelhoFederalRates,
  type EspelhoMirrorDraft,
} from '@/lib/exportEspelhoNfLayout';
import { resolveEspelhoApprovalStatus } from '@/lib/espelhoNfApproval';
import { useEspelhoNfBootstrap } from '@/hooks/useEspelhoNfBootstrap';
import { useCostCenters } from '@/hooks/useCostCenters';
import api from '@/lib/api';

const PAGE_SIZE = 20;

type Attachment = { name: string; mimeType: string; size: number; dataUrl: string };

type ApprovedMirror = EspelhoMirrorDraft & {
  id: string;
  createdAt?: string;
  approvalDecidedAt?: string | null;
  approvalDecidedByName?: string;
  nfAttachment?: Attachment;
  xmlAttachment?: Attachment;
};

function humanFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDateBr(value?: string | null): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '—';
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
}

function normalizeAttachment(raw: unknown): Attachment | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const name = String(o.name ?? '').trim();
  const dataUrl = String(o.dataUrl ?? '').trim();
  if (!name || !dataUrl) return undefined;
  return {
    name,
    mimeType: String(o.mimeType ?? 'application/octet-stream'),
    size: Number.isFinite(Number(o.size)) ? Math.max(0, Number(o.size)) : 0,
    dataUrl,
  };
}

/** Alíquotas federais do código tributário do espelho (contexto habilitado), como no cadastro. */
function federalRatesForTaxCode(taxCode: unknown): EspelhoFederalRates {
  const tc = (taxCode ?? {}) as {
    federalRatesByContext?: unknown;
    federalTaxContextEnabled?: unknown;
  };
  const fed = mergeFederalTaxStateFromApi(
    tc.federalRatesByContext as never,
    tc.federalTaxContextEnabled as never
  );
  const key = (Object.keys(fed.federalTaxContextEnabled) as FederalTaxContextKey[]).find(
    (k) => fed.federalTaxContextEnabled[k]
  );
  return key ? fed.federalRatesByContext[key] : INITIAL_FEDERAL_TAX_RATES;
}

export default function EspelhosAprovadosPage() {
  const router = useRouter();
  const { costCenters } = useCostCenters();
  const { data: bootstrap, isLoading } = useEspelhoNfBootstrap();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<ApprovedMirror | null>(null);

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await api.get('/auth/me');
      return res.data;
    },
  });
  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };
  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const costCentersForEspelho = useMemo(
    () => (costCenters ?? []).map((cc) => ({ id: cc.id, code: cc.code, name: cc.name })),
    [costCenters]
  );

  const providers = useMemo(
    () => (bootstrap?.providers ?? []) as EspelhoExportProvider[],
    [bootstrap]
  );
  const takers = useMemo(() => (bootstrap?.takers ?? []) as EspelhoExportTaker[], [bootstrap]);
  const banks = useMemo(() => (bootstrap?.bankAccounts ?? []) as EspelhoExportBank[], [bootstrap]);
  const taxCodes = useMemo(
    () => (bootstrap?.taxCodes ?? []) as EspelhoExportTaxCode[],
    [bootstrap]
  );

  const approved = useMemo<ApprovedMirror[]>(() => {
    const providerById = new Map(providers.map((p) => [p.id, p]));
    const takerById = new Map(takers.map((t) => [t.id, t]));
    const bankById = new Map(banks.map((b) => [b.id, b]));
    const taxById = new Map(taxCodes.map((t) => [t.id, t]));
    return ((bootstrap?.mirrors ?? []) as Array<Record<string, unknown>>)
      .filter((m) => resolveEspelhoApprovalStatus(String(m.id ?? ''), String(m.approvalStatus ?? '')) === 'APPROVED')
      .map((m) => {
        const providerId = String(m.providerId ?? '');
        const takerId = String(m.takerId ?? '');
        const bankAccountId = String(m.bankAccountId ?? '');
        const taxCodeId = String(m.taxCodeId ?? '');
        return {
          ...(m as object),
          id: String(m.id ?? ''),
          createdAt: m.createdAt ? String(m.createdAt) : undefined,
          approvalDecidedAt: m.approvalDecidedAt ? String(m.approvalDecidedAt) : null,
          approvalDecidedByName: String(m.approvalDecidedByName ?? ''),
          measurementRef: String(m.measurementRef ?? ''),
          costCenterId: String(m.costCenterId ?? ''),
          dueDate: String(m.dueDate ?? ''),
          empenhoNumber: String(m.empenhoNumber ?? ''),
          processNumber: String(m.processNumber ?? ''),
          serviceOrder: String(m.serviceOrder ?? ''),
          buildingUnit: String(m.buildingUnit ?? ''),
          observations: String(m.observations ?? ''),
          notes: String(m.notes ?? ''),
          measurementAmount: String(m.measurementAmount ?? ''),
          laborAmount: String(m.laborAmount ?? ''),
          materialAmount: String(m.materialAmount ?? ''),
          providerId,
          providerName: String(m.providerName || providerById.get(providerId)?.corporateName || ''),
          takerId,
          takerName: String(m.takerName || takerById.get(takerId)?.corporateName || ''),
          bankAccountId,
          bankAccountName: String(m.bankAccountName || bankById.get(bankAccountId)?.name || ''),
          taxCodeId,
          taxCodeCityName: String(m.taxCodeCityName || taxById.get(taxCodeId)?.cityName || ''),
          nfAttachment: normalizeAttachment(m.nfAttachment),
          xmlAttachment: normalizeAttachment(m.xmlAttachment),
        } as ApprovedMirror;
      })
      .sort((a, b) =>
        String(b.approvalDecidedAt ?? b.createdAt ?? '').localeCompare(
          String(a.approvalDecidedAt ?? a.createdAt ?? '')
        )
      );
  }, [bootstrap, providers, takers, banks, taxCodes]);

  const costCenterName = (id: string) => {
    const cc = costCentersForEspelho.find((c) => c.id === id);
    return cc ? cc.name || cc.code || '—' : '—';
  };

  const filtered = useMemo(() => {
    const q = search
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '');
    if (!q) return approved;
    return approved.filter((m) =>
      [m.takerName, m.providerName, m.measurementRef, costCenterName(m.costCenterId)]
        .join(' ')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .includes(q)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approved, search, costCentersForEspelho]);

  const range = getCadastroListRange(page, PAGE_SIZE, filtered.length);
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleExportPdf = (mirror: ApprovedMirror) => {
    exportEspelhoNfPdf(
      espelhoMirrorForExport(mirror, costCentersForEspelho),
      providers,
      takers,
      banks,
      taxCodes,
      federalRatesForTaxCode(taxCodes.find((t) => t.id === mirror.taxCodeId))
    );
    toast.success('Arquivo PDF gerado.');
  };

  const handleDownloadAttachment = (attachment: Attachment) => {
    const anchor = document.createElement('a');
    anchor.href = attachment.dataUrl;
    anchor.download = attachment.name;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  const layout = (children: React.ReactNode) => (
    <ProtectedRoute route="/ponto/financeiro/espelhos-aprovados">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        {children}
      </MainLayout>
    </ProtectedRoute>
  );

  if (loadingUser) return layout(<Loading message="Carregando..." fullScreen size="lg" />);

  return layout(
    <PageStack>
      <ListPageHeader
        title="Espelhos de NF"
        description="Espelhos aprovados, prontos para o Financeiro."
      />

      <Card className="w-full">
        <CardHeader className="border-b-0 pb-1">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center space-x-3">
              <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                <FileSpreadsheet className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  Espelhos aprovados
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Criados, aprovados e liberados para o Financeiro
                </p>
              </div>
            </div>
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder="Buscar tomador, prestador ou referência"
                className="h-10 w-full rounded-lg border border-gray-300 bg-white pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <CadastroListLoading message="Carregando espelhos..." />
          ) : filtered.length === 0 ? (
            <CadastroListEmpty
              icon={FileSpreadsheet}
              title={
                approved.length === 0
                  ? 'Nenhum espelho aprovado ainda'
                  : 'Nenhum espelho corresponde à busca'
              }
              hint={
                approved.length === 0
                  ? 'Os espelhos aparecem aqui depois de aprovados.'
                  : undefined
              }
            />
          ) : (
            <>
              <CadastroListSummary
                startItem={range.startItem}
                endItem={range.endItem}
                total={filtered.length}
                itemLabel="espelho"
                itemLabelPlural="espelhos"
                currentPage={page}
                totalPages={range.totalPages}
              />
              <div className="table-scroll">
                <table className="w-full text-sm">
                  <thead className="border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      {[
                        ['left', 'Espelho'],
                        ['left', 'Prestador'],
                        ['left', 'Centro de custo'],
                        ['right', 'Valor da medição'],
                        ['center', 'Vencimento'],
                        ['center', 'Aprovado em'],
                        ['right', 'Ação'],
                      ].map(([align, label]) => (
                        <th
                          key={label}
                          className={`px-3 py-4 text-${align} text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400 sm:px-6`}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
                    {pageRows.map((m) => {
                      const medValue = parseEspelhoBrCurrencyToNumber(m.measurementAmount);
                      return (
                        <tr
                          key={m.id}
                          onClick={() => setDetail(m)}
                          className={getListTableRowClassName(true)}
                        >
                          <td className="px-3 py-3 text-left sm:px-6">
                            <div className="min-w-0">
                              <ListRowNavigableLabel className="truncate font-semibold">
                                {m.takerName.trim() || 'Tomador não informado'}
                              </ListRowNavigableLabel>
                              <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                                {m.measurementRef.trim() || 'Sem referência'}
                              </p>
                            </div>
                          </td>
                          <td className="px-3 py-3 text-left text-sm text-gray-700 dark:text-gray-300 sm:px-6">
                            {m.providerName.trim() || '—'}
                          </td>
                          <td className="px-3 py-3 text-left text-sm text-gray-700 dark:text-gray-300 sm:px-6">
                            {costCenterName(m.costCenterId)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-medium tabular-nums text-gray-900 dark:text-gray-100 sm:px-6">
                            {medValue !== null ? fmtEspelhoBrl(medValue) : '—'}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-center text-sm text-gray-700 dark:text-gray-300 sm:px-6">
                            {formatDateBr(m.dueDate)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-center text-sm text-gray-700 dark:text-gray-300 sm:px-6">
                            {formatDateBr(m.approvalDecidedAt)}
                          </td>
                          <td
                            className="px-3 py-3 text-right sm:px-6"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              type="button"
                              onClick={() => handleExportPdf(m)}
                              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                            >
                              Exportar PDF
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <ListPagination currentPage={page} totalPages={range.totalPages} onPageChange={setPage} />
            </>
          )}
        </CardContent>
      </Card>

      <Modal
        isOpen={!!detail}
        onClose={() => setDetail(null)}
        title="Detalhes do espelho"
        size="lg"
      >
        {detail ? (
          <div className="space-y-6">
            {(() => {
              const taxCodeRow = taxCodes.find((t) => t.id === detail.taxCodeId) ?? null;
              const rows = buildEspelhoDetailRows(
                detail,
                costCentersForEspelho,
                taxCodeRow as never,
                (taxCodeRow as { iss?: never } | null)?.iss ?? null
              );
              const pick = (labels: string[]): DetailInfoField[] =>
                labels
                  .map((label) => rows.find(([l]) => l === label))
                  .filter((r): r is [string, string] => !!r)
                  .map(([label, value]) => ({
                    label,
                    value,
                    stacked: label === 'Observações' || label === 'Outras informações',
                  }));
              return (
                <>
                  <DetailInfoSection
                    title="Aprovação"
                    fields={[
                      { label: 'Status', value: 'Aprovado' },
                      { label: 'Aprovado em', value: formatDateBr(detail.approvalDecidedAt) },
                      { label: 'Aprovado por', value: detail.approvalDecidedByName || '—' },
                    ]}
                  />
                  <DetailInfoSection
                    title="Medição"
                    fields={pick([
                      'Referência da medição',
                      'Medição (R$)',
                      'Mão de obra (R$)',
                      'Material (R$)',
                      'Vencimento',
                      'Início da medição',
                      'Fim da medição',
                    ])}
                  />
                  <DetailInfoSection
                    title="Material e bases de cálculo"
                    fields={pick([
                      'Limite Material INSS',
                      'Limite Material ISS',
                      'Base de cálculo INSS',
                      'Base de cálculo ISS',
                    ])}
                  />
                  <DetailInfoSection
                    title="Dados da nota"
                    fields={pick([
                      'Prestador',
                      'Tomador',
                      'Centro de custo',
                      'Conta bancária',
                      'Código tributário (contrato)',
                      'Nº Empenho',
                      'Nº Processo',
                      'Ordem de Serviço',
                      'Unidade Predial',
                      'Observações',
                      'Outras informações',
                    ])}
                  />
                </>
              );
            })()}
            {detail.nfAttachment || detail.xmlAttachment ? (
              <DetailInfoSection title="Anexos">
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {(
                    [
                      { att: detail.nfAttachment, label: 'Nota fiscal (PDF ou imagem)' },
                      { att: detail.xmlAttachment, label: 'XML da nota fiscal' },
                    ] as const
                  )
                    .filter((row) => !!row.att)
                    .map(({ att, label }) => (
                      <div key={label} className="space-y-2 py-3">
                        <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{label}</p>
                        <div className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="min-w-[12rem] grow break-all text-gray-900 dark:text-gray-100">
                            {att!.name} ({humanFileSize(att!.size)})
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDownloadAttachment(att!)}
                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
                          >
                            Baixar
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              </DetailInfoSection>
            ) : null}
            <DetailInfoActions>
              <button
                type="button"
                onClick={() => handleExportPdf(detail)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              >
                Exportar PDF
              </button>
            </DetailInfoActions>
          </div>
        ) : null}
      </Modal>
    </PageStack>
  );
}
