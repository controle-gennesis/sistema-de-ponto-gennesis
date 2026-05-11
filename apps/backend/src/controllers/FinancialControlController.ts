import { Response, NextFunction } from 'express';
import ExcelJS from 'exceljs';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { FinancialControlStatus, Prisma } from '@prisma/client';

const ALLOWED_STATUSES: FinancialControlStatus[] = [
  'PROCESSO_COMPLETO',
  'PAGO',
  'AGUARDAR_NOTA',
  'CANCELADO',
];

function parseStatus(value: unknown): FinancialControlStatus | null {
  if (typeof value !== 'string') return null;
  const upper = value.toUpperCase().trim();
  if (ALLOWED_STATUSES.includes(upper as FinancialControlStatus)) {
    return upper as FinancialControlStatus;
  }
  return null;
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const date = new Date(trimmed);
  return isNaN(date.getTime()) ? null : date;
}

function parseDecimal(value: unknown): Prisma.Decimal | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(',', '.'));
  if (isNaN(n)) return null;
  return new Prisma.Decimal(n);
}

function parseInteger(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : parseInt(String(value), 10);
  return isNaN(n) ? null : n;
}

function buildEntryData(body: any, userId?: string | null, isUpdate = false) {
  const data: Prisma.FinancialControlEntryUncheckedCreateInput | Prisma.FinancialControlEntryUncheckedUpdateInput =
    {} as any;

  if (body.paymentMonth !== undefined) {
    const m = parseInteger(body.paymentMonth);
    if (m === null || m < 1 || m > 12) {
      throw createError('Mês de pagamento inválido (1-12)', 400);
    }
    (data as any).paymentMonth = m;
  }
  if (body.paymentYear !== undefined) {
    const y = parseInteger(body.paymentYear);
    if (y === null || y < 2000 || y > 2100) {
      throw createError('Ano de pagamento inválido', 400);
    }
    (data as any).paymentYear = y;
  }
  if (body.status !== undefined) {
    const s = parseStatus(body.status);
    if (!s) throw createError('Status inválido', 400);
    (data as any).status = s;
  }
  if (body.osCode !== undefined) (data as any).osCode = body.osCode || null;
  if (body.supplierName !== undefined) (data as any).supplierName = body.supplierName || null;
  if (body.parcelNumber !== undefined) (data as any).parcelNumber = body.parcelNumber || null;
  if (body.emissionDate !== undefined) (data as any).emissionDate = parseDate(body.emissionDate);
  if (body.boleto !== undefined) (data as any).boleto = body.boleto || null;
  if (body.dueDate !== undefined) (data as any).dueDate = parseDate(body.dueDate);
  if (body.originalValue !== undefined) (data as any).originalValue = parseDecimal(body.originalValue);
  if (body.ocNumber !== undefined) (data as any).ocNumber = body.ocNumber || null;
  if (body.finalValue !== undefined) (data as any).finalValue = parseDecimal(body.finalValue);
  if (body.paidDate !== undefined) (data as any).paidDate = parseDate(body.paidDate);
  if (body.remainingDays !== undefined) (data as any).remainingDays = parseInteger(body.remainingDays);
  if (body.receivedNote !== undefined) (data as any).receivedNote = body.receivedNote || null;
  if (body.notes !== undefined) (data as any).notes = body.notes || null;

  if (isUpdate) {
    (data as any).updatedBy = userId || null;
  } else {
    (data as any).createdBy = userId || null;
    (data as any).updatedBy = userId || null;
  }

  return data;
}

export class FinancialControlController {
  async getAll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { month, year, status, search } = req.query;
      const where: Prisma.FinancialControlEntryWhereInput = {};

      if (month) {
        const m = parseInt(String(month), 10);
        if (!isNaN(m)) where.paymentMonth = m;
      }
      if (year) {
        const y = parseInt(String(year), 10);
        if (!isNaN(y)) where.paymentYear = y;
      }
      if (status) {
        const s = parseStatus(status);
        if (s) where.status = s;
      }
      if (search) {
        const q = String(search);
        where.OR = [
          { osCode: { contains: q, mode: 'insensitive' } },
          { supplierName: { contains: q, mode: 'insensitive' } },
          { parcelNumber: { contains: q, mode: 'insensitive' } },
          { ocNumber: { contains: q, mode: 'insensitive' } },
          { receivedNote: { contains: q, mode: 'insensitive' } },
        ];
      }

      const entries = await prisma.financialControlEntry.findMany({
        where,
        orderBy: [
          { paymentYear: 'asc' },
          { paymentMonth: 'asc' },
          { createdAt: 'asc' },
        ],
      });

      res.json({ success: true, data: entries });
    } catch (error) {
      next(error);
    }
  }

  async getMonths(_req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const grouped = await prisma.financialControlEntry.groupBy({
        by: ['paymentYear', 'paymentMonth'],
        _count: { _all: true },
        _sum: { finalValue: true },
        orderBy: [
          { paymentYear: 'asc' },
          { paymentMonth: 'asc' },
        ],
      });

      const data = grouped.map((g) => ({
        year: g.paymentYear,
        month: g.paymentMonth,
        count: g._count?._all ?? 0,
        totalFinalValue: g._sum?.finalValue ? Number(g._sum.finalValue) : 0,
      }));

      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const entry = await prisma.financialControlEntry.findUnique({ where: { id } });
      if (!entry) throw createError('Lançamento não encontrado', 404);
      res.json({ success: true, data: entry });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (req.body.paymentMonth === undefined || req.body.paymentYear === undefined) {
        throw createError('paymentMonth e paymentYear são obrigatórios', 400);
      }
      const data = buildEntryData(req.body, req.user?.id, false);
      const entry = await prisma.financialControlEntry.create({
        data: data as Prisma.FinancialControlEntryUncheckedCreateInput,
      });
      res.status(201).json({ success: true, data: entry, message: 'Lançamento criado com sucesso' });
    } catch (error) {
      next(error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const existing = await prisma.financialControlEntry.findUnique({ where: { id } });
      if (!existing) throw createError('Lançamento não encontrado', 404);
      const data = buildEntryData(req.body, req.user?.id, true);
      const updated = await prisma.financialControlEntry.update({
        where: { id },
        data: data as Prisma.FinancialControlEntryUncheckedUpdateInput,
      });
      res.json({ success: true, data: updated, message: 'Lançamento atualizado com sucesso' });
    } catch (error) {
      next(error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const existing = await prisma.financialControlEntry.findUnique({ where: { id } });
      if (!existing) throw createError('Lançamento não encontrado', 404);
      await prisma.financialControlEntry.delete({ where: { id } });
      res.json({ success: true, message: 'Lançamento excluído com sucesso' });
    } catch (error) {
      next(error);
    }
  }

  async importSpreadsheet(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.file) throw createError('Arquivo não enviado', 400);

      const mode = (req.body?.mode as string) || 'append'; // append | replace
      const userId = req.user?.id || null;

      const parsed = await parseControleFinanceiroSpreadsheet(req.file.buffer);
      if (!parsed.entries.length) {
        throw createError('Nenhum lançamento válido encontrado na planilha', 400);
      }

      const result = await prisma.$transaction(async (tx) => {
        let removed = 0;
        if (mode === 'replace') {
          const monthYearPairs = Array.from(
            new Set(parsed.entries.map((e) => `${e.paymentYear}-${e.paymentMonth}`))
          ).map((s) => {
            const [y, m] = s.split('-').map(Number);
            return { paymentYear: y, paymentMonth: m };
          });

          if (monthYearPairs.length) {
            const del = await tx.financialControlEntry.deleteMany({
              where: { OR: monthYearPairs },
            });
            removed = del.count;
          }
        }

        let created = 0;
        for (const entry of parsed.entries) {
          await tx.financialControlEntry.create({
            data: {
              ...entry,
              createdBy: userId,
              updatedBy: userId,
            },
          });
          created += 1;
        }

        return { created, removed };
      });

      res.json({
        success: true,
        message: `${result.created} lançamento(s) importado(s) com sucesso${
          result.removed ? ` (${result.removed} substituído(s))` : ''
        }`,
        data: {
          created: result.created,
          removed: result.removed,
          warnings: parsed.warnings,
          months: parsed.monthsDetected,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

// ============================================================================
// Parser da planilha "Controle Financeiro - Material/Serviço Aplicado"
// ============================================================================

interface ParsedEntry {
  paymentMonth: number;
  paymentYear: number;
  status: FinancialControlStatus;
  osCode: string | null;
  supplierName: string | null;
  parcelNumber: string | null;
  emissionDate: Date | null;
  boleto: string | null;
  dueDate: Date | null;
  originalValue: Prisma.Decimal | null;
  ocNumber: string | null;
  finalValue: Prisma.Decimal | null;
  paidDate: Date | null;
  remainingDays: number | null;
  receivedNote: string | null;
  notes: string | null;
}

interface ParseResult {
  entries: ParsedEntry[];
  warnings: string[];
  monthsDetected: { year: number; month: number; label: string }[];
}

const MONTHS_PT_TO_NUM: Record<string, number> = {
  JANEIRO: 1,
  FEVEREIRO: 2,
  MARCO: 3,
  MARÇO: 3,
  ABRIL: 4,
  MAIO: 5,
  JUNHO: 6,
  JULHO: 7,
  AGOSTO: 8,
  SETEMBRO: 9,
  OUTUBRO: 10,
  NOVEMBRO: 11,
  DEZEMBRO: 12,
};

function normalizeText(value: any): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function parseNumber(value: any): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return isNaN(value) ? null : value;
  if (typeof value !== 'string') return null;
  let cleaned = value
    .replace(/R\$/gi, '')
    .replace(/\s/g, '')
    .replace(/[^\d,.-]/g, '');
  if (!cleaned) return null;
  if (cleaned.includes(',') && cleaned.includes('.')) {
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',')) {
    cleaned = cleaned.replace(',', '.');
  }
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function parseCellDate(value: any): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    // Rejeita datas claramente inválidas (antes de 1990 ou depois de 2100)
    const year = value.getFullYear();
    if (year < 1990 || year > 2100) return null;
    return value;
  }
  if (typeof value === 'number') {
    // Excel armazena datas como número serial de dias desde 30/12/1899.
    // Para evitar interpretar valores numéricos pequenos (como dia do mês, valores monetários, etc.)
    // como datas absurdas (ex: 100 -> 09/04/1900), só aceitamos números no range que corresponde
    // a datas a partir de ~1990 (>= 32874) até ~2100 (<= 73415).
    if (value >= 32874 && value <= 73415) {
      const epoch = new Date(1899, 11, 30);
      const date = new Date(epoch.getTime() + value * 24 * 60 * 60 * 1000);
      if (!isNaN(date.getTime())) return date;
    }
    return null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const seps = ['/', '-', '.'];
    for (const sep of seps) {
      const parts = trimmed.split(sep);
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        const year = parseInt(parts[2], 10);
        if (day >= 1 && day <= 31 && month >= 0 && month <= 11 && year >= 1990 && year <= 2100) {
          const d = new Date(year, month, day);
          if (!isNaN(d.getTime())) return d;
        }
      }
    }
    const iso = new Date(trimmed);
    if (!isNaN(iso.getTime())) {
      const year = iso.getFullYear();
      if (year >= 1990 && year <= 2100) return iso;
    }
  }
  return null;
}

function inferStatus(opts: {
  boleto: string | null;
  receivedNote: string | null;
  paidDate: Date | null;
  finalValue: Prisma.Decimal | null;
}): FinancialControlStatus {
  const boletoNorm = normalizeText(opts.boleto);
  const receivedNorm = normalizeText(opts.receivedNote);

  if (boletoNorm.includes('CANCEL') || receivedNorm.includes('CANCEL')) {
    return 'CANCELADO';
  }
  if (
    opts.finalValue !== null &&
    Number(opts.finalValue) === 0 &&
    boletoNorm.includes('CANCEL')
  ) {
    return 'CANCELADO';
  }
  if (receivedNorm.startsWith('PAGO') || opts.paidDate) {
    if (receivedNorm.includes('ENFASE') || receivedNorm.includes('AGUARD')) {
      return 'AGUARDAR_NOTA';
    }
    return 'PAGO';
  }
  return 'AGUARDAR_NOTA';
}

/**
 * Mapeia uma cor hex (ARGB ou RGB) para um status. Cores próximas são tratadas
 * pela componente dominante (Verde / Vermelho / Amarelo). Retorna null se a
 * cor for branca/cinza/preta (sem destaque) ou não identificada.
 */
function inferStatusFromColor(argbOrRgb: string | null | undefined): FinancialControlStatus | null {
  if (!argbOrRgb) return null;
  let hex = argbOrRgb.toUpperCase().replace('#', '');
  // ExcelJS retorna ARGB (8 chars: AA RR GG BB). Remove alpha se presente.
  if (hex.length === 8) hex = hex.slice(2);
  if (hex.length !== 6) return null;

  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;

  // Branco / preto / cinza: sem destaque
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 30) return null; // cinza/preto/branco

  // Vermelho dominante
  if (r > 150 && r > g + 30 && r > b + 30) return 'CANCELADO';
  // Verde dominante
  if (g > 120 && g > r + 20 && g > b + 20) return 'PAGO';
  // Amarelo: vermelho + verde altos, azul baixo
  if (r > 180 && g > 150 && b < 130) return 'AGUARDAR_NOTA';

  return null;
}

/**
 * Extrai a cor de preenchimento de uma célula ExcelJS (formato ARGB).
 * Lida tanto com fill.fgColor quanto com cores indexadas / themed (não convertemos).
 */
function getCellFillArgb(cell: ExcelJS.Cell): string | null {
  const fill: any = (cell as any).fill;
  if (!fill || fill.type !== 'pattern') return null;
  const fg = fill.fgColor || fill.bgColor;
  if (!fg) return null;
  if (typeof fg.argb === 'string') return fg.argb;
  return null;
}

/**
 * Converte o valor de uma célula ExcelJS em algo "simples" (string, number,
 * Date, etc.). ExcelJS pode retornar objetos para fórmulas ou rich text.
 */
function unwrapCellValue(value: any): any {
  if (value === null || value === undefined) return null;
  if (typeof value === 'object') {
    if (value instanceof Date) return value;
    if ('result' in value) return value.result; // fórmulas
    if ('richText' in value && Array.isArray(value.richText)) {
      return value.richText.map((p: any) => p.text || '').join('');
    }
    if ('text' in value) return value.text;
  }
  return value;
}

/**
 * Parser para a planilha "Controle Financeiro - Material/Serviço Aplicado".
 * Detecta linhas separadoras tipo "PAGAMENTOS DE JANEIRO 2025" e usa a posição
 * fixa das colunas (O.S., Fornecedor, Parcela, Emissão, Boleto, Vencto, Vlr Orig, O.C., Vlr Final, Pago Dia, Falta Dias, Recebido)
 * conforme o cabeçalho identificado. Também lê a cor de fundo da coluna de
 * "Status" (geralmente coluna B) para inferir o status do lançamento.
 */
async function parseControleFinanceiroSpreadsheet(buffer: Buffer): Promise<ParseResult> {
  const warnings: string[] = [];
  const entries: ParsedEntry[] = [];
  const monthsDetected: { year: number; month: number; label: string }[] = [];
  const monthsSet = new Set<string>();

  // Carrega com exceljs para ter acesso a cores de células.
  // Converte para ArrayBuffer porque o tipo Buffer<ArrayBufferLike> do Node 22+
  // não é estritamente compatível com o tipo Buffer esperado pelo ExcelJS.
  const workbook = new ExcelJS.Workbook();
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;
  await workbook.xlsx.load(arrayBuffer);

  if (workbook.worksheets.length === 0) {
    warnings.push('Planilha sem abas válidas.');
    return { entries, warnings, monthsDetected };
  }

  // Procurar a aba mais relevante: "MATERIAL APLICADO" tem prioridade, senão a primeira
  const preferredNames = ['MATERIAL APLICADO', 'CONTROLE FINANCEIRO', 'PAGAMENTOS'];
  let worksheet = workbook.worksheets[0];
  for (const candidate of workbook.worksheets) {
    const norm = normalizeText(candidate.name);
    if (preferredNames.some((p) => norm.includes(p))) {
      worksheet = candidate;
      break;
    }
  }

  // Converte cada linha em array (índice 0-based) com valores "unwrapped".
  // Mantemos também uma matriz paralela com cores de fundo das células.
  const rows: any[][] = [];
  const colors: (string | null)[][] = [];
  worksheet.eachRow({ includeEmpty: true }, (row) => {
    const rowValues: any[] = [];
    const rowColors: (string | null)[] = [];
    // ExcelJS indexa 1-based; iteramos cell por cell até o último preenchido
    const lastCol = row.cellCount || 0;
    for (let c = 1; c <= lastCol; c++) {
      const cell = row.getCell(c);
      rowValues.push(unwrapCellValue(cell.value));
      rowColors.push(getCellFillArgb(cell));
    }
    // ignora linhas totalmente vazias
    if (rowValues.every((v) => v === null || v === undefined || String(v).trim() === '')) return;
    rows.push(rowValues);
    colors.push(rowColors);
  });

  // Mapeamento default das colunas conforme a planilha do usuário
  // (compatível com cabeçalho da imagem fornecida)
  let colIdx = {
    osCode: 0,
    statusColumn: 1, // coluna B: célula com cor representando status (geralmente vazia)
    supplierName: 2,
    parcelNumber: 3,
    emissionDate: 4,
    boleto: 5,
    dueDate: 6,
    originalValue: 7,
    ocNumber: 8,
    finalValue: 9,
    paidDate: 10,
    remainingDays: 11,
    receivedNote: 12,
  };

  let currentMonth: number | null = null;
  let currentYear: number | null = null;

  const tryDetectMonthYearFromRow = (row: any[]): { month: number; year: number } | null => {
    const joined = row
      .map((c) => (c === null || c === undefined ? '' : String(c)))
      .join(' ');
    const text = normalizeText(joined);
    // Ex.: "PAGAMENTOS DE JANEIRO 2025", "PAGAMENTOS DE JANEIRO/2025"
    const match = text.match(/PAGAMENTOS DE\s+([A-Z]+)[\s/-]+(\d{4})/);
    if (!match) return null;
    const monthName = match[1];
    const year = parseInt(match[2], 10);
    const month = MONTHS_PT_TO_NUM[monthName];
    if (!month || !year) return null;
    return { month, year };
  };

  const tryRemapColumnsFromHeader = (row: any[]) => {
    // Reconfigura o mapeamento caso o cabeçalho tenha posições diferentes.
    const normalized = row.map((c) => normalizeText(c));
    const findCol = (...candidates: string[]) => {
      for (const cand of candidates) {
        const idx = normalized.findIndex((h) => h === cand || h.includes(cand));
        if (idx !== -1) return idx;
      }
      return -1;
    };

    const m = {
      osCode: findCol('O.S.', 'OS'),
      supplierName: findCol('CODIGO-NOME DO FORNECEDOR', 'NOME DO FORNECEDOR', 'FORNECEDOR'),
      parcelNumber: findCol('PRF-NUMERO PARCELA', 'NUMERO DA PARCELA', 'NUMERO PARCELA', 'PARCELA'),
      emissionDate: findCol('DATA DE EMISSAO', 'EMISSAO'),
      boleto: findCol('BOLETO'),
      dueDate: findCol('DATA DE VENCTO', 'DATA DE VENCIMENTO', 'VENCTO', 'VENCIMENTO'),
      originalValue: findCol('VALOR ORIGINAL'),
      ocNumber: findCol('O. C.', 'O.C.', 'OC'),
      finalValue: findCol('VALOR FINAL'),
      paidDate: findCol('DATA DE PAGAMENTO', 'DATA PAGAMENTO', 'DATA PAGTO', 'PAGO DIA', 'PAGAMENTO'),
      remainingDays: findCol('DIFERENCA DE DIAS', 'DIFERENCA DIAS', 'FALTA DIAS', 'DIAS'),
      receivedNote: findCol('OBSERVACAO', 'OBSERVACOES', 'OBS', 'RECEBIDO'),
    };

    // Se O.S. está em coluna X e Fornecedor está em X+2 (gap de 1), a coluna do meio
    // costuma ser a célula de "Status" (coloridinha). Detectamos esse padrão automaticamente.
    let statusColumn = colIdx.statusColumn;
    if (m.osCode >= 0 && m.supplierName > m.osCode) {
      const gap = m.supplierName - m.osCode;
      if (gap === 2) {
        statusColumn = m.osCode + 1;
      } else {
        statusColumn = -1; // sem coluna de status separada
      }
    }

    // Só remapeia se identificou pelo menos 4 colunas-chave (evita falsos positivos)
    const knownCount = Object.values(m).filter((v) => v >= 0).length;
    if (knownCount >= 4) {
      // Garante que cada índice seja único — se uma coluna não foi achada pelo nome
      // e o índice default colide com outra que JÁ foi mapeada, descarta o default.
      const usedIndices = new Set<number>(Object.values(m).filter((v) => v >= 0) as number[]);
      if (statusColumn >= 0) usedIndices.add(statusColumn);
      const safeFallback = (mapped: number, fallback: number) => {
        if (mapped >= 0) return mapped;
        if (usedIndices.has(fallback)) return -1; // descarta para não duplicar
        return fallback;
      };
      colIdx = {
        osCode: safeFallback(m.osCode, colIdx.osCode),
        statusColumn,
        supplierName: safeFallback(m.supplierName, colIdx.supplierName),
        parcelNumber: safeFallback(m.parcelNumber, colIdx.parcelNumber),
        emissionDate: safeFallback(m.emissionDate, colIdx.emissionDate),
        boleto: safeFallback(m.boleto, colIdx.boleto),
        dueDate: safeFallback(m.dueDate, colIdx.dueDate),
        originalValue: safeFallback(m.originalValue, colIdx.originalValue),
        ocNumber: safeFallback(m.ocNumber, colIdx.ocNumber),
        finalValue: safeFallback(m.finalValue, colIdx.finalValue),
        paidDate: safeFallback(m.paidDate, colIdx.paidDate),
        remainingDays: safeFallback(m.remainingDays, colIdx.remainingDays),
        receivedNote: safeFallback(m.receivedNote, colIdx.receivedNote),
      };
    }
  };

  const isHeaderRow = (row: any[]): boolean => {
    const joined = normalizeText(row.map((c) => (c ?? '')).join(' '));
    return (
      joined.includes('O.S.') &&
      joined.includes('FORNECEDOR') &&
      (joined.includes('VENCTO') || joined.includes('VENCIMENTO'))
    );
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowColors = colors[i];
    if (!row || row.every((c) => c === null || c === undefined || String(c).trim() === '')) continue;

    // 1) Linha de cabeçalho de mês ("PAGAMENTOS DE JANEIRO 2025")
    const detected = tryDetectMonthYearFromRow(row);
    if (detected) {
      currentMonth = detected.month;
      currentYear = detected.year;
      const key = `${detected.year}-${detected.month}`;
      if (!monthsSet.has(key)) {
        monthsSet.add(key);
        monthsDetected.push({
          year: detected.year,
          month: detected.month,
          label: `${Object.keys(MONTHS_PT_TO_NUM).find((k) => MONTHS_PT_TO_NUM[k] === detected.month)} ${detected.year}`,
        });
      }
      continue;
    }

    // 2) Linha de cabeçalho das colunas: reconfigurar mapeamento
    if (isHeaderRow(row)) {
      tryRemapColumnsFromHeader(row);
      continue;
    }

    // 3) Linhas legenda/topo (PROCESSO COMPLETO, CONTROLE FINANCEIRO, FORNECEDOR sozinho)
    const firstCellNorm = normalizeText(row[0]);
    if (
      firstCellNorm === 'PROCESSO COMPLETO' ||
      firstCellNorm === 'PAGO, AGUARDAR A NOTA' ||
      firstCellNorm === 'FORNECEDOR' ||
      firstCellNorm.includes('CONTROLE FINANCEIRO')
    ) {
      continue;
    }

    // 4) Linha de dados — precisamos do mês/ano correntes
    if (currentMonth === null || currentYear === null) {
      // Sem mês definido ainda, pula
      continue;
    }

    const osCode = row[colIdx.osCode] ? String(row[colIdx.osCode]).trim() : null;
    const supplierName = row[colIdx.supplierName] ? String(row[colIdx.supplierName]).trim() : null;

    // Linha precisa ter pelo menos O.S. ou Fornecedor para ser considerada
    if (!osCode && !supplierName) continue;

    const parcelNumberRaw = row[colIdx.parcelNumber];
    const parcelNumber =
      parcelNumberRaw === null || parcelNumberRaw === undefined || parcelNumberRaw === ''
        ? null
        : String(parcelNumberRaw).trim();
    const emissionDate = parseCellDate(row[colIdx.emissionDate]);
    const boletoRaw = row[colIdx.boleto];
    const boleto = boletoRaw === null || boletoRaw === undefined ? null : String(boletoRaw).trim();
    const dueDate = parseCellDate(row[colIdx.dueDate]);
    const origNum = parseNumber(row[colIdx.originalValue]);
    const originalValue = origNum === null ? null : new Prisma.Decimal(origNum);
    const ocNumberRaw = row[colIdx.ocNumber];
    const ocNumber =
      ocNumberRaw === null || ocNumberRaw === undefined || ocNumberRaw === ''
        ? null
        : String(ocNumberRaw).trim();
    const finalNum = parseNumber(row[colIdx.finalValue]);
    const finalValue = finalNum === null ? null : new Prisma.Decimal(finalNum);
    const paidDate = parseCellDate(row[colIdx.paidDate]);
    const remainingDaysRaw = row[colIdx.remainingDays];
    let remainingDays: number | null = null;
    if (remainingDaysRaw !== null && remainingDaysRaw !== undefined && remainingDaysRaw !== '') {
      const n = typeof remainingDaysRaw === 'number'
        ? remainingDaysRaw
        : parseInt(String(remainingDaysRaw), 10);
      remainingDays = isNaN(n) ? null : n;
    }
    const receivedNoteRaw = row[colIdx.receivedNote];
    const receivedNote =
      receivedNoteRaw === null || receivedNoteRaw === undefined
        ? null
        : String(receivedNoteRaw).trim() || null;

    // Status: primeiro tenta pela cor da célula de status; se não, infere pelo conteúdo
    let status: FinancialControlStatus | null = null;
    if (colIdx.statusColumn >= 0 && rowColors && rowColors[colIdx.statusColumn]) {
      status = inferStatusFromColor(rowColors[colIdx.statusColumn]);
    }
    // Se não detectou pela coluna B, tenta pela cor da própria célula do boleto ou data de pagamento
    if (!status && colIdx.boleto >= 0 && rowColors && rowColors[colIdx.boleto]) {
      status = inferStatusFromColor(rowColors[colIdx.boleto]);
    }
    if (!status && colIdx.paidDate >= 0 && rowColors && rowColors[colIdx.paidDate]) {
      status = inferStatusFromColor(rowColors[colIdx.paidDate]);
    }
    if (!status) {
      status = inferStatus({ boleto, receivedNote, paidDate, finalValue });
    }

    entries.push({
      paymentMonth: currentMonth,
      paymentYear: currentYear,
      status,
      osCode,
      supplierName,
      parcelNumber,
      emissionDate,
      boleto,
      dueDate,
      originalValue,
      ocNumber,
      finalValue,
      paidDate,
      remainingDays,
      receivedNote,
      notes: null,
    });
  }

  if (!entries.length) {
    warnings.push(
      'Nenhuma linha válida encontrada. Verifique se a planilha contém cabeçalhos "PAGAMENTOS DE [MÊS] [ANO]" antes das linhas de pagamento.'
    );
  }

  return { entries, warnings, monthsDetected };
}
