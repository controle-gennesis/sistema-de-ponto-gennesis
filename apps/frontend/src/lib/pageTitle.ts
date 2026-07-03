import { PERMISSION_MODULES } from '@sistema-ponto/permission-modules';

export const APP_TITLE = 'Gennesis Attendance';

/** Rotas que não estão em PERMISSION_MODULES ou usam href diferente no menu. */
const EXTRA_PAGE_TITLES: Record<string, string> = {
  '/ponto/home': 'Início',
  '/ponto/aprovacoes': 'Aprovações',
  '/ponto/solicitacoes-gerais': 'Solicitações Gerais',
  '/ponto/gerenciar-solicitacoes-gerais': 'Gerenciar Solicitações',
  '/ponto/conversas': 'Conversas',
  '/ponto/gestao-solicitacoes': 'Gestão de Solicitações',
  '/auth/login': 'Login',
};

const SUB_PATH_TITLES: Record<string, string> = {
  andamento: 'Andamento',
  'cronograma-mensal': 'Cronograma Mensal',
  'historico-os': 'Histórico OS',
  faturamento: 'Faturamento',
  relatorios: 'Relatórios Fotográficos',
};

const MODULES_BY_HREF_LENGTH = [...PERMISSION_MODULES].sort(
  (a, b) => b.href.length - a.href.length,
);

function normalizePath(pathname: string): string {
  const trimmed = pathname.replace(/\/$/, '');
  return trimmed || '/';
}

function humanizeSegment(segment: string): string {
  return segment
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** Decodifica segmentos dinâmicos da URL (ex.: `Paulo%20anania` → `Paulo anania`). */
function decodePathSegment(segment: string): string {
  try {
    return decodeURIComponent(segment.replace(/\+/g, ' '));
  } catch {
    return segment;
  }
}

/** Resolve o nome da página a partir da rota (ex.: `/ponto/kanban` → `Tasks`). */
export function resolvePageTitle(pathname: string): string | null {
  const path = normalizePath(pathname);

  if (EXTRA_PAGE_TITLES[path]) {
    return EXTRA_PAGE_TITLES[path];
  }

  for (const module of MODULES_BY_HREF_LENGTH) {
    if (path === module.href) {
      return module.name;
    }

    if (path.startsWith(`${module.href}/`)) {
      const suffix = path.slice(module.href.length + 1);
      const segments = suffix.split('/').filter(Boolean);
      const lastSegment = decodePathSegment(segments[segments.length - 1] ?? '');

      if (!lastSegment || /^[0-9a-f-]{8,}$/i.test(lastSegment)) {
        return module.name;
      }

      const subTitle = SUB_PATH_TITLES[lastSegment] ?? humanizeSegment(lastSegment);
      return `${module.name} - ${subTitle}`;
    }
  }

  return null;
}

export function buildDocumentTitle(pageTitle: string | null | undefined): string {
  if (!pageTitle) return APP_TITLE;
  return `${pageTitle} | ${APP_TITLE}`;
}
