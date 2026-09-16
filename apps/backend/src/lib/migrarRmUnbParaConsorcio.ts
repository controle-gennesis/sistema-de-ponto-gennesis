import { prisma } from './prisma';

function normalizeLabel(label: string): string {
  return label
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function isExactUnb(name: string, code: string): boolean {
  return normalizeLabel(name) === 'UNB' || normalizeLabel(code) === 'UNB';
}

function isUnbConsorcioPredial(name: string, code: string): boolean {
  const n = normalizeLabel(name);
  const c = normalizeLabel(code).replace(/\s/g, '');
  if (c === '009.01' || c === '00901') return true;
  if (n.startsWith('HUB')) return false;
  return n.startsWith('UNB') && n.includes('CONSORCIO PREDIAL');
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
  applied: { rms: number; stock: number; shortfalls: number };
};

async function resolveUnbConsorcioCenters() {
  const centers = await prisma.costCenter.findMany({
    select: { id: true, code: true, name: true },
    orderBy: { name: 'asc' },
  });

  const sources = centers.filter((cc) => isExactUnb(cc.name, cc.code));
  const byCode = centers.filter((cc) => {
    const c = normalizeLabel(cc.code).replace(/\s/g, '');
    return c === '009.01' || c === '00901';
  });
  const byUnbName = centers.filter((cc) => isUnbConsorcioPredial(cc.name, cc.code));
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

  if (preview.rmCount === 0 && preview.stockCount === 0 && preview.shortfallCount === 0) {
    return { ...preview, applied: { rms: 0, stock: 0, shortfalls: 0 } };
  }

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
    return { rms: rms.count, stock: stock.count, shortfalls: shortfalls.count };
  });

  return { ...preview, applied };
}
