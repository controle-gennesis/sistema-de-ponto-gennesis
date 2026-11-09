import { NextFunction, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { parseBoletoDate, parseBoletoValue } from '../lib/boletoControlImport';

type Row = Prisma.ContractRegistryEntryGetPayload<{ include: { addenda: true; cats: true; looseArts: true } }>;

const ymd = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const dateFromYmd = (s: string | null | undefined) => (s ? new Date(`${s}T00:00:00.000Z`) : null);

function str(v: unknown, max = 255): string | null {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : null;
}

/** Lista de ids de centros de custo: sem repetidos nem vazios (máx. 50). */
function parseIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw.slice(0, 50)) {
    const id = str(item, 60);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/** UF com 2 letras maiúsculas; vazio/inválida = sem estado (null). */
function parseUf(raw: unknown): string | null {
  const v = String(raw ?? '').trim().toUpperCase();
  return /^[A-Z]{2}$/.test(v) ? v : null;
}

type ArtEntry = { art: string; professional: string; baixada: '' | 'SIM' | 'NÃO' };

/** SIM / NÃO (aceita "nao" sem acento); qualquer outra coisa = não informado. */
function parseBaixada(raw: unknown): '' | 'SIM' | 'NÃO' {
  const v = String(raw ?? '').trim().toUpperCase();
  if (v === 'SIM') return 'SIM';
  if (v === 'NÃO' || v === 'NAO') return 'NÃO';
  return '';
}

/** Lista de ARTs [{ art, professional }] vinda do corpo ou do banco; descarta linhas vazias e ARTs repetidas. */
function parseArts(raw: unknown): ArtEntry[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: ArtEntry[] = [];
  for (const item of raw.slice(0, 30)) {
    const o = (item ?? {}) as Record<string, unknown>;
    const art = str(o.art, 60) ?? '';
    const professional = str(o.professional, 120) ?? '';
    const baixada = parseBaixada(o.baixada);
    if (!art && !professional) continue;
    if (art) {
      if (seen.has(art)) continue;
      seen.add(art);
    }
    out.push({ art, professional, baixada });
  }
  return out;
}

/** Valida o corpo de um aditivo (usado ao criar e ao editar). */
function readAddendumBody(body: Record<string, unknown>) {
  const optDate = (key: string, label: string): string | null => {
    const raw = body[key];
    if (raw === undefined || raw === null || String(raw).trim() === '') return null;
    const parsed = parseBoletoDate(raw);
    if (!parsed) throw createError(`${label} inválido`, 400);
    return parsed;
  };
  const signedAt = optDate('signedAt', 'Assinado em');
  const startDate = optDate('startDate', 'Início');
  const endDate = optDate('endDate', 'Término');
  // Data de referência: início, senão assinatura (um aditivo precisa de pelo menos uma das duas).
  const date = startDate || signedAt;
  if (!date) throw createError('Informe a data de início ou de assinatura do aditivo', 400);
  const rawAmount = body.amount;
  let amount = 0;
  if (rawAmount !== undefined && rawAmount !== null && String(rawAmount).trim() !== '') {
    const n = parseBoletoValue(rawAmount);
    if (n == null) throw createError('Valor do aditivo inválido', 400);
    amount = n;
  }
  const note = str(body.note, 500);
  // Aditivo sem valor (ex.: de prazo) precisa de observação para ter significado.
  if (Math.abs(amount) < 1e-9 && !note) {
    throw createError('Aditivo sem valor precisa de uma observação (ex.: aditivo de prazo)', 400);
  }
  return {
    addendumNumber: str(body.addendumNumber, 60),
    arts: parseArts(body.arts) as unknown as Prisma.InputJsonValue,
    document: str(body.document, 40),
    signedAt: dateFromYmd(signedAt),
    startDate: dateFromYmd(startDate),
    endDate: dateFromYmd(endDate),
    guarantee: str(body.guarantee, 500),
    effectiveDate: dateFromYmd(date)!,
    amount,
    note,
  };
}

function serialize(r: Row) {
  return {
    id: r.id,
    contractorName: r.contractorName,
    uf: r.uf,
    arts: parseArts(r.arts),
    costCenterIds: r.costCenterIds ?? [],
    contractNumber: r.contractNumber,
    document: r.document,
    signedAt: ymd(r.signedAt),
    notes: r.notes,
    value: r.value == null ? null : Number(r.value),
    startDate: ymd(r.startDate),
    guarantee: r.guarantee,
    endDate: ymd(r.endDate),
    addenda: r.addenda.map((a) => ({
      id: a.id,
      addendumNumber: a.addendumNumber,
      arts: parseArts(a.arts),
      document: a.document,
      signedAt: ymd(a.signedAt),
      startDate: ymd(a.startDate),
      endDate: ymd(a.endDate),
      guarantee: a.guarantee,
      effectiveDate: ymd(a.effectiveDate),
      amount: Number(a.amount),
      note: a.note,
    })),
    addendaTotal: r.addenda.reduce((s, a) => s + Number(a.amount), 0),
    cats: r.cats.map((c) => ({
      id: c.id,
      catNumber: c.catNumber,
      professional: c.professional,
      protocol: c.protocol,
      issuedAt: ymd(c.issuedAt),
    })),
    looseArts: r.looseArts.map((a) => ({
      id: a.id,
      art: a.art,
      professional: a.professional,
      baixada: parseBaixada(a.baixada),
      notes: a.notes,
    })),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

const withAddenda = {
  addenda: { orderBy: [{ effectiveDate: 'asc' as const }, { createdAt: 'asc' as const }] },
  cats: { orderBy: [{ issuedAt: 'asc' as const }, { createdAt: 'asc' as const }] },
  looseArts: { orderBy: [{ createdAt: 'asc' as const }] },
};

/** Valida o corpo de uma ART avulsa (usado ao criar e ao editar). */
function readLooseArtBody(body: Record<string, unknown>) {
  const art = str(body.art, 60);
  if (!art) throw createError('Informe a ART', 400);
  return {
    art,
    professional: str(body.professional, 120),
    baixada: parseBaixada(body.baixada) || null,
    notes: str(body.notes, 500),
  };
}

/** Valida o corpo de uma CAT (usado ao criar e ao editar). */
function readCatBody(body: Record<string, unknown>) {
  const catNumber = str(body.catNumber, 80);
  if (!catNumber) throw createError('Informe o Nº da CAT', 400);
  let issuedAt: Date | null = null;
  const raw = body.issuedAt;
  if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
    const parsed = parseBoletoDate(raw);
    if (!parsed) throw createError('Data de emissão inválida', 400);
    issuedAt = dateFromYmd(parsed);
  }
  return {
    catNumber,
    professional: str(body.professional, 120),
    protocol: str(body.protocol, 120),
    issuedAt,
  };
}

function readBody(body: Record<string, unknown>, partial: boolean): Prisma.ContractRegistryEntryUncheckedUpdateInput {
  const data: Prisma.ContractRegistryEntryUncheckedUpdateInput = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);

  if (has('contractorName') || !partial) {
    const v = str(body.contractorName);
    if (!v) throw createError('Informe o nome do contratante', 400);
    data.contractorName = v;
  }
  if (has('contractNumber') || !partial) {
    const v = str(body.contractNumber);
    if (!v) throw createError('Informe o contrato', 400);
    data.contractNumber = v;
  }
  if (has('uf')) data.uf = parseUf(body.uf);
  if (has('arts')) data.arts = parseArts(body.arts) as unknown as Prisma.InputJsonValue;
  if (has('costCenterIds')) data.costCenterIds = parseIds(body.costCenterIds);
  if (has('document')) data.document = str(body.document, 40);
  if (has('notes')) data.notes = str(body.notes, 2000);
  if (has('guarantee')) data.guarantee = str(body.guarantee, 500);

  if (has('value')) {
    const raw = body.value;
    if (raw === null || raw === '') data.value = null;
    else {
      const n = parseBoletoValue(raw);
      if (n == null) throw createError('Valor do contrato inválido', 400);
      data.value = n;
    }
  }
  for (const [key, label] of [
    ['signedAt', 'Assinado em'],
    ['startDate', 'Início'],
    ['endDate', 'Término'],
  ] as const) {
    if (!has(key)) continue;
    const raw = body[key];
    if (raw === null || raw === '') {
      (data as Record<string, unknown>)[key] = null;
      continue;
    }
    const parsed = parseBoletoDate(raw);
    if (!parsed) throw createError(`${label} inválido`, 400);
    (data as Record<string, unknown>)[key] = dateFromYmd(parsed);
  }
  return data;
}

export class ContractRegistryController {
  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const search = str(req.query.search);
      const where: Prisma.ContractRegistryEntryWhereInput = search
        ? {
            OR: [
              { contractorName: { contains: search, mode: 'insensitive' } },
              { contractNumber: { contains: search, mode: 'insensitive' } },
              { document: { contains: search, mode: 'insensitive' } },
              { notes: { contains: search, mode: 'insensitive' } },
              { guarantee: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {};
      const rows = await prisma.contractRegistryEntry.findMany({
        where,
        include: withAddenda,
        orderBy: [{ contractorName: 'asc' }, { contractNumber: 'asc' }],
      });
      res.json({ success: true, data: rows.map(serialize) });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = readBody((req.body ?? {}) as Record<string, unknown>, false);
      const created = await prisma.contractRegistryEntry.create({
        data: { ...(data as Prisma.ContractRegistryEntryUncheckedCreateInput), createdBy: req.user?.id },
        include: withAddenda,
      });
      res.status(201).json({ success: true, data: serialize(created) });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const existing = await prisma.contractRegistryEntry.findUnique({ where: { id: req.params.id }, select: { id: true } });
      if (!existing) throw createError('Registro não encontrado', 404);
      const data = readBody((req.body ?? {}) as Record<string, unknown>, true);
      const updated = await prisma.contractRegistryEntry.update({
        where: { id: req.params.id },
        data: { ...data, updatedBy: req.user?.id },
        include: withAddenda,
      });
      res.json({ success: true, data: serialize(updated) });
    } catch (error) {
      next(error);
    }
  }

  /** ARTs cadastradas na página ART's / Protocolos, para o seletor do formulário (sem exigir o módulo ART). */
  async artOptions(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const rows = await prisma.controlePagamentoArt.findMany({
        where: { art: { not: null } },
        select: { art: true, contratante: true, contrato: true, profissional: true },
        orderBy: [{ art: 'asc' }, { createdAt: 'desc' }],
      });
      const seen = new Set<string>();
      const data: Array<{ art: string; contratante: string | null; contrato: string | null; profissional: string | null }> = [];
      for (const r of rows) {
        const art = (r.art ?? '').trim();
        if (!art || seen.has(art)) continue;
        seen.add(art);
        data.push({ art, contratante: str(r.contratante), contrato: str(r.contrato), profissional: str(r.profissional) });
      }
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async addAddendum(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const entry = await prisma.contractRegistryEntry.findUnique({ where: { id: req.params.id }, select: { id: true } });
      if (!entry) throw createError('Registro não encontrado', 404);
      const fields = readAddendumBody((req.body ?? {}) as Record<string, unknown>);
      await prisma.contractRegistryAddendum.create({
        data: { registryId: entry.id, ...fields, createdBy: req.user?.id },
      });
      const updated = await prisma.contractRegistryEntry.findUnique({ where: { id: entry.id }, include: withAddenda });
      res.status(201).json({ success: true, data: serialize(updated!) });
    } catch (error) {
      next(error);
    }
  }

  async updateAddendum(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const addendum = await prisma.contractRegistryAddendum.findFirst({
        where: { id: req.params.addendumId, registryId: req.params.id },
        select: { id: true },
      });
      if (!addendum) throw createError('Aditivo não encontrado', 404);
      const fields = readAddendumBody((req.body ?? {}) as Record<string, unknown>);
      await prisma.contractRegistryAddendum.update({ where: { id: addendum.id }, data: fields });
      const updated = await prisma.contractRegistryEntry.findUnique({ where: { id: req.params.id }, include: withAddenda });
      res.json({ success: true, data: serialize(updated!) });
    } catch (error) {
      next(error);
    }
  }

  async addCat(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const entry = await prisma.contractRegistryEntry.findUnique({ where: { id: req.params.id }, select: { id: true } });
      if (!entry) throw createError('Registro não encontrado', 404);
      const fields = readCatBody((req.body ?? {}) as Record<string, unknown>);
      await prisma.contractRegistryCat.create({ data: { registryId: entry.id, ...fields, createdBy: req.user?.id } });
      const updated = await prisma.contractRegistryEntry.findUnique({ where: { id: entry.id }, include: withAddenda });
      res.status(201).json({ success: true, data: serialize(updated!) });
    } catch (error) {
      next(error);
    }
  }

  async updateCat(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const cat = await prisma.contractRegistryCat.findFirst({
        where: { id: req.params.catId, registryId: req.params.id },
        select: { id: true },
      });
      if (!cat) throw createError('CAT não encontrada', 404);
      const fields = readCatBody((req.body ?? {}) as Record<string, unknown>);
      await prisma.contractRegistryCat.update({ where: { id: cat.id }, data: fields });
      const updated = await prisma.contractRegistryEntry.findUnique({ where: { id: req.params.id }, include: withAddenda });
      res.json({ success: true, data: serialize(updated!) });
    } catch (error) {
      next(error);
    }
  }

  async addLooseArt(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const entry = await prisma.contractRegistryEntry.findUnique({ where: { id: req.params.id }, select: { id: true } });
      if (!entry) throw createError('Registro não encontrado', 404);
      const fields = readLooseArtBody((req.body ?? {}) as Record<string, unknown>);
      await prisma.contractRegistryLooseArt.create({ data: { registryId: entry.id, ...fields, createdBy: req.user?.id } });
      const updated = await prisma.contractRegistryEntry.findUnique({ where: { id: entry.id }, include: withAddenda });
      res.status(201).json({ success: true, data: serialize(updated!) });
    } catch (error) {
      next(error);
    }
  }

  async updateLooseArt(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const row = await prisma.contractRegistryLooseArt.findFirst({
        where: { id: req.params.looseArtId, registryId: req.params.id },
        select: { id: true },
      });
      if (!row) throw createError('ART avulsa não encontrada', 404);
      const fields = readLooseArtBody((req.body ?? {}) as Record<string, unknown>);
      await prisma.contractRegistryLooseArt.update({ where: { id: row.id }, data: fields });
      const updated = await prisma.contractRegistryEntry.findUnique({ where: { id: req.params.id }, include: withAddenda });
      res.json({ success: true, data: serialize(updated!) });
    } catch (error) {
      next(error);
    }
  }

  async removeLooseArt(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const row = await prisma.contractRegistryLooseArt.findFirst({
        where: { id: req.params.looseArtId, registryId: req.params.id },
        select: { id: true },
      });
      if (!row) throw createError('ART avulsa não encontrada', 404);
      await prisma.contractRegistryLooseArt.delete({ where: { id: row.id } });
      const updated = await prisma.contractRegistryEntry.findUnique({ where: { id: req.params.id }, include: withAddenda });
      res.json({ success: true, data: serialize(updated!) });
    } catch (error) {
      next(error);
    }
  }

  async removeCat(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const cat = await prisma.contractRegistryCat.findFirst({
        where: { id: req.params.catId, registryId: req.params.id },
        select: { id: true },
      });
      if (!cat) throw createError('CAT não encontrada', 404);
      await prisma.contractRegistryCat.delete({ where: { id: cat.id } });
      const updated = await prisma.contractRegistryEntry.findUnique({ where: { id: req.params.id }, include: withAddenda });
      res.json({ success: true, data: serialize(updated!) });
    } catch (error) {
      next(error);
    }
  }

  async removeAddendum(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const addendum = await prisma.contractRegistryAddendum.findFirst({
        where: { id: req.params.addendumId, registryId: req.params.id },
        select: { id: true },
      });
      if (!addendum) throw createError('Aditivo não encontrado', 404);
      await prisma.contractRegistryAddendum.delete({ where: { id: addendum.id } });
      const updated = await prisma.contractRegistryEntry.findUnique({ where: { id: req.params.id }, include: withAddenda });
      res.json({ success: true, data: serialize(updated!) });
    } catch (error) {
      next(error);
    }
  }

  async remove(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const existing = await prisma.contractRegistryEntry.findUnique({ where: { id: req.params.id }, select: { id: true } });
      if (!existing) throw createError('Registro não encontrado', 404);
      await prisma.contractRegistryEntry.delete({ where: { id: req.params.id } });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }
}
