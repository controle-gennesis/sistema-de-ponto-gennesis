export const FUEL_ABASTECIMENTO_STATE_CODES = ['DF', 'GO'] as const;
export type FuelAbastecimentoStateCode = (typeof FUEL_ABASTECIMENTO_STATE_CODES)[number];

export type FuelSatelliteCity = {
  /** Chave interna estável — não alterar após uso em produção */
  code: string;
  stateCode: FuelAbastecimentoStateCode;
  name: string;
};

/**
 * Cidades satélites para abastecimento (DF/GO).
 * Para incluir uma nova cidade, adicione um item nesta lista e faça deploy.
 */
export const FUEL_SATELLITE_CITIES: FuelSatelliteCity[] = [
  { code: 'DF_TAGUATINGA', stateCode: 'DF', name: 'Taguatinga' },
  { code: 'DF_CEILANDIA', stateCode: 'DF', name: 'Ceilândia' },
  { code: 'DF_SAMAMBAIA', stateCode: 'DF', name: 'Samambaia' },
  { code: 'DF_GUARA', stateCode: 'DF', name: 'Guará' },
  { code: 'DF_PLANALTINA', stateCode: 'DF', name: 'Planaltina' },
  { code: 'DF_SAO_SEBASTIAO', stateCode: 'DF', name: 'São Sebastião' },
  { code: 'DF_GAMA', stateCode: 'DF', name: 'Gama' },
  { code: 'DF_SANTA_MARIA', stateCode: 'DF', name: 'Santa Maria' },
  { code: 'GO_GOIANIA', stateCode: 'GO', name: 'Goiânia' },
  { code: 'GO_APARECIDA', stateCode: 'GO', name: 'Aparecida de Goiânia' },
  { code: 'GO_ANAPOLIS', stateCode: 'GO', name: 'Anápolis' },
  { code: 'GO_TRINDADE', stateCode: 'GO', name: 'Trindade' },
  { code: 'GO_LUZIANIA', stateCode: 'GO', name: 'Luziânia' },
  { code: 'GO_RIO_VERDE', stateCode: 'GO', name: 'Rio Verde' },
];

export function listFuelSatelliteCities(stateCode?: string): FuelSatelliteCity[] {
  const normalized = stateCode?.trim().toUpperCase();
  if (!normalized) return [...FUEL_SATELLITE_CITIES];
  return FUEL_SATELLITE_CITIES.filter((city) => city.stateCode === normalized);
}

export function getFuelSatelliteCityByCode(code: string): FuelSatelliteCity | undefined {
  const normalized = code.trim().toUpperCase();
  return FUEL_SATELLITE_CITIES.find((city) => city.code.toUpperCase() === normalized);
}

export function resolveFuelSatelliteCityLabel(code: string | null | undefined): string | null {
  if (!code?.trim()) return null;
  return getFuelSatelliteCityByCode(code)?.name ?? null;
}
