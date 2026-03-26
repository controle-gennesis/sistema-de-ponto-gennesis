'use client';

export const dynamic = 'force-dynamic';

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import {
  BarChart3,
  Loader2,
  RefreshCw,
  AlertCircle,
  Building2,
  Search,
  Filter,
  Eye,
  FileText,
  RotateCcw,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Layers,
  Truck,
  X,
} from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { MainLayout } from '@/components/layout/MainLayout';
import { Loading } from '@/components/ui/Loading';
import { useCostCenters } from '@/hooks/useCostCenters';
import api from '@/lib/api';

const BI_DATASETS = ['DataSet_G3FollowUp', 'DataSet_G4FollowUp', 'DataSet_G5FollowUp'] as const;

const DATASET_TAB_LABELS: Record<(typeof BI_DATASETS)[number], string> = {
  DataSet_G3FollowUp: 'G3',
  DataSet_G4FollowUp: 'G4',
  DataSet_G5FollowUp: 'G5',
};

const FILIAIS_PERMITIDAS = [
  '1 - GENNESIS ENGENHARIA E CONSULTORIA LTDA',
  '2 - GENNESIS ENGENHARIA E CONSULTORIA LTDA',
  '3 - GENNESIS ENGENHARIA E CONSULTORIA LTDA',
  '4 - GENNESIS ENGENHARIA E CONSULTORIA LTDA',
  '5 - GENNESIS ENGENHARIA E CONSULTORIA LTDA',
] as const;

const LABEL_ABBREV: Record<string, string> = {
  cod: 'Código',
  nr: 'Número',
  num: 'Número',
  seq: 'Sequência',
  movto: 'Movimento',
  ant: 'Anterior',
  def: 'Definição',
  proces: 'Processo',
  aprovacao: 'Aprovação',
  identificador: 'Identificador',
  documento: 'Documento',
  card: 'Cartão',
  estado: 'Estado',
  tipo: 'Tipo',
  produtos: 'Produtos',
  mobile: 'Mobile',
  cc: 'Centro de custo',
  start: 'Início',
  end: 'Fim',
  date: 'Data',
  time: 'Hora',
  datetime: 'Data e hora',
};

function formatLabel(key: string): string {
  let label = key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .toLowerCase()
    .trim();
  label = label.replace(/\b\w+/g, (word) => LABEL_ABBREV[word] ?? word.replace(/\b\w/, (c) => c.toUpperCase()));
  label = label.replace(/^Código\s+/g, 'Código de ');
  return label;
}

function parseFluigDateTime(val: unknown): Date | null {
  if (val instanceof Date) return val;
  const s = String(val ?? '').trim();
  if (!s) return null;
  const match = s.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/);
  const iso = match ? `${match[1]}T${match[2]}` : s.replace(' ', 'T');
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function formatLeadTime(from: Date | null): string {
  if (!from) return '—';
  const now = new Date();
  let diffMs = now.getTime() - from.getTime();
  if (diffMs <= 0) return '0 min';
  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 && days === 0) parts.push(`${minutes}min`);
  return parts.length > 0 ? parts.join(' ') : '0 min';
}

function formatValue(val: unknown): string {
  if (val == null) return '—';
  if (typeof val === 'boolean') return val ? 'Sim' : 'Não';
  if (val instanceof Date) return val.toLocaleString('pt-BR');
  if (typeof val === 'object' && val !== null) {
    const o = val as Record<string, unknown>;
    const v = o.display ?? o.displayValue ?? o.value ?? o.internalValue;
    return v != null ? String(v) : '—';
  }
  return String(val);
}

export default function BIPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState(0);
  const [selectedFiliais, setSelectedFiliais] = useState<string[]>([]);
  const [selectedCCs, setSelectedCCs] = useState<string[]>([]);
  const [selectedFornecedores, setSelectedFornecedores] = useState<string[]>([]);
  const [selectedFiliaisSearch, setSelectedFiliaisSearch] = useState('');
  const [selectedCCSearch, setSelectedCCSearch] = useState('');
  const [selectedFornecedoresSearch, setSelectedFornecedoresSearch] = useState('');
  const [showFilialDropdown, setShowFilialDropdown] = useState(false);
  const [showCCDropdown, setShowCCDropdown] = useState(false);
  const [showFornecedorDropdown, setShowFornecedorDropdown] = useState(false);
  const [isFiltersMinimized, setIsFiltersMinimized] = useState(true);
  const [searchText, setSearchText] = useState('');
  // Quando o usuário mexe em um filtro (Filial/CC/Fornecedor), ele vira o "ativo".
  // Os outros ficam temporariamente ignorados no resultado para evitar influência cruzada.
  const [activeFilterCategory, setActiveFilterCategory] = useState<'filial' | 'cc' | 'fornecedor' | null>(null);
  const [selectedEtapaIndex, setSelectedEtapaIndex] = useState(0);
  const [compactView, setCompactView] = useState(true);
  const [recordsPerPage, setRecordsPerPage] = useState<25 | 50 | 100>(25);
  const [currentPage, setCurrentPage] = useState(0);
  const [detail, setDetail] = useState<{
    row: Record<string, unknown>;
    columns: string[];
    datasetId: string;
  } | null>(null);

  const [{ data: userData, isLoading: loadingUser }] = useQueries({
    queries: [
      {
        queryKey: ['user'],
        queryFn: async () => {
          const res = await api.get('/auth/me');
          return res.data;
        },
      },
    ],
  });

  const { costCenters: dbCostCenters } = useCostCenters();

  const datasetId = BI_DATASETS[activeTab];

  const normalizeStatus = (rawStatus: string): { key: string; label: string } => {
    const s = rawStatus.trim();

    if (datasetId === 'DataSet_G3FollowUp') {
      if (/Etapa\s*108\b/i.test(s)) {
        return { key: 'G3_ETAPA_108_ANALISE_CONTROLADORIA', label: 'Análise Controladoria' };
      }
      if (/Etapa\s*10\b/i.test(s)) {
        return { key: 'G3_ETAPA_10_FINALIZADA', label: 'Finalizada' };
      }
    }

    if (datasetId === 'DataSet_G4FollowUp') {
      if (/Etapa\s*24\b/i.test(s) || /Etapa\s*147\b/i.test(s)) {
        return { key: 'G4_ETAPAS_FINALIZADA_24_147', label: 'Finalizada' };
      }
    }

    if (datasetId === 'DataSet_G5FollowUp') {
      if (/Etapa\s*390\b/i.test(s)) {
        return { key: 'G5_ETAPA_390_ANEXAR_NF', label: 'Anexar NF' };
      }
    }

    return { key: s || '(sem etapa)', label: s || '(sem etapa)' };
  };

  const ccCodeToName = useMemo(() => {
    const map = new Map<string, string>();
    (dbCostCenters || []).forEach((cc: { code?: string; name?: string }) => {
      const code = String(cc.code ?? '').trim();
      const name = String(cc.name ?? '').trim();
      if (code) map.set(code, name || code);
      if (code) map.set(code.replace(/\s+/g, ''), name || code);
    });
    return map;
  }, [dbCostCenters]);

  const getCCDisplayLabel = (code: string): string => {
    const c = String(code).trim();
    const dashIdx = c.indexOf(' - ');
    const codeOnly = dashIdx >= 0 ? c.slice(0, dashIdx).trim() : c;
    const nameFromValue = dashIdx >= 0 ? c.slice(dashIdx + 3).trim() : '';
    let name = ccCodeToName.get(codeOnly) || ccCodeToName.get(c) || ccCodeToName.get(codeOnly.replace(/\s+/g, ''));
    if (name && /^[\d.]+\s*-\s*/.test(name)) name = name.replace(/^[\d.]+\s*-\s*/, '').trim();
    if (name) return name;
    if (nameFromValue) return nameFromValue;
    return c;
  };

  const datasetQueries = useQueries({
    queries: BI_DATASETS.map((datasetId) => ({
      queryKey: ['fluig-dataset', datasetId],
      queryFn: async () => {
        const res = await api.post(`/fluig/datasets/${datasetId}/data`, {}, {
          timeout: 130000,
        });
        return res.data;
      },
    })),
  });

  const loadingData = datasetQueries.some((q) => q.isLoading);
  const isFetching = datasetQueries.some((q) => q.isFetching);
  const refetchData = () => {
    queryClient.refetchQueries({ queryKey: ['fluig-dataset'] });
  };
  const hasError = datasetQueries.some((q) => q.error);

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const handleDatasetTabClick = (idx: number) => {
    setActiveTab(idx);
    // Resetar estado de visualização e busca ao trocar de dataset
    setSelectedEtapaIndex(0);
    setCurrentPage(0);
    setSearchText('');
    setActiveFilterCategory(null);
  };

  function buildStatusList(values: Record<string, unknown>[], columns: string[]) {
    const statusCol =
      columns.find((c: string) => /^Etapa_Atual$/i.test(c))
      ?? columns.find((c: string) => /^EtapaAtual$/i.test(c))
      ?? columns.find((c: string) => /^fase_Atual$/i.test(c))
      ?? columns.find((c: string) => /^faseAtual$/i.test(c))
      ?? columns.find((c: string) => /^STATUS$/i.test(c))
      ?? null;
    const idCol =
      columns.find((c: string) => /^IdMov$|^idmov$/i.test(c))
      ?? columns.find((c: string) => /^NUM_PROCES$/i.test(c))
      ?? columns.find((c: string) => /^NUM_SEQ_ESTADO$/i.test(c))
      ?? 'IdMov';
    const historicoCol =
      columns.find((c: string) => /historico/i.test(c))
      ?? columns.find((c: string) => /^titulo_solicitacao$/i.test(c))
      ?? columns.find((c: string) => /^descricao$/i.test(c))
      ?? 'historico';
    const byStatus: Record<string, { label: string; rows: Record<string, unknown>[] }> = {};
    if (statusCol) {
      values.forEach((row: Record<string, unknown>) => {
        const rawStatus = String(row[statusCol] ?? '(sem etapa)');
        const { key, label } = normalizeStatus(rawStatus);
        if (!byStatus[key]) byStatus[key] = { label, rows: [] };
        byStatus[key].rows.push(row);
      });
    }
    if (Object.keys(byStatus).length === 0 && values.length > 0) {
      byStatus['(todos)'] = { label: '(todos)', rows: values };
    }
    const statusList = Object.values(byStatus)
      .map(({ label, rows }) => [label, rows] as const)

    // Ordenar etapas por fluxo (G3/G4) em vez de ordenar por quantidade.
    if (datasetId === 'DataSet_G3FollowUp' || datasetId === 'DataSet_G4FollowUp') {
      const norm = (s: string) =>
        s
          .toLowerCase()
          .normalize('NFD')
          // Evita \p{Diacritic} (Unicode property escapes), que pode falhar no build dependendo do target TS.
          // NFD separa acentos em marks na faixa U+0300..U+036F.
          .replace(/[\u0300-\u036f]/g, '');

      const stageOrderIndex = (label: string): number => {
        const l = norm(label);

        // G3: Gestor de Compras -> Aprovação Setor Técnico -> Aprovação da diretoria -> Finalizada
        if (datasetId === 'DataSet_G3FollowUp') {
          if (l.includes('finalizada')) return 3;
          if (l.includes('diretoria')) return 2;
          if (l.includes('setor tecnico')) return 1;
          if (l.includes('gestor de compras')) return 0;
          return 999;
        }

        // G4: Anexar Comprovante -> Validação Compras -> Anexar Nota Fiscal -> Finalizada
        if (datasetId === 'DataSet_G4FollowUp') {
          if (l.includes('finalizada')) return 3;
          if (l.includes('nota fiscal') || l.includes('nf')) return 2;
          if (l.includes('validacao') || l.includes('validacao compras') || l.includes('validacao compras')) return 1;
          if (l.includes('comprovante')) return 0;
          return 999;
        }

        return 999;
      };

      statusList.sort((a, b) => stageOrderIndex(a[0]) - stageOrderIndex(b[0]));
    } else {
      statusList.sort(([, a], [, b]) => b.length - a.length);
    }
    return { statusList, idCol, historicoCol, statusCol };
  }

  const currentQuery = datasetQueries[activeTab];
  const currentContent = currentQuery?.data?.data?.content;
  const currentValues = (currentContent?.values || []) as Record<string, unknown>[];
  const currentColumns = (currentContent?.columns || (currentValues[0] ? Object.keys(currentValues[0]) : [])) as string[];

  const filialCol = useMemo(
    () =>
      currentColumns.find((c: string) => /^filial$/i.test(c)) ??
      currentColumns.find((c: string) => /filial/i.test(c)) ??
      null,
    [currentColumns]
  );

  const getFilialValue = (row: Record<string, unknown>): string => {
    if (!filialCol) return '';
    const val = row[filialCol];
    if (val != null && typeof val === 'object') {
      const o = val as Record<string, unknown>;
      return String(o.display ?? o.displayValue ?? o.value ?? o.internalValue ?? val).trim();
    }
    return String(val ?? '').trim();
  };

  const currentValuesFilteredByFilial = useMemo(() => {
    if (!filialCol || currentValues.length === 0) return currentValues;
    const allowedSet = new Set<string>(FILIAIS_PERMITIDAS);
    return currentValues.filter((row) => allowedSet.has(getFilialValue(row)));
  }, [currentValues, filialCol]);

  const isLeadTimeEnabled = datasetId === 'DataSet_G3FollowUp' || datasetId === 'DataSet_G4FollowUp';

  const movimentoDataHoraCol = useMemo(() => {
    if (!isLeadTimeEnabled) return null;
    const byLabel = currentColumns.find((c) => {
      const label = formatLabel(c).toLowerCase();
      return label === 'movimento data hora' || (/movimento/.test(label) && /data/.test(label) && /hora/.test(label));
    });
    if (byLabel) return byLabel;
    return currentColumns.find((c) => /movimento.*data.*hora|data.*hora.*movimento/i.test(c)) ?? null;
  }, [currentColumns, isLeadTimeEnabled]);

  const getLeadTimeFromRow = (row: Record<string, unknown>): string => {
    if (!isLeadTimeEnabled || !movimentoDataHoraCol) return '—';
    const val = row[movimentoDataHoraCol];
    const date = parseFluigDateTime(val);
    return formatLeadTime(date);
  };

  const { statusList: fullStatusList, idCol, historicoCol, statusCol } = useMemo(
    () => buildStatusList(currentValuesFilteredByFilial, currentColumns),
    [currentValuesFilteredByFilial, currentColumns, datasetId]
  );
  const ccColFromColumns = currentColumns.find((c: string) => {
    const t = c.trim();
    return (
      /^cc$/i.test(t) ||
      /^contrato$/i.test(t) ||
      /ccusto|cc_custo|centro[\s_-]?custo|centrocusto|cod[\s_-]?ccusto/i.test(t) ||
      /centro\s+de\s+custo\s+mecanismo/i.test(t) ||
      /custo\s+mecanismo|centro.*custo.*mecanismo/i.test(t)
    );
  }) ?? null;
  const fornecedorCol = currentColumns.find((c: string) => /^fornecedor$/i.test(c)) ?? null;

  // Resolve coluna CC: usa columns, ou busca nas chaves reais das linhas (G4 usa "Centro De Custo Mecanismo")
  const ccColResolved = useMemo(() => {
    const first = currentValues[0] as Record<string, unknown> | undefined;
    if (!first) return ccColFromColumns;

    const matchesCustoMecanismo = (k: string) => {
      const n = k.toLowerCase().replace(/\s+/g, ' ');
      return n.includes('centro') && n.includes('custo') && n.includes('mecanismo');
    };

    if (ccColFromColumns && first[ccColFromColumns] != null) return ccColFromColumns;
    const fromRowKeys = Object.keys(first).find(matchesCustoMecanismo)
      ?? Object.keys(first).find((k) => k.trim().toLowerCase() === 'contrato');
    return fromRowKeys ?? ccColFromColumns;
  }, [ccColFromColumns, currentValues]);

  const filiais = useMemo(() => {
    if (!filialCol) return [];
    const set = new Set<string>();
    currentValuesFilteredByFilial.forEach((row: Record<string, unknown>) => {
      const v = getFilialValue(row);
      if (v) set.add(v);
    });
    return Array.from(set).sort();
  }, [currentValuesFilteredByFilial, filialCol]);

  const getCCValue = (row: Record<string, unknown>): string => {
    if (!ccColResolved) return '';
    let val = row[ccColResolved];
    if (val != null && typeof val === 'object') {
      const o = val as Record<string, unknown>;
      val = o.display ?? o.displayValue ?? o.internalValue ?? o.value ?? val;
    }
    return String(val ?? '').trim();
  };

  const centrosCusto = useMemo(() => {
    if (!ccColResolved) return [];
    const set = new Set<string>();
    currentValuesFilteredByFilial.forEach((row) => {
      const v = getCCValue(row);
      if (v) set.add(v);
    });
    return Array.from(set).sort();
  }, [currentValuesFilteredByFilial, ccColResolved]);

  const fornecedores = useMemo(() => {
    if (!fornecedorCol) return [];
    const set = new Set<string>();
    currentValuesFilteredByFilial.forEach((row: Record<string, unknown>) => {
      const v = String(row[fornecedorCol] ?? '').trim();
      if (v) set.add(v);
    });
    return Array.from(set).sort();
  }, [currentValuesFilteredByFilial, fornecedorCol]);

  const filialRef = useRef<HTMLDivElement>(null);
  const ccRef = useRef<HTMLDivElement>(null);
  const fornecedorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (filialRef.current && !filialRef.current.contains(e.target as Node)) setShowFilialDropdown(false);
      if (ccRef.current && !ccRef.current.contains(e.target as Node)) setShowCCDropdown(false);
      if (fornecedorRef.current && !fornecedorRef.current.contains(e.target as Node)) setShowFornecedorDropdown(false);
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // Marcar todos os filtros por padrão apenas quando a lista de opções muda (troca de dataset/dados), não quando o usuário altera a seleção
  useEffect(() => {
    if (filiais.length > 0) {
      setSelectedFiliais(filiais);
    } else {
      setSelectedFiliais([]);
    }
    if (centrosCusto.length > 0) {
      setSelectedCCs(centrosCusto);
    } else {
      setSelectedCCs([]);
    }
    if (fornecedores.length > 0) {
      setSelectedFornecedores(fornecedores);
    } else {
      setSelectedFornecedores([]);
    }
  }, [filiais, centrosCusto, fornecedores]);

  const hasActiveFilters =
    searchText.trim() !== '' ||
    (filialCol && filiais.length > 0 && (selectedFiliais.length === 0 || selectedFiliais.length < filiais.length)) ||
    (ccColResolved && centrosCusto.length > 0 && (selectedCCs.length === 0 || selectedCCs.length < centrosCusto.length)) ||
    (fornecedorCol && fornecedores.length > 0 && (selectedFornecedores.length === 0 || selectedFornecedores.length < fornecedores.length));

  const filteredStatusList = useMemo(() => {
    const search = searchText.trim().toLowerCase();
    const applyFilial = activeFilterCategory === 'filial';
    const applyCC = activeFilterCategory === 'cc';
    const applyFornecedor = activeFilterCategory === 'fornecedor';

    const byFiliais = applyFilial && selectedFiliais.length > 0 ? new Set(selectedFiliais) : null;
    const byCCs = applyCC && selectedCCs.length > 0 ? new Set(selectedCCs) : null;
    const byFornecedores = applyFornecedor && selectedFornecedores.length > 0 ? new Set(selectedFornecedores) : null;

    const matchRow = (row: Record<string, unknown>) => {
      // Aplica SOMENTE a categoria de filtro ativa; as outras não "interferem" no resultado.
      if (applyFilial && filialCol && filiais.length > 0 && selectedFiliais.length === 0) return false;
      if (applyCC && ccColResolved && centrosCusto.length > 0 && selectedCCs.length === 0) return false;
      if (applyFornecedor && fornecedorCol && fornecedores.length > 0 && selectedFornecedores.length === 0) return false;

      if (byFiliais && filialCol && !byFiliais.has(getFilialValue(row))) return false;
      if (byCCs && ccColResolved && !byCCs.has(getCCValue(row))) return false;
      if (byFornecedores && fornecedorCol && !byFornecedores.has(String(row[fornecedorCol] ?? '').trim()))
        return false;
      if (search) {
        const found = currentColumns.some((col) => {
          const val = row[col];
          const str = val != null && typeof val === 'object'
            ? String((val as Record<string, unknown>).display ?? (val as Record<string, unknown>).displayValue ?? (val as Record<string, unknown>).value ?? val)
            : String(val ?? '');
          return str.toLowerCase().includes(search);
        });
        if (!found) return false;
      }
      return true;
    };

    return fullStatusList.map(([etapa, rows]) => {
      const filtered = rows.filter(matchRow);
      return [etapa, filtered] as const;
    });
  }, [
    fullStatusList,
    selectedFiliais,
    selectedCCs,
    selectedFornecedores,
    searchText,
    currentColumns,
    filialCol,
    ccColResolved,
    fornecedorCol,
    filiais.length,
    centrosCusto.length,
    fornecedores.length,
    activeFilterCategory,
  ]);

  useEffect(() => {
    setSelectedEtapaIndex((prev) => Math.min(prev, Math.max(0, filteredStatusList.length - 1)));
  }, [filteredStatusList.length]);

  useEffect(() => {
    setCurrentPage(0);
  }, [selectedEtapaIndex, recordsPerPage]);

  const handleClearFilters = () => {
    setSelectedFiliais([...filiais]);
    setSelectedCCs([...centrosCusto]);
    setSelectedFornecedores([...fornecedores]);
    setSelectedFiliaisSearch('');
    setSelectedCCSearch('');
    setSelectedFornecedoresSearch('');
    setSearchText('');
    setActiveFilterCategory(null);
  };

  if (loadingUser || !userData) {
    return <Loading message="Carregando..." fullScreen size="lg" />;
  }

  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };
  const error = currentQuery?.error;
  const isEmpty = currentValues.length === 0;

  return (
    <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
      <div className="space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100">
            Solicitações Fluig
          </h1>
          <p className="mt-2 text-sm sm:text-base text-gray-600 dark:text-gray-400">
            Veja em qual etapa está cada solicitação e acompanhe o andamento em tempo real
          </p>
        </div>

        {/* Card: Processos + Atualizar */}
        <Card>
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center space-x-2">
                <BarChart3 className="w-5 h-5 text-gray-900 dark:text-gray-100" />
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Processos</h3>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex gap-1 p-1 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
                  {BI_DATASETS.map((ds, idx) => (
                    <button
                      key={ds}
                      onClick={() => handleDatasetTabClick(idx)}
                      className={`px-4 py-2 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                        activeTab === idx
                          ? 'bg-white dark:bg-gray-700 text-red-600 dark:text-red-400 shadow-sm'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                      }`}
                    >
                      {DATASET_TAB_LABELS[ds]}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => refetchData()}
                  disabled={loadingData || isFetching}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors text-sm"
                >
                  {(loadingData || isFetching) ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                  Atualizar
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Card: Filtros — suspenso (expandir/minimizar) + multi-select com busca */}
        {!loadingData && !error && !isEmpty && (
          <Card>
            <CardHeader className="border-b-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Filter className="w-5 h-5 text-gray-900 dark:text-gray-100" />
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Filtro</h3>
                </div>
                <div className="flex items-center space-x-4">
                  {!isFiltersMinimized && (
                    <button
                      onClick={handleClearFilters}
                      className="flex items-center justify-center w-8 h-8 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                      title="Limpar todos os filtros"
                    >
                      <RotateCcw className="w-5 h-5" />
                    </button>
                  )}
                  <button
                    onClick={() => setIsFiltersMinimized(!isFiltersMinimized)}
                    className="flex items-center justify-center w-8 h-8 text-gray-900 dark:text-gray-100 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    title={isFiltersMinimized ? 'Expandir filtros' : 'Minimizar filtros'}
                  >
                    {isFiltersMinimized ? (
                      <ChevronDown className="w-5 h-5" />
                    ) : (
                      <ChevronUp className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>
            </CardHeader>
            {!isFiltersMinimized && (
              <CardContent className="p-4 sm:p-6 w-full">
                <div className="space-y-4 w-full">
                  <div className="flex flex-wrap gap-4 w-full">
                    {filialCol && (
                      <div ref={filialRef} className="relative flex-1 min-w-[180px]">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Filial</label>
                        <div className="relative">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowFilialDropdown((v) => !v);
                              setShowCCDropdown(false);
                              setShowFornecedorDropdown(false);
                            }}
                            className="w-full h-10 pl-10 pr-11 text-left rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent relative"
                          >
                            <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4 pointer-events-none" />
                            <span className="block pr-6 text-sm truncate">
                              {selectedFiliais.length === 0
                                ? 'Nenhuma'
                                : selectedFiliais.length === filiais.length
                                  ? 'Todas'
                                  : `${selectedFiliais.length} selecionada(s)`}
                            </span>
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5 text-gray-400 dark:text-gray-500 pointer-events-none">
                              {showFilialDropdown ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </span>
                          </button>
                        </div>
                        {showFilialDropdown && (
                          <div className="absolute z-30 mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 shadow-lg p-3">
                            <input
                              type="text"
                              placeholder="Pesquisar..."
                              value={selectedFiliaisSearch}
                              onChange={(e) => setSelectedFiliaisSearch(e.target.value)}
                              className="mb-2 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400"
                            />
                            <div className="flex items-center gap-2 mb-2">
                              <label htmlFor="select-all-filial" className="flex items-center gap-3 cursor-pointer group">
                                <div className="relative">
                                  <input
                                    id="select-all-filial"
                                    type="checkbox"
                                    checked={selectedFiliais.length > 0 && selectedFiliais.length === filiais.length}
                                    onChange={(e) => {
                                      setActiveFilterCategory('filial');
                                      if (e.target.checked) setSelectedFiliais([...filiais]);
                                      else setSelectedFiliais([]);
                                    }}
                                    className="sr-only"
                                  />
                                  <div
                                    className={`w-5 h-5 rounded border-2 transition-all duration-200 flex items-center justify-center ${
                                      selectedFiliais.length > 0 && selectedFiliais.length === filiais.length
                                        ? 'bg-red-600 dark:bg-red-500 border-red-600 dark:border-red-500'
                                        : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 group-hover:border-red-500 dark:group-hover:border-red-400'
                                    }`}
                                  >
                                    {selectedFiliais.length > 0 && selectedFiliais.length === filiais.length && (
                                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                      </svg>
                                    )}
                                  </div>
                                </div>
                                <span className="text-sm text-gray-700 dark:text-gray-300">Selecionar tudo</span>
                              </label>
                            </div>
                            <div className="max-h-48 overflow-y-auto">
                              {filiais
                                .filter((f) => f.toLowerCase().includes(selectedFiliaisSearch.toLowerCase()))
                                .map((f) => {
                                  const checked = selectedFiliais.includes(f);
                                  return (
                                    <label key={f} className="flex items-center gap-3 py-1.5 cursor-pointer group">
                                      <div className="relative">
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={(e) => {
                                            e.stopPropagation();
                                            setActiveFilterCategory('filial');
                                            if (e.target.checked) setSelectedFiliais((prev) => Array.from(new Set([...prev, f])));
                                            else setSelectedFiliais((prev) => prev.filter((x) => x !== f));
                                          }}
                                          className="sr-only"
                                        />
                                        <div
                                          className={`w-5 h-5 rounded border-2 transition-all duration-200 flex items-center justify-center ${
                                            checked
                                              ? 'bg-red-600 dark:bg-red-500 border-red-600 dark:border-red-500'
                                              : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 group-hover:border-red-500 dark:group-hover:border-red-400'
                                          }`}
                                        >
                                          {checked && (
                                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                            </svg>
                                          )}
                                        </div>
                                      </div>
                                      <span className="text-sm text-gray-900 dark:text-gray-100">{f}</span>
                                    </label>
                                  );
                                })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {ccColResolved && (
                      <div ref={ccRef} className="relative flex-1 min-w-[180px]">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Centro de custo</label>
                        <div className="relative">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowCCDropdown((v) => !v);
                              setShowFilialDropdown(false);
                              setShowFornecedorDropdown(false);
                            }}
                            className="w-full h-10 pl-10 pr-11 text-left rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent relative"
                          >
                            <Layers className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4 pointer-events-none" />
                            <span className="block pr-6 text-sm truncate">
                              {selectedCCs.length === 0
                                ? 'Nenhum'
                                : selectedCCs.length === centrosCusto.length
                                  ? 'Todos'
                                  : `${selectedCCs.length} selecionado(s)`}
                            </span>
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5 text-gray-400 dark:text-gray-500 pointer-events-none">
                              {showCCDropdown ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </span>
                          </button>
                        </div>
                        {showCCDropdown && (
                          <div className="absolute z-30 mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 shadow-lg p-3">
                            <input
                              type="text"
                              placeholder="Pesquisar..."
                              value={selectedCCSearch}
                              onChange={(e) => setSelectedCCSearch(e.target.value)}
                              className="mb-2 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400"
                            />
                            <div className="flex items-center gap-2 mb-2">
                              <label htmlFor="select-all-cc" className="flex items-center gap-3 cursor-pointer group">
                                <div className="relative">
                                  <input
                                    id="select-all-cc"
                                    type="checkbox"
                                    checked={selectedCCs.length > 0 && selectedCCs.length === centrosCusto.length}
                                    onChange={(e) => {
                                      setActiveFilterCategory('cc');
                                      if (e.target.checked) setSelectedCCs([...centrosCusto]);
                                      else setSelectedCCs([]);
                                    }}
                                    className="sr-only"
                                  />
                                  <div
                                    className={`w-5 h-5 rounded border-2 transition-all duration-200 flex items-center justify-center ${
                                      selectedCCs.length > 0 && selectedCCs.length === centrosCusto.length
                                        ? 'bg-red-600 dark:bg-red-500 border-red-600 dark:border-red-500'
                                        : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 group-hover:border-red-500 dark:group-hover:border-red-400'
                                    }`}
                                  >
                                    {selectedCCs.length > 0 && selectedCCs.length === centrosCusto.length && (
                                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                      </svg>
                                    )}
                                  </div>
                                </div>
                                <span className="text-sm text-gray-700 dark:text-gray-300">Selecionar tudo</span>
                              </label>
                            </div>
                            <div className="max-h-48 overflow-y-auto">
                              {centrosCusto
                                .filter((c) => {
                                  const q = selectedCCSearch.toLowerCase();
                                  const nome = datasetId === 'DataSet_G4FollowUp' ? getCCDisplayLabel(c) : null;
                                  const label = (datasetId === 'DataSet_G4FollowUp' && nome && nome !== c ? `${c} - ${nome}` : c).toLowerCase();
                                  return !q || label.includes(q) || c.toLowerCase().includes(q);
                                })
                                .map((c) => {
                                  const nome = datasetId === 'DataSet_G4FollowUp' ? getCCDisplayLabel(c) : null;
                                  const displayLabel = datasetId === 'DataSet_G4FollowUp' && nome && nome !== c ? `${c} - ${nome}` : c;
                                  const checked = selectedCCs.includes(c);
                                  return (
                                    <label key={c} className="flex items-center gap-3 py-1.5 cursor-pointer group">
                                      <div className="relative">
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={(e) => {
                                            e.stopPropagation();
                                            setActiveFilterCategory('cc');
                                            if (e.target.checked) setSelectedCCs((prev) => Array.from(new Set([...prev, c])));
                                            else setSelectedCCs((prev) => prev.filter((x) => x !== c));
                                          }}
                                          className="sr-only"
                                        />
                                        <div
                                          className={`w-5 h-5 rounded border-2 transition-all duration-200 flex items-center justify-center ${
                                            checked
                                              ? 'bg-red-600 dark:bg-red-500 border-red-600 dark:border-red-500'
                                              : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 group-hover:border-red-500 dark:group-hover:border-red-400'
                                          }`}
                                        >
                                          {checked && (
                                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                            </svg>
                                          )}
                                        </div>
                                      </div>
                                      <span className="text-sm text-gray-900 dark:text-gray-100">{displayLabel}</span>
                                    </label>
                                  );
                                })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {fornecedorCol && (
                      <div ref={fornecedorRef} className="relative flex-1 min-w-[180px]">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Fornecedor</label>
                        <div className="relative">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowFornecedorDropdown((v) => !v);
                              setShowFilialDropdown(false);
                              setShowCCDropdown(false);
                            }}
                            className="w-full h-10 pl-10 pr-11 text-left rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent relative"
                          >
                            <Truck className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 w-4 h-4 pointer-events-none" />
                            <span className="block pr-6 text-sm truncate">
                              {selectedFornecedores.length === 0
                                ? 'Nenhum'
                                : selectedFornecedores.length === fornecedores.length
                                  ? 'Todos'
                                  : `${selectedFornecedores.length} selecionado(s)`}
                            </span>
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-5 h-5 text-gray-400 dark:text-gray-500 pointer-events-none">
                              {showFornecedorDropdown ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                            </span>
                          </button>
                        </div>
                        {showFornecedorDropdown && (
                          <div className="absolute z-30 mt-1 w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 shadow-lg p-3">
                            <input
                              type="text"
                              placeholder="Pesquisar..."
                              value={selectedFornecedoresSearch}
                              onChange={(e) => setSelectedFornecedoresSearch(e.target.value)}
                              className="mb-2 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400"
                            />
                            <div className="flex items-center gap-2 mb-2">
                              <label htmlFor="select-all-fornecedor" className="flex items-center gap-3 cursor-pointer group">
                                <div className="relative">
                                  <input
                                    id="select-all-fornecedor"
                                    type="checkbox"
                                    checked={selectedFornecedores.length > 0 && selectedFornecedores.length === fornecedores.length}
                                    onChange={(e) => {
                                      setActiveFilterCategory('fornecedor');
                                      if (e.target.checked) setSelectedFornecedores([...fornecedores]);
                                      else setSelectedFornecedores([]);
                                    }}
                                    className="sr-only"
                                  />
                                  <div
                                    className={`w-5 h-5 rounded border-2 transition-all duration-200 flex items-center justify-center ${
                                      selectedFornecedores.length > 0 && selectedFornecedores.length === fornecedores.length
                                        ? 'bg-red-600 dark:bg-red-500 border-red-600 dark:border-red-500'
                                        : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 group-hover:border-red-500 dark:group-hover:border-red-400'
                                    }`}
                                  >
                                    {selectedFornecedores.length > 0 && selectedFornecedores.length === fornecedores.length && (
                                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                      </svg>
                                    )}
                                  </div>
                                </div>
                                <span className="text-sm text-gray-700 dark:text-gray-300">Selecionar tudo</span>
                              </label>
                            </div>
                            <div className="max-h-48 overflow-y-auto">
                              {fornecedores
                                .filter((f) => f.toLowerCase().includes(selectedFornecedoresSearch.toLowerCase()))
                                .map((f) => {
                                  const checked = selectedFornecedores.includes(f);
                                  return (
                                    <label key={f} className="flex items-center gap-3 py-1.5 cursor-pointer group">
                                      <div className="relative">
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={(e) => {
                                            e.stopPropagation();
                                            setActiveFilterCategory('fornecedor');
                                            if (e.target.checked) setSelectedFornecedores((prev) => Array.from(new Set([...prev, f])));
                                            else setSelectedFornecedores((prev) => prev.filter((x) => x !== f));
                                          }}
                                          className="sr-only"
                                        />
                                        <div
                                          className={`w-5 h-5 rounded border-2 transition-all duration-200 flex items-center justify-center ${
                                            checked
                                              ? 'bg-red-600 dark:bg-red-500 border-red-600 dark:border-red-500'
                                              : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 group-hover:border-red-500 dark:group-hover:border-red-400'
                                          }`}
                                        >
                                          {checked && (
                                            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                            </svg>
                                          )}
                                        </div>
                                      </div>
                                      <span className="text-sm text-gray-900 dark:text-gray-100 truncate" title={f}>{f}</span>
                                    </label>
                                  );
                                })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            )}
          </Card>
        )}

        {hasError && (
          <Card className="border-red-200 dark:border-red-800">
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
                  <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="font-semibold text-red-800 dark:text-red-200">Erro ao carregar dados</p>
                  <p className="text-sm text-red-700 dark:text-red-300 mt-1">
                    Verifique as variáveis OAuth do Fluig no backend e se os processos existem.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {loadingData && (
          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="flex flex-col items-center justify-center py-12 gap-4">
                <Loader2 className="w-12 h-12 animate-spin text-red-600" />
                <p className="text-gray-500 dark:text-gray-400">Carregando processos...</p>
              </div>
            </CardContent>
          </Card>
        )}

        {!loadingData && (
          <>
            {error && (
              <Card className="border-red-200 dark:border-red-800">
                <CardContent className="p-4 sm:p-6">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
                      <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                    </div>
                    <p className="text-sm text-red-700 dark:text-red-300">
                      Erro ao carregar {datasetId}. Verifique se o processo existe no Fluig.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {!error && isEmpty && (
              <Card>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex flex-col items-center justify-center py-12">
                    <Building2 className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
                    <p className="text-gray-600 dark:text-gray-400">Nenhum dado em {datasetId}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Altere a aba ou tente atualizar.</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {!error && !isEmpty && filteredStatusList.length > 0 && (() => {
              const totalSolicitacoes = filteredStatusList.reduce((acc, [, rows]) => acc + rows.length, 0);
              const [etapaAtual, rowsAtuais] = filteredStatusList[selectedEtapaIndex] ?? filteredStatusList[0];
              const showLeadTimeColumn = isLeadTimeEnabled && !!movimentoDataHoraCol && etapaAtual !== 'Finalizada';
              const getHistText = (r: Record<string, unknown>) => {
                const val = r[historicoCol];
                if (val == null) return '—';
                if (typeof val === 'object' && val !== null) {
                  const o = val as Record<string, unknown>;
                  return String(o.display ?? o.displayValue ?? o.value ?? val);
                }
                return String(val);
              };
              return (
                <div className="space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="text-base font-medium text-gray-700 dark:text-gray-300">
                        {totalSolicitacoes} solicitação(ões)
                      </span>
                      {hasActiveFilters && (
                        <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300">
                          filtrado
                        </span>
                      )}
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {filteredStatusList.map(([etapa, rows], idx) => (
                        <button
                          key={`${datasetId}-${etapa}`}
                          onClick={() => setSelectedEtapaIndex(idx)}
                          className={`shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                            idx === selectedEtapaIndex
                              ? 'bg-red-600 text-white shadow-sm'
                              : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                          }`}
                          title={`${etapa} — ${rows.length} registro(s)`}
                        >
                          {etapa} <span className={idx === selectedEtapaIndex ? 'text-red-100' : 'opacity-75'}>({rows.length})</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <Card className="overflow-hidden border border-gray-200 dark:border-gray-700/80">
                    <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700/80 bg-gray-50/50 dark:bg-gray-800/30">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 truncate" title={etapaAtual}>
                            {etapaAtual}
                          </h3>
                          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                            {rowsAtuais.length === 0
                              ? 'Nenhuma solicitação'
                              : `${rowsAtuais.length} registro(s) nesta etapa`}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-5">
                          <div className="flex-none min-w-[260px]">
                            <div className="relative">
                              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                              <input
                                type="text"
                                placeholder="Buscar..."
                                value={searchText}
                                onChange={(e) => setSearchText(e.target.value)}
                                className="w-full min-w-0 pl-10 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                              />
                              {searchText && (
                                <button
                                  type="button"
                                  onClick={() => setSearchText('')}
                                  aria-label="Limpar busca"
                                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </div>
                          {compactView && (
                            <div className="flex items-center gap-2.5 flex-shrink-0">
                              <label className="text-sm text-gray-600 dark:text-gray-400">
                                Por página
                              </label>
                              <select
                                value={recordsPerPage}
                                onChange={(e) => setRecordsPerPage(Number(e.target.value) as 25 | 50 | 100)}
                                className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500/50 focus:border-red-500 dark:focus:ring-red-500/30 dark:focus:border-red-500 transition-shadow min-w-[5rem]"
                              >
                                <option value={25}>25</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                              </select>
                            </div>
                          )}
                          {compactView && <div className="hidden sm:block w-px h-6 bg-gray-200 dark:bg-gray-600" />}
                          <label className="flex items-center gap-2.5 cursor-pointer group select-none flex-shrink-0">
                            <div className="relative">
                              <input
                                type="checkbox"
                                checked={compactView}
                                onChange={(e) => setCompactView(e.target.checked)}
                                className="sr-only"
                              />
                              <div className={`w-5 h-5 rounded border-2 transition-all duration-200 flex items-center justify-center ${
                                compactView
                                  ? 'bg-red-600 dark:bg-red-500 border-red-600 dark:border-red-500'
                                  : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 group-hover:border-red-500 dark:group-hover:border-red-400'
                              }`}>
                                {compactView && (
                                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                  </svg>
                                )}
                              </div>
                            </div>
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors">
                              Compacta
                            </span>
                          </label>
                        </div>
                      </div>
                    </div>
                    {(() => {
                      const isCompact = compactView;
                      const rowsToShow = isCompact
                        ? rowsAtuais.slice(currentPage * recordsPerPage, currentPage * recordsPerPage + recordsPerPage)
                        : rowsAtuais;
                      const totalPages = Math.ceil(rowsAtuais.length / recordsPerPage);
                      const start = currentPage * recordsPerPage;
                      return (
                        <>
                          <div className={`overflow-x-auto overflow-y-auto min-h-[280px] ${compactView ? 'max-h-[calc(100vh-310px)]' : 'max-h-[calc(100vh-270px)]'}`}>
                            <table className={`w-full ${isCompact ? 'text-xs' : 'text-sm'}`}>
                              <thead className="bg-gray-50 dark:bg-gray-800/80 sticky top-0 z-10">
                                <tr>
                                  <th className={`px-5 text-left font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-28 ${isCompact ? 'py-2' : 'py-3'}`}>
                                    IdMov
                                  </th>
                                  {showLeadTimeColumn && (
                                    <th className={`px-5 text-left font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider w-32 ${isCompact ? 'py-2' : 'py-3'}`}>
                                      Lead time
                                    </th>
                                  )}
                                  <th className={`px-5 text-left font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider ${isCompact ? 'py-2' : 'py-3'}`}>
                                    {datasetId === 'DataSet_G5FollowUp' ? 'Título da Solicitação' : 'Histórico'}
                                  </th>
                                  <th className={`w-14 px-3 ${isCompact ? 'py-2' : 'py-3'}`} />
                                </tr>
                              </thead>
                              <tbody>
                                {rowsToShow.length === 0 ? (
                                  <tr>
                                    <td
                                      colSpan={showLeadTimeColumn ? 4 : 3}
                                      className="px-5 py-12 text-center text-gray-500 dark:text-gray-400 text-sm"
                                    >
                                      Nenhuma solicitação nesta etapa. Tente outro termo na busca ou limpe os filtros.
                                    </td>
                                  </tr>
                                ) : (
                                rowsToShow.map((row, i) => {
                                  const hist = getHistText(row);
                                  return (
                                    <tr
                                      key={isCompact ? start + i : i}
                                      onClick={() => setDetail({ row, columns: currentColumns, datasetId })}
                                      className="group cursor-pointer hover:bg-red-50/80 dark:hover:bg-red-900/15 transition-colors border-b border-gray-100 dark:border-gray-700/50 last:border-b-0"
                                    >
                                      <td className={`px-5 font-mono text-gray-700 dark:text-gray-300 align-middle ${isCompact ? 'py-1.5' : 'py-3'}`}>
                                        {String(row[idCol] ?? '—')}
                                      </td>
                                      {showLeadTimeColumn && (
                                        <td className={`px-5 text-gray-800 dark:text-gray-200 align-middle whitespace-nowrap ${isCompact ? 'py-1.5' : 'py-3'}`}>
                                          {getLeadTimeFromRow(row)}
                                        </td>
                                      )}
                                      <td className={`px-5 text-gray-800 dark:text-gray-200 align-middle overflow-hidden ${isCompact ? 'py-1.5 leading-snug' : 'py-3 leading-relaxed'}`}>
                                        <span className={`block min-w-0 ${isCompact ? 'truncate' : 'line-clamp-2'}`} title={hist}>
                                          {hist || '—'}
                                        </span>
                                      </td>
                                      <td className={`px-3 align-middle ${isCompact ? 'py-1.5' : 'py-3'}`}>
                                        <span className={`inline-flex items-center justify-center rounded-lg text-gray-400 group-hover:text-red-600 dark:group-hover:text-red-400 group-hover:bg-red-50 dark:group-hover:bg-red-900/30 transition-colors ${isCompact ? 'w-7 h-7' : 'w-9 h-9'}`}>
                                          <Eye className={isCompact ? 'w-3.5 h-3.5' : 'w-4 h-4'} />
                                        </span>
                                      </td>
                                    </tr>
                                  );
                                })
                                )}
                              </tbody>
                            </table>
                          </div>
                          {compactView && totalPages > 1 && (
                            <div className="flex items-center justify-between gap-4 px-5 py-3 border-t border-gray-200 dark:border-gray-700/80 bg-gray-50/50 dark:bg-gray-800/30">
                              <p className="text-sm text-gray-500 dark:text-gray-400">
                                Exibindo {start + 1}–{Math.min(start + recordsPerPage, rowsAtuais.length)} de {rowsAtuais.length}
                              </p>
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
                                  disabled={currentPage === 0}
                                  className="p-2 rounded-md text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                  title="Anterior"
                                >
                                  <ChevronLeft className="w-5 h-5" />
                                </button>
                                <span className="text-sm text-gray-600 dark:text-gray-300 px-2">
                                  Página {currentPage + 1} de {totalPages}
                                </span>
                                <button
                                  onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))}
                                  disabled={currentPage >= totalPages - 1}
                                  className="p-2 rounded-md text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                                  title="Próxima"
                                >
                                  <ChevronRight className="w-5 h-5" />
                                </button>
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </Card>
                </div>
              );
            })()}

            {!error && !isEmpty && filteredStatusList.length === 0 && hasActiveFilters && (
              <Card>
                <CardContent className="p-4 sm:p-6">
                  <div className="flex flex-col items-center justify-center py-12 gap-4">
                    <Search className="w-12 h-12 text-gray-300 dark:text-gray-600" />
                    <p className="text-gray-600 dark:text-gray-400">Nenhum resultado para os filtros</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Tente outro termo ou etapa.</p>
                    <div className="flex flex-col sm:flex-row items-center gap-3 mt-2 w-full max-w-md">
                      <div className="relative w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                        <input
                          type="text"
                          placeholder="Buscar..."
                          value={searchText}
                          onChange={(e) => setSearchText(e.target.value)}
                          className="w-full pl-10 pr-10 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-red-500"
                        />
                        {searchText && (
                          <button
                            type="button"
                            onClick={() => setSearchText('')}
                            aria-label="Limpar busca"
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-md text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <button
                        onClick={handleClearFilters}
                        className="flex items-center gap-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 text-sm transition-colors whitespace-nowrap"
                      >
                        <RotateCcw className="w-4 h-4" />
                        Limpar filtros
                      </button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      {/* Modal detalhe da solicitação */}
      <Modal
        isOpen={!!detail}
        onClose={() => setDetail(null)}
        title={
          detail
            ? `Solicitação — IdMov ${formatValue(detail.row[detail.columns.find((c) => /IdMov/i.test(c)) ?? 'IdMov'])}`
            : 'Detalhe'
        }
        size="xl"
      >
        {detail && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700/80 text-gray-700 dark:text-gray-300 text-sm font-medium">
                <FileText className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                {detail.datasetId.replace(/^DataSet_/, '')}
              </span>
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-gray-600/80 overflow-hidden bg-gray-50/50 dark:bg-gray-900/30">
              <div className="max-h-[60vh] overflow-y-auto p-1">
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5 p-4">
                  {detail.columns.map((col) => {
                    const value = formatValue(detail.row[col]);
                    const isLong = value.length > 70;
                    return (
                      <div
                        key={col}
                        className={isLong ? 'sm:col-span-2' : ''}
                      >
                        <dt className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                          {formatLabel(col)}
                        </dt>
                        <dd className="text-sm text-gray-900 dark:text-gray-100 break-words min-w-0 leading-relaxed">
                          {value || '—'}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </MainLayout>
  );
}
