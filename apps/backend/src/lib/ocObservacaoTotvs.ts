/**
 * Observação da OC no TOTVS (TMOV.OBSERVACAO): o RM aceita no máximo 60 caracteres
 * (quebras de linha contam 2). Vai só o texto escrito pelo usuário, em uma linha —
 * os blocos de histórico que o Conecta acrescenta às notas ("[Item devolvido à RM — …]",
 * "[Correção OC …]", "[OC cancelada …]") ficam só no Conecta.
 * Manter igual a `observacaoParaTotvs` no front (OcPurchaseOrderFormFields).
 */
export const TOTVS_OC_OBSERVACAO_MAX = 60;

export function observacaoParaTotvs(notes: string | null | undefined): string {
  if (!notes?.trim()) return '';
  return notes
    .split(/\r?\n\s*\r?\n+/)
    .filter((bloco) => !/^\[[^\]]*\]/.test(bloco.trim()))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}
