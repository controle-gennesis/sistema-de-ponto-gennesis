import { prisma } from '../lib/prisma';

export interface CreateMaterialRequestData {
  requestedBy: string;
  costCenterId: string;
  projectId?: string;
  description?: string;
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  items: {
    materialId: string;
    quantity: number;
    notes?: string;
  }[];
}

export interface UpdateMaterialRequestStatusData {
  status: 'PENDING' | 'IN_REVIEW' | 'APPROVED' | 'PARTIALLY_FULFILLED' | 'FULFILLED' | 'REJECTED' | 'CANCELLED';
  approvedBy?: string;
  rejectedBy?: string;
  rejectionReason?: string;
}

export class MaterialRequestService {
  /**
   * Gera número único para requisição (formato: REQ-YYYY-NNN)
   */
  private async generateRequestNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const lastRequest = await prisma.materialRequest.findFirst({
      where: {
        requestNumber: {
          startsWith: `REQ-${year}-`
        }
      },
      orderBy: {
        requestNumber: 'desc'
      }
    });

    let sequence = 1;
    if (lastRequest) {
      const lastSequence = parseInt(lastRequest.requestNumber.split('-')[2]);
      sequence = lastSequence + 1;
    }

    return `REQ-${year}-${sequence.toString().padStart(3, '0')}`;
  }

  /**
   * Cria uma nova requisição de material
   */
  async createMaterialRequest(data: CreateMaterialRequestData) {
    // Validar centro de custo
    const costCenter = await prisma.costCenter.findUnique({
      where: { id: data.costCenterId }
    });

    if (!costCenter || !costCenter.isActive) {
      throw new Error('Centro de custo não encontrado ou inativo');
    }

    // Validar projeto se informado (apenas se for um ID válido de projeto)
    // Se for uma string de ordem de serviço, não validar como projeto
    if (data.projectId) {
      // Tentar encontrar como projeto apenas se parecer um ID válido (CUID)
      // IDs CUID têm 25 caracteres e começam com 'c'
      const isProjectId = data.projectId.length === 25 && data.projectId.startsWith('c');
      
      if (isProjectId) {
        const project = await prisma.project.findUnique({
          where: { id: data.projectId }
        });

        if (project && project.isActive) {
          // Verificar se o projeto pertence ao centro de custo
          if (project.costCenterId !== data.costCenterId) {
            throw new Error('O projeto não pertence ao centro de custo informado');
          }
        }
        // Se não encontrar como projeto, tratar como ordem de serviço (texto livre)
      }
      // Se não for um ID válido, tratar como ordem de serviço (texto livre)
    }

    // Validar materiais
    if (!data.items || data.items.length === 0) {
      throw new Error('É necessário informar pelo menos um item');
    }

    // Validar quantidades
    for (const item of data.items) {
      if (!item.materialId) {
        throw new Error('ID do material é obrigatório para todos os itens');
      }
      if (!item.quantity || item.quantity <= 0) {
        throw new Error('Quantidade deve ser maior que zero para todos os itens');
      }
    }

    const requestNumber = await this.generateRequestNumber();

    // Buscar preços dos materiais
    const materials = await prisma.engineeringMaterial.findMany({
      where: {
        id: {
          in: data.items.map(item => item.materialId)
        },
        isActive: true
      }
    });

    if (materials.length !== data.items.length) {
      throw new Error('Um ou mais materiais não foram encontrados ou estão inativos');
    }

    const materialMap = new Map(materials.map(m => [m.id, m]));

    // projectId só pode ser usado se for ID válido de projeto (CUID) - senão viola FK
    const projectId = data.projectId && data.projectId.length === 25 && data.projectId.startsWith('c')
      ? data.projectId
      : undefined;

    // Criar requisição com itens
    const request = await prisma.materialRequest.create({
      data: {
        requestNumber,
        requestedBy: data.requestedBy,
        costCenterId: data.costCenterId,
        projectId,
        description: data.description,
        priority: data.priority || 'MEDIUM',
        status: 'PENDING',
        items: {
          create: data.items.map(item => {
            const material = materialMap.get(item.materialId);
            const unitPrice = material?.medianPrice || 0;
            const totalPrice = Number(unitPrice) * item.quantity;

            return {
              materialId: item.materialId,
              quantity: item.quantity,
              unit: material?.unit || 'UN',
              unitPrice: unitPrice,
              totalPrice: totalPrice,
              notes: item.notes,
              status: 'PENDING'
            };
          })
        }
      },
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        costCenter: true,
        project: true,
        items: {
          include: {
            material: true
          }
        }
      }
    });

    return request;
  }

  /**
   * Lista requisições com filtros
   */
  async listMaterialRequests(filters: {
    status?: string;
    costCenterId?: string;
    projectId?: string;
    requestedBy?: string;
    priority?: string;
    page?: number;
    limit?: number;
  }) {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const skip = (page - 1) * limit;

    const where: any = {};

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.costCenterId) {
      where.costCenterId = filters.costCenterId;
    }

    if (filters.projectId) {
      where.projectId = filters.projectId;
    }

    if (filters.requestedBy) {
      where.requestedBy = filters.requestedBy;
    }

    if (filters.priority) {
      where.priority = filters.priority;
    }

    const [requests, total] = await Promise.all([
      prisma.materialRequest.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          requestedAt: 'desc'
        },
        include: {
          requester: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          approver: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          costCenter: true,
          project: true,
          items: {
            include: {
              material: true
            }
          }
        }
      }),
      prisma.materialRequest.count({ where })
    ]);

    return {
      requests,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    };
  }

  /**
   * Obtém uma requisição por ID
   */
  async getMaterialRequestById(id: string) {
    return await prisma.materialRequest.findUnique({
      where: { id },
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            email: true,
            employee: {
              select: {
                department: true,
                position: true
              }
            }
          }
        },
        approver: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        rejecter: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        costCenter: true,
        project: true,
        items: {
          include: {
            material: {
              include: {
                category: true
              }
            }
          }
        }
      }
    });
  }

  /**
   * Atualiza status da requisição
   */
  async updateMaterialRequestStatus(
    id: string,
    data: UpdateMaterialRequestStatusData,
    userId: string
  ) {
    const updateData: any = {
      status: data.status,
      updatedAt: new Date()
    };

    if (data.status === 'APPROVED' && data.approvedBy) {
      updateData.approvedBy = data.approvedBy;
      updateData.approvedAt = new Date();
    }

    if (data.status === 'REJECTED' && data.rejectedBy) {
      updateData.rejectedBy = data.rejectedBy;
      updateData.rejectedAt = new Date();
      updateData.rejectionReason = data.rejectionReason;
    }

    // Se todos os itens foram atendidos, marcar como FULFILLED
    if (data.status === 'FULFILLED') {
      updateData.completedAt = new Date();
    }

    return await prisma.materialRequest.update({
      where: { id },
      data: updateData,
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        costCenter: true,
        project: true,
        items: {
          include: {
            material: true
          }
        }
      }
    });
  }

  /**
   * Cancela uma requisição (apenas quem criou pode cancelar)
   */
  async cancelMaterialRequest(id: string, userId: string) {
    const request = await prisma.materialRequest.findUnique({
      where: { id }
    });

    if (!request) {
      throw new Error('Requisição não encontrada');
    }

    if (request.requestedBy !== userId) {
      throw new Error('Apenas o solicitante pode cancelar a requisição');
    }

    if (request.status === 'FULFILLED' || request.status === 'CANCELLED') {
      throw new Error('Não é possível cancelar uma requisição já atendida ou cancelada');
    }

    return await prisma.materialRequest.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        updatedAt: new Date()
      },
      include: {
        requester: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        costCenter: true,
        project: true,
        items: {
          include: {
            material: true
          }
        }
      }
    });
  }

  /**
   * Atualiza status de um item da requisição
   */
  async updateItemStatus(
    itemId: string,
    status: 'PENDING' | 'APPROVED' | 'PURCHASED' | 'DELIVERED' | 'CANCELLED',
    fulfilledQuantity?: number
  ) {
    const updateData: any = {
      status,
      updatedAt: new Date()
    };

    if (fulfilledQuantity !== undefined) {
      updateData.fulfilledQuantity = fulfilledQuantity;
    }

    const item = await prisma.materialRequestItem.update({
      where: { id: itemId },
      data: updateData,
      include: {
        materialRequest: true,
        material: true
      }
    });

    // Verificar se todos os itens foram atendidos
    const request = await prisma.materialRequest.findUnique({
      where: { id: item.materialRequestId },
      include: {
        items: true
      }
    });

    if (request) {
      const allFulfilled = request.items.every(i => 
        i.status === 'DELIVERED' || i.status === 'CANCELLED'
      );
      const someFulfilled = request.items.some(i => 
        i.status === 'DELIVERED' || i.status === 'PURCHASED'
      );

      if (allFulfilled && request.status !== 'FULFILLED') {
        await prisma.materialRequest.update({
          where: { id: request.id },
          data: {
            status: 'FULFILLED',
            completedAt: new Date()
          }
        });
      } else if (someFulfilled && request.status === 'APPROVED') {
        await prisma.materialRequest.update({
          where: { id: request.id },
          data: {
            status: 'PARTIALLY_FULFILLED'
          }
        });
      }
    }

    return item;
  }
}
