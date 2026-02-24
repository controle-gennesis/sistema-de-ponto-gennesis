import { prisma } from '../lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

export interface CreatePurchaseOrderData {
  materialRequestId?: string;
  supplierId: string;
  expectedDelivery?: Date;
  deliveryAddress?: string;
  notes?: string;
  items: {
    materialRequestItemId?: string;
    materialId: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    notes?: string;
  }[];
}

async function generateOrderNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `OC-${year}-`;
  const last = await prisma.purchaseOrder.findFirst({
    where: { orderNumber: { startsWith: prefix } },
    orderBy: { orderNumber: 'desc' }
  });
  let n = 1;
  if (last) {
    const num = parseInt(last.orderNumber.replace(prefix, ''), 10);
    if (!isNaN(num)) n = num + 1;
  }
  return `${prefix}${n.toString().padStart(4, '0')}`;
}

export class PurchaseOrderService {
  async create(data: CreatePurchaseOrderData, userId: string) {
    if (!data.supplierId || !data.items?.length) {
      throw new Error('Fornecedor e itens são obrigatórios');
    }
    const orderNumber = await generateOrderNumber();
    const items = data.items.map((i) => {
      const qty = new Decimal(i.quantity);
      const price = new Decimal(i.unitPrice);
      const total = qty.mul(price);
      return {
        materialRequestItemId: i.materialRequestItemId || null,
        materialId: i.materialId,
        quantity: qty,
        unit: i.unit,
        unitPrice: price,
        totalPrice: total,
        notes: i.notes || null
      };
    });
    return await prisma.purchaseOrder.create({
      data: {
        orderNumber,
        materialRequestId: data.materialRequestId || null,
        supplierId: data.supplierId,
        status: 'DRAFT',
        expectedDelivery: data.expectedDelivery || null,
        deliveryAddress: data.deliveryAddress || null,
        notes: data.notes || null,
        createdBy: userId,
        items: { create: items }
      },
      include: {
        supplier: true,
        materialRequest: true,
        items: { include: { material: true } }
      }
    });
  }

  async list(filters: { status?: string; supplierId?: string; materialRequestId?: string; page?: number; limit?: number }) {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.supplierId) where.supplierId = filters.supplierId;
    if (filters.materialRequestId) where.materialRequestId = filters.materialRequestId;
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);
    const skip = (page - 1) * limit;
    const [orders, total] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        skip,
        take: limit,
        orderBy: { orderDate: 'desc' },
        include: {
          supplier: true,
          materialRequest: true,
          items: { include: { material: true } }
        }
      }),
      prisma.purchaseOrder.count({ where })
    ]);
    return { orders, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getById(id: string) {
    return await prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: true,
        materialRequest: { include: { requester: true, costCenter: true, items: { include: { material: true } } } },
        items: { include: { material: true, materialRequestItem: true } },
        creator: { select: { id: true, name: true, email: true } }
      }
    });
  }

  async updateStatus(id: string, status: string, userId?: string) {
    const data: any = { status };
    if (status === 'APPROVED' && userId) {
      data.approvedBy = userId;
      data.approvedAt = new Date();
    }
    return await prisma.purchaseOrder.update({
      where: { id },
      data,
      include: { supplier: true, items: { include: { material: true } } }
    });
  }
}
