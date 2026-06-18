import { prisma } from '../lib/prisma';
import { buildServiceOrderDisplayLabel } from '../utils/serviceOrderLabel';

export type ServiceOrderListItem = {
  id: string;
  numero: number;
  ano: number;
  status: string;
  label: string;
  divSe: string | null;
  folderNumber: string | null;
  contractName: string | null;
  contractNumber: string | null;
};

function serviceOrderDedupeKey(item: ServiceOrderListItem): string {
  const divSe = (item.divSe || '').trim().toLowerCase();
  const folder = (item.folderNumber || '').trim().toLowerCase();
  const contract = (item.contractNumber || '').trim().toLowerCase();
  if (divSe) return `divSe:${divSe}\0${folder}\0${contract}`;
  const label = (item.label || '').trim().toLowerCase();
  if (label) return `label:${label}\0${contract}`;
  return `num:${item.numero}\0${item.ano}\0${contract}`;
}

/** Mesma OS/SE pode ter vários registros (competências); na lista exibimos uma vez. */
function dedupeServiceOrderListItems(items: ServiceOrderListItem[]): ServiceOrderListItem[] {
  const byId = new Map<string, ServiceOrderListItem>();
  for (const item of items) {
    if (!byId.has(item.id)) byId.set(item.id, item);
  }

  const byKey = new Map<string, ServiceOrderListItem>();
  for (const item of byId.values()) {
    const key = serviceOrderDedupeKey(item);
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, item);
      continue;
    }
    if (item.ano > prev.ano || (item.ano === prev.ano && item.numero > prev.numero)) {
      byKey.set(key, item);
    }
  }

  return Array.from(byKey.values()).sort((a, b) => {
    if (a.ano !== b.ano) return b.ano - a.ano;
    return b.numero - a.numero;
  });
}

export class ServiceOrderService {
  /**
   * Ordens de serviço do módulo de contratos (engenharia), filtradas por centro de custo.
   * Inclui apenas OS com ao menos um pleito vinculado a um contrato.
   */
  async listByCostCenter(costCenterId: string): Promise<ServiceOrderListItem[]> {
    const costCenter = await prisma.costCenter.findUnique({
      where: { id: costCenterId },
      select: { id: true, isActive: true }
    });
    if (!costCenter || !costCenter.isActive) {
      throw new Error('Centro de custo não encontrado ou inativo');
    }

    const rows = await prisma.service_orders.findMany({
      where: {
        costCenterId,
        pleitos: {
          some: {
            updatedContractId: { not: null }
          }
        }
      },
      orderBy: [{ ano: 'desc' }, { numero: 'desc' }],
      include: {
        pleitos: {
          where: { updatedContractId: { not: null } },
          orderBy: { createdAt: 'asc' },
          select: {
            divSe: true,
            folderNumber: true,
            reportsBilling: true,
            updatedContract: {
              select: { name: true, number: true }
            }
          }
        }
      }
    });

    const mapped = rows.map((so) => {
      const pleitos = so.pleitos;
      const label = buildServiceOrderDisplayLabel(so.numero, so.ano, pleitos);
      const src = pleitos.find((p) => (p.divSe || '').trim()) ?? pleitos[0];
      const contract = src?.updatedContract;
      return {
        id: so.id,
        numero: so.numero,
        ano: so.ano,
        status: so.status,
        label,
        divSe: src?.divSe?.trim() || null,
        folderNumber: src?.folderNumber?.trim() || null,
        contractName: contract?.name ?? null,
        contractNumber: contract?.number ?? null
      };
    });

    return dedupeServiceOrderListItems(mapped);
  }

  /** Ordens de serviço vinculadas a pleitos do contrato selecionado. */
  async listByContract(contractId: string): Promise<ServiceOrderListItem[]> {
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      select: { id: true },
    });
    if (!contract) {
      throw new Error('Contrato não encontrado');
    }

    const rows = await prisma.service_orders.findMany({
      where: {
        pleitos: {
          some: {
            updatedContractId: contractId,
          },
        },
      },
      orderBy: [{ ano: 'desc' }, { numero: 'desc' }],
      include: {
        pleitos: {
          where: { updatedContractId: contractId },
          orderBy: { createdAt: 'asc' },
          select: {
            divSe: true,
            folderNumber: true,
            reportsBilling: true,
            updatedContract: {
              select: { name: true, number: true },
            },
          },
        },
      },
    });

    const mapped = rows.map((so) => {
      const pleitos = so.pleitos;
      const label = buildServiceOrderDisplayLabel(so.numero, so.ano, pleitos);
      const src = pleitos.find((p) => (p.divSe || '').trim()) ?? pleitos[0];
      const contractRow = src?.updatedContract;
      return {
        id: so.id,
        numero: so.numero,
        ano: so.ano,
        status: so.status,
        label,
        divSe: src?.divSe?.trim() || null,
        folderNumber: src?.folderNumber?.trim() || null,
        contractName: contractRow?.name ?? null,
        contractNumber: contractRow?.number ?? null,
      };
    });

    return dedupeServiceOrderListItems(mapped);
  }
}
