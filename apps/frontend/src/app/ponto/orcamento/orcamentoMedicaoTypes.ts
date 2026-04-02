/** Linha de medição para memória de cálculo dos quantitativos (C, L, H, N, empolamento, descrição) */
export interface LinhaMedicao {
  descricao?: string;
  origemLinhaId?: string;
  origemComposicaoDescricao?: string;
  C: number;
  L: number;
  H: number;
  N: number;
  empolamento: number;
  valorManual?: number;
  editavelC?: boolean;
  editavelL?: boolean;
  editavelH?: boolean;
}

export type TipoUnidadeFormula = 'm3' | 'm2' | 'm' | 'un';

export interface DimensoesItem {
  tipoUnidade: TipoUnidadeFormula;
  linhas: LinhaMedicao[];
}
