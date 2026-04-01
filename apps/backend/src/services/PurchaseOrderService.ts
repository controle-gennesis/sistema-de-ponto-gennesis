import { prisma } from '../lib/prisma';
import { Decimal } from '@prisma/client/runtime/library';

export interface CreatePurchaseOrderData {
  materialRequestId?: string;
  quoteMapId?: string;
  supplierId: string;
  expectedDelivery?: Date;
  deliveryAddress?: string;
  paymentType?: string;
  paymentCondition?: string;
  paymentDetails?: string;
  boletoAttachmentUrl?: string;
  boletoAttachmentName?: string;
  amountToPay?: number;
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

export interface UpdatePurchaseOrderDetailsData {
  supplierId?: string;
  expectedDelivery?: Date | string | null;
  deliveryAddress?: string | null;
  paymentType?: string | null;
  paymentCondition?: string | null;
  paymentDetails?: string | null;
  amountToPay?: number | string | null;
  notes?: string | null;
  items?: {
    materialRequestItemId?: string | null;
    materialId: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    notes?: string | null;
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

/** Listagem: menos joins aninhados para listas grandes (detalhe via getById). */
const purchaseOrderIncludeList = {
  supplier: true,
  quoteMap: { select: { id: true, createdAt: true } },
  materialRequest: {
    select: {
      id: true,
      requestNumber: true,
      serviceOrder: true,
      description: true
    }
  },
  creator: { select: { id: true, name: true, email: true } },
  items: { include: { material: true, materialRequestItem: true } }
} as const;

const purchaseOrderIncludeDetail = {
  supplier: true,
  quoteMap: {
    include: {
      suppliers: { include: { supplier: true } },
      winners: { include: { winnerSupplier: true, materialRequestItem: { include: { material: true } } } }
    }
  },
  materialRequest: {
    include: {
      requester: true,
      costCenter: true,
      items: { include: { material: true } },
      quoteMaps: { orderBy: { createdAt: 'desc' as const }, take: 1 }
    }
  },
  creator: { select: { id: true, name: true, email: true } },
  items: { include: { material: true, materialRequestItem: true } }
} as const;

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
    const amountToPay =
      data.amountToPay !== undefined && data.amountToPay !== null && !Number.isNaN(Number(data.amountToPay))
        ? new Decimal(data.amountToPay)
        : null;

    const createDataBase = {
      orderNumber,
      materialRequestId: data.materialRequestId || null,
      quoteMapId: data.quoteMapId || null,
      supplierId: data.supplierId,
      expectedDelivery: data.expectedDelivery || null,
      deliveryAddress: data.deliveryAddress || null,
      paymentType: data.paymentType || null,
      paymentCondition: data.paymentCondition || null,
      paymentDetails: data.paymentDetails || null,
      boletoAttachmentUrl: data.boletoAttachmentUrl || null,
      boletoAttachmentName: data.boletoAttachmentName || null,
      amountToPay,
      notes: data.notes || null,
      createdBy: userId,
      items: { create: items }
    } as const;

    try {
      return await prisma.purchaseOrder.create({
        data: { ...createDataBase, status: 'PENDING_COMPRAS' as any },
        include: purchaseOrderIncludeDetail
      });
    } catch (error: any) {
      const msg = typeof error?.message === 'string' ? error.message : '';
      const isPrismaValidation = error?.name === 'PrismaClientValidationError' && msg;
      // Compatibilidade temporária: Prisma Client antigo sem enum / campo.
      if (isPrismaValidation && msg.includes('PENDING_COMPRAS')) {
        return await prisma.purchaseOrder.create({
          data: { ...createDataBase, status: 'PENDING' as any },
          include: purchaseOrderIncludeDetail
        });
      }
      if (isPrismaValidation && msg.includes('quoteMapId') && createDataBase.quoteMapId) {
        const { quoteMapId: _omit, ...withoutQuote } = createDataBase as typeof createDataBase & { quoteMapId?: string | null };
        return await prisma.purchaseOrder.create({
          data: { ...withoutQuote, status: 'PENDING_COMPRAS' as any },
          include: purchaseOrderIncludeDetail
        });
      }
      throw error;
    }
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
        include: purchaseOrderIncludeList
      }),
      prisma.purchaseOrder.count({ where })
    ]);
    return { orders, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
  }

  async getById(id: string) {
    return await prisma.purchaseOrder.findUnique({
      where: { id },
      include: purchaseOrderIncludeDetail
    });
  }

  async updateStatus(
    id: string,
    status: string,
    userId?: string,
    options?: { rejectionReason?: string }
  ) {
    const order = await prisma.purchaseOrder.findUnique({ where: { id } });
    if (!order) {
      throw new Error('Ordem de compra não encontrada');
    }

    const st = order.status;

    // Fase 1 (compras): PENDING_COMPRAS | DRAFT → PENDING
    if (status === 'PENDING') {
      if (st !== 'PENDING_COMPRAS' && st !== 'DRAFT') {
        throw new Error('Apenas OC em rascunho ou na fase de compras pode seguir para aprovação do gestor');
      }
    }

    // Fase 2 (gestor): PENDING → PENDING_DIRETORIA
    if (status === 'PENDING_DIRETORIA') {
      if (st !== 'PENDING') {
        throw new Error('Apenas OC na fase do gestor pode seguir para aprovação da diretoria');
      }
    }

    // 2ª fase (diretoria): PENDING_DIRETORIA → APPROVED
    if (status === 'APPROVED') {
      if (st !== 'PENDING_DIRETORIA') {
        throw new Error('A OC só pode ser aprovada após aprovação do gestor (fase diretoria)');
      }
    }

    if (status === 'IN_REVIEW') {
      if (st !== 'PENDING_COMPRAS' && st !== 'PENDING' && st !== 'DRAFT' && st !== 'PENDING_DIRETORIA') {
        throw new Error('Apenas OC nas fases de aprovação ou rascunho pode ir para correção');
      }
    }

    if (status === 'REJECTED') {
      if (st !== 'PENDING_COMPRAS' && st !== 'PENDING' && st !== 'DRAFT' && st !== 'PENDING_DIRETORIA') {
        throw new Error('Apenas OC pendente de aprovação pode ser reprovada');
      }
    }

    if (status === 'PENDING_COMPRAS' && st === 'IN_REVIEW') {
      if (!userId || order.createdBy !== userId) {
        throw new Error('Apenas quem criou a OC pode reenviá-la após correção');
      }
    }

    const data: any = {
      status,
      updatedAt: new Date()
    };

    if (status === 'APPROVED' && userId) {
      data.approvedBy = userId;
      data.approvedAt = new Date();
    }

    if (
      status === 'IN_REVIEW' ||
      status === 'REJECTED' ||
      status === 'PENDING' ||
      status === 'PENDING_DIRETORIA' ||
      (status === 'PENDING_COMPRAS' && st === 'IN_REVIEW')
    ) {
      data.approvedBy = null;
      data.approvedAt = null;
    }

    if (status === 'REJECTED' && options?.rejectionReason) {
      const note = `[Reprovação ${new Date().toLocaleString('pt-BR')}] ${options.rejectionReason}`;
      data.notes = order.notes ? `${order.notes}\n\n${note}` : note;
    }

    return await prisma.purchaseOrder.update({
      where: { id },
      data,
      include: purchaseOrderIncludeDetail
    });
  }

  async updateDetails(id: string, data: UpdatePurchaseOrderDetailsData, userId?: string) {
    const order = await prisma.purchaseOrder.findUnique({
      where: { id },
      select: { id: true, status: true, createdBy: true }
    });

    if (!order) {
      throw new Error('Ordem de compra não encontrada');
    }

    if (!userId || order.createdBy !== userId) {
      throw new Error('Apenas o criador da OC pode editar a OC em correção');
    }

    if (order.status !== 'IN_REVIEW') {
      throw new Error('A OC só pode ser editada durante a CORREÇÃO OC');
    }

    const expectedDelivery =
      data.expectedDelivery !== undefined && data.expectedDelivery !== null && data.expectedDelivery !== ''
        ? new Date(data.expectedDelivery)
        : null;

    const amountToPay =
      data.amountToPay !== undefined && data.amountToPay !== null && data.amountToPay !== ''
        ? new Decimal(Number(data.amountToPay))
        : null;

    const supplierId = data.supplierId;
    const items = data.items;

    await prisma.$transaction(async (tx) => {
      await tx.purchaseOrder.update({
        where: { id },
        data: {
          supplierId: supplierId !== undefined ? supplierId : undefined,
          expectedDelivery,
          deliveryAddress: data.deliveryAddress !== undefined ? data.deliveryAddress : undefined,
          paymentType: data.paymentType !== undefined ? data.paymentType : undefined,
          paymentCondition: data.paymentCondition !== undefined ? data.paymentCondition : undefined,
          paymentDetails: data.paymentDetails !== undefined ? data.paymentDetails : undefined,
          amountToPay,
          notes: data.notes !== undefined ? data.notes : undefined,
          updatedAt: new Date()
        }
      });

      if (items && Array.isArray(items)) {
        await tx.purchaseOrderItem.deleteMany({ where: { purchaseOrderId: id } });
        const createdItems = items.map((i) => {
          const qty = new Decimal(i.quantity);
          const price = new Decimal(i.unitPrice);
          const total = qty.mul(price);
          return {
            purchaseOrderId: id,
            materialRequestItemId: i.materialRequestItemId ?? null,
            materialId: i.materialId,
            quantity: qty,
            unit: i.unit,
            unitPrice: price,
            totalPrice: total,
            notes: i.notes ?? null
          };
        });
        if (createdItems.length > 0) {
          await tx.purchaseOrderItem.createMany({ data: createdItems });
        }
      }
    });

    return await this.getById(id);
  }
}
