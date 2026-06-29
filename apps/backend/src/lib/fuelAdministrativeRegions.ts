import { FuelVehicleType, VehicleUsageType } from '@prisma/client';
import {
  getFuelSatelliteCityByCode,
  listFuelSatelliteCities,
} from '../constants/fuelSatelliteCities';
import { prisma } from './prisma';
import { placaVariants } from './brazilianVehiclePlate';

export {
  FUEL_ABASTECIMENTO_STATE_CODES,
  listFuelSatelliteCities,
  getFuelSatelliteCityByCode,
} from '../constants/fuelSatelliteCities';

export async function listActiveFuelGasStationsByCity(cityCode: string) {
  return prisma.fuelGasStation.findMany({
    where: { cityCode: cityCode.toUpperCase(), isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { displayNumber: 'asc' }],
    select: {
      id: true,
      displayNumber: true,
      cityCode: true,
      name: true,
      address: true,
      sortOrder: true,
      isActive: true,
    },
  });
}

export async function getFuelGasStationInCity(stationId: string, cityCode: string) {
  return prisma.fuelGasStation.findFirst({
    where: { id: stationId, cityCode: cityCode.toUpperCase(), isActive: true },
    select: { id: true, displayNumber: true, cityCode: true, name: true, address: true },
  });
}

export function mapVehicleUsageToFuelType(
  frotaPartic?: VehicleUsageType | null,
): FuelVehicleType {
  return frotaPartic === VehicleUsageType.PARTICULAR
    ? FuelVehicleType.PRIVATE
    : FuelVehicleType.COMPANY;
}

export async function findActiveVehicleByPlate(plate: string) {
  const variants = placaVariants(plate);
  return prisma.vehicle.findFirst({
    where: { isActive: true, placaVeic: { in: variants } },
    select: {
      id: true,
      placaVeic: true,
      marcaVeic: true,
      modeloVeic: true,
      frotaPartic: true,
    },
  });
}

export async function reserveFuelGasStationDisplayNumbers(count: number): Promise<number[]> {
  if (count <= 0) return [];

  const result = await prisma.$queryRaw<Array<{ max: number | null }>>`
    SELECT MAX("displayNumber") AS max FROM fuel_gas_stations
  `;

  let start = Number(result[0]?.max ?? 0);
  const numbers: number[] = [];
  for (let i = 0; i < count; i++) {
    start += 1;
    numbers.push(start);
  }
  return numbers;
}

export function assertValidSatelliteCityCode(cityCode: string) {
  const city = getFuelSatelliteCityByCode(cityCode);
  if (!city) throw new Error('Cidade satélite inválida');
  return city;
}
