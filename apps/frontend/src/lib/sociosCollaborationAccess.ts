/**
 * Rotas ocultas/bloqueadas para o setor Sócios: colaboração (só o Drive fica liberado)
 * e páginas gerais que não fazem parte do trabalho deles.
 */
export const SOCIOS_BLOCKED_COLLABORATION_ROUTES = [
  '/ponto/conversas',
  '/ponto/agenda',
  '/ponto/flow',
  '/ponto/kanban',
  '/ponto/solicitacoes-gerais',
  '/ponto/solicitar-combustivel',
  '/ponto/reserva-veiculos',
  '/ponto/central-de-ajuda',
  '/ponto/treinamentos',
] as const;

function normalizeDepartment(department?: string | null): string {
  return (department || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/** Setor cadastrado como «Sócios» (ou variantes). */
export function isSociosDepartment(department?: string | null): boolean {
  const normalized = normalizeDepartment(department);
  if (!normalized) return false;
  if (normalized === 'socios' || normalized === 'socio') return true;
  // Ex.: "Setor Sócios", "Sócios / Diretoria"
  if (normalized.includes('socios')) return true;
  return /(^|[^a-z])socio([^a-z]|$)/.test(normalized);
}

export function isSociosBlockedCollaborationPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  return SOCIOS_BLOCKED_COLLABORATION_ROUTES.some(
    (base) => pathname === base || pathname.startsWith(`${base}/`)
  );
}
