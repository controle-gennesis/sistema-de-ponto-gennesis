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
