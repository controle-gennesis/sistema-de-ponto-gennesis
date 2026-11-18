import { Router } from 'express';
import { Response, NextFunction } from 'express';
import multer from 'multer';
import { authenticate, requireAdministrator } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';
import { MaterialRequestService } from '../services/MaterialRequestService';
import { createError } from '../middleware/errorHandler';
import { prisma } from '../lib/prisma';
import { savePersistentUpload } from '../lib/persistentUpload';
import {
  desmarcarItensAguardandoAprovacao,
  itensAguardandoAprovacao,
  listarCorrecoesRm,
  rotuloDoMaterial,
} from '../lib/rmCorrecaoFd';
import {
  assertUserCanApproveMaterialRequests,
  assertUserCanApproveMaterialRequestForCostCenter,
  assertUserCanSendRmToCorrection,
  getRmApproverListScopeCostCenterIds,
  isRmApproverStatusChange,
} from '../lib/rmApprovalAccess';
import {
  applyUnbCostCenterScopeToIdFilter,
  assertCostCenterAllowedForOcRmUser,
  getUserOcRmListCostCenterScope,
} from '../lib/unbCostCenterScope';

const router = Router();
const materialRequestService = new MaterialRequestService();

const ALLOWED_RM_PRIORITY = new Set(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);

function normalizeRmPriority(p: unknown): 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT' {
  const s = typeof p === 'string' ? p.trim().toUpperCase() : '';
  if (ALLOWED_RM_PRIORITY.has(s)) return s as 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  return 'MEDIUM';
}

/** Garante tipos aceitos pelo Prisma (evita PrismaClientValidationError por string/objeto indevido no anexo) */
function normalizeRmItemUnitPrice(raw: unknown): number | null {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function normalizeRmItemBody(item: any) {
  const url = item?.attachmentUrl;
  const name = item?.attachmentName;
  const bankRaw = item?.bankDetails;
  return {
    materialId: item?.materialId,
    quantity: item?.quantity,
    unitPrice: normalizeRmItemUnitPrice(item?.unitPrice),
    notes: item?.observation ?? item?.notes,
    bankDetails:
      typeof bankRaw === 'string' && bankRaw.trim().length > 0
        ? bankRaw.trim().slice(0, 4000)
        : null,
    attachmentUrl:
      typeof url === 'string' && url.trim().length > 0 ? url.trim().slice(0, 2000) : null,
    attachmentName:
      typeof name === 'string' && name.trim().length > 0 ? name.trim().slice(0, 500) : null
  };
}

const itemAttachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = (file.originalname || '').toLowerCase();
    const ok =
      file.mimetype === 'application/pdf' ||
      file.mimetype.startsWith('image/') ||
      /\.(pdf|png|jpg|jpeg|webp|doc|docx|xls|xlsx)$/i.test(name);
    if (ok) cb(null, true);
    else cb(new Error('Envie PDF, imagem ou documento Office (PDF, PNG, JPG, DOC, XLS…)'));
  }
});

// Todas as rotas requerem autenticação
router.use(authenticate);

// Endpoint auxiliar para listar materiais da RM (deve vir antes de /:id)
// Somente Materiais e Serviços (cadastro em /ponto/materiais-construcao); cada um tem espelho em EngineeringMaterial (sinapiCode CM-*)
router.get('/materials', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const search = String(req.query.search ?? '').trim();
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '50'), 10) || 50, 1), 100);

    if (search.length >= 2) {
      // sugestao=1: sugestões pela descrição do item da FD (basta bater parte das palavras).
      const sugestao = String(req.query.sugestao ?? '') === '1';
      // comIdPrd=1: só materiais com identificador do TOTVS (pedido pelo orçamento/FD vai para o TOTVS).
      const comIdPrd = String(req.query.comIdPrd ?? '') === '1';
      const data = await materialRequestService.searchConstructionMaterialsForRmDropdown(search, limit, {
        sugestao,
        comIdPrd,
      });
      res.json({ success: true, data });
      return;
    }

    res.json({ success: true, data: [] });
  } catch (error) {
    next(error);
  }
});

// Upload de anexo por item (antes de criar/atualizar a RM o front envia o arquivo e usa url/data no body)
router.post("/upload-item-attachment", (req: AuthRequest, res: Response, next: NextFunction) => {
  itemAttachmentUpload.single("file")(req, res, (err: unknown) => {
    if (err) {
      const msg = err instanceof Error ? err.message : "Erro no upload";
      res.status(400).json({ success: false, message: msg });
      return;
    }
    next();
  });
}, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.file?.buffer) {
      throw createError("Selecione um arquivo", 400);
    }
    const saved = await savePersistentUpload({
      folder: "material-request-items",
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
    });
    res.json({
      success: true,
      data: {
        url: saved.url,
        originalName: saved.originalName || saved.fileName
      }
    });
  } catch (error) {
    next(error);
  }
});

// RMs do próprio usuário enviadas para correção (RM inteira ou itens em correção) — sininho e menu. Só leitura.
router.get('/minhas/correcao-count', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);
    // Itens com a correção já enviada ao aprovador não contam (a pendência agora é do aprovador).
    const enviados = (await itensAguardandoAprovacao()).map((m) => m.materialRequestItemId);
    const count = await prisma.materialRequest.count({
      where: {
        requestedBy: req.user.id,
        OR: [
          { status: 'IN_REVIEW' },
          {
            status: 'APPROVED',
            items: {
              some: { status: 'IN_REVIEW', ...(enviados.length ? { id: { notIn: enviados } } : {}) },
            },
          },
        ],
      },
    });
    return res.json({ success: true, data: { count } });
  } catch (error) {
    return next(error);
  }
});

/**
 * Itens corrigidos pelo solicitante aguardando o aprovador (RM aprovada com OC em andamento).
 * Mesma visibilidade da aprovação de RMs (centros de custo do aprovador).
 */
async function rmsComCorrecaoAguardando(req: AuthRequest) {
  const marcas = await itensAguardandoAprovacao();
  if (marcas.length === 0) return [];
  const scope = await getRmApproverListScopeCostCenterIds(req.user!.id, !!req.user!.isAdmin);
  const rmIds = [...new Set(marcas.map((m) => m.materialRequestId))];
  const rms = await prisma.materialRequest.findMany({
    where: {
      id: { in: rmIds },
      status: 'APPROVED',
      ...(scope ? { costCenterId: { in: scope } } : {}),
    },
    select: {
      id: true,
      requestNumber: true,
      costCenterId: true,
      costCenter: { select: { code: true, name: true } },
      requester: { select: { name: true } },
      demandSheet: true,
      items: {
        where: { id: { in: marcas.map((m) => m.materialRequestItemId) }, status: 'IN_REVIEW' },
        select: {
          id: true,
          materialId: true,
          quantity: true,
          unit: true,
          material: { select: { name: true, description: true, sinapiCode: true } },
        },
      },
    },
  });
  return rms.filter((r) => r.items.length > 0);
}

router.get('/correcoes/aguardando-aprovacao', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);
    await assertUserCanApproveMaterialRequests(req.user.id, !!req.user.isAdmin);
    const rms = await rmsComCorrecaoAguardando(req);
    const data = await Promise.all(
      rms.map(async (rm) => ({
        ...rm,
        items: await Promise.all(
          rm.items.map(async (it) => ({
            id: it.id,
            materialId: it.materialId,
            materialLabel: (await rotuloDoMaterial(it.materialId)) || it.material?.name || it.material?.description || '',
            quantity: Number(it.quantity),
            unit: it.unit,
          }))
        ),
        correcoes: await listarCorrecoesRm(rm.id),
      }))
    );
    return res.json({ success: true, data });
  } catch (error) {
    return next(error);
  }
});

router.get('/correcoes/aguardando-aprovacao/count', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);
    try {
      await assertUserCanApproveMaterialRequests(req.user.id, !!req.user.isAdmin);
    } catch {
      return res.json({ success: true, data: { count: 0 } });
    }
    const rms = await rmsComCorrecaoAguardando(req);
    return res.json({ success: true, data: { count: rms.length } });
  } catch (error) {
    return next(error);
  }
});

/** Aprovador aprova a correção: os itens saem da correção e vão para o mapa de cotação. */
router.post('/:id/correcoes/aprovar', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);
    const id = String(req.params.id || '').trim();
    const rm = await prisma.materialRequest.findUnique({ where: { id }, select: { costCenterId: true } });
    if (!rm) throw createError('Requisição não encontrada', 404);
    await assertUserCanApproveMaterialRequestForCostCenter(req.user.id, !!req.user.isAdmin, rm.costCenterId);
    const itemIds = (await itensAguardandoAprovacao([id])).map((m) => m.materialRequestItemId);
    if (itemIds.length === 0) throw createError('Nenhuma correção aguardando aprovação nesta requisição', 400);
    await prisma.materialRequestItem.updateMany({
      where: { id: { in: itemIds }, materialRequestId: id, status: 'IN_REVIEW' },
      data: { status: 'APPROVED' },
    });
    await desmarcarItensAguardandoAprovacao(itemIds);
    await prisma.materialRequestComment.create({
      data: {
        materialRequestId: id,
        userId: req.user.id,
        content: `Correção aprovada (${itemIds.length} ${itemIds.length === 1 ? 'item' : 'itens'}). Os itens voltaram ao mapa de cotação.`,
      },
    });
    return res.json({ success: true, message: 'Correção aprovada. Os itens voltaram ao mapa de cotação.' });
  } catch (error) {
    return next(error);
  }
});

/** Aprovador devolve a correção ao solicitante (os itens continuam em correção). */
router.post('/:id/correcoes/devolver', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);
    const id = String(req.params.id || '').trim();
    const note = String(req.body?.correctionNote ?? '').trim();
    if (!note) throw createError('Informe o que precisa ser alterado na correção', 400);
    const rm = await prisma.materialRequest.findUnique({ where: { id }, select: { costCenterId: true } });
    if (!rm) throw createError('Requisição não encontrada', 404);
    await assertUserCanApproveMaterialRequestForCostCenter(req.user.id, !!req.user.isAdmin, rm.costCenterId);
    const itemIds = (await itensAguardandoAprovacao([id])).map((m) => m.materialRequestItemId);
    if (itemIds.length === 0) throw createError('Nenhuma correção aguardando aprovação nesta requisição', 400);
    await desmarcarItensAguardandoAprovacao(itemIds);
    await prisma.materialRequestComment.create({
      data: { materialRequestId: id, userId: req.user.id, content: `Correção devolvida ao solicitante: ${note}` },
    });
    return res.json({ success: true, message: 'Correção devolvida ao solicitante.' });
  } catch (error) {
    return next(error);
  }
});

// Histórico de correções da RM (quem, quando, material e/ou quantidade). Só leitura.
router.get('/:id/correcoes', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);
    const rmId = String(req.params.id || '').trim();
    const logs = await listarCorrecoesRm(rmId);
    // Itens com correção já enviada ao aprovador (não podem ser corrigidos de novo até a decisão).
    const aguardandoAprovacao = (await itensAguardandoAprovacao([rmId])).map((m) => m.materialRequestItemId);
    return res.json({ success: true, data: { logs, aguardandoAprovacao } });
  } catch (error) {
    return next(error);
  }
});

// Listar requisições
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const {
      status,
      approvedBy,
      costCenterId,
      projectId,
      requestedBy,
      priority,
      page = '1',
      limit = '100',
      summary,
      includeItems
    } = req.query;

    const pageNum = Math.max(1, parseInt(String(page), 10) || 1);
    const limitNum = Math.min(Math.max(parseInt(String(limit), 10) || 100, 1), 500);
    const wantItems =
      summary === '1' ||
      summary === 'true' ||
      includeItems === '0' ||
      includeItems === 'false'
        ? false
        : true;

    // Escopo do aprovador (quando não filtra "minhas RMs"); contratos cadastrados limitam a fila.
    let gestorScope: string[] | null = null;
    if (req.user?.id && !requestedBy) {
      gestorScope = await getRmApproverListScopeCostCenterIds(
        req.user.id,
        !!req.user.isAdmin,
      );
    }
    const { scopeCostCenterIds, expandUnbLabels } = req.user?.id
      ? await getUserOcRmListCostCenterScope(req.user.id, !!req.user.isAdmin, gestorScope, {
          // Mapa de Cotação: o Comprador também vê as RMs dos contratos em que é Comprador.
          paraMapaCotacao: String(req.query.paraMapaCotacao ?? '') === '1',
        })
      : { scopeCostCenterIds: null as string[] | null, expandUnbLabels: false };

    const listFilters: Parameters<MaterialRequestService['listMaterialRequests']>[0] = {
      status: status as string,
      approvedBy: typeof approvedBy === 'string' && approvedBy.trim() ? approvedBy.trim() : undefined,
      costCenterId: costCenterId as string,
      projectId: projectId as string,
      requestedBy: requestedBy as string,
      priority: priority as string,
      page: pageNum,
      limit: limitNum,
      includeItems: wantItems,
    };

    if (scopeCostCenterIds !== null) {
      const scoped = applyUnbCostCenterScopeToIdFilter(
        scopeCostCenterIds,
        typeof costCenterId === 'string' ? costCenterId : undefined,
      );
      if (scoped.denyAll) {
        res.json({
          success: true,
          data: [],
          pagination: { page: pageNum, limit: limitNum, total: 0, totalPages: 1 },
        });
        return;
      }
      if (scoped.costCenterId) {
        listFilters.costCenterId = scoped.costCenterId;
        delete listFilters.costCenterIds;
      } else if (scoped.costCenterIds?.length) {
        listFilters.costCenterIds = scoped.costCenterIds;
        delete listFilters.costCenterId;
      }
      listFilters.alsoMatchUnbLabeledCostCenters = expandUnbLabels;
    }

    const result = await materialRequestService.listMaterialRequests(listFilters);

    res.json({
      success: true,
      data: result.requests,
      pagination: result.pagination
    });
  } catch (error) {
    next(error);
  }
});

// Criar requisição de material
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) {
      throw createError('Usuário não autenticado', 401);
    }

    const { costCenterId, projectId, serviceOrderId, serviceOrder, obra, description, priority, demandSheet, demandSheetAttachmentUrl, demandSheetAttachmentName, demandSheetAttachments, items } =
      req.body;

    if (!costCenterId || !items || !Array.isArray(items) || items.length === 0) {
      throw createError('Centro de custo e itens são obrigatórios', 400);
    }

    await assertCostCenterAllowedForOcRmUser(req.user.id, !!req.user.isAdmin, costCenterId);

    const request = await materialRequestService.createMaterialRequest({
      requestedBy: req.user.id,
      costCenterId,
      projectId,
      serviceOrderId,
      serviceOrder,
      obra,
      description,
      priority: priority || 'MEDIUM',
      demandSheet,
      demandSheetAttachmentUrl,
      demandSheetAttachmentName,
      demandSheetAttachments,
      items: items.map((item: any) => normalizeRmItemBody(item))
    });

    res.status(201).json({
      success: true,
      data: request,
      message: 'Requisição de material criada com sucesso'
    });
  } catch (error) {
    // Não engolir erros Prisma (ex.: P2002 Unique) — o errorHandler mapeia P2002 → 409.
    // O regex antigo batia em "materialRequest" na mensagem do Prisma e devolvia 400 + stack.
    const isPrisma =
      error instanceof Error &&
      (error.name === 'PrismaClientKnownRequestError' ||
        error.name === 'PrismaClientValidationError');
    if (
      !isPrisma &&
      error instanceof Error &&
      /obrigat|necessário|material|Quantidade|centro de custo|ordem de serviço|projeto|anexo|ficha de demanda|observação/i.test(
        error.message
      )
    ) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
});

// Atualizar status da requisição (antes de GET /:id para não capturar "status" como id)
router.patch('/:id/status', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);
    const { id } = req.params;
    const { status, correctionNote } = req.body;

    const existing = await prisma.materialRequest.findUnique({ where: { id } });
    if (!existing) throw createError('Requisição não encontrada', 404);

    await assertCostCenterAllowedForOcRmUser(
      req.user.id,
      !!req.user.isAdmin,
      existing.costCenterId,
      // Mapa de Cotação: o Comprador pode devolver para correção a RM dos contratos em que é Comprador.
      { paraMapaCotacao: req.body?.paraMapaCotacao === true && status === 'IN_REVIEW' },
    );

    if (status === 'IN_REVIEW') {
      // Correção: aprovador de RM ou quem tem acesso ao mapa de cotação (Compras).
      await assertUserCanSendRmToCorrection(req.user.id, req.user.isAdmin);
    } else if (status === 'CANCELLED') {
      const isCreator = existing.requestedBy === req.user.id;
      if (!isCreator && !req.user.isAdmin) {
        await assertUserCanApproveMaterialRequests(req.user.id, req.user.isAdmin);
        await assertUserCanApproveMaterialRequestForCostCenter(
          req.user.id,
          !!req.user.isAdmin,
          existing.costCenterId,
        );
      }
    } else if (isRmApproverStatusChange(status, existing.requestedBy, req.user.id)) {
      await assertUserCanApproveMaterialRequests(req.user.id, req.user.isAdmin);
      await assertUserCanApproveMaterialRequestForCostCenter(
        req.user.id,
        !!req.user.isAdmin,
        existing.costCenterId,
      );
    }

    const request = await materialRequestService.updateMaterialRequestStatus(id, {
      status,
      approvedBy: status === 'APPROVED' ? req.user.id : undefined,
      rejectedBy: status === 'CANCELLED' || status === 'REJECTED' ? req.user.id : undefined,
      rejectionReason: undefined,
      correctionNote: typeof correctionNote === 'string' ? correctionNote : undefined,
    }, req.user.id, !!req.user.isAdmin);
    const message =
      status === 'IN_REVIEW' && request?.status === 'APPROVED'
        ? 'Só os itens que estão no mapa foram para correção de quantidade. A ordem de compra não muda.'
        : 'Status atualizado';
    res.json({ success: true, data: request, message });
  } catch (error) {
    if (error instanceof Error && /Apenas |Aprove apenas|Não é possível|Sem permissão|Informe o que|Observação muito|Esta RM já tem OC/.test(error.message)) {
      const status = /Sem permissão/.test(error.message) ? 403 : 400;
      res.status(status).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
});

// Editar RM em Correção RM (solicitante) — body igual ao POST, + submitForApproval opcional
router.patch('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);
    const { id } = req.params;
    const {
      costCenterId,
      projectId,
      serviceOrderId,
      serviceOrder,
      obra,
      description,
      priority,
      demandSheet,
      demandSheetAttachmentUrl,
      demandSheetAttachmentName,
      demandSheetAttachments,
      items,
      submitForApproval,
    } = req.body;

    if (!costCenterId || !items || !Array.isArray(items) || items.length === 0) {
      throw createError('Centro de custo e itens são obrigatórios', 400);
    }

    await assertCostCenterAllowedForOcRmUser(req.user.id, !!req.user.isAdmin, costCenterId);

    const request = await materialRequestService.updateMaterialRequestInCorrection(id, req.user.id, {
      costCenterId,
      projectId,
      serviceOrderId,
      serviceOrder,
      obra,
      description,
      priority:
        priority === undefined || priority === null
          ? undefined
          : normalizeRmPriority(priority),
      items: items.map((item: any) => normalizeRmItemBody(item)),
      // Material de cada linha antes da correção (para o histórico e os itens pedidos da FD).
      correcaoLinhas: items.map((item: any) => ({
        originalMaterialId: typeof item?.originalMaterialId === 'string' ? item.originalMaterialId : undefined,
        materialLabel: typeof item?.materialLabel === 'string' ? item.materialLabel : undefined,
      })),
      demandSheet,
      demandSheetAttachmentUrl,
      demandSheetAttachmentName,
      demandSheetAttachments,
      submitForApproval: Boolean(submitForApproval)
    }, !!req.user.isAdmin);

    res.json({
      success: true,
      data: request,
      message: submitForApproval
        ? 'Requisição atualizada e reenviada para análise'
        : 'Requisição atualizada'
    });
  } catch (error) {
    if (
      error instanceof Error &&
      /Apenas o solicitante|Só é possível editar|Centro de custo|É necessário|material|Quantidade|projeto/i.test(
        error.message
      )
    ) {
      res.status(400).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
});

// Comentários da RM (antes de GET /:id)
router.get('/:id/comments', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);
    const { id } = req.params;
    const request = await materialRequestService.getMaterialRequestById(id);
    if (!request) throw createError('Requisição não encontrada', 404);
    await assertCostCenterAllowedForOcRmUser(req.user.id, !!req.user.isAdmin, request.costCenterId);
    const comments = await materialRequestService.listComments(id);
    res.json({ success: true, data: comments });
  } catch (error) {
    if (error instanceof Error && /não encontrada/i.test(error.message)) {
      res.status(404).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
});

router.post('/:id/comments', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);
    const { id } = req.params;
    const content = typeof req.body?.content === 'string' ? req.body.content : '';
    const request = await materialRequestService.getMaterialRequestById(id);
    if (!request) throw createError('Requisição não encontrada', 404);
    await assertCostCenterAllowedForOcRmUser(req.user.id, !!req.user.isAdmin, request.costCenterId);
    const comment = await materialRequestService.createComment(id, req.user.id, content);
    res.status(201).json({ success: true, data: comment });
  } catch (error) {
    if (
      error instanceof Error &&
      /não encontrada|Escreva um comentário|muito longo/i.test(error.message)
    ) {
      const status = /não encontrada/i.test(error.message) ? 404 : 400;
      res.status(status).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
});

router.delete('/comments/:commentId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);
    await materialRequestService.deleteComment(
      req.params.commentId,
      req.user.id,
      !!req.user.isAdmin
    );
    res.json({ success: true, message: 'Comentário excluído' });
  } catch (error) {
    if (error instanceof Error && /não encontrado|Sem permissão/i.test(error.message)) {
      const status = /Sem permissão/i.test(error.message) ? 403 : 404;
      res.status(status).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
});

// Obter requisição por ID
router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const request = await materialRequestService.getMaterialRequestById(id);

    if (!request) {
      throw createError('Requisição não encontrada', 404);
    }

    if (req.user?.id) {
      await assertCostCenterAllowedForOcRmUser(
        req.user.id,
        !!req.user.isAdmin,
        request.costCenterId,
        // Mapa de Cotação: o Comprador também abre a RM dos contratos em que é Comprador.
        { paraMapaCotacao: String(req.query.paraMapaCotacao ?? '') === '1' },
      );
    }

    res.json({
      success: true,
      data: request
    });
  } catch (error) {
    next(error);
  }
});

/** ADM ou solicitante: troca anexos da ficha de demanda (lista completa). */
router.patch(
  '/:id/admin/demand-sheet-attachments',
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.id) throw createError('Usuário não autenticado', 401);
      const { id } = req.params;
      const existing = await prisma.materialRequest.findUnique({
        where: { id },
        select: { id: true, requestedBy: true, costCenterId: true },
      });
      if (!existing) throw createError('Requisição não encontrada', 404);

      const isOwner = existing.requestedBy === req.user.id;
      if (!req.user.isAdmin && !isOwner) {
        throw createError('Sem permissão para alterar anexos da ficha de demanda', 403);
      }

      await assertCostCenterAllowedForOcRmUser(
        req.user.id,
        !!req.user.isAdmin,
        existing.costCenterId
      );

      const raw = req.body?.attachments;
      if (!Array.isArray(raw)) {
        throw createError('Informe a lista de anexos', 400);
      }
      const attachments = raw.map((file: { url?: unknown; name?: unknown }) => ({
        url: String(file?.url || '').trim(),
        name: String(file?.name || '').trim() || 'Arquivo anexado',
      }));
      const request = await materialRequestService.adminReplaceDemandSheetAttachments(
        id,
        attachments
      );
      res.json({ success: true, data: request, message: 'Anexos atualizados' });
    } catch (error) {
      if (error instanceof Error && /não encontrada/i.test(error.message)) {
        res.status(404).json({ success: false, message: error.message });
        return;
      }
      next(error);
    }
  }
);

/** Administrador: troca o anexo de um item da RM. */
router.patch(
  '/:id/items/:itemId/admin/attachment',
  requireAdministrator,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { id, itemId } = req.params;
      const urlRaw = req.body?.url;
      const nameRaw = req.body?.name;
      const url =
        urlRaw === null || urlRaw === undefined || String(urlRaw).trim() === ''
          ? null
          : String(urlRaw).trim();
      const request = await materialRequestService.adminReplaceItemAttachment(id, itemId, {
        url,
        name: nameRaw === null || nameRaw === undefined ? null : String(nameRaw),
      });
      res.json({ success: true, data: request, message: 'Anexo do item atualizado' });
    } catch (error) {
      if (error instanceof Error && /não encontrado/i.test(error.message)) {
        res.status(404).json({ success: false, message: error.message });
        return;
      }
      next(error);
    }
  }
);

/** Solicitante corrige a quantidade de um item fora da OC e devolve ao mapa. */
router.patch('/:id/items/:itemId/correct-quantity', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);
    const { id, itemId } = req.params;
    const quantity = Number(req.body?.quantity);
    // Opcional: troca de material na correção do item.
    const materialId = typeof req.body?.materialId === 'string' ? req.body.materialId : undefined;
    const materialLabel = typeof req.body?.materialLabel === 'string' ? req.body.materialLabel : undefined;
    const request = await materialRequestService.correctOpenItemQuantity(
      id,
      itemId,
      quantity,
      req.user.id,
      !!req.user.isAdmin,
      { materialId, materialLabel }
    );
    res.json({
      success: true,
      data: request,
      message: 'Correção salva. O item voltou ao mapa de cotação.',
    });
  } catch (error) {
    if (error instanceof Error && /não encontrad|Não é possível|Quantidade|Apenas o solicitante|não está|Material/.test(error.message)) {
      const status = /Apenas o solicitante/.test(error.message) ? 403 : 400;
      res.status(status).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
});

/**
 * Correção de vários itens de uma vez (botão "Salvar e reenviar"): cada item em correção recebe
 * a quantidade e, opcionalmente, o material novo; todos voltam ao mapa de cotação.
 */
router.patch('/:id/items/correct-batch', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);
    const { id } = req.params;
    const lista = Array.isArray(req.body?.items) ? req.body.items : [];
    if (lista.length === 0) throw createError('Nenhum item para corrigir', 400);
    // Confere todas as quantidades antes de gravar qualquer item.
    for (const it of lista) {
      const q = Number(it?.quantity);
      if (!it?.itemId || !Number.isFinite(q) || q <= 0) {
        throw createError('Quantidade deve ser maior que zero em todos os itens', 400);
      }
    }
    let request: unknown = null;
    for (const it of lista) {
      request = await materialRequestService.correctOpenItemQuantity(
        id,
        String(it.itemId),
        Number(it.quantity),
        req.user.id,
        !!req.user.isAdmin,
        {
          materialId: typeof it.materialId === 'string' ? it.materialId : undefined,
          materialLabel: typeof it.materialLabel === 'string' ? it.materialLabel : undefined,
        }
      );
    }
    res.json({
      success: true,
      data: request,
      message: 'Correção enviada para aprovação.',
    });
  } catch (error) {
    if (error instanceof Error && /não encontrad|Não é possível|Quantidade|Apenas o solicitante|não está|Material|Nenhum item/.test(error.message)) {
      const status = /Apenas o solicitante/.test(error.message) ? 403 : 400;
      res.status(status).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
});

/** Cancela um item da RM que ainda não está em OC ativa. */
router.patch('/:id/items/:itemId/cancel', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) throw createError('Usuário não autenticado', 401);
    const { id, itemId } = req.params;

    const existing = await prisma.materialRequest.findUnique({ where: { id } });
    if (!existing) throw createError('Requisição não encontrada', 404);

    await assertCostCenterAllowedForOcRmUser(
      req.user.id,
      !!req.user.isAdmin,
      existing.costCenterId,
    );

    const request = await materialRequestService.cancelMaterialRequestItem(
      id,
      itemId,
      req.user.id,
      !!req.user.isAdmin
    );
    res.json({ success: true, data: request, message: 'Item cancelado' });
  } catch (error) {
    if (error instanceof Error && /não encontrad|Não é possível|já está|Sem permissão/.test(error.message)) {
      const status = /Sem permissão/.test(error.message) ? 403 : 400;
      res.status(status).json({ success: false, message: error.message });
      return;
    }
    next(error);
  }
});

export default router;
