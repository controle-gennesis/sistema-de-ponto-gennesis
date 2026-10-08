/**
 * Clientes já conhecidos do Orçafascio.
 * Contratos com o mesmo nome recebem o código automaticamente.
 * Cliente novo: o código é colado no cadastro do contrato.
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

  const partial = ORCAFASCIO_CLIENTS.filter((c) => {
    const n = normalizeOrcafascioClientLabel(c.name);
    if (n.length < 4 || target.length < 4) return false;
    return n.includes(target) || target.includes(n);
  });
  if (partial.length === 1) return partial[0].id;

  const words = target.split(' ').filter((word) => word.length >= 3);
  if (words.length === 0) return null;
  const byWords = ORCAFASCIO_CLIENTS.filter((c) => {
    const n = normalizeOrcafascioClientLabel(c.name);
    return words.every((word) => n.split(' ').includes(word));
  });
  if (byWords.length === 1) return byWords[0].id;
  return null;
}
