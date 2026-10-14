import type {
  CampoFormulaMedicao,
  LinhaContagem,
  LinhaMedicao,
  TipoUnidadeFormula,
} from './orcamentoMedicaoTypes';

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

/** Linha de medida sem descrição, número ou fórmula. Cabeçalho e memória incluída ficam. */
export function linhaMedicaoEstaVazia(ln: LinhaMedicao): boolean {
  if (ln.cabecalhoSecao || ln.origemMemoriaKey || ln.linhaAgregadaCarga) return false;
  if ((ln.descricao ?? '').trim()) return false;
  const numeros = [
    ln.C,
    ln.L,
    ln.H,
    ln.N,
    ln.empolamento,
    ln.valorManual,
    ln.subtotalManual,
    ln.aManual,
    ln.vManual,
    ln.volumeM3BrutoSomado,
  ];
  for (const n of numeros) {
    if (typeof n === 'number' && Number.isFinite(n) && Math.abs(n) > 1e-9) return false;
  }
  const formulas = ln.formulas;
  if (formulas) {
    for (const texto of Object.values(formulas)) {
      if (String(texto ?? '').trim()) return false;
    }
  }
  return true;
}

const REF_LINHA_FORMULA = /\{([^{}!]+)!(\d+)!(SUB|C|L|H|N|%|A|V)\}/gi;

/** Atualiza `{rótulo!linha!coluna}` depois que linhas vazias saem e a numeração muda. */
export function remapearFormulasDaLinha(
  ln: LinhaMedicao,
  rotulo: string,
  linhaNovaPorAntiga: ReadonlyMap<number, number>
): LinhaMedicao {
  const alvo = rotulo.trim();
  if (!alvo || !ln.formulas) return ln;
  let mudou = false;
  const formulas: NonNullable<LinhaMedicao['formulas']> = { ...ln.formulas };
  for (const campo of Object.keys(formulas) as CampoFormulaMedicao[]) {
    const atual = formulas[campo];
    if (!atual || !atual.includes('{')) continue;
    const prox = atual.replace(REF_LINHA_FORMULA, (match, rot: string, linha: string, campoRef: string) => {
      if (String(rot).trim() !== alvo) return match;
      const nova = linhaNovaPorAntiga.get(Number(linha));
      if (nova == null) return '0';
      if (nova === Number(linha)) return match;
      return `{${String(rot).trim()}!${nova}!${campoRef}}`;
    });
    if (prox !== atual) {
      formulas[campo] = prox;
      mudou = true;
    }
  }
  return mudou ? { ...ln, formulas } : ln;
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

export type ContextoFormulaMedicao = {
  C: number;
  L: number;
  H: number;
  N: number;
  empolamento: number;
  A: number;
  V: number;
  SUB: number;
};

export type ResolverFormulaExterna = (
  rotulo: string,
  linha: number,
  campo: string
) => number | null;

function substituirRefsFormulaLinha(expr: string, ctx: ContextoFormulaMedicao): string {
  const comSub = expr.replace(/\bSUB\b/gi, String(Number(ctx.SUB) || 0));
  return comSub.replace(/%|\b([CLHNAV])\b/gi, (match) => {
    if (match === '%') return String(Number(ctx.empolamento) || 0);
    const m = match.toUpperCase();
    if (m === 'C') return String(Number(ctx.C) || 0);
    if (m === 'L') return String(Number(ctx.L) || 0);
    if (m === 'H') return String(Number(ctx.H) || 0);
    if (m === 'N') return String(Number(ctx.N) || 0);
    if (m === 'A') return String(Number(ctx.A) || 0);
    if (m === 'V') return String(Number(ctx.V) || 0);
    return match;
  });
}

function substituirRefsFormulaExternas(
  expr: string,
  resolve: ResolverFormulaExterna
): { expr: string; ok: boolean } {
  let ok = true;
  const next = expr.replace(
    /\{([^{}!]+)!(\d+|T)!(SUB|C|L|H|N|%|A|V)\}/gi,
    (_match, rotulo: string, linha: string, campo: string) => {
      const col = campo.toUpperCase() === '%' ? '%' : campo.toUpperCase();
      const linhaNum = /^t$/i.test(linha) ? 0 : Number(linha);
      const n = resolve(String(rotulo).trim(), linhaNum, col);
      if (n == null || !Number.isFinite(n)) {
        ok = false;
        return '0';
      }
      return String(n);
    }
  );
  return { expr: next, ok };
}

/** Valor de uma fórmula da memória (`=C+L+N`) ou de um número digitado. */
export function avaliarFormulaMedicao(
  raw: string,
  rowCtx?: ContextoFormulaMedicao,
  resolverExterna?: ResolverFormulaExterna
): number | null {
  const text = String(raw ?? '').trim();
  if (text.startsWith('=')) {
    let s = text.slice(1).trim().replace(/,/g, '.');
    if (resolverExterna && s.includes('{')) {
      const externo = substituirRefsFormulaExternas(s, resolverExterna);
      if (!externo.ok) return null;
      s = externo.expr;
    }
    if (rowCtx) s = substituirRefsFormulaLinha(s, rowCtx);
    if (!s || !/^[\d\s+\-*/.()]+$/.test(s)) return null;
    try {
      const result = new Function(`return (${s})`)();
      return typeof result === 'number' && isFinite(result) ? result : null;
    } catch {
      return null;
    }
  }
  const t = text.replace(/^=/, '').trim();
  if (!t) return null;
  if (t.includes(',')) {
    const n = Number(t.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) {
    const n = Number(t.replace(/\./g, ''));
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

function contextoFormulaLinha(ln: LinhaMedicao, tipo: TipoUnidadeFormula): ContextoFormulaMedicao {
  const empolVal =
    ln.empolamento ??
    ((ln as unknown as { percPerda?: number }).percPerda != null
      ? 1 + (ln as unknown as { percPerda: number }).percPerda / 100
      : 0);
  return {
    C: ln.C || 0,
    L: ln.L || 0,
    H: ln.H || 0,
    N: ln.N || 0,
    empolamento: Number(empolVal) || 0,
    A: areaExibidaLinha(ln),
    V: volumeExibidoLinha(ln, tipo),
    SUB: calcularQuantidadeLinha(ln, tipo),
  };
}

const ORDEM_CAMPOS_FORMULA: CampoFormulaMedicao[] = [
  'C',
  'L',
  'H',
  'N',
  'empolamento',
  'aManual',
  'vManual',
  'valorManual',
  'subtotalManual',
];

function tokenColunaFormula(campo: CampoFormulaMedicao): string {
  if (campo === 'empolamento') return '%';
  if (campo === 'aManual' || campo === 'valorManual') return 'A';
  if (campo === 'vManual') return 'V';
  if (campo === 'subtotalManual') return 'SUB';
  return campo;
}

function aplicarNumeroFormula(
  ln: LinhaMedicao,
  campo: CampoFormulaMedicao,
  n: number
): LinhaMedicao {
  if (campo === 'C' || campo === 'L' || campo === 'H' || campo === 'N') {
    const v = campo === 'N' ? Math.max(0, n) : n;
    if (numeroMemoriaIgual(ln[campo], v)) return ln;
    return { ...ln, [campo]: v };
  }
  if (campo === 'empolamento') {
    const v = Math.max(0, n);
    if (numeroMemoriaIgual(ln.empolamento, v)) return ln;
    return { ...ln, empolamento: v };
  }
  if (numeroMemoriaIgual(ln[campo], n)) return ln;
  return { ...ln, [campo]: n };
}

function valorColunaFormula(
  ln: LinhaMedicao,
  col: string,
  tipo: TipoUnidadeFormula
): number | null {
  if (col === 'C') return ln.C || 0;
  if (col === 'L') return ln.L || 0;
  if (col === 'H') return ln.H || 0;
  if (col === 'N') return ln.N || 0;
  if (col === '%') return Number(ln.empolamento) || 0;
  if (col === 'A') return areaExibidaLinha(ln);
  if (col === 'V') return volumeExibidoLinha(ln, tipo);
  if (col === 'SUB') return calcularQuantidadeLinha(ln, tipo);
  return null;
}

type DimensoesComFormula = {
  tipoUnidade?: TipoUnidadeFormula;
  linhas?: LinhaMedicao[];
  linhasContagem?: LinhaContagem[];
};

/**
 * Recalcula o número gravado de cada fórmula quando C, L, H, N ou outra célula
 * referenciada muda. Sem isso o texto da fórmula acompanha o N novo, mas o
 * valor da célula só muda ao abrir e fechar a fórmula.
 */
export function propagarFormulasMemoria<T extends DimensoesComFormula>(
  dimensoes: Record<string, T | undefined>,
  metaPorKey: ReadonlyMap<string, { tipo: TipoUnidadeFormula; rotulo: string }>
): { next: Record<string, T>; chavesAlteradas: string[] } | null {
  const presentes = Object.fromEntries(
    Object.entries(dimensoes).filter((entry): entry is [string, T] => entry[1] != null)
  ) as Record<string, T>;
  let next: Record<string, T> = { ...presentes };
  const origemPorItem = new Map<string, LinhaMedicao[]>();
  for (const [key, dim] of Object.entries(presentes)) {
    if (dim.linhas) origemPorItem.set(key, dim.linhas);
  }
  const keyPorRotulo = new Map<string, string>();
  for (const [key, meta] of metaPorKey) {
    const rot = meta.rotulo.trim();
    if (rot && !keyPorRotulo.has(rot)) keyPorRotulo.set(rot, key);
  }
  const chavesAlteradas: string[] = [];
  let any = false;
  let lendo: { itemKey: string; linhaDados: number; col: string; origem: LinhaMedicao } | null = null;

  const tipoDe = (key: string, dim: T): TipoUnidadeFormula =>
    metaPorKey.get(key)?.tipo || dim.tipoUnidade || inferirTipoUnidadePorDimensao(dim.linhas);

  const linhasDadosDe = (key: string): LinhaMedicao[] =>
    (next[key]?.linhas ?? []).filter((ln) => !ln.cabecalhoSecao);

  const resolver: ResolverFormulaExterna = (rotulo, linha, campo) => {
    const rot = rotulo.trim();
    if (!rot || !Number.isFinite(linha) || linha < 0) return null;
    const alvoKey = keyPorRotulo.get(rot);
    if (!alvoKey || !next[alvoKey]) return null;
    const tipo = tipoDe(alvoKey, next[alvoKey]!);
    const col = campo.toUpperCase() === '%' ? '%' : campo.toUpperCase();
    const linhas = linhasDadosDe(alvoKey);
    if (linha === 0) {
      if (valorColunaFormula(linhas[0] ?? { C: 0, L: 0, H: 0, N: 0, empolamento: 0 }, col, tipo) == null) {
        return null;
      }
      return linhas.reduce((s, ln) => s + (valorColunaFormula(ln, col, tipo) ?? 0), 0);
    }
    if (lendo && alvoKey === lendo.itemKey && linha === lendo.linhaDados && col === lendo.col) {
      return valorColunaFormula(lendo.origem, col, tipo);
    }
    const ln = linhas[linha - 1];
    if (!ln) return null;
    return valorColunaFormula(ln, col, tipo);
  };

  for (let pass = 0; pass < 8; pass += 1) {
    let passChanged = false;
    for (const itemKey of Object.keys(next)) {
      const dim = next[itemKey];
      if (!dim?.linhas?.some((ln) => ln.formulas && Object.keys(ln.formulas).length > 0)) continue;
      const tipo = tipoDe(itemKey, dim);
      let linhas = dim.linhas;
      let itemChanged = false;
      for (let i = 0; i < linhas.length; i += 1) {
        const ln = linhas[i]!;
        if (ln.cabecalhoSecao || !ln.formulas) continue;
        let atual = ln;
        const origem = origemPorItem.get(itemKey)?.[i] ?? ln;
        let linhaDados = 0;
        for (let j = 0; j <= i; j += 1) {
          if (!linhas[j]?.cabecalhoSecao) linhaDados += 1;
        }
        for (const campo of ORDEM_CAMPOS_FORMULA) {
          const formula = String(atual.formulas?.[campo] ?? '').trim();
          if (!formula.startsWith('=')) continue;
          const ctx = contextoFormulaLinha(atual, tipo);
          const antigo = contextoFormulaLinha(origem, tipo);
          const token = tokenColunaFormula(campo);
          if (token === 'C') ctx.C = antigo.C;
          else if (token === 'L') ctx.L = antigo.L;
          else if (token === 'H') ctx.H = antigo.H;
          else if (token === 'N') ctx.N = antigo.N;
          else if (token === '%') ctx.empolamento = antigo.empolamento;
          else if (token === 'A') ctx.A = antigo.A;
          else if (token === 'V') ctx.V = antigo.V;
          else if (token === 'SUB') ctx.SUB = antigo.SUB;
          if (campo === 'valorManual') ctx.V = antigo.V;
          lendo = { itemKey, linhaDados, col: token, origem };
          const n = avaliarFormulaMedicao(formula, ctx, resolver);
          lendo = null;
          if (n == null) continue;
          const aplicado = aplicarNumeroFormula(atual, campo, n);
          if (aplicado === atual) continue;
          atual = aplicado;
          if (!itemChanged) {
            linhas = linhas.slice();
            itemChanged = true;
          }
          linhas[i] = atual;
          next = { ...next, [itemKey]: { ...dim, linhas } };
        }
      }
      if (itemChanged) {
        passChanged = true;
        any = true;
        if (!chavesAlteradas.includes(itemKey)) chavesAlteradas.push(itemKey);
      }
    }
    if (!passChanged) break;
  }

  return any ? { next, chavesAlteradas } : null;
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
