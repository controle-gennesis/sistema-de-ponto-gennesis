import { getNfsTabGastosCostCenters } from './controleGeralGastosMapping';
import { NFS_TAB_LOT_BREAKDOWN, tabHasLotBreakdown } from './controleGeralLotBreakdown';
import {
  gastosContractLookupKey,
  normalizeGastosOperacionaisContractName
} from './gastosOperacionaisContractAliases';
import type {
  ControleNfsLotFaturamento,
  ControleNfsSheetTab,
  ControleNfsTabLoadError
} from '../services/ControleNfsSheetsService';
import { CONTROLE_NFS_SHEET_TABS } from '../services/ControleNfsSheetsService';

export type FaturamentoByGastosContractEntry = {
  contract: string;
  faturamento: number;
  liquido: number;
  recebido: number;
  /** null = aba/contrato sem coluna Conta Vinculada. */
  contaVinculada: number | null;
  /**
   * Se preenchido, a captura da planilha NFS falhou para este contrato.
   * A UI NÃO deve exibir R$ 0,00 — deve pedir para recarregar.
   */
  loadError?: string;
};

type NfsContractTotals = {
  faturamento: number;
  liquido: number;
  recebido: number;
  contaVinculada: number | null;
  loadError?: string;
};

type NfsTabTotal = {
  tabKey: string;
  valorBruto: number;
  valorLiquido: number;
  valorRecebido: number;
  contaVinculada: number;
  hasContaVinculadaColumn?: boolean;
};

const LOT_BREAKDOWN_CONTRACT_KEYS = new Set(
  NFS_TAB_LOT_BREAKDOWN.flatMap((config) =>
    config.lots.flatMap((lot) =>
      lot.gastosCostCenters.map((contract) => gastosContractLookupKey(contract))
    )
  )
);

function mergeContaVinculada(
  a: number | null | undefined,
  b: number | null | undefined
): number | null {
  if (a == null && b == null) return null;
  if (a == null) return b ?? null;
  if (b == null) return a;
  return Math.max(a, b);
}

function assignContractTotals(
  map: Map<string, FaturamentoByGastosContractEntry>,
  contract: string,
  totals: NfsContractTotals
): void {
  const canonical = normalizeGastosOperacionaisContractName(contract);
  const key = gastosContractLookupKey(canonical);
  map.set(key, {
    contract: canonical,
    faturamento: totals.loadError ? 0 : totals.faturamento,
    liquido: totals.loadError ? 0 : totals.liquido,
    recebido: totals.loadError ? 0 : totals.recebido,
    contaVinculada: totals.loadError ? null : totals.contaVinculada,
    ...(totals.loadError ? { loadError: totals.loadError } : {})
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

  if (totals.loadError) {
    assignContractTotals(map, contract, totals);
    return;
  }

  if (!existing) {
    assignContractTotals(map, contract, totals);
    return;
  }

  // Não sobrescrever um erro de captura com zeros “válidos”.
  if (existing.loadError) return;

  map.set(key, {
    contract: canonical,
    faturamento: Math.max(existing.faturamento, totals.faturamento),
    liquido: Math.max(existing.liquido, totals.liquido),
    recebido: Math.max(existing.recebido, totals.recebido),
    contaVinculada: mergeContaVinculada(existing.contaVinculada, totals.contaVinculada)
  });
}

function isLotBreakdownContract(contract: string): boolean {
  return LOT_BREAKDOWN_CONTRACT_KEYS.has(gastosContractLookupKey(contract));
}

function toContractTotals(input: {
  faturamento: number;
  liquido: number;
  recebido: number;
  contaVinculada: number;
  hasContaVinculadaColumn: boolean;
  loadError?: string;
}): NfsContractTotals {
  if (input.loadError) {
    return {
      faturamento: 0,
      liquido: 0,
      recebido: 0,
      contaVinculada: null,
      loadError: input.loadError
    };
  }
  const hasColumn = input.hasContaVinculadaColumn || input.contaVinculada > 0;
  return {
    faturamento: input.faturamento,
    liquido: input.liquido,
    recebido: input.recebido,
    contaVinculada: hasColumn ? input.contaVinculada : null
  };
}

function contractsForTab(tab: ControleNfsSheetTab): string[] {
  if (tabHasLotBreakdown(tab.key)) {
    const config = NFS_TAB_LOT_BREAKDOWN.find((item) => item.tabKey === tab.key);
    return config?.lots.flatMap((lot) => [...lot.gastosCostCenters]) ?? [];
  }
  return [...getNfsTabGastosCostCenters(tab)];
}

/**
 * Soma valor bruto, líquido, recebido e conta vinculada das NF's por contrato
 * da QUERY BASE DE GASTOS.
 * Contratos com lote/serviço usam a coluna correspondente na planilha de NF's.
 * Abas descobertas automaticamente usam o nome da aba como centro de custo.
 */
export function buildFaturamentoByGastosContract(
  nfsByTab: readonly NfsTabTotal[],
  nfsLotFaturamento: readonly ControleNfsLotFaturamento[],
  tabs: readonly ControleNfsSheetTab[] = CONTROLE_NFS_SHEET_TABS,
  loadErrors: readonly ControleNfsTabLoadError[] = []
): FaturamentoByGastosContractEntry[] {
  const map = new Map<string, FaturamentoByGastosContractEntry>();
  const loadErrorByTabKey = new Map(
    loadErrors.map((error) => [error.tabKey, error] as const)
  );

  const totalsByLot = new Map(
    nfsLotFaturamento.map((lot) => [
      `${lot.tabKey}:${lot.lotKey}`,
      toContractTotals({
        faturamento: lot.valorBruto,
        liquido: lot.valorLiquido,
        recebido: lot.valorRecebido,
        contaVinculada: lot.contaVinculada,
        hasContaVinculadaColumn: lot.hasContaVinculadaColumn,
        loadError: lot.loadError
      })
    ])
  );
  const nfsByTabKey = new Map(
    nfsByTab.map((tab) => [
      tab.tabKey,
      toContractTotals({
        faturamento: tab.valorBruto,
        liquido: tab.valorLiquido,
        recebido: tab.valorRecebido,
        contaVinculada: tab.contaVinculada,
        hasContaVinculadaColumn: tab.hasContaVinculadaColumn === true,
        loadError: loadErrorByTabKey.get(tab.tabKey)
          ? `Erro ao capturar a aba "${loadErrorByTabKey.get(tab.tabKey)!.sheetName}". Recarregue.`
          : undefined
      })
    ])
  );

  for (const config of NFS_TAB_LOT_BREAKDOWN) {
    const tabLoadError = loadErrorByTabKey.get(config.tabKey);
    for (const lot of config.lots) {
      const fromLot = totalsByLot.get(`${config.tabKey}:${lot.lotKey}`);
      const totals =
        fromLot ??
        (tabLoadError
          ? toContractTotals({
              faturamento: 0,
              liquido: 0,
              recebido: 0,
              contaVinculada: 0,
              hasContaVinculadaColumn: false,
              loadError: `Erro ao capturar a aba "${tabLoadError.sheetName}". Recarregue.`
            })
          : {
              faturamento: 0,
              liquido: 0,
              recebido: 0,
              contaVinculada: null
            });
      for (const contract of lot.gastosCostCenters) {
        assignContractTotals(map, contract, totals);
      }
    }
  }

  for (const tab of tabs) {
    if (tabHasLotBreakdown(tab.key)) continue;

    const tabLoadError = loadErrorByTabKey.get(tab.key);
    const totals =
      nfsByTabKey.get(tab.key) ??
      (tabLoadError
        ? toContractTotals({
            faturamento: 0,
            liquido: 0,
            recebido: 0,
            contaVinculada: 0,
            hasContaVinculadaColumn: false,
            loadError: `Erro ao capturar a aba "${tabLoadError.sheetName}". Recarregue.`
          })
        : {
            faturamento: 0,
            liquido: 0,
            recebido: 0,
            contaVinculada: null
          });

    // Garante erro mesmo se a aba não veio em nfsByTab (falha total de carga).
    if (tabLoadError && !totals.loadError) {
      for (const contract of contractsForTab(tab)) {
        assignContractTotals(
          map,
          contract,
          toContractTotals({
            faturamento: 0,
            liquido: 0,
            recebido: 0,
            contaVinculada: 0,
            hasContaVinculadaColumn: false,
            loadError: `Erro ao capturar a aba "${tabLoadError.sheetName}". Recarregue.`
          })
        );
      }
      continue;
    }

    const centers = getNfsTabGastosCostCenters(tab);
    for (const contract of centers) {
      if (isLotBreakdownContract(contract)) continue;
      if (map.has(gastosContractLookupKey(contract)) && !totals.loadError) continue;
      mergeContractTotals(map, contract, totals);
    }
  }

  return Array.from(map.values()).sort((a, b) => {
    if (Boolean(a.loadError) !== Boolean(b.loadError)) {
      return a.loadError ? -1 : 1;
    }
    return b.faturamento - a.faturamento;
  });
}
