import { pathToModuleKey, PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { prisma } from './prisma';

export const KANBAN_VIEW_ALL_BOARDS_KEY = pathToModuleKey(
  '/ponto/controle/visualizar-todos-kanbans',
);

/** Quadro demo antigo — não deve aparecer nem ser acessível. */
export const KANBAN_LEGACY_DEPARTMENT_KEY = 'LEGADO';

export function isKanbanHiddenPickerUser(user: {
  employee?: { position?: string | null } | null;
}): boolean {
  return (user.employee?.position ?? '').trim().toLowerCase() === 'administrador';
}

export async function userIsAdministrator(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { employee: { select: { position: true } } },
  });
  return (user?.employee?.position || '').toLowerCase() === 'administrador';
}

export async function userCanViewAllKanbanBoards(userId: string): Promise<boolean> {
  if (await userIsAdministrator(userId)) return true;
  const permission = await prisma.userPermission.findUnique({
    where: {
      userId_module_action: {
        userId,
        module: KANBAN_VIEW_ALL_BOARDS_KEY,
        action: PERMISSION_ACCESS_ACTION,
      },
    },
  });
  return !!permission?.allowed;
}
