/** Nome curto pra UI: primeiro + último sobrenome se for muito longo. */
export function formatMenuDisplayName(name?: string | null): string {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'Colaborador';
  if (parts.length <= 2) return parts.join(' ');
  const compact = `${parts[0]} ${parts[parts.length - 1]}`;
  if (compact.length <= 28) return compact;
  return `${parts[0]} ${parts[parts.length - 1].charAt(0)}.`;
}
