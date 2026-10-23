import { loadPdfjs } from '@/lib/loadPdfjs';

/** "OC 21526 - ID 96471 - FORNECEDOR..." → "96471" (o ID, não o número da OC). */
export function extractOcIdFromFileName(name: string): string | null {
  const match = /(?:^|[^a-z0-9])ID\s*[-:]?\s*(\d{3,})/i.exec(name || '');
  return match?.[1] ?? null;
}

/**
 * Acha o ID no texto da OC. O PDF pode sair em duas ordens:
 *  - "Ordem de Compra No. 021526 ID Ordem de Compra: 96471" (número, depois ID);
 *  - "Ordem de Compra No. ID Ordem de Compra: 021526 96471" (rótulos juntos, depois os dois valores).
 * No segundo caso o ID é o segundo número.
 */
export function extractOcIdFromText(text: string): string | null {
  const flat = (text || '').replace(/\s+/g, ' ');
  const match = /ID Ordem de Compra\s*:?\s*(\d+)(?=\s|$)(?:\s+(\d+)(?=\s|$))?/i.exec(flat);
  if (!match) return null;
  const rotulosJuntos = /Ordem de Compra No\.?\s*ID Ordem de Compra/i.test(flat);
  return rotulosJuntos && match[2] ? match[2] : match[1] ?? null;
}

/** Lê a primeira página do PDF da OC e procura o ID no texto. */
async function extractOcIdFromPdf(file: File): Promise<string | null> {
  try {
    const pdfjs = await loadPdfjs();
    const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
    const page = await doc.getPage(1);
    const content = await page.getTextContent();
    return extractOcIdFromText(content.items.map((item) => item.str ?? '').join(' '));
  } catch {
    return null;
  }
}

/**
 * Descobre o ID da OC a partir do arquivo anexado: primeiro pelo nome ("ID 96471"),
 * depois pelo conteúdo do PDF ("ID Ordem de Compra: 96471"). Devolve null se não achar.
 */
export async function detectOcIdFromFile(file: File): Promise<string | null> {
  const fromName = extractOcIdFromFileName(file.name);
  if (fromName) return fromName;
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  return isPdf ? extractOcIdFromPdf(file) : null;
}
