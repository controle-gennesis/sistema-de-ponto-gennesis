import type { LinhaContagem, LinhaMedicao, TipoUnidadeFormula } from './orcamentoMedicaoTypes';

/** Calcula A (área) = C×L×N, V (volume) = A×H ou C×L×H×N */
export function calcA(linha: LinhaMedicao): number {
  if (linha.cabecalhoSecao) return 0;
  const tipoOrigAg = linha.tipoOrigemMedicao ?? 'm3';
  if (linha.linhaAgregadaCarga && tipoOrigAg === 'm2' && linha.volumeM3BrutoSomado != null) {
    return linha.volumeM3BrutoSomado;
  }
  const { C, L, N } = linha;
  return (C || 0) * (L || 0) * (N && N > 0 ? N : 1);
}

export function calcV(linha: LinhaMedicao, tipo: TipoUnidadeFormula): number {
  if (linha.cabecalhoSecao) return 0;
  const tipoOrigV = linha.tipoOrigemMedicao ?? 'm3';
  if (linha.linhaAgregadaCarga && linha.volumeM3BrutoSomado != null) {
    if (tipoOrigV === 'm2') {
      return linha.volumeM3BrutoSomado * (linha.H || 0);
    }
    if (tipoOrigV === 'm3') {
      return linha.volumeM3BrutoSomado;
    }
  }
  const { C, H, N } = linha;
  const A = calcA(linha);
  const n = N && N > 0 ? N : 1;
  switch (tipo) {
    case 'm3':
      return A * (H || 0);
    case 'm2':
      return A;
    case 'm':
      return (C || 0) * n;
    case 'un': {
      if ((linha.H || 0) > 0) return A * (linha.H || 0);
      if ((linha.L || 0) > 0) return A;
      if ((linha.C || 0) > 0) return (C || 0) * n;
      return Number(linha.N) || 0;
    }
    default:
      return 0;
  }
}

/** Linha em branco que ainda traz o padrão antigo: N = 1 e % = 1. */
export function linhaMemoriaComPadraoUm(ln: LinhaMedicao): boolean {
  if (ln.cabecalhoSecao || ln.origemMemoriaKey) return false;
  if ((ln.descricao || '').trim()) return false;
  if ((ln.C || 0) !== 0 || (ln.L || 0) !== 0 || (ln.H || 0) !== 0) return false;
  if (ln.aManual != null || ln.vManual != null || ln.subtotalManual != null || ln.valorManual != null) {
    return false;
  }
  if (ln.formulas && Object.values(ln.formulas).some((v) => v != null && String(v).trim() !== '')) {
    return false;
  }
  if (ln.overrideMemoria && Object.values(ln.overrideMemoria).some(Boolean)) return false;
  return ln.N === 1 && (ln.empolamento == null || ln.empolamento === 1);
}

export function zerarPadraoUmLinha(ln: LinhaMedicao): LinhaMedicao {
  if (!linhaMemoriaComPadraoUm(ln)) return ln;
  return { ...ln, N: 0, empolamento: 0 };
}

/** Calcula SUBTOTAL = V × empolamento. Se C,L,H vazios e valorManual preenchido, usa valorManual. */
export function calcularQuantidadeLinha(linha: LinhaMedicao, tipo: TipoUnidadeFormula): number {
  if (linha.cabecalhoSecao) return 0;
  if (linha.subtotalManual != null && Number.isFinite(linha.subtotalManual)) {
    return linha.subtotalManual;
  }
  const tipoOrigQ = linha.tipoOrigemMedicao ?? 'm3';
  const fator =
    linha.empolamento != null && linha.empolamento > 0
      ? linha.empolamento
      : (linha as unknown as { percPerda?: number }).percPerda != null
        ? 1 + (linha as unknown as { percPerda: number }).percPerda / 100
        : 1;
  /** Base agregada (m³): valorManual já soma os subtotais das demolições; ainda falta o % da linha de carga. */
  if (linha.linhaAgregadaCarga && tipoOrigQ === 'm3' && linha.valorManual != null && linha.valorManual >= 0) {
    return linha.valorManual * fator;
  }
  const temDimensoes = (linha.C || 0) !== 0 || (linha.L || 0) !== 0 || (linha.H || 0) !== 0;
  if (linha.valorManual != null && Number.isFinite(linha.valorManual)) {
    if (!temDimensoes || linha.valorManual > 0) {
      return linha.valorManual * fator;
    }
  }
  if (linha.vManual != null && Number.isFinite(linha.vManual)) {
    return linha.vManual * fator;
  }
  return 0;
}

/** Converte a lista antiga de UN (local + quantidade) para o mesmo formato das outras unidades. */
export function linhasContagemParaMedicao(linhas: LinhaContagem[] | undefined): LinhaMedicao[] {
  if (!linhas?.length) return [];
  return linhas.map((ln) => ({
    descricao: ln.descricao || '',
    C: 0,
    L: 0,
    H: 0,
    N: Number.isFinite(ln.quantidade) ? ln.quantidade : 0,
    empolamento: 0
  }));
}

export function linhasMedicaoEfetivas(dim: { linhas?: LinhaMedicao[]; linhasContagem?: LinhaContagem[] } | undefined): LinhaMedicao[] {
  if (dim?.linhas?.length) return dim.linhas;
  return linhasContagemParaMedicao(dim?.linhasContagem);
}

/** Soma simples das quantidades por local — memória de cálculo de itens "un". */
export function calcularQuantidadeContagem(linhas: LinhaContagem[] | undefined): number {
  if (!linhas?.length) return 0;
  return linhas.reduce((s, ln) => s + (Number.isFinite(ln.quantidade) ? ln.quantidade : 0), 0);
}

export type CampoExplicacaoMedicao = 'C' | 'L' | 'H' | 'N';

/** Área mostrada na célula: valor digitado, fórmula ou total da carga. Sem conta automática de C×L×N. */
export function areaExibidaLinha(linha: LinhaMedicao): number {
  if (linha.cabecalhoSecao) return 0;
  if (linha.aManual != null && Number.isFinite(linha.aManual)) return linha.aManual;
  if (linha.valorManual != null && Number.isFinite(linha.valorManual)) return linha.valorManual;
  const tipoOrig = linha.tipoOrigemMedicao ?? 'm3';
  if (linha.linhaAgregadaCarga && tipoOrig === 'm2' && linha.volumeM3BrutoSomado != null) {
    return linha.volumeM3BrutoSomado;
  }
  return 0;
}

/** Volume mostrado na célula: valor digitado, fórmula ou total da carga. Sem conta automática. */
export function volumeExibidoLinha(linha: LinhaMedicao, _tipo: TipoUnidadeFormula): number {
  if (linha.cabecalhoSecao) return 0;
  if (linha.vManual != null && Number.isFinite(linha.vManual)) return linha.vManual;
  if (linha.valorManual != null && Number.isFinite(linha.valorManual)) return linha.valorManual;
  const tipoOrig = linha.tipoOrigemMedicao ?? 'm3';
  if (linha.linhaAgregadaCarga && linha.volumeM3BrutoSomado != null) {
    if (tipoOrig === 'm2') return linha.volumeM3BrutoSomado * (linha.H || 0);
    if (tipoOrig === 'm3') return linha.volumeM3BrutoSomado;
  }
  return 0;
}

export type MetaMemoriaIncluida = {
  tipo: TipoUnidadeFormula;
  rotulo: string;
  descricao: string;
};

export type SnapshotMemoriaIncluida = {
  descricao: string;
  origemComposicaoRotulo: string;
  origemComposicaoDescricao: string;
  C: number;
  L: number;
  H: number;
  N: number;
  aManual: number;
  vManual: number;
  subtotalManual: number;
};

type DimensoesParaSnapshot = {
  linhas?: LinhaMedicao[];
  linhasContagem?: LinhaContagem[];
};

function numeroMemoriaIgual(atual: number | undefined, proximo: number): boolean {
  const n = Number(atual);
  if (!Number.isFinite(n)) return proximo === 0;
  return Math.abs(n - proximo) < 1e-6;
}

/**
 * Total da memória de origem, colocado numa coluna só, conforme a unidade dela.
 * Metro → C. Metro quadrado → área. Metro cúbico → volume. O restante fica vazio.
 * Memórias incluídas dentro da origem entram com o valor ao vivo. Ciclo é ignorado.
 */
export function snapshotMemoriaIncluida(
  origemKey: string,
  dimensoes: Record<string, DimensoesParaSnapshot | undefined>,
  metaPorKey: ReadonlyMap<string, MetaMemoriaIncluida>,
  visitando: ReadonlySet<string>
): SnapshotMemoriaIncluida | null {
  if (!origemKey || visitando.has(origemKey)) return null;
  const meta = metaPorKey.get(origemKey);
  if (!meta) return null;
  const proximos = new Set(visitando);
  proximos.add(origemKey);
  const linhas = linhasMedicaoEfetivas(dimensoes[origemKey]).filter((ln) => !ln.cabecalhoSecao);
  const tipo: TipoUnidadeFormula = meta.tipo || inferirTipoUnidadePorDimensao(linhas);
  let total = 0;
  for (const ln of linhas) {
    if (ln.origemMemoriaKey && proximos.has(ln.origemMemoriaKey)) continue;
    total += calcularQuantidadeLinha(ln, tipo);
  }
  const rotulo = meta.rotulo.trim();
  const descricaoOrigem = meta.descricao.trim();
  return {
    descricao: [rotulo, descricaoOrigem].filter(Boolean).join(' - '),
    origemComposicaoRotulo: rotulo,
    origemComposicaoDescricao: descricaoOrigem,
    C: tipo === 'm' ? total : 0,
    L: 0,
    H: 0,
    N: 0,
    aManual: tipo === 'm2' ? total : 0,
    vManual: tipo === 'm3' ? total : 0,
    subtotalManual: total,
  };
}

function autoMemoriaDoSnapshot(snap: SnapshotMemoriaIncluida): NonNullable<LinhaMedicao['autoMemoria']> {
  return {
    descricao: snap.descricao,
    C: snap.C,
    L: snap.L,
    H: snap.H,
    N: snap.N,
    empolamento: snap.C || snap.aManual || snap.vManual ? 1 : 0,
    a: snap.aManual,
    v: snap.vManual,
    subtotal: snap.subtotalManual,
  };
}

/** Fórmula padrão do subtotal incluído: o total entra por C, A ou V. */
function formulaSubtotalMemoria(snap: SnapshotMemoriaIncluida): string | undefined {
  if (snap.vManual) return '=V*%';
  if (snap.aManual) return '=A*%';
  if (snap.C) return '=C*%';
  return undefined;
}

function formulasVinculoDesatualizadas(ln: LinhaMedicao, snap: SnapshotMemoriaIncluida): boolean {
  const f = ln.formulas;
  if (!f) return formulaSubtotalMemoria(snap) != null && !ln.overrideMemoria?.subtotal;
  const over = ln.overrideMemoria ?? {};
  if (!over.C && f.C != null) return true;
  if (!over.L && f.L != null) return true;
  if (!over.H && f.H != null) return true;
  if (!over.N && f.N != null) return true;
  if (!over.empolamento && f.empolamento != null) return true;
  if (!over.subtotal && (f.subtotalManual ?? '') !== (formulaSubtotalMemoria(snap) ?? '')) return true;
  if (!over.a && (f.aManual != null || f.valorManual != null)) return true;
  if (!over.v && f.vManual != null) return true;
  return false;
}

function linhaMemoriaIncluidaMudou(ln: LinhaMedicao, snap: SnapshotMemoriaIncluida): boolean {
  const auto = autoMemoriaDoSnapshot(snap);
  const prev = ln.autoMemoria;
  const over = ln.overrideMemoria ?? {};
  if (!prev) return true;
  if ((ln.origemComposicaoRotulo ?? '') !== snap.origemComposicaoRotulo) return true;
  if ((ln.origemComposicaoDescricao ?? '') !== snap.origemComposicaoDescricao) return true;
  if (prev.descricao !== auto.descricao) return true;
  if (!numeroMemoriaIgual(prev.C, auto.C)) return true;
  if (!numeroMemoriaIgual(prev.L, auto.L)) return true;
  if (!numeroMemoriaIgual(prev.H, auto.H)) return true;
  if (!numeroMemoriaIgual(prev.N, auto.N)) return true;
  if (!numeroMemoriaIgual(prev.empolamento, auto.empolamento)) return true;
  if (!numeroMemoriaIgual(prev.a, auto.a)) return true;
  if (!numeroMemoriaIgual(prev.v, auto.v)) return true;
  if (!numeroMemoriaIgual(prev.subtotal, auto.subtotal)) return true;
  if (!over.descricao && (ln.descricao ?? '') !== auto.descricao) return true;
  if (!over.C && !numeroMemoriaIgual(ln.C, auto.C)) return true;
  if (!over.L && !numeroMemoriaIgual(ln.L, auto.L)) return true;
  if (!over.H && !numeroMemoriaIgual(ln.H, auto.H)) return true;
  if (!over.N && !numeroMemoriaIgual(ln.N, auto.N)) return true;
  if (!over.empolamento && !numeroMemoriaIgual(ln.empolamento, auto.empolamento)) return true;
  if (!over.a && !numeroMemoriaIgual(ln.aManual, auto.a)) return true;
  if (!over.v && !numeroMemoriaIgual(ln.vManual, auto.v)) return true;
  if (!over.subtotal && !numeroMemoriaIgual(ln.subtotalManual, auto.subtotal)) return true;
  return formulasVinculoDesatualizadas(ln, snap);
}

function aplicarSnapshotNaLinha(ln: LinhaMedicao, snap: SnapshotMemoriaIncluida): LinhaMedicao {
  const auto = autoMemoriaDoSnapshot(snap);
  const over = ln.overrideMemoria ?? {};
  const formulas = { ...(ln.formulas ?? {}) };
  if (!over.C) delete formulas.C;
  if (!over.L) delete formulas.L;
  if (!over.H) delete formulas.H;
  if (!over.N) delete formulas.N;
  if (!over.empolamento) delete formulas.empolamento;
  if (!over.subtotal) {
    const esperada = formulaSubtotalMemoria(snap);
    if (esperada) formulas.subtotalManual = esperada;
    else delete formulas.subtotalManual;
  }
  if (!over.a) {
    delete formulas.aManual;
    delete formulas.valorManual;
  }
  if (!over.v) delete formulas.vManual;
  return {
    ...ln,
    autoMemoria: auto,
    origemComposicaoRotulo: snap.origemComposicaoRotulo,
    origemComposicaoDescricao: snap.origemComposicaoDescricao,
    descricao: over.descricao ? ln.descricao : auto.descricao,
    C: over.C ? ln.C : auto.C,
    L: over.L ? ln.L : auto.L,
    H: over.H ? ln.H : auto.H,
    N: over.N ? ln.N : auto.N,
    empolamento: over.empolamento ? ln.empolamento : auto.empolamento,
    aManual: over.a ? ln.aManual : auto.a,
    vManual: over.v ? ln.vManual : auto.v,
    subtotalManual: over.subtotal ? ln.subtotalManual : auto.subtotal,
    formulas: Object.keys(formulas).length > 0 ? formulas : undefined,
  };
}

/** Reescreve as linhas incluídas com os totais atuais da memória de origem. */
export function sincronizarLinhasMemoriaIncluidas<T extends DimensoesParaSnapshot>(
  dimensoes: Record<string, T>,
  metaPorKey: ReadonlyMap<string, MetaMemoriaIncluida>
): { next: Record<string, T>; chavesAlteradas: string[] } | null {
  let changed = false;
  const next: Record<string, T> = { ...dimensoes };
  const chavesAlteradas: string[] = [];
  for (const [itemKey, dim] of Object.entries(dimensoes)) {
    const linhas = dim?.linhas;
    if (!linhas?.some((ln) => ln.origemMemoriaKey)) continue;
    let itemChanged = false;
    const novas = linhas.map((ln) => {
      if (!ln.origemMemoriaKey || ln.origemMemoriaKey === itemKey) return ln;
      const snap = snapshotMemoriaIncluida(
        ln.origemMemoriaKey,
        dimensoes,
        metaPorKey,
        new Set([itemKey])
      );
      if (!snap || !linhaMemoriaIncluidaMudou(ln, snap)) return ln;
      itemChanged = true;
      return aplicarSnapshotNaLinha(ln, snap);
    });
    if (!itemChanged || !dim) continue;
    changed = true;
    next[itemKey] = { ...dim, linhas: novas };
    chavesAlteradas.push(itemKey);
  }
  return changed ? { next, chavesAlteradas } : null;
}

export function inferirTipoUnidadePorDimensao(linhas: LinhaMedicao[] | undefined): TipoUnidadeFormula {
  const filtradas = linhas?.filter(ln => !ln.cabecalhoSecao);
  if (!filtradas?.length) return 'un';
  if (filtradas.some(ln => ln.linhaAgregadaCarga)) return 'm3';
  const hasH = filtradas.some(ln => (ln.H || 0) > 0);
  if (hasH) return 'm3';
  const hasL = filtradas.some(ln => (ln.L || 0) > 0);
  if (hasL) return 'm2';
  const hasC = filtradas.some(ln => (ln.C || 0) > 0);
  if (hasC) return 'm';
  return 'un';
}
