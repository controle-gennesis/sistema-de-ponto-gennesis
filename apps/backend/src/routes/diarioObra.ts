import { Router, Response, NextFunction } from 'express';
import { pathToModuleKey } from '@sistema-ponto/permission-modules';
import { prisma } from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { requireModuleAccess } from '../middleware/permissionAuth';
import { createError } from '../middleware/errorHandler';
import { getLiberadoContractAccessForUser } from '../lib/contractAccess';
import { uploadPhoto, handleUploadError } from '../middleware/upload';
import { savePersistentUpload, deletePersistentUpload } from '../lib/persistentUpload';

const router = Router();
router.use(authenticate);
router.use(requireModuleAccess(pathToModuleKey('/ponto/diario-obra')));

/**
 * Escopo por contrato: só obras de contratos Liberados para o usuário (administradores veem tudo).
 * Vale para toda rota que recebe `:obraId`.
 */
async function assertObraInScope(req: AuthRequest, obraId: string) {
  if (!req.user) throw createError('Usuário não autenticado', 401);
  const access = await getLiberadoContractAccessForUser(req.user.id, req.user.isAdmin);
  if (access.filter === 'all') return;
  const obra = await prisma.obra.findUnique({ where: { id: obraId }, select: { contratoId: true } });
  if (!obra) throw createError('Obra não encontrada', 404);
  if (access.filter === 'none' || !access.ids.includes(obra.contratoId)) {
    throw createError('Sem permissão para este contrato', 403);
  }
}

router.param('obraId', (req, _res, next, obraId) => {
  assertObraInScope(req as AuthRequest, String(obraId)).then(() => next(), next);
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

const str = (v: unknown, max = 2000) => String(v ?? '').trim().slice(0, max);
const num = (v: unknown) => {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const list = (v: unknown, cap = 200): any[] => (Array.isArray(v) ? v.slice(0, cap) : []);
const sky = (v: unknown) => (['SUN', 'PARTLY', 'RAIN'].includes(String(v)) ? String(v) : null);
const practicable = (v: unknown) => (v === true || v === false ? v : null);

/** Normaliza o corpo recebido: só guarda os campos conhecidos, com tamanho limitado. */
function normalizeContent(body: any) {
  const w = body?.weather ?? {};
  const period = (p: any) => ({ sky: sky(p?.sky), practicable: practicable(p?.practicable) });
  const labor = (rows: unknown) =>
    list(rows).map((r: any) => ({
      id: str(r?.id, 40),
      role: str(r?.role, 200),
      quantity: num(r?.quantity),
      hours: num(r?.hours),
      notes: str(r?.notes),
    }));
  return {
    noActivityNote: str(body?.noActivityNote),
    weather: { morning: period(w.morning), afternoon: period(w.afternoon) },
    activities: list(body?.activities).map((a: any) => ({
      id: str(a?.id, 40),
      title: str(a?.title, 300),
      description: str(a?.description),
      start: str(a?.start, 5),
      end: str(a?.end, 5),
      photos: list(a?.photos, 30).map((p: any) => ({
        url: str(p?.url, 500),
        key: str(p?.key, 500),
        name: str(p?.name, 200),
      })).filter((p: { url: string }) => !!p.url),
    })),
    labor: { direct: labor(body?.labor?.direct), indirect: labor(body?.labor?.indirect) },
    equipment: list(body?.equipment).map((e: any) => ({
      id: str(e?.id, 40),
      name: str(e?.name, 200),
      quantity: num(e?.quantity),
      hours: num(e?.hours),
      notes: str(e?.notes),
    })),
    materials: list(body?.materials).map((m: any) => ({
      id: str(m?.id, 40),
      name: str(m?.name, 200),
      quantity: num(m?.quantity),
      unit: str(m?.unit, 20) === 'unidade' ? 'un' : str(m?.unit, 20) || 'un',
      notes: str(m?.notes),
    })),
    occurrences: list(body?.occurrences).map((o: any) => ({
      id: str(o?.id, 40),
      description: str(o?.description),
      severity: ['LOW', 'MEDIUM', 'HIGH'].includes(String(o?.severity)) ? String(o.severity) : 'LOW',
      start: str(o?.start, 5),
      end: str(o?.end, 5),
      actions: str(o?.actions),
    })),
    notes: list(body?.notes).map((n: any) => ({ id: str(n?.id, 40), text: str(n?.text) })),
  };
}

async function assertObra(obraId: string) {
  const obra = await prisma.obra.findUnique({ where: { id: obraId }, select: { id: true } });
  if (!obra) throw createError('Obra não encontrada', 404);
}

/** Lista de diários (um por obra/dia), com filtros por contrato, obra, período e busca. */
router.get('/', async (req: AuthRequest, res, next) => {
  try {
    if (!req.user) throw createError('Usuário não autenticado', 401);
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const contratoId = str(req.query.contratoId, 40);
    const obraId = str(req.query.obraId, 40);
    const from = str(req.query.from, 10);
    const to = str(req.query.to, 10);
    const search = str(req.query.search, 100);

    const dateFilter: Record<string, string> = {};
    if (DATE_RE.test(from)) dateFilter.gte = from;
    if (DATE_RE.test(to)) dateFilter.lte = to;

    // Só diários de obras de contratos Liberados (administradores veem tudo).
    const access = await getLiberadoContractAccessForUser(req.user.id, req.user.isAdmin);
    const allowedIds = access.filter === 'ids' ? access.ids : null;
    if (access.filter === 'none' || (contratoId && allowedIds && !allowedIds.includes(contratoId))) {
      res.json({ success: true, data: [], pagination: { page, limit, total: 0, totalPages: 1 } });
      return;
    }
    const contratoFilter = contratoId
      ? { contratoId }
      : allowedIds
        ? { contratoId: { in: allowedIds } }
        : {};

    const where: any = {
      ...(obraId ? { obraId } : {}),
      ...(Object.keys(dateFilter).length ? { date: dateFilter } : {}),
      ...(Object.keys(contratoFilter).length || search
        ? {
            obra: {
              ...contratoFilter,
              ...(search
                ? {
                    OR: [
                      { name: { contains: search, mode: 'insensitive' } },
                      { contrato: { name: { contains: search, mode: 'insensitive' } } },
                      { contrato: { number: { contains: search, mode: 'insensitive' } } },
                    ],
                  }
                : {}),
            },
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      prisma.diarioObra.count({ where }),
      prisma.diarioObra.findMany({
        where,
        orderBy: [{ date: 'desc' }, { updatedAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: { obra: { select: { id: true, name: true, contrato: { select: { id: true, name: true, number: true } } } } },
      }),
    ]);

    const userIds = [...new Set(rows.map((r) => r.updatedById).filter((v): v is string => !!v))];
    const users = userIds.length
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
      : [];
    const userName = new Map(users.map((u) => [u.id, u.name]));

    const count = (v: unknown) => (Array.isArray(v) ? v.length : 0);
    const data = rows.map((r) => {
      const c: any = r.content ?? {};
      return {
        id: r.id,
        date: r.date,
        obraId: r.obraId,
        obraName: r.obra?.name ?? '',
        contratoId: r.obra?.contrato?.id ?? '',
        contratoName: r.obra?.contrato?.name ?? '',
        contratoNumber: r.obra?.contrato?.number ?? '',
        noActivity: r.noActivity,
        noActivityReason: r.noActivityReason,
        finalizedAt: r.finalizedAt,
        activities: count(c.activities),
        workers: count(c.labor?.direct) + count(c.labor?.indirect),
        occurrences: count(c.occurrences),
        updatedAt: r.updatedAt,
        updatedByName: r.updatedById ? userName.get(r.updatedById) ?? '' : '',
      };
    });

    res.json({
      success: true,
      data,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (e) {
    next(e);
  }
});

/** Dias do mês que já têm RDO: alimenta o calendário. */
router.get('/:obraId/month/:month', async (req, res, next) => {
  try {
    const { obraId, month } = req.params;
    if (!MONTH_RE.test(month)) throw createError('Mês inválido', 400);
    const rows = await prisma.diarioObra.findMany({
      where: { obraId, date: { startsWith: `${month}-` } },
      select: { date: true, noActivity: true, finalizedAt: true },
    });
    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
});

router.get('/:obraId/:date', async (req, res, next) => {
  try {
    const { obraId, date } = req.params;
    if (!DATE_RE.test(date)) throw createError('Data inválida', 400);
    const row = await prisma.diarioObra.findUnique({ where: { obraId_date: { obraId, date } } });
    res.json({ success: true, data: row });
  } catch (e) {
    next(e);
  }
});

router.put('/:obraId/:date', async (req: AuthRequest, res, next) => {
  try {
    const { obraId, date } = req.params;
    if (!DATE_RE.test(date)) throw createError('Data inválida', 400);
    await assertObra(obraId);
    const current = await prisma.diarioObra.findUnique({
      where: { obraId_date: { obraId, date } },
      select: { finalizedAt: true },
    });
    if (current?.finalizedAt) throw createError('RDO finalizado: reabra para editar', 409);
    const noActivity = req.body?.noActivity === true;
    const data = {
      noActivity,
      noActivityReason: noActivity ? str(req.body?.noActivityReason) || null : null,
      content: normalizeContent(req.body),
      updatedById: req.user?.id ?? null,
    };
    const row = await prisma.diarioObra.upsert({
      where: { obraId_date: { obraId, date } },
      create: { obraId, date, ...data, createdById: req.user?.id ?? null },
      update: data,
    });
    res.json({ success: true, data: row });
  } catch (e) {
    next(e);
  }
});

/** Finaliza o RDO: depois disso ele só pode ser alterado se for reaberto. */
router.post('/:obraId/:date/finalize', async (req: AuthRequest, res, next) => {
  try {
    const { obraId, date } = req.params;
    if (!DATE_RE.test(date)) throw createError('Data inválida', 400);
    const row = await prisma.diarioObra.findUnique({ where: { obraId_date: { obraId, date } } });
    if (!row) throw createError('RDO não encontrado', 404);
    const updated = await prisma.diarioObra.update({
      where: { id: row.id },
      data: { finalizedAt: row.finalizedAt ?? new Date(), finalizedById: row.finalizedById ?? req.user?.id ?? null },
    });
    res.json({ success: true, data: updated });
  } catch (e) {
    next(e);
  }
});

router.post('/:obraId/:date/reopen', async (req, res, next) => {
  try {
    const { obraId, date } = req.params;
    if (!DATE_RE.test(date)) throw createError('Data inválida', 400);
    const row = await prisma.diarioObra.findUnique({ where: { obraId_date: { obraId, date } } });
    if (!row) throw createError('RDO não encontrado', 404);
    const updated = await prisma.diarioObra.update({
      where: { id: row.id },
      data: { finalizedAt: null, finalizedById: null },
    });
    res.json({ success: true, data: updated });
  } catch (e) {
    next(e);
  }
});

/** Envia uma foto de atividade: guarda o arquivo e devolve o endereço para ficar na atividade. */
router.post(
  '/:obraId/:date/photos',
  uploadPhoto.single('file'),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { obraId, date } = req.params;
      if (!DATE_RE.test(date)) throw createError('Data inválida', 400);
      if (!req.file?.buffer) throw createError('Selecione uma foto', 400);
      const row = await prisma.diarioObra.findUnique({
        where: { obraId_date: { obraId, date } },
        select: { finalizedAt: true },
      });
      if (row?.finalizedAt) throw createError('RDO finalizado: reabra para editar', 409);
      const saved = await savePersistentUpload({
        folder: `diario-obra/${obraId}/${date}`,
        buffer: req.file.buffer,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        fileNamePrefix: 'foto-',
      });
      res.json({ success: true, data: { url: saved.url, key: saved.key, name: saved.originalName } });
    } catch (e) {
      next(e);
    }
  },
  handleUploadError,
);

/** Remove o arquivo de uma foto (só de dentro da pasta deste RDO). */
router.delete('/:obraId/:date/photos', async (req, res, next) => {
  try {
    const { obraId, date } = req.params;
    if (!DATE_RE.test(date)) throw createError('Data inválida', 400);
    const key = str(req.body?.key, 500);
    if (!key.startsWith(`diario-obra/${obraId}/`)) throw createError('Foto inválida', 400);
    const row = await prisma.diarioObra.findUnique({
      where: { obraId_date: { obraId, date } },
      select: { finalizedAt: true },
    });
    if (row?.finalizedAt) throw createError('RDO finalizado: reabra para editar', 409);
    await deletePersistentUpload(key);
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

router.delete('/:obraId/:date', async (req, res, next) => {
  try {
    const { obraId, date } = req.params;
    if (!DATE_RE.test(date)) throw createError('Data inválida', 400);
    // Apaga também os arquivos das fotos das atividades (sem travar a exclusão se algum falhar).
    const existing = await prisma.diarioObra.findUnique({ where: { obraId_date: { obraId, date } }, select: { content: true } });
    const acts: any[] = Array.isArray((existing?.content as any)?.activities) ? (existing!.content as any).activities : [];
    for (const a of acts) {
      for (const p of Array.isArray(a?.photos) ? a.photos : []) {
        if (typeof p?.key === 'string' && p.key.startsWith(`diario-obra/${obraId}/`)) {
          await deletePersistentUpload(p.key).catch(() => undefined);
        }
      }
    }
    await prisma.diarioObra.deleteMany({ where: { obraId, date } });
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

export default router;
