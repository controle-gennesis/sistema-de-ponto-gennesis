import * as XLSX from 'xlsx';
import {
  basenamePath,
  buildZipMatchIndex,
  entryMatchesIndex,
  isZipFile,
  listZipEntryNames,
  normalizeMatchKey,
} from '@/lib/zipEntryNames';

export type FdAnexoImport = {
  id: string;
  name: string;
  sourcePath: string;
  kind: string;
};

export type FdImportRow = {
  externalId: string;
  numMovRm: string;
  idMovRm: string;
  codigoPedido: string;
  solicitanteRef: string;
  /** Nome do colaborador (aba COLABORADORES), Title Case. */
  solicitanteNome: string;
  contratoExternalId: string;
  /** Nome do contrato (aba CONTRATOS). */
  contratoNome: string;
  obraExternalId: string;
  obraNome: string;
  codFichaDemanda: string;
  faturamentoEstimado: number | string;
  custoEstimado: number | string;
  observacao: string;
  dataHora: string;
  polo: string;
  statusFd: string;
  statusCompras: string;
  anexos: FdAnexoImport[];
};

export type FdImportReport = {
  fichas: FdImportRow[];
  sheets: { name: string; kind: string; rows: number }[];
  anexoPaths: number;
  /** Aba usada como fonte das fichas (ex.: TB_FICHA_DEMANDA). */
  fichaSheetName: string;
  anexoSheetName: string | null;
};

export type LinkedFilePack = {
  names: string[];
  matched: number;
  unmatchedSample: string[];
};

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  return String(value).trim();
}

function excelSerialToIso(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  return new Date(ms).toISOString();
}

function cellToDateString(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  if (typeof value === 'number' && value > 20000 && value < 100000) {
    return excelSerialToIso(value);
  }
  const s = cellToString(value);
  if (!s) return '';
  const n = Number(s);
  if (Number.isFinite(n) && n > 20000 && n < 100000) return excelSerialToIso(n);
  return s;
}

function normalizeHeader(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function headerMap(row: unknown[]): Record<string, number> {
  const map: Record<string, number> = {};
  row.forEach((cell, idx) => {
    const key = normalizeHeader(cellToString(cell));
    if (key && map[key] === undefined) map[key] = idx;
  });
  return map;
}

function pick(map: Record<string, number>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const n = normalizeHeader(key);
    if (map[n] !== undefined) return map[n];
  }
  return undefined;
}

function get(row: unknown[], index: number | undefined): string {
  if (index === undefined) return '';
  return cellToString(row[index]);
}

function getDate(row: unknown[], index: number | undefined): string {
  if (index === undefined) return '';
  return cellToDateString(row[index]);
}

function usefulRow(row: unknown[]): boolean {
  return row.some((c) => cellToString(c));
}

const PERSON_NAME_PARTICLES = new Set([
  'de',
  'da',
  'do',
  'das',
  'dos',
  'e',
  'di',
  'del',
]);

/** Ex.: "ADAO BERNARDES DA SILVA" → "Adao Bernardes da Silva". */
export function formatFdDisplayName(value: string): string {
  const words = value
    .trim()
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean);
  return words
    .map((word, index) => {
      if (index > 0 && PERSON_NAME_PARTICLES.has(word)) return word;
      return word
        .split('-')
        .map((part) =>
          part ? part.charAt(0).toLocaleUpperCase('pt-BR') + part.slice(1) : part,
        )
        .join('-');
    })
    .join(' ');
}

function buildLookupMap(
  matrix: unknown[][],
  idKeys: string[],
  nameKeys: string[],
): Map<string, string> {
  const map = new Map<string, string>();
  if (!matrix.length) return map;
  const headers = headerMap(matrix[0] || []);
  const idIdx = pick(headers, ...idKeys);
  const nameIdx = pick(headers, ...nameKeys);
  if (idIdx === undefined || nameIdx === undefined) return map;
  for (const row of matrix.slice(1)) {
    if (!usefulRow(row)) continue;
    const id = get(row, idIdx);
    const name = get(row, nameIdx);
    if (!id || !name) continue;
    for (const key of idLookupKeys(id)) map.set(key, name);
  }
  return map;
}

/** Variantes de ID para casar CPF com/sem zero à esquerda e caixa. */
function idLookupKeys(id: string): string[] {
  const raw = id.trim();
  if (!raw) return [];
  const keys = new Set<string>([raw, raw.toLowerCase()]);
  const digits = raw.replace(/\D/g, '');
  if (digits) {
    keys.add(digits);
    keys.add(digits.replace(/^0+/, '') || '0');
    if (digits.length <= 11) keys.add(digits.padStart(11, '0'));
  }
  return Array.from(keys);
}

function lookupName(map: Map<string, string>, id: string): string {
  for (const key of idLookupKeys(id)) {
    const hit = map.get(key);
    if (hit) return hit;
  }
  return '';
}

function sheetMatrix(sheet: XLSX.WorkSheet): unknown[][] {
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    raw: true,
  }) as unknown[][];
}

const ANEXO_KINDS = [
  { key: 'anexo fd', kind: 'ANEXO_FD' },
  { key: 'anexo rm', kind: 'ANEXO_RM' },
  { key: 'anexo croqui', kind: 'ANEXO_CROQUI' },
  { key: 'anexo oc', kind: 'ANEXO_OC' },
  { key: 'anexo', kind: 'ANEXO' },
  { key: 'caminho', kind: 'ANEXO' },
  { key: 'arquivo', kind: 'ANEXO' },
  { key: 'file name', kind: 'ANEXO' },
  { key: 'filename', kind: 'ANEXO' },
  { key: 'nome arquivo', kind: 'ANEXO' },
] as const;

function looksLikeFilePath(value: string): boolean {
  const v = value.trim();
  if (!v || v.length < 3) return false;
  if (/^https?:\/\//i.test(v)) return true;
  if (/[\\/]/.test(v) && /\.[a-z0-9]{2,5}$/i.test(v)) return true;
  if (/\.(pdf|png|jpe?g|gif|webp|docx?|xlsx?|zip|msg|eml)$/i.test(v)) return true;
  if (/_files[\\/]/i.test(v)) return true;
  return false;
}

function discoverAnexoPathColumns(
  map: Record<string, number>,
  sampleRows: unknown[][],
): Array<{ idx: number; kind: string }> {
  const used = new Set<number>();
  const out: Array<{ idx: number; kind: string }> = [];

  const push = (idx: number | undefined, kind: string) => {
    if (idx === undefined || used.has(idx)) return;
    used.add(idx);
    out.push({ idx, kind });
  };

  for (const k of ANEXO_KINDS) {
    push(pick(map, k.key), k.kind);
  }

  for (const [header, idx] of Object.entries(map)) {
    if (used.has(idx)) continue;
    if (/^id\b/.test(header)) continue;
    if (/status|data|hora|observ|descricao|tipo(?!\s*anexo)/.test(header)) continue;
    if (/anexo|arquivo|caminho|path|file|documento|hyperlink|anexo_/.test(header)) {
      const kind =
        ANEXO_KINDS.find((k) => header.includes(k.key))?.kind ||
        header.replace(/\s+/g, '_').toUpperCase().slice(0, 40) ||
        'ANEXO';
      push(idx, kind);
    }
  }

  if (!out.length) {
    for (const [header, idx] of Object.entries(map)) {
      if (used.has(idx) || /^id\b/.test(header)) continue;
      let hits = 0;
      for (const row of sampleRows.slice(0, 40)) {
        if (looksLikeFilePath(get(row, idx))) hits += 1;
      }
      if (hits >= 2) push(idx, 'ANEXO');
    }
  }

  return out;
}

function cellHyperlinkTarget(sheet: XLSX.WorkSheet, rowIndex: number, colIndex: number): string {
  try {
    const addr = XLSX.utils.encode_cell({ r: rowIndex, c: colIndex });
    const cell = sheet[addr] as { l?: { Target?: string }; v?: unknown } | undefined;
    const target = String(cell?.l?.Target || '').trim();
    if (target) return target;
  } catch {
    // ignore
  }
  return '';
}

export function collectFdAnexos(fichas: FdImportRow[]): FdAnexoImport[] {
  const out: FdAnexoImport[] = [];
  for (const f of fichas) out.push(...f.anexos);
  return out;
}

export async function inspectFdFilePack(
  files: File[],
  expected: FdAnexoImport[],
): Promise<LinkedFilePack> {
  const names: string[] = [];
  for (const file of files) {
    if (isZipFile(file)) {
      names.push(...(await listZipEntryNames(file)));
    } else {
      names.push(file.name);
    }
  }

  const index = buildZipMatchIndex(names);
  let matched = 0;
  let sinceYield = 0;
  for (const exp of expected) {
    if (entryMatchesIndex(index, exp.sourcePath, exp.id)) matched += 1;
    sinceYield += 1;
    if (sinceYield >= 500) {
      sinceYield = 0;
      await new Promise<void>((r) => setTimeout(r, 0));
    }
  }

  const expectedBases = new Set<string>();
  const expectedNoExt = new Set<string>();
  for (const exp of expected) {
    if (!exp.sourcePath) continue;
    const base = normalizeMatchKey(basenamePath(exp.sourcePath));
    if (!base) continue;
    expectedBases.add(base);
    expectedNoExt.add(base.replace(/\.[a-z0-9]+$/, ''));
  }

  const unmatchedSample: string[] = [];
  for (const n of names) {
    if (unmatchedSample.length >= 8) break;
    const b = normalizeMatchKey(basenamePath(n));
    const noExt = b.replace(/\.[a-z0-9]+$/, '');
    if (expectedBases.has(b) || expectedNoExt.has(noExt)) continue;
    unmatchedSample.push(n);
  }

  return { names, matched, unmatchedSample };
}

export async function parseFichaDemandaImportFromFile(file: File): Promise<FdImportReport> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  if (!workbook.SheetNames.length) throw new Error('Planilha sem abas.');

  const sheets: FdImportReport['sheets'] = [];
  let fichaSheet: {
    name: string;
    matrix: unknown[][];
    map: Record<string, number>;
    headerIndex: number;
    score: number;
  } | null = null;
  let anexoSheet: {
    name: string;
    matrix: unknown[][];
    map: Record<string, number>;
    headerIndex: number;
    sheet: XLSX.WorkSheet;
  } | null = null;
  let colaboradoresMatrix: unknown[][] | null = null;
  let contratosMatrix: unknown[][] | null = null;
  let obrasMatrix: unknown[][] | null = null;

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    const matrix = sheetMatrix(sheet);
    const map = headerMap(matrix[0] || []);
    const headers = Object.keys(map);
    // Nunca tratar aba de anexos como ficha (também tem ID_FICHA_DEMANDA).
    const isAnexo =
      /anexo/i.test(name) ||
      headers.includes('id anexo ficha demanda') ||
      headers.some((h) => /\banexo\b/.test(h) && /(fd|rm|croqui|oc|path|arquivo|caminho)/.test(h));
    const isColaboradores =
      /colaborador/i.test(name) ||
      (headers.includes('id colaborador') &&
        (headers.includes('nomecolaborador') || headers.includes('nome colaborador')));
    const isContratos =
      /^contratos?$/i.test(name.trim()) ||
      (headers.includes('id contrato') &&
        headers.includes('contrato') &&
        !headers.includes('id ficha demanda') &&
        !headers.includes('num mov rm'));
    const isObras =
      /^obras?$/i.test(name.trim()) ||
      (headers.includes('id obra') && headers.includes('obra') && !headers.includes('id ficha demanda'));
    const isAuxiliar =
      isColaboradores ||
      isContratos ||
      isObras ||
      /aprovacao|status|compra/i.test(name) ||
      (headers.includes('status compras') && !headers.includes('num mov rm'));
    const isFicha =
      !isAnexo &&
      !isAuxiliar &&
      (headers.includes('id ficha demanda') ||
        (headers.includes('cod ficha demanda') && headers.includes('num mov rm')) ||
        (/ficha/i.test(name) && /demanda/i.test(name)));

    const dataRows = matrix.slice(1).filter(usefulRow).length;
    if (isColaboradores) {
      sheets.push({ name, kind: 'colaboradores', rows: dataRows });
      colaboradoresMatrix = matrix;
    } else if (isContratos) {
      sheets.push({ name, kind: 'contratos', rows: dataRows });
      contratosMatrix = matrix;
    } else if (isObras) {
      sheets.push({ name, kind: 'obras', rows: dataRows });
      obrasMatrix = matrix;
    } else if (isAnexo) {
      sheets.push({ name, kind: 'anexos', rows: dataRows });
      if (
        !anexoSheet ||
        /anexo/i.test(name) ||
        headers.includes('id anexo ficha demanda')
      ) {
        anexoSheet = { name, matrix, map, headerIndex: 0, sheet };
      }
    } else if (isFicha) {
      sheets.push({ name, kind: 'fichas', rows: dataRows });
      const score =
        (headers.includes('contrato') ? 20 : 0) +
        (headers.includes('cod ficha demanda') ? 8 : 0) +
        (headers.includes('num mov rm') ? 4 : 0) +
        (/^tb[_\s-]?ficha[_\s-]?demanda$/i.test(name.trim()) ? 50 : 0) +
        (/ficha/i.test(name) && /demanda/i.test(name) ? 10 : 0);
      if (!fichaSheet || score > fichaSheet.score) {
        fichaSheet = { name, matrix, map, headerIndex: 0, score };
      }
    } else {
      sheets.push({ name, kind: 'ignorada', rows: dataRows });
    }
  }

  // Preferência explícita pela aba canônica, se existir.
  const canonical = workbook.SheetNames.find((n) =>
    /^tb[_\s-]?ficha[_\s-]?demanda$/i.test(n.trim()),
  );
  if (canonical && workbook.Sheets[canonical]) {
    const sheet = workbook.Sheets[canonical]!;
    const matrix = sheetMatrix(sheet);
    const map = headerMap(matrix[0] || []);
    if (Object.keys(map).includes('id ficha demanda') || Object.keys(map).includes('contrato')) {
      fichaSheet = { name: canonical, matrix, map, headerIndex: 0, score: 999 };
      const existing = sheets.find((s) => s.name === canonical);
      if (existing) existing.kind = 'fichas';
    }
  }

  if (!fichaSheet) {
    throw new Error(
      'Não encontrei a aba TB_FICHA_DEMANDA (precisa de ID_FICHA_DEMANDA / COD_FICHA_DEMANDA).',
    );
  }

  const anexosByFd = new Map<string, FdAnexoImport[]>();
  if (anexoSheet) {
    const m = anexoSheet.map;
    const idAnexoIdx = pick(m, 'id anexo ficha demanda', 'id anexo');
    const idFdIdx = pick(m, 'id ficha demanda', 'ficha demanda', 'id fd');
    const sampleRows = anexoSheet.matrix.slice(anexoSheet.headerIndex + 1).filter(usefulRow);
    const kindIdxs = discoverAnexoPathColumns(m, sampleRows);

    for (let r = anexoSheet.headerIndex + 1; r < anexoSheet.matrix.length; r += 1) {
      const row = anexoSheet.matrix[r];
      if (!row || !usefulRow(row)) continue;
      const fdId = get(row, idFdIdx);
      if (!fdId) continue;
      const anexoRowId = get(row, idAnexoIdx) || fdId;
      const list = anexosByFd.get(fdId) || [];
      const before = list.length;
      for (const kind of kindIdxs) {
        const fromCell = get(row, kind.idx);
        const fromLink = cellHyperlinkTarget(anexoSheet.sheet, r, kind.idx);
        const sourcePath = looksLikeFilePath(fromCell)
          ? fromCell
          : looksLikeFilePath(fromLink)
            ? fromLink
            : fromCell || fromLink;
        if (!sourcePath) continue;
        list.push({
          id: `${anexoRowId}-${kind.kind}`,
          name: basenamePath(sourcePath),
          sourcePath,
          kind: kind.kind,
        });
      }
      // Fallback: qualquer célula da linha que pareça caminho de arquivo
      if (list.length === before) {
        row.forEach((cell, colIdx) => {
          if (colIdx === idFdIdx || colIdx === idAnexoIdx) return;
          const fromCell = cellToString(cell);
          const fromLink = cellHyperlinkTarget(anexoSheet.sheet, r, colIdx);
          const sourcePath = looksLikeFilePath(fromCell)
            ? fromCell
            : looksLikeFilePath(fromLink)
              ? fromLink
              : '';
          if (!sourcePath) return;
          list.push({
            id: `${anexoRowId}-COL${colIdx}`,
            name: basenamePath(sourcePath),
            sourcePath,
            kind: 'ANEXO',
          });
        });
      }
      anexosByFd.set(fdId, list);
    }
  }

  const fm = fichaSheet.map;
  const idx = {
    id: pick(fm, 'id ficha demanda', 'id fd', 'idfichademanda'),
    numMov: pick(fm, 'num mov rm', 'num mov', 'numero mov rm'),
    idMov: pick(fm, 'id mov rm', 'id mov'),
    pedido: pick(fm, 'cod pedido', 'codigo pedido', 'código pedido'),
    solicitante: pick(fm, 'solicitante', 'id solicitante', 'cpf solicitante'),
    contrato: pick(
      fm,
      'contrato',
      'id contrato',
      'contrato id',
      'cod contrato',
      'codigo contrato',
      'número contrato',
      'numero contrato',
      'n contrato',
      'contrato external id',
      'external id contrato',
      'cc',
      'centro de custo',
    ),
    obra: pick(fm, 'obra', 'id obra', 'obra id', 'nome obra', 'cod obra'),
    codFd: pick(fm, 'cod ficha demanda', 'codigo ficha demanda', 'código ficha demanda'),
    fat: pick(fm, 'faturamento estimado', 'faturamento'),
    custo: pick(fm, 'custo estimado', 'custo'),
    obs: pick(fm, 'observacao', 'observação', 'obs'),
    data: pick(fm, 'data hora', 'data/hora', 'data', 'created at', 'criado em'),
    polo: pick(fm, 'polo', 'uf', 'regiao', 'região'),
    statusFd: pick(fm, 'status fd', 'status ficha', 'status'),
    statusCompras: pick(fm, 'status compras', 'status compra'),
  };

  if (idx.contrato === undefined) {
    // Última chance: header que contenha "contrato"
    for (const [header, col] of Object.entries(fm)) {
      if (/\bcontrato\b/.test(header)) {
        idx.contrato = col;
        break;
      }
    }
  }

  const colaboradorById = buildLookupMap(
    colaboradoresMatrix || [],
    ['id colaborador', 'id_colaborador', 'colaborador', 'id'],
    ['nome colaborador', 'nomecolaborador', 'nome', 'colaborador nome'],
  );
  const contratoById = buildLookupMap(
    contratosMatrix || [],
    ['id contrato', 'id_contrato', 'contrato id'],
    ['contrato', 'nome contrato', 'nome'],
  );
  const obraById = buildLookupMap(
    obrasMatrix || [],
    ['id obra', 'id_obra', 'obra id'],
    ['obra', 'nome obra', 'nome'],
  );

  const fichas: FdImportRow[] = [];
  for (const row of fichaSheet.matrix.slice(fichaSheet.headerIndex + 1)) {
    if (!usefulRow(row)) continue;
    const externalId = get(row, idx.id);
    if (!externalId) continue;
    const obraRef = get(row, idx.obra);
    const solicitanteRef = get(row, idx.solicitante);
    const contratoRef = get(row, idx.contrato);
    const colaboradorRaw = lookupName(colaboradorById, solicitanteRef);
    const contratoRaw = lookupName(contratoById, contratoRef);
    const obraRaw = lookupName(obraById, obraRef);
    fichas.push({
      externalId,
      numMovRm: get(row, idx.numMov),
      idMovRm: get(row, idx.idMov),
      codigoPedido: get(row, idx.pedido),
      solicitanteRef,
      solicitanteNome: colaboradorRaw ? formatFdDisplayName(colaboradorRaw) : '',
      contratoExternalId: contratoRef,
      contratoNome: contratoRaw ? formatFdDisplayName(contratoRaw) : '',
      obraExternalId: obraRef,
      obraNome: obraRaw ? formatFdDisplayName(obraRaw) : obraRef,
      codFichaDemanda: get(row, idx.codFd),
      faturamentoEstimado: get(row, idx.fat) || 0,
      custoEstimado: get(row, idx.custo) || 0,
      observacao: get(row, idx.obs),
      dataHora: getDate(row, idx.data),
      polo: get(row, idx.polo) || 'DF',
      statusFd: get(row, idx.statusFd),
      statusCompras: get(row, idx.statusCompras),
      anexos: anexosByFd.get(externalId) || [],
    });
  }

  if (!fichas.length) throw new Error('Nenhuma ficha válida encontrada na planilha.');

  const withContrato = fichas.filter((f) => String(f.contratoExternalId || '').trim()).length;
  if (withContrato === 0) {
    throw new Error(
      `A aba "${fichaSheet.name}" foi lida, mas nenhuma linha tem CONTRATO. ` +
        'Confirme que selecionou DB_FD_SUPRIMENTOS.xlsx e a aba TB_FICHA_DEMANDA.',
    );
  }

  const anexoPaths = fichas.reduce((acc, f) => acc + f.anexos.length, 0);
  return {
    fichas,
    sheets,
    anexoPaths,
    fichaSheetName: fichaSheet.name,
    anexoSheetName: anexoSheet?.name ?? null,
  };
}
