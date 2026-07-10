'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, FileDown, FileSpreadsheet } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { formatOsSePastaOrDash } from '@/lib/formatOsSePasta';
import { pleitoStatusReadOnlySpanClass } from '@/lib/pleitoStatusStyles';
import { Loading } from '@/components/ui/Loading';
import { formatDateTimeBr } from '@/lib/dateTimeBr';
import {
  exportHistoricoOsPdf,
  exportPleitosOsToXlsx,
  computeHistoricoOsTotals,
  getOsEtiquetaAbertura,
  getOsFaturamentoAcumulado,
  getOsStatusFaturamentoPct,
  getPleitoCreationMonth,
  getPleitoCreationYear,
  getPleitoOrcamentoValor,
  getPleitoOsSituacao,
  type BillingForOsCheck,
  type PleitoOsExportRow,
} from '@/lib/pleitoOsExport';

const MESES_OPCOES = [
  { value: 1, label: 'Janeiro' },
  { value: 2, label: 'Fevereiro' },
  { value: 3, label: 'Março' },
  { value: 4, label: 'Abril' },
  { value: 5, label: 'Maio' },
  { value: 6, label: 'Junho' },
  { value: 7, label: 'Julho' },
  { value: 8, label: 'Agosto' },
  { value: 9, label: 'Setembro' },
  { value: 10, label: 'Outubro' },
  { value: 11, label: 'Novembro' },
  { value: 12, label: 'Dezembro' },
];

function formatDate(dateStr: string | null | undefined) {
  if (!dateStr) return '—';
  const raw = String(dateStr).trim();
  const only = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = only
    ? new Date(Number(only[1]), Number(only[2]) - 1, Number(only[3]), 12, 0, 0, 0)
    : new Date(raw);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function situacaoBadgeClass(situacao: string): string {
  if (situacao === 'Concluída') return 'bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100';
  if (situacao === 'Aberta') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300';
  if (situacao === 'Faturado') return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300';
  if (situacao === 'Gerado 100%') return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300';
  if (situacao === 'Pleito gerado' || situacao === 'Pleito parcial') {
    return 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300';
  }
  return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300';
}

function toggleInSet<T>(set: Set<T>, value: T, checked: boolean): Set<T> {
  const next = new Set(set);
  if (checked) next.add(value);
  else next.delete(value);
  return next;
}

function CheckboxFilterDropdown<T extends string | number>({
  title,
  options,
  selected,
  onChange,
  allLabel = 'Marcar todos',
  noneLabel = 'Limpar',
  minWidth = '11rem',
}: {
  title: string;
  options: { value: T; label: string }[];
  selected: Set<T>;
  onChange: (next: Set<T>) => void;
  allLabel?: string;
  noneLabel?: string;
  minWidth?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        style={{ minWidth }}
      >
        <span className="truncate">{title}</span>
        {selected.size > 0 ? (
          <span className="rounded-full bg-blue-100 px-1.5 text-xs font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
            {selected.size}
          </span>
        ) : null}
        <ChevronDown className="h-4 w-4 shrink-0 opacity-60" />
      </button>
      {open ? (
        <div className="absolute left-0 z-20 mt-1 max-h-64 w-64 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2 shadow-lg dark:border-gray-700 dark:bg-gray-800">
          <div className="mb-2 flex gap-2 border-b border-gray-100 pb-2 dark:border-gray-700">
            <button
              type="button"
              className="text-xs text-blue-600 hover:underline dark:text-blue-400"
              onClick={() => onChange(new Set(options.map((o) => o.value)))}
            >
              {allLabel}
            </button>
            <button
              type="button"
              className="text-xs text-gray-500 hover:underline dark:text-gray-400"
              onClick={() => onChange(new Set())}
            >
              {noneLabel}
            </button>
          </div>
          {options.map((opt) => (
            <label
              key={String(opt.value)}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700/50"
            >
              <input
                type="checkbox"
                checked={selected.has(opt.value)}
                onChange={(e) => onChange(toggleInSet(selected, opt.value, e.target.checked))}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="truncate text-gray-800 dark:text-gray-200">{opt.label}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type ContractHistoricoOsPanelProps = {
  contractId: string;
};

export function ContractHistoricoOsPanel({ contractId }: ContractHistoricoOsPanelProps) {
  const [search, setSearch] = useState('');
  const [selectedYears, setSelectedYears] = useState<Set<number>>(new Set());
  const [selectedMonths, setSelectedMonths] = useState<Set<number>>(new Set());
  const [selectedOsIds, setSelectedOsIds] = useState<Set<string>>(new Set());
  const [exportingPdf, setExportingPdf] = useState(false);

  const { data: contractData, isLoading: loadingContract } = useQuery({
    queryKey: ['contract', contractId],
    queryFn: async () => {
      const res = await api.get(`/contracts/${contractId}`);
      return res.data;
    },
    enabled: !!contractId,
  });

  const { data: pleitosData, isLoading: loadingPleitos } = useQuery({
    queryKey: ['contract-pleitos', contractId],
    queryFn: async () => {
      const res = await api.get(`/contracts/${contractId}/pleitos`);
      return res.data;
    },
    enabled: !!contractId,
  });

  const { data: billingsData, isLoading: loadingBillings } = useQuery({
    queryKey: ['contract-billings', contractId],
    queryFn: async () => {
      const res = await api.get(`/contracts/${contractId}/billings`);
      return res.data;
    },
    enabled: !!contractId,
  });

  const billingsForOs = useMemo(() => {
    const rows = (billingsData as { data?: BillingForOsCheck[] } | undefined)?.data || [];
    return rows as BillingForOsCheck[];
  }, [billingsData]);

  const allOs = useMemo(() => {
    const raw =
      (Array.isArray(pleitosData)
        ? pleitosData
        : (pleitosData as { data?: PleitoOsExportRow[] })?.data) || [];
    return [...raw].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });
  }, [pleitosData]);

  const yearOptions = useMemo(() => {
    const years = new Set<number>();
    allOs.forEach((p) => {
      const y = getPleitoCreationYear(p);
      if (y) years.add(y);
    });
    return Array.from(years)
      .sort((a, b) => b - a)
      .map((y) => ({ value: y, label: String(y) }));
  }, [allOs]);

  const monthOptions = useMemo(() => {
    const months = new Set<number>();
    allOs.forEach((p) => {
      const m = getPleitoCreationMonth(p);
      if (m) months.add(m);
    });
    return MESES_OPCOES.filter((m) => months.has(m.value));
  }, [allOs]);

  const osOptions = useMemo(
    () =>
      allOs.map((p) => ({
        value: p.id,
        label: formatOsSePastaOrDash(p.divSe, p.folderNumber),
      })),
    [allOs]
  );

  const filteredOs = useMemo(() => {
    return allOs.filter((p) => {
      if (selectedYears.size > 0) {
        const y = getPleitoCreationYear(p);
        if (y == null || !selectedYears.has(y)) return false;
      }
      if (selectedMonths.size > 0) {
        const m = getPleitoCreationMonth(p);
        if (m == null || !selectedMonths.has(m)) return false;
      }
      if (selectedOsIds.size > 0 && !selectedOsIds.has(p.id)) return false;
      const q = search.trim().toLowerCase();
      if (!q) return true;
      const os = formatOsSePastaOrDash(p.divSe, p.folderNumber).toLowerCase();
      const desc = (p.serviceDescription || '').toLowerCase();
      const etiqueta = getOsEtiquetaAbertura(p, billingsForOs).toLowerCase();
      const situacao = getPleitoOsSituacao(p, billingsForOs).toLowerCase();
      return os.includes(q) || desc.includes(q) || etiqueta.includes(q) || situacao.includes(q);
    });
  }, [allOs, selectedYears, selectedMonths, selectedOsIds, search, billingsForOs]);

  const totals = useMemo(
    () => computeHistoricoOsTotals(filteredOs, billingsForOs),
    [filteredOs, billingsForOs]
  );

  const contract = (contractData as { data?: { name: string; number: string } } | undefined)?.data;

  const handleExportExcel = () => {
    if (filteredOs.length === 0) {
      toast.error('Não há ordens de serviço para exportar.');
      return;
    }
    try {
      const contractSlug = contract?.number?.replace(/[^\w-]+/g, '_') || contractId.slice(0, 8);
      exportPleitosOsToXlsx(filteredOs, billingsForOs, `historico-os-${contractSlug}`);
      toast.success(`${filteredOs.length} ordem(ns) exportada(s) para Excel.`);
    } catch {
      toast.error('Erro ao exportar para Excel.');
    }
  };

  const handleExportPdf = async () => {
    if (allOs.length === 0) {
      toast.error('Não há ordens de serviço para exportar.');
      return;
    }
    setExportingPdf(true);
    try {
      const contractSlug = contract?.number?.replace(/[^\w-]+/g, '_') || contractId.slice(0, 8);
      await exportHistoricoOsPdf(allOs, billingsForOs, {
        contractName: contract?.name,
        contractNumber: contract?.number,
        filenamePrefix: `historico-os-${contractSlug}`,
      });
      toast.success(`PDF gerado com ${allOs.length} ordem(ns) de serviço.`);
    } catch {
      toast.error('Erro ao gerar PDF.');
    } finally {
      setExportingPdf(false);
    }
  };

  if (loadingContract || loadingPleitos || loadingBillings) {
    return <Loading message="Carregando histórico..." />;
  }

  return (
    <div className="space-y-4">
      {contract ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {contract.number} – {contract.name}
        </p>
      ) : null}
      <p className="text-sm text-gray-600 dark:text-gray-400">
        Todas as ordens de serviço cadastradas neste contrato.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar descrição ou situação…"
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 sm:w-56"
        />
        <button
          type="button"
          onClick={handleExportExcel}
          disabled={filteredOs.length === 0}
          className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FileSpreadsheet className="h-4 w-4" />
          Exportar Excel
        </button>
        <button
          type="button"
          onClick={handleExportPdf}
          disabled={allOs.length === 0 || exportingPdf}
          className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <FileDown className="h-4 w-4" />
          {exportingPdf ? 'Gerando PDF…' : 'Exportar PDF'}
        </button>
      </div>
      {allOs.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <CheckboxFilterDropdown
            title="Ano de criação"
            options={yearOptions}
            selected={selectedYears}
            onChange={setSelectedYears}
          />
          <CheckboxFilterDropdown
            title="Mês de criação"
            options={monthOptions}
            selected={selectedMonths}
            onChange={setSelectedMonths}
            minWidth="12rem"
          />
          <CheckboxFilterDropdown
            title="OS / SE"
            options={osOptions}
            selected={selectedOsIds}
            onChange={setSelectedOsIds}
            minWidth="14rem"
          />
        </div>
      ) : null}
      {filteredOs.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900/50">
            <p className="text-xs text-gray-500 dark:text-gray-400">Total orçado (filtro)</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {formatCurrency(totals.totalOrcado)}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900/50">
            <p className="text-xs text-gray-500 dark:text-gray-400">Total pleiteado (filtro)</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {formatCurrency(totals.totalPleiteado)}
            </p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900/50">
            <p className="text-xs text-gray-500 dark:text-gray-400">Total faturado (filtro)</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {formatCurrency(totals.totalFaturado)}
            </p>
          </div>
        </div>
      ) : null}
      {allOs.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">Nenhuma ordem de serviço cadastrada.</p>
      ) : filteredOs.length === 0 ? (
        <p className="text-gray-500 dark:text-gray-400">Nenhuma OS encontrada com os filtros selecionados.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900/50">
          <table className="w-full min-w-[1200px] text-sm">
            <thead className="border-b border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-gray-800">
              <tr>
                <th className="whitespace-nowrap px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">
                  Etiqueta
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">
                  Situação pleito
                </th>
                <th className="min-w-[10rem] whitespace-nowrap px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">
                  OS / SE
                </th>
                <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">Descrição</th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-medium text-gray-700 dark:text-gray-300">
                  Orçamento
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-right font-medium text-gray-700 dark:text-gray-300">
                  Valor pleiteado
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-center font-medium text-gray-700 dark:text-gray-300">
                  Fat. (%)
                </th>
                <th className="whitespace-nowrap px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-300">
                  Preenchimento
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredOs.map((p) => {
                const etiqueta = getOsEtiquetaAbertura(p, billingsForOs);
                const situacaoPleito = getPleitoOsSituacao(p, billingsForOs);
                const valorPleiteado = p.billingRequest ? Number(p.billingRequest) : 0;
                const statusFatPct = getOsStatusFaturamentoPct(p, billingsForOs);
                const orcamentoNum = getPleitoOrcamentoValor(p);
                return (
                  <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/40">
                    <td className="whitespace-nowrap px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${situacaoBadgeClass(etiqueta)}`}
                      >
                        {etiqueta}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${situacaoBadgeClass(situacaoPleito)}`}
                      >
                        {situacaoPleito}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 font-medium text-gray-900 dark:text-gray-100">
                      {formatOsSePastaOrDash(p.divSe, p.folderNumber)}
                    </td>
                    <td
                      className="max-w-xs truncate px-3 py-2 text-gray-900 dark:text-gray-100"
                      title={p.serviceDescription || ''}
                    >
                      {p.serviceDescription || '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-gray-900 dark:text-gray-100">
                      {orcamentoNum > 0 ? formatCurrency(orcamentoNum) : p.budget || '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-gray-900 dark:text-gray-100">
                      {formatCurrency(valorPleiteado)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-center text-gray-900 dark:text-gray-100">
                      {statusFatPct != null ? `${statusFatPct.toFixed(1)}%` : '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-500 dark:text-gray-400">
                      {formatDateTimeBr(p.createdAt, '—')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {filteredOs.length > 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Exibindo {filteredOs.length} de {allOs.length} ordem(ns) de serviço.
        </p>
      ) : null}
    </div>
  );
}
