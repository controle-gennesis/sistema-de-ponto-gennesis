import { prisma } from './prisma';

export async function listActiveFuelAdministrativeRegions() {
  return prisma.fuelAdministrativeRegion.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, code: true, name: true },
  });
}

export async function listActiveFuelGasStationsByRegion(regionId: string) {
  return prisma.fuelGasStation.findMany({
    where: { regionId, isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, regionId: true, name: true, address: true },
  });
}

export async function getFuelAdministrativeRegionById(id: string) {
  return prisma.fuelAdministrativeRegion.findFirst({
    where: { id, isActive: true },
    select: { id: true, code: true, name: true },
  });
}

export async function getFuelGasStationInRegion(stationId: string, regionId: string) {
  return prisma.fuelGasStation.findFirst({
    where: { id: stationId, regionId, isActive: true },
    select: { id: true, regionId: true, name: true, address: true },
  });
}
