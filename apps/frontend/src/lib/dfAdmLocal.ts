const DF_ADM_LOCAL_KEY = 'df adm local';

function normalizeLabelKey(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Contrato/centro de custo da sede administrativa do DF. */
export function isDfAdmLocalLabel(...parts: Array<string | null | undefined>): boolean {
  for (const part of parts) {
    if (!part) continue;
    const n = normalizeLabelKey(part);
    if (!n) continue;
    if (n === DF_ADM_LOCAL_KEY || n.includes(DF_ADM_LOCAL_KEY)) return true;
  }
  return false;
}
