import { Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { ensureUnaccentExtension, textMatchesSearch } from '../lib/normalizeSearchText';
import { PhotoService } from '../services/PhotoService';
import { pathToModuleKey, PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { userHasEmpreiteiroDailyApprovePermission } from '../lib/empreiteiroDailyApprovalAccess';

const photoService = new PhotoService();

const contractLinkInclude = {
  contract: {
    select: {
      id: true,
      name: true,
      number: true,
      costCenter: { select: { id: true, name: true } },
    },
  },
  costCenter: { select: { id: true, name: true, code: true } },
  installments: { orderBy: { number: 'asc' as const } },
  addenda: { orderBy: { number: 'asc' as const } },
  teamMembers: { orderBy: { sortOrder: 'asc' as const } },
} as const;

function serializeTeamMember(member: {
  id: string;
  name: string;
  role: string;
  phone: string | null;
  document: string | null;
  sortOrder: number;
  photoUrl: string | null;
  photoKey?: string | null;
  empreiteiroContractId?: string | null;
}) {
  return {
    id: member.id,
    name: member.name,
    role: member.role,
    phone: member.phone,
    document: member.document,
    sortOrder: member.sortOrder,
    photoUrl: member.photoUrl,
    empreiteiroContractId: member.empreiteiroContractId ?? null,
  };
}

const INSTALLMENT_STATUSES = ['PENDING', 'RELEASED', 'PAID'] as const;
type InstallmentStatus = (typeof INSTALLMENT_STATUSES)[number];

function normalizeInstallmentStatus(value: unknown): InstallmentStatus {
  const raw = str(value).toUpperCase();
  if (raw === 'RELEASED' || raw === 'PAID' || raw === 'PENDING') return raw;
  return 'PENDING';
}

type InstallmentDb = Prisma.TransactionClient | typeof prisma;

/**
 * Redistribui o saldo do contrato nas parcelas ainda PENDING,
 * para a soma das parcelas bater o valor vigente (planejado + aditivos).
 * Ex.: contrato 1500, liberadas 500+600 → pendente vira 400.
 */
async function redistributePendingInstallmentAmounts(
  db: InstallmentDb,
  empreiteiroContractId: string
): Promise<void> {
  const link = await db.empreiteiroContract.findUnique({
    where: { id: empreiteiroContractId },
    select: {
      plannedValue: true,
      addenda: { select: { amount: true } },
      installments: {
        select: { id: true, number: true, amount: true, status: true },
        orderBy: { number: 'asc' },
      },
    },
  });
  if (!link) return;

  const base = link.plannedValue != null ? Number(link.plannedValue) : 0;
  const addendaTotal = (link.addenda || []).reduce(
    (sum, a) => sum + (a.amount != null ? Number(a.amount) : 0),
    0
  );
  const contractValue = Number((base + addendaTotal).toFixed(2));
  if (!(contractValue > 0)) return;

  const installments = link.installments || [];
  const pending = installments.filter(
    (p) => String(p.status || '').toUpperCase() === 'PENDING'
  );
  if (pending.length === 0) return;

  let committed = 0;
  for (const p of installments) {
    const st = String(p.status || '').toUpperCase();
    if (st === 'RELEASED' || st === 'PAID') {
      committed += Number(p.amount) || 0;
    }
  }
  const remaining = Number(Math.max(0, contractValue - committed).toFixed(2));
  const parts = splitAmountInInstallments(remaining, pending.length);
  for (let i = 0; i < pending.length; i += 1) {
    const amount = parts[i] ?? 0;
    await db.empreiteiroContractInstallment.update({
      where: { id: pending[i].id },
      data: { amount: new Prisma.Decimal(amount.toFixed(2)) },
    });
  }
}

/**
 * Para cada medição APPROVED com baixa (executedAmount) sem parcela vinculada:
 * libera a próxima PENDING e grava o valor da baixa nessa parcela.
 * Depois recalcula as PENDING restantes para fechar o valor do contrato.
 * Pago (PAID) só ocorre ao anexar comprovante — não aqui.
 */
async function syncInstallmentReleasesForContract(
  db: InstallmentDb,
  empreiteiroContractId: string,
  actorUserId?: string | null
): Promise<number> {
  const approved = await db.empreiteiroDailyMeasurement.findMany({
    where: { empreiteiroContractId, status: 'APPROVED' },
    orderBy: [{ approvedAt: 'asc' }, { workDate: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, approvedAt: true, executedAmount: true },
  });
  if (approved.length === 0) return 0;

  const alreadyLinked = await db.empreiteiroContractInstallment.findMany({
    where: {
      empreiteiroContractId,
      measurementId: { in: approved.map((row) => row.id) },
    },
    select: { measurementId: true },
  });
  const linkedSet = new Set(
    alreadyLinked
      .map((row) => row.measurementId)
      .filter((id): id is string => Boolean(id))
  );

  let released = 0;
  for (const measurement of approved) {
    if (linkedSet.has(measurement.id)) continue;
    const baixa =
      measurement.executedAmount != null ? Number(measurement.executedAmount) : null;
    if (baixa == null || !(baixa > 0)) continue;

    const nextParcel = await db.empreiteiroContractInstallment.findFirst({
      where: { empreiteiroContractId, status: 'PENDING' },
      orderBy: { number: 'asc' },
    });
    if (!nextParcel) break;
    await db.empreiteiroContractInstallment.update({
      where: { id: nextParcel.id },
      data: {
        amount: new Prisma.Decimal(baixa.toFixed(2)),
        status: 'RELEASED',
        releasedAt: measurement.approvedAt || new Date(),
        releasedBy: actorUserId || null,
        measurementId: measurement.id,
      },
    });
    linkedSet.add(measurement.id);
    released += 1;
  }
  // Sempre recalcula PENDING para fechar o valor do contrato
  // (também corrige casos já liberados com valor diferente).
  await redistributePendingInstallmentAmounts(db, empreiteiroContractId);
  return released;
}

async function reassignEmpreiteiroPrimaryIfNeeded(
  db: InstallmentDb,
  empreiteiroId: string,
  closedLinkId: string,
  closedSystemContractId: string | null
) {
  if (!closedSystemContractId) return;
  const empreiteiro = await db.empreiteiro.findUnique({
    where: { id: empreiteiroId },
    select: { contractId: true },
  });
  if (!empreiteiro || empreiteiro.contractId !== closedSystemContractId) return;
  const nextActive = await db.empreiteiroContract.findFirst({
    where: {
      empreiteiroId,
      isActive: true,
      id: { not: closedLinkId },
      status: { in: ['NOT_STARTED', 'IN_PROGRESS', 'OVERDUE'] },
      contractId: { not: null },
    },
    orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
  });
  if (nextActive?.contractId) {
    await db.empreiteiro.update({
      where: { id: empreiteiroId },
      data: {
        contractId: nextActive.contractId,
        startDate: nextActive.startDate,
        endDate: nextActive.endDate,
      },
    });
  }
}

/**
 * Executado 100% + todas as parcelas pagas (com comprovante) →
 * status Concluído e contrato de serviço encerrado (isActive=false).
 */
async function maybeCompleteServiceContractIfSettled(
  db: InstallmentDb,
  linkId: string,
  empreiteiroId: string
): Promise<boolean> {
  const link = await db.empreiteiroContract.findFirst({
    where: { id: linkId, empreiteiroId },
    include: { installments: true },
  });
  if (!link) return false;
  const stored = String(link.status || '').toUpperCase();
  if (stored === 'COMPLETED' || stored === 'CANCELLED') return false;
  if (link.isActive === false) return false;

  const installments = link.installments || [];
  if (installments.length === 0) return false;
  const allPaid = installments.every((row) => String(row.status).toUpperCase() === 'PAID');
  if (!allPaid) return false;

  await db.empreiteiroContract.update({
    where: { id: linkId },
    data: {
      status: 'COMPLETED',
      isActive: false,
      endDate: link.endDate || new Date(),
    },
  });
  await reassignEmpreiteiroPrimaryIfNeeded(db, empreiteiroId, linkId, link.contractId);
  return true;
}

async function completeSettledContractsForEmpreiteiro(
  db: InstallmentDb,
  empreiteiroId: string,
  actorUserId?: string | null
): Promise<number> {
  const links = await db.empreiteiroContract.findMany({
    where: {
      empreiteiroId,
      isActive: true,
      status: { notIn: ['COMPLETED', 'CANCELLED'] },
    },
    select: { id: true },
  });
  let count = 0;
  for (const link of links) {
    // Aplica baixas já aprovadas nas próximas parcelas PENDING (valor + liberação).
    await syncInstallmentReleasesForContract(db, link.id, actorUserId);
    if (await maybeCompleteServiceContractIfSettled(db, link.id, empreiteiroId)) {
      count += 1;
    }
  }
  return count;
}

function splitAmountInInstallments(total: number, n: number): number[] {
  if (!Number.isFinite(total) || n < 1) return [];
  const cents = Math.round(total * 100);
  const q = Math.floor(cents / n);
  const r = cents % n;
  return Array.from({ length: n }, (_, i) => (q + (i === n - 1 ? r : 0)) / 100);
}

function serializeInstallment(row: {
  id: string;
  number: number;
  amount: Prisma.Decimal;
  dueDate: Date | null;
  status: string;
  releasedAt: Date | null;
  releasedBy: string | null;
  paidAt: Date | null;
  paidBy: string | null;
  measurementId: string | null;
  note: string | null;
  proofFiles?: Prisma.JsonValue | null;
}) {
  return {
    id: row.id,
    number: row.number,
    amount: Number(row.amount),
    dueDate: row.dueDate ? formatWorkDate(row.dueDate) : null,
    status: normalizeInstallmentStatus(row.status),
    releasedAt: row.releasedAt,
    releasedBy: row.releasedBy,
    paidAt: row.paidAt,
    paidBy: row.paidBy,
    measurementId: row.measurementId,
    note: row.note,
    proofFiles: Array.isArray(row.proofFiles) ? row.proofFiles : [],
  };
}

/** Aceita 17400, 17400.5, 17.400,00. allowNegative para aditivos. */
function parseMoneyInput(value: unknown, allowNegative = false): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || (!allowNegative && value < 0)) {
      throw createError('Valor inválido', 400);
    }
    return value;
  }
  let s = String(value).trim().replace(/R\$\s?/gi, '');
  const negative = s.startsWith('-') || s.startsWith('+');
  const sign = s.startsWith('-') ? -1 : 1;
  if (negative) s = s.slice(1).trim();
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.');
  }
  const num = sign * Number(s);
  if (!Number.isFinite(num) || (!allowNegative && num < 0)) {
    throw createError('Valor inválido', 400);
  }
  return num;
}

function serializeAddendum(row: {
  id: string;
  number: number;
  reason: string;
  effectiveDate: Date;
  amount: Prisma.Decimal;
  servicesAdded: string | null;
  servicesRemoved: string | null;
  files: Prisma.JsonValue;
  approvedByName: string | null;
  createdBy: string | null;
  createdAt: Date;
}) {
  return {
    id: row.id,
    number: row.number,
    reason: row.reason,
    effectiveDate: formatWorkDate(row.effectiveDate),
    amount: Number(row.amount),
    servicesAdded: row.servicesAdded,
    servicesRemoved: row.servicesRemoved,
    files: Array.isArray(row.files) ? row.files : [],
    approvedByName: row.approvedByName,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
  };
}

function buildInstallmentCreates(
  plannedValue: Prisma.Decimal | null | undefined,
  parcelCountRaw: unknown,
  installmentsRaw: unknown,
  startDate: Date | null
): Array<{
  number: number;
  amount: Prisma.Decimal;
  dueDate: Date | null;
  status: InstallmentStatus;
  note: string | null;
}> {
  if (Array.isArray(installmentsRaw) && installmentsRaw.length > 0) {
    return installmentsRaw.map((item, index) => {
      const row = (item || {}) as Record<string, unknown>;
      const amountNum = parseMoneyInput(row.amount);
      if (amountNum == null) throw createError(`Informe o valor da parcela ${index + 1}`, 400);
      return {
        number: Number(row.number) > 0 ? Math.floor(Number(row.number)) : index + 1,
        amount: new Prisma.Decimal(amountNum.toFixed(2)),
        dueDate: parseDateField(row.dueDate, `Vencimento da parcela ${index + 1}`),
        status: normalizeInstallmentStatus(row.status),
        note: optionalStr(row.note),
      };
    });
  }

  const parcelCount = Math.floor(Number(parcelCountRaw));
  if (!Number.isFinite(parcelCount) || parcelCount < 1) return [];
  if (parcelCount > 60) throw createError('No máximo 60 parcelas', 400);
  const total = plannedValue != null ? Number(plannedValue) : 0;
  if (!(total > 0)) {
    throw createError('Informe o valor planejado para gerar as parcelas', 400);
  }
  const amounts = splitAmountInInstallments(total, parcelCount);
  return amounts.map((amount, index) => {
    let dueDate: Date | null = null;
    if (startDate) {
      const d = new Date(startDate);
      d.setUTCMonth(d.getUTCMonth() + index);
      dueDate = d;
    }
    return {
      number: index + 1,
      amount: new Prisma.Decimal(amount.toFixed(2)),
      dueDate,
      status: 'PENDING' as const,
      note: null,
    };
  });
}

const empreiteiroInclude = {
  contract: {
    select: {
      id: true,
      name: true,
      number: true,
      costCenter: { select: { id: true, name: true } },
    },
  },
  contracts: {
    include: contractLinkInclude,
    orderBy: [{ isActive: 'desc' as const }, { startDate: 'desc' as const }, { createdAt: 'desc' as const }],
  },
  teamMembers: { orderBy: { sortOrder: 'asc' as const } },
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      profilePhotoUrl: true,
      profilePhotoKey: true,
    },
  },
} as const;

async function profilePhotoFromUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { profilePhotoUrl: true, profilePhotoKey: true },
  });
  return {
    photoUrl: user?.profilePhotoUrl ?? null,
    photoKey: user?.profilePhotoKey ?? null,
  };
}

/** Cadastro da empreita usa centro de custo; o vínculo interno continua no contrato do CC. */
async function resolveContractIdForCostCenter(costCenterId: string): Promise<string> {
  const cc = await prisma.costCenter.findUnique({
    where: { id: costCenterId },
    select: { id: true, name: true },
  });
  if (!cc) throw createError('Centro de custo não encontrado', 404);
  const contract = await prisma.contract.findFirst({
    where: { costCenterId },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    select: { id: true },
  });
  if (!contract) {
    throw createError(
      `Nenhum contrato vinculado ao centro de custo ${cc.name || ''}`.trim(),
      400
    );
  }
  return contract.id;
}

async function resolveEmpreiteiroContractId(body: Record<string, unknown> | undefined): Promise<string> {
  const costCenterId = str(body?.costCenterId);
  if (costCenterId) return resolveContractIdForCostCenter(costCenterId);
  const contractId = str(body?.contractId);
  if (contractId) {
    const contrato = await prisma.contract.findUnique({
      where: { id: contractId },
      select: { id: true },
    });
    if (!contrato) throw createError('Contrato não encontrado', 404);
    return contractId;
  }
  throw createError('Centro de custo é obrigatório', 400);
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function digits(value: unknown): string {
  return str(value).replace(/\D/g, '');
}

function optionalStr(value: unknown): string | null {
  const v = str(value);
  return v ? v : null;
}

function parseRequiredCpfCnpj(body: Record<string, unknown> | undefined) {
  const cpf = digits(body?.cpf);
  const cnpj = digits(body?.cnpj);
  if (cpf.length !== 11) throw createError('CPF é obrigatório e deve ter 11 dígitos', 400);
  if (cnpj.length !== 14) throw createError('CNPJ é obrigatório e deve ter 14 dígitos', 400);
  return { cpf, cnpj };
}

function parseDateField(value: unknown, label: string): Date | null {
  if (value === undefined || value === null || value === '') return null;
  const raw = str(value);
  if (!raw) return null;
  // Calendário YYYY-MM-DD (com ou sem hora ISO): guarda meio-dia UTC do dia civil
  // para não “voltar” um dia em America/Sao_Paulo na exibição.
  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymd) {
    return new Date(`${ymd[1]}-${ymd[2]}-${ymd[3]}T12:00:00.000Z`);
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw createError(`${label} inválida`, 400);
  return date;
}

function assertDateRange(start: Date | null, end: Date | null) {
  if (start && end && end < start) {
    throw createError('A data de fim não pode ser anterior à data de início', 400);
  }
}

function parseIsActive(value: unknown, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  const raw = str(value).toLowerCase();
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  return Boolean(value);
}

function parseImageContentType(dataUrl: string): string {
  const match = /^data:([^;]+);base64,/i.exec(dataUrl);
  return match?.[1]?.trim() || 'image/jpeg';
}

async function resolvePhotoFields(
  raw: unknown,
  userId: string,
  current?: { photoUrl: string | null; photoKey: string | null }
): Promise<{ photoUrl: string | null; photoKey: string | null } | undefined> {
  if (raw === undefined) return undefined;
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return { photoUrl: null, photoKey: null };
  if (value.startsWith('data:image/')) {
    const upload = await photoService.uploadPhotoFromBase64(
      value,
      userId,
      parseImageContentType(value)
    );
    return { photoUrl: upload.url, photoKey: upload.key };
  }
  if (
    current?.photoUrl &&
    (value === current.photoUrl || (current.photoKey && value.includes(current.photoKey)))
  ) {
    return { photoUrl: current.photoUrl, photoKey: current.photoKey };
  }
  throw createError('Foto inválida', 400);
}

type PaymentFile = { url: string; name: string; key?: string };

type TeamMemberInput = {
  name: string;
  role: string;
  phone: string | null;
  document: string | null;
  sortOrder: number;
  photoUrl: string | null;
  photoKey: string | null;
};

function parsePaymentFiles(raw: unknown): PaymentFile[] {
  if (raw === undefined || raw === null || raw === '') return [];
  if (!Array.isArray(raw)) throw createError('Arquivos de pagamento inválidos', 400);
  const files: PaymentFile[] = [];
  for (const item of raw) {
    const row = (item || {}) as Record<string, unknown>;
    const url = str(row.url);
    const name = str(row.name) || 'arquivo';
    const key = optionalStr(row.key) ?? undefined;
    if (!url) continue;
    if (url.startsWith('data:')) {
      throw createError('Envie o comprovante pelo campo de notas', 400);
    }
    files.push({ url, name, ...(key ? { key } : {}) });
  }
  return files;
}

async function resolveTeamMemberPhoto(
  raw: unknown,
  userId: string,
  personIndex: number
): Promise<{ photoUrl: string | null; photoKey: string | null }> {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return { photoUrl: null, photoKey: null };
  if (value.startsWith('data:image/')) {
    const upload = await photoService.uploadPhotoFromBase64(
      value,
      userId,
      parseImageContentType(value)
    );
    return { photoUrl: upload.url, photoKey: upload.key };
  }
  if (value.startsWith('http://') || value.startsWith('https://') || value.startsWith('/uploads')) {
    return { photoUrl: value, photoKey: null };
  }
  throw createError(`Foto da pessoa ${personIndex + 1} da equipe inválida`, 400);
}

async function parseTeamMembers(raw: unknown, userId: string): Promise<TeamMemberInput[]> {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw createError('Equipe inválida', 400);

  const members: TeamMemberInput[] = [];
  for (let i = 0; i < raw.length; i += 1) {
    const row = (raw[i] || {}) as Record<string, unknown>;
    const name = str(row.name);
    const role = str(row.role);
    const phone = digits(row.phone);
    const document = digits(row.document);
    const photoRaw = typeof row.photo === 'string' ? row.photo : '';
    if (!name && !role && !phone && !document && !photoRaw) continue;
    if (!name) throw createError(`Nome da pessoa ${i + 1} da equipe é obrigatório`, 400);
    if (!role) throw createError(`Função da pessoa ${i + 1} da equipe é obrigatória`, 400);
    if (phone && phone.length < 10) {
      throw createError(`Telefone da pessoa ${i + 1} da equipe é inválido`, 400);
    }
    if (document && document.length !== 11) {
      throw createError(`CPF da pessoa ${i + 1} da equipe deve ter 11 dígitos`, 400);
    }
    const photo = await resolveTeamMemberPhoto(row.photo, userId, i);
    members.push({
      name,
      role,
      phone: phone || null,
      document: document || null,
      sortOrder: members.length,
      photoUrl: photo.photoUrl,
      photoKey: photo.photoKey,
    });
  }
  return members;
}

const EMPREITEIRO_CONTRACT_STATUSES = [
  'NOT_STARTED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
  'OVERDUE',
] as const;

type EmpreiteiroContractStatus = (typeof EMPREITEIRO_CONTRACT_STATUSES)[number];

type ContractLinkRow = {
  id: string;
  empreiteiroId: string;
  name?: string | null;
  description?: string | null;
  plannedValue?: Prisma.Decimal | null;
  location?: string | null;
  contractId?: string | null;
  costCenterId?: string | null;
  startDate: Date | null;
  endDate: Date | null;
  isActive: boolean;
  status?: string | null;
  note: string | null;
  files?: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
  contract?: {
    id: string;
    name: string;
    number: string;
    costCenter?: { id: string; name: string } | null;
  } | null;
  costCenter?: { id: string; name: string; code?: string | null } | null;
  installments?: Array<{
    id: string;
    number: number;
    amount: Prisma.Decimal;
    dueDate: Date | null;
    status: string;
    releasedAt: Date | null;
    releasedBy: string | null;
    paidAt: Date | null;
    paidBy: string | null;
    measurementId: string | null;
    note: string | null;
  }>;
  addenda?: Array<{
    id: string;
    number: number;
    reason: string;
    effectiveDate: Date;
    amount: Prisma.Decimal;
    servicesAdded: string | null;
    servicesRemoved: string | null;
    files: Prisma.JsonValue;
    approvedByName: string | null;
    createdBy: string | null;
    createdAt: Date;
  }>;
  teamMembers?: Array<{
    id: string;
    name: string;
    role: string;
    phone: string | null;
    document: string | null;
    sortOrder: number;
    photoUrl: string | null;
    photoKey: string | null;
    empreiteiroContractId?: string | null;
  }>;
};

function normalizeContractLinkStatus(raw: unknown): EmpreiteiroContractStatus {
  const value = str(raw).toUpperCase().replace(/[\s-]+/g, '_');
  if (value === 'NOT_STARTED' || value === 'NAO_INICIADO' || value === 'NÃO_INICIADO') {
    return 'NOT_STARTED';
  }
  if (value === 'IN_PROGRESS' || value === 'EM_ANDAMENTO' || value === 'ANDAMENTO') {
    return 'IN_PROGRESS';
  }
  if (value === 'COMPLETED' || value === 'CONCLUIDO' || value === 'CONCLUÍDO') {
    return 'COMPLETED';
  }
  if (value === 'CANCELLED' || value === 'CANCELADO') return 'CANCELLED';
  if (value === 'OVERDUE' || value === 'EM_ATRASO' || value === 'ATRASO') return 'OVERDUE';
  return 'IN_PROGRESS';
}

/** Status efetivo: respeita concluído/cancelado; atraso e não iniciado saem do dia civil. */
function resolveContractLinkStatus(row: {
  status?: string | null;
  isActive?: boolean;
  startDate?: Date | null;
  endDate?: Date | null;
}): EmpreiteiroContractStatus {
  const stored = normalizeContractLinkStatus(row.status);
  if (stored === 'COMPLETED' || stored === 'CANCELLED') return stored;

  const todayYmd = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const startYmd = row.startDate ? formatWorkDate(new Date(row.startDate)) : '';
  const endYmd = row.endDate ? formatWorkDate(new Date(row.endDate)) : '';

  if (endYmd && endYmd < todayYmd) return 'OVERDUE';
  if (startYmd && startYmd > todayYmd) return 'NOT_STARTED';
  if (stored === 'OVERDUE' || stored === 'NOT_STARTED') return 'IN_PROGRESS';
  if (row.isActive === false) return 'COMPLETED';
  return stored;
}

function statusImpliesActive(status: EmpreiteiroContractStatus): boolean {
  return status === 'NOT_STARTED' || status === 'IN_PROGRESS' || status === 'OVERDUE';
}

function parseContractLinkStatus(raw: unknown): EmpreiteiroContractStatus {
  const value = str(raw);
  if (!value) throw createError('Status do contrato é obrigatório', 400);
  const key = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  const map: Record<string, EmpreiteiroContractStatus> = {
    not_started: 'NOT_STARTED',
    nao_iniciado: 'NOT_STARTED',
    in_progress: 'IN_PROGRESS',
    em_andamento: 'IN_PROGRESS',
    andamento: 'IN_PROGRESS',
    completed: 'COMPLETED',
    concluido: 'COMPLETED',
    cancelled: 'CANCELLED',
    canceled: 'CANCELLED',
    cancelado: 'CANCELLED',
    overdue: 'OVERDUE',
    em_atraso: 'OVERDUE',
    atraso: 'OVERDUE',
  };
  const status = map[key] || normalizeContractLinkStatus(value);
  if (!EMPREITEIRO_CONTRACT_STATUSES.includes(status)) {
    throw createError(
      'Status inválido. Use: não iniciado, em andamento, concluído, cancelado ou em atraso',
      400
    );
  }
  return status;
}

function defaultStatusForDates(startDate: Date | null, endDate: Date | null): EmpreiteiroContractStatus {
  return resolveContractLinkStatus({
    status: 'IN_PROGRESS',
    isActive: true,
    startDate,
    endDate,
  });
}

type ContractMeasurementStats = { count: number; executedAmount: number };

function serializeContractLink(
  row: ContractLinkRow,
  measurementStats: ContractMeasurementStats | number = { count: 0, executedAmount: 0 }
) {
  const measurementCount =
    typeof measurementStats === 'number' ? measurementStats : measurementStats.count;
  const executedAmountTotal =
    typeof measurementStats === 'number' ? 0 : measurementStats.executedAmount;
  let status = resolveContractLinkStatus(row);
  if (status === 'NOT_STARTED' && measurementCount > 0) status = 'IN_PROGRESS';
  const serviceName = str(row.name) || row.contract?.name || 'Contrato de serviço';
  const centroCustoNome =
    row.costCenter?.name || row.contract?.costCenter?.name || '';
  const installments = (row.installments ?? []).map(serializeInstallment);
  const addenda = (row.addenda ?? []).map(serializeAddendum);
  const baseValue = row.plannedValue != null ? Number(row.plannedValue) : 0;
  const addendaTotal = addenda.reduce((sum, a) => sum + a.amount, 0);
  const currentValue = Number((baseValue + addendaTotal).toFixed(2));
  return {
    id: row.id,
    empreiteiroId: row.empreiteiroId,
    name: serviceName,
    description: row.description ?? null,
    plannedValue: row.plannedValue != null ? Number(row.plannedValue) : null,
    /** Soma dos aditivos. */
    addendaTotal,
    /** Valor vigente = planejado + aditivos. */
    currentValue: row.plannedValue != null || addenda.length > 0 ? currentValue : null,
    location: row.location ?? null,
    contractId: row.contractId ?? null,
    costCenterId: row.costCenterId ?? row.costCenter?.id ?? null,
    /** YYYY-MM-DD civil — evita deslocar dia no fuso do browser. */
    startDate: row.startDate ? formatWorkDate(row.startDate) : null,
    endDate: row.endDate ? formatWorkDate(row.endDate) : null,
    isActive: statusImpliesActive(status),
    status,
    note: row.note,
    files: Array.isArray(row.files) ? row.files : [],
    installments,
    installmentsCount: installments.length,
    installmentsPending: installments.filter((i) => i.status === 'PENDING').length,
    installmentsReleased: installments.filter((i) => i.status === 'RELEASED').length,
    installmentsPaid: installments.filter((i) => i.status === 'PAID').length,
    addenda,
    addendaCount: addenda.length,
    /** Nome do contrato de serviço (não o contrato do sistema). */
    contratoNome: serviceName,
    contractNumber: row.contract?.number ?? '',
    centroCustoNome,
    measurementCount,
    /** Soma das baixas do gestor (independente de parcelas/pagamento). */
    executedAmountTotal: Number(executedAmountTotal.toFixed(2)),
    /** Equipe deste contrato de serviço. */
    team: (row.teamMembers ?? []).map(serializeTeamMember),
    teamCount: (row.teamMembers ?? []).length,
    contract: row.contract
      ? {
          id: row.contract.id,
          name: row.contract.name,
          number: row.contract.number,
          costCenter: row.contract.costCenter
            ? { id: row.contract.costCenter.id, name: row.contract.costCenter.name }
            : null,
        }
      : null,
    costCenter: row.costCenter
      ? { id: row.costCenter.id, name: row.costCenter.name, code: row.costCenter.code ?? null }
      : null,
  };
}

function parsePlannedValue(value: unknown): Prisma.Decimal | null {
  const num = parseMoneyInput(value);
  if (num == null) return null;
  return new Prisma.Decimal(num.toFixed(2));
}

function serializeEmpreiteiro(
  row: {
    id: string;
    name: string;
    tradeName: string | null;
    documentKind: string;
    document: string;
    cpf: string | null;
    phone: string;
    specialty: string;
    contractId: string;
    isActive: boolean;
    contactName: string | null;
    email: string | null;
    city: string | null;
    state: string | null;
    pixKey: string | null;
    bank: string | null;
    agency: string | null;
    account: string | null;
    startDate: Date | null;
    endDate: Date | null;
    photoUrl: string | null;
    photoKey: string | null;
    files?: Prisma.JsonValue;
    userId?: string | null;
    user?: {
      id: string;
      name: string;
      email: string;
      profilePhotoUrl?: string | null;
      profilePhotoKey?: string | null;
    } | null;
    createdAt: Date;
    updatedAt: Date;
    contract?: {
      id: string;
      name: string;
      number: string;
      costCenter?: { id: string; name: string } | null;
    } | null;
    contracts?: ContractLinkRow[];
    teamMembers?: Array<{
      id: string;
      name: string;
      role: string;
      phone: string | null;
      document: string | null;
      sortOrder: number;
      photoUrl: string | null;
      photoKey: string | null;
    }>;
  },
  measurementStatsByContract: Record<string, ContractMeasurementStats | number> = {}
) {
  const contracts = (row.contracts ?? []).map((link) =>
    serializeContractLink(
      link,
      measurementStatsByContract[link.id] || { count: 0, executedAmount: 0 }
    )
  );
  // Compat: equipe agregada (preferir sempre contracts[].team no front).
  const teamFromContracts = contracts.flatMap((c) => c.team || []);
  const teamLegacy = (row.teamMembers ?? [])
    .filter((m) => !m.empreiteiroContractId)
    .map(serializeTeamMember);
  const team = teamFromContracts.length > 0 ? teamFromContracts : teamLegacy;
  const serviceCentro =
    contracts.find((c) => c.costCenter?.name)?.costCenter?.name ||
    contracts.find((c) => c.centroCustoNome)?.centroCustoNome ||
    '';
  return {
    id: row.id,
    name: row.name,
    tradeName: row.tradeName,
    documentKind: row.documentKind,
    document: row.document,
    cpf: row.cpf,
    cnpj: digits(row.document).length === 14 ? row.document : null,
    phone: row.phone,
    specialty: row.specialty,
    contractId: row.contractId,
    isActive: row.isActive,
    contactName: row.contactName,
    email: row.email,
    city: row.city,
    state: row.state,
    pixKey: row.pixKey,
    bank: row.bank,
    agency: row.agency,
    account: row.account,
    startDate: row.startDate ? formatWorkDate(row.startDate) : null,
    endDate: row.endDate ? formatWorkDate(row.endDate) : null,
    photoUrl: row.photoUrl || row.user?.profilePhotoUrl || null,
    files: Array.isArray(row.files) ? row.files : [],
    userId: row.userId ?? null,
    userName: row.user?.name ?? null,
    userEmail: row.user?.email ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    contratoNome: row.contract?.name ?? '',
    centroCustoNome: row.contract?.costCenter?.name || serviceCentro || '',
    contract: row.contract
      ? {
          id: row.contract.id,
          name: row.contract.name,
          number: row.contract.number,
          costCenter: row.contract.costCenter
            ? { id: row.contract.costCenter.id, name: row.contract.costCenter.name }
            : null,
        }
      : null,
    contracts,
    contractsCount: contracts.length,
    team,
    teamCount: team.length,
  };
}

async function measurementStatsForEmpreiteiroIds(empreiteiroIds: string[]) {
  const ids = [...new Set(empreiteiroIds.filter(Boolean))];
  const byEmpreiteiro: Record<string, Record<string, ContractMeasurementStats>> = {};
  for (const id of ids) byEmpreiteiro[id] = {};
  if (ids.length === 0) return byEmpreiteiro;

  const rows = await prisma.empreiteiroDailyMeasurement.findMany({
    where: { empreiteiroId: { in: ids } },
    select: {
      empreiteiroId: true,
      empreiteiroContractId: true,
      status: true,
      executedAmount: true,
    },
  });
  for (const row of rows) {
    if (!row.empreiteiroContractId) continue;
    const map = byEmpreiteiro[row.empreiteiroId] || (byEmpreiteiro[row.empreiteiroId] = {});
    if (!map[row.empreiteiroContractId]) {
      map[row.empreiteiroContractId] = { count: 0, executedAmount: 0 };
    }
    map[row.empreiteiroContractId].count += 1;
    if (
      String(row.status || '').toUpperCase() === 'APPROVED' &&
      row.executedAmount != null
    ) {
      map[row.empreiteiroContractId].executedAmount += Number(row.executedAmount);
    }
  }
  return byEmpreiteiro;
}

async function measurementStatsForEmpreiteiro(empreiteiroId: string) {
  const all = await measurementStatsForEmpreiteiroIds([empreiteiroId]);
  return all[empreiteiroId] || {};
}

/** @deprecated use measurementStatsForEmpreiteiro */
async function measurementCountsForEmpreiteiro(empreiteiroId: string) {
  return measurementStatsForEmpreiteiro(empreiteiroId);
}

async function upsertPrimaryContractLink(
  tx: Prisma.TransactionClient,
  empreiteiroId: string,
  contractId: string,
  startDate: Date | null,
  endDate: Date | null,
  serviceName?: string | null
) {
  const status = defaultStatusForDates(startDate, endDate);
  const existing = await tx.empreiteiroContract.findFirst({
    where: { empreiteiroId, contractId },
    orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
  });
  if (existing) {
    await tx.empreiteiroContract.update({
      where: { id: existing.id },
      data: {
        startDate,
        endDate,
        status,
        isActive: statusImpliesActive(status),
        ...(serviceName ? { name: serviceName } : {}),
      },
    });
    return;
  }
  let name = str(serviceName);
  if (!name) {
    const contrato = await tx.contract.findUnique({
      where: { id: contractId },
      select: { name: true },
    });
    name = contrato?.name || 'Contrato de serviço';
  }
  await tx.empreiteiroContract.create({
    data: {
      empreiteiroId,
      name,
      contractId,
      startDate,
      endDate,
      status,
      isActive: statusImpliesActive(status),
    },
  });
}

/** Libera CPF/CNPJ únicos ao encerrar, para religar o mesmo login em outra empreita. */
function releaseEmpreiteiroDocs(id: string, document: string, cpf: string | null) {
  const stamp = Date.now().toString(36);
  const short = id.replace(/[^a-zA-Z0-9]/g, '').slice(-8) || 'x';
  const cpfDigits = `${Date.now()}${short}`.replace(/\D/g, '').padEnd(20, '0').slice(0, 11);
  return {
    document: `ended.${short}.${stamp}.${document}`.slice(0, 191),
    cpf: cpf ? cpfDigits : null,
  };
}

const DAILY_MEASUREMENT_UNITS = ['m²', 'm³', 'm', 'un', 'kg', 'h'] as const;

function parseWorkDate(value: unknown): Date {
  const raw = str(value);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw createError('Data da medição inválida', 400);
  return new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00.000Z`);
}

function formatWorkDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseMeasurementPhotos(raw: unknown): Array<
  PaymentFile & {
    latitude?: number;
    longitude?: number;
    accuracy?: number | null;
    capturedAt?: string;
    address?: string | null;
  }
> {
  if (raw === undefined || raw === null || raw === '') return [];
  if (!Array.isArray(raw)) throw createError('Fotos do serviço inválidas', 400);
  const files: Array<
    PaymentFile & {
      latitude?: number;
      longitude?: number;
      accuracy?: number | null;
      capturedAt?: string;
      address?: string | null;
    }
  > = [];
  for (const item of raw) {
    const row = (item || {}) as Record<string, unknown>;
    const url = str(row.url);
    const name = str(row.name) || 'foto-servico.jpg';
    const key = optionalStr(row.key) ?? undefined;
    if (!url) continue;
    if (url.startsWith('data:')) {
      throw createError('Envie as fotos do serviço pela câmera', 400);
    }
    const hasGeo =
      row.latitude !== undefined ||
      row.longitude !== undefined ||
      row.capturedAt !== undefined;
    if (!hasGeo) {
      files.push({ url, name, ...(key ? { key } : {}) });
      continue;
    }
    const latitude = Number(row.latitude);
    const longitude = Number(row.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw createError('Cada foto do serviço precisa da localização no momento da captura', 400);
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw createError('Cada foto do serviço precisa da localização no momento da captura', 400);
    }
    const capturedAtRaw = str(row.capturedAt);
    const capturedAtDate = capturedAtRaw ? new Date(capturedAtRaw) : null;
    if (!capturedAtDate || Number.isNaN(capturedAtDate.getTime())) {
      throw createError('Cada foto do serviço precisa da data e hora da captura', 400);
    }
    const accuracyNum = row.accuracy == null || row.accuracy === '' ? null : Number(row.accuracy);
    const accuracy = accuracyNum != null && Number.isFinite(accuracyNum) ? accuracyNum : null;
    files.push({
      url,
      name,
      ...(key ? { key } : {}),
      latitude,
      longitude,
      accuracy,
      capturedAt: capturedAtDate.toISOString(),
      address: optionalStr(row.address),
    });
  }
  return files;
}

type TeamPhotoStored = {
  url: string;
  name: string;
  key?: string;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  capturedAt: string;
  address?: string | null;
};

function parseTeamPhoto(raw: unknown): TeamPhotoStored | null {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw createError('Foto da equipe inválida', 400);
  }
  const row = raw as Record<string, unknown>;
  const url = str(row.url);
  if (!url) throw createError('Foto da equipe inválida', 400);
  if (url.startsWith('data:')) {
    throw createError('Envie a foto da equipe pela câmera', 400);
  }
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
    throw createError('A foto da equipe precisa da localização no momento da captura', 400);
  }
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw createError('A foto da equipe precisa da localização no momento da captura', 400);
  }
  const capturedAtRaw = str(row.capturedAt);
  const capturedAtDate = capturedAtRaw ? new Date(capturedAtRaw) : null;
  if (!capturedAtDate || Number.isNaN(capturedAtDate.getTime())) {
    throw createError('A foto da equipe precisa da data e hora da captura', 400);
  }
  const accuracyNum = row.accuracy == null || row.accuracy === '' ? null : Number(row.accuracy);
  const accuracy = accuracyNum != null && Number.isFinite(accuracyNum) ? accuracyNum : null;
  return {
    url,
    name: str(row.name) || 'foto-equipe.jpg',
    key: optionalStr(row.key) ?? undefined,
    latitude,
    longitude,
    accuracy,
    capturedAt: capturedAtDate.toISOString(),
    address: optionalStr(row.address),
  };
}

function serializeTeamPhoto(raw: Prisma.JsonValue | null | undefined): TeamPhotoStored | null {
  try {
    return parseTeamPhoto(raw);
  } catch {
    return null;
  }
}

function parseQuantity(value: unknown): Prisma.Decimal | null {
  if (value === undefined || value === null || value === '') return null;
  const num = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  if (!Number.isFinite(num) || num < 0) throw createError('Quantidade inválida', 400);
  return new Prisma.Decimal(num.toFixed(2));
}

function parseUnit(value: unknown, quantity: Prisma.Decimal | null): string | null {
  const unit = str(value);
  if (!unit) {
    if (quantity) throw createError('Informe a unidade da quantidade', 400);
    return null;
  }
  if (!DAILY_MEASUREMENT_UNITS.includes(unit as (typeof DAILY_MEASUREMENT_UNITS)[number])) {
    throw createError('Unidade inválida', 400);
  }
  return unit;
}

async function resolveDailyWorkers(
  empreiteiroId: string,
  rawIds: unknown,
  empreiteiroContractId?: string | null
) {
  const ids = Array.isArray(rawIds)
    ? [...new Set(rawIds.map((id) => str(id)).filter(Boolean))]
    : [];
  if (ids.length === 0) return [];
  const members = await prisma.empreiteiroTeamMember.findMany({
    where: {
      empreiteiroId,
      id: { in: ids },
      ...(empreiteiroContractId
        ? {
            OR: [
              { empreiteiroContractId },
              { empreiteiroContractId: null }, // legado ainda sem vínculo
            ],
          }
        : {}),
    },
  });
  if (members.length !== ids.length) {
    throw createError(
      empreiteiroContractId
        ? 'Selecione apenas pessoas da equipe deste contrato de serviço'
        : 'Selecione apenas pessoas da equipe desta empreita',
      400
    );
  }
  const byId = new Map(members.map((member) => [member.id, member]));
  return ids.map((id) => {
    const member = byId.get(id)!;
    return { teamMemberId: member.id, name: member.name, role: member.role };
  });
}

async function replaceContractTeam(
  db: InstallmentDb,
  empreiteiroId: string,
  empreiteiroContractId: string,
  team: TeamMemberInput[]
) {
  await db.empreiteiroTeamMember.deleteMany({
    where: { empreiteiroId, empreiteiroContractId },
  });
  if (team.length === 0) return;
  await db.empreiteiroTeamMember.createMany({
    data: team.map((member) => ({
      ...member,
      empreiteiroId,
      empreiteiroContractId,
    })),
  });
}

const DAILY_MEASUREMENT_STATUSES = ['SUBMITTED', 'APPROVED', 'CORRECTION'] as const;
type DailyMeasurementStatus = (typeof DAILY_MEASUREMENT_STATUSES)[number];

function normalizeDailyStatus(value: unknown): DailyMeasurementStatus {
  const raw = str(value).toUpperCase();
  if (raw === 'APPROVED' || raw === 'CORRECTION' || raw === 'SUBMITTED') return raw;
  return 'SUBMITTED';
}

function serializeDailyMeasurement(row: {
  id: string;
  empreiteiroId: string;
  empreiteiroContractId?: string | null;
  contractId?: string | null;
  workDate: Date;
  description: string;
  confirmedBy: string | null;
  quantity: Prisma.Decimal | null;
  unit: string | null;
  photos: Prisma.JsonValue;
  teamPhoto: Prisma.JsonValue | null;
  status?: string | null;
  executedAmount?: Prisma.Decimal | null;
  approvedBy?: string | null;
  approvedAt?: Date | null;
  returnedBy?: string | null;
  returnedAt?: Date | null;
  correctionNote?: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  empreiteiroContract?: {
    id: string;
    name: string;
    plannedValue?: Prisma.Decimal | null;
    costCenter?: { id: string; name: string } | null;
  } | null;
  contract?: {
    id: string;
    name: string;
    number: string;
    costCenter?: { id: string; name: string } | null;
  } | null;
  workers?: Array<{ id: string; teamMemberId: string | null; name: string; role: string }>;
}) {
  const serviceName = row.empreiteiroContract?.name || row.contract?.name || '';
  const centroCustoNome =
    row.empreiteiroContract?.costCenter?.name || row.contract?.costCenter?.name || '';
  return {
    id: row.id,
    empreiteiroId: row.empreiteiroId,
    empreiteiroContractId: row.empreiteiroContractId ?? null,
    /** Compat: id do contrato de serviço (use empreiteiroContractId). */
    contractId: row.empreiteiroContractId ?? row.contractId ?? null,
    workDate: formatWorkDate(row.workDate),
    description: row.description,
    confirmedBy: row.confirmedBy,
    quantity: row.quantity != null ? Number(row.quantity) : null,
    unit: row.unit,
    photos: Array.isArray(row.photos) ? row.photos : [],
    teamPhoto: serializeTeamPhoto(row.teamPhoto),
    status: normalizeDailyStatus(row.status),
    executedAmount: row.executedAmount != null ? Number(row.executedAmount) : null,
    approvedBy: row.approvedBy ?? null,
    approvedAt: row.approvedAt ?? null,
    returnedBy: row.returnedBy ?? null,
    returnedAt: row.returnedAt ?? null,
    correctionNote: row.correctionNote ?? null,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    contratoNome: serviceName,
    centroCustoNome,
    workers: (row.workers ?? []).map((worker) => ({
      id: worker.id,
      teamMemberId: worker.teamMemberId,
      name: worker.name,
      role: worker.role,
    })),
  };
}

const dailyMeasurementInclude = {
  workers: { orderBy: { name: 'asc' as const } },
  empreiteiroContract: {
    select: {
      id: true,
      name: true,
      plannedValue: true,
      costCenter: { select: { id: true, name: true } },
    },
  },
  contract: {
    select: {
      id: true,
      name: true,
      number: true,
      costCenter: { select: { id: true, name: true } },
    },
  },
} as const;

/** Resolve o id do contrato de serviço (EmpreiteiroContract). */
async function resolveMeasurementServiceContractId(
  empreiteiroId: string,
  requested: unknown,
  fallbackServiceId?: string | null
): Promise<{ empreiteiroContractId: string; systemContractId: string | null }> {
  const requestedId = str(requested);
  if (requestedId) {
    const byService = await prisma.empreiteiroContract.findFirst({
      where: { id: requestedId, empreiteiroId },
      select: { id: true, contractId: true },
    });
    if (byService) {
      return {
        empreiteiroContractId: byService.id,
        systemContractId: byService.contractId,
      };
    }
    // Compat: front antigo enviava contractId do sistema.
    const bySystem = await prisma.empreiteiroContract.findFirst({
      where: { empreiteiroId, contractId: requestedId },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
      select: { id: true, contractId: true },
    });
    if (bySystem) {
      return {
        empreiteiroContractId: bySystem.id,
        systemContractId: bySystem.contractId,
      };
    }
    throw createError('Este contrato de serviço não está vinculado a esta empreita', 400);
  }
  if (fallbackServiceId) {
    const link = await prisma.empreiteiroContract.findFirst({
      where: { id: fallbackServiceId, empreiteiroId },
      select: { id: true, contractId: true },
    });
    if (link) {
      return { empreiteiroContractId: link.id, systemContractId: link.contractId };
    }
  }
  const active = await prisma.empreiteiroContract.findFirst({
    where: { empreiteiroId, isActive: true },
    orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, contractId: true },
  });
  if (active) {
    return { empreiteiroContractId: active.id, systemContractId: active.contractId };
  }
  throw createError('Cadastre um contrato de serviço antes de registrar a entrega', 400);
}

type EmpreiteiroScope = {
  scoped: boolean;
  ownId: string | null;
};

async function resolveEmpreiteiroScope(userId?: string | null): Promise<EmpreiteiroScope> {
  if (!userId) return { scoped: false, ownId: null };
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      employee: { select: { id: true } },
      empreiteiro: { select: { id: true } },
    },
  });
  if (!user) return { scoped: false, ownId: null };
  const ownId = user.empreiteiro?.id ?? null;
  if (ownId) return { scoped: true, ownId };
  // Login de empreiteiro (sem ficha de funcionário): nunca vê/gerencia os outros.
  if (!user.employee) return { scoped: true, ownId: null };
  return { scoped: false, ownId: null };
}

async function assertCanAccessEmpreiteiro(req: AuthRequest, empreiteiroId: string) {
  const scope = await resolveEmpreiteiroScope(req.user?.id);
  if (!scope.scoped) return;
  if (!scope.ownId || scope.ownId !== empreiteiroId) {
    throw createError('Você só pode acessar o seu cadastro de empreita', 403);
  }
}

async function assertCanManageEmpreiteiros(req: AuthRequest) {
  const scope = await resolveEmpreiteiroScope(req.user?.id);
  if (scope.scoped) {
    throw createError(
      'Sua conta só pode gerenciar a equipe e as medições — contratos de serviço são da Gennesis',
      403
    );
  }
}

async function assertLinkableEmpreiteiroUser(
  linkUserId: string,
  currentEmpreiteiroId?: string | null
) {
  const linkUser = await prisma.user.findUnique({
    where: { id: linkUserId },
    select: {
      id: true,
      isActive: true,
      name: true,
      email: true,
      employee: { select: { id: true } },
      empreiteiro: { select: { id: true } },
    },
  });
  if (!linkUser || !linkUser.isActive) {
    throw createError('Login informado não encontrado ou inativo', 400);
  }
  if (linkUser.employee) {
    throw createError('Este login já é de um funcionário e não pode ser vinculado a empreita', 400);
  }
  if (
    linkUser.empreiteiro &&
    (!currentEmpreiteiroId || linkUser.empreiteiro.id !== currentEmpreiteiroId)
  ) {
    throw createError('Este login já está vinculado a outro cadastro de empreita', 400);
  }
  return linkUser;
}

async function ensureEmpreiteiroModuleAccess(
  db: Prisma.TransactionClient | typeof prisma,
  userId: string
) {
  const module = pathToModuleKey('/ponto/empreiteiros');
  const existing = await db.userPermission.findFirst({
    where: { userId, module, action: PERMISSION_ACCESS_ACTION },
  });
  if (!existing) {
    await db.userPermission.create({
      data: {
        userId,
        module,
        action: PERMISSION_ACCESS_ACTION,
        allowed: true,
      },
    });
  }
}

/** Fiscal/interno com Controle «Aprovar medições de entrega». Conta de empreita não aprova. */
async function assertCanApproveDailyMeasurement(req: AuthRequest) {
  if (!req.user?.id) throw createError('Usuário não autenticado', 401);
  if (req.user.isAdmin) return;
  const scope = await resolveEmpreiteiroScope(req.user.id);
  if (scope.scoped) {
    throw createError('Sua conta não pode aprovar medições de entrega', 403);
  }
  const allowed = await userHasEmpreiteiroDailyApprovePermission(req.user.id);
  if (!allowed) {
    throw createError(
      'Sem permissão para aprovar medições de entrega. Libere em Permissões → Controle → Aprovar medições de entrega.',
      403
    );
  }
}

function assertTeamPhotoPresent(teamPhoto: TeamPhotoStored | null) {
  if (!teamPhoto?.url) {
    throw createError('Foto da equipe é obrigatória para enviar a entrega', 400);
  }
}

export class EmpreiteiroController {
  /**
   * Logins ativos sem ficha de funcionário e sem empreita (ou já ligados a esta),
   * para vincular no cadastro em Empreitas.
   */
  async listLinkableUsers(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await assertCanManageEmpreiteiros(req);
      const currentEmpreiteiroId =
        typeof req.query.empreiteiroId === 'string' && req.query.empreiteiroId.trim()
          ? req.query.empreiteiroId.trim()
          : null;
      const search =
        typeof req.query.search === 'string' ? req.query.search.trim() : '';

      const rows = await prisma.user.findMany({
        where: {
          isActive: true,
          employee: { is: null },
          AND: [
            {
              OR: [
                { empreiteiro: { is: null } },
                ...(currentEmpreiteiroId
                  ? [{ empreiteiro: { id: currentEmpreiteiroId } }]
                  : []),
              ],
            },
            ...(search
              ? [
                  {
                    OR: [
                      { name: { contains: search, mode: 'insensitive' as const } },
                      { email: { contains: search, mode: 'insensitive' as const } },
                      { cpf: { contains: search.replace(/\D/g, '') } },
                    ],
                  },
                ]
              : []),
          ],
        },
        select: {
          id: true,
          name: true,
          email: true,
          cpf: true,
          empreiteiro: { select: { id: true } },
        },
        orderBy: { name: 'asc' },
        take: 200,
      });

      res.json({
        success: true,
        data: rows.map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          cpf: u.cpf,
          linkedEmpreiteiroId: u.empreiteiro?.id ?? null,
        })),
      });
    } catch (error) {
      next(error);
    }
  }

  async getAll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { search, page = 1, limit = 100, isActive, contractId } = req.query;
      const limitNum = Math.min(Number(limit) || 100, 500);
      const skip = (Number(page) - 1) * limitNum;
      const searchTerm = typeof search === 'string' ? search.trim() : '';
      const contractFilter =
        typeof contractId === 'string' && contractId.trim() ? contractId.trim() : '';

      const where: Prisma.EmpreiteiroWhereInput = {};
      if (isActive !== undefined) where.isActive = isActive === 'true';
      if (contractFilter) {
        where.OR = [
          { contractId: contractFilter },
          { contracts: { some: { contractId: contractFilter } } },
        ];
      }
      const scope = await resolveEmpreiteiroScope(req.user?.id);
      if (scope.scoped && !scope.ownId) {
        res.json({
          success: true,
          data: [],
          pagination: {
            page: Number(page),
            limit: limitNum,
            total: 0,
            totalPages: 1,
          },
        });
        return;
      }
      if (scope.ownId) where.id = scope.ownId;

      if (searchTerm) {
        await ensureUnaccentExtension();
        const all = await prisma.empreiteiro.findMany({
          where,
          include: empreiteiroInclude,
          orderBy: { name: 'asc' },
        });
        const filtered = all.filter(
          (row) =>
            textMatchesSearch(row.name, searchTerm) ||
            textMatchesSearch(row.tradeName, searchTerm) ||
            textMatchesSearch(row.document, searchTerm) ||
            textMatchesSearch(row.cpf, searchTerm) ||
            textMatchesSearch(row.phone, searchTerm) ||
            textMatchesSearch(row.specialty, searchTerm) ||
            textMatchesSearch(row.contactName, searchTerm) ||
            textMatchesSearch(row.city, searchTerm) ||
            textMatchesSearch(row.contract?.name, searchTerm) ||
            textMatchesSearch(row.contract?.number, searchTerm) ||
            textMatchesSearch(row.contract?.costCenter?.name, searchTerm) ||
            row.teamMembers.some(
              (member) =>
                textMatchesSearch(member.name, searchTerm) ||
                textMatchesSearch(member.role, searchTerm) ||
                textMatchesSearch(member.document, searchTerm)
            )
        );
        const total = filtered.length;
        const pageRows = filtered.slice(skip, skip + limitNum);
        for (const row of pageRows) {
          await completeSettledContractsForEmpreiteiro(prisma, row.id);
        }
        const refreshedSearch =
          pageRows.length > 0
            ? await prisma.empreiteiro.findMany({
                where: { id: { in: pageRows.map((row) => row.id) } },
                include: empreiteiroInclude,
              })
            : [];
        const searchById = new Map(refreshedSearch.map((row) => [row.id, row]));
        const pageIds = pageRows.map((row) => row.id);
        const statsByEmpreiteiro = await measurementStatsForEmpreiteiroIds(pageIds);
        const items = pageRows.map((row) =>
          serializeEmpreiteiro(
            searchById.get(row.id) || row,
            statsByEmpreiteiro[row.id] || {}
          )
        );
        res.json({
          success: true,
          data: items,
          pagination: {
            page: Number(page),
            limit: limitNum,
            total,
            totalPages: Math.ceil(total / limitNum) || 1,
          },
        });
        return;
      }

      const [pageItems, total] = await Promise.all([
        prisma.empreiteiro.findMany({
          where,
          skip,
          take: limitNum,
          orderBy: { name: 'asc' },
          include: empreiteiroInclude,
        }),
        prisma.empreiteiro.count({ where }),
      ]);
      for (const row of pageItems) {
        await completeSettledContractsForEmpreiteiro(prisma, row.id);
      }
      const refreshedList =
        pageItems.length > 0
          ? await prisma.empreiteiro.findMany({
              where: { id: { in: pageItems.map((row) => row.id) } },
              include: empreiteiroInclude,
              orderBy: { name: 'asc' },
            })
          : [];
      const listById = new Map(refreshedList.map((row) => [row.id, row]));
      const items = pageItems.map((row) => listById.get(row.id) || row);
      const statsByEmpreiteiro = await measurementStatsForEmpreiteiroIds(
        items.map((row) => row.id)
      );

      res.json({
        success: true,
        data: items.map((row) =>
          serializeEmpreiteiro(row, statsByEmpreiteiro[row.id] || {})
        ),
        pagination: {
          page: Number(page),
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum) || 1,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      await assertCanAccessEmpreiteiro(req, id);
      await completeSettledContractsForEmpreiteiro(prisma, id, req.user?.id || null);
      const item = await prisma.empreiteiro.findUnique({
        where: { id },
        include: empreiteiroInclude,
      });
      if (!item) throw createError('Empreita não encontrada', 404);
      const counts = await measurementCountsForEmpreiteiro(item.id);
      res.json({ success: true, data: serializeEmpreiteiro(item, counts) });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await assertCanManageEmpreiteiros(req);
      const name = str(req.body?.name);
      const { cpf, cnpj } = parseRequiredCpfCnpj(req.body);
      const phone = digits(req.body?.phone);
      const specialty = str(req.body?.specialty);
      const email = optionalStr(req.body?.email)?.toLowerCase() ?? null;

      if (!name) throw createError('Nome é obrigatório', 400);
      if (phone.length < 10) throw createError('Telefone é obrigatório', 400);
      if (!specialty) throw createError('Especialidade é obrigatória', 400);
      if (email && !email.includes('@')) throw createError('E-mail inválido', 400);

      // Centro de custo / obra ficam no contrato de serviço (não no cadastro da empreita).
      let contractId: string | null = null;
      if (str(req.body?.costCenterId) || str(req.body?.contractId)) {
        contractId = await resolveEmpreiteiroContractId(req.body);
      }

      const duplicate = await prisma.empreiteiro.findFirst({
        where: { OR: [{ document: cnpj }, { cpf }] },
      });
      if (duplicate) throw createError('Já existe uma empreita com este CPF ou CNPJ', 400);

      const linkUserId = str(req.body?.userId) || null;
      if (!linkUserId) throw createError('Selecione o login do empreiteiro para vincular', 400);
      await assertLinkableEmpreiteiroUser(linkUserId);

      // Foto vem do perfil do login vinculado (cadastro em Funcionários).
      const linkedPhoto = await profilePhotoFromUser(linkUserId);
      const files = parsePaymentFiles(req.body?.files);

      const created = await prisma.$transaction(async (tx) => {
        const row = await tx.empreiteiro.create({
          data: {
            name,
            tradeName: optionalStr(req.body?.tradeName),
            documentKind: 'CNPJ',
            document: cnpj,
            cpf,
            phone,
            specialty,
            contractId,
            isActive: parseIsActive(req.body?.isActive, true),
            contactName: optionalStr(req.body?.contactName),
            email,
            city: optionalStr(req.body?.city),
            state: optionalStr(req.body?.state)?.toUpperCase() ?? null,
            pixKey: optionalStr(req.body?.pixKey),
            bank: optionalStr(req.body?.bank),
            agency: optionalStr(req.body?.agency),
            account: optionalStr(req.body?.account),
            photoUrl: linkedPhoto.photoUrl,
            photoKey: linkedPhoto.photoKey,
            files: files as Prisma.InputJsonValue,
            userId: linkUserId,
          },
          include: empreiteiroInclude,
        });
        await ensureEmpreiteiroModuleAccess(tx, linkUserId);
        return row;
      });
      res.status(201).json({
        success: true,
        data: serializeEmpreiteiro(created),
        message: 'Empreita criada e vinculada ao login',
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const item = await prisma.empreiteiro.findUnique({ where: { id } });
      if (!item) throw createError('Empreita não encontrada', 404);
      await assertCanAccessEmpreiteiro(req, item.id);
      const scope = await resolveEmpreiteiroScope(req.user?.id);
      if (scope.scoped) {
        const keys = Object.keys(req.body || {}).filter((key) => req.body?.[key] !== undefined);
        const allowed = new Set(['photo', 'team']);
        if (keys.some((key) => !allowed.has(key))) {
          throw createError('Sua conta só pode atualizar a foto e a equipe', 403);
        }
      }
      const data: Prisma.EmpreiteiroUpdateInput = {};
      let nextDocument = item.document;
      let nextCpf = item.cpf;

      if (req.body?.name !== undefined) {
        const name = str(req.body.name);
        if (!name) throw createError('Nome é obrigatório', 400);
        data.name = name;
      }

      if (req.body?.tradeName !== undefined) data.tradeName = optionalStr(req.body.tradeName);
      if (req.body?.contactName !== undefined) data.contactName = optionalStr(req.body.contactName);
      if (req.body?.city !== undefined) data.city = optionalStr(req.body.city);
      if (req.body?.state !== undefined) {
        data.state = optionalStr(req.body.state)?.toUpperCase() ?? null;
      }
      if (req.body?.pixKey !== undefined) data.pixKey = optionalStr(req.body.pixKey);
      if (req.body?.bank !== undefined) data.bank = optionalStr(req.body.bank);
      if (req.body?.agency !== undefined) data.agency = optionalStr(req.body.agency);
      if (req.body?.account !== undefined) data.account = optionalStr(req.body.account);
      // Foto da empreita: só sincroniza do perfil do login (não há upload neste formulário).
      if (req.body?.startDate !== undefined) data.startDate = parseDateField(req.body.startDate, 'Data de início');
      if (req.body?.endDate !== undefined) data.endDate = parseDateField(req.body.endDate, 'Data de fim');
      if (req.body?.startDate !== undefined || req.body?.endDate !== undefined) {
        const nextStart =
          req.body?.startDate !== undefined
            ? parseDateField(req.body.startDate, 'Data de início')
            : item.startDate;
        const nextEnd =
          req.body?.endDate !== undefined
            ? parseDateField(req.body.endDate, 'Data de fim')
            : item.endDate;
        assertDateRange(nextStart, nextEnd);
      }
      if (req.body?.isActive !== undefined) data.isActive = parseIsActive(req.body.isActive, item.isActive);
      if (req.body?.files !== undefined) {
        data.files = parsePaymentFiles(req.body.files) as Prisma.InputJsonValue;
      }

      if (req.body?.specialty !== undefined) {
        const specialty = str(req.body.specialty);
        if (!specialty) throw createError('Especialidade é obrigatória', 400);
        data.specialty = specialty;
      }

      if (req.body?.phone !== undefined) {
        const phone = digits(req.body.phone);
        if (phone.length < 10) throw createError('Telefone é obrigatório', 400);
        data.phone = phone;
      }

      if (req.body?.email !== undefined) {
        const email = optionalStr(req.body.email)?.toLowerCase() ?? null;
        if (email && !email.includes('@')) throw createError('E-mail inválido', 400);
        data.email = email;
      }

      if (req.body?.costCenterId !== undefined || req.body?.contractId !== undefined) {
        const contractId = await resolveEmpreiteiroContractId(req.body);
        data.contract = { connect: { id: contractId } };
      }

      if (
        req.body?.cpf !== undefined ||
        req.body?.cnpj !== undefined ||
        req.body?.document !== undefined ||
        req.body?.documentKind !== undefined
      ) {
        const parsed = parseRequiredCpfCnpj(req.body);
        nextDocument = parsed.cnpj;
        nextCpf = parsed.cpf;
        data.documentKind = 'CNPJ';
        data.document = parsed.cnpj;
        data.cpf = parsed.cpf;
      }

      if (nextDocument !== item.document) {
        const duplicate = await prisma.empreiteiro.findFirst({
          where: { id: { not: id }, document: nextDocument },
        });
        if (duplicate) throw createError('Já existe uma empreita com este CNPJ', 400);
      }
      if (nextCpf && nextCpf !== item.cpf) {
        const duplicateCpf = await prisma.empreiteiro.findFirst({
          where: { id: { not: id }, cpf: nextCpf },
        });
        if (duplicateCpf) throw createError('Já existe uma empreita com este CPF', 400);
      }

      // Equipe agora é por contrato — aceita team + empreiteiroContractId (compat).
      let teamForContract:
        | { contractId: string; members: TeamMemberInput[] }
        | null = null;
      if (req.body?.team !== undefined) {
        const team = await parseTeamMembers(req.body.team, req.user?.id || 'empreiteiro');
        const contractId =
          str(req.body?.empreiteiroContractId) ||
          str(req.body?.contractLinkId) ||
          (
            await prisma.empreiteiroContract.findFirst({
              where: { empreiteiroId: id, isActive: true },
              orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
              select: { id: true },
            })
          )?.id ||
          '';
        if (!contractId) {
          throw createError(
            'Cadastre um contrato de serviço antes de salvar a equipe',
            400
          );
        }
        teamForContract = { contractId, members: team };
      }

      let nextLinkUserId: string | null | undefined = undefined;
      if (req.body?.userId !== undefined && !scope.scoped) {
        await assertCanManageEmpreiteiros(req);
        const raw = req.body.userId;
        if (raw === null || raw === '') {
          nextLinkUserId = null;
          data.user = { disconnect: true };
        } else {
          const linkUserId = str(raw);
          await assertLinkableEmpreiteiroUser(linkUserId, id);
          nextLinkUserId = linkUserId;
          data.user = { connect: { id: linkUserId } };
          const linkedPhoto = await profilePhotoFromUser(linkUserId);
          data.photoUrl = linkedPhoto.photoUrl;
          data.photoKey = linkedPhoto.photoKey;
        }
      } else if (!scope.scoped && item.userId && req.body?.userId === undefined) {
        // Mantém a foto alinhada ao perfil do login já vinculado.
        const linkedPhoto = await profilePhotoFromUser(item.userId);
        if (linkedPhoto.photoUrl) {
          data.photoUrl = linkedPhoto.photoUrl;
          data.photoKey = linkedPhoto.photoKey;
        }
      }

      const nextContractId =
        req.body?.contractId !== undefined ? str(req.body.contractId) : item.contractId;
      const nextStart =
        req.body?.startDate !== undefined
          ? parseDateField(req.body.startDate, 'Data de início')
          : item.startDate;
      const nextEnd =
        req.body?.endDate !== undefined
          ? parseDateField(req.body.endDate, 'Data de fim')
          : item.endDate;

      const updated = await prisma.$transaction(async (tx) => {
        await tx.empreiteiro.update({
          where: { id },
          data,
          include: empreiteiroInclude,
        });
        if (nextLinkUserId) {
          await ensureEmpreiteiroModuleAccess(tx, nextLinkUserId);
        }
        if (
          nextContractId &&
          (req.body?.contractId !== undefined ||
            req.body?.startDate !== undefined ||
            req.body?.endDate !== undefined)
        ) {
          await upsertPrimaryContractLink(tx, id, nextContractId, nextStart, nextEnd);
        }
        if (teamForContract) {
          const linkOk = await tx.empreiteiroContract.findFirst({
            where: { id: teamForContract.contractId, empreiteiroId: id },
            select: { id: true },
          });
          if (!linkOk) throw createError('Contrato de serviço não encontrado', 404);
          await replaceContractTeam(
            tx,
            id,
            teamForContract.contractId,
            teamForContract.members
          );
        }
        return tx.empreiteiro.findUniqueOrThrow({
          where: { id },
          include: empreiteiroInclude,
        });
      });
      const counts = await measurementCountsForEmpreiteiro(id);
      res.json({
        success: true,
        data: serializeEmpreiteiro(updated, counts),
        message: teamForContract ? 'Equipe do contrato atualizada' : 'Atualizado com sucesso',
      });
    } catch (error) {
      next(error);
    }
  }

  /** Salva a equipe de um contrato de serviço (empreiteiro vinculado ou Gennesis). */
  async updateContractTeam(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id, linkId } = req.params;
      await assertCanAccessEmpreiteiro(req, id);
      const scope = await resolveEmpreiteiroScope(req.user?.id);
      if (!scope.scoped) {
        await assertCanManageEmpreiteiros(req);
      } else if (scope.ownId !== id) {
        throw createError('Sem permissão para alterar esta equipe', 403);
      }

      const link = await prisma.empreiteiroContract.findFirst({
        where: { id: linkId, empreiteiroId: id },
        select: { id: true },
      });
      if (!link) throw createError('Contrato de serviço não encontrado', 404);

      const team = await parseTeamMembers(req.body?.team, req.user?.id || 'empreiteiro');
      await prisma.$transaction(async (tx) => {
        await replaceContractTeam(tx, id, linkId, team);
      });

      await completeSettledContractsForEmpreiteiro(prisma, id, req.user?.id || null);
      const empreiteiro = await prisma.empreiteiro.findUniqueOrThrow({
        where: { id },
        include: empreiteiroInclude,
      });
      const counts = await measurementCountsForEmpreiteiro(id);
      res.json({
        success: true,
        data: serializeEmpreiteiro(empreiteiro, counts),
        message: 'Equipe do contrato atualizada',
      });
    } catch (error) {
      next(error);
    }
  }

  /** Cria um contrato de serviço na empreita (nome + valor planejado). */
  async addContract(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await assertCanManageEmpreiteiros(req);
      const { id } = req.params;
      const empreiteiro = await prisma.empreiteiro.findUnique({ where: { id } });
      if (!empreiteiro) throw createError('Empreita não encontrada', 404);

      const name = str(req.body?.name) || str(req.body?.contratoNome);
      if (!name) throw createError('Nome do contrato de serviço é obrigatório', 400);
      const description = optionalStr(req.body?.description);
      const plannedValue = parsePlannedValue(req.body?.plannedValue);
      const location = optionalStr(req.body?.location);
      const systemContractId = str(req.body?.contractId) || null;
      let costCenterId = str(req.body?.costCenterId) || null;

      if (systemContractId) {
        const contrato = await prisma.contract.findUnique({
          where: { id: systemContractId },
          select: { id: true, costCenterId: true },
        });
        if (!contrato) throw createError('Contrato do sistema não encontrado', 404);
        if (!costCenterId && contrato.costCenterId) costCenterId = contrato.costCenterId;
      }
      if (!costCenterId) throw createError('Centro de custo é obrigatório no contrato de serviço', 400);
      {
        const cc = await prisma.costCenter.findUnique({ where: { id: costCenterId }, select: { id: true } });
        if (!cc) throw createError('Centro de custo não encontrado', 404);
      }

      const startDate = parseDateField(req.body?.startDate, 'Data de início');
      const endDate = parseDateField(req.body?.endDate, 'Data de fim');
      assertDateRange(startDate, endDate);
      const note = optionalStr(req.body?.note);
      const files = parsePaymentFiles(req.body?.files);
      const status =
        req.body?.status !== undefined
          ? parseContractLinkStatus(req.body.status)
          : defaultStatusForDates(startDate, endDate);
      const installmentRows = buildInstallmentCreates(
        plannedValue,
        req.body?.parcelCount ?? req.body?.installmentCount,
        req.body?.installments,
        startDate
      );

      const updated = await prisma.$transaction(async (tx) => {
        await tx.empreiteiroContract.create({
          data: {
            empreiteiroId: id,
            name,
            description,
            plannedValue: plannedValue ?? undefined,
            location,
            contractId: systemContractId,
            costCenterId,
            startDate,
            endDate,
            status,
            isActive: statusImpliesActive(status),
            note,
            files: files as Prisma.InputJsonValue,
            installments: installmentRows.length
              ? {
                  create: installmentRows.map((row) => ({
                    number: row.number,
                    amount: row.amount,
                    dueDate: row.dueDate,
                    status: row.status,
                    note: row.note,
                  })),
                }
              : undefined,
          },
        });
        if (systemContractId) {
          await tx.empreiteiro.update({
            where: { id },
            data: {
              contractId: systemContractId,
              startDate: startDate ?? empreiteiro.startDate,
              endDate: endDate ?? empreiteiro.endDate,
            },
          });
        }
        return tx.empreiteiro.findUniqueOrThrow({
          where: { id },
          include: empreiteiroInclude,
        });
      });
      const counts = await measurementCountsForEmpreiteiro(id);
      res.json({
        success: true,
        data: serializeEmpreiteiro(updated, counts),
        message: 'Contrato de serviço criado',
      });
    } catch (error) {
      next(error);
    }
  }

  /** Atualiza contrato de serviço (nome, valor, datas, status). */
  async updateContract(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await assertCanManageEmpreiteiros(req);
      const { id, linkId } = req.params;
      const link = await prisma.empreiteiroContract.findFirst({
        where: { id: linkId, empreiteiroId: id },
      });
      if (!link) throw createError('Contrato de serviço não encontrado', 404);

      const startDate =
        req.body?.startDate !== undefined
          ? parseDateField(req.body.startDate, 'Data de início')
          : link.startDate;
      const endDate =
        req.body?.endDate !== undefined
          ? parseDateField(req.body.endDate, 'Data de fim')
          : link.endDate;
      assertDateRange(startDate, endDate);

      const status =
        req.body?.status !== undefined
          ? parseContractLinkStatus(req.body.status)
          : resolveContractLinkStatus({ ...link, startDate, endDate });
      const note =
        req.body?.note !== undefined ? optionalStr(req.body.note) : link.note;
      const name =
        req.body?.name !== undefined || req.body?.contratoNome !== undefined
          ? str(req.body?.name) || str(req.body?.contratoNome)
          : link.name;
      if (!name) throw createError('Nome do contrato de serviço é obrigatório', 400);
      const description =
        req.body?.description !== undefined
          ? optionalStr(req.body.description)
          : link.description;
      const plannedValue =
        req.body?.plannedValue !== undefined
          ? parsePlannedValue(req.body.plannedValue)
          : link.plannedValue;
      const location =
        req.body?.location !== undefined ? optionalStr(req.body.location) : link.location;

      let systemContractId =
        req.body?.contractId !== undefined
          ? str(req.body.contractId) || null
          : link.contractId;
      let costCenterId =
        req.body?.costCenterId !== undefined
          ? str(req.body.costCenterId) || null
          : link.costCenterId;
      if (req.body?.contractId !== undefined && systemContractId) {
        const contrato = await prisma.contract.findUnique({
          where: { id: systemContractId },
          select: { id: true, costCenterId: true },
        });
        if (!contrato) throw createError('Contrato do sistema não encontrado', 404);
        if (req.body?.costCenterId === undefined && contrato.costCenterId) {
          costCenterId = contrato.costCenterId;
        }
      }
      if (!costCenterId) {
        throw createError('Centro de custo é obrigatório no contrato de serviço', 400);
      }
      {
        const cc = await prisma.costCenter.findUnique({ where: { id: costCenterId }, select: { id: true } });
        if (!cc) throw createError('Centro de custo não encontrado', 404);
      }
      const files =
        req.body?.files !== undefined ? parsePaymentFiles(req.body.files) : undefined;

      const rebuildInstallments =
        req.body?.installments !== undefined ||
        req.body?.parcelCount !== undefined ||
        req.body?.installmentCount !== undefined;
      const installmentRows = rebuildInstallments
        ? buildInstallmentCreates(
            plannedValue,
            req.body?.parcelCount ?? req.body?.installmentCount,
            req.body?.installments,
            startDate
          )
        : null;

      const updated = await prisma.$transaction(async (tx) => {
        if (rebuildInstallments) {
          const paidLocked = await tx.empreiteiroContractInstallment.count({
            where: {
              empreiteiroContractId: linkId,
              status: 'PAID',
            },
          });
          if (paidLocked > 0) {
            throw createError(
              'Não é possível regenerar parcelas: já existem parcelas pagas',
              400
            );
          }
          const releasedLocked = await tx.empreiteiroContractInstallment.count({
            where: {
              empreiteiroContractId: linkId,
              status: 'RELEASED',
            },
          });
          const nextParcelCount = installmentRows?.length ?? 0;
          // Permite corrigir para à vista (1x) mesmo com parcela só liberada (ainda não paga).
          if (releasedLocked > 0 && nextParcelCount !== 1) {
            throw createError(
              'Não é possível regenerar parcelas: já existem parcelas liberadas. Para corrigir, mude para à vista.',
              400
            );
          }
          await tx.empreiteiroContractInstallment.deleteMany({
            where: { empreiteiroContractId: linkId },
          });
        }
        await tx.empreiteiroContract.update({
          where: { id: linkId },
          data: {
            name,
            description,
            plannedValue: plannedValue ?? null,
            location,
            contractId: systemContractId,
            costCenterId,
            startDate,
            endDate,
            status,
            isActive: statusImpliesActive(status),
            note,
            ...(files !== undefined ? { files: files as Prisma.InputJsonValue } : {}),
            ...(installmentRows && installmentRows.length
              ? {
                  installments: {
                    create: installmentRows.map((row) => ({
                      number: row.number,
                      amount: row.amount,
                      dueDate: row.dueDate,
                      status: row.status,
                      note: row.note,
                    })),
                  },
                }
              : {}),
          },
        });
        if (rebuildInstallments && (installmentRows?.length ?? 0) === 1) {
          await syncInstallmentReleasesForContract(tx, linkId, req.user?.id || null);
        }
        if (!statusImpliesActive(status) && link.contractId) {
          const empreiteiro = await tx.empreiteiro.findUniqueOrThrow({ where: { id } });
          if (empreiteiro.contractId === link.contractId) {
            const nextActive = await tx.empreiteiroContract.findFirst({
              where: {
                empreiteiroId: id,
                isActive: true,
                id: { not: linkId },
                status: { in: ['NOT_STARTED', 'IN_PROGRESS', 'OVERDUE'] },
                contractId: { not: null },
              },
              orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
            });
            if (nextActive?.contractId) {
              await tx.empreiteiro.update({
                where: { id },
                data: {
                  contractId: nextActive.contractId,
                  startDate: nextActive.startDate,
                  endDate: nextActive.endDate,
                },
              });
            }
          }
        }
        return tx.empreiteiro.findUniqueOrThrow({
          where: { id },
          include: empreiteiroInclude,
        });
      });
      const counts = await measurementCountsForEmpreiteiro(id);
      res.json({
        success: true,
        data: serializeEmpreiteiro(updated, counts),
        message: 'Contrato de serviço atualizado',
      });
    } catch (error) {
      next(error);
    }
  }

  /** Encerra um contrato de serviço (concluído; mantém medições). */
  async endContract(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await assertCanManageEmpreiteiros(req);
      const { id, linkId } = req.params;
      const link = await prisma.empreiteiroContract.findFirst({
        where: { id: linkId, empreiteiroId: id },
      });
      if (!link) throw createError('Contrato de serviço não encontrado', 404);

      const endDate =
        parseDateField(req.body?.endDate, 'Data de fim') || link.endDate || new Date();
      assertDateRange(link.startDate, endDate);
      const finalStatus =
        req.body?.status !== undefined
          ? parseContractLinkStatus(req.body.status)
          : 'COMPLETED';
      if (finalStatus !== 'COMPLETED' && finalStatus !== 'CANCELLED') {
        throw createError('Ao encerrar use status concluído ou cancelado', 400);
      }

      const updated = await prisma.$transaction(async (tx) => {
        await tx.empreiteiroContract.update({
          where: { id: linkId },
          data: { isActive: false, endDate, status: finalStatus },
        });
        await reassignEmpreiteiroPrimaryIfNeeded(tx, id, linkId, link.contractId);
        return tx.empreiteiro.findUniqueOrThrow({
          where: { id },
          include: empreiteiroInclude,
        });
      });
      const counts = await measurementCountsForEmpreiteiro(id);
      res.json({
        success: true,
        data: serializeEmpreiteiro(updated, counts),
        message:
          finalStatus === 'CANCELLED'
            ? 'Contrato de serviço cancelado'
            : 'Contrato de serviço concluído',
      });
    } catch (error) {
      next(error);
    }
  }

  /** Exclui o contrato de serviço (e medições ligadas a ele). */
  async deleteContract(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await assertCanManageEmpreiteiros(req);
      const { id, linkId } = req.params;
      const link = await prisma.empreiteiroContract.findFirst({
        where: { id: linkId, empreiteiroId: id },
      });
      if (!link) throw createError('Contrato de serviço não encontrado', 404);

      const updated = await prisma.$transaction(async (tx) => {
        await tx.empreiteiroDailyMeasurement.deleteMany({
          where: { empreiteiroId: id, empreiteiroContractId: linkId },
        });
        await tx.empreiteiroContract.delete({ where: { id: linkId } });

        if (link.contractId) {
          const empreiteiro = await tx.empreiteiro.findUniqueOrThrow({ where: { id } });
          if (empreiteiro.contractId === link.contractId) {
            const nextActive = await tx.empreiteiroContract.findFirst({
              where: {
                empreiteiroId: id,
                isActive: true,
                status: { in: ['NOT_STARTED', 'IN_PROGRESS', 'OVERDUE'] },
                contractId: { not: null },
              },
              orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
            });
            if (nextActive?.contractId) {
              await tx.empreiteiro.update({
                where: { id },
                data: {
                  contractId: nextActive.contractId,
                  startDate: nextActive.startDate,
                  endDate: nextActive.endDate,
                },
              });
            }
          }
        }

        return tx.empreiteiro.findUniqueOrThrow({
          where: { id },
          include: empreiteiroInclude,
        });
      });

      const counts = await measurementCountsForEmpreiteiro(id);
      res.json({
        success: true,
        data: serializeEmpreiteiro(updated, counts),
        message: 'Contrato de serviço excluído',
      });
    } catch (error) {
      next(error);
    }
  }

  async unlink(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const item = await prisma.empreiteiro.findUnique({ where: { id } });
      if (!item) throw createError('Empreita não encontrada', 404);
      await assertCanManageEmpreiteiros(req);

      if (!item.userId && !item.isActive) {
        throw createError('Esta empreita já está encerrada e sem login vinculado', 400);
      }

      const released = releaseEmpreiteiroDocs(item.id, item.document, item.cpf);
      const endDate = item.endDate ?? new Date();

      const updated = await prisma.empreiteiro.update({
        where: { id },
        data: {
          userId: null,
          isActive: false,
          endDate,
          document: released.document,
          cpf: released.cpf,
        },
        include: empreiteiroInclude,
      });

      res.json({
        success: true,
        data: serializeEmpreiteiro(updated),
        message:
          'Empreita encerrada. O login permanece ativo para vincular a outra empreita.',
      });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const item = await prisma.empreiteiro.findUnique({ where: { id } });
      if (!item) throw createError('Empreita não encontrada', 404);
      await assertCanManageEmpreiteiros(req);

      await prisma.$transaction(async (tx) => {
        await tx.empreiteiroDailyMeasurementWorker.deleteMany({
          where: { measurement: { empreiteiroId: id } },
        });
        await tx.empreiteiroDailyMeasurement.deleteMany({ where: { empreiteiroId: id } });
        await tx.empreiteiroContract.deleteMany({ where: { empreiteiroId: id } });
        await tx.empreiteiroTeamMember.deleteMany({ where: { empreiteiroId: id } });
        await tx.empreiteiro.delete({ where: { id } });
      });

      // Mantém o login ativo para religar a outra empreita em Funcionários.
      res.json({
        success: true,
        message: 'Cadastro da empreita excluído. O login do usuário foi mantido.',
      });
    } catch (error) {
      next(error);
    }
  }

  async listDailyMeasurements(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const empreiteiro = await prisma.empreiteiro.findUnique({ where: { id }, select: { id: true } });
      if (!empreiteiro) throw createError('Empreita não encontrada', 404);
      await assertCanAccessEmpreiteiro(req, empreiteiro.id);

      const items = await prisma.empreiteiroDailyMeasurement.findMany({
        where: { empreiteiroId: id },
        include: dailyMeasurementInclude,
        orderBy: { workDate: 'desc' },
      });
      res.json({ success: true, data: items.map(serializeDailyMeasurement) });
    } catch (error) {
      next(error);
    }
  }

  /** Fila global do fiscal. Sem phase (ou PENDING) devolve só o que aguarda aprovação. */
  async listPendingDailyMeasurements(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await assertCanApproveDailyMeasurement(req);
      const phase = str(req.query.phase).toUpperCase();
      const statusWhere =
        phase === 'APPROVED'
          ? { status: 'APPROVED' as const }
          : phase === 'REJECTED' || phase === 'CORRECTION'
            ? { status: 'CORRECTION' as const }
            : phase === 'ALL'
              ? {}
              : { status: 'SUBMITTED' as const };
      const items = await prisma.empreiteiroDailyMeasurement.findMany({
        where: statusWhere,
        include: {
          ...dailyMeasurementInclude,
          empreiteiro: {
            select: {
              id: true,
              name: true,
              specialty: true,
              contract: { select: { id: true, name: true, number: true } },
            },
          },
        },
        orderBy:
          phase === 'ALL' || phase === 'APPROVED' || phase === 'REJECTED' || phase === 'CORRECTION'
            ? [{ workDate: 'desc' as const }, { updatedAt: 'desc' as const }]
            : [{ workDate: 'asc' as const }, { createdAt: 'asc' as const }],
      });
      const approverIds = [
        ...new Set(items.map((row) => row.approvedBy).filter((id): id is string => Boolean(id))),
      ];
      const approvers = approverIds.length
        ? await prisma.user.findMany({
            where: { id: { in: approverIds } },
            select: { id: true, name: true },
          })
        : [];
      const approverNameById = new Map(approvers.map((user) => [user.id, user.name]));
      res.json({
        success: true,
        data: items.map((row) => ({
          ...serializeDailyMeasurement(row),
          approvedBy: row.approvedBy ? approverNameById.get(row.approvedBy) || null : null,
          empreiteiro: {
            id: row.empreiteiro.id,
            name: row.empreiteiro.name,
            specialty: row.empreiteiro.specialty,
            contratoNome:
              row.empreiteiroContract?.name ||
              row.contract?.name ||
              row.empreiteiro.contract?.name ||
              '',
          },
        })),
      });
    } catch (error) {
      next(error);
    }
  }

  async createDailyMeasurement(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const empreiteiro = await prisma.empreiteiro.findUnique({
        where: { id },
        select: { id: true, contractId: true },
      });
      if (!empreiteiro) throw createError('Empreita não encontrada', 404);
      await assertCanAccessEmpreiteiro(req, empreiteiro.id);

      const workDate = parseWorkDate(req.body?.workDate);
      const description = str(req.body?.description);
      if (!description) throw createError('Descreva o que foi entregue', 400);
      const confirmedBy = optionalStr(req.body?.confirmedBy);
      const quantity = parseQuantity(req.body?.quantity);
      const unit = parseUnit(req.body?.unit, quantity);
      const photos = parseMeasurementPhotos(req.body?.photos);
      const teamPhoto = parseTeamPhoto(req.body?.teamPhoto);
      assertTeamPhotoPresent(teamPhoto);
      if (!photos.length) {
        throw createError('Inclua ao menos uma foto do serviço', 400);
      }
      const resolved = await resolveMeasurementServiceContractId(
        id,
        req.body?.empreiteiroContractId ?? req.body?.contractId,
        null
      );

      const serviceContract = await prisma.empreiteiroContract.findFirst({
        where: { id: resolved.empreiteiroContractId, empreiteiroId: id },
        select: { id: true, status: true, isActive: true },
      });
      if (!serviceContract) throw createError('Contrato de serviço não encontrado', 404);
      const serviceStatus = String(serviceContract.status || '').toUpperCase();
      if (
        serviceStatus === 'COMPLETED' ||
        serviceStatus === 'CANCELLED' ||
        serviceContract.isActive === false
      ) {
        throw createError(
          'Contrato de serviço concluído ou encerrado — não é possível adicionar novas entregas',
          400
        );
      }

      const workers = await resolveDailyWorkers(
        id,
        req.body?.workerIds ?? req.body?.workers,
        resolved.empreiteiroContractId
      );

      const created = await prisma.empreiteiroDailyMeasurement.create({
        data: {
          empreiteiroId: id,
          empreiteiroContractId: resolved.empreiteiroContractId,
          contractId: resolved.systemContractId,
          workDate,
          description,
          confirmedBy,
          quantity,
          unit,
          photos,
          teamPhoto: teamPhoto === null ? Prisma.JsonNull : teamPhoto,
          status: 'SUBMITTED',
          createdBy: req.user?.id || null,
          workers: workers.length ? { create: workers } : undefined,
        },
        include: dailyMeasurementInclude,
      });
      res.json({
        success: true,
        data: serializeDailyMeasurement(created),
        message: 'Medição de entrega enviada para aprovação',
      });
    } catch (error) {
      next(error);
    }
  }

  async updateDailyMeasurement(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id, measurementId } = req.params;
      const item = await prisma.empreiteiroDailyMeasurement.findFirst({
        where: { id: measurementId, empreiteiroId: id },
      });
      if (!item) throw createError('Medição não encontrada', 404);
      await assertCanAccessEmpreiteiro(req, id);

      const currentStatus = normalizeDailyStatus((item as { status?: string | null }).status);
      if (currentStatus === 'APPROVED') {
        throw createError('Medição aprovada não pode ser editada', 400);
      }

      const workDate =
        req.body?.workDate !== undefined ? parseWorkDate(req.body.workDate) : item.workDate;
      const description =
        req.body?.description !== undefined ? str(req.body.description) : item.description;
      if (!description) throw createError('Descreva o que foi entregue', 400);
      const confirmedBy =
        req.body?.confirmedBy !== undefined ? optionalStr(req.body.confirmedBy) : item.confirmedBy;
      const quantity =
        req.body?.quantity !== undefined ? parseQuantity(req.body.quantity) : item.quantity;
      const unit =
        req.body?.unit !== undefined || req.body?.quantity !== undefined
          ? parseUnit(req.body?.unit, quantity)
          : item.unit;
      const photos =
        req.body?.photos !== undefined ? parseMeasurementPhotos(req.body.photos) : undefined;
      const teamPhoto =
        req.body?.teamPhoto !== undefined ? parseTeamPhoto(req.body.teamPhoto) : undefined;
      if (teamPhoto !== undefined) assertTeamPhotoPresent(teamPhoto);
      else assertTeamPhotoPresent(serializeTeamPhoto(item.teamPhoto));
      if (photos !== undefined && photos.length === 0) {
        throw createError('Inclua ao menos uma foto do serviço', 400);
      }
      const shouldResolveService =
        req.body?.empreiteiroContractId !== undefined || req.body?.contractId !== undefined;
      const resolved = shouldResolveService
        ? await resolveMeasurementServiceContractId(
            id,
            req.body?.empreiteiroContractId ?? req.body?.contractId,
            item.empreiteiroContractId
          )
        : item.empreiteiroContractId
          ? {
              empreiteiroContractId: item.empreiteiroContractId,
              systemContractId: item.contractId,
            }
          : await resolveMeasurementServiceContractId(id, undefined, null);

      const workers =
        req.body?.workerIds !== undefined || req.body?.workers !== undefined
          ? await resolveDailyWorkers(
              id,
              req.body?.workerIds ?? req.body?.workers,
              resolved.empreiteiroContractId
            )
          : undefined;

      const resubmitting = currentStatus === 'CORRECTION';

      const updated = await prisma.$transaction(async (tx) => {
        if (workers) {
          await tx.empreiteiroDailyMeasurementWorker.deleteMany({
            where: { measurementId },
          });
        }
        return tx.empreiteiroDailyMeasurement.update({
          where: { id: measurementId },
          data: {
            workDate,
            description,
            confirmedBy,
            quantity,
            unit,
            empreiteiroContractId: resolved.empreiteiroContractId,
            contractId: resolved.systemContractId,
            ...(photos ? { photos } : {}),
            ...(teamPhoto !== undefined
              ? { teamPhoto: teamPhoto === null ? Prisma.JsonNull : teamPhoto }
              : {}),
            ...(workers ? { workers: { create: workers } } : {}),
            ...(resubmitting
              ? {
                  status: 'SUBMITTED',
                  correctionNote: null,
                  returnedBy: null,
                  returnedAt: null,
                  approvedBy: null,
                  approvedAt: null,
                }
              : {}),
          },
          include: dailyMeasurementInclude,
        });
      });
      res.json({
        success: true,
        data: serializeDailyMeasurement(updated),
        message: resubmitting ? 'Medição reenviada para aprovação' : 'Medição atualizada',
      });
    } catch (error) {
      next(error);
    }
  }

  async approveDailyMeasurement(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id, measurementId } = req.params;
      await assertCanApproveDailyMeasurement(req);
      const item = await prisma.empreiteiroDailyMeasurement.findFirst({
        where: { id: measurementId, empreiteiroId: id },
      });
      if (!item) throw createError('Medição não encontrada', 404);
      const status = normalizeDailyStatus((item as { status?: string | null }).status);
      if (status === 'APPROVED') {
        throw createError('Esta medição já está aprovada', 400);
      }
      if (status !== 'SUBMITTED') {
        throw createError('Só é possível aprovar medições enviadas (aguardando aprovação)', 400);
      }

      // Aprovar exige baixa: valor da entrega → Executado.
      const executedAmountNum = parseMoneyInput(
        req.body?.executedAmount ?? req.body?.valorExecutado
      );
      if (executedAmountNum == null || executedAmountNum <= 0) {
        throw createError('Informe o valor executado da entrega para aprovar e dar baixa', 400);
      }

      const contractId = item.empreiteiroContractId;
      const updated = await prisma.$transaction(async (tx) => {
        const row = await tx.empreiteiroDailyMeasurement.update({
          where: { id: measurementId },
          data: {
            status: 'APPROVED',
            approvedBy: req.user!.id,
            approvedAt: new Date(),
            returnedBy: null,
            returnedAt: null,
            correctionNote: null,
            executedAmount: new Prisma.Decimal(executedAmountNum.toFixed(2)),
          } as Prisma.EmpreiteiroDailyMeasurementUpdateInput,
          include: dailyMeasurementInclude,
        });
        if (contractId) {
          await syncInstallmentReleasesForContract(tx, contractId, req.user!.id);
        }
        return row;
      });

      res.json({
        success: true,
        data: serializeDailyMeasurement(updated),
        message: `Medição aprovada e baixa de R$ ${executedAmountNum
          .toFixed(2)
          .replace('.', ',')} aplicada na parcela`,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Baixa da entrega: valor vai para a próxima parcela PENDING (libera + atualiza amount).
   * Só em medições já aprovadas.
   */
  async registerDailyMeasurementExecution(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id, measurementId } = req.params;
      await assertCanApproveDailyMeasurement(req);
      const item = await prisma.empreiteiroDailyMeasurement.findFirst({
        where: { id: measurementId, empreiteiroId: id },
      });
      if (!item) throw createError('Medição não encontrada', 404);
      const status = normalizeDailyStatus((item as { status?: string | null }).status);
      if (status !== 'APPROVED') {
        throw createError('Aprove a medição antes de dar baixa no executado', 400);
      }

      const executedAmountNum = parseMoneyInput(
        req.body?.executedAmount ?? req.body?.valorExecutado
      );
      if (executedAmountNum == null || executedAmountNum <= 0) {
        throw createError('Informe o valor executado nesta baixa (R$)', 400);
      }

      const contractId = item.empreiteiroContractId;
      const updated = await prisma.$transaction(async (tx) => {
        const row = await tx.empreiteiroDailyMeasurement.update({
          where: { id: measurementId },
          data: {
            executedAmount: new Prisma.Decimal(executedAmountNum.toFixed(2)),
          } as Prisma.EmpreiteiroDailyMeasurementUpdateInput,
          include: dailyMeasurementInclude,
        });
        if (contractId) {
          await syncInstallmentReleasesForContract(tx, contractId, req.user!.id);
        }
        return row;
      });

      res.json({
        success: true,
        data: serializeDailyMeasurement(updated),
        message: `Baixa de R$ ${executedAmountNum
          .toFixed(2)
          .replace('.', ',')} aplicada na parcela (liberada para pagamento)`,
      });
    } catch (error) {
      next(error);
    }
  }

  /** Marca parcela como paga (exige comprovante) ou devolve para liberada. */
  async updateInstallment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await assertCanManageEmpreiteiros(req);
      const { id, linkId, installmentId } = req.params;
      const installment = await prisma.empreiteiroContractInstallment.findFirst({
        where: {
          id: installmentId,
          empreiteiroContractId: linkId,
          empreiteiroContract: { empreiteiroId: id },
        },
      });
      if (!installment) throw createError('Parcela não encontrada', 404);

      const nextStatus = normalizeInstallmentStatus(req.body?.status);
      if (nextStatus === 'PENDING') {
        throw createError('Não é possível voltar parcela para pendente por aqui', 400);
      }

      const proofFiles =
        req.body?.proofFiles !== undefined || req.body?.files !== undefined
          ? parsePaymentFiles(req.body?.proofFiles ?? req.body?.files)
          : null;
      const existingProof = Array.isArray(
        (installment as { proofFiles?: unknown }).proofFiles
      )
        ? ((installment as { proofFiles: unknown[] }).proofFiles as PaymentFile[])
        : [];

      if (nextStatus === 'PAID') {
        const proofs = proofFiles && proofFiles.length > 0 ? proofFiles : existingProof;
        if (!proofs.length) {
          throw createError('Anexe o comprovante de pagamento para marcar como paga', 400);
        }
        await prisma.empreiteiroContractInstallment.update({
          where: { id: installmentId },
          data: {
            status: 'PAID',
            paidAt: new Date(),
            paidBy: req.user!.id,
            proofFiles: proofs as Prisma.InputJsonValue,
            note:
              req.body?.note !== undefined ? optionalStr(req.body.note) : installment.note,
          } as Prisma.EmpreiteiroContractInstallmentUpdateInput,
        });
      } else if (nextStatus === 'RELEASED') {
        // Liberação de pagamento é ação do gestor/financeiro — independente da baixa de entrega.
        await prisma.empreiteiroContractInstallment.update({
          where: { id: installmentId },
          data: {
            status: 'RELEASED',
            releasedAt: installment.releasedAt || new Date(),
            releasedBy: installment.releasedBy || req.user!.id,
            paidAt: null,
            paidBy: null,
            ...(proofFiles !== null
              ? { proofFiles: proofFiles as Prisma.InputJsonValue }
              : {}),
            note:
              req.body?.note !== undefined ? optionalStr(req.body.note) : installment.note,
          } as Prisma.EmpreiteiroContractInstallmentUpdateInput,
        });
      } else {
        throw createError('Status de parcela inválido', 400);
      }

      let autoCompleted = false;
      if (nextStatus === 'PAID') {
        autoCompleted = await maybeCompleteServiceContractIfSettled(prisma, linkId, id);
      }

      const empreiteiro = await prisma.empreiteiro.findUniqueOrThrow({
        where: { id },
        include: empreiteiroInclude,
      });
      const counts = await measurementCountsForEmpreiteiro(id);
      res.json({
        success: true,
        data: serializeEmpreiteiro(empreiteiro, counts),
        message: autoCompleted
          ? 'Comprovante anexado · contrato de serviço concluído e encerrado'
          : nextStatus === 'PAID'
            ? 'Comprovante anexado · parcela marcada como paga'
            : 'Parcela atualizada',
        contractCompleted: autoCompleted,
      });
    } catch (error) {
      next(error);
    }
  }

  /** Lança aditivo no contrato de serviço (histórico permanente). */
  async addAddendum(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await assertCanManageEmpreiteiros(req);
      const { id, linkId } = req.params;
      const link = await prisma.empreiteiroContract.findFirst({
        where: { id: linkId, empreiteiroId: id },
        include: {
          addenda: { select: { number: true }, orderBy: { number: 'desc' }, take: 1 },
          installments: { select: { number: true }, orderBy: { number: 'desc' }, take: 1 },
        },
      });
      if (!link) throw createError('Contrato de serviço não encontrado', 404);

      const reason = str(req.body?.reason) || str(req.body?.motivo);
      if (!reason) throw createError('Informe o motivo do aditivo', 400);
      const amountNum = parseMoneyInput(req.body?.amount ?? req.body?.valor, true);
      if (amountNum == null || amountNum === 0) {
        throw createError('Informe o valor do aditivo (diferente de zero)', 400);
      }
      const effectiveDate =
        parseDateField(req.body?.effectiveDate ?? req.body?.date, 'Data do aditivo') ||
        new Date();
      const servicesAdded = optionalStr(req.body?.servicesAdded);
      const servicesRemoved = optionalStr(req.body?.servicesRemoved);
      const approvedByName = optionalStr(req.body?.approvedByName ?? req.body?.approvedBy);
      const files = parsePaymentFiles(req.body?.files);
      const createInstallment = req.body?.createInstallment === true && amountNum > 0;
      const nextNumber = (link.addenda[0]?.number || 0) + 1;

      const updated = await prisma.$transaction(async (tx) => {
        await tx.empreiteiroContractAddendum.create({
          data: {
            empreiteiroContractId: linkId,
            number: nextNumber,
            reason,
            effectiveDate,
            amount: new Prisma.Decimal(amountNum.toFixed(2)),
            servicesAdded,
            servicesRemoved,
            files: files as Prisma.InputJsonValue,
            approvedByName,
            createdBy: req.user?.id || null,
          },
        });
        if (createInstallment) {
          const nextParcel = (link.installments[0]?.number || 0) + 1;
          await tx.empreiteiroContractInstallment.create({
            data: {
              empreiteiroContractId: linkId,
              number: nextParcel,
              amount: new Prisma.Decimal(amountNum.toFixed(2)),
              dueDate: effectiveDate,
              status: 'PENDING',
              note: `Aditivo nº ${nextNumber}`,
            },
          });
        }
        return tx.empreiteiro.findUniqueOrThrow({
          where: { id },
          include: empreiteiroInclude,
        });
      });

      const counts = await measurementCountsForEmpreiteiro(id);
      res.json({
        success: true,
        data: serializeEmpreiteiro(updated, counts),
        message: createInstallment
          ? `Aditivo nº ${nextNumber} lançado e parcela criada`
          : `Aditivo nº ${nextNumber} lançado`,
      });
    } catch (error) {
      next(error);
    }
  }

  /** Remove aditivo (só o último, para não furar a numeração). */
  async deleteAddendum(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await assertCanManageEmpreiteiros(req);
      const { id, linkId, addendumId } = req.params;
      const addendum = await prisma.empreiteiroContractAddendum.findFirst({
        where: {
          id: addendumId,
          empreiteiroContractId: linkId,
          empreiteiroContract: { empreiteiroId: id },
        },
      });
      if (!addendum) throw createError('Aditivo não encontrado', 404);

      const latest = await prisma.empreiteiroContractAddendum.findFirst({
        where: { empreiteiroContractId: linkId },
        orderBy: { number: 'desc' },
      });
      if (!latest || latest.id !== addendum.id) {
        throw createError('Só é possível excluir o último aditivo do histórico', 400);
      }

      await prisma.empreiteiroContractAddendum.delete({ where: { id: addendumId } });
      const empreiteiro = await prisma.empreiteiro.findUniqueOrThrow({
        where: { id },
        include: empreiteiroInclude,
      });
      const counts = await measurementCountsForEmpreiteiro(id);
      res.json({
        success: true,
        data: serializeEmpreiteiro(empreiteiro, counts),
        message: 'Aditivo removido',
      });
    } catch (error) {
      next(error);
    }
  }

  async returnDailyMeasurement(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id, measurementId } = req.params;
      await assertCanApproveDailyMeasurement(req);
      const note = str(req.body?.correctionNote ?? req.body?.note);
      if (!note) throw createError('Informe o que precisa ser corrigido', 400);
      if (note.length > 2000) throw createError('Observação muito longa', 400);

      const item = await prisma.empreiteiroDailyMeasurement.findFirst({
        where: { id: measurementId, empreiteiroId: id },
      });
      if (!item) throw createError('Medição não encontrada', 404);
      const status = normalizeDailyStatus((item as { status?: string | null }).status);
      if (status === 'APPROVED') {
        throw createError('Medição aprovada não pode ser devolvida', 400);
      }
      if (status !== 'SUBMITTED') {
        throw createError('Só é possível devolver medições enviadas (aguardando aprovação)', 400);
      }

      const updated = await prisma.empreiteiroDailyMeasurement.update({
        where: { id: measurementId },
        data: {
          status: 'CORRECTION',
          correctionNote: note,
          returnedBy: req.user!.id,
          returnedAt: new Date(),
          approvedBy: null,
          approvedAt: null,
        },
        include: dailyMeasurementInclude,
      });
      res.json({
        success: true,
        data: serializeDailyMeasurement(updated),
        message: 'Medição devolvida para correção',
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteDailyMeasurement(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id, measurementId } = req.params;
      const item = await prisma.empreiteiroDailyMeasurement.findFirst({
        where: { id: measurementId, empreiteiroId: id },
      });
      if (!item) throw createError('Medição não encontrada', 404);
      await assertCanAccessEmpreiteiro(req, id);
      const status = normalizeDailyStatus((item as { status?: string | null }).status);
      if (status === 'APPROVED') {
        const scope = await resolveEmpreiteiroScope(req.user?.id);
        if (scope.scoped && !req.user?.isAdmin) {
          throw createError('Medição aprovada não pode ser excluída', 400);
        }
      }
      await prisma.empreiteiroDailyMeasurement.delete({ where: { id: measurementId } });
      res.json({ success: true, message: 'Medição excluída' });
    } catch (error) {
      next(error);
    }
  }
}
