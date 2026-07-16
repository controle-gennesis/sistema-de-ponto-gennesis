/** Número curto exibido na coluna OC da listagem (`OC-2026-0007` → `7`). */
export function formatOcListDisplayId(orderNumber: string): string {
  const trimmed = orderNumber.trim();
  if (!trimmed) return '—';

  const match = trimmed.match(/^OC-\d{4}-(\d+)$/i);
  if (match) return String(parseInt(match[1], 10));

  const lastSegment = trimmed.split('-').pop();
  if (lastSegment && /^\d+$/.test(lastSegment)) {
    return String(parseInt(lastSegment, 10));
  }

  return trimmed;
}

/** Observação padrão ao lançar OC no controle financeiro. */
export function formatOcFinancialControlOriginNote(orderNumber: string): string {
  const short = formatOcListDisplayId(orderNumber);
  const n = short === '—' ? orderNumber.trim() : short;
  return `Lançamento originado da Ordem de Compra ${n}`;
}

/**
 * Exibe observação do controle financeiro com OC encurtada
 * (`… da OC OC-2028-0009` → `… da Ordem de Compra 9`).
 */
export function formatFinancialControlObservationDisplay(note: string | null | undefined): string {
  if (!note?.trim()) return '';
  let s = note.trim();
  s = s.replace(/\bOC-\d{4}-(\d+)\b/gi, (_, digits: string) => String(parseInt(digits, 10)));
  s = s.replace(/Lançamento originado da OC\b/i, 'Lançamento originado da Ordem de Compra');
  return s;
}
