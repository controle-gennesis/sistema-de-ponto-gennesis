import { NFS_TAB_GASTOS_COST_CENTERS } from './controleGeralGastosMapping';
import { NFS_TAB_LOT_BREAKDOWN, tabHasLotBreakdown } from './controleGeralLotBreakdown';
import {
  gastosContractLookupKey,
  normalizeGastosOperacionaisContractName
} from './gastosOperacionaisContractAliases';
import type { ControleNfsLotFaturamento } from '../services/ControleNfsSheetsService';
import { CONTROLE_NFS_SHEET_TABS } from '../services/ControleNfsSheetsService';

export type FaturamentoByGastosContractEntry = {
  contract: string;
  faturamento: number;
  liquido: number;
  recebido: number;
};

type NfsContractTotals = {
  faturamento: number;
  liquido: number;
  recebido: number;
};

type NfsTabTotal = {
  tabKey: string;
  valorBruto: number;
  valorLiquido: number;
  valorRecebido: number;
};

const LOT_BREAKDOWN_CONTRACT_KEYS = new Set(
  NFS_TAB_LOT_BREAKDOWN.flatMap((config) =>
    config.lots.flatMap((lot) =>
      lot.gastosCostCenters.map((contract) => gastosContractLookupKey(contract))
    )
  )
);

function assignContractTotals(
  map: Map<string, FaturamentoByGastosContractEntry>,
  contract: string,
  totals: NfsContractTotals
): void {
  const canonical = normalizeGastosOperacionaisContractName(contract);
  const key = gastosContractLookupKey(canonical);
  map.set(key, {
    contract: canonical,
    faturamento: totals.faturamento,
    liquido: totals.liquido,
    recebido: totals.recebido
  });
}

function mergeContractTotals(
  map: Map<string, FaturamentoByGastosContractEntry>,
  contract: string,
  totals: NfsContractTotals
): void {
  const canonical = normalizeGastosOperacionaisContractName(contract);
  const key = gastosContractLookupKey(canonical);
  const existing = map.get(key);

  if (!existing) {
    assignContractTotals(map, contract, totals);
    return;
  }

  map.set(key, {
    contract: canonical,
    faturamento: Math.max(existing.faturamento, totals.faturamento),
    liquido: Math.max(existing.liquido, totals.liquido),
    recebido: Math.max(existing.recebido, totals.recebido)
  });
}

function isLotBreakdownContract(contract: string): boolean {
  return LOT_BREAKDOWN_CONTRACT_KEYS.has(gastosContractLookupKey(contract));
}

/**
 * Soma valor bruto, líquido e recebido das NF's por contrato da QUERY BASE DE GASTOS.
 * Contratos com lote/serviço usam a coluna correspondente na planilha de NF's.
 */
export function buildFaturamentoByGastosContract(
  nfsByTab: readonly NfsTabTotal[],
  nfsLotFaturamento: readonly ControleNfsLotFaturamento[]
): FaturamentoByGastosContractEntry[] {
  const map = new Map<string, FaturamentoByGastosContractEntry>();
  const totalsByLot = new Map(
    nfsLotFaturamento.map((lot) => [
      `${lot.tabKey}:${lot.lotKey}`,
      {
        faturamento: lot.valorBruto,
        liquido: lot.valorLiquido,
        recebido: lot.valorRecebido
      }
    ])
  );
  const nfsByTabKey = new Map(
    nfsByTab.map((tab) => [
      tab.tabKey,
      {
        faturamento: tab.valorBruto,
        liquido: tab.valorLiquido,
        recebido: tab.valorRecebido
      }
    ])
  );

  for (const config of NFS_TAB_LOT_BREAKDOWN) {
    for (const lot of config.lots) {
      const totals = totalsByLot.get(`${config.tabKey}:${lot.lotKey}`) ?? {
        faturamento: 0,
        liquido: 0,
        recebido: 0
      };
      for (const contract of lot.gastosCostCenters) {
        assignContractTotals(map, contract, totals);
      }
    }
  }

  for (const tab of CONTROLE_NFS_SHEET_TABS) {
    if (tabHasLotBreakdown(tab.key)) continue;

    const totals = nfsByTabKey.get(tab.key) ?? {
      faturamento: 0,
      liquido: 0,
      recebido: 0
    };
    const centers = NFS_TAB_GASTOS_COST_CENTERS[tab.key] ?? [];

    for (const contract of centers) {
      if (isLotBreakdownContract(contract)) continue;
      if (map.has(gastosContractLookupKey(contract))) continue;
      mergeContractTotals(map, contract, totals);
    }
  }

  return Array.from(map.values()).sort((a, b) => b.faturamento - a.faturamento);
}
