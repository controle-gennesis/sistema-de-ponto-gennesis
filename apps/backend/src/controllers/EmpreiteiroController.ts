import { Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { ensureUnaccentExtension, textMatchesSearch } from '../lib/normalizeSearchText';
import { PhotoService } from '../services/PhotoService';
import { pathToModuleKey, PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';

const photoService = new PhotoService();

const empreiteiroInclude = {
  contract: { select: { id: true, name: true, number: true } },
  teamMembers: { orderBy: { sortOrder: 'asc' as const } },
} as const;

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

function serializeEmpreiteiro(row: {
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
  createdAt: Date;
  updatedAt: Date;
  contract?: { id: string; name: string; number: string } | null;
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
}) {
  const team = (row.teamMembers ?? []).map((member) => ({
    id: member.id,
    name: member.name,
    role: member.role,
    phone: member.phone,
    document: member.document,
    sortOrder: member.sortOrder,
    photoUrl: member.photoUrl,
  }));
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
    startDate: row.startDate,
    endDate: row.endDate,
    photoUrl: row.photoUrl,
    files: Array.isArray(row.files) ? row.files : [],
    userId: row.userId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    contratoNome: row.contract?.name ?? '',
    contract: row.contract
      ? { id: row.contract.id, name: row.contract.name, number: row.contract.number }
      : null,
    team,
    teamCount: team.length,
  };
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

async function resolveDailyWorkers(empreiteiroId: string, rawIds: unknown) {
  const ids = Array.isArray(rawIds)
    ? [...new Set(rawIds.map((id) => str(id)).filter(Boolean))]
    : [];
  if (ids.length === 0) return [];
  const members = await prisma.empreiteiroTeamMember.findMany({
    where: { empreiteiroId, id: { in: ids } },
  });
  if (members.length !== ids.length) {
    throw createError('Selecione apenas pessoas da equipe desta empreita', 400);
  }
  const byId = new Map(members.map((member) => [member.id, member]));
  return ids.map((id) => {
    const member = byId.get(id)!;
    return { teamMemberId: member.id, name: member.name, role: member.role };
  });
}

function serializeDailyMeasurement(row: {
  id: string;
  empreiteiroId: string;
  workDate: Date;
  description: string;
  confirmedBy: string | null;
  quantity: Prisma.Decimal | null;
  unit: string | null;
  photos: Prisma.JsonValue;
  teamPhoto: Prisma.JsonValue | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  workers?: Array<{ id: string; teamMemberId: string | null; name: string; role: string }>;
}) {
  return {
    id: row.id,
    empreiteiroId: row.empreiteiroId,
    workDate: formatWorkDate(row.workDate),
    description: row.description,
    confirmedBy: row.confirmedBy,
    quantity: row.quantity != null ? Number(row.quantity) : null,
    unit: row.unit,
    photos: Array.isArray(row.photos) ? row.photos : [],
    teamPhoto: serializeTeamPhoto(row.teamPhoto),
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
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
} as const;

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
    throw createError('Sua conta não pode alterar o cadastro de empreita', 403);
  }
}

export class EmpreiteiroController {
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
      if (contractFilter) where.contractId = contractFilter;
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
            row.teamMembers.some(
              (member) =>
                textMatchesSearch(member.name, searchTerm) ||
                textMatchesSearch(member.role, searchTerm) ||
                textMatchesSearch(member.document, searchTerm)
            )
        );
        const total = filtered.length;
        const items = filtered.slice(skip, skip + limitNum).map(serializeEmpreiteiro);
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

      const [items, total] = await Promise.all([
        prisma.empreiteiro.findMany({
          where,
          skip,
          take: limitNum,
          orderBy: { name: 'asc' },
          include: empreiteiroInclude,
        }),
        prisma.empreiteiro.count({ where }),
      ]);

      res.json({
        success: true,
        data: items.map(serializeEmpreiteiro),
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
      const item = await prisma.empreiteiro.findUnique({
        where: { id },
        include: empreiteiroInclude,
      });
      if (!item) throw createError('Empreita não encontrada', 404);
      await assertCanAccessEmpreiteiro(req, item.id);
      res.json({ success: true, data: serializeEmpreiteiro(item) });
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
      const contractId = str(req.body?.contractId);
      const email = optionalStr(req.body?.email)?.toLowerCase() ?? null;

      if (!name) throw createError('Nome é obrigatório', 400);
      if (phone.length < 10) throw createError('Telefone é obrigatório', 400);
      if (!specialty) throw createError('Especialidade é obrigatória', 400);
      if (!contractId) throw createError('Contrato é obrigatório', 400);
      if (email && !email.includes('@')) throw createError('E-mail inválido', 400);

      const contrato = await prisma.contract.findUnique({ where: { id: contractId } });
      if (!contrato) throw createError('Contrato não encontrado', 404);

      const duplicate = await prisma.empreiteiro.findFirst({
        where: { OR: [{ document: cnpj }, { cpf }] },
      });
      if (duplicate) throw createError('Já existe uma empreita com este CPF ou CNPJ', 400);

      const linkUserId = str(req.body?.userId) || null;
      if (linkUserId) {
        const linkUser = await prisma.user.findUnique({
          where: { id: linkUserId },
          select: {
            id: true,
            isActive: true,
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
        if (linkUser.empreiteiro) {
          throw createError('Este login já está vinculado a outro cadastro de empreita', 400);
        }
      }

      const photo = await resolvePhotoFields(req.body?.photo, req.user?.id || 'empreiteiro');
      const files = parsePaymentFiles(req.body?.files);
      const team = await parseTeamMembers(req.body?.team, req.user?.id || 'empreiteiro');
      const startDate = parseDateField(req.body?.startDate, 'Data de início');
      const endDate = parseDateField(req.body?.endDate, 'Data de fim');
      assertDateRange(startDate, endDate);

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
            startDate,
            endDate,
            photoUrl: photo?.photoUrl ?? null,
            photoKey: photo?.photoKey ?? null,
            files: files as Prisma.InputJsonValue,
            userId: linkUserId,
            teamMembers: team.length
              ? {
                  create: team,
                }
              : undefined,
          },
          include: empreiteiroInclude,
        });
        if (linkUserId) {
          const module = pathToModuleKey('/ponto/empreiteiros');
          const existing = await tx.userPermission.findFirst({
            where: { userId: linkUserId, module, action: PERMISSION_ACCESS_ACTION },
          });
          if (!existing) {
            await tx.userPermission.create({
              data: {
                userId: linkUserId,
                module,
                action: PERMISSION_ACCESS_ACTION,
                allowed: true,
              },
            });
          }
        }
        return row;
      });
      res.status(201).json({
        success: true,
        data: serializeEmpreiteiro(created),
        message: 'Empreita criada',
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
      const photo = await resolvePhotoFields(req.body?.photo, req.user?.id || 'empreiteiro', {
        photoUrl: item.photoUrl,
        photoKey: item.photoKey,
      });
      if (photo) {
        data.photoUrl = photo.photoUrl;
        data.photoKey = photo.photoKey;
      }
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

      if (req.body?.contractId !== undefined) {
        const contractId = str(req.body.contractId);
        if (!contractId) throw createError('Contrato é obrigatório', 400);
        const contrato = await prisma.contract.findUnique({ where: { id: contractId } });
        if (!contrato) throw createError('Contrato não encontrado', 404);
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

      if (req.body?.team !== undefined) {
        const team = await parseTeamMembers(req.body.team, req.user?.id || 'empreiteiro');
        data.teamMembers = {
          deleteMany: {},
          create: team,
        };
      }

      const updated = await prisma.empreiteiro.update({
        where: { id },
        data,
        include: empreiteiroInclude,
      });
      res.json({
        success: true,
        data: serializeEmpreiteiro(updated),
        message: 'Atualizado com sucesso',
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

  async createDailyMeasurement(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const empreiteiro = await prisma.empreiteiro.findUnique({ where: { id }, select: { id: true } });
      if (!empreiteiro) throw createError('Empreita não encontrada', 404);
      await assertCanAccessEmpreiteiro(req, empreiteiro.id);

      const workDate = parseWorkDate(req.body?.workDate);
      const description = str(req.body?.description);
      if (!description) throw createError('Descreva o que a equipe fez no dia', 400);
      const confirmedBy = optionalStr(req.body?.confirmedBy);
      const quantity = parseQuantity(req.body?.quantity);
      const unit = parseUnit(req.body?.unit, quantity);
      const photos = parseMeasurementPhotos(req.body?.photos);
      const teamPhoto = parseTeamPhoto(req.body?.teamPhoto);
      const workers = await resolveDailyWorkers(id, req.body?.workerIds ?? req.body?.workers);

      const duplicate = await prisma.empreiteiroDailyMeasurement.findUnique({
        where: { empreiteiroId_workDate: { empreiteiroId: id, workDate } },
      });
      if (duplicate) {
        throw createError('Já existe medição neste dia. Abra o registro para editar.', 400);
      }

      const created = await prisma.empreiteiroDailyMeasurement.create({
        data: {
          empreiteiroId: id,
          workDate,
          description,
          confirmedBy,
          quantity,
          unit,
          photos,
          teamPhoto: teamPhoto === null ? Prisma.JsonNull : teamPhoto,
          createdBy: req.user?.id || null,
          workers: workers.length ? { create: workers } : undefined,
        },
        include: dailyMeasurementInclude,
      });
      res.json({
        success: true,
        data: serializeDailyMeasurement(created),
        message: 'Medição do dia registrada',
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

      const workDate =
        req.body?.workDate !== undefined ? parseWorkDate(req.body.workDate) : item.workDate;
      const description =
        req.body?.description !== undefined ? str(req.body.description) : item.description;
      if (!description) throw createError('Descreva o que a equipe fez no dia', 400);
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
      const workers =
        req.body?.workerIds !== undefined || req.body?.workers !== undefined
          ? await resolveDailyWorkers(id, req.body?.workerIds ?? req.body?.workers)
          : undefined;

      if (formatWorkDate(workDate) !== formatWorkDate(item.workDate)) {
        const duplicate = await prisma.empreiteiroDailyMeasurement.findUnique({
          where: { empreiteiroId_workDate: { empreiteiroId: id, workDate } },
        });
        if (duplicate) throw createError('Já existe medição neste dia', 400);
      }

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
            ...(photos ? { photos } : {}),
            ...(teamPhoto !== undefined
              ? { teamPhoto: teamPhoto === null ? Prisma.JsonNull : teamPhoto }
              : {}),
            ...(workers ? { workers: { create: workers } } : {}),
          },
          include: dailyMeasurementInclude,
        });
      });
      res.json({
        success: true,
        data: serializeDailyMeasurement(updated),
        message: 'Medição atualizada',
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
      await prisma.empreiteiroDailyMeasurement.delete({ where: { id: measurementId } });
      res.json({ success: true, message: 'Medição excluída' });
    } catch (error) {
      next(error);
    }
  }
}
