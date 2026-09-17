import { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { isExactUnbCostCenterLabel, isUnbConsorcioPredialLabel } from './unbBranding';

type UserLinkRow = { id: string; userId: string };

type CostCenterLinkDelegate = {
  findMany: (args: { where: { costCenterId: string } }) => Promise<UserLinkRow[]>;
  findFirst: (args: {
    where: { userId: string; costCenterId: string };
  }) => Promise<UserLinkRow | null>;
  delete: (args: { where: { id: string } }) => Promise<unknown>;
  update: (args: { where: { id: string }; data: { costCenterId: string } }) => Promise<unknown>;
};

type ContractLinkDelegate = {
  findMany: (args: { where: { contractId: string } }) => Promise<UserLinkRow[]>;
  findFirst: (args: {
    where: { userId: string; contractId: string };
  }) => Promise<UserLinkRow | null>;
  delete: (args: { where: { id: string } }) => Promise<unknown>;
  update: (args: { where: { id: string }; data: { contractId: string } }) => Promise<unknown>;
};

function isExactUnb(name: string, code: string): boolean {
  return isExactUnbCostCenterLabel(name) || isExactUnbCostCenterLabel(code);
}

export type MigrarUnbConsorcioCenter = {
  id: string;
  code: string;
  name: string;
};

export type MigrarUnbConsorcioPreview = {
  from: MigrarUnbConsorcioCenter;
  to: MigrarUnbConsorcioCenter;
  rmCount: number;
  ocCount: number;
  stockCount: number;
  shortfallCount: number;
  contractCount: number;
  sampleRms: { requestNumber: string; status: string }[];
  sampleOcs: { orderNumber: string; status: string }[];
};

export type MigrarUnbConsorcioApplyResult = MigrarUnbConsorcioPreview & {
  applied: {
    rms: number;
    stock: number;
    shortfalls: number;
    employees: number;
    contractPermissions: number;
    costCenterPermissions: number;
  };
};

async function resolveUnbConsorcioCenters() {
  const centers = await prisma.costCenter.findMany({
    select: { id: true, code: true, name: true },
    orderBy: { name: 'asc' },
  });

  const sources = centers.filter((cc) => isExactUnb(cc.name, cc.code));
  const byCode = centers.filter((cc) => {
    const c = (cc.code || '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s/g, '');
    return c === '009.01' || c === '00901';
  });
  const byUnbName = centers.filter((cc) => isUnbConsorcioPredialLabel(cc.name, cc.code));
  const targets = byCode.length === 1 ? byCode : byUnbName;

  if (sources.length !== 1) {
    throw new Error(
      sources.length === 0
        ? 'Não achei o centro exatamente "UNB".'
        : `Achei ${sources.length} centros exatamente "UNB". Confira o cadastro antes de migrar.`,
    );
  }
  if (targets.length !== 1) {
    const found = byUnbName.map((cc) => `${cc.code} — ${cc.name}`).join('; ') || 'nenhum';
    throw new Error(
      targets.length === 0
        ? 'Não achei o centro "UNB - CONSÓRCIO PREDIAL BRASILIA" (código 009.01).'
        : `Achei ${targets.length} centros UNB Consórcio Predial (${found}). Confira o cadastro antes de migrar.`,
    );
  }
  if (sources[0].id === targets[0].id) {
    throw new Error('Origem e destino são o mesmo centro.');
  }

  return { from: sources[0], to: targets[0] };
}

function employeeCostCenterIsExactUnb(
  costCenter: string | null | undefined,
  from: MigrarUnbConsorcioCenter,
): boolean {
  const raw = costCenter?.trim();
  if (!raw) return false;
  if (isUnbConsorcioPredialLabel(raw, raw)) return false;
  if (isExactUnbCostCenterLabel(raw)) return true;
  return raw === from.id || raw === from.code || raw === from.name;
}

async function moveCostCenterLinkRows(
  model: CostCenterLinkDelegate,
  fromId: string,
  toId: string,
): Promise<number> {
  const rows = await model.findMany({ where: { costCenterId: fromId } });
  for (const row of rows) {
    const already = await model.findFirst({
      where: { userId: row.userId, costCenterId: toId },
    });
    if (already) {
      await model.delete({ where: { id: row.id } });
    } else {
      await model.update({ where: { id: row.id }, data: { costCenterId: toId } });
    }
  }
  return rows.length;
}

async function moveContractLinkRows(
  model: ContractLinkDelegate,
  fromContractId: string,
  toContractId: string,
): Promise<number> {
  const rows = await model.findMany({ where: { contractId: fromContractId } });
  for (const row of rows) {
    const already = await model.findFirst({
      where: { userId: row.userId, contractId: toContractId },
    });
    if (already) {
      await model.delete({ where: { id: row.id } });
    } else {
      await model.update({ where: { id: row.id }, data: { contractId: toContractId } });
    }
  }
  return rows.length;
}

async function moveUserCostCenterRows(
  tx: Prisma.TransactionClient,
  fromId: string,
  toId: string,
): Promise<number> {
  const a = await moveCostCenterLinkRows(
    tx.userDpRequestViewCostCenter as unknown as CostCenterLinkDelegate,
    fromId,
    toId,
  );
  const b = await moveCostCenterLinkRows(
    tx.userRestrictedDpApprovalCostCenter as unknown as CostCenterLinkDelegate,
    fromId,
    toId,
  );
  return a + b;
}

async function moveUserContractRows(
  tx: Prisma.TransactionClient,
  fromContractIds: string[],
  toContractId: string,
): Promise<number> {
  if (fromContractIds.length === 0 || !toContractId) return 0;
  let moved = 0;
  const models: ContractLinkDelegate[] = [
    tx.userContractPermission as unknown as ContractLinkDelegate,
    tx.userDpApprovalContract as unknown as ContractLinkDelegate,
    tx.userFdApprovalContract as unknown as ContractLinkDelegate,
    tx.userFuelApprovalContract as unknown as ContractLinkDelegate,
  ];

  for (const fromContractId of fromContractIds) {
    if (fromContractId === toContractId) continue;
    for (const model of models) {
      moved += await moveContractLinkRows(model, fromContractId, toContractId);
    }
  }
  return moved;
}

/** Se o CC for exatamente "UNB", devolve o id do Consórcio UNB. Caso contrário, mantém. */
export async function remapExactUnbCostCenterIdToConsorcio(costCenterId: string): Promise<string> {
  const raw = costCenterId?.trim();
  if (!raw) return costCenterId;
  try {
    const { from, to } = await resolveUnbConsorcioCenters();
    return raw === from.id ? to.id : raw;
  } catch {
    return costCenterId;
  }
}

export async function previewMigrarRmUnbParaConsorcio(): Promise<MigrarUnbConsorcioPreview> {
  const { from, to } = await resolveUnbConsorcioCenters();

  const [rmCount, ocCount, stockCount, shortfallCount, contractCount, sampleRms, sampleOcs] =
    await Promise.all([
      prisma.materialRequest.count({ where: { costCenterId: from.id } }),
      prisma.purchaseOrder.count({ where: { materialRequest: { costCenterId: from.id } } }),
      prisma.stockMovement.count({ where: { costCenterId: from.id } }),
      prisma.stockShortfall.count({ where: { costCenterId: from.id } }),
      prisma.contract.count({ where: { costCenterId: from.id } }),
      prisma.materialRequest.findMany({
        where: { costCenterId: from.id },
        select: { requestNumber: true, status: true },
        orderBy: { requestedAt: 'desc' },
        take: 8,
      }),
      prisma.purchaseOrder.findMany({
        where: { materialRequest: { costCenterId: from.id } },
        select: { orderNumber: true, status: true },
        orderBy: { updatedAt: 'desc' },
        take: 8,
      }),
    ]);

  return {
    from,
    to,
    rmCount,
    ocCount,
    stockCount,
    shortfallCount,
    contractCount,
    sampleRms,
    sampleOcs,
  };
}

export async function applyMigrarRmUnbParaConsorcio(): Promise<MigrarUnbConsorcioApplyResult> {
  const preview = await previewMigrarRmUnbParaConsorcio();

  const sourceContracts = await prisma.contract.findMany({
    where: {
      OR: [{ costCenterId: preview.from.id }, { name: preview.from.name }],
    },
    select: { id: true, name: true, number: true, costCenterId: true },
  });
  const destContracts = await prisma.contract.findMany({
    where: {
      OR: [{ costCenterId: preview.to.id }, { name: preview.to.name }],
    },
    select: { id: true, name: true, number: true, costCenterId: true },
  });
  const destContract =
    destContracts.find((c) => isUnbConsorcioPredialLabel(c.name, c.number)) ||
    destContracts.find((c) => c.costCenterId === preview.to.id) ||
    destContracts[0] ||
    null;
  const fromContractIds = sourceContracts
    .map((c) => c.id)
    .filter((id) => id !== destContract?.id);

  const applied = await prisma.$transaction(async (tx) => {
    const rms = await tx.materialRequest.updateMany({
      where: { costCenterId: preview.from.id },
      data: { costCenterId: preview.to.id },
    });
    const stock = await tx.stockMovement.updateMany({
      where: { costCenterId: preview.from.id },
      data: { costCenterId: preview.to.id },
    });
    const shortfalls = await tx.stockShortfall.updateMany({
      where: { costCenterId: preview.from.id },
      data: { costCenterId: preview.to.id },
    });

    const employees = await tx.employee.findMany({ select: { id: true, costCenter: true } });
    const employeeIds = employees
      .filter((row) => employeeCostCenterIsExactUnb(row.costCenter, preview.from))
      .map((row) => row.id);
    if (employeeIds.length > 0) {
      await tx.employee.updateMany({
        where: { id: { in: employeeIds } },
        data: { costCenter: preview.to.name },
      });
    }

    const costCenterPermissions = await moveUserCostCenterRows(tx, preview.from.id, preview.to.id);
    const contractPermissions = destContract
      ? await moveUserContractRows(tx, fromContractIds, destContract.id)
      : 0;

    return {
      rms: rms.count,
      stock: stock.count,
      shortfalls: shortfalls.count,
      employees: employeeIds.length,
      contractPermissions,
      costCenterPermissions,
    };
  });

  return { ...preview, applied };
}
