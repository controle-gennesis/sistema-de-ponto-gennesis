import { Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { ensureUnaccentExtension, textMatchesSearch } from '../lib/normalizeSearchText';
import { PhotoService } from '../services/PhotoService';

const photoService = new PhotoService();

const empreiteiroInclude = {
  contract: { select: { id: true, name: true, number: true } },
  teamMembers: { orderBy: { sortOrder: 'asc' as const } },
} as const;

type DocumentKind = 'CPF' | 'CNPJ';

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

function parseDocumentKind(value: unknown): DocumentKind {
  const kind = str(value).toUpperCase();
  if (kind === 'CPF' || kind === 'CNPJ') return kind;
  throw createError('Informe se o documento é CPF ou CNPJ', 400);
}

function validateDocument(kind: DocumentKind, document: string) {
  if (!document) throw createError('Documento é obrigatório', 400);
  if (kind === 'CPF' && document.length !== 11) {
    throw createError('CPF deve ter 11 dígitos', 400);
  }
  if (kind === 'CNPJ' && document.length !== 14) {
    throw createError('CNPJ deve ter 14 dígitos', 400);
  }
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
      if (!item) throw createError('Empreiteiro não encontrado', 404);
      res.json({ success: true, data: serializeEmpreiteiro(item) });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const name = str(req.body?.name);
      const documentKind = parseDocumentKind(req.body?.documentKind);
      const document = digits(req.body?.document);
      const phone = digits(req.body?.phone);
      const specialty = str(req.body?.specialty);
      const contractId = str(req.body?.contractId);
      const email = optionalStr(req.body?.email)?.toLowerCase() ?? null;

      if (!name) throw createError('Nome é obrigatório', 400);
      validateDocument(documentKind, document);
      if (phone.length < 10) throw createError('Telefone é obrigatório', 400);
      if (!specialty) throw createError('Especialidade é obrigatória', 400);
      if (!contractId) throw createError('Contrato é obrigatório', 400);
      if (email && !email.includes('@')) throw createError('E-mail inválido', 400);

      const contrato = await prisma.contract.findUnique({ where: { id: contractId } });
      if (!contrato) throw createError('Contrato não encontrado', 404);

      const duplicate = await prisma.empreiteiro.findUnique({ where: { document } });
      if (duplicate) throw createError('Já existe um empreiteiro com este CPF/CNPJ', 400);

      const photo = await resolvePhotoFields(req.body?.photo, req.user?.id || 'empreiteiro');
      const files = parsePaymentFiles(req.body?.files);
      const team = await parseTeamMembers(req.body?.team, req.user?.id || 'empreiteiro');
      const startDate = parseDateField(req.body?.startDate, 'Data de início');
      const endDate = parseDateField(req.body?.endDate, 'Data de fim');
      assertDateRange(startDate, endDate);

      const created = await prisma.empreiteiro.create({
        data: {
          name,
          tradeName: optionalStr(req.body?.tradeName),
          documentKind,
          document,
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
          teamMembers: team.length
            ? {
                create: team,
              }
            : undefined,
        },
        include: empreiteiroInclude,
      });
      res.status(201).json({
        success: true,
        data: serializeEmpreiteiro(created),
        message: 'Empreiteiro criado',
      });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const item = await prisma.empreiteiro.findUnique({ where: { id } });
      if (!item) throw createError('Empreiteiro não encontrado', 404);

      const data: Prisma.EmpreiteiroUpdateInput = {};
      let nextDocument = item.document;

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

      const nextKind =
        req.body?.documentKind !== undefined
          ? parseDocumentKind(req.body.documentKind)
          : (item.documentKind as DocumentKind);
      if (req.body?.documentKind !== undefined) data.documentKind = nextKind;

      if (req.body?.document !== undefined || req.body?.documentKind !== undefined) {
        nextDocument =
          req.body?.document !== undefined ? digits(req.body.document) : item.document;
        validateDocument(nextKind, nextDocument);
        data.document = nextDocument;
      }

      if (nextDocument !== item.document) {
        const duplicate = await prisma.empreiteiro.findFirst({
          where: { id: { not: id }, document: nextDocument },
        });
        if (duplicate) throw createError('Já existe um empreiteiro com este CPF/CNPJ', 400);
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

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const item = await prisma.empreiteiro.findUnique({ where: { id } });
      if (!item) throw createError('Empreiteiro não encontrado', 404);
      await prisma.empreiteiro.delete({ where: { id } });
      res.json({ success: true, message: 'Registro excluído' });
    } catch (error) {
      next(error);
    }
  }
}
