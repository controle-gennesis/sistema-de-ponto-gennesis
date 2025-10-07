import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';

const prisma = new PrismaClient();

// Schemas de validação
const createPointCorrectionSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  description: z.string().min(1, 'Descrição é obrigatória'),
  justification: z.string().min(20, 'Justificativa deve ter pelo menos 20 caracteres'),
  originalDate: z.string().transform((str) => new Date(str)),
  originalTime: z.string().regex(/^\d{2}:\d{2}$/, 'Formato de hora inválido (HH:MM)'),
  originalType: z.enum(['ENTRY', 'LUNCH_START', 'LUNCH_END', 'EXIT']),
  correctedDate: z.string().transform((str) => new Date(str)),
  correctedTime: z.string().regex(/^\d{2}:\d{2}$/, 'Formato de hora inválido (HH:MM)'),
  correctedType: z.enum(['ENTRY', 'LUNCH_START', 'LUNCH_END', 'EXIT']),
});

const approveRequestSchema = z.object({
  comment: z.string().min(1, 'Comentário é obrigatório'),
  isInternal: z.boolean().default(false),
});

const rejectRequestSchema = z.object({
  reason: z.string().min(1, 'Motivo da rejeição é obrigatório'),
  comment: z.string().min(1, 'Comentário é obrigatório'),
  isInternal: z.boolean().default(false),
});

export class PointCorrectionController {
  // Listar solicitações do funcionário
  async getMyRequests(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Usuário não autenticado' });
      }

      const { status } = req.query;

      const employee = await prisma.employee.findUnique({
        where: { userId },
        select: { id: true }
      });

      if (!employee) {
        return res.status(404).json({ error: 'Funcionário não encontrado' });
      }

      const whereClause: any = {
        employeeId: employee.id
      };

      if (status) {
        whereClause.status = status;
      }

      const requests = await prisma.pointCorrectionRequest.findMany({
        where: whereClause,
        include: {
          approver: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          comments: {
            where: { isInternal: false }, // Apenas comentários visíveis para o funcionário
            include: {
              user: {
                select: {
                  id: true,
                  name: true
                }
              }
            },
            orderBy: { createdAt: 'asc' }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      return res.json(requests);
    } catch (error) {
      console.error('Erro ao buscar solicitações:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Criar nova solicitação
  async createRequest(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'Usuário não autenticado' });
      }

      const validatedData = createPointCorrectionSchema.parse(req.body);

      const employee = await prisma.employee.findUnique({
        where: { userId },
        select: { id: true }
      });

      if (!employee) {
        return res.status(404).json({ error: 'Funcionário não encontrado' });
      }

      // Combinar data e hora para criar timestamp
      const originalDate = new Date(validatedData.originalDate);
      const [originalHours, originalMinutes] = validatedData.originalTime.split(':');
      originalDate.setHours(parseInt(originalHours), parseInt(originalMinutes), 0, 0);

      const request = await prisma.pointCorrectionRequest.create({
        data: {
          employeeId: employee.id,
          title: validatedData.title,
          description: validatedData.description,
          justification: validatedData.justification,
          originalDate: originalDate,
          originalTime: validatedData.originalTime,
          originalType: validatedData.originalType,
          correctedDate: validatedData.correctedDate,
          correctedTime: validatedData.correctedTime,
          correctedType: validatedData.correctedType,
          status: 'PENDING'
        },
        include: {
          approver: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          comments: {
            where: { isInternal: false },
            include: {
              user: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      });

      return res.status(201).json(request);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: 'Dados inválidos', 
          details: error.errors 
        });
      }
      console.error('Erro ao criar solicitação:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Obter detalhes de uma solicitação
  async getRequestById(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const requestId = req.params.id;

      if (!userId) {
        return res.status(401).json({ error: 'Usuário não autenticado' });
      }

      const employee = await prisma.employee.findUnique({
        where: { userId },
        select: { id: true }
      });

      if (!employee) {
        return res.status(404).json({ error: 'Funcionário não encontrado' });
      }

      const request = await prisma.pointCorrectionRequest.findFirst({
        where: {
          id: requestId,
          employeeId: employee.id
        },
        include: {
          approver: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          comments: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true
                }
              }
            },
            orderBy: { createdAt: 'asc' }
          }
        }
      });

      if (!request) {
        return res.status(404).json({ error: 'Solicitação não encontrada' });
      }

      return res.json(request);
    } catch (error) {
      console.error('Erro ao buscar solicitação:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Atualizar solicitação (apenas se pendente)
  async updateRequest(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const requestId = req.params.id;

      if (!userId) {
        return res.status(401).json({ error: 'Usuário não autenticado' });
      }

      const employee = await prisma.employee.findUnique({
        where: { userId },
        select: { id: true }
      });

      if (!employee) {
        return res.status(404).json({ error: 'Funcionário não encontrado' });
      }

      const existingRequest = await prisma.pointCorrectionRequest.findFirst({
        where: {
          id: requestId,
          employeeId: employee.id,
          status: 'PENDING'
        }
      });

      if (!existingRequest) {
        return res.status(404).json({ error: 'Solicitação não encontrada ou não pode ser editada' });
      }

      const validatedData = createPointCorrectionSchema.parse(req.body);

      const updatedRequest = await prisma.pointCorrectionRequest.update({
        where: { id: requestId },
        data: {
          title: validatedData.title,
          description: validatedData.description,
          justification: validatedData.justification,
          originalDate: validatedData.originalDate,
          originalTime: validatedData.originalTime,
          originalType: validatedData.originalType,
          correctedDate: validatedData.correctedDate,
          correctedTime: validatedData.correctedTime,
          correctedType: validatedData.correctedType
        },
        include: {
          approver: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          comments: {
            where: { isInternal: false },
            include: {
              user: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      });

      return res.json(updatedRequest);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: 'Dados inválidos', 
          details: error.errors 
        });
      }
      console.error('Erro ao atualizar solicitação:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Cancelar solicitação
  async cancelRequest(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const requestId = req.params.id;

      if (!userId) {
        return res.status(401).json({ error: 'Usuário não autenticado' });
      }

      const employee = await prisma.employee.findUnique({
        where: { userId },
        select: { id: true }
      });

      if (!employee) {
        return res.status(404).json({ error: 'Funcionário não encontrado' });
      }

      const request = await prisma.pointCorrectionRequest.findFirst({
        where: {
          id: requestId,
          employeeId: employee.id,
          status: { in: ['PENDING', 'IN_REVIEW'] }
        }
      });

      if (!request) {
        return res.status(404).json({ error: 'Solicitação não encontrada ou não pode ser cancelada' });
      }

      await prisma.pointCorrectionRequest.update({
        where: { id: requestId },
        data: { status: 'CANCELLED' }
      });

      return res.json({ message: 'Solicitação cancelada com sucesso' });
    } catch (error) {
      console.error('Erro ao cancelar solicitação:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Listar solicitações para aprovação (supervisores/RH)
  async getPendingApproval(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { status } = req.query;

      console.log('Buscando solicitações para aprovação, status:', status);

      if (!userId) {
        return res.status(401).json({ error: 'Usuário não autenticado' });
      }

      const whereClause: any = {};

      // Filtrar por status se especificado
      if (status) {
        if (status === 'all') {
          // Se selecionou "Todos os status", mostrar todas
          console.log('Mostrando TODAS as solicitações');
        } else {
          // Filtrar por status específico
          whereClause.status = status as string;
          console.log('Filtrando por status específico:', status);
        }
      } else {
        // Se não especificado, mostrar apenas PENDENTES (padrão)
        whereClause.status = 'PENDING';
        console.log('Mostrando apenas PENDING (padrão)');
      }

      console.log('Where clause:', whereClause);

      const requests = await prisma.pointCorrectionRequest.findMany({
        where: whereClause,
        include: {
          employee: {
            select: {
              id: true,
              employeeId: true,
              department: true,
              position: true,
              user: {
                select: {
                  id: true,
                  name: true
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
          comments: {
            include: {
              user: {
                select: {
                  id: true,
                  name: true
                }
              }
            },
            orderBy: { createdAt: 'asc' }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      console.log('Requests encontradas:', requests.length);
      console.log('Primeira request:', requests[0]?.status);
      console.log('Todas as requests:', requests.map(r => ({ id: r.id, status: r.status, title: r.title })));

      return res.json(requests);
    } catch (error) {
      console.error('Erro ao buscar solicitações para aprovação:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Aprovar solicitação
  async approveRequest(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const requestId = req.params.id;

      if (!userId) {
        return res.status(401).json({ error: 'Usuário não autenticado' });
      }

      const validatedData = approveRequestSchema.parse(req.body);

      const request = await prisma.pointCorrectionRequest.findUnique({
        where: { id: requestId },
        include: {
          employee: {
            select: {
              id: true,
              user: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      });

      if (!request) {
        return res.status(404).json({ error: 'Solicitação não encontrada' });
      }

      if (request.status !== 'PENDING' && request.status !== 'IN_REVIEW') {
        return res.status(400).json({ error: 'Solicitação não pode ser aprovada' });
      }

      const updatedRequest = await prisma.pointCorrectionRequest.update({
        where: { id: requestId },
        data: {
          status: 'APPROVED',
          approvedBy: userId,
          approvedAt: new Date()
        },
        include: {
          approver: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          employee: {
            select: {
              id: true,
              employeeId: true,
              department: true,
              position: true,
              user: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      });

      // Adicionar comentário de aprovação
      await prisma.pointCorrectionComment.create({
        data: {
          requestId: requestId,
          userId: userId,
          comment: validatedData.comment,
          isInternal: validatedData.isInternal
        }
      });

      // TODO: Aqui seria aplicada a correção no sistema de ponto
      // Por enquanto, apenas retornamos a solicitação aprovada

      return res.json({ message: 'Solicitação aprovada com sucesso', request: updatedRequest });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: 'Dados inválidos', 
          details: error.errors 
        });
      }
      console.error('Erro ao aprovar solicitação:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }

  // Rejeitar solicitação
  async rejectRequest(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const requestId = req.params.id;

      if (!userId) {
        return res.status(401).json({ error: 'Usuário não autenticado' });
      }

      const validatedData = rejectRequestSchema.parse(req.body);

      const request = await prisma.pointCorrectionRequest.findUnique({
        where: { id: requestId },
        include: {
          employee: {
            select: {
              id: true,
              user: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      });

      if (!request) {
        return res.status(404).json({ error: 'Solicitação não encontrada' });
      }

      if (request.status !== 'PENDING' && request.status !== 'IN_REVIEW') {
        return res.status(400).json({ error: 'Solicitação não pode ser rejeitada' });
      }

      const updatedRequest = await prisma.pointCorrectionRequest.update({
        where: { id: requestId },
        data: {
          status: 'REJECTED',
          approvedBy: userId,
          approvedAt: new Date(),
          rejectionReason: validatedData.reason
        },
        include: {
          approver: {
            select: {
              id: true,
              name: true,
              email: true
            }
          },
          employee: {
            select: {
              id: true,
              employeeId: true,
              department: true,
              position: true,
              user: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      });

      // Adicionar comentário de rejeição
      await prisma.pointCorrectionComment.create({
        data: {
          requestId: requestId,
          userId: userId,
          comment: validatedData.comment,
          isInternal: validatedData.isInternal
        }
      });

      return res.json({ message: 'Solicitação rejeitada com sucesso', request: updatedRequest });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ 
          error: 'Dados inválidos', 
          details: error.errors 
        });
      }
      console.error('Erro ao rejeitar solicitação:', error);
      return res.status(500).json({ error: 'Erro interno do servidor' });
    }
  }
}
