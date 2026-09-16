import { prisma } from './prisma';
import { createError } from '../middleware/errorHandler';
import { isUnbRelatedLabel } from './unbBranding';

/** Funcionário cujo centro de custo cadastrado é UNB (string livre no Employee). */
export function isEmployeeUnbUser(employeeCostCenter: string | null | undefined): boolean {
  return isUnbRelatedLabel(employeeCostCenter);
}

/** CostCenter cadastrado (name/code/empresa/polo) ligado à UNB — OC pula compras e diretoria. */
export function isUnbCostCenterRecord(
  costCenter:
    | { name?: string | null; code?: string | null; company?: string | null; polo?: string | null }
    | null
    | undefined,
): boolean {
  if (!costCenter) return false;
  return (
    isUnbRelatedLabel(costCenter.name) ||
    isUnbRelatedLabel(costCenter.code) ||
    isUnbRelatedLabel(costCenter.company) ||
    isUnbRelatedLabel(costCenter.polo)
  );
}

/**
 * Employee.costCenter é texto livre: pode ser "UNB", o código, o nome ou o id do cadastro.
 * No deploy o id sem a palavra UNB fazia o gestor UNB ser tratado como usuário comum.
 */
export async function employeeRecordIsUnb(
  employeeCostCenter: string | null | undefined,
): Promise<boolean> {
  if (isEmployeeUnbUser(employeeCostCenter)) return true;
  const raw = employeeCostCenter?.trim();
  if (!raw) return false;

  const cc = await prisma.costCenter.findFirst({
    where: {
      OR: [{ id: raw }, { code: raw }, { name: raw }],
    },
    select: { name: true, code: true, company: true, polo: true },
  });
  return isUnbCostCenterRecord(cc);
}

/** IDs de CostCenter cujo name/code/empresa/polo são UNB, inclusive inativos e CCs de contratos UNB. */
export async function getUnbCostCenterIds(): Promise<string[]> {
  const [centers, contracts] = await Promise.all([
    prisma.costCenter.findMany({
      select: { id: true, name: true, code: true, company: true, polo: true },
    }),
    prisma.contract.findMany({
      select: {
        costCenterId: true,
        name: true,
        number: true,
        costCenter: { select: { name: true, code: true, company: true, polo: true } },
      },
    }),
  ]);

  const ids = new Set<string>();
  for (const row of centers) {
    if (isUnbCostCenterRecord(row)) ids.add(row.id);
  }
  for (const row of contracts) {
    const contractIsUnb =
      isUnbRelatedLabel(row.name) ||
      isUnbRelatedLabel(row.number) ||
      isUnbCostCenterRecord(row.costCenter);
    if (contractIsUnb && row.costCenterId) ids.add(row.costCenterId);
  }
  return Array.from(ids);
}

/**
 * null = sem restrição UNB (admin ou usuário não-UNB).
 * string[] = só esses centros de custo (usuário UNB).
 */
export async function getUserUnbCostCenterScope(
  userId: string,
  isAdmin: boolean,
): Promise<string[] | null> {
  if (isAdmin) return null;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { employee: { select: { costCenter: true } } },
  });
  if (!(await employeeRecordIsUnb(user?.employee?.costCenter))) return null;

  return getUnbCostCenterIds();
}

export async function assertCostCenterAllowedForUnbUser(
  userId: string,
  isAdmin: boolean,
  costCenterId: string | null | undefined,
): Promise<void> {
  const scope = await getUserUnbCostCenterScope(userId, isAdmin);
  if (scope === null) return;
  if (!costCenterId || scope.length === 0 || !scope.includes(costCenterId)) {
    throw createError('Sem permissão para usar este centro de custo (escopo UNB)', 403);
  }
}

/**
 * Combina escopo do gestor com restrição UNB do funcionário.
 * União: se o contrato UNB aponta para um CC e a RM/OC usa outro CC UNB,
 * a interseção esvaziava a fila no deploy.
 */
export function mergeGestorScopeWithUnbRestriction(
  gestorOrFullScope: string[] | null,
  unbScope: string[] | null,
): string[] | null {
  if (unbScope === null) return gestorOrFullScope;
  if (unbScope.length === 0) return gestorOrFullScope;
  if (gestorOrFullScope === null) return unbScope;
  return [...new Set([...gestorOrFullScope, ...unbScope])];
}

/** Intersecta filtro pedido com escopo UNB (quando aplicável). */
export function applyUnbCostCenterScopeToIdFilter(
  scope: string[] | null,
  requestedId?: string | null,
): { costCenterId?: string; costCenterIds?: string[]; denyAll?: boolean } {
  if (scope === null) {
    return requestedId ? { costCenterId: requestedId } : {};
  }
  if (scope.length === 0) {
    return { denyAll: true };
  }
  if (requestedId) {
    if (!scope.includes(requestedId)) return { denyAll: true };
    return { costCenterId: requestedId };
  }
  return { costCenterIds: scope };
}

/** Filtro Prisma para CC cujo nome/código/empresa/polo contém UNB. */
export const unbCostCenterLabelPrismaWhere = {
  OR: [
    { name: { contains: 'UNB', mode: 'insensitive' as const } },
    { code: { contains: 'UNB', mode: 'insensitive' as const } },
    { company: { contains: 'UNB', mode: 'insensitive' as const } },
    { polo: { contains: 'UNB', mode: 'insensitive' as const } },
  ],
};
