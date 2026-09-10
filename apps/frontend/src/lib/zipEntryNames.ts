/** Lista nomes de arquivos dentro de um ZIP (sem extrair o conteúdo). */

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/**
 * Lê só o fim do arquivo + diretório central — não carrega o ZIP inteiro na RAM
 * (crítico para ZIPs de centenas de MB / GB).
 */
export async function listZipEntryNames(file: File): Promise<string[]> {
  if (file.size < 22) throw new Error('ZIP inválido. Envie um arquivo .zip padrão.');

  const maxScan = Math.min(file.size, 65535 + 22);
  const tailBuf = await file.slice(file.size - maxScan).arrayBuffer();
  const tailView = new DataView(tailBuf);
  const eocdInTail = findEocd(tailView);
  if (eocdInTail < 0) throw new Error('ZIP inválido. Envie um arquivo .zip padrão.');

  const cdOffset = tailView.getUint32(eocdInTail + 16, true);
  const cdSize = tailView.getUint32(eocdInTail + 12, true);
  if (cdOffset === 0xffffffff || cdSize === 0xffffffff) {
    throw new Error('ZIP64 não é suportado. Compacte os arquivos em um ZIP padrão.');
  }
  if (cdSize <= 0 || cdOffset + cdSize > file.size) {
    throw new Error('ZIP inválido (diretório central).');
  }

  const cdBuf = await file.slice(cdOffset, cdOffset + cdSize).arrayBuffer();
  const view = new DataView(cdBuf);
  const bytes = new Uint8Array(cdBuf);
  const names: string[] = [];
  let pos = 0;
  const end = bytes.length;
  const dec = new TextDecoder('utf-8');
  let sinceYield = 0;

  while (pos + 46 <= end) {
    if (view.getUint32(pos, true) !== 0x02014b50) break;
    const flags = view.getUint16(pos + 8, true);
    const nameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const raw = bytes.subarray(pos + 46, pos + 46 + nameLen);
    let name = dec.decode(raw);
    if ((flags & 0x800) === 0 && name.includes('\uFFFD')) {
      name = latin1Decode(raw);
    }
    const normalized = name.replace(/\\/g, '/');
    if (normalized && !normalized.endsWith('/') && !normalized.startsWith('__MACOSX/')) {
      const base = normalized.split('/').pop() || '';
      if (base && !base.startsWith('.')) names.push(normalized);
    }
    pos += 46 + nameLen + extraLen + commentLen;
    sinceYield += 1;
    if (sinceYield >= 800) {
      sinceYield = 0;
      await yieldToMain();
    }
  }
  return names;
}

function findEocd(view: DataView): number {
  const len = view.byteLength;
  const maxScan = Math.min(len, 65535 + 22);
  for (let i = len - 22; i >= len - maxScan && i >= 0; i -= 1) {
    if (view.getUint32(i, true) === 0x06054b50) return i;
  }
  return -1;
}

function latin1Decode(raw: Uint8Array): string {
  let out = '';
  for (let i = 0; i < raw.length; i += 1) out += String.fromCharCode(raw[i]!);
  return out;
}

export function isZipFile(file: File): boolean {
  return (
    file.type.includes('zip') ||
    /\.zip$/i.test(file.name) ||
    file.type === 'application/x-zip-compressed'
  );
}

export function basenamePath(pathLike: string): string {
  return pathLike.replace(/\\/g, '/').split('/').filter(Boolean).pop() || pathLike;
}

export function normalizeMatchKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function fileMatchesRecord(
  fileName: string,
  sourcePath?: string | null,
  externalId?: string | null,
): boolean {
  const entry = normalizeMatchKey(basenamePath(fileName));
  const source = sourcePath ? normalizeMatchKey(basenamePath(sourcePath)) : '';
  if (
    source &&
    (entry === source ||
      entry.replace(/\.[a-z0-9]+$/, '') === source.replace(/\.[a-z0-9]+$/, ''))
  ) {
    return true;
  }
  const id = normalizeMatchKey(externalId || '');
  if (id && entry.includes(id)) return true;
  return false;
}

/** Índice O(1) para cruzar milhares de arquivos do ZIP com caminhos da planilha. */
export function buildZipMatchIndex(entryNames: string[]): {
  byBase: Set<string>;
  byBaseNoExt: Set<string>;
  rawBases: string[];
} {
  const byBase = new Set<string>();
  const byBaseNoExt = new Set<string>();
  const rawBases: string[] = [];
  for (const n of entryNames) {
    const base = normalizeMatchKey(basenamePath(n));
    if (!base) continue;
    rawBases.push(base);
    byBase.add(base);
    byBaseNoExt.add(base.replace(/\.[a-z0-9]+$/, ''));
  }
  return { byBase, byBaseNoExt, rawBases };
}

export function entryMatchesIndex(
  index: ReturnType<typeof buildZipMatchIndex>,
  sourcePath?: string | null,
  externalId?: string | null,
): boolean {
  const source = sourcePath ? normalizeMatchKey(basenamePath(sourcePath)) : '';
  if (source) {
    if (index.byBase.has(source)) return true;
    const noExt = source.replace(/\.[a-z0-9]+$/, '');
    if (noExt && index.byBaseNoExt.has(noExt)) return true;
    return false;
  }
  const id = normalizeMatchKey(externalId || '');
  if (!id) return false;
  // Só quando não há caminho: busca leve por inclusão do id no nome do arquivo.
  for (const base of index.rawBases) {
    if (base.includes(id)) return true;
  }
  return false;
}
