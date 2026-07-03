import {
  pathToModuleKey,
  PERMISSION_ACCESS_ACTION,
  PERMISSION_MODULE_CRUD_ACTIONS,
} from '@sistema-ponto/permission-modules';
import { prisma } from './prisma';
import { createError } from '../middleware/errorHandler';

export const EMPLOYEES_MODULE_KEY = pathToModuleKey('/ponto/funcionarios');

export async function userIsDepartmentPessoal(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { employee: { select: { department: true } } },
  });
  const dept = user?.employee?.department?.toLowerCase() ?? '';
  return dept.includes('departamento pessoal') || dept.includes('pessoal');
}

/** Alinhado ao front: admin, DP ou qualquer permissão no módulo Funcionários. */
export async function userHasEmployeesModuleAccess(userId: string, isAdmin: boolean): Promise<boolean> {
  if (isAdmin) return true;
  if (await userIsDepartmentPessoal(userId)) return true;

  const row = await prisma.userPermission.findFirst({
    where: {
      userId,
      module: EMPLOYEES_MODULE_KEY,
      allowed: true,
      action: {
        in: [PERMISSION_ACCESS_ACTION, ...PERMISSION_MODULE_CRUD_ACTIONS],
      },
    },
    select: { id: true },
  });

  return !!row;
}

export async function assertUserHasEmployeesModuleAccess(userId: string, isAdmin: boolean): Promise<void> {
  const ok = await userHasEmployeesModuleAccess(userId, isAdmin);
  if (!ok) {
    throw createError('Você não tem permissão para acessar o módulo de Funcionários', 403);
  }
}
