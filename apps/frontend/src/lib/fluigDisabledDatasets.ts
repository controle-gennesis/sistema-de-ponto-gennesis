/**
 * Datasets Fluig temporariamente desativados (não buscar / não pré-aquecer).
 * As páginas de processos continuam; só G3/G4 deixam de ser puxados.
 * Para reativar: remova o id desta lista.
 */
export const FLUIG_TEMPORARILY_DISABLED_DATASETS = new Set<string>([
  'DataSet_G3FollowUp',
  'DataSet_G4FollowUp',
]);

export function isFluigDatasetTemporarilyDisabled(datasetId: string): boolean {
  return FLUIG_TEMPORARILY_DISABLED_DATASETS.has(datasetId);
}

export function filterActiveFluigDatasets<T extends string>(datasetIds: readonly T[]): T[] {
  return datasetIds.filter((id) => !isFluigDatasetTemporarilyDisabled(id));
}
