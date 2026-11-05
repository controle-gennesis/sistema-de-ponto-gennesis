import { Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { userCanAccessGastosOperacionais } from '../lib/contractAccess';

const CAMPOS_VALOR = ['faturamento', 'liquido', 'recebido', 'tetoOrcamentario', 'gastos'] as const;
type CampoValor = (typeof CAMPOS_VALOR)[number];

type Linha = {
  id: string;
  contrato: string;
  ano: number;
  mes: number;
  nome: string;
  faturamento: Prisma.Decimal | null;
  liquido: Prisma.Decimal | null;
  recebido: Prisma.Decimal | null;
  tetoOrcamentario: Prisma.Decimal | null;
  gastos: Prisma.Decimal | null;
};

function serializar(row: Linha) {
  const num = (v: Prisma.Decimal | null) => (v == null ? null : Number(v));
  return {
    id: row.id,
    contrato: row.contrato,
    ano: row.ano,
    mes: row.mes,
    nome: row.nome,
    faturamento: num(row.faturamento),
    liquido: num(row.liquido),
    recebido: num(row.recebido),
    tetoOrcamentario: num(row.tetoOrcamentario),
    gastos: num(row.gastos),
  };
}

/** Aceita 1234.5, "1.234,50" e vazio (= sem valor). */
function parseValor(raw: unknown, rotulo: string): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) throw createError(`${rotulo} inválido`, 400);
    return Math.round(raw * 100) / 100;
  }
  const texto = String(raw).trim().replace(/[R$\s]/g, '');
  if (!texto) return null;
  const n = texto.includes(',') ? parseFloat(texto.replace(/\./g, '').replace(',', '.')) : parseFloat(texto);
  if (!Number.isFinite(n)) throw createError(`${rotulo} inválido`, 400);
  return Math.round(n * 100) / 100;
}

function lerCampos(body: Record<string, unknown>, parcial: boolean) {
  const data: Partial<Record<CampoValor, number | null>> = {};
  const rotulos: Record<CampoValor, string> = {
    faturamento: 'Faturamento',
    liquido: 'Líquido',
    recebido: 'Recebido',
    tetoOrcamentario: 'Teto orçamentário',
    gastos: 'Gastos',
  };
  for (const campo of CAMPOS_VALOR) {
    if (parcial && body[campo] === undefined) continue;
    data[campo] = parseValor(body[campo], rotulos[campo]);
  }
  return data;
}

async function assertAcesso(req: AuthRequest) {
  if (!req.user) throw createError('Não autenticado', 401);
  const ok = await userCanAccessGastosOperacionais(req.user.id, req.user.isAdmin);
  if (!ok) throw createError('Sem permissão para acessar contratos sócios', 403);
}

export class ContratoSocioSubitemController {
  /** Lista as linhas de detalhe. Filtros opcionais: contrato, ano, mes. */
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await assertAcesso(req);
      const ano = req.query.ano ? Number(req.query.ano) : undefined;
      const mes = req.query.mes ? Number(req.query.mes) : undefined;
      const rows = await prisma.contratoSocioSubitem.findMany({
        where: {
          ...(ano ? { ano } : {}),
          ...(mes ? { mes } : {}),
        },
        orderBy: [{ contrato: 'asc' }, { ano: 'asc' }, { mes: 'asc' }, { createdAt: 'asc' }],
      });
      res.json({ success: true, data: rows.map((r) => serializar(r as Linha)) });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await assertAcesso(req);
      const contrato = String(req.body?.contrato ?? '').trim();
      const nome = String(req.body?.nome ?? '').trim();
      const ano = Number(req.body?.ano);
      const mes = Number(req.body?.mes);
      if (!contrato) throw createError('Informe o contrato', 400);
      if (!nome) throw createError('Informe o nome (ex.: o prédio)', 400);
      if (!Number.isInteger(ano) || ano < 2000 || ano > 2100) throw createError('Ano inválido', 400);
      if (!Number.isInteger(mes) || mes < 1 || mes > 12) throw createError('Mês inválido', 400);
      const created = await prisma.contratoSocioSubitem.create({
        data: { contrato, ano, mes, nome, ...lerCampos(req.body ?? {}, false), createdBy: req.user!.id },
      });
      res.status(201).json({ success: true, data: serializar(created as Linha) });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await assertAcesso(req);
      const { id } = req.params;
      const atual = await prisma.contratoSocioSubitem.findUnique({ where: { id } });
      if (!atual) throw createError('Linha não encontrada', 404);
      const data: Prisma.ContratoSocioSubitemUpdateInput = { ...lerCampos(req.body ?? {}, true) };
      if (req.body?.nome !== undefined) {
        const nome = String(req.body.nome).trim();
        if (!nome) throw createError('Informe o nome (ex.: o prédio)', 400);
        data.nome = nome;
      }
      const updated = await prisma.contratoSocioSubitem.update({ where: { id }, data });
      res.json({ success: true, data: serializar(updated as Linha) });
    } catch (error) {
      next(error);
    }
  }

  async remove(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await assertAcesso(req);
      const { id } = req.params;
      const atual = await prisma.contratoSocioSubitem.findUnique({ where: { id } });
      if (!atual) throw createError('Linha não encontrada', 404);
      await prisma.contratoSocioSubitem.delete({ where: { id } });
      res.json({ success: true, message: 'Linha removida' });
    } catch (error) {
      next(error);
    }
  }
}
