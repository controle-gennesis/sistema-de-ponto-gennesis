export type StockPaymentSlipParsed = {
  name: string;
  url: string;
  amount: number | null;
  dueDateYmd: string | null;
  dueDateLabel: string;
};

export function extractOcNumberFromMovementNotes(notes: string | null | undefined): string | null {
  if (!notes) return null;
  const m = notes.match(/Nº OC:\s*([^\n|]+)/i);
  return m?.[1]?.trim() || null;
}

export function parseMovementReceiptTypeFromNotes(
  notes: string | null | undefined
): 'TOTAL' | 'PARCIAL' | null {
  if (!notes) return null;
  const raw = notes.match(/Tipo:\s*(TOTAL|PARCIAL)/i)?.[1]?.toUpperCase() ?? '';
  if (raw === 'TOTAL' || raw === 'PARCIAL') return raw;
  return null;
}

export function movementNotesMatchOc(notes: string | null | undefined, orderNumber: string): boolean {
  if (!notes || !orderNumber) return false;
  const needle = `Nº OC: ${orderNumber}`;
  return notes.includes(needle) || notes.toLowerCase().includes(`nº oc: ${orderNumber.toLowerCase()}`);
}

export function parseBrDueDateToYmd(value: string | null | undefined): string | null {
  const s = (value || '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseBrlAmountLabel(value: string | null | undefined): number | null {
  const raw = (value || '').trim();
  if (!raw) return null;
  const normalized = raw.replace(/R\$\s*/gi, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function parsePaymentSlipsFromMovementNotes(
  notes: string | null | undefined
): StockPaymentSlipParsed[] {
  if (!notes) return [];
  const boletoSection = notes.match(/Boletos:\s*([\s\S]*)/i)?.[1] || '';
  if (!boletoSection.trim()) return [];

  const out: StockPaymentSlipParsed[] = [];
  for (const line of boletoSection.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const normalized = trimmed.replace(/^\d+\)\s*/, '');
    const full = normalized.match(
      /^(.*?)\s*\|\s*Valor:\s*(.*?)\s*\|\s*Vencimento:\s*(.*?)\s*\|\s*URL:\s*([^\s|]+)\s*$/i
    );
    if (!full?.[4]) continue;
    const dueDateLabel = (full[3] || '').trim();
    out.push({
      name: (full[1] || '').trim() || 'Boleto',
      url: full[4].trim(),
      amount: parseBrlAmountLabel(full[2]),
      dueDateYmd: parseBrDueDateToYmd(dueDateLabel),
      dueDateLabel
    });
  }
  return out;
}

export function collectPaymentSlipsForOrderFromMovements(
  movements: Array<{ notes: string | null }>,
  orderNumber: string
): StockPaymentSlipParsed[] {
  const out: StockPaymentSlipParsed[] = [];
  const seen = new Set<string>();
  for (const mov of movements) {
    if (!movementNotesMatchOc(mov.notes, orderNumber)) continue;
    for (const slip of parsePaymentSlipsFromMovementNotes(mov.notes)) {
      if (!slip.url) continue;
      const key = `${slip.url}\0${slip.dueDateYmd ?? ''}\0${slip.dueDateLabel}\0${slip.name}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(slip);
    }
  }
  return out.sort((a, b) => {
    const ta = a.dueDateYmd ? new Date(a.dueDateYmd).getTime() : 0;
    const tb = b.dueDateYmd ? new Date(b.dueDateYmd).getTime() : 0;
    if (ta !== tb) return ta - tb;
    return a.name.localeCompare(b.name, 'pt-BR');
  });
}
