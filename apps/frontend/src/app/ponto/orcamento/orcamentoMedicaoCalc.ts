import type { LinhaMedicao, TipoUnidadeFormula } from './orcamentoMedicaoTypes';

/** Calcula A (área) = C×L×N, V (volume) = A×H ou C×L×H×N */
export function calcA(linha: LinhaMedicao): number {
  const { C, L, N } = linha;
  return (C || 0) * (L || 0) * (N && N > 0 ? N : 1);
}

export function calcV(linha: LinhaMedicao, tipo: TipoUnidadeFormula): number {
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
    default:
      return 1;
  }
}

/** Calcula SUBTOTAL = V × empolamento. Se C,L,H vazios e valorManual preenchido, usa valorManual. */
export function calcularQuantidadeLinha(linha: LinhaMedicao, tipo: TipoUnidadeFormula): number {
  const fator =
    linha.empolamento != null && linha.empolamento > 0
      ? linha.empolamento
      : (linha as unknown as { percPerda?: number }).percPerda != null
        ? 1 + (linha as unknown as { percPerda: number }).percPerda / 100
        : 1;
  const temDimensoes = (linha.C || 0) !== 0 || (linha.L || 0) !== 0 || (linha.H || 0) !== 0;
  if (!temDimensoes && linha.valorManual != null && linha.valorManual >= 0) {
    return linha.valorManual * fator;
  }
  return calcV(linha, tipo) * fator;
}

export function inferirTipoUnidadePorDimensao(linhas: LinhaMedicao[] | undefined): TipoUnidadeFormula {
  if (!linhas?.length) return 'un';
  const hasH = linhas.some(ln => (ln.H || 0) > 0);
  if (hasH) return 'm3';
  const hasL = linhas.some(ln => (ln.L || 0) > 0);
  if (hasL) return 'm2';
  const hasC = linhas.some(ln => (ln.C || 0) > 0);
  if (hasC) return 'm';
  return 'un';
}
