import express from 'express';
import { authenticate, requireAdministrator, AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { ensureFluigRequestLogTable } from '../lib/ensureFluigDatasetMirrorSchema';
import { comOrigemFluig, type OrigemChamadaFluig } from '../lib/fluigRequestLog';
import { createError } from '../middleware/errorHandler';
import {
  addFluigApproverViewer,
  listAllFluigApproverViewerKeys,
  listFluigApproverFullAccessUserIds,
  listFluigApproverViewers,
  normalizeFluigApproverNameKey,
  removeFluigApproverViewer,
  userCanManageFluigApproverViewers,
} from '../lib/fluigApproverAccess';
import {
  getAvailableDatasets,
  getDatasetStructure,
  getDatasetData,
  syncDatasetMirror,
  searchDataset,
  getDocumentsMeta,
  downloadDocument,
} from '../controllers/FluigController';

const router = express.Router();

router.use(authenticate);

/** Marca de onde vem cada chamada ao Fluig feita durante a requisição (para o registro de chamadas). */
router.use((req: AuthRequest, _res, next) => {
  const caminho = req.path;
  let origem: OrigemChamadaFluig = 'consulta_usuario';
  if (/\/mirror\/sync$/.test(caminho)) origem = 'atualizacao_manual';
  else if (caminho === '/documents/meta') origem = 'abrir_solicitacao';
  else if (/^\/documents\/[^/]+\/file$/.test(caminho)) {
    origem = String(req.query.disposition || '').toLowerCase() === 'inline' ? 'ver_anexo' : 'download_anexo';
  }
  comOrigemFluig({ origem, detalhe: `${req.method} ${caminho}`, userId: req.user?.id }, () => next());
});

async function requireFluigApproverViewerManager(req: AuthRequest, res: express.Response, next: express.NextFunction) {
  if (!req.user) {
    return next(createError('Usuário não autenticado', 401));
  }
  const allowed = await userCanManageFluigApproverViewers(req.user.id, req.user.isAdmin);
  if (!allowed) {
    return next(createError('Sem permissão para gerenciar acessos de aprovadores', 403));
  }
  return next();
}

router.get('/datasets', getAvailableDatasets);
router.get('/datasets/:datasetId/structure', getDatasetStructure);
router.post('/datasets/:datasetId/data', getDatasetData);
router.post('/datasets/:datasetId/mirror/sync', syncDatasetMirror);
router.post('/datasets/:datasetId/search', searchDataset);
router.post('/documents/meta', getDocumentsMeta);
router.get('/documents/:documentId/file', downloadDocument);

/** Resumo das chamadas ao Fluig no período (administrador): total, por origem, por tipo e por dia. */
router.get('/request-logs/summary', requireAdministrator, async (req, res, next) => {
  try {
    await ensureFluigRequestLogTable(prisma);
    const dias = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000);
    const where = { createdAt: { gte: desde } };
    const [total, comErro, porOrigem, porTipo, porDia] = await Promise.all([
      prisma.fluigRequestLog.count({ where }),
      prisma.fluigRequestLog.count({ where: { ...where, ok: false } }),
      prisma.fluigRequestLog.groupBy({ by: ['origem'], where, _count: { _all: true }, orderBy: { _count: { origem: 'desc' } } }),
      prisma.fluigRequestLog.groupBy({ by: ['tipo'], where, _count: { _all: true }, orderBy: { _count: { tipo: 'desc' } } }),
      prisma.$queryRaw<Array<{ dia: string; origem: string; total: number }>>`
        SELECT to_char(("createdAt" AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYY-MM-DD') AS dia,
               "origem", count(*)::int AS total
        FROM "fluig_request_logs"
        WHERE "createdAt" >= ${desde}
        GROUP BY 1, 2
        ORDER BY 1 DESC, 3 DESC
      `,
    ]);
    return res.json({
      success: true,
      data: {
        dias,
        total,
        comErro,
        porOrigem: porOrigem.map((r) => ({ origem: r.origem, total: r._count._all })),
        porTipo: porTipo.map((r) => ({ tipo: r.tipo, total: r._count._all })),
        porDia,
      },
    });
  } catch (error) {
    return next(error);
  }
});

/** Últimas chamadas registradas (administrador). */
router.get('/request-logs', requireAdministrator, async (req, res, next) => {
  try {
    await ensureFluigRequestLogTable(prisma);
    const limite = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const origem = typeof req.query.origem === 'string' && req.query.origem ? req.query.origem : undefined;
    const itens = await prisma.fluigRequestLog.findMany({
      where: origem ? { origem } : undefined,
      orderBy: { createdAt: 'desc' },
      take: limite,
    });
    return res.json({ success: true, data: itens });
  } catch (error) {
    return next(error);
  }
});

router.get('/aprovadores/viewers', requireFluigApproverViewerManager, async (_req, res, next) => {
  try {
    const [viewersByApprover, fullAccessUserIds] = await Promise.all([
      listAllFluigApproverViewerKeys(),
      listFluigApproverFullAccessUserIds(),
    ]);
    return res.json({
      success: true,
      data: viewersByApprover,
      fullAccessUserIds: Array.from(fullAccessUserIds),
    });
  } catch (error) {
    return next(error);
  }
});

router.get('/aprovadores/:nameKey/viewers', requireFluigApproverViewerManager, async (req, res, next) => {
  try {
    const nameKey = normalizeFluigApproverNameKey(String(req.params.nameKey || ''));
    if (!nameKey) {
      throw createError('Aprovador inválido', 400);
    }
    const viewers = await listFluigApproverViewers(nameKey);
    return res.json({ success: true, data: viewers });
  } catch (error) {
    return next(error);
  }
});

router.post('/aprovadores/:nameKey/viewers', requireFluigApproverViewerManager, async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) throw createError('Usuário não autenticado', 401);

    const nameKey = normalizeFluigApproverNameKey(String(req.params.nameKey || ''));
    const userId = String(req.body?.userId || '').trim();
    const approverName = String(req.body?.approverName || '').trim();

    if (!nameKey || !userId) {
      throw createError('Aprovador e usuário são obrigatórios', 400);
    }

    const fullAccessIds = await listFluigApproverFullAccessUserIds();
    if (fullAccessIds.has(userId)) {
      throw createError('Esta pessoa já tem acesso total aos aprovadores', 400);
    }

    const viewer = await addFluigApproverViewer({
      approverNameKey: nameKey,
      approverName,
      userId,
      updatedBy: req.user.id,
    });

    return res.status(201).json({ success: true, data: viewer });
  } catch (error) {
    return next(error);
  }
});

router.delete('/aprovadores/:nameKey/viewers/:userId', requireFluigApproverViewerManager, async (req, res, next) => {
  try {
    const nameKey = normalizeFluigApproverNameKey(String(req.params.nameKey || ''));
    const userId = String(req.params.userId || '').trim();

    if (!nameKey || !userId) {
      throw createError('Aprovador e usuário são obrigatórios', 400);
    }

    await removeFluigApproverViewer(nameKey, userId);
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

export default router;
