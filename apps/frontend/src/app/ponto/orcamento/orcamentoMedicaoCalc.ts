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
  return expr.replace(
    /(?<![A-Za-zÀ-ÿ0-9_.])(?:SUB|[CLHNAV]|%)(?![A-Za-zÀ-ÿ0-9_.])/gi,
    (match) => {
      if (match === '%') return String(Number(ctx.empolamento) || 0);
      const m = match.toUpperCase();
      if (m === 'C') return String(Number(ctx.C) || 0);
      if (m === 'L') return String(Number(ctx.L) || 0);
      if (m === 'H') return String(Number(ctx.H) || 0);
      if (m === 'N') return String(Number(ctx.N) || 0);
      if (m === 'A') return String(Number(ctx.A) || 0);
      if (m === 'V') return String(Number(ctx.V) || 0);
      if (m === 'SUB') return String(Number(ctx.SUB) || 0);
      return match;
    }
  );
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

type ValorFormula = { k: 'n'; v: number } | { k: 'b'; v: boolean };

type AstFormula =
  | { t: 'num'; v: number }
  | { t: 'un'; op: '+' | '-'; x: AstFormula }
  | { t: 'bin'; op: '+' | '-' | '*' | '/' | '^'; l: AstFormula; r: AstFormula }
  | { t: 'cmp'; op: '=' | '<>' | '<' | '>' | '<=' | '>='; l: AstFormula; r: AstFormula }
  | { t: 'call'; name: string; args: AstFormula[] };

function canonNomeFuncao(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

const ALIAS_FUNCAO: Record<string, string> = {
  ARRED: 'ARRED',
  ARREDONDAR: 'ARRED',
  ROUND: 'ARRED',
  'ARREDONDAR.PARA.CIMA': 'CIMA',
  ROUNDUP: 'CIMA',
  'ARREDONDAR.PARA.BAIXO': 'BAIXO',
  ROUNDDOWN: 'BAIXO',
  TRUNCAR: 'TRUNCAR',
  TRUNC: 'TRUNCAR',
  INT: 'INT',
  ABS: 'ABS',
  SINAL: 'SINAL',
  SIGN: 'SINAL',
  SOMA: 'SOMA',
  SUM: 'SOMA',
  MEDIA: 'MEDIA',
  AVERAGE: 'MEDIA',
  MAXIMO: 'MAXIMO',
  MAX: 'MAXIMO',
  MINIMO: 'MINIMO',
  MIN: 'MINIMO',
  MOD: 'MOD',
  RESTO: 'MOD',
  POTENCIA: 'POTENCIA',
  POWER: 'POTENCIA',
  RAIZ: 'RAIZ',
  SQRT: 'RAIZ',
  QUOCIENTE: 'QUOCIENTE',
  QUOTIENT: 'QUOCIENTE',
  MULT: 'MULT',
  PRODUCT: 'MULT',
  TETO: 'TETO',
  CEILING: 'TETO',
  PISO: 'PISO',
  FLOOR: 'PISO',
  'TETO.MAT': 'TETO.MAT',
  'CEILING.MATH': 'TETO.MAT',
  'PISO.MAT': 'PISO.MAT',
  'FLOOR.MATH': 'PISO.MAT',
  SE: 'SE',
  IF: 'SE',
  E: 'E',
  AND: 'E',
  OU: 'OU',
  OR: 'OU',
  NAO: 'NAO',
  NOT: 'NAO',
  SEERRO: 'SEERRO',
  IFERROR: 'SEERRO',
  PI: 'PI',
  GRAUS: 'GRAUS',
  DEGREES: 'GRAUS',
  RADIANOS: 'RADIANOS',
  RADIANS: 'RADIANOS',
  SEN: 'SEN',
  SIN: 'SEN',
  COS: 'COS',
  TAN: 'TAN',
  ASEN: 'ASEN',
  ASIN: 'ASEN',
  ACOS: 'ACOS',
  ATAN: 'ATAN',
  LN: 'LN',
  LOG: 'LOG',
  LOG10: 'LOG10',
  EXP: 'EXP',
  FATORIAL: 'FATORIAL',
  FACT: 'FATORIAL',
};

const FUNCAO_EXCEL: Record<string, string> = {
  ARRED: 'ROUND',
  CIMA: 'ROUNDUP',
  BAIXO: 'ROUNDDOWN',
  TRUNCAR: 'TRUNC',
  INT: 'INT',
  ABS: 'ABS',
  SINAL: 'SIGN',
  SOMA: 'SUM',
  MEDIA: 'AVERAGE',
  MAXIMO: 'MAX',
  MINIMO: 'MIN',
  MOD: 'MOD',
  POTENCIA: 'POWER',
  RAIZ: 'SQRT',
  QUOCIENTE: 'QUOTIENT',
  MULT: 'PRODUCT',
  TETO: 'CEILING',
  PISO: 'FLOOR',
  'TETO.MAT': 'CEILING.MATH',
  'PISO.MAT': 'FLOOR.MATH',
  SE: 'IF',
  E: 'AND',
  OU: 'OR',
  NAO: 'NOT',
  SEERRO: 'IFERROR',
  PI: 'PI',
  GRAUS: 'DEGREES',
  RADIANOS: 'RADIANS',
  SEN: 'SIN',
  COS: 'COS',
  TAN: 'TAN',
  ASEN: 'ASIN',
  ACOS: 'ACOS',
  ATAN: 'ATAN',
  LN: 'LN',
  LOG: 'LOG',
  LOG10: 'LOG10',
  EXP: 'EXP',
  FATORIAL: 'FACT',
};

/**
 * Traduz uma fórmula da memória (`=ARRED(C*L;2)`) para fórmula do Excel em inglês.
 * `letras` diz a coluna de cada atalho (C, L, H, %, N, A, V, SUB); o atalho da própria linha vira `X{r}`.
 * `externa` resolve `{rótulo!linha!campo}` para uma célula; devolve null se não achar.
 * Devolve null quando algo não puder ser traduzido: quem chama mantém o valor fixo.
 */
export function formulaMemoriaParaExcel(
  raw: string,
  letras: Record<string, string>,
  externa: (rotulo: string, linha: string, campo: string) => string | null
): string | null {
  const texto = String(raw ?? '').trim();
  if (!texto.startsWith('=')) return null;
  const s = texto.slice(1);
  let out = '';
  let i = 0;
  while (i < s.length) {
    const ch = s[i]!;
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === '{') {
      const fim = s.indexOf('}', i);
      if (fim < 0) return null;
      const m = /^\{([^{}!]+)!(\d+|T)!(SUB|C|L|H|N|%|A|V)\}$/i.exec(s.slice(i, fim + 1));
      if (!m) return null;
      const celula = externa(m[1]!.trim(), m[2]!.toUpperCase(), m[3]!.toUpperCase());
      if (!celula) return null;
      out += celula;
      i = fim + 1;
      continue;
    }
    if (ch === '%') {
      const letra = letras['%'];
      if (!letra) return null;
      out += `${letra}{r}`;
      i += 1;
      continue;
    }
    const num = lerNumeroFormula(s, i);
    if (num) {
      out += String(num.v);
      i = num.i;
      continue;
    }
    if (/[A-Za-zÀ-ÿ_]/.test(ch)) {
      let j = i + 1;
      while (j < s.length && /[A-Za-zÀ-ÿ0-9_]/.test(s[j]!)) j += 1;
      while (s[j] === '.' && /[A-Za-zÀ-ÿ]/.test(s[j + 1] ?? '')) {
        j += 2;
        while (j < s.length && /[A-Za-zÀ-ÿ0-9_]/.test(s[j]!)) j += 1;
      }
      const nome = s.slice(i, j);
      let k = j;
      while (/\s/.test(s[k] ?? '')) k += 1;
      if (s[k] === '(') {
        const excel = FUNCAO_EXCEL[ALIAS_FUNCAO[canonNomeFuncao(nome)] ?? ''];
        if (!excel) return null;
        out += excel;
      } else {
        const letra = letras[nome.toUpperCase()];
        if (!letra) return null;
        out += `${letra}{r}`;
      }
      i = j;
      continue;
    }
    const dois = s.slice(i, i + 2);
    if (dois === '<>' || dois === '<=' || dois === '>=') {
      out += dois;
      i += 2;
      continue;
    }
    if (ch === ';' || ch === ',') {
      out += ',';
      i += 1;
      continue;
    }
    if ('+-*/^=<>()'.includes(ch)) {
      out += ch;
      i += 1;
      continue;
    }
    return null;
  }
  return out && formulaExcelSintaxeValida(out) ? out : null;
}

/**
 * Checagem mínima da fórmula já traduzida: o Excel recusa a pasta de trabalho inteira («problema em um conteúdo»)
 * quando uma célula traz fórmula inválida, como `1.98I9` (falta operador entre número e referência).
 * Nesses casos o chamador mantém o valor fixo da célula.
 */
function formulaExcelSintaxeValida(f: string): boolean {
  // Nomes de função (SUM(, LOG10(…) saem da análise para não confundir dígito + «(».
  const semFuncoes = f.replace(/[A-Z][A-Z0-9.]*\(/g, '(');
  let nivel = 0;
  for (const ch of semFuncoes) {
    if (ch === '(') nivel += 1;
    else if (ch === ')') nivel -= 1;
    if (nivel < 0) return false;
  }
  if (nivel !== 0) return false;
  // Número, referência ou «)» colados em letra/«(» ou número, e operador solto no começo/fim.
  const comRefs = semFuncoes.replace(/[A-Za-z]\{(?:r|R\d+)\}/g, '#');
  if (/[\d})#](?=[A-Za-z(#])/.test(comRefs)) return false;
  if (/[})#](?=\d)/.test(comRefs)) return false;
  if (/^[*/^<>=,]|[+\-*/^<>=,]$/.test(semFuncoes)) return false;
  return true;
}

export type AjudaFuncaoFormula = {
  nome: string;
  assinatura: string;
  descricao: string;
};

/** Nomes que aparecem na lista enquanto a fórmula é digitada. */
export const AJUDA_FUNCOES_FORMULA: AjudaFuncaoFormula[] = [
  { nome: 'ABS', assinatura: 'ABS(núm)', descricao: 'Devolve o valor sem o sinal.' },
  { nome: 'ACOS', assinatura: 'ACOS(núm)', descricao: 'Arco cosseno, em radianos.' },
  { nome: 'ARRED', assinatura: 'ARRED(núm; casas)', descricao: 'Arredonda para o número mais próximo.' },
  { nome: 'ARREDONDAR', assinatura: 'ARREDONDAR(núm; casas)', descricao: 'O mesmo que ARRED.' },
  { nome: 'ARREDONDAR.PARA.BAIXO', assinatura: 'ARREDONDAR.PARA.BAIXO(núm; casas)', descricao: 'Arredonda em direção ao zero.' },
  { nome: 'ARREDONDAR.PARA.CIMA', assinatura: 'ARREDONDAR.PARA.CIMA(núm; casas)', descricao: 'Arredonda afastando do zero.' },
  { nome: 'ASEN', assinatura: 'ASEN(núm)', descricao: 'Arco seno, em radianos.' },
  { nome: 'ATAN', assinatura: 'ATAN(núm)', descricao: 'Arco tangente, em radianos.' },
  { nome: 'COS', assinatura: 'COS(núm)', descricao: 'Cosseno de um ângulo em radianos.' },
  { nome: 'E', assinatura: 'E(teste1; teste2)', descricao: 'Verdadeiro só se todos os testes forem verdadeiros.' },
  { nome: 'EXP', assinatura: 'EXP(núm)', descricao: 'Eleva e à potência informada.' },
  { nome: 'FATORIAL', assinatura: 'FATORIAL(núm)', descricao: 'Fatorial de um inteiro.' },
  { nome: 'GRAUS', assinatura: 'GRAUS(radianos)', descricao: 'Converte radianos em graus.' },
  { nome: 'INT', assinatura: 'INT(núm)', descricao: 'Arredonda para baixo até o inteiro.' },
  { nome: 'LN', assinatura: 'LN(núm)', descricao: 'Logaritmo natural.' },
  { nome: 'LOG', assinatura: 'LOG(núm; base)', descricao: 'Logaritmo. Sem a base, usa 10.' },
  { nome: 'LOG10', assinatura: 'LOG10(núm)', descricao: 'Logaritmo de base 10.' },
  { nome: 'MÁXIMO', assinatura: 'MÁXIMO(n1; n2)', descricao: 'O maior dos números.' },
  { nome: 'MÉDIA', assinatura: 'MÉDIA(n1; n2)', descricao: 'Média dos números.' },
  { nome: 'MÍNIMO', assinatura: 'MÍNIMO(n1; n2)', descricao: 'O menor dos números.' },
  { nome: 'MOD', assinatura: 'MOD(núm; divisor)', descricao: 'Resto da divisão.' },
  { nome: 'MULT', assinatura: 'MULT(n1; n2)', descricao: 'Multiplica os números.' },
  { nome: 'NÃO', assinatura: 'NÃO(teste)', descricao: 'Inverte verdadeiro e falso.' },
  { nome: 'OU', assinatura: 'OU(teste1; teste2)', descricao: 'Verdadeiro se algum teste for verdadeiro.' },
  { nome: 'PI', assinatura: 'PI()', descricao: 'Valor de π.' },
  { nome: 'PISO', assinatura: 'PISO(núm; múltiplo)', descricao: 'Arredonda para baixo até o múltiplo.' },
  { nome: 'POTÊNCIA', assinatura: 'POTÊNCIA(núm; expoente)', descricao: 'Eleva o número à potência.' },
  { nome: 'QUOCIENTE', assinatura: 'QUOCIENTE(núm; divisor)', descricao: 'Parte inteira da divisão.' },
  { nome: 'RADIANOS', assinatura: 'RADIANOS(graus)', descricao: 'Converte graus em radianos.' },
  { nome: 'RAIZ', assinatura: 'RAIZ(núm)', descricao: 'Raiz quadrada.' },
  { nome: 'SE', assinatura: 'SE(teste; se_verdadeiro; se_falso)', descricao: 'Escolhe um valor conforme o teste.' },
  { nome: 'SEERRO', assinatura: 'SEERRO(valor; se_erro)', descricao: 'Se a conta falhar, devolve o outro valor.' },
  { nome: 'SEN', assinatura: 'SEN(núm)', descricao: 'Seno de um ângulo em radianos.' },
  { nome: 'SINAL', assinatura: 'SINAL(núm)', descricao: '1, 0 ou -1 conforme o sinal.' },
  { nome: 'SOMA', assinatura: 'SOMA(n1; n2)', descricao: 'Soma os números.' },
  { nome: 'TAN', assinatura: 'TAN(núm)', descricao: 'Tangente de um ângulo em radianos.' },
  { nome: 'TETO', assinatura: 'TETO(núm; múltiplo)', descricao: 'Arredonda para cima até o múltiplo.' },
  { nome: 'TRUNCAR', assinatura: 'TRUNCAR(núm; casas)', descricao: 'Corta as casas, sem arredondar.' },
];

export function sugestoesFuncaoFormula(prefixo: string): AjudaFuncaoFormula[] {
  const alvo = canonNomeFuncao(prefixo);
  const lista = alvo
    ? AJUDA_FUNCOES_FORMULA.filter((item) => canonNomeFuncao(item.nome).startsWith(alvo))
    : AJUDA_FUNCOES_FORMULA;
  return lista;
}

/** Nome de função ainda incompleto, logo antes do cursor. */
export function prefixoFuncaoNoCursor(
  formula: string,
  cursor: number
): { inicio: number; prefixo: string } | null {
  if (!formula.trimStart().startsWith('=')) return null;
  const ate = formula.slice(0, Math.max(0, cursor));
  const match = ate.match(/(?:^|[=+\-*/^(;,])\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9.]*)?$/);
  if (!match) return null;
  const prefixo = match[1] ?? '';
  return { inicio: ate.length - prefixo.length, prefixo };
}

export function ajudaFuncaoAberta(formula: string, cursor: number): AjudaFuncaoFormula | null {
  let profundidade = 0;
  for (let i = Math.max(0, cursor) - 1; i >= 0; i -= 1) {
    const ch = formula[i];
    if (ch === ')') profundidade += 1;
    else if (ch === '(') {
      if (profundidade === 0) {
        const nome = formula.slice(0, i).match(/([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9.]*)$/)?.[1];
        if (!nome) return null;
        const alvo = canonNomeFuncao(nome);
        return AJUDA_FUNCOES_FORMULA.find((item) => canonNomeFuncao(item.nome) === alvo) ?? null;
      }
      profundidade -= 1;
    }
  }
  return null;
}

function lerNumeroFormula(s: string, i: number): { v: number; i: number } | null {
  if (!/\d/.test(s[i] ?? '')) return null;
  let j = i;
  while (j < s.length && /\d/.test(s[j]!)) j += 1;
  const inteiro = s.slice(i, j);
  if (s[j] === '.' && /\d/.test(s[j + 1] ?? '')) {
    const milhar = /^(\.\d{3})+(,\d+)?/.exec(s.slice(j));
    if (milhar && milhar[0].includes(',')) {
      const bruto = inteiro + milhar[0];
      return { v: Number(bruto.replace(/\./g, '').replace(',', '.')), i: j + milhar[0].length };
    }
    let k = j + 1;
    while (k < s.length && /\d/.test(s[k]!)) k += 1;
    return { v: Number(`${inteiro}.${s.slice(j + 1, k)}`), i: k };
  }
  if (s[j] === ',' && /\d/.test(s[j + 1] ?? '')) {
    let k = j + 1;
    while (k < s.length && /\d/.test(s[k]!)) k += 1;
    return { v: Number(`${inteiro}.${s.slice(j + 1, k)}`), i: k };
  }
  return { v: Number(inteiro), i: j };
}

function tokenizarFormula(s: string): Array<{ t: string; v?: string | number }> | null {
  const out: Array<{ t: string; v?: string | number }> = [];
  let i = 0;
  while (i < s.length) {
    const ch = s[i]!;
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    const num = lerNumeroFormula(s, i);
    if (num) {
      out.push({ t: 'num', v: num.v });
      i = num.i;
      continue;
    }
    if (/[A-Za-zÀ-ÿ_]/.test(ch)) {
      let j = i + 1;
      while (j < s.length && /[A-Za-zÀ-ÿ0-9_]/.test(s[j]!)) j += 1;
      while (s[j] === '.' && /[A-Za-zÀ-ÿ]/.test(s[j + 1] ?? '')) {
        j += 2;
        while (j < s.length && /[A-Za-zÀ-ÿ0-9_]/.test(s[j]!)) j += 1;
      }
      out.push({ t: 'id', v: s.slice(i, j) });
      i = j;
      continue;
    }
    const dois = s.slice(i, i + 2);
    if (dois === '<>' || dois === '<=' || dois === '>=') {
      out.push({ t: 'op', v: dois });
      i += 2;
      continue;
    }
    if ('+-*/^=<>'.includes(ch)) {
      out.push({ t: 'op', v: ch });
      i += 1;
      continue;
    }
    if (ch === '(') {
      out.push({ t: 'lp' });
      i += 1;
      continue;
    }
    if (ch === ')') {
      out.push({ t: 'rp' });
      i += 1;
      continue;
    }
    if (ch === ';' || ch === ',') {
      out.push({ t: 'sep' });
      i += 1;
      continue;
    }
    return null;
  }
  out.push({ t: 'eof' });
  return out;
}

function avaliarAstFormula(ast: AstFormula): ValorFormula | null {
  if (ast.t === 'num') return { k: 'n', v: ast.v };
  if (ast.t === 'un') {
    const x = avaliarAstFormula(ast.x);
    const n = x ? numeroDaFormula(x) : null;
    if (n == null) return null;
    return { k: 'n', v: ast.op === '-' ? -n : n };
  }
  if (ast.t === 'bin') {
    const l = avaliarAstFormula(ast.l);
    const r = avaliarAstFormula(ast.r);
    const a = l ? numeroDaFormula(l) : null;
    const b = r ? numeroDaFormula(r) : null;
    if (a == null || b == null) return null;
    if (ast.op === '+') return { k: 'n', v: a + b };
    if (ast.op === '-') return { k: 'n', v: a - b };
    if (ast.op === '*') return { k: 'n', v: a * b };
    if (ast.op === '/') return b === 0 ? null : { k: 'n', v: a / b };
    return { k: 'n', v: a ** b };
  }
  if (ast.t === 'cmp') {
    const l = avaliarAstFormula(ast.l);
    const r = avaliarAstFormula(ast.r);
    const a = l ? numeroDaFormula(l) : null;
    const b = r ? numeroDaFormula(r) : null;
    if (a == null || b == null) return null;
    const igual = Math.abs(a - b) < 1e-9;
    let ok = false;
    if (ast.op === '=') ok = igual;
    else if (ast.op === '<>') ok = !igual;
    else if (ast.op === '<') ok = a < b && !igual;
    else if (ast.op === '>') ok = a > b && !igual;
    else if (ast.op === '<=') ok = a < b || igual;
    else ok = a > b || igual;
    return { k: 'b', v: ok };
  }
  return avaliarChamadaFormula(ast.name, ast.args);
}

function numeroDaFormula(v: ValorFormula): number | null {
  if (v.k === 'n') return Number.isFinite(v.v) ? v.v : null;
  return v.v ? 1 : 0;
}

function boolDaFormula(v: ValorFormula): boolean {
  if (v.k === 'b') return v.v;
  return v.v !== 0;
}

function numerosDaChamada(args: AstFormula[]): number[] | null {
  const out: number[] = [];
  for (const arg of args) {
    const v = avaliarAstFormula(arg);
    const n = v ? numeroDaFormula(v) : null;
    if (n == null) return null;
    out.push(n);
  }
  return out;
}

function fatorDez(casas: number): number {
  const d = Math.trunc(casas);
  if (!Number.isFinite(d) || Math.abs(d) > 12) return Number.NaN;
  return 10 ** d;
}

function arredondarMetade(n: number, casas: number): number | null {
  const f = fatorDez(casas);
  if (!Number.isFinite(f) || f === 0) return null;
  const deslocado = Number((n * f).toPrecision(15));
  const arred = deslocado >= 0 ? Math.round(deslocado) : -Math.round(Math.abs(deslocado));
  return arred / f;
}

function arredondarFora(n: number, casas: number): number | null {
  const f = fatorDez(casas);
  if (!Number.isFinite(f) || f === 0) return null;
  const deslocado = Number((n * f).toPrecision(15));
  const arred = deslocado >= 0 ? Math.ceil(deslocado - 1e-10) : Math.floor(deslocado + 1e-10);
  return arred / f;
}

function arredondarDentro(n: number, casas: number): number | null {
  const f = fatorDez(casas);
  if (!Number.isFinite(f) || f === 0) return null;
  return Math.trunc(Number((n * f).toPrecision(15))) / f;
}

function multiploExcel(n: number, sig: number, cima: boolean): number | null {
  if (!Number.isFinite(n) || !Number.isFinite(sig) || sig === 0) return null;
  const q = n / sig;
  const ajustado = Number(q.toPrecision(15));
  const passo = cima ? Math.ceil(ajustado - 1e-10) : Math.floor(ajustado + 1e-10);
  return passo * sig;
}

function avaliarChamadaFormula(nomeBruto: string, args: AstFormula[]): ValorFormula | null {
  const nome = ALIAS_FUNCAO[canonNomeFuncao(nomeBruto)];
  if (!nome) return null;
  if (nome === 'SE') {
    if (args.length < 2 || args.length > 3) return null;
    const cond = avaliarAstFormula(args[0]!);
    if (!cond) return null;
    if (boolDaFormula(cond)) return avaliarAstFormula(args[1]!);
    if (args.length === 3) return avaliarAstFormula(args[2]!);
    return { k: 'n', v: 0 };
  }
  if (nome === 'SEERRO') {
    if (args.length !== 2) return null;
    return avaliarAstFormula(args[0]!) ?? avaliarAstFormula(args[1]!);
  }
  if (nome === 'E' || nome === 'OU') {
    if (!args.length) return null;
    let acc = nome === 'E';
    for (const arg of args) {
      const v = avaliarAstFormula(arg);
      if (!v) return null;
      const b = boolDaFormula(v);
      acc = nome === 'E' ? acc && b : acc || b;
    }
    return { k: 'b', v: acc };
  }
  if (nome === 'NAO') {
    if (args.length !== 1) return null;
    const v = avaliarAstFormula(args[0]!);
    if (!v) return null;
    return { k: 'b', v: !boolDaFormula(v) };
  }
  if (nome === 'PI') {
    if (args.length) return null;
    return { k: 'n', v: Math.PI };
  }
  const nums = numerosDaChamada(args);
  if (!nums) return null;
  if (nome === 'SOMA') {
    if (!nums.length) return null;
    return { k: 'n', v: nums.reduce((s, n) => s + n, 0) };
  }
  if (nome === 'MEDIA') {
    if (!nums.length) return null;
    return { k: 'n', v: nums.reduce((s, n) => s + n, 0) / nums.length };
  }
  if (nome === 'MAXIMO') {
    if (!nums.length) return null;
    return { k: 'n', v: Math.max(...nums) };
  }
  if (nome === 'MINIMO') {
    if (!nums.length) return null;
    return { k: 'n', v: Math.min(...nums) };
  }
  if (nome === 'MULT') {
    if (!nums.length) return null;
    return { k: 'n', v: nums.reduce((s, n) => s * n, 1) };
  }
  if (nome === 'ABS' && nums.length === 1) return { k: 'n', v: Math.abs(nums[0]!) };
  if (nome === 'SINAL' && nums.length === 1) {
    return { k: 'n', v: nums[0]! > 0 ? 1 : nums[0]! < 0 ? -1 : 0 };
  }
  if (nome === 'INT' && nums.length === 1) return { k: 'n', v: Math.floor(nums[0]!) };
  if (nome === 'RAIZ' && nums.length === 1) {
    return nums[0]! < 0 ? null : { k: 'n', v: Math.sqrt(nums[0]!) };
  }
  if (nome === 'GRAUS' && nums.length === 1) return { k: 'n', v: (nums[0]! * 180) / Math.PI };
  if (nome === 'RADIANOS' && nums.length === 1) return { k: 'n', v: (nums[0]! * Math.PI) / 180 };
  if (nome === 'SEN' && nums.length === 1) return { k: 'n', v: Math.sin(nums[0]!) };
  if (nome === 'COS' && nums.length === 1) return { k: 'n', v: Math.cos(nums[0]!) };
  if (nome === 'TAN' && nums.length === 1) return { k: 'n', v: Math.tan(nums[0]!) };
  if (nome === 'ASEN' && nums.length === 1) return { k: 'n', v: Math.asin(nums[0]!) };
  if (nome === 'ACOS' && nums.length === 1) return { k: 'n', v: Math.acos(nums[0]!) };
  if (nome === 'ATAN' && nums.length === 1) return { k: 'n', v: Math.atan(nums[0]!) };
  if (nome === 'LN' && nums.length === 1) return nums[0]! <= 0 ? null : { k: 'n', v: Math.log(nums[0]!) };
  if (nome === 'LOG10' && nums.length === 1) {
    return nums[0]! <= 0 ? null : { k: 'n', v: Math.log10(nums[0]!) };
  }
  if (nome === 'LOG') {
    if (nums.length < 1 || nums.length > 2 || nums[0]! <= 0) return null;
    const base = nums.length === 2 ? nums[1]! : 10;
    if (base <= 0 || base === 1) return null;
    return { k: 'n', v: Math.log(nums[0]!) / Math.log(base) };
  }
  if (nome === 'EXP' && nums.length === 1) return { k: 'n', v: Math.exp(nums[0]!) };
  if (nome === 'FATORIAL' && nums.length === 1) {
    const n = nums[0]!;
    if (n < 0 || n > 170 || !Number.isInteger(n)) return null;
    let acc = 1;
    for (let i = 2; i <= n; i += 1) acc *= i;
    return { k: 'n', v: acc };
  }
  if (nome === 'ARRED') {
    if (nums.length < 1 || nums.length > 2) return null;
    const v = arredondarMetade(nums[0]!, nums[1] ?? 0);
    return v == null ? null : { k: 'n', v };
  }
  if (nome === 'CIMA') {
    if (nums.length < 1 || nums.length > 2) return null;
    const v = arredondarFora(nums[0]!, nums[1] ?? 0);
    return v == null ? null : { k: 'n', v };
  }
  if (nome === 'BAIXO' || nome === 'TRUNCAR') {
    if (nums.length < 1 || nums.length > 2) return null;
    const v = arredondarDentro(nums[0]!, nums[1] ?? 0);
    return v == null ? null : { k: 'n', v };
  }
  if (nome === 'MOD' && nums.length === 2) {
    if (nums[1] === 0) return null;
    return { k: 'n', v: nums[0]! - nums[1]! * Math.floor(nums[0]! / nums[1]!) };
  }
  if (nome === 'POTENCIA' && nums.length === 2) return { k: 'n', v: nums[0]! ** nums[1]! };
  if (nome === 'QUOCIENTE' && nums.length === 2) {
    if (nums[1] === 0) return null;
    return { k: 'n', v: Math.trunc(nums[0]! / nums[1]!) };
  }
  if (nome === 'TETO' || nome === 'PISO') {
    if (nums.length < 1 || nums.length > 2) return null;
    const v = multiploExcel(nums[0]!, nums[1] ?? 1, nome === 'TETO');
    return v == null ? null : { k: 'n', v };
  }
  if (nome === 'TETO.MAT' || nome === 'PISO.MAT') {
    if (nums.length < 1 || nums.length > 2) return null;
    const v = multiploExcel(nums[0]!, nums[1] ?? 1, nome === 'TETO.MAT');
    return v == null ? null : { k: 'n', v };
  }
  return null;
}

function analisarFormula(expr: string): AstFormula | null {
  const toks = tokenizarFormula(expr);
  if (!toks) return null;
  let i = 0;
  const peek = () => toks[i]!;
  const come = (t: string, v?: string) => {
    const atual = peek();
    if (atual.t !== t || (v != null && atual.v !== v)) return false;
    i += 1;
    return true;
  };
  const parseCmp = (): AstFormula | null => {
    let l = parseAdd();
    if (!l) return null;
    while (peek().t === 'op' && ['=', '<>', '<', '>', '<=', '>='].includes(String(peek().v))) {
      const op = String(peek().v) as AstFormula & { t: 'cmp' } extends never ? string : '=' | '<>' | '<' | '>' | '<=' | '>=';
      i += 1;
      const r = parseAdd();
      if (!r) return null;
      l = { t: 'cmp', op, l, r };
    }
    return l;
  };
  const parseAdd = (): AstFormula | null => {
    let l = parseMul();
    if (!l) return null;
    while (peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
      const op = peek().v as '+' | '-';
      i += 1;
      const r = parseMul();
      if (!r) return null;
      l = { t: 'bin', op, l, r };
    }
    return l;
  };
  const parseMul = (): AstFormula | null => {
    let l = parsePow();
    if (!l) return null;
    while (peek().t === 'op' && (peek().v === '*' || peek().v === '/')) {
      const op = peek().v as '*' | '/';
      i += 1;
      const r = parsePow();
      if (!r) return null;
      l = { t: 'bin', op, l, r };
    }
    return l;
  };
  const parsePow = (): AstFormula | null => {
    const l = parseUn();
    if (!l) return null;
    if (peek().t === 'op' && peek().v === '^') {
      i += 1;
      const r = parsePow();
      if (!r) return null;
      return { t: 'bin', op: '^', l, r };
    }
    return l;
  };
  const parseUn = (): AstFormula | null => {
    if (peek().t === 'op' && (peek().v === '+' || peek().v === '-')) {
      const op = peek().v as '+' | '-';
      i += 1;
      const x = parseUn();
      if (!x) return null;
      return { t: 'un', op, x };
    }
    return parsePrim();
  };
  const parsePrim = (): AstFormula | null => {
    if (come('num')) return { t: 'num', v: Number(toks[i - 1]!.v) };
    if (peek().t === 'id') {
      const name = String(peek().v);
      i += 1;
      if (!come('lp')) return null;
      const args: AstFormula[] = [];
      if (!come('rp')) {
        while (true) {
          const arg = parseCmp();
          if (!arg) return null;
          args.push(arg);
          if (come('rp')) break;
          if (!come('sep')) return null;
        }
      }
      return { t: 'call', name, args };
    }
    if (!come('lp')) return null;
    const inner = parseCmp();
    if (!inner || !come('rp')) return null;
    return inner;
  };
  const ast = parseCmp();
  if (!ast || peek().t !== 'eof') return null;
  return ast;
}

function avaliarExpressaoFormula(expr: string): number | null {
  const ast = analisarFormula(expr);
  if (!ast) return null;
  const valor = avaliarAstFormula(ast);
  const n = valor ? numeroDaFormula(valor) : null;
  return n != null && Number.isFinite(n) ? n : null;
}

/** Valor de uma fórmula da memória (`=C+L+N`, `=ARRED(C;2)`) ou de um número digitado. */
export function avaliarFormulaMedicao(
  raw: string,
  rowCtx?: ContextoFormulaMedicao,
  resolverExterna?: ResolverFormulaExterna
): number | null {
  const text = String(raw ?? '').trim();
  if (text.startsWith('=')) {
    let s = text.slice(1).trim();
    if (resolverExterna && s.includes('{')) {
      const externo = substituirRefsFormulaExternas(s, resolverExterna);
      if (!externo.ok) return null;
      s = externo.expr;
    }
    if (rowCtx) s = substituirRefsFormulaLinha(s, rowCtx);
    if (!s) return null;
    return avaliarExpressaoFormula(s);
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
