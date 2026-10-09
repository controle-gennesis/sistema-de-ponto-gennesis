export type TipoUnidadeFormula = 'm3' | 'm2' | 'm' | 'un';

/** Linha de medição para memória de cálculo dos quantitativos (C, L, H, N, empolamento, descrição) */
/** Campos numéricos da memória que aceitam fórmula (=2*4): no foco mostra a fórmula, fora mostra o valor. */
export type CampoFormulaMedicao =
  | 'C'
  | 'L'
  | 'H'
  | 'N'
  | 'empolamento'
  | 'valorManual'
  | 'subtotalManual';

export interface LinhaMedicao {
  /** Linha visual de seção (cabeçalho da grade no corpo); não entra em totais nem na carga agregada. */
  cabecalhoSecao?: boolean;
  descricao?: string;
  origemLinhaId?: string;
  /** Rótulo da composição de origem na planilha (ex.: 2.1.1) — memória / carga agregada. */
  origemComposicaoRotulo?: string;
  origemComposicaoDescricao?: string;
  C: number;
  L: number;
  H: number;
  N: number;
  empolamento: number;
  valorManual?: number;
  /** Quantidade final da linha, quando o subtotal é digitado no lugar do cálculo automático. */
  subtotalManual?: number;
  /** Fórmulas digitadas (=expr); o valor numérico fica em C/L/H/… */
  formulas?: Partial<Record<CampoFormulaMedicao, string>>;
  /**
   * Carga agregada: soma na origem — para m³ soma de volumes; para m² soma de áreas (base para A e para V = A×H na carga).
   */
  volumeM3BrutoSomado?: number;
  /** Unidade da composição de origem (define como interpretar volumeM3BrutoSomado na linha agregada da carga). */
  tipoOrigemMedicao?: TipoUnidadeFormula;
  /** Linha gerada pela agregação automática da carga (não é detalhe por medição). */
  linhaAgregadaCarga?: boolean;
  /** Memória de outra composição incluída nesta grade (chave do item de origem). */
  origemMemoriaKey?: string;
  /** Totais automáticos da memória de origem. Apagar a célula volta a estes números. */
  autoMemoria?: {
    descricao: string;
    C: number;
    L: number;
    H: number;
    N: number;
    empolamento: number;
    a: number;
    v: number;
    subtotal: number;
  };
  /** Campos que o usuário editou nesta linha incluída. Sem a marca, o campo segue o automático. */
  overrideMemoria?: Partial<
    Record<'descricao' | 'C' | 'L' | 'H' | 'N' | 'empolamento' | 'a' | 'v' | 'subtotal', true>
  >;
  /** Área total da composição de origem, exibida na coluna A. */
  aManual?: number;
  /** Volume total da composição de origem, exibido na coluna V. */
  vManual?: number;
  editavelC?: boolean;
  editavelL?: boolean;
  editavelH?: boolean;
}

/** Rótulo exibido no cabeçalho das colunas de medição e % (memória de cálculo). */
export interface RotulosColunasMedicao {
  /** Primeira coluna (descrição das linhas de medição). Padrão na UI: «DESCRIÇÃO: ». */
  descricao?: string;
  C?: string;
  L?: string;
  H?: string;
  N?: string;
  /** Coluna empolamento / % */
  pct?: string;
}

/**
 * Opções do cabeçalho (só rótulo; ordem dos dados C/L/H/N no cálculo não muda).
 * Inclui letras de coluna, constantes e unidades / períodos usuais em obra.
 */
export const ROTULO_COLUNA_MEDICAO_OPCOES = [
  'C',
  'L',
  'H',
  'N',
  '%',
  'π',
  'pi',
  'e',
  'D',
  'R',
  'φ',
  'A',
  'V',
  'P',
  'Q',
  'F',
  'K',
  'i',
  'n',
  'm',
  'M',
  'cm',
  'mm',
  'km',
  'm²',
  'm³',
  'cm²',
  'cm³',
  'ha',
  'UN',
  'und',
  'cj',
  'vb',
  'pç',
  'par',
  'dz',
  'Kg',
  'g',
  't',
  'L',
  'mL',
  'm³/h',
  'L/s',
  'L/min',
  'h',
  'min',
  's',
  'dia',
  'sem',
  'Mês',
  'ano',
  'vez',
  'vb/mês',
  'h/dia',
  'kWh',
  'CV',
  'HP',
  'kW',
  'W',
  '°C',
  'bar',
  'MPa',
  'kgf/cm²',
  'kg/m',
  'kg/m²',
  'kg/m³',
  't/m³',
  'sc',
  'gal',
  'ton',
  '—'
] as const;

/** Linha de contagem por local — memória de cálculo p/ itens em "un" (sem fórmula C×L×H, só soma). */
export interface LinhaContagem {
  descricao?: string;
  quantidade: number;
}

export interface DimensoesItem {
  tipoUnidade: TipoUnidadeFormula;
  linhas: LinhaMedicao[];
  /** Só para itens "un" quando o orçamento usa memória de cálculo — lista de quantidades por local. */
  linhasContagem?: LinhaContagem[];
  /** Cabeçalhos editáveis C/L/H/N/% (ex.: Mês, Kg). */
  rotulosColunas?: RotulosColunasMedicao;
  /** Observação livre na faixa do item (memória de cálculo). */
  observacao?: string;
}
