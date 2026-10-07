/**
 * Clientes do Orçafascio (campo CLIENTE do orçamento).
 * A API de budgets só devolve `client_id` (sem nome) e não há endpoint público de clients —
 * estes IDs vêm do select de cliente no app Orçafascio (`value` = id, texto = nome).
 * O nome deve coincidir com o nome do contrato no Gênnesis para o filtro de importação.
 */
export type OrcafascioClient = { id: string; name: string };

export const ORCAFASCIO_CLIENTS: readonly OrcafascioClient[] = [
  { id: '6ac668c78705af669a89386a', name: 'CONFEA - 508 NORTE' },
  { id: '6ac66907ab97a6dfd6894425', name: 'CONFEA - 516 NORTE' },
  { id: '6ac669546471fe905c893def', name: 'MINISTÉRIO DA CULTURA - DF' },
  { id: '6ac66961ab97a6dfd68944f1', name: 'SENAC - DF' },
  { id: '6ac66991ab97a6dfd689450e', name: 'SEDES - LOTE 01' },
  { id: '6ac6699b6471fe905c893e02', name: 'SEDES - LOTE 02' },
  { id: '6ac669a78705af669a8938a6', name: 'SEDES - LOTE 6/7' },
  { id: '6ac669b9c6a3e00fa6894e1a', name: 'MAPA - UMIPI DE JEQUIÉ' },
  { id: '6ac669d38705af669a8938ab', name: 'FHE - DF' },
];

/** Normaliza rótulo para comparar contrato Gênnesis ↔ cliente Orçafascio. */
export function normalizeOrcafascioClientLabel(raw: string): string {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function resolveOrcafascioClientIdForContractName(
  contractName: string | null | undefined
): string | null {
  const target = normalizeOrcafascioClientLabel(contractName || '');
  if (!target) return null;

  const exact = ORCAFASCIO_CLIENTS.find((c) => normalizeOrcafascioClientLabel(c.name) === target);
  if (exact) return exact.id;

  // Aceita contrato que contenha o nome do cliente (ou o inverso), evitando ambiguidade curta.
  const partial = ORCAFASCIO_CLIENTS.filter((c) => {
    const n = normalizeOrcafascioClientLabel(c.name);
    if (n.length < 4 || target.length < 4) return false;
    return n.includes(target) || target.includes(n);
  });
  if (partial.length === 1) return partial[0].id;
  return null;
}

export function budgetClientId(budget: { client_id?: unknown; [key: string]: unknown }): string {
  return String(budget.client_id ?? '').trim();
}
