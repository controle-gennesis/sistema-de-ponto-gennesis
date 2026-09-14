import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { createError } from '../middleware/errorHandler';

const TEAM_MEMBER_ROLES = ['LEADER', 'MEMBER'] as const;
export type GestaoOsTeamMemberRole = (typeof TEAM_MEMBER_ROLES)[number];

/** Status considerados "em andamento" ao medir a carga de uma equipe. */
const TEAM_OPEN_STATUSES = [
  'OPEN',
  'UNDER_REVIEW',
  'APPROVED',
  'SAFETY_CHECK',
  'IN_PROGRESS',
  'WAITING_PARTS',
  'REWORK'
] as const;

const TEAM_INCLUDE = {
  company: { select: { id: true, name: true } },
  manager: { select: { id: true, name: true, email: true, cpf: true, profilePhotoUrl: true } },
  members: {
    orderBy: [{ role: 'asc' as const }, { createdAt: 'asc' as const }],
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          cpf: true,
          profilePhotoUrl: true,
          employee: { select: { position: true, department: true, phone: true } }
        }
      }
    }
  },
  buildings: {
    include: {
      building: { select: { id: true, name: true, code: true, address: true } }
    }
  }
} satisfies Prisma.GestaoOsTeamInclude;

function parseMemberRole(value: unknown): GestaoOsTeamMemberRole {
  const raw = String(value ?? 'MEMBER').trim().toUpperCase();
  if ((TEAM_MEMBER_ROLES as readonly string[]).includes(raw)) {
    return raw as GestaoOsTeamMemberRole;
  }
  return 'MEMBER';
}

function parseIdList(value: unknown, field: string): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw createError(`${field} deve ser uma lista`, 400);
  const ids: string[] = [];
  for (const item of value) {
    const id = String(item ?? '').trim();
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

type MemberInput = { userId: string; role: GestaoOsTeamMemberRole };

function parseMemberList(value: unknown): MemberInput[] {
  if (value == null) return [];
  if (!Array.isArray(value)) throw createError('Membros devem ser uma lista', 400);
  const members: MemberInput[] = [];
  for (const item of value) {
    // Aceita tanto ["userId"] quanto [{ userId, role }].
    const userId =
      typeof item === 'string'
        ? item.trim()
        : String((item as Record<string, unknown>)?.userId ?? '').trim();
    if (!userId || members.some((m) => m.userId === userId)) continue;
    const role =
      typeof item === 'string' ? 'MEMBER' : parseMemberRole((item as Record<string, unknown>)?.role);
    members.push({ userId, role });
  }
  return members;
}

async function assertUsersExist(userIds: string[]) {
  if (!userIds.length) return;
  const found = await prisma.user.count({ where: { id: { in: userIds }, isActive: true } });
  if (found !== userIds.length) {
    throw createError('Um ou mais funcionários informados não existem ou estão inativos', 400);
  }
}

async function assertBuildingsExist(buildingIds: string[]) {
  if (!buildingIds.length) return;
  const found = await prisma.gestaoOsBuilding.count({ where: { id: { in: buildingIds } } });
  if (found !== buildingIds.length) {
    throw createError('Uma ou mais localidades informadas não existem', 400);
  }
}

export class GestaoOsTeamsService {
  async list(params: { search?: string; companyId?: string; buildingId?: string; onlyActive?: boolean }) {
    const where: Prisma.GestaoOsTeamWhereInput = {};
    if (params.companyId) where.companyId = params.companyId;
    if (params.onlyActive) where.isActive = true;
    if (params.buildingId) {
      where.buildings = { some: { buildingId: params.buildingId } };
    }
    const search = params.search?.trim();
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { code: { contains: search, mode: 'insensitive' } },
        { shift: { contains: search, mode: 'insensitive' } },
        { manager: { name: { contains: search, mode: 'insensitive' } } },
        { members: { some: { user: { name: { contains: search, mode: 'insensitive' } } } } }
      ];
    }

    const teams = await prisma.gestaoOsTeam.findMany({
      where,
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: TEAM_INCLUDE
    });

    return this.attachWorkload(teams);
  }

  /** Acrescenta contadores de OS por equipe para os dashboards. */
  private async attachWorkload<T extends { id: string }>(teams: T[]) {
    if (!teams.length) return teams.map((team) => ({ ...team, openCount: 0, overdueCount: 0 }));
    const ids = teams.map((t) => t.id);
    const rows = await prisma.gestaoOsWorkOrder.findMany({
      where: { teamId: { in: ids }, status: { in: [...TEAM_OPEN_STATUSES] } },
      select: { teamId: true, dueAt: true }
    });
    const now = Date.now();
    const load = new Map<string, { openCount: number; overdueCount: number }>();
    for (const row of rows) {
      if (!row.teamId) continue;
      const bucket = load.get(row.teamId) ?? { openCount: 0, overdueCount: 0 };
      bucket.openCount += 1;
      if (row.dueAt && row.dueAt.getTime() < now) bucket.overdueCount += 1;
      load.set(row.teamId, bucket);
    }
    return teams.map((team) => ({
      ...team,
      openCount: load.get(team.id)?.openCount ?? 0,
      overdueCount: load.get(team.id)?.overdueCount ?? 0
    }));
  }

  async getById(id: string) {
    const team = await prisma.gestaoOsTeam.findUnique({ where: { id }, include: TEAM_INCLUDE });
    if (!team) throw createError('Equipe não encontrada', 404);
    const [withLoad] = await this.attachWorkload([team]);
    return withLoad;
  }

  async create(input: {
    name?: string;
    code?: string | null;
    description?: string | null;
    companyId?: string | null;
    managerUserId?: string | null;
    shift?: string | null;
    memberUserIds?: unknown;
    members?: unknown;
    buildingIds?: unknown;
  }) {
    const name = String(input.name ?? '').trim();
    if (!name) throw createError('Informe o nome da equipe', 400);

    const members = parseMemberList(input.members ?? input.memberUserIds);
    const buildingIds = parseIdList(input.buildingIds, 'Localidades');
    const managerUserId = input.managerUserId?.trim() || null;

    await assertUsersExist([
      ...members.map((m) => m.userId),
      ...(managerUserId ? [managerUserId] : [])
    ]);
    await assertBuildingsExist(buildingIds);

    const created = await prisma.gestaoOsTeam.create({
      data: {
        name,
        code: input.code?.trim() || null,
        description: input.description?.trim() || null,
        companyId: input.companyId?.trim() || null,
        managerUserId,
        shift: input.shift?.trim() || null,
        members: { create: members.map((m) => ({ userId: m.userId, role: m.role })) },
        buildings: { create: buildingIds.map((buildingId) => ({ buildingId })) }
      },
      include: TEAM_INCLUDE
    });
    const [withLoad] = await this.attachWorkload([created]);
    return withLoad;
  }

  async update(
    id: string,
    input: {
      name?: string;
      code?: string | null;
      description?: string | null;
      companyId?: string | null;
      managerUserId?: string | null;
      shift?: string | null;
      isActive?: boolean;
      memberUserIds?: unknown;
      members?: unknown;
      buildingIds?: unknown;
    }
  ) {
    const existing = await prisma.gestaoOsTeam.findUnique({ where: { id } });
    if (!existing) throw createError('Equipe não encontrada', 404);

    const membersProvided = input.members !== undefined || input.memberUserIds !== undefined;
    const buildingsProvided = input.buildingIds !== undefined;
    const members = membersProvided ? parseMemberList(input.members ?? input.memberUserIds) : [];
    const buildingIds = buildingsProvided ? parseIdList(input.buildingIds, 'Localidades') : [];
    const managerUserId =
      input.managerUserId !== undefined ? input.managerUserId?.trim() || null : undefined;

    await assertUsersExist([
      ...members.map((m) => m.userId),
      ...(managerUserId ? [managerUserId] : [])
    ]);
    await assertBuildingsExist(buildingIds);

    await prisma.$transaction(async (tx) => {
      await tx.gestaoOsTeam.update({
        where: { id },
        data: {
          ...(input.name != null ? { name: String(input.name).trim() || existing.name } : {}),
          ...(input.code !== undefined ? { code: input.code?.trim() || null } : {}),
          ...(input.description !== undefined
            ? { description: input.description?.trim() || null }
            : {}),
          ...(input.companyId !== undefined ? { companyId: input.companyId?.trim() || null } : {}),
          ...(managerUserId !== undefined ? { managerUserId } : {}),
          ...(input.shift !== undefined ? { shift: input.shift?.trim() || null } : {}),
          ...(input.isActive !== undefined ? { isActive: Boolean(input.isActive) } : {})
        }
      });

      if (membersProvided) {
        await tx.gestaoOsTeamMember.deleteMany({ where: { teamId: id } });
        if (members.length) {
          await tx.gestaoOsTeamMember.createMany({
            data: members.map((m) => ({ teamId: id, userId: m.userId, role: m.role }))
          });
        }
      }

      if (buildingsProvided) {
        await tx.gestaoOsTeamBuilding.deleteMany({ where: { teamId: id } });
        if (buildingIds.length) {
          await tx.gestaoOsTeamBuilding.createMany({
            data: buildingIds.map((buildingId) => ({ teamId: id, buildingId }))
          });
        }
      }
    });

    return this.getById(id);
  }

  async remove(id: string) {
    const existing = await prisma.gestaoOsTeam.findUnique({ where: { id } });
    if (!existing) throw createError('Equipe não encontrada', 404);
    const linkedWorkOrders = await prisma.gestaoOsWorkOrder.count({ where: { teamId: id } });
    if (linkedWorkOrders > 0) {
      // Preserva o histórico: equipe com OS vinculada é apenas desativada.
      await prisma.gestaoOsTeam.update({ where: { id }, data: { isActive: false } });
      return { deactivated: true, linkedWorkOrders };
    }
    await prisma.gestaoOsTeam.delete({ where: { id } });
    return { deactivated: false, linkedWorkOrders: 0 };
  }

  /** Equipes vinculadas a uma localidade, usadas para sugerir a equipe no agendamento. */
  async listByBuilding(buildingId: string) {
    const id = String(buildingId ?? '').trim();
    if (!id) return [];
    return prisma.gestaoOsTeam.findMany({
      where: { isActive: true, buildings: { some: { buildingId: id } } },
      orderBy: { name: 'asc' },
      include: TEAM_INCLUDE
    });
  }
}

export const gestaoOsTeamsService = new GestaoOsTeamsService();
