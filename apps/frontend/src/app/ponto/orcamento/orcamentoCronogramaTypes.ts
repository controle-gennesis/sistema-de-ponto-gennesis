/** Dados de cronograma por item ou bloco (subtítulo) do orçamento. */
export interface CronogramaItemData {
  dataInicio?: string;
  dataFim?: string;
  dataInicioReal?: string;
  dataFimReal?: string;
  /** 0–100 */
  percentualExecutado?: number;
  observacao?: string;
}

export interface CronogramaConfig {
  dataInicioObra?: string;
  dataFimObra?: string;
  observacaoGeral?: string;
}

/** Etapa operacional dentro de um serviço do cronograma. */
export interface CronogramaSubServico {
  id: string;
  nome: string;
  origem: 'manual' | 'ia';
  dataInicio?: string;
  dataFim?: string;
  dataInicioReal?: string;
  dataFimReal?: string;
  /** 0–100 */
  percentualExecutado?: number;
  observacao?: string;
  /** Vínculo opcional com composição do orçamento */
  composicaoChave?: string;
}

export interface CronogramaPersist {
  config?: CronogramaConfig;
  /** Chave = servicoId */
  porServico: Record<string, CronogramaItemData>;
  /** Subserviços por serviço (chave = servicoId) */
  subServicosPorServico?: Record<string, CronogramaSubServico[]>;
  /** Predecessores por etapa (chave = servicoKey ou servicoKey::subId) */
  dependenciasPorEtapa?: Record<string, string[]>;
  /** Legado — mantido na leitura; não usado na UI */
  porItem?: Record<string, CronogramaItemData>;
  /** Legado — mantido na leitura; não usado na UI */
  porBloco?: Record<string, CronogramaItemData>;
}

/** Chave estável de etapa na timeline (serviço ou subserviço). */
export function etapaKeyCronograma(servicoKey: string, subId?: string): string {
  return subId ? `${servicoKey}::${subId}` : servicoKey;
}

export type CronogramaStatus = 'pendente' | 'em_andamento' | 'concluido' | 'atrasado';

export type CronogramaComposicaoRef = {
  chave: string;
  codigo: string;
  descricao: string;
  subtituloNome: string;
  quantidade: number;
  unidade?: string;
};

/** Linha agregada por serviço do orçamento. */
export type CronogramaLinhaServico = {
  servicoKey: string;
  servicoNome: string;
  valorTotal: number;
  qtdItens: number;
  composicoes: CronogramaComposicaoRef[];
};

/** @deprecated use CronogramaLinhaServico */
export type CronogramaLinhaOrcamento = {
  key: string;
  blocoKey: string;
  servicoNome: string;
  subtituloNome: string;
  descricao: string;
  rotulo: string;
  quantidade: number;
  valorTotal: number;
};

export function cronogramaVazio(): CronogramaPersist {
  return {
    config: {},
    porServico: {},
    subServicosPorServico: {},
    dependenciasPorEtapa: {},
    porItem: {},
    porBloco: {}
  };
}

function normalizarDependenciasPorEtapa(
  map: Record<string, unknown> | undefined
): Record<string, string[]> {
  if (!map || typeof map !== 'object') return {};
  const out: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(map)) {
    if (!Array.isArray(v)) continue;
    const deps = v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
    if (deps.length > 0) out[k] = deps;
  }
  return out;
}

export function novoSubServicoId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `ss-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function criarSubServicoManual(nome = 'Novo subserviço'): CronogramaSubServico {
  return { id: novoSubServicoId(), nome, origem: 'manual' };
}

function normalizarSubServico(raw: unknown): CronogramaSubServico | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Partial<CronogramaSubServico>;
  const nome = typeof o.nome === 'string' ? o.nome.trim() : '';
  if (!nome) return null;
  const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : novoSubServicoId();
  return {
    id,
    nome,
    origem: o.origem === 'ia' ? 'ia' : 'manual',
    dataInicio: typeof o.dataInicio === 'string' ? o.dataInicio : '',
    dataFim: typeof o.dataFim === 'string' ? o.dataFim : '',
    dataInicioReal: typeof o.dataInicioReal === 'string' ? o.dataInicioReal : '',
    dataFimReal: typeof o.dataFimReal === 'string' ? o.dataFimReal : '',
    percentualExecutado:
      typeof o.percentualExecutado === 'number' && Number.isFinite(o.percentualExecutado)
        ? Math.min(100, Math.max(0, o.percentualExecutado))
        : undefined,
    observacao: typeof o.observacao === 'string' ? o.observacao : '',
    composicaoChave: typeof o.composicaoChave === 'string' ? o.composicaoChave : undefined
  };
}

function normalizarMapaSubServicos(
  map: Record<string, unknown> | undefined
): Record<string, CronogramaSubServico[]> {
  if (!map || typeof map !== 'object') return {};
  const out: Record<string, CronogramaSubServico[]> = {};
  for (const [k, v] of Object.entries(map)) {
    if (!Array.isArray(v)) continue;
    const lista = v.map(normalizarSubServico).filter((x): x is CronogramaSubServico => x != null);
    if (lista.length > 0) out[k] = lista;
  }
  return out;
}

function extrairServicoKeyDeBlocoKey(blocoKey: string): string {
  const sep = blocoKey.lastIndexOf('|');
  return sep > 0 ? blocoKey.slice(0, sep) : blocoKey;
}

function migrarCronogramaLegado(o: Partial<CronogramaPersist>): Record<string, CronogramaItemData> {
  const porServico =
    o.porServico && typeof o.porServico === 'object'
      ? normalizarMapaCronograma(o.porServico as Record<string, unknown>)
      : {};

  if (Object.keys(porServico).length > 0) return porServico;

  const out: Record<string, CronogramaItemData> = {};

  const porBloco =
    o.porBloco && typeof o.porBloco === 'object'
      ? normalizarMapaCronograma(o.porBloco as Record<string, unknown>)
      : {};
  for (const [blocoKey, dados] of Object.entries(porBloco)) {
    const sk = extrairServicoKeyDeBlocoKey(blocoKey);
    if (!out[sk]) out[sk] = { ...dados };
  }

  const porItem =
    o.porItem && typeof o.porItem === 'object'
      ? normalizarMapaCronograma(o.porItem as Record<string, unknown>)
      : {};
  for (const [itemKey, dados] of Object.entries(porItem)) {
    const parts = itemKey.split('|');
    if (parts.length < 2) continue;
    const blocoKey = `${parts[0]}|${parts[1]}`;
    const sk = extrairServicoKeyDeBlocoKey(blocoKey);
    if (!out[sk]?.dataInicio && !out[sk]?.dataFim && !out[sk]?.percentualExecutado) {
      out[sk] = { ...dados };
    }
  }

  return out;
}

export function normalizarCronograma(raw: unknown): CronogramaPersist {
  if (!raw || typeof raw !== 'object') return cronogramaVazio();
  const o = raw as Partial<CronogramaPersist>;
  const cfg = o.config && typeof o.config === 'object' ? o.config : {};
  return {
    config: {
      dataInicioObra: typeof cfg.dataInicioObra === 'string' ? cfg.dataInicioObra : '',
      dataFimObra: typeof cfg.dataFimObra === 'string' ? cfg.dataFimObra : '',
      observacaoGeral: typeof cfg.observacaoGeral === 'string' ? cfg.observacaoGeral : ''
    },
    porServico: migrarCronogramaLegado(o),
    subServicosPorServico: normalizarMapaSubServicos(
      o.subServicosPorServico as Record<string, unknown> | undefined
    ),
    dependenciasPorEtapa: normalizarDependenciasPorEtapa(
      o.dependenciasPorEtapa as Record<string, unknown> | undefined
    ),
    porItem:
      o.porItem && typeof o.porItem === 'object'
        ? normalizarMapaCronograma(o.porItem as Record<string, unknown>)
        : {},
    porBloco:
      o.porBloco && typeof o.porBloco === 'object'
        ? normalizarMapaCronograma(o.porBloco as Record<string, unknown>)
        : {}
  };
}

function normalizarMapaCronograma(map: Record<string, unknown>): Record<string, CronogramaItemData> {
  const out: Record<string, CronogramaItemData> = {};
  for (const [k, v] of Object.entries(map)) {
    if (!v || typeof v !== 'object') continue;
    const d = v as CronogramaItemData;
    out[k] = {
      dataInicio: typeof d.dataInicio === 'string' ? d.dataInicio : '',
      dataFim: typeof d.dataFim === 'string' ? d.dataFim : '',
      dataInicioReal: typeof d.dataInicioReal === 'string' ? d.dataInicioReal : '',
      dataFimReal: typeof d.dataFimReal === 'string' ? d.dataFimReal : '',
      percentualExecutado:
        typeof d.percentualExecutado === 'number' && Number.isFinite(d.percentualExecutado)
          ? Math.min(100, Math.max(0, d.percentualExecutado))
          : undefined,
      observacao: typeof d.observacao === 'string' ? d.observacao : ''
    };
  }
  return out;
}

export function parseDataIso(s: string | undefined | null): Date | null {
  if (!s || typeof s !== 'string') return null;
  const m = s.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDataBr(s: string | undefined | null): string {
  const d = parseDataIso(s);
  if (!d) return '—';
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

export function diasEntre(inicio: string | undefined, fim: string | undefined): number | null {
  const a = parseDataIso(inicio);
  const b = parseDataIso(fim);
  if (!a || !b) return null;
  const diff = Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
  return diff >= 0 ? diff + 1 : null;
}

export function calcularStatusCronograma(
  data: CronogramaItemData | undefined,
  hoje: Date = new Date()
): CronogramaStatus {
  const pct = data?.percentualExecutado ?? 0;
  if (pct >= 100) return 'concluido';
  const fim = parseDataIso(data?.dataFim);
  const hojeMeio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 12, 0, 0, 0);
  if (fim && hojeMeio > fim && pct < 100) return 'atrasado';
  if (pct > 0) return 'em_andamento';
  return 'pendente';
}

export const CRONOGRAMA_STATUS_LABEL: Record<CronogramaStatus, string> = {
  pendente: 'Pendente',
  em_andamento: 'Em andamento',
  concluido: 'Concluído',
  atrasado: 'Atrasado'
};

export const CRONOGRAMA_STATUS_CLASS: Record<CronogramaStatus, string> = {
  pendente: 'text-gray-600 dark:text-gray-400',
  em_andamento: 'text-sky-700 dark:text-sky-300',
  concluido: 'text-green-700 dark:text-green-400',
  atrasado: 'text-red-700 dark:text-red-400'
};

/** Dados efetivos do cronograma por serviço. */
export function calcularPercentualExecutadoServico(
  cronograma: CronogramaPersist,
  servicoKey: string
): number | undefined {
  const subs = listarSubServicos(cronograma, servicoKey);
  if (subs.length === 0) {
    return cronograma.porServico[servicoKey]?.percentualExecutado ?? undefined;
  }
  const soma = subs.reduce((acc, sub) => acc + (sub.percentualExecutado ?? 0), 0);
  return soma / subs.length;
}

function datasPlanejadasServicoPaiArmazenadas(
  cronograma: CronogramaPersist,
  servicoKey: string
): { dataInicio: string; dataFim: string } {
  const servico = cronograma.porServico[servicoKey] ?? {};
  return {
    dataInicio: servico.dataInicio || cronograma.config?.dataInicioObra || '',
    dataFim: servico.dataFim || cronograma.config?.dataFimObra || ''
  };
}

/** Agrega início (min) e fim (max) dos subserviços (sem chamar resolvers — evita recursão). */
export function agregarDatasSubServicosNoServicoPai(
  cronograma: CronogramaPersist,
  servicoKey: string
): Partial<CronogramaItemData> | null {
  const subs = listarSubServicos(cronograma, servicoKey);
  if (subs.length === 0) return null;

  const { dataInicio: paiIni, dataFim: paiFim } = datasPlanejadasServicoPaiArmazenadas(cronograma, servicoKey);

  let minIni = '';
  let maxFim = '';
  let minIniReal = '';
  let maxFimReal = '';

  subs.forEach((sub, idx) => {
    let ini = sub.dataInicio?.trim() || '';
    let fim = sub.dataFim?.trim() || '';
    if (!ini && !fim && paiIni && paiFim) {
      const distribuido = distribuirPeriodoSubServicos(paiIni, paiFim, idx, subs.length);
      if (distribuido) {
        ini = distribuido.dataInicio;
        fim = distribuido.dataFim;
      }
    }

    const iniReal = sub.dataInicioReal?.trim() || '';
    const fimReal = sub.dataFimReal?.trim() || '';

    if (ini && (!minIni || ini < minIni)) minIni = ini;
    if (fim && (!maxFim || fim > maxFim)) maxFim = fim;
    if (iniReal && (!minIniReal || iniReal < minIniReal)) minIniReal = iniReal;
    if (fimReal && (!maxFimReal || fimReal > maxFimReal)) maxFimReal = fimReal;
  });

  if (!minIni && !maxFim && !minIniReal && !maxFimReal) return null;

  return {
    dataInicio: minIni,
    dataFim: maxFim,
    dataInicioReal: minIniReal,
    dataFimReal: maxFimReal
  };
}

export function resolverDadosCronogramaServico(
  cronograma: CronogramaPersist,
  servicoKey: string
): CronogramaItemData {
  const servico = cronograma.porServico[servicoKey] ?? {};
  const subs = listarSubServicos(cronograma, servicoKey);
  const agg = subs.length > 0 ? agregarDatasSubServicosNoServicoPai(cronograma, servicoKey) : null;

  return {
    dataInicio: servico.dataInicio || agg?.dataInicio || cronograma.config?.dataInicioObra || '',
    dataFim: servico.dataFim || agg?.dataFim || cronograma.config?.dataFimObra || '',
    dataInicioReal: servico.dataInicioReal || agg?.dataInicioReal || '',
    dataFimReal: servico.dataFimReal || agg?.dataFimReal || '',
    percentualExecutado: calcularPercentualExecutadoServico(cronograma, servicoKey),
    observacao: servico.observacao || ''
  };
}

export function formatDataIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Data de fim do orçamento: usa dataEnvio ou calcula a partir do início + prazo (dias, inclusivo). */
export function calcularDataFimOrcamento(
  dataInicio: string | undefined,
  dataFim: string | undefined,
  prazoDias: string | undefined
): string {
  if (dataFim?.trim()) return dataFim.trim();
  const ini = parseDataIso(dataInicio);
  const dias = Number(String(prazoDias ?? '').replace(/\D/g, ''));
  if (!ini || !Number.isFinite(dias) || dias <= 0) return '';
  const fim = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + dias - 1, 12, 0, 0, 0);
  return formatDataIso(fim);
}

/** Divide o prazo do serviço pai em faixas sequenciais para cada subserviço. */
export function distribuirPeriodoSubServicos(
  inicioIso: string,
  fimIso: string,
  indice: number,
  total: number
): { dataInicio: string; dataFim: string } | null {
  if (total <= 0 || indice < 0 || indice >= total) return null;
  const ini = parseDataIso(inicioIso);
  const fim = parseDataIso(fimIso);
  if (!ini || !fim) return null;

  const totalDias = diasEntre(inicioIso, fimIso);
  if (!totalDias || totalDias <= 0) return null;

  const diasPorSub = Math.max(1, Math.floor(totalDias / total));
  const startOffset = indice * diasPorSub;
  const endOffset = indice === total - 1 ? totalDias - 1 : startOffset + diasPorSub - 1;

  const startDate = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + startOffset, 12, 0, 0, 0);
  const endDate = new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + endOffset, 12, 0, 0, 0);

  return {
    dataInicio: formatDataIso(startDate),
    dataFim: formatDataIso(endDate)
  };
}

/** Datas efetivas de um subserviço (herda do serviço pai ou distribui sequencialmente). */
export function resolverDadosCronogramaSubServico(
  cronograma: CronogramaPersist,
  servicoKey: string,
  sub: CronogramaSubServico,
  indice?: number,
  totalSubs?: number
): CronogramaItemData {
  const { dataInicio: paiIni, dataFim: paiFim } = datasPlanejadasServicoPaiArmazenadas(cronograma, servicoKey);
  const temDatasProprias = Boolean(sub.dataInicio?.trim() || sub.dataFim?.trim());

  if (!temDatasProprias && indice != null && totalSubs != null && totalSubs > 0 && paiIni && paiFim) {
    const distribuido = distribuirPeriodoSubServicos(paiIni, paiFim, indice, totalSubs);
    if (distribuido) {
      return {
        dataInicio: distribuido.dataInicio,
        dataFim: distribuido.dataFim,
        dataInicioReal: sub.dataInicioReal || '',
        dataFimReal: sub.dataFimReal || '',
        percentualExecutado: sub.percentualExecutado ?? undefined,
        observacao: sub.observacao || ''
      };
    }
  }

  return {
    dataInicio: sub.dataInicio || paiIni || '',
    dataFim: sub.dataFim || paiFim || '',
    dataInicioReal: sub.dataInicioReal || '',
    dataFimReal: sub.dataFimReal || '',
    percentualExecutado: sub.percentualExecutado ?? undefined,
    observacao: sub.observacao || ''
  };
}

export function listarSubServicos(cronograma: CronogramaPersist, servicoKey: string): CronogramaSubServico[] {
  return cronograma.subServicosPorServico?.[servicoKey] ?? [];
}

/** @deprecated */
export function resolverDadosCronogramaItem(
  cronograma: CronogramaPersist,
  itemKey: string,
  blocoKey: string
): CronogramaItemData {
  const bloco = cronograma.porBloco?.[blocoKey] ?? {};
  const item = cronograma.porItem?.[itemKey] ?? {};
  return {
    dataInicio: item.dataInicio || bloco.dataInicio || cronograma.config?.dataInicioObra || '',
    dataFim: item.dataFim || bloco.dataFim || cronograma.config?.dataFimObra || '',
    percentualExecutado:
      item.percentualExecutado ?? bloco.percentualExecutado ?? undefined,
    observacao: item.observacao || bloco.observacao || ''
  };
}
