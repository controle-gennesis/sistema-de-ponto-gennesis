import { randomUUID } from 'crypto';
import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { authenticate, requireAdministrator, type AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

const router = Router();

router.use(authenticate);

/** Dias de uso (desde o cadastro) antes de a Gennecy perguntar pela primeira vez. */
const DIAS_ANTES_DA_PRIMEIRA_PERGUNTA = 3;
/** Depois de responder ou dispensar, só volta a perguntar depois deste prazo. */
const DIAS_ENTRE_PERGUNTAS = 90;

/** A Gennecy deve aparecer para esta pessoa agora? */
router.get('/status', async (req: AuthRequest, res, next) => {
  try {
    // Administradores não são convidados a avaliar (o preview com ?gennecy=1 continua funcionando).
    if (req.user!.isAdmin) return res.json({ success: true, data: { show: false } });
    const userId = req.user!.id;
    const rows = await prisma.$queryRaw<Array<{ criado: Date; ultimo: Date | null }>>`
      SELECT u."createdAt" AS criado,
             (SELECT MAX(f."createdAt") FROM "app_feedback" f WHERE f."userId" = u."id") AS ultimo
      FROM "users" u
      WHERE u."id" = ${userId}
    `;
    const row = rows[0];
    if (!row) return res.json({ success: true, data: { show: false } });

    const diaMs = 24 * 60 * 60 * 1000;
    const usoDias = (Date.now() - new Date(row.criado).getTime()) / diaMs;
    const desdeUltimoDias = row.ultimo
      ? (Date.now() - new Date(row.ultimo).getTime()) / diaMs
      : Infinity;

    const show =
      usoDias >= DIAS_ANTES_DA_PRIMEIRA_PERGUNTA && desdeUltimoDias >= DIAS_ENTRE_PERGUNTAS;
    return res.json({ success: true, data: { show } });
  } catch (error) {
    return next(error);
  }
});

/** Guarda a avaliação (nota de 1 a 5 e comentário opcional). */
router.post('/', async (req: AuthRequest, res, next) => {
  try {
    const rating = Number(req.body?.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Nota inválida (use de 1 a 5)' });
    }
    const comment =
      typeof req.body?.comment === 'string' ? req.body.comment.trim().slice(0, 1000) : '';
    const page = typeof req.body?.page === 'string' ? req.body.page.trim().slice(0, 200) : '';
    const likes = Array.isArray(req.body?.likes)
      ? (req.body.likes as unknown[])
          .filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
          .map((x) => x.trim().slice(0, 60))
          .slice(0, 12)
          .join(', ')
      : '';
    await prisma.$executeRaw`
      INSERT INTO "app_feedback" ("id", "userId", "rating", "likes", "comment", "page", "dismissed")
      VALUES (${randomUUID()}, ${req.user!.id}, ${rating}, ${likes || null}, ${comment || null}, ${page || null}, false)
    `;
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

/** A pessoa fechou o balão sem avaliar: só volta a perguntar depois do prazo. */
router.post('/dismiss', async (req: AuthRequest, res, next) => {
  try {
    await prisma.$executeRaw`
      INSERT INTO "app_feedback" ("id", "userId", "dismissed")
      VALUES (${randomUUID()}, ${req.user!.id}, true)
    `;
    return res.json({ success: true });
  } catch (error) {
    return next(error);
  }
});

/** Avaliações para o administrador: resumo do período e a lista de respostas com o nome de quem avaliou. */
router.get('/admin', requireAdministrator, async (req: AuthRequest, res, next) => {
  try {
    const inicio = typeof req.query.from === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from) ? req.query.from : '';
    const fim = typeof req.query.to === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to) ? req.query.to : '';
    const nota = Number(req.query.rating);
    const filtraNota = Number.isInteger(nota) && nota >= 1 && nota <= 5;

    const condicoes: Prisma.Sql[] = [];
    if (inicio) condicoes.push(Prisma.sql`f."createdAt" >= ${inicio}::date`);
    if (fim) condicoes.push(Prisma.sql`f."createdAt" < (${fim}::date + INTERVAL '1 day')`);
    const where = condicoes.length ? Prisma.sql`WHERE ${Prisma.join(condicoes, ' AND ')}` : Prisma.empty;

    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        userId: string;
        userName: string | null;
        userEmail: string | null;
        rating: number | null;
        likes: string | null;
        comment: string | null;
        page: string | null;
        dismissed: boolean;
        createdAt: Date;
      }>
    >`
      SELECT f."id", f."userId", u."name" AS "userName", u."email" AS "userEmail",
             f."rating", f."likes", f."comment", f."page", f."dismissed", f."createdAt"
      FROM "app_feedback" f
      LEFT JOIN "users" u ON u."id" = f."userId"
      ${where}
      ORDER BY f."createdAt" DESC
      LIMIT 2000
    `;

    const respostas = rows.filter((r) => !r.dismissed && r.rating != null);
    const distribuicao: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0 };
    const curtidas = new Map<string, number>();
    let soma = 0;
    for (const r of respostas) {
      distribuicao[String(r.rating)] += 1;
      soma += r.rating as number;
      for (const item of (r.likes ?? '').split(',').map((x) => x.trim()).filter(Boolean)) {
        curtidas.set(item, (curtidas.get(item) ?? 0) + 1);
      }
    }

    const itens = respostas
      .filter((r) => !filtraNota || r.rating === nota)
      .map((r) => ({
        id: r.id,
        userName: r.userName || 'Usuário removido',
        userEmail: r.userEmail || '',
        rating: r.rating as number,
        likes: (r.likes ?? '').split(',').map((x) => x.trim()).filter(Boolean),
        comment: r.comment || '',
        page: r.page || '',
        createdAt: r.createdAt,
      }));

    return res.json({
      success: true,
      data: {
        resumo: {
          respostas: respostas.length,
          dispensas: rows.length - respostas.length,
          media: respostas.length ? Math.round((soma / respostas.length) * 100) / 100 : null,
          distribuicao,
          curtidas: [...curtidas.entries()]
            .map(([item, total]) => ({ item, total }))
            .sort((a, b) => b.total - a.total),
        },
        itens,
      },
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
