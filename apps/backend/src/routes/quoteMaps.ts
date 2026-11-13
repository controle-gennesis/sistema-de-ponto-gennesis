import { Router, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';
import { QuoteMapService } from '../services/QuoteMapService';
import { createError } from '../middleware/errorHandler';
import { prisma } from '../lib/prisma';

const router = Router();
const service = new QuoteMapService();

router.use(authenticate);

/** Rascunho do mapa (um por RM, para todos). Some quando a RM sai de Aprovada ou alguém descarta. */
const RASCUNHO_MAX_BYTES = 2 * 1024 * 1024;

router.get('/rascunho/:materialRequestId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const materialRequestId = String(req.params.materialRequestId || '').trim();
    const draft = await prisma.quoteMapDraft.findUnique({ where: { materialRequestId } });
    if (!draft) return res.json({ success: true, data: null });
    const rm = await prisma.materialRequest.findUnique({
      where: { id: materialRequestId },
      select: { status: true },
    });
    if (!rm || rm.status !== 'APPROVED') {
      await prisma.quoteMapDraft.delete({ where: { materialRequestId } }).catch(() => undefined);
      return res.json({ success: true, data: null });
    }
    return res.json({
      success: true,
      data: { data: draft.data, updatedByName: draft.updatedByName, updatedAt: draft.updatedAt },
    });
  } catch (error) {
    return next(error);
  }
});

router.put('/rascunho/:materialRequestId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);
    const materialRequestId = String(req.params.materialRequestId || '').trim();
    const data = (req.body as { data?: unknown })?.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw createError('Rascunho inválido', 400);
    }
    if (JSON.stringify(data).length > RASCUNHO_MAX_BYTES) {
      throw createError('Rascunho grande demais', 400);
    }
    const rm = await prisma.materialRequest.findUnique({
      where: { id: materialRequestId },
      select: { status: true },
    });
    if (!rm) throw createError('Requisição não encontrada', 404);
    if (rm.status !== 'APPROVED') throw createError('Só RMs aprovadas têm rascunho de cotação', 400);
    const autor = await prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true } });
    const draft = await prisma.quoteMapDraft.upsert({
      where: { materialRequestId },
      create: {
        materialRequestId,
        data: data as object,
        updatedById: req.user.id,
        updatedByName: autor?.name ?? null,
      },
      update: { data: data as object, updatedById: req.user.id, updatedByName: autor?.name ?? null },
    });
    res.json({ success: true, data: { updatedByName: draft.updatedByName, updatedAt: draft.updatedAt } });
  } catch (error) {
    next(error);
  }
});

router.delete('/rascunho/:materialRequestId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const materialRequestId = String(req.params.materialRequestId || '').trim();
    await prisma.quoteMapDraft.deleteMany({ where: { materialRequestId } });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// Criar mapa de cotação a partir de SC aprovada
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { materialRequestId } = req.body as { materialRequestId?: string };
    if (!materialRequestId) throw createError('materialRequestId é obrigatório', 400);
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);

    const map = await service.create(materialRequestId, req.user.id);
    res.status(201).json({ success: true, data: map });
  } catch (error) {
    next(error);
  }
});

// Salvar cotações (frete por fornecedor + preço unitário por item/fornecedor)
router.put('/:id/quotes', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { supplierIds, freightBySupplier, unitPrices, itemQuantities } = req.body as {
      supplierIds?: string[];
      freightBySupplier?: Record<string, number>;
      unitPrices?: Array<{ supplierId: string; materialRequestItemId: string; unitPrice: number }>;
      itemQuantities?: Record<string, number>;
    };

    if (!req.user?.id) throw createError('Usuário não autenticado', 401);
    if (!supplierIds || !Array.isArray(supplierIds) || supplierIds.length === 0) {
      throw createError('supplierIds é obrigatório', 400);
    }
    if (!freightBySupplier || typeof freightBySupplier !== 'object') {
      throw createError('freightBySupplier é obrigatório', 400);
    }
    if (!unitPrices || !Array.isArray(unitPrices)) {
      throw createError('unitPrices é obrigatório', 400);
    }

    const result = await service.saveQuotes(id, req.user.id, {
      supplierIds,
      freightBySupplier,
      unitPrices,
      itemQuantities
    });

    res.json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
});

// Gerar OCs a partir do vencedor por item (com pagamento por fornecedor)
router.post('/:id/generate', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { generateSupplierIds, paymentBySupplier, itemQuantities, itemNotesBySupplierItem } =
      req.body as {
        generateSupplierIds?: string[];
        itemQuantities?: Record<string, number>;
        /** Chave `supplierId:materialRequestItemId` → detalhe/nome do item no fornecedor (notes do item da OC). */
        itemNotesBySupplierItem?: Record<string, string>;
        paymentBySupplier?: Array<{
          supplierId: string;
          paymentType: string;
          paymentCondition: string;
          paymentDetails?: string;
          pixKeyType?: string;
          pixKey?: string;
          observations?: string;
          historico?: string;
          totvsDestination?: string;
          amountToPay?: number;
          boletoAttachmentUrl?: string;
          boletoAttachmentName?: string;
          attachments?: Array<{ url: string; name: string }>;
        }>;
      };

    if (!req.user?.id) throw createError('Usuário não autenticado', 401);
    if (!generateSupplierIds || !Array.isArray(generateSupplierIds) || generateSupplierIds.length === 0) {
      throw createError('generateSupplierIds é obrigatório', 400);
    }
    if (!paymentBySupplier || !Array.isArray(paymentBySupplier) || paymentBySupplier.length === 0) {
      throw createError('paymentBySupplier é obrigatório', 400);
    }

    const result = await service.generatePurchaseOrders(id, req.user.id, {
      generateSupplierIds,
      paymentBySupplier,
      itemQuantities,
      itemNotesBySupplierItem,
    });

    res.json({ success: true, data: result });
  } catch (error) {
    const err = error as { name?: string; message?: string; statusCode?: number };
    if (
      error instanceof Error &&
      !err.statusCode &&
      err.name !== 'PrismaClientValidationError' &&
      err.name !== 'PrismaClientKnownRequestError'
    ) {
      next(createError(error.message, 400));
      return;
    }
    next(error);
  }
});
// Baixar snapshot PDF do mapa (gera sob demanda se não existir)
router.get('/:id/snapshot-pdf', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);

    const purchaseOrderId =
      typeof req.query.purchaseOrderId === 'string' && req.query.purchaseOrderId.trim()
        ? req.query.purchaseOrderId.trim()
        : undefined;

    const absPath = await service.getOrCreateSnapshotPdfPath(id, purchaseOrderId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="mapa-cotacao-${purchaseOrderId || id}.pdf"`
    );
    res.sendFile(absPath);
  } catch (error) {
    next(error);
  }
});

// PDF comparativo: todas as cotações + ganhadora (arquivo separado do PDF da OC)
// Com purchaseOrderId: compara só o contexto daquela OC (não mistura outra OC da mesma RM).
router.get('/:id/comparison-pdf', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const purchaseOrderId =
      typeof req.query.purchaseOrderId === 'string' ? req.query.purchaseOrderId.trim() : '';
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);

    const absPath = await service.getOrCreateComparisonPdfPath(id, purchaseOrderId || undefined);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="mapa-cotacao-comparativo-${purchaseOrderId || id}.pdf"`
    );
    res.sendFile(absPath);
  } catch (error) {
    next(error);
  }
});

export default router;

