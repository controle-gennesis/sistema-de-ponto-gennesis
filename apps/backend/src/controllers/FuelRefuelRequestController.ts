import { Response, NextFunction } from 'express';
import { FuelRefuelRequestStatus, FuelTankLevelAfter, FuelVehicleType } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { fuelRefuelRequestService } from '../services/FuelRefuelRequestService';
import {
  assertManagerCanActOnFuelContract,
  getManagerFuelApprovalContractScope,
} from '../lib/fuelApprovalAccess';
import { assertUserHasFuelSuppliesAccess } from '../lib/fuelSuppliesAccess';
import {
  listActiveFuelGasStationsByCity,
  listActiveFuelGasStationsForRequest,
  listFuelSatelliteCities,
} from '../lib/fuelAdministrativeRegions';
import { FUEL_ABASTECIMENTO_STATE_CODES, isBrazilStateCode } from '../constants/fuelSatelliteCities';
import { getFuelSuppliesSlaHours } from '../lib/fuelSuppliesSla';
import {
  findEmployeeByCpf,
  isValidCpf,
  resolveFuelRequestContextFromEmployee,
  type EmployeeCpfLookupResult,
} from '../lib/employeeCpfLookup';
import { prisma } from '../lib/prisma';
import { getFuelQuotaBalance, listFuelQuotaBalances } from '../lib/fuelWeeklyQuota';
import { FUEL_LITERS_MAX } from '../lib/parseFlexibleDecimal';
import { PhotoService } from '../services/PhotoService';

const photoService = new PhotoService();

function parseImageContentType(dataUrl: string): string {
  const match = /^data:([^;]+);base64,/i.exec(dataUrl);
  return match?.[1]?.trim() || 'image/jpeg';
}

const listQuerySchema = z.object({
  search: z.string().optional(),
  status: z.string().optional(),
  queue: z.enum(['supplies', 'all']).optional(),
  mine: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
});

function parseStatusFilter(value: unknown): FuelRefuelRequestStatus[] | undefined {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw || raw === 'ALL') return undefined;

  const parts = raw.split(',').map((part) => part.trim()).filter(Boolean);
  const statuses: FuelRefuelRequestStatus[] = [];

  for (const part of parts) {
    if (Object.values(FuelRefuelRequestStatus).includes(part as FuelRefuelRequestStatus)) {
      statuses.push(part as FuelRefuelRequestStatus);
    } else {
      throw createError('Status de filtro inválido', 400);
    }
  }

  return statuses.length ? statuses : undefined;
}

const approveSchema = z.object({
  comment: z.string().optional(),
});

const suppliesApproveSchema = z.object({
  comment: z.string().optional(),
  gasStationId: z.string().min(1, 'Selecione o posto para abastecimento'),
  refuelDeadlineAmount: z.coerce.number().int().min(1).max(365),
  refuelDeadlineUnit: z.enum(['HOURS', 'DAYS']),
  releasedAmountReais: z.number().positive('Informe o valor que será liberado'),
});

const rejectSchema = z.object({
  reason: z.string().min(1, 'Informe o motivo da rejeição'),
  comment: z.string().optional(),
});

const adminUpdateSchema = z.object({
  contractId: z.string().min(1, 'Selecione o contrato'),
});

const createSchema = z.object({
  refuelDate: z.string().min(1, 'Informe a data do abastecimento'),
  route: z.string().min(2, 'Informe a rota'),
  satelliteCityCode: z.string().optional(),
  contractId: z.string().min(1, 'Selecione o contrato'),
  vehiclePlate: z.string().min(1, 'Informe a placa do veículo'),
  vehicleDescription: z.string().optional(),
  vehicleType: z.enum(['PRIVATE', 'COMPANY']),
  dashboardPhotoBase64: z.string().min(1, 'Envie a foto do painel'),
  observations: z.string().optional(),
  driverCpf: z.string().optional(),
  driverUserId: z.string().optional(),
});

const receiptPhotoSchema = z.object({
  receiptPhotoBase64: z.string().min(1, 'Envie a foto do cupom fiscal'),
});

const reportSchema = z.object({
  odometerKm: z.coerce.number().int().positive('Informe o hodômetro em km'),
  tankLevelAfter: z.enum(['RESERVE', 'QUARTER', 'HALF', 'THREE_QUARTERS', 'FULL'], {
    required_error: 'Informe o nível do tanque',
  }),
  litersRefueled: z.coerce
    .number()
    .positive('Informe os litros abastecidos')
    .max(FUEL_LITERS_MAX, `Litros inválidos (máximo ${FUEL_LITERS_MAX} L por abastecimento)`),
  pricePerLiter: z.coerce.number().positive('Informe o valor por litro'),
  receiptPhotoBase64: z.string().min(1, 'Envie a foto do cupom fiscal'),
  observations: z.string().optional(),
});

async function resolveDriverContext(
  requesterId: string,
  opts?: { driverCpf?: string | null; driverUserId?: string | null },
): Promise<{ driverName: string; costCenterLabel: string; contractId?: string | null }> {
  const driverUserId = opts?.driverUserId?.trim();
  if (driverUserId) {
    const user = await prisma.user.findUnique({
      where: { id: driverUserId },
      select: {
        id: true,
        name: true,
        cpf: true,
        employee: { select: { costCenter: true, id: true } },
      },
    });
    if (!user?.employee) {
      throw createError('Condutor não encontrado ou sem vínculo de colaborador.', 404);
    }
    const asLookup: EmployeeCpfLookupResult = {
      userId: user.id,
      employeeId: user.employee.id,
      name: user.name,
      cpfDigits: (user.cpf || '').replace(/\D/g, ''),
      cpfMasked: user.cpf || '',
      costCenter: user.employee.costCenter,
      department: null,
      position: null,
    };
    const ctx = await resolveFuelRequestContextFromEmployee(asLookup);
    if (!ctx.ok) throw createError(ctx.message, 400);
    return {
      driverName: user.name,
      costCenterLabel: ctx.costCenterLabel,
      contractId: ctx.contractId,
    };
  }

  const cpfRaw = opts?.driverCpf?.trim();
  if (cpfRaw) {
    if (!isValidCpf(cpfRaw)) {
      throw createError('CPF do condutor inválido', 400);
    }
    const employee = await findEmployeeByCpf(cpfRaw);
    if (!employee) {
      throw createError('Condutor não encontrado. Verifique o CPF cadastrado.', 404);
    }
    const ctx = await resolveFuelRequestContextFromEmployee(employee);
    if (!ctx.ok) throw createError(ctx.message, 400);
    return {
      driverName: employee.name,
      costCenterLabel: ctx.costCenterLabel,
      contractId: ctx.contractId,
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: requesterId },
    select: {
      name: true,
      cpf: true,
      employee: { select: { costCenter: true, id: true } },
    },
  });
  if (!user) throw createError('Usuário não encontrado', 404);
  if (!user.employee) {
    throw createError(
      'Seu usuário não está vinculado a um colaborador. Fale com o RH.',
      400,
    );
  }

  const asLookup: EmployeeCpfLookupResult = {
    userId: requesterId,
    employeeId: user.employee.id,
    name: user.name,
    cpfDigits: (user.cpf || '').replace(/\D/g, ''),
    cpfMasked: user.cpf || '',
    costCenter: user.employee.costCenter,
    department: null,
    position: null,
  };
  const ctx = await resolveFuelRequestContextFromEmployee(asLookup);
  if (!ctx.ok) throw createError(ctx.message, 400);
  return {
    driverName: user.name,
    costCenterLabel: ctx.costCenterLabel,
    contractId: ctx.contractId,
  };
}

function mapManagerScopeToFuelWhere(
  scope: Record<string, unknown>,
): { contractId?: { in: string[] } } {
  const contractId = scope.contractId as { in: string[] } | undefined;
  if (contractId?.in?.length) return { contractId };
  return {};
}

export class FuelRefuelRequestController {
  async listSatelliteCitiesForRequester(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const stateCode = String(req.query.stateCode ?? '').trim().toUpperCase();
      if (stateCode && !isBrazilStateCode(stateCode)) {
        throw createError('Estado inválido.', 400);
      }
      const rows = await listFuelSatelliteCities(stateCode || undefined);
      res.json({
        success: true,
        data: {
          states: [...FUEL_ABASTECIMENTO_STATE_CODES],
          cities: rows,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async lookupDriver(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const cpf = String(req.query.cpf ?? '').trim();
      if (!cpf) throw createError('Informe o CPF', 400);
      if (!isValidCpf(cpf)) throw createError('CPF inválido', 400);

      const employee = await findEmployeeByCpf(cpf);
      if (!employee) throw createError('Colaborador não encontrado', 404);

      const ctx = await resolveFuelRequestContextFromEmployee(employee);
      if (!ctx.ok) {
        return res.json({
          success: true,
          data: {
            name: employee.name,
            cpf: employee.cpfMasked,
            costCenter: null,
            contractId: null,
            ok: false,
            message: ctx.message,
          },
        });
      }

      return res.json({
        success: true,
        data: {
          name: employee.name,
          cpf: employee.cpfMasked,
          costCenter: ctx.costCenterLabel,
          contractId: ctx.contractId || null,
          ok: true,
        },
      });
    } catch (error) {
      return next(error);
    }
  }

  /**
   * Lista todos os contratos cadastrados para o formulário de solicitação.
   * Não filtra por permissão do módulo Contratos — qualquer autenticado que
   * possa abrir o fluxo de abastecimento precisa ver a lista completa.
   */
  async listContractsForRequester(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);

      const search = String(req.query.search ?? '').trim();
      const where = search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { number: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : undefined;

      const rows = await prisma.contract.findMany({
        where,
        orderBy: [{ name: 'asc' }, { number: 'asc' }],
        select: { id: true, name: true, number: true },
      });

      res.json({
        success: true,
        data: rows.map((row) => ({
          id: row.id,
          name: row.name.trim() || row.number,
          number: row.number,
        })),
      });
    } catch (error) {
      next(error);
    }
  }

  async listDriverOptions(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);

      const users = await prisma.user.findMany({
        where: {
          isActive: true,
          role: 'EMPLOYEE',
          employee: { isNot: null },
        },
        select: {
          id: true,
          name: true,
          cpf: true,
          profilePhotoUrl: true,
          employee: {
            select: {
              id: true,
              costCenter: true,
              position: true,
            },
          },
        },
        orderBy: { name: 'asc' },
        take: 2000,
      });

      const data = users
        .filter((u) => {
          if (!u.employee?.id) return false;
          if (u.employee.position === 'Administrador') return false;
          const name = String(u.name || '').trim();
          if (name.localeCompare('Administrador', 'pt-BR', { sensitivity: 'accent' }) === 0) {
            return false;
          }
          return true;
        })
        .map((u) => {
          const cpfDigits = (u.cpf || '').replace(/\D/g, '');
          const cpfMasked =
            cpfDigits.length === 11
              ? `${cpfDigits.slice(0, 3)}.${cpfDigits.slice(3, 6)}.${cpfDigits.slice(6, 9)}-${cpfDigits.slice(9)}`
              : u.cpf || '';
          return {
            id: u.id,
            name: String(u.name || '').trim(),
            cpf: cpfMasked,
            cpfDigits,
            costCenter: u.employee?.costCenter?.trim() || null,
            profilePhotoUrl: u.profilePhotoUrl || null,
          };
        })
        .filter((row) => row.id && row.name)
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async listOpenForDriver(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user) throw createError('Usuário não autenticado', 401);
      const driverUserId = String(req.query.driverUserId ?? '').trim();
      if (!driverUserId) throw createError('Condutor é obrigatório', 400);

      const user = await prisma.user.findUnique({
        where: { id: driverUserId },
        select: { name: true },
      });
      if (!user) throw createError('Condutor não encontrado', 404);

      const requests = await fuelRefuelRequestService.findOpenRequestsForDriver({
        driverUserId,
        driverName: user.name,
      });

      res.json({
        success: true,
        data: {
          driverName: user.name,
          requests: requests.map((row) => ({
            id: row.id,
            displayNumber: row.displayNumber,
            status: row.status,
          })),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async listMine(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) throw createError('Usuário não autenticado', 401);

      const parsed = listQuerySchema.parse(req.query);
      const rows = await fuelRefuelRequestService.listForSupplies({
        search: parsed.search,
        statuses: parseStatusFilter(parsed.status),
        requesterId: user.id,
      });

      res.json({ success: true, data: rows });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) throw createError('Usuário não autenticado', 401);

      const body = createSchema.parse(req.body);
      const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(body.refuelDate.trim());
      if (!dateMatch) {
        throw createError('Data inválida. Use o formato AAAA-MM-DD.', 400);
      }
      const refuelDate = new Date(
        `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}T12:00:00`,
      );
      if (Number.isNaN(refuelDate.getTime())) {
        throw createError('Data inválida', 400);
      }

      const { driverName, costCenterLabel, contractId: driverContractId } =
        await resolveDriverContext(user.id, {
          driverCpf: body.driverCpf,
          driverUserId: body.driverUserId,
        });

      if (!body.dashboardPhotoBase64.includes('base64,')) {
        throw createError('Foto do painel inválida', 400);
      }

      const upload = await photoService.uploadPhotoFromBase64(
        body.dashboardPhotoBase64,
        user.id,
        parseImageContentType(body.dashboardPhotoBase64),
      );

      // Quando o contrato é escolhido explicitamente no formulário, o rótulo salvo deve
      // refletir esse contrato — não o centro de custo do condutor (podem ser diferentes).
      let costCenterForRow = costCenterLabel;
      if (body.contractId) {
        const chosenContract = await prisma.contract.findUnique({
          where: { id: body.contractId },
          select: { name: true, number: true },
        });
        if (chosenContract) {
          costCenterForRow = chosenContract.name?.trim() || chosenContract.number;
        }
      }

      const row = await fuelRefuelRequestService.create({
        requesterId: user.id,
        refuelDate,
        route: body.route,
        satelliteCityCode: body.satelliteCityCode,
        contractId: body.contractId || driverContractId || undefined,
        costCenter: costCenterForRow,
        driverName,
        driverUserId: body.driverUserId || undefined,
        vehiclePlate: body.vehiclePlate,
        vehicleDescription: body.vehicleDescription,
        vehicleType: body.vehicleType as FuelVehicleType,
        dashboardPhotoUrl: upload.url,
        dashboardPhotoKey: upload.key,
        dashboardPhotoName: 'painel.jpg',
        observations: body.observations,
      });

      const presented = await fuelRefuelRequestService.getByIdForApi(row.id);
      const waitingMsg =
        row.status === FuelRefuelRequestStatus.PENDING_MANAGER
          ? 'Solicitação registrada. Aguardando aprovação do gestor.'
          : 'Solicitação registrada. Aguardando análise do Suprimentos.';

      res.status(201).json({ success: true, data: presented, message: waitingMsg });
    } catch (error) {
      next(error);
    }
  }

  async listAdministrativeRegions(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) throw createError('Usuário não autenticado', 401);
      await assertUserHasFuelSuppliesAccess(user.id, user.isAdmin);

      const stateCode = String(req.query.stateCode ?? '').trim().toUpperCase();
      const rows = await listFuelSatelliteCities(stateCode || undefined);
      res.json({ success: true, data: rows });
    } catch (error) {
      next(error);
    }
  }

  async listGasStationsByRegion(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) throw createError('Usuário não autenticado', 401);
      await assertUserHasFuelSuppliesAccess(user.id, user.isAdmin);

      const contractId = String(req.query.contractId || '').trim();
      const costCenter = String(req.query.costCenter || '').trim();
      if (contractId || costCenter) {
        const rows = await listActiveFuelGasStationsForRequest({
          contractId: contractId || null,
          costCenter: costCenter || null,
        });
        return res.json({ success: true, data: rows });
      }

      const cityCode = String(req.query.cityCode || req.params.regionId || '').trim();
      if (!cityCode) throw createError('Informe o contrato ou a cidade', 400);

      const rows = await listActiveFuelGasStationsByCity(cityCode);
      return res.json({ success: true, data: rows });
    } catch (error) {
      return next(error);
    }
  }

  async getSuppliesSla(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) throw createError('Usuário não autenticado', 401);
      await assertUserHasFuelSuppliesAccess(user.id, user.isAdmin);

      const hours = await getFuelSuppliesSlaHours();
      res.json({ success: true, data: { fuelSuppliesSlaHours: hours } });
    } catch (error) {
      next(error);
    }
  }

  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) throw createError('Usuário não autenticado', 401);
      await assertUserHasFuelSuppliesAccess(user.id, user.isAdmin);

      const parsed = listQuerySchema.parse(req.query);
      const rows = await fuelRefuelRequestService.listForSupplies({
        search: parsed.search,
        statuses: parseStatusFilter(parsed.status),
        queue: parsed.queue,
        requesterId: parsed.mine ? user.id : undefined,
      });

      res.json({ success: true, data: rows });
    } catch (error) {
      next(error);
    }
  }

  async listManagerApprovals(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) throw createError('Usuário não autenticado', 401);

      const scope = await getManagerFuelApprovalContractScope(user.id, user.isAdmin);
      if (scope === null) {
        return res.json({ success: true, data: [] });
      }

      const rawPhase = String(req.query.phase ?? 'PENDING').toUpperCase();
      type Phase = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL';
      const phase: Phase = (['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).includes(
        rawPhase as Phase,
      )
        ? (rawPhase as Phase)
        : 'PENDING';

      const rows = await fuelRefuelRequestService.listForManagerApprovals({
        phase,
        contractScope: mapManagerScopeToFuelWhere(scope),
      });

      return res.json({ success: true, data: rows });
    } catch (error) {
      return next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Usuário não autenticado', 401);

      const row = await fuelRefuelRequestService.getByIdForApi(req.params.id);
      res.json({ success: true, data: row });
    } catch (error) {
      next(error);
    }
  }

  private async assertCanDecide(req: AuthRequest, contractId: string | null) {
    if (!req.user) throw createError('Usuário não autenticado', 401);
    await assertManagerCanActOnFuelContract(req.user.id, req.user.isAdmin, contractId);
  }

  async approve(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Usuário não autenticado', 401);

      const existing = await fuelRefuelRequestService.getById(req.params.id);
      await this.assertCanDecide(req, existing.contractId);

      const body = approveSchema.parse(req.body);
      const row = await fuelRefuelRequestService.managerApprove(
        req.params.id,
        userId,
        body.comment,
      );
      res.json({ success: true, data: row, message: 'Solicitação aprovada' });
    } catch (error) {
      next(error);
    }
  }

  async reject(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user?.id;
      if (!userId) throw createError('Usuário não autenticado', 401);

      const existing = await fuelRefuelRequestService.getById(req.params.id);
      await this.assertCanDecide(req, existing.contractId);

      const body = rejectSchema.parse(req.body);
      const reason = body.reason?.trim() || body.comment?.trim() || '';
      const row = await fuelRefuelRequestService.managerReject(req.params.id, userId, reason);
      res.json({ success: true, data: row, message: 'Solicitação rejeitada' });
    } catch (error) {
      next(error);
    }
  }

  async cancel(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user?.id) throw createError('Usuário não autenticado', 401);

      const existing = await fuelRefuelRequestService.getById(req.params.id);
      const asSupplies = existing.status === FuelRefuelRequestStatus.AWAITING_REFUEL;
      if (asSupplies) {
        await assertUserHasFuelSuppliesAccess(user.id, user.isAdmin);
      }

      const row = await fuelRefuelRequestService.cancel(req.params.id, user.id, { asSupplies });
      res.json({ success: true, data: row, message: 'Solicitação cancelada' });
    } catch (error) {
      next(error);
    }
  }

  async submitReport(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) throw createError('Usuário não autenticado', 401);

      const existing = await fuelRefuelRequestService.getById(req.params.id);
      const isOwner = existing.requesterId === user.id;
      if (!isOwner) {
        await assertUserHasFuelSuppliesAccess(user.id, user.isAdmin);
      }

      const body = reportSchema.parse(req.body);
      if (!body.receiptPhotoBase64.includes('base64,')) {
        throw createError('Foto do cupom fiscal inválida', 400);
      }

      const upload = await photoService.uploadPhotoFromBase64(
        body.receiptPhotoBase64,
        user.id,
        parseImageContentType(body.receiptPhotoBase64),
      );

      const row = await fuelRefuelRequestService.submitRefuelReport({
        requesterId: user.id,
        allowNonRequester: !isOwner,
        requestId: req.params.id,
        odometerKm: body.odometerKm,
        tankLevelAfter: body.tankLevelAfter as FuelTankLevelAfter,
        litersRefueled: body.litersRefueled,
        pricePerLiter: body.pricePerLiter,
        receiptPhotoUrl: upload.url,
        receiptPhotoKey: upload.key,
        receiptPhotoName: 'cupom-fiscal.jpg',
        observations: body.observations,
      });

      const presented = await fuelRefuelRequestService.getByIdForApi(row.id);
      res.json({
        success: true,
        data: presented,
        message: 'Abastecimento informado com sucesso',
      });
    } catch (error) {
      next(error);
    }
  }

  async updateReceiptPhoto(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user?.id) throw createError('Usuário não autenticado', 401);
      await assertUserHasFuelSuppliesAccess(user.id, user.isAdmin);

      const body = receiptPhotoSchema.parse(req.body);
      if (!body.receiptPhotoBase64.includes('base64,')) {
        throw createError('Foto do cupom fiscal inválida', 400);
      }

      const upload = await photoService.uploadPhotoFromBase64(
        body.receiptPhotoBase64,
        user.id,
        parseImageContentType(body.receiptPhotoBase64),
      );

      const row = await fuelRefuelRequestService.updateReceiptPhoto({
        requestId: req.params.id,
        receiptPhotoUrl: upload.url,
        receiptPhotoKey: upload.key,
        receiptPhotoName: 'cupom-fiscal.jpg',
      });
      const presented = await fuelRefuelRequestService.getByIdForApi(row.id);
      res.json({ success: true, data: presented, message: 'Foto do cupom fiscal atualizada' });
    } catch (error) {
      next(error);
    }
  }

  async suppliesApprove(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) throw createError('Usuário não autenticado', 401);
      await assertUserHasFuelSuppliesAccess(user.id, user.isAdmin);

      const body = suppliesApproveSchema.parse(req.body);
      const row = await fuelRefuelRequestService.suppliesApprove(req.params.id, user.id, {
        gasStationId: body.gasStationId,
        refuelDeadlineAmount: body.refuelDeadlineAmount,
        refuelDeadlineUnit: body.refuelDeadlineUnit,
        releasedAmountReais: body.releasedAmountReais,
        comment: body.comment,
      });
      res.json({ success: true, data: row, message: 'Solicitação atendida — colaborador liberado para abastecer' });
    } catch (error) {
      next(error);
    }
  }

  async suppliesReject(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) throw createError('Usuário não autenticado', 401);
      await assertUserHasFuelSuppliesAccess(user.id, user.isAdmin);

      const body = rejectSchema.parse(req.body);
      const reason = body.reason?.trim() || body.comment?.trim() || '';
      const row = await fuelRefuelRequestService.suppliesReject(req.params.id, user.id, reason);
      res.json({ success: true, data: row, message: 'Solicitação rejeitada' });
    } catch (error) {
      next(error);
    }
  }

  async adminUpdate(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) throw createError('Usuário não autenticado', 401);
      if (!user.isAdmin) {
        throw createError('Apenas administradores podem editar a solicitação', 403);
      }
      await assertUserHasFuelSuppliesAccess(user.id, user.isAdmin);

      const body = adminUpdateSchema.parse(req.body);
      const row = await fuelRefuelRequestService.adminUpdateContract(
        req.params.id,
        body.contractId,
      );
      res.json({ success: true, data: row, message: 'Solicitação atualizada' });
    } catch (error) {
      next(error);
    }
  }

  async pendingCount(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) throw createError('Usuário não autenticado', 401);

      const scope = await getManagerFuelApprovalContractScope(user.id, user.isAdmin);
      if (scope === null) {
        return res.json({ success: true, data: { count: 0 } });
      }

      const count = await fuelRefuelRequestService.countPendingManager(
        mapManagerScopeToFuelWhere(scope),
      );
      return res.json({ success: true, data: { count } });
    } catch (error) {
      return next(error);
    }
  }

  async suppliesPendingCount(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) throw createError('Usuário não autenticado', 401);
      await assertUserHasFuelSuppliesAccess(user.id, user.isAdmin);

      const count = await fuelRefuelRequestService.countPendingSupplies();
      return res.json({ success: true, data: { count } });
    } catch (error) {
      return next(error);
    }
  }

  async getQuotaBalance(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) throw createError('Usuário não autenticado', 401);

      const contractId = String(req.query.contractId || '').trim();
      const data = await getFuelQuotaBalance(contractId);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async listQuotaBalances(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) throw createError('Usuário não autenticado', 401);
      await assertUserHasFuelSuppliesAccess(user.id, user.isAdmin);

      const data = await listFuelQuotaBalances();
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  /** Cota semanal (em tanques) por contrato + preço do tanque, usados na fila de Abastecimento. */
  async getQuotaConfig(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) throw createError('Usuário não autenticado', 401);
      if (!user.isAdmin) throw createError('Acesso permitido apenas para Administrador', 403);

      const [settings, contracts, parentRows] = await Promise.all([
        prisma.companySettings.findFirst({ select: { fuelTankPriceReais: true } }),
        prisma.contract.findMany({
          orderBy: [{ name: 'asc' }, { number: 'asc' }],
          select: {
            id: true,
            name: true,
            number: true,
            weeklyFuelTankQuota: true,
          },
        }),
        prisma.$queryRaw<Array<{ id: string; parentId: string | null }>>`
          SELECT id, "fuelQuotaParentContractId" AS "parentId"
          FROM "contracts"
        `,
      ]);

      const parentById = new Map(
        parentRows.map((c) => [c.id, c.parentId || null] as const)
      );
      const resolveRoot = (id: string) => {
        const seen = new Set<string>();
        let current = id;
        while (parentById.get(current)) {
          if (seen.has(current)) break;
          seen.add(current);
          current = parentById.get(current) as string;
        }
        return current;
      };

      res.json({
        success: true,
        data: {
          tankPriceReais: Number(settings?.fuelTankPriceReais ?? 350),
          contracts: contracts.map((c) => {
            const rootId = resolveRoot(c.id);
            return {
              id: c.id,
              name: c.name.trim() || c.number,
              number: c.number,
              weeklyTankQuota: c.weeklyFuelTankQuota == null ? null : Number(c.weeklyFuelTankQuota),
              fuelQuotaParentContractId: rootId === c.id ? null : rootId,
            };
          }),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async updateTankPrice(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) throw createError('Usuário não autenticado', 401);
      if (!user.isAdmin) throw createError('Acesso permitido apenas para Administrador', 403);

      const body = z.object({ tankPriceReais: z.number().positive() }).parse(req.body);

      const settings = await prisma.companySettings.findFirst({ select: { id: true } });
      if (!settings) throw createError('Configurações da empresa não encontradas', 404);

      await prisma.companySettings.update({
        where: { id: settings.id },
        data: { fuelTankPriceReais: body.tankPriceReais },
      });

      res.json({ success: true, message: 'Valor do tanque atualizado' });
    } catch (error) {
      next(error);
    }
  }

  async updateContractQuota(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      if (!user) throw createError('Usuário não autenticado', 401);
      if (!user.isAdmin) throw createError('Acesso permitido apenas para Administrador', 403);

      const contractId = req.params.contractId;
      const parsed = z
        .object({
          weeklyFuelTankQuota: z.number().positive().nullable().optional(),
          fuelQuotaParentContractId: z.string().nullable().optional(),
          dissolveGroup: z.boolean().optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        throw createError(
          parsed.error.issues[0]?.message || 'Dados inválidos para atualizar a cota',
          400
        );
      }
      const body = parsed.data;

      const rows = await prisma.$queryRaw<
        Array<{ id: string; parentId: string | null }>
      >`
        SELECT id, "fuelQuotaParentContractId" AS "parentId"
        FROM "contracts"
      `;
      const parentById = new Map(rows.map((c) => [c.id, c.parentId || null] as const));
      if (!parentById.has(contractId)) throw createError('Contrato não encontrado', 404);

      const resolveRoot = (id: string) => {
        const seen = new Set<string>();
        let currentId = id;
        while (parentById.get(currentId)) {
          if (seen.has(currentId)) break;
          seen.add(currentId);
          currentId = parentById.get(currentId) as string;
        }
        return currentId;
      };

      let nextParent = parentById.get(contractId) || null;
      let nextQuota: number | null | undefined;

      if (body.fuelQuotaParentContractId !== undefined || body.dissolveGroup) {
        const requested = (body.fuelQuotaParentContractId || '').trim() || null;
        if (!requested) {
          nextParent = null;
        } else {
          if (requested === contractId) {
            throw createError('Um contrato não pode ser agrupado consigo mesmo', 400);
          }
          if (!parentById.has(requested)) {
            throw createError('Contrato do grupo não encontrado', 404);
          }
          const rootId = resolveRoot(requested);
          if (rootId === contractId) {
            throw createError('Esse agrupamento formaria um ciclo', 400);
          }
          nextParent = rootId;
          nextQuota = null;
        }
      }

      if (body.weeklyFuelTankQuota !== undefined) {
        if (nextParent) {
          throw createError(
            'Este contrato usa a cota de outro. Altere a cota no contrato dono do grupo.',
            400
          );
        }
        nextQuota = body.weeklyFuelTankQuota;
      }

      if (
        body.fuelQuotaParentContractId === undefined &&
        body.weeklyFuelTankQuota === undefined &&
        !body.dissolveGroup
      ) {
        throw createError('Nada para atualizar', 400);
      }

      if (body.dissolveGroup || (body.fuelQuotaParentContractId !== undefined && !nextParent)) {
        const idsToClear = body.dissolveGroup
          ? rows
              .filter((row) => row.id !== contractId && resolveRoot(row.id) === contractId)
              .map((row) => row.id)
          : [contractId];

        for (const id of idsToClear) {
          await prisma.$executeRawUnsafe(
            `
              UPDATE "contracts"
              SET "fuelQuotaParentContractId" = NULL,
                  "updatedAt" = CURRENT_TIMESTAMP
              WHERE id = $1
            `,
            id
          );
        }

        res.json({
          success: true,
          message: body.dissolveGroup ? 'Grupo desfeito' : 'Contrato desagrupado',
        });
        return;
      }

      if (nextQuota === undefined) {
        await prisma.$executeRawUnsafe(
          `
            UPDATE "contracts"
            SET "fuelQuotaParentContractId" = $1,
                "updatedAt" = CURRENT_TIMESTAMP
            WHERE id = $2
          `,
          nextParent,
          contractId
        );
      } else if (nextParent) {
        await prisma.$executeRawUnsafe(
          `
            UPDATE "contracts"
            SET "fuelQuotaParentContractId" = $1,
                "weeklyFuelTankQuota" = NULL,
                "updatedAt" = CURRENT_TIMESTAMP
            WHERE id = $2
          `,
          nextParent,
          contractId
        );
      } else {
        await prisma.$executeRawUnsafe(
          `
            UPDATE "contracts"
            SET "weeklyFuelTankQuota" = $1,
                "updatedAt" = CURRENT_TIMESTAMP
            WHERE id = $2
          `,
          nextQuota,
          contractId
        );
      }

      res.json({
        success: true,
        message: body.fuelQuotaParentContractId !== undefined
          ? 'Contratos agrupados'
          : 'Cota semanal atualizada',
      });
    } catch (error) {
      next(error);
    }
  }
}

export const fuelRefuelRequestController = new FuelRefuelRequestController();
