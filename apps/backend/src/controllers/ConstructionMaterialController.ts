import { Prisma, PurchaseOrderStatus } from '@prisma/client';
import { Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { getTotvsRmRelatorioFinService } from '../services/TotvsRmRelatorioFinService';
import { ensureConstructionMaterialTotvsIdPrd } from '../lib/ensureProductionSchema';
import {
  getMaterialTotvsSyncStatus,
  runMaterialTotvsSync,
  runMaterialTotvsSyncIfStale,
} from '../services/MaterialTotvsSyncService';
import {
  ensureUnaccentExtension,
  unaccentIlikeOr,
} from '../lib/normalizeSearchText';

const materialInclude = {
  budgetNature: {
    select: { id: true, code: true, name: true }
  }
} as const;

/** OCs já aprovadas pela diretoria (ou etapas posteriores) — entram na média paga. */
const EFFECTIVE_PURCHASE_ORDER_STATUSES: PurchaseOrderStatus[] = [
  PurchaseOrderStatus.APPROVED,
  PurchaseOrderStatus.PENDING_PROOF_VALIDATION,
  PurchaseOrderStatus.PENDING_PROOF_CORRECTION,
  PurchaseOrderStatus.PENDING_NF_ATTACHMENT,
  PurchaseOrderStatus.SENT,
  PurchaseOrderStatus.FINALIZED,
  PurchaseOrderStatus.PARTIALLY_RECEIVED,
  PurchaseOrderStatus.RECEIVED
];

export class ConstructionMaterialController {
  private mapMaterial(material: any) {
    return {
      ...material,
      sinapiCode: material.code || material.name
    };
  }

  private async attachTotvsIdPrd<T extends { id: string }>(materials: T[]): Promise<T[]> {
    const ids = materials.map((m) => m.id).filter(Boolean);
    if (!ids.length) return materials;
    try {
      const rows = await prisma.$queryRaw<Array<{ id: string; totvsIdPrd: number | null }>>`
        SELECT id, "totvsIdPrd" FROM construction_materials WHERE id IN (${Prisma.join(ids)})
      `;
      const byId = new Map(rows.map((row) => [row.id, row.totvsIdPrd]));
      return materials.map((material) => ({
        ...material,
        totvsIdPrd: byId.has(material.id) ? byId.get(material.id) ?? null : (material as any).totvsIdPrd ?? null,
      }));
    } catch {
      return materials;
    }
  }

  private normalizeText(value: unknown): string | null {
    if (value === undefined || value === null) return null;
    const trimmed = String(value).trim();
    return trimmed || null;
  }

  private normalizeProductType(value: unknown): 'Produto' | 'Serviço' | null {
    const raw = this.normalizeText(value);
    if (!raw) return null;
    const lower = raw.toLowerCase();
    if (lower === 'produto' || lower === 'product') return 'Produto';
    if (lower === 'serviço' || lower === 'servico' || lower === 'service') return 'Serviço';
    throw createError('Tipo do produto deve ser Produto ou Serviço', 400);
  }

  private resolveProductType(body: any): 'Produto' | 'Serviço' | null {
    const candidates = [
      body.productType,
      body.tipoDoProduto,
      body.tipo_produto,
      body.category
    ];
    for (const candidate of candidates) {
      const text = this.normalizeText(candidate);
      if (!text) continue;
      return this.normalizeProductType(text);
    }
    return null;
  }

  private async resolveBudgetNatureId(
    input: {
      budgetNatureId?: string | null;
      budgetNatureCode?: string | null;
      naturezaOrcamentaria?: string | null;
    },
    options?: { lenient?: boolean }
  ): Promise<string | null> {
    const id = this.normalizeText(input.budgetNatureId);
    if (id) {
      const byId = await prisma.budgetNature.findUnique({ where: { id } });
      if (!byId) throw createError('Natureza orçamentária não encontrada', 400);
      return byId.id;
    }

    const code = this.normalizeText(input.budgetNatureCode);
    if (code) {
      const byCode = await prisma.budgetNature.findUnique({ where: { code } });
      if (!byCode) throw createError(`Natureza orçamentária com código "${code}" não encontrada`, 400);
      return byCode.id;
    }

    const label = this.normalizeText(input.naturezaOrcamentaria);
    if (!label || /^sem natureza$/i.test(label)) return null;

    const byCode = await prisma.budgetNature.findUnique({ where: { code: label } });
    if (byCode) return byCode.id;

    const byName = await prisma.budgetNature.findFirst({
      where: { name: { equals: label, mode: 'insensitive' } }
    });
    if (byName) return byName.id;

    const byNameContains = await prisma.budgetNature.findFirst({
      where: { name: { contains: label, mode: 'insensitive' } }
    });
    if (byNameContains) return byNameContains.id;

    const codeNameMatch = label.match(/^([^-–]+)\s*[-–]\s*(.+)$/);
    if (codeNameMatch) {
      const parsedCode = codeNameMatch[1].trim();
      const parsedName = codeNameMatch[2].trim();
      const byParsedCode = parsedCode
        ? await prisma.budgetNature.findUnique({ where: { code: parsedCode } })
        : null;
      if (byParsedCode) return byParsedCode.id;
      const byParsedName = await prisma.budgetNature.findFirst({
        where: { name: { equals: parsedName, mode: 'insensitive' } }
      });
      if (byParsedName) return byParsedName.id;
    }

    if (options?.lenient) return null;

    throw createError(`Natureza orçamentária "${label}" não encontrada`, 400);
  }

  private buildMaterialData(body: any) {
    const code =
      this.normalizeMaterialCode(body.code) ||
      this.normalizeMaterialCode(body.sinapiCode) ||
      this.normalizeMaterialCode(body.codigo);
    const name =
      this.normalizeText(body.name) ||
      this.normalizeText(body.nome);
    const productType = this.resolveProductType(body);
    const description =
      this.normalizeText(body.description) ||
      this.normalizeText(body.descricao) ||
      this.normalizeText(body.descricaoDoProduto);
    const unit =
      this.normalizeText(body.unit) ||
      this.normalizeText(body.unidade) ||
      this.normalizeText(body.unidadeDeMedida);

    return {
      code,
      name,
      productType,
      description,
      unit,
      budgetNatureId: this.normalizeText(body.budgetNatureId),
      budgetNatureCode:
        this.normalizeText(body.budgetNatureCode) ||
        this.normalizeText(body.naturezaOrcamentariaCode),
      naturezaOrcamentaria:
        this.normalizeText(body.naturezaOrcamentaria) ||
        this.normalizeText(body.budgetNatureName),
      isActive: body.isActive !== undefined ? Boolean(body.isActive) : true,
      dimensions: this.normalizeText(body.dimensions),
      productImageUrl: this.normalizeText(body.productImageUrl),
      productImageName: this.normalizeText(body.productImageName),
      totvsIdPrd: this.parseTotvsIdPrd(
        body.totvsIdPrd ?? body.idPrd ?? body.identificadorProduto ?? body.identificadorDoProduto
      )
    };
  }

  private parseTotvsIdPrd(value: unknown): number | null | undefined {
    if (value === undefined) return undefined;
    if (value === null || value === '') return null;
    const n = Number(String(value).trim());
    if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
      throw createError('Identificador deve ser um número inteiro positivo (IDPRD do TOTVS)', 400);
    }
    return n;
  }

  private isUnknownFieldPrismaError(error: any) {
    if (!error) return false;
    const msg = String(error?.message || '');
    return error.name === 'PrismaClientValidationError' && /Unknown argument|Argument .+ is missing/i.test(msg);
  }

  private normalizeMaterialCode(value: unknown): string | null {
    const raw = this.normalizeText(value);
    if (!raw) return null;
    if (/^\d+$/.test(raw)) return String(parseInt(raw, 10));
    const matMatch = raw.match(/^MAT-(\d+)$/i);
    if (matMatch) return String(parseInt(matMatch[1], 10));
    return raw;
  }

  private parseNumericCodeValue(code: string): number | null {
    const trimmed = code.trim();
    if (/^\d+$/.test(trimmed)) return parseInt(trimmed, 10);
    const matMatch = trimmed.match(/^MAT-(\d+)$/i);
    if (matMatch) return parseInt(matMatch[1], 10);
    return null;
  }

  /** Reserva N códigos numéricos sequenciais em uma única consulta. */
  private async reserveMaterialCodes(count: number): Promise<string[]> {
    if (count <= 0) return [];

    const result = await prisma.$queryRaw<Array<{ max: number | null }>>`
      SELECT MAX(
        CASE
          WHEN code ~ '^[0-9]+$' THEN CAST(code AS INTEGER)
          WHEN code ~* '^MAT-[0-9]+$' THEN CAST(SUBSTRING(code FROM 5) AS INTEGER)
        END
      ) AS max
      FROM construction_materials
    `;

    let start = Number(result[0]?.max ?? 0);
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      start += 1;
      codes.push(String(start));
    }
    return codes;
  }

  /** Gera código sequencial numérico: 1, 2, 3, ... */
  private async generateNextMaterialCode(): Promise<string> {
    try {
      const [code] = await this.reserveMaterialCodes(1);
      if (code) return code;
    } catch (err) {
      console.warn('Falha ao sugerir ID de material via SQL:', err);
    }

    const rows = await prisma.constructionMaterial.findMany({
      where: { code: { not: null } },
      select: { code: true },
    });
    let max = 0;
    for (const row of rows) {
      const n = this.parseNumericCodeValue(row.code || '');
      if (n != null && n > max) max = n;
    }
    return String(max + 1);
  }

  private async assertCodeAvailable(code: string, exceptId?: string) {
    const existing = await prisma.constructionMaterial.findFirst({
      where: {
        code,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw createError('Já existe um material com este ID', 409);
    }
  }

  async getNextMaterialCode(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const code = await this.generateNextMaterialCode();
      res.json({ success: true, data: { code } });
    } catch (error) {
      next(error);
    }
  }

  private async buildMaterialsWhereSql(search?: string, isActive?: string): Promise<Prisma.Sql> {
    const parts: Prisma.Sql[] = [Prisma.sql`TRUE`];

    if (search) {
      await ensureUnaccentExtension();
      const pred = unaccentIlikeOr(
        [
          'cm.code',
          'cm.name',
          'cm.description',
          'cm.unit',
          'cm."productType"',
          'cm.category',
          'bn.name',
          'bn.code',
        ],
        search,
      );
      if (pred) parts.push(Prisma.sql`(${pred})`);
    }

    if (isActive !== undefined) {
      parts.push(Prisma.sql`cm."isActive" = ${isActive === 'true'}`);
    }

    return Prisma.join(parts, ' AND ');
  }

  private async syncEngineeringMaterial(material: {
    id: string;
    name: string;
    description: string | null;
    unit: string;
    isActive: boolean;
  }) {
    const sinapiCode = `CM-${material.id}`;
    const engName = material.name;
    const engDescription = material.description || material.name;

    const existing = await prisma.engineeringMaterial.findUnique({
      where: { sinapiCode }
    });

    if (existing) {
      await prisma.engineeringMaterial.update({
        where: { sinapiCode },
        data: {
          name: engName,
          description: engDescription,
          unit: material.unit,
          isActive: material.isActive
        }
      });
      return;
    }

    await prisma.engineeringMaterial.create({
      data: {
        sinapiCode,
        name: engName,
        description: engDescription,
        unit: material.unit,
        isActive: material.isActive
      }
    });
  }

  /** Quantas compras recentes entram na média paga (histórico continua completo). */
  private static readonly AVG_PAID_LAST_PURCHASES = 10;

  private weightedAvgFromPurchaseLines(
    lines: Array<{ quantity: unknown; unitPrice: unknown }>
  ): number | null {
    let sumQty = 0;
    let sumAmount = 0;
    for (const it of lines) {
      const qty = Number(it.quantity);
      const unitPrice = Number(it.unitPrice);
      if (!Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unitPrice)) continue;
      sumQty += qty;
      sumAmount += qty * unitPrice;
    }
    if (sumQty <= 0) return null;
    return Math.round((sumAmount / sumQty) * 100) / 100;
  }

  /** Média ponderada das últimas N compras efetivas por material (`CM-{id}`). */
  private async avgPaidByConstructionMaterialIds(
    constructionIds: string[]
  ): Promise<Map<string, number>> {
    const result = new Map<string, number>();
    if (constructionIds.length === 0) return result;

    const sinapiCodes = constructionIds.map((id) => `CM-${id}`);
    const engRows = await prisma.engineeringMaterial.findMany({
      where: { sinapiCode: { in: sinapiCodes } },
      select: { id: true, sinapiCode: true }
    });
    if (engRows.length === 0) return result;

    const engIdToConstructionId = new Map<string, string>();
    for (const eng of engRows) {
      if (eng.sinapiCode.startsWith('CM-')) {
        engIdToConstructionId.set(eng.id, eng.sinapiCode.slice(3));
      }
    }

    const items = await prisma.purchaseOrderItem.findMany({
      where: {
        materialId: { in: engRows.map((e) => e.id) },
        purchaseOrder: { status: { in: EFFECTIVE_PURCHASE_ORDER_STATUSES } }
      },
      select: {
        materialId: true,
        quantity: true,
        unitPrice: true,
        createdAt: true,
        purchaseOrder: { select: { orderDate: true } }
      },
      orderBy: [{ purchaseOrder: { orderDate: 'desc' } }, { createdAt: 'desc' }]
    });

    const byConstruction = new Map<
      string,
      Array<{ quantity: unknown; unitPrice: unknown }>
    >();
    for (const it of items) {
      const constructionId = engIdToConstructionId.get(it.materialId);
      if (!constructionId) continue;
      const list = byConstruction.get(constructionId) || [];
      if (list.length >= ConstructionMaterialController.AVG_PAID_LAST_PURCHASES) continue;
      list.push({ quantity: it.quantity, unitPrice: it.unitPrice });
      byConstruction.set(constructionId, list);
    }

    for (const [constructionId, lines] of byConstruction) {
      const avg = this.weightedAvgFromPurchaseLines(lines);
      if (avg != null) result.set(constructionId, avg);
    }
    return result;
  }

  private async purchaseHistoryForConstructionMaterial(constructionId: string) {
    const eng = await prisma.engineeringMaterial.findUnique({
      where: { sinapiCode: `CM-${constructionId}` },
      select: { id: true }
    });
    if (!eng) {
      return { avgPaidUnitPrice: null as number | null, history: [] as Array<Record<string, unknown>> };
    }

    const items = await prisma.purchaseOrderItem.findMany({
      where: {
        materialId: eng.id,
        purchaseOrder: { status: { in: EFFECTIVE_PURCHASE_ORDER_STATUSES } }
      },
      select: {
        id: true,
        quantity: true,
        unit: true,
        unitPrice: true,
        totalPrice: true,
        purchaseOrder: {
          select: {
            id: true,
            orderNumber: true,
            orderDate: true,
            status: true,
            supplier: {
              select: { id: true, code: true, name: true, tradeName: true }
            }
          }
        }
      },
      orderBy: [{ purchaseOrder: { orderDate: 'desc' } }, { createdAt: 'desc' }]
    });

    const history = items.map((it) => {
      const qty = Number(it.quantity);
      const unitPrice = Number(it.unitPrice);
      const total =
        it.totalPrice != null ? Number(it.totalPrice) : qty * unitPrice;
      return {
        id: it.id,
        purchaseOrderId: it.purchaseOrder.id,
        orderNumber: it.purchaseOrder.orderNumber,
        orderDate: it.purchaseOrder.orderDate,
        status: it.purchaseOrder.status,
        supplierName:
          it.purchaseOrder.supplier.tradeName?.trim() ||
          it.purchaseOrder.supplier.name ||
          '—',
        supplierCode: it.purchaseOrder.supplier.code || null,
        quantity: qty,
        unit: it.unit,
        unitPrice,
        totalPrice: total
      };
    });

    const avgPaidUnitPrice = this.weightedAvgFromPurchaseLines(
      items.slice(0, ConstructionMaterialController.AVG_PAID_LAST_PURCHASES)
    );

    return { avgPaidUnitPrice, history };
  }

  async getAllMaterials(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { search, isActive, page = 1, limit = 20, sortBy, sortDir } = req.query;

      const limitNum = Math.min(Number(limit), 100);
      const skip = (Number(page) - 1) * limitNum;
      const searchTerm = search ? String(search) : undefined;
      const activeFilter = isActive !== undefined ? String(isActive) : undefined;
      const whereSql = await this.buildMaterialsWhereSql(searchTerm, activeFilter);

      const sortByKey = String(sortBy || '').trim();
      const sortDirKey = String(sortDir || '').trim().toLowerCase();
      const sortAvgPaid = sortByKey === 'avgPaid' && (sortDirKey === 'asc' || sortDirKey === 'desc');
      const orderParts = sortAvgPaid
        ? [
            Prisma.sql`CASE WHEN cm."totvsAvgPaidUnitPrice" IS NULL THEN 1 ELSE 0 END ASC`,
            sortDirKey === 'desc'
              ? Prisma.sql`cm."totvsAvgPaidUnitPrice" DESC`
              : Prisma.sql`cm."totvsAvgPaidUnitPrice" ASC`,
            Prisma.sql`cm.name ASC`,
          ]
        : [
            Prisma.sql`CASE WHEN cm.code ~ '^[0-9]+$' THEN 0 ELSE 1 END`,
            Prisma.sql`CASE WHEN cm.code ~ '^[0-9]+$' THEN CAST(cm.code AS INTEGER) END ASC NULLS LAST`,
            Prisma.sql`cm.code ASC NULLS LAST`,
            Prisma.sql`cm.name ASC`,
          ];

      const [idRows, countRows, summaryRows] = await Promise.all([
        prisma.$queryRaw<Array<{ id: string }>>`
          SELECT cm.id
          FROM construction_materials cm
          LEFT JOIN budget_natures bn ON bn.id = cm."budgetNatureId"
          WHERE ${whereSql}
          ORDER BY ${Prisma.join(orderParts)}
          LIMIT ${limitNum} OFFSET ${skip}
        `,
        prisma.$queryRaw<Array<{ count: bigint }>>`
          SELECT COUNT(*)::bigint AS count
          FROM construction_materials cm
          LEFT JOIN budget_natures bn ON bn.id = cm."budgetNatureId"
          WHERE ${whereSql}
        `,
        prisma.$queryRaw<Array<{ total: bigint; active: bigint; inactive: bigint }>>`
          SELECT
            COUNT(*)::bigint AS total,
            COUNT(*) FILTER (WHERE cm."isActive" = true)::bigint AS active,
            COUNT(*) FILTER (WHERE cm."isActive" = false)::bigint AS inactive
          FROM construction_materials cm
        `,
      ]);

      const total = Number(countRows[0]?.count ?? 0);
      const ids = idRows.map((row) => row.id);
      const summary = {
        total: Number(summaryRows[0]?.total ?? 0),
        active: Number(summaryRows[0]?.active ?? 0),
        inactive: Number(summaryRows[0]?.inactive ?? 0),
      };

      let materials: Awaited<ReturnType<typeof prisma.constructionMaterial.findMany>> = [];
      if (ids.length > 0) {
        const rows = await prisma.constructionMaterial.findMany({
          where: { id: { in: ids } },
          include: materialInclude
        });
        const byId = new Map(rows.map((material) => [material.id, material]));
        materials = ids
          .map((id) => byId.get(id))
          .filter((material): material is NonNullable<typeof material> => !!material);
      }

      materials = await this.attachTotvsIdPrd(materials);
      const avgById = await this.avgPaidByConstructionMaterialIds(ids);
      let nextCode = '1';
      try {
        nextCode = await this.generateNextMaterialCode();
      } catch (err) {
        console.warn('Falha ao calcular próximo ID de material:', err);
      }

      res.json({
        success: true,
        data: materials.map((m) => {
          const localAvg = avgById.get(m.id) ?? null;
          const totvsAvg = m.totvsAvgPaidUnitPrice != null ? Number(m.totvsAvgPaidUnitPrice) : null;
          return {
            ...this.mapMaterial(m),
            // Preferência: média das OCs locais; senão média TOTVS (últimas 10 OCs).
            avgPaidUnitPrice:
              localAvg ?? (Number.isFinite(totvsAvg as number) && (totvsAvg as number) > 0 ? totvsAvg : null)
          };
        }),
        nextCode,
        summary,
        pagination: {
          page: Number(page),
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum)
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /** Resolve IDs de Materiais e Serviços a partir de nomes (ex.: itens de OC no estoque). */
  async resolveByNames(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const raw = req.body?.names;
      if (!Array.isArray(raw) || raw.length === 0) {
        res.json({ success: true, data: [] });
        return;
      }

      const names = [...new Set(raw.map((n) => String(n).trim()).filter(Boolean))].slice(0, 50);
      if (names.length === 0) {
        res.json({ success: true, data: [] });
        return;
      }

      const materials = await prisma.constructionMaterial.findMany({
        where: {
          isActive: true,
          OR: names.map((name) => ({
            name: { equals: name, mode: 'insensitive' },
          })),
        },
        select: { id: true, name: true },
      });

      res.json({
        success: true,
        data: materials.map((m) => ({ id: m.id, name: m.name })),
      });
    } catch (error) {
      next(error);
    }
  }

  async getMaterialById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const material = await prisma.constructionMaterial.findUnique({
        where: { id },
        include: materialInclude
      });

      if (!material) {
        throw createError('Material não encontrado', 404);
      }

      const { avgPaidUnitPrice, history } = await this.purchaseHistoryForConstructionMaterial(id);
      const [withIdPrd] = await this.attachTotvsIdPrd([material]);
      const totvsAvg =
        material.totvsAvgPaidUnitPrice != null ? Number(material.totvsAvgPaidUnitPrice) : null;

      res.json({
        success: true,
        data: {
          ...this.mapMaterial(withIdPrd),
          avgPaidUnitPrice:
            avgPaidUnitPrice ??
            (Number.isFinite(totvsAvg as number) && (totvsAvg as number) > 0 ? totvsAvg : null),
          purchaseHistory: history
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async getMaterialPurchaseHistory(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const material = await prisma.constructionMaterial.findUnique({
        where: { id },
        select: { id: true, totvsAvgPaidUnitPrice: true }
      });
      if (!material) {
        throw createError('Material não encontrado', 404);
      }

      const { avgPaidUnitPrice, history } = await this.purchaseHistoryForConstructionMaterial(id);
      const totvsAvg =
        material.totvsAvgPaidUnitPrice != null ? Number(material.totvsAvgPaidUnitPrice) : null;
      res.json({
        success: true,
        data: {
          avgPaidUnitPrice:
            avgPaidUnitPrice ??
            (Number.isFinite(totvsAvg as number) && (totvsAvg as number) > 0 ? totvsAvg : null),
          history
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async createMaterial(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await ensureConstructionMaterialTotvsIdPrd(prisma);
      const parsed = this.buildMaterialData(req.body);

      if (!parsed.name) {
        throw createError('Nome é obrigatório', 400);
      }

      if (!parsed.unit) {
        throw createError('Unidade de medida é obrigatória', 400);
      }

      if (!parsed.productType) {
        throw createError('Tipo do produto é obrigatório (Produto ou Serviço)', 400);
      }

      const displayName = parsed.name;
      const productCode = parsed.code || (await this.generateNextMaterialCode());
      await this.assertCodeAvailable(productCode);

      const budgetNatureId = await this.resolveBudgetNatureId(parsed);
      if (!budgetNatureId) {
        throw createError('Natureza orçamentária é obrigatória', 400);
      }

      const fullData = {
        code: productCode,
        name: displayName,
        productType: parsed.productType,
        description: parsed.description,
        unit: parsed.unit!,
        budgetNatureId,
        category: parsed.productType,
        dimensions: parsed.dimensions,
        productImageUrl: parsed.productImageUrl,
        productImageName: parsed.productImageName,
        isActive: parsed.isActive,
        ...(parsed.totvsIdPrd !== undefined ? { totvsIdPrd: parsed.totvsIdPrd } : {})
      };

      let material: any;
      try {
        material = await prisma.constructionMaterial.create({
          data: fullData,
          include: materialInclude
        });
      } catch (error: any) {
        if (!this.isUnknownFieldPrismaError(error)) throw error;

        material = await prisma.constructionMaterial.create({
          data: {
            name: fullData.name,
            description: fullData.description,
            unit: fullData.unit,
            category: fullData.productType,
            isActive: fullData.isActive
          }
        });
      }

      if (parsed.totvsIdPrd !== undefined) {
        try {
          await prisma.$executeRaw`
            UPDATE construction_materials SET "totvsIdPrd" = ${parsed.totvsIdPrd} WHERE id = ${material.id}
          `;
          material.totvsIdPrd = parsed.totvsIdPrd;
        } catch {
          /* coluna pode ainda não existir no client antigo */
        }
      }

      try {
        await this.syncEngineeringMaterial(material);
      } catch (engErr) {
        console.warn('Aviso: material criado mas falha ao sincronizar com EngineeringMaterial:', engErr);
      }

      res.status(201).json({
        success: true,
        data: this.mapMaterial(material),
        message: 'Material criado com sucesso'
      });
    } catch (error: any) {
      if (error.statusCode) return next(error);
      if (error.code === 'P2002') {
        return next(createError('Já existe um material com este código', 409));
      }
      next(error);
    }
  }

  async updateMaterial(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await ensureConstructionMaterialTotvsIdPrd(prisma);
      const { id } = req.params;
      const parsed = this.buildMaterialData(req.body);

      const existing = await prisma.constructionMaterial.findUnique({
        where: { id }
      });

      if (!existing) {
        throw createError('Material não encontrado', 404);
      }

      let budgetNatureId: string | null | undefined;
      if (req.body.budgetNatureId === '' || req.body.budgetNatureId === null) {
        throw createError('Natureza orçamentária é obrigatória', 400);
      } else if (
        parsed.budgetNatureId ||
        parsed.budgetNatureCode ||
        parsed.naturezaOrcamentaria
      ) {
        budgetNatureId = await this.resolveBudgetNatureId(parsed);
        if (!budgetNatureId) {
          throw createError('Natureza orçamentária é obrigatória', 400);
        }
      }

      if (parsed.code && parsed.code !== existing.code) {
        await this.assertCodeAvailable(parsed.code, id);
      }

      const updateData: any = {
        ...(parsed.code && { code: parsed.code }),
        ...(parsed.name && { name: parsed.name }),
        ...(parsed.productType !== null && {
          productType: parsed.productType,
          category: parsed.productType
        }),
        ...(parsed.description !== null && { description: parsed.description }),
        ...(parsed.unit && { unit: parsed.unit }),
        ...(budgetNatureId !== undefined && { budgetNatureId }),
        ...(parsed.dimensions !== null && { dimensions: parsed.dimensions }),
        ...(parsed.productImageUrl !== null && { productImageUrl: parsed.productImageUrl }),
        ...(parsed.productImageName !== null && { productImageName: parsed.productImageName }),
        ...(req.body.isActive !== undefined && { isActive: Boolean(req.body.isActive) }),
        ...(parsed.totvsIdPrd !== undefined && { totvsIdPrd: parsed.totvsIdPrd })
      };

      let material: any;
      try {
        material = await prisma.constructionMaterial.update({
          where: { id },
          data: updateData,
          include: materialInclude
        });
      } catch (error: any) {
        if (!this.isUnknownFieldPrismaError(error)) throw error;

        const fallbackData: any = {
          ...(parsed.name && { name: parsed.name }),
          ...(parsed.description !== null && { description: parsed.description }),
          ...(parsed.unit && { unit: parsed.unit }),
          ...(parsed.productType !== null && { category: parsed.productType }),
          ...(req.body.isActive !== undefined && { isActive: Boolean(req.body.isActive) })
        };

        material = await prisma.constructionMaterial.update({
          where: { id },
          data: fallbackData
        });
      }

      if (parsed.totvsIdPrd !== undefined) {
        try {
          await prisma.$executeRaw`
            UPDATE construction_materials SET "totvsIdPrd" = ${parsed.totvsIdPrd} WHERE id = ${material.id}
          `;
          material.totvsIdPrd = parsed.totvsIdPrd;
        } catch {
          /* coluna pode ainda não existir no client antigo */
        }
      }

      try {
        await this.syncEngineeringMaterial(material);
      } catch (engErr) {
        console.warn('Aviso: falha ao sincronizar EngineeringMaterial:', engErr);
      }

      res.json({
        success: true,
        data: this.mapMaterial(material),
        message: 'Material atualizado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteMaterial(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const existing = await prisma.constructionMaterial.findUnique({
        where: { id }
      });

      if (!existing) {
        throw createError('Material não encontrado', 404);
      }

      await prisma.constructionMaterial.delete({
        where: { id }
      });

      res.json({
        success: true,
        message: 'Material deletado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteMany(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const ids = Array.isArray(req.body?.ids)
        ? (req.body.ids as unknown[]).map((id) => String(id).trim()).filter(Boolean)
        : [];
      if (ids.length === 0) {
        throw createError('Envie um array "ids" com ao menos um item', 400);
      }

      const result = await prisma.constructionMaterial.deleteMany({
        where: { id: { in: ids } },
      });

      res.json({
        success: true,
        data: { deleted: result.count },
        message: `${result.count} cadastro(s) excluído(s) com sucesso`,
      });
    } catch (error) {
      next(error);
    }
  }

  async importMaterials(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { materials } = req.body;

      if (!Array.isArray(materials) || materials.length === 0) {
        throw createError('Envie um array "materials" com ao menos um item', 400);
      }

      let created = 0;
      const errors: { index: number; message: string }[] = [];
      const reservedCodes = await this.reserveMaterialCodes(materials.length);

      for (let i = 0; i < materials.length; i++) {
        const row = materials[i];
        try {
          const parsed = this.buildMaterialData(row);

          if (!parsed.unit) {
            errors.push({ index: i, message: 'Unidade de medida é obrigatória' });
            continue;
          }

          if (!parsed.name) {
            errors.push({ index: i, message: 'Nome é obrigatório' });
            continue;
          }

          if (!parsed.productType) {
            errors.push({ index: i, message: 'Tipo do produto é obrigatório (Produto ou Serviço)' });
            continue;
          }

          const displayName = parsed.name;
          const productCode = reservedCodes[i];

          const budgetNatureId = await this.resolveBudgetNatureId(parsed, { lenient: true });

          const fullData = {
            code: productCode,
            name: displayName,
            productType: parsed.productType,
            description: parsed.description,
            unit: parsed.unit!,
            budgetNatureId,
            category: parsed.productType,
            isActive: parsed.isActive
          };

          try {
            await prisma.constructionMaterial.create({ data: fullData });
          } catch (error: any) {
            if (!this.isUnknownFieldPrismaError(error)) throw error;
            await prisma.constructionMaterial.create({
              data: {
                name: fullData.name,
                description: fullData.description,
                unit: fullData.unit,
                category: fullData.productType,
                isActive: fullData.isActive
              }
            });
          }

          created += 1;
        } catch (err: any) {
          errors.push({
            index: i,
            message: err?.message || 'Erro ao importar linha'
          });
        }
      }

      res.json({
        success: true,
        data: {
          created,
          failed: errors.length,
          errors
        },
        message: `Importação concluída: ${created} criado(s), ${errors.length} erro(s)`
      });
    } catch (error) {
      next(error);
    }
  }

  async getTotvsProdutosAtivos(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const svc = getTotvsRmRelatorioFinService();
      if (!svc.isConfigured()) {
        res.json({
          success: false,
          message:
            'Integração TOTVS RM não configurada. Defina TOTVS_RM_BASE_URL e TOTVS_RM_USER + TOTVS_RM_PASSWORD (Basic) ou TOTVS_RM_BEARER_TOKEN no backend.',
          data: [],
          total: 0
        });
        return;
      }

      try {
        const rows = await svc.fetchProdutosAtivosRows();
        res.json({
          success: true,
          data: rows,
          total: rows.length
        });
      } catch (err) {
        const message = svc.formatAxiosError(err);
        console.warn(`[TOTVS RM PRODUTOS]: ${message}`);
        res.json({
          success: false,
          message,
          data: [],
          total: 0
        });
      }
    } catch (error) {
      next(error);
    }
  }

  /** Sincroniza materiais do TOTVS RM (upsert por IDPRD / código / nome único). Não apaga locais. */
  async syncFromTotvs(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const force = String(req.query.force || '').trim() === '1';
      const result = force
        ? await runMaterialTotvsSync('manual')
        : await runMaterialTotvsSyncIfStale(60_000);
      res.json({
        success: true,
        data: result ?? getMaterialTotvsSyncStatus(),
        message: result
          ? `Sync TOTVS: ${result.created} criado(s), ${result.updated} atualizado(s)` +
            (result.conflicts ? `, ${result.conflicts} conflito(s)` : '')
          : 'Sync já em andamento ou recente',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[material-totvs] syncFromTotvs: ${message}`);
      res.status(502).json({
        success: false,
        message:
          /JSON|Unexpected token/i.test(message)
            ? 'TOTVS RM devolveu resposta inválida ao buscar PRODUTOSATIVOS. Verifique TOTVS_RM_PRODUTOSATIVOS_PATH e as credenciais.'
            : message || 'Falha ao sincronizar materiais do TOTVS',
        data: getMaterialTotvsSyncStatus(),
      });
    }
  }
}
