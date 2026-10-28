import { NextFunction, Response } from 'express';
import * as XLSX from 'xlsx';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import {
  BoletoControlStatus,
  parseBoletoControlSpreadsheet,
  parseBoletoDate,
  parseBoletoValue,
} from '../lib/boletoControlImport';
import { buildCostCenterResolver } from '../lib/boletoControlCostCenter';

const MAX_PAGE_SIZE = 200;
const IMPORT_BATCH = 500;

const STATUS_LABEL: Record<BoletoControlStatus, string> = {
  PAGO: 'PAGO',
  A_VENCER: 'À VENCER',
  VENCIDO: 'VENCIDO',
};

/** Hoje (data) no fuso de Brasília, como data UTC à meia-noite para comparar com colunas DATE. */
function todayBrasilia(): Date {
  const ymd = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  return new Date(`${ymd}T00:00:00.000Z`);
}

function ymd(d: Date | null | undefined): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

function dateFromYmd(s: string | null | undefined): Date | null {
  return s ? new Date(`${s}T00:00:00.000Z`) : null;
}

type EntryRow = Prisma.BoletoControlEntryGetPayload<Record<string, never>>;

/** Mesma regra da planilha: confirmado pelo técnico = PAGO; senão vencido se a data passou; senão à vencer. */
function effectiveStatus(e: { technicalConfirmed: boolean; dueDate: Date | null }, today: Date): BoletoControlStatus {
  if (e.technicalConfirmed) return 'PAGO';
  if (e.dueDate && e.dueDate.getTime() < today.getTime()) return 'VENCIDO';
  return 'A_VENCER';
}

const NO_MANAGER = 'NÃO DEFINIDO';

/** centro de custo → gestor (tabela editável na tela; antes ficava na aba CONFIG da planilha). */
async function loadManagerMap(): Promise<Map<string, string>> {
  const rows = await prisma.boletoControlManager.findMany({ select: { costCenterName: true, managerName: true } });
  return new Map(rows.map((r) => [r.costCenterName, r.managerName]));
}

function managerOf(map: Map<string, string>, costCenterName: string | null): string {
  return (costCenterName && map.get(costCenterName)) || NO_MANAGER;
}

function serialize(e: EntryRow, today: Date, managers: Map<string, string>) {
  return {
    id: e.id,
    polo: e.polo,
    supplierName: e.supplierName,
    costCenterName: e.costCenterName,
    ocNumber: e.ocNumber,
    idMov: e.idMov,
    value: e.value != null ? Number(e.value) : null,
    nfNumber: e.nfNumber,
    nfEmissionDate: ymd(e.nfEmissionDate),
    paymentCondition: e.paymentCondition,
    dueDate: ymd(e.dueDate),
    status: effectiveStatus(e, today),
    effectiveStatus: effectiveStatus(e, today),
    notes: e.notes,
    contractManager: managerOf(managers, e.costCenterName),
    technicalConfirmed: e.technicalConfirmed,
    technicalConfirmedAt: e.technicalConfirmedAt ? e.technicalConfirmedAt.toISOString() : null,
    technicalConfirmedByName: e.technicalConfirmedByName,
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).replace(/\s+/g, ' ').trim();
  return s || null;
}

type Filters = {
  search?: string;
  polo?: string;
  costCenter?: string;
  manager?: string;
  technical?: string; // SIM | NAO
  dueFrom?: string;
  dueTo?: string;
  status?: string; // PAGO | A_VENCER | VENCIDO (efetivo)
};

function readFilters(q: Record<string, unknown>): Filters {
  const pick = (k: string) => (typeof q[k] === 'string' && (q[k] as string).trim() ? (q[k] as string).trim() : undefined);
  return {
    search: pick('search'),
    polo: pick('polo'),
    costCenter: pick('costCenter'),
    manager: pick('manager'),
    technical: pick('technical'),
    dueFrom: pick('dueFrom'),
    dueTo: pick('dueTo'),
    status: pick('status'),
  };
}

/** Filtros comuns (sem o de status, para os cartões de resumo mostrarem todos os grupos). */
function baseWhere(f: Filters, managers: Map<string, string>): Prisma.BoletoControlEntryWhereInput[] {
  const and: Prisma.BoletoControlEntryWhereInput[] = [];
  if (f.search) {
    const contains = { contains: f.search, mode: 'insensitive' as const };
    const needle = f.search.toLowerCase();
    const centersOfMatchingManagers = [...managers.entries()]
      .filter(([, manager]) => manager.toLowerCase().includes(needle))
      .map(([center]) => center);
    and.push({
      OR: [
        { supplierName: contains },
        { ocNumber: contains },
        { idMov: contains },
        { nfNumber: contains },
        { costCenterName: contains },
        { notes: contains },
        ...(centersOfMatchingManagers.length ? [{ costCenterName: { in: centersOfMatchingManagers } }] : []),
      ],
    });
  }
  if (f.polo) and.push({ polo: f.polo });
  if (f.costCenter) and.push({ costCenterName: f.costCenter });
  if (f.manager) {
    if (f.manager === NO_MANAGER) {
      and.push({ OR: [{ costCenterName: null }, { costCenterName: { notIn: [...managers.keys()] } }] });
    } else {
      const centers = [...managers.entries()].filter(([, m]) => m === f.manager).map(([c]) => c);
      and.push({ costCenterName: { in: centers.length ? centers : ['__nenhum__'] } });
    }
  }
  if (f.technical === 'SIM') and.push({ technicalConfirmed: true });
  if (f.technical === 'NAO') and.push({ technicalConfirmed: false });
  const from = f.dueFrom ? parseBoletoDate(f.dueFrom) : null;
  const to = f.dueTo ? parseBoletoDate(f.dueTo) : null;
  if (from) and.push({ dueDate: { gte: dateFromYmd(from)! } });
  if (to) and.push({ dueDate: { lte: dateFromYmd(to)! } });
  return and;
}

function statusWhere(status: string | undefined, today: Date): Prisma.BoletoControlEntryWhereInput | null {
  if (status === 'PAGO') return { technicalConfirmed: true };
  if (status === 'VENCIDO') return { technicalConfirmed: false, dueDate: { lt: today } };
  if (status === 'A_VENCER') {
    return { technicalConfirmed: false, OR: [{ dueDate: null }, { dueDate: { gte: today } }] };
  }
  return null;
}

type WriteBody = Record<string, unknown>;

async function loadCostCenterResolver() {
  const rows = await prisma.costCenter.findMany({ select: { name: true } });
  return buildCostCenterResolver(rows.map((r) => r.name));
}

function readWriteBody(body: WriteBody, partial: boolean): Prisma.BoletoControlEntryUncheckedUpdateInput {
  const data: Prisma.BoletoControlEntryUncheckedUpdateInput = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);
  const text = (k: string, field: keyof Prisma.BoletoControlEntryUncheckedUpdateInput) => {
    if (has(k)) (data as Record<string, unknown>)[field as string] = str(body[k]);
  };
  text('polo', 'polo');
  text('supplierName', 'supplierName');
  text('costCenterName', 'costCenterName');
  text('ocNumber', 'ocNumber');
  text('idMov', 'idMov');
  text('nfNumber', 'nfNumber');
  text('paymentCondition', 'paymentCondition');
  text('notes', 'notes');

  if (has('value')) {
    const raw = body.value;
    if (raw === null || raw === '') data.value = null;
    else {
      const v = parseBoletoValue(raw);
      if (v == null) throw createError('Valor inválido', 400);
      data.value = v;
    }
  }
  const dateField = (k: string, label: string) => {
    if (!has(k)) return;
    const raw = body[k];
    if (raw === null || raw === '') {
      (data as Record<string, unknown>)[k] = null;
      return;
    }
    const parsed = parseBoletoDate(raw);
    if (!parsed) throw createError(`${label} inválida`, 400);
    (data as Record<string, unknown>)[k] = dateFromYmd(parsed);
  };
  dateField('nfEmissionDate', 'Emissão da NF');
  dateField('dueDate', 'Vencimento');

  // Status e gestor são calculados (confirmação do técnico + vencimento; centro de custo → gestor).
  void partial;
  return data;
}

type DashBucket = {
  key: string;
  label: string;
  count: number;
  value: number;
  pago: number;
  aVencer: number;
  vencido: number;
};

function addToBucket(map: Map<string, DashBucket>, key: string, label: string, status: BoletoControlStatus, value: number) {
  let b = map.get(key);
  if (!b) {
    b = { key, label, count: 0, value: 0, pago: 0, aVencer: 0, vencido: 0 };
    map.set(key, b);
  }
  b.count += 1;
  b.value += value;
  if (status === 'PAGO') b.pago += value;
  else if (status === 'VENCIDO') b.vencido += value;
  else b.aVencer += value;
}

/** Mesma regra da aba «Apresentação Financeira» da planilha (texto da condição de pagamento). */
const PAYMENT_TYPES = ['BOLETO BANCÁRIO', 'MISTO: PIX + BOLETO', 'PIX', 'CARTÃO DE CRÉDITO', 'OUTROS / NÃO INFORMADO'] as const;

function paymentTypeOf(condition: string | null): (typeof PAYMENT_TYPES)[number] {
  const t = (condition ?? '').toUpperCase();
  if (!t.trim()) return 'OUTROS / NÃO INFORMADO';
  if (t.includes('CARTÃO') || t.includes('CARTAO')) return 'CARTÃO DE CRÉDITO';
  const hasBoleto = t.includes('BOLETO') || t.includes('BOELTO') || t.includes('BLTO');
  const hasPix = t.includes('PIX');
  if (hasPix && hasBoleto) return 'MISTO: PIX + BOLETO';
  if (hasPix) return 'PIX';
  if (hasBoleto) return 'BOLETO BANCÁRIO';
  return 'OUTROS / NÃO INFORMADO';
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export class BoletoControlController {
  /** Indicadores para o dashboard (mesmos filtros da lista, exceto busca livre e status). */
  async dashboard(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const f = readFilters(req.query);
      const today = todayBrasilia();
      const managers = await loadManagerMap();
      const rows = await prisma.boletoControlEntry.findMany({
        where: { AND: baseWhere(f, managers) },
        select: {
          id: true,
          polo: true,
          supplierName: true,
          costCenterName: true,
          ocNumber: true,
          nfNumber: true,
          value: true,
          dueDate: true,
          technicalConfirmed: true,
          paymentCondition: true,
        },
      });

      const totals = {
        all: { count: 0, value: 0 },
        PAGO: { count: 0, value: 0 },
        A_VENCER: { count: 0, value: 0 },
        VENCIDO: { count: 0, value: 0 },
      };
      const byPolo = new Map<string, DashBucket>();
      const byManager = new Map<string, DashBucket>();
      const byCostCenter = new Map<string, DashBucket>();
      const bySupplier = new Map<string, DashBucket>();
      const byMonth = new Map<string, DashBucket>();
      const byPaymentType = new Map<string, DashBucket>(PAYMENT_TYPES.map((p) => [p, { key: p, label: p, count: 0, value: 0, pago: 0, aVencer: 0, vencido: 0 }]));
      const byCondition = new Map<string, DashBucket>();
      const monthPolo = new Map<string, Record<string, { value: number; count: number }>>();
      const overdue: Array<{
        id: string;
        supplierName: string | null;
        costCenterName: string | null;
        ocNumber: string | null;
        nfNumber: string | null;
        value: number;
        dueDate: string;
        daysLate: number;
      }> = [];
      const in30 = new Date(today.getTime() + 30 * 86400000);
      let next30 = { count: 0, value: 0 };

      for (const r of rows) {
        const value = r.value == null ? 0 : Number(r.value);
        const status = effectiveStatus(r, today);
        totals.all.count += 1;
        totals.all.value += value;
        totals[status].count += 1;
        totals[status].value += value;

        addToBucket(byPolo, r.polo || '—', r.polo || 'Sem polo', status, value);
        const mgr = managerOf(managers, r.costCenterName);
        addToBucket(byManager, mgr, mgr, status, value);
        addToBucket(byCostCenter, r.costCenterName || '—', r.costCenterName || 'Sem centro de custo', status, value);
        addToBucket(bySupplier, r.supplierName || '—', r.supplierName || 'Sem fornecedor', status, value);
        const ym = r.dueDate ? r.dueDate.toISOString().slice(0, 7) : 'sem-data';
        addToBucket(byMonth, ym, ym, status, value);
        const cond = (r.paymentCondition ?? '').replace(/s+/g, ' ').trim().toUpperCase() || 'NÃO INFORMADO';
        addToBucket(byCondition, cond, cond, status, value);
        const mp = monthPolo.get(ym) ?? {};
        const pk = r.polo || 'Sem polo';
        mp[pk] = mp[pk] ?? { value: 0, count: 0 };
        mp[pk].value += value;
        mp[pk].count += 1;
        monthPolo.set(ym, mp);
        const pt = paymentTypeOf(r.paymentCondition);
        addToBucket(byPaymentType, pt, pt, status, value);

        if (status === 'VENCIDO' && r.dueDate) {
          overdue.push({
            id: r.id,
            supplierName: r.supplierName,
            costCenterName: r.costCenterName,
            ocNumber: r.ocNumber,
            nfNumber: r.nfNumber,
            value,
            dueDate: r.dueDate.toISOString().slice(0, 10),
            daysLate: Math.round((today.getTime() - r.dueDate.getTime()) / 86400000),
          });
        }
        if (status === 'A_VENCER' && r.dueDate && r.dueDate.getTime() <= in30.getTime()) {
          next30.count += 1;
          next30.value += value;
        }
      }

      const finish = (m: Map<string, DashBucket>, orderBy: 'value' | 'key') =>
        Array.from(m.values())
          .map((b) => ({ ...b, value: round2(b.value), pago: round2(b.pago), aVencer: round2(b.aVencer), vencido: round2(b.vencido) }))
          .sort((a, b) => (orderBy === 'key' ? a.key.localeCompare(b.key) : b.value - a.value));

      overdue.sort((a, b) => b.daysLate - a.daysLate || b.value - a.value);

      res.json({
        success: true,
        data: {
          totals: {
            all: { count: totals.all.count, value: round2(totals.all.value) },
            PAGO: { count: totals.PAGO.count, value: round2(totals.PAGO.value) },
            A_VENCER: { count: totals.A_VENCER.count, value: round2(totals.A_VENCER.value) },
            VENCIDO: { count: totals.VENCIDO.count, value: round2(totals.VENCIDO.value) },
          },
          next30: { count: next30.count, value: round2(next30.value) },
          byPolo: finish(byPolo, 'value'),
          byManager: finish(byManager, 'value'),
          byCostCenter: finish(byCostCenter, 'value'),
          bySupplier: finish(bySupplier, 'value').slice(0, 15),
          byMonth: finish(byMonth, 'key'),
          byMonthPolo: Array.from(monthPolo.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, polos]) => ({
              key,
              polos: Object.fromEntries(Object.entries(polos).map(([p, v]) => [p, { value: round2(v.value), count: v.count }])),
            })),
          byCondition: finish(byCondition, 'value').slice(0, 8),
          byPaymentType: PAYMENT_TYPES.map((p) => finish(new Map([[p, byPaymentType.get(p)!]]), 'key')[0]),
          overdue: overdue.slice(0, 10),
          overdueTotal: overdue.length,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const f = readFilters(req.query);
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), MAX_PAGE_SIZE);
      const today = todayBrasilia();

      const managers = await loadManagerMap();
      const and = baseWhere(f, managers);
      const stWhere = statusWhere(f.status, today);
      const where: Prisma.BoletoControlEntryWhereInput = {
        AND: stWhere ? [...and, stWhere] : and,
      };
      const baseOnly: Prisma.BoletoControlEntryWhereInput = { AND: and };

      const [rows, total, sumAll, sumPago, sumVencer, sumVencido] = await Promise.all([
        prisma.boletoControlEntry.findMany({
          where,
          orderBy: [{ costCenterName: { sort: 'asc', nulls: 'last' } }, { dueDate: 'desc' }, { createdAt: 'desc' }],
          skip: (page - 1) * limit,
          take: limit,
        }),
        prisma.boletoControlEntry.count({ where }),
        prisma.boletoControlEntry.aggregate({ where: baseOnly, _count: true, _sum: { value: true } }),
        prisma.boletoControlEntry.aggregate({
          where: { AND: [...and, statusWhere('PAGO', today)!] },
          _count: true,
          _sum: { value: true },
        }),
        prisma.boletoControlEntry.aggregate({
          where: { AND: [...and, statusWhere('A_VENCER', today)!] },
          _count: true,
          _sum: { value: true },
        }),
        prisma.boletoControlEntry.aggregate({
          where: { AND: [...and, statusWhere('VENCIDO', today)!] },
          _count: true,
          _sum: { value: true },
        }),
      ]);

      const sum = (a: { _count: number; _sum: { value: Prisma.Decimal | null } }) => ({
        count: a._count,
        value: Number(a._sum.value ?? 0),
      });

      res.json({
        success: true,
        data: rows.map((r) => serialize(r, today, managers)),
        pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
        summary: { all: sum(sumAll), PAGO: sum(sumPago), A_VENCER: sum(sumVencer), VENCIDO: sum(sumVencido) },
      });
    } catch (error) {
      next(error);
    }
  }

  async options(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const distinct = async (field: 'polo' | 'costCenterName') => {
        const rows = await prisma.boletoControlEntry.findMany({
          where: { [field]: { not: null } },
          distinct: [field],
          select: { [field]: true },
          orderBy: { [field]: 'asc' },
        });
        return rows.map((r) => (r as Record<string, string | null>)[field]).filter((v): v is string => !!v);
      };
      const [polos, costCenters, managerRows, official] = await Promise.all([
        distinct('polo'),
        distinct('costCenterName'),
        prisma.boletoControlManager.findMany({ select: { managerName: true } }),
        prisma.costCenter.findMany({ where: { isActive: true }, select: { name: true }, orderBy: { name: 'asc' } }),
      ]);
      const mapped = new Set((await loadManagerMap()).keys());
      const hasUnmapped = costCenters.some((c) => !mapped.has(c));
      const managers = Array.from(new Set(managerRows.map((m) => m.managerName))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
      res.json({
        success: true,
        data: {
          polos,
          costCenters,
          managers: hasUnmapped ? [...managers, NO_MANAGER] : managers,
          officialCostCenters: Array.from(new Set(official.map((c) => c.name))),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = readWriteBody(req.body ?? {}, false);
      if (typeof data.costCenterName === 'string') {
        data.costCenterName = (await loadCostCenterResolver())(data.costCenterName).name;
      }
      if (!data.supplierName && !data.ocNumber) {
        throw createError('Informe ao menos o fornecedor ou a OC', 400);
      }
      const created = await prisma.boletoControlEntry.create({
        data: { ...(data as Prisma.BoletoControlEntryUncheckedCreateInput), createdBy: req.user?.id, updatedBy: req.user?.id },
      });
      res.status(201).json({ success: true, data: serialize(created, todayBrasilia(), await loadManagerMap()) });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params.id;
      const existing = await prisma.boletoControlEntry.findUnique({ where: { id } });
      if (!existing) throw createError('Linha não encontrada', 404);
      const data = readWriteBody(req.body ?? {}, true);
      if (typeof data.costCenterName === 'string') {
        data.costCenterName = (await loadCostCenterResolver())(data.costCenterName).name;
      }
      const updated = await prisma.boletoControlEntry.update({ where: { id }, data: { ...data, updatedBy: req.user?.id } });
      res.json({ success: true, data: serialize(updated, todayBrasilia(), await loadManagerMap()) });
    } catch (error) {
      next(error);
    }
  }

  /** Confirmação do técnico: registra quem confirmou e quando. */
  async confirmTechnical(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params.id;
      const confirmed = req.body?.confirmed === true;
      const existing = await prisma.boletoControlEntry.findUnique({ where: { id } });
      if (!existing) throw createError('Linha não encontrada', 404);
      let userName: string | null = null;
      if (confirmed && req.user?.id) {
        const u = await prisma.user.findUnique({ where: { id: req.user.id }, select: { name: true } });
        userName = u?.name ?? null;
      }
      const updated = await prisma.boletoControlEntry.update({
        where: { id },
        data: {
          technicalConfirmed: confirmed,
          technicalConfirmedAt: confirmed ? new Date() : null,
          technicalConfirmedByName: confirmed ? userName : null,
          status: confirmed ? 'PAGO' : 'A_VENCER',
          updatedBy: req.user?.id,
        },
      });
      res.json({ success: true, data: serialize(updated, todayBrasilia(), await loadManagerMap()) });
    } catch (error) {
      next(error);
    }
  }

  async listManagers(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const rows = await prisma.boletoControlManager.findMany({ orderBy: { costCenterName: 'asc' } });
      res.json({
        success: true,
        data: rows.map((r) => ({ id: r.id, costCenterName: r.costCenterName, managerName: r.managerName })),
      });
    } catch (error) {
      next(error);
    }
  }

  async upsertManager(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const rawCenter = str(req.body?.costCenterName);
      const managerName = str(req.body?.managerName);
      if (!rawCenter) throw createError('Informe o centro de custo', 400);
      if (!managerName) throw createError('Informe o gestor', 400);
      const costCenterName = (await loadCostCenterResolver())(rawCenter).name ?? rawCenter;
      const saved = await prisma.boletoControlManager.upsert({
        where: { costCenterName },
        update: { managerName },
        create: { costCenterName, managerName },
      });
      res.json({ success: true, data: { id: saved.id, costCenterName: saved.costCenterName, managerName: saved.managerName } });
    } catch (error) {
      next(error);
    }
  }

  async removeManager(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params.id;
      const existing = await prisma.boletoControlManager.findUnique({ where: { id }, select: { id: true } });
      if (!existing) throw createError('Registro não encontrado', 404);
      await prisma.boletoControlManager.delete({ where: { id } });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }

  async remove(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const id = req.params.id;
      const existing = await prisma.boletoControlEntry.findUnique({ where: { id }, select: { id: true } });
      if (!existing) throw createError('Linha não encontrada', 404);
      await prisma.boletoControlEntry.delete({ where: { id } });
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }

  async importSpreadsheet(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.file) throw createError('Arquivo não enviado', 400);
      const updateExisting = String(req.body?.updateExisting ?? '') === 'true';

      let parsed;
      try {
        parsed = parseBoletoControlSpreadsheet(req.file.buffer);
      } catch (e) {
        throw createError(e instanceof Error ? e.message : 'Não foi possível ler a planilha', 400);
      }
      if (!parsed.entries.length) {
        throw createError('Nenhuma linha válida encontrada na planilha', 400);
      }

      // Nomes de centro de custo da planilha → nome oficial do cadastro (de-para + regras).
      const resolveCostCenter = await loadCostCenterResolver();
      const renamed = new Map<string, { from: string; to: string; count: number }>();
      const unmatched = new Map<string, number>();
      for (const e of parsed.entries) {
        const original = e.costCenterName;
        const r = resolveCostCenter(original);
        if (r.how === 'unmatched' && original) {
          unmatched.set(original, (unmatched.get(original) ?? 0) + 1);
        } else if (original && r.name && r.name !== original) {
          const key = `${original}=>${r.name}`;
          const cur = renamed.get(key) ?? { from: original, to: r.name, count: 0 };
          cur.count += 1;
          renamed.set(key, cur);
        }
        e.costCenterName = r.name;
      }

      const userId = req.user?.id ?? null;
      const keys = parsed.entries.map((e) => e.importKey);
      const existingKeys = new Set<string>();
      for (let i = 0; i < keys.length; i += 1000) {
        const found = await prisma.boletoControlEntry.findMany({
          where: { importKey: { in: keys.slice(i, i + 1000) } },
          select: { importKey: true },
        });
        found.forEach((f) => f.importKey && existingKeys.add(f.importKey));
      }

      const toData = (e: (typeof parsed.entries)[number]) => ({
        polo: e.polo,
        supplierName: e.supplierName,
        costCenterName: e.costCenterName,
        ocNumber: e.ocNumber,
        idMov: e.idMov,
        value: e.value,
        nfNumber: e.nfNumber,
        nfEmissionDate: dateFromYmd(e.nfEmissionDate),
        paymentCondition: e.paymentCondition,
        dueDate: dateFromYmd(e.dueDate),
        status: e.status,
        notes: e.notes,
        contractManager: e.contractManager,
        technicalConfirmed: e.technicalConfirmed,
        technicalConfirmedAt: e.technicalConfirmed ? new Date() : null,
        technicalConfirmedByName: e.technicalConfirmed ? 'Importado da planilha' : null,
      });

      const fresh = parsed.entries.filter((e) => !existingKeys.has(e.importKey));
      const already = parsed.entries.filter((e) => existingKeys.has(e.importKey));

      let created = 0;
      for (let i = 0; i < fresh.length; i += IMPORT_BATCH) {
        const batch = fresh.slice(i, i + IMPORT_BATCH);
        const r = await prisma.boletoControlEntry.createMany({
          data: batch.map((e) => ({ ...toData(e), importKey: e.importKey, createdBy: userId, updatedBy: userId })),
          skipDuplicates: true,
        });
        created += r.count;
      }

      let updated = 0;
      if (updateExisting) {
        for (let i = 0; i < already.length; i += 50) {
          const batch = already.slice(i, i + 50);
          await prisma.$transaction(
            batch.map((e) =>
              prisma.boletoControlEntry.update({
                where: { importKey: e.importKey },
                data: { ...toData(e), updatedBy: userId },
              })
            )
          );
          updated += batch.length;
        }
      }

      res.json({
        success: true,
        data: {
          read: parsed.entries.length,
          created,
          updated,
          skippedExisting: updateExisting ? 0 : already.length,
          blankRows: parsed.blankRows,
          errors: parsed.errors.slice(0, 50),
          errorCount: parsed.errors.length,
          warnings: parsed.warnings.slice(0, 50),
          warningCount: parsed.warnings.length,
          renamedCostCenters: [...renamed.values()].sort((a, b) => b.count - a.count),
          unmatchedCostCenters: [...unmatched.entries()]
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async exportSpreadsheet(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const f = readFilters(req.query);
      const today = todayBrasilia();
      const managers = await loadManagerMap();
      const and = baseWhere(f, managers);
      const stWhere = statusWhere(f.status, today);
      const rows = await prisma.boletoControlEntry.findMany({
        where: { AND: stWhere ? [...and, stWhere] : and },
        orderBy: [{ costCenterName: { sort: 'asc', nulls: 'last' } }, { dueDate: 'asc' }, { createdAt: 'asc' }],
      });

      const br = (d: Date | null) => {
        const s = ymd(d);
        return s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '';
      };
      const header = [
        'POLO',
        'FORNECEDORES',
        'CENTRO DE CUSTO',
        'OC',
        'ID',
        'VALOR',
        'Nº NF',
        'EMISSÃO DA NF',
        'CONDIÇÃO DE PAGAMENTO',
        'VENCIMENTO',
        'STATUS',
        'OBSERVAÇÕES',
        'GESTOR DO CONTRATO',
        'PAGAMENTO CONFIRMADO - TÉCNICO',
      ];
      const aoa: unknown[][] = [header];
      for (const r of rows) {
        aoa.push([
          r.polo ?? '',
          r.supplierName ?? '',
          r.costCenterName ?? '',
          r.ocNumber ?? '',
          r.idMov ?? '',
          r.value != null ? Number(r.value) : '',
          r.nfNumber ?? '',
          br(r.nfEmissionDate),
          r.paymentCondition ?? '',
          br(r.dueDate),
          STATUS_LABEL[effectiveStatus(r, today)],
          r.notes ?? '',
          managerOf(managers, r.costCenterName),
          r.technicalConfirmed ? 'PAGO' : '',
        ]);
      }
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      for (let i = 1; i < aoa.length; i++) {
        const cell = ws[XLSX.utils.encode_cell({ r: i, c: 5 })];
        if (cell && cell.t === 'n') cell.z = '"R$" #,##0.00';
      }
      ws['!cols'] = [10, 38, 26, 9, 9, 15, 12, 14, 26, 13, 11, 30, 20, 18].map((wch) => ({ wch }));
      ws['!autofilter'] = { ref: `A1:N${Math.max(aoa.length, 2)}` };
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Controle de Boletos');
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="controle-de-boletos-${today.toISOString().slice(0, 10)}.xlsx"`
      );
      res.send(buffer);
    } catch (error) {
      next(error);
    }
  }
}
