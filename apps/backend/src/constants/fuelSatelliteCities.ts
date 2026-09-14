import {
  BRAZIL_STATE_CODES,
  isBrazilStateCode,
  type BrazilStateCode,
} from './brazilStates';
import ibgeMunicipalities from './ibgeMunicipalities.json';

export { BRAZIL_STATE_CODES, isBrazilStateCode };
export type FuelAbastecimentoStateCode = BrazilStateCode;
/** @deprecated use BRAZIL_STATE_CODES — mantido para callers existentes. */
export const FUEL_ABASTECIMENTO_STATE_CODES = BRAZIL_STATE_CODES;

export type FuelSatelliteCity = {
  /** Chave interna estável — não alterar após uso em produção */
  code: string;
  stateCode: FuelAbastecimentoStateCode;
  name: string;
};

const IBGE_MUNICIPIOS_TTL_MS = 24 * 60 * 60 * 1000;
const ibgeCache = new Map<string, { expiresAt: number; cities: FuelSatelliteCity[] }>();
const bundledMunicipalities = ibgeMunicipalities as Record<string, string[]>;

function slugifyCityName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
}

export function fuelCityCode(stateCode: string, name: string): string {
  return `${stateCode.trim().toUpperCase()}_${slugifyCityName(name)}`;
}

function titleFromSlug(slug: string): string {
  return slug
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}

function parseStateFromCityCode(code: string): FuelAbastecimentoStateCode | null {
  const match = code.trim().toUpperCase().match(/^([A-Z]{2})_(.+)$/);
  if (!match || !isBrazilStateCode(match[1]) || !match[2]) return null;
  return match[1];
}

/**
 * Regiões administrativas do DF (33 RAs) + cidades de GO usadas em cadastros antigos.
 * O DF continua nesta lista porque o IBGE só tem Brasília como município.
 * Demais UFs vêm da API de municípios do IBGE.
 */
export const FUEL_SATELLITE_CITIES: FuelSatelliteCity[] = [
  { code: 'DF_AGUAS_CLARAS', stateCode: 'DF', name: 'Águas Claras' },
  { code: 'DF_ARNIQUEIRA', stateCode: 'DF', name: 'Arniqueira' },
  { code: 'DF_BRAZLANDIA', stateCode: 'DF', name: 'Brazlândia' },
  { code: 'DF_CANDANGOLANDIA', stateCode: 'DF', name: 'Candangolândia' },
  { code: 'DF_CEILANDIA', stateCode: 'DF', name: 'Ceilândia' },
  { code: 'DF_CRUZEIRO', stateCode: 'DF', name: 'Cruzeiro' },
  { code: 'DF_FERCAL', stateCode: 'DF', name: 'Fercal' },
  { code: 'DF_GAMA', stateCode: 'DF', name: 'Gama' },
  { code: 'DF_GUARA', stateCode: 'DF', name: 'Guará' },
  { code: 'DF_ITAPOA', stateCode: 'DF', name: 'Itapoã' },
  { code: 'DF_JARDIM_BOTANICO', stateCode: 'DF', name: 'Jardim Botânico' },
  { code: 'DF_LAGO_NORTE', stateCode: 'DF', name: 'Lago Norte' },
  { code: 'DF_LAGO_SUL', stateCode: 'DF', name: 'Lago Sul' },
  { code: 'DF_NUCLEO_BANDEIRANTE', stateCode: 'DF', name: 'Núcleo Bandeirante' },
  { code: 'DF_PARANOA', stateCode: 'DF', name: 'Paranoá' },
  { code: 'DF_PARK_WAY', stateCode: 'DF', name: 'Park Way' },
  { code: 'DF_PLANALTINA', stateCode: 'DF', name: 'Planaltina' },
  { code: 'DF_PLANO_PILOTO', stateCode: 'DF', name: 'Plano Piloto' },
  { code: 'DF_RECANTO_DAS_EMAS', stateCode: 'DF', name: 'Recanto das Emas' },
  { code: 'DF_RIACHO_FUNDO', stateCode: 'DF', name: 'Riacho Fundo' },
  { code: 'DF_RIACHO_FUNDO_II', stateCode: 'DF', name: 'Riacho Fundo II' },
  { code: 'DF_SAMAMBAIA', stateCode: 'DF', name: 'Samambaia' },
  { code: 'DF_SANTA_MARIA', stateCode: 'DF', name: 'Santa Maria' },
  { code: 'DF_SAO_SEBASTIAO', stateCode: 'DF', name: 'São Sebastião' },
  { code: 'DF_SCIA', stateCode: 'DF', name: 'SCIA' },
  { code: 'DF_SIA', stateCode: 'DF', name: 'SIA' },
  { code: 'DF_SOBRADINHO', stateCode: 'DF', name: 'Sobradinho' },
  { code: 'DF_SOBRADINHO_II', stateCode: 'DF', name: 'Sobradinho II' },
  { code: 'DF_SOL_NASCENTE_POR_DO_SOL', stateCode: 'DF', name: 'Sol Nascente/Pôr do Sol' },
  { code: 'DF_SUDOESTE_OCTOGONAL', stateCode: 'DF', name: 'Sudoeste/Octogonal' },
  { code: 'DF_TAGUATINGA', stateCode: 'DF', name: 'Taguatinga' },
  { code: 'DF_VARJAO', stateCode: 'DF', name: 'Varjão' },
  { code: 'DF_VICENTE_PIRES', stateCode: 'DF', name: 'Vicente Pires' },

  { code: 'GO_GOIANIA', stateCode: 'GO', name: 'Goiânia' },
  { code: 'GO_APARECIDA', stateCode: 'GO', name: 'Aparecida de Goiânia' },
  { code: 'GO_ANAPOLIS', stateCode: 'GO', name: 'Anápolis' },
  { code: 'GO_TRINDADE', stateCode: 'GO', name: 'Trindade' },
  { code: 'GO_LUZIANIA', stateCode: 'GO', name: 'Luziânia' },
  { code: 'GO_RIO_VERDE', stateCode: 'GO', name: 'Rio Verde' },
];

/**
 * Códigos antigos mantidos só para leitura de solicitações/postos já salvos.
 * Não aparecem mais no select de cidade.
 */
const FUEL_SATELLITE_CITY_LEGACY: FuelSatelliteCity[] = [
  { code: 'DF_ARNIQUEIRAS', stateCode: 'DF', name: 'Arniqueira' },
  { code: 'DF_ASA_NORTE', stateCode: 'DF', name: 'Asa Norte' },
  { code: 'DF_SAMAMBAIA_NORTE', stateCode: 'DF', name: 'Samambaia Norte' },
  { code: 'DF_SETOR_CENTRAL_GAMA', stateCode: 'DF', name: 'Setor Central (Gama)' },
  { code: 'DF_ZONA_INDUSTRIAL_GUARA', stateCode: 'DF', name: 'Zona Industrial (Guará)' },
];

function allFuelSatelliteCitiesForLookup(): FuelSatelliteCity[] {
  return [...FUEL_SATELLITE_CITIES, ...FUEL_SATELLITE_CITY_LEGACY];
}

function citiesFromNames(stateCode: FuelAbastecimentoStateCode, names: string[]): FuelSatelliteCity[] {
  return names
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => ({
      code: fuelCityCode(stateCode, name),
      stateCode,
      name,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

function citiesFromBundledJson(stateCode: FuelAbastecimentoStateCode): FuelSatelliteCity[] | null {
  const names = bundledMunicipalities[stateCode];
  if (!names?.length) return null;
  return citiesFromNames(stateCode, names);
}

async function fetchIbgeMunicipalities(stateCode: FuelAbastecimentoStateCode): Promise<FuelSatelliteCity[]> {
  const cached = ibgeCache.get(stateCode);
  if (cached && cached.expiresAt > Date.now()) return cached.cities;

  const bundled = citiesFromBundledJson(stateCode);
  if (bundled?.length) {
    ibgeCache.set(stateCode, { expiresAt: Date.now() + IBGE_MUNICIPIOS_TTL_MS, cities: bundled });
    return bundled;
  }

  const response = await fetch(
    `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${stateCode}/municipios`,
    { signal: AbortSignal.timeout(15_000) },
  );
  if (!response.ok) {
    throw new Error(`IBGE municípios ${stateCode}: HTTP ${response.status}`);
  }

  const rows = (await response.json()) as Array<{ nome?: string }>;
  const cities = citiesFromNames(
    stateCode,
    rows.map((row) => String(row.nome ?? '')),
  );

  ibgeCache.set(stateCode, { expiresAt: Date.now() + IBGE_MUNICIPIOS_TTL_MS, cities });
  return cities;
}

export async function listFuelSatelliteCities(stateCode?: string): Promise<FuelSatelliteCity[]> {
  const normalized = stateCode?.trim().toUpperCase();
  if (!normalized) return [...FUEL_SATELLITE_CITIES];
  if (!isBrazilStateCode(normalized)) return [];
  if (normalized === 'DF') {
    return FUEL_SATELLITE_CITIES.filter((city) => city.stateCode === 'DF');
  }

  try {
    return await fetchIbgeMunicipalities(normalized);
  } catch {
    return FUEL_SATELLITE_CITIES.filter((city) => city.stateCode === normalized);
  }
}

export function getFuelSatelliteCityByCode(code: string): FuelSatelliteCity | undefined {
  const normalized = code.trim().toUpperCase();
  const hardcoded = allFuelSatelliteCitiesForLookup().find(
    (city) => city.code.toUpperCase() === normalized,
  );
  if (hardcoded) return hardcoded;

  for (const entry of ibgeCache.values()) {
    const found = entry.cities.find((city) => city.code === normalized);
    if (found) return found;
  }

  const stateCode = parseStateFromCityCode(normalized);
  if (!stateCode) return undefined;

  const fromBundle = citiesFromBundledJson(stateCode)?.find((city) => city.code === normalized);
  if (fromBundle) return fromBundle;

  return {
    code: normalized,
    stateCode,
    name: titleFromSlug(normalized.slice(3)),
  };
}

export function resolveFuelSatelliteCityLabel(code: string | null | undefined): string | null {
  if (!code?.trim()) return null;
  return getFuelSatelliteCityByCode(code)?.name ?? null;
}

export async function assertValidFuelCityCode(cityCode: string): Promise<FuelSatelliteCity> {
  const normalized = cityCode.trim().toUpperCase();
  const hardcoded = allFuelSatelliteCitiesForLookup().find(
    (city) => city.code.toUpperCase() === normalized,
  );
  if (hardcoded) return hardcoded;

  const stateCode = parseStateFromCityCode(normalized);
  if (!stateCode) throw new Error('Cidade inválida');

  const cities = await listFuelSatelliteCities(stateCode);
  const found = cities.find((city) => city.code === normalized);
  if (!found) throw new Error('Cidade inválida');
  return found;
}
