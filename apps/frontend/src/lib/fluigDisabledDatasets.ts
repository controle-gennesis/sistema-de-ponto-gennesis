/**
 * Datasets Fluig temporariamente desativados (não buscar / não pré-aquecer).
 * O código das páginas permanece; só deixa de puxar do Fluig.
 *
 * Para reativar tudo: `FLUIG_DISABLE_ALL_DATASET_FETCHES = false` e esvazie o Set abaixo.
 * Para reativar só alguns: `FLUIG_DISABLE_ALL_DATASET_FETCHES = false` e remova os ids do Set.
 */
export const FLUIG_DISABLE_ALL_DATASET_FETCHES = true;

/**
 * Exceções: download de documento (sob demanda) e datasets espelhados no Postgres
 * (página lê do banco; o job de sync no backend busca no Fluig às 3:00 e às 12:30).
 */
const FLUIG_FETCH_ALWAYS_ALLOWED = new Set<string>([
  'DS_DownloadDocumento',
  'G5-Relatorio-DF-GO-DP',
  'Processos_Workflow_Aprovacao_G3',
  'Processos_Workflow_Aprovacao_G5',
  'DataSet_G3FollowUp',
  'DataSet_G4FollowUp',
  'G5-Relatorio-DF-GO-TODOS-SETORES',
  'G5-Relatorio-DF-GO-JURIDICO',
]);

/** Ids conhecidos que costumamos puxar (referência / desativação seletiva). */
export const FLUIG_TEMPORARILY_DISABLED_DATASETS = new Set<string>([
  'DataSet_G3FollowUp',
  'DataSet_G4FollowUp',
  'G5-Relatorio-DF-GO-TODOS-SETORES',
  'G5-Relatorio-DF-GO-DP',
  'G5-Relatorio-DF-GO-JURIDICO',
  'Processos_Workflow_Aprovacao_G3',
  'Processos_Workflow_Aprovacao_G5',
]);

export function isFluigDatasetTemporarilyDisabled(datasetId: string): boolean {
  if (FLUIG_FETCH_ALWAYS_ALLOWED.has(datasetId)) return false;
  if (FLUIG_DISABLE_ALL_DATASET_FETCHES) return true;
  return FLUIG_TEMPORARILY_DISABLED_DATASETS.has(datasetId);
}

export function filterActiveFluigDatasets<T extends string>(datasetIds: readonly T[]): T[] {
  return datasetIds.filter((id) => !isFluigDatasetTemporarilyDisabled(id));
}
