import {
  normalizeContractOrderKey,
  normalizeGastosOperacionaisContractName
} from './gastosOperacionaisContractOrder';

export type FaturamentoByGastosContractEntry = {
  contract: string;
  faturamento: number;
  liquido: number;
  recebido: number;
};

export type NfsContractTotals = {
  faturamento: number;
  liquido: number;
  recebido: number;
};

const EMPTY_NFS_TOTALS: NfsContractTotals = {
  faturamento: 0,
  liquido: 0,
  recebido: 0
};

export function buildFaturamentoByContractLookup(
  entries: readonly FaturamentoByGastosContractEntry[]
): Map<string, NfsContractTotals> {
  const map = new Map<string, NfsContractTotals>();

  for (const entry of entries) {
    const key = normalizeContractOrderKey(
      normalizeGastosOperacionaisContractName(entry.contract)
    );
    map.set(key, {
      faturamento: entry.faturamento,
      liquido: entry.liquido,
      recebido: entry.recebido
    });
  }

  return map;
}

export function resolveContractFaturamento(
  contract: string,
  lookup: Map<string, NfsContractTotals>
): number {
  return resolveContractNfsTotals(contract, lookup).faturamento;
}

export function resolveContractLiquido(contract: string, lookup: Map<string, NfsContractTotals>): number {
  return resolveContractNfsTotals(contract, lookup).liquido;
}

export function resolveContractRecebido(contract: string, lookup: Map<string, NfsContractTotals>): number {
  return resolveContractNfsTotals(contract, lookup).recebido;
}

export function resolveContractNfsTotals(
  contract: string,
  lookup: Map<string, NfsContractTotals>
): NfsContractTotals {
  const key = normalizeContractOrderKey(normalizeGastosOperacionaisContractName(contract));
  return lookup.get(key) ?? EMPTY_NFS_TOTALS;
}
