import { Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

/**
 * Gera um código automático para o centro de custo no formato CC-YYYY-XXX
 * Exemplo: CC-2025-001, CC-2025-002, etc.
 */
async function generateCostCenterCode(): Promise<string> {
  const currentYear = new Date().getFullYear();
  const prefix = `CC-${currentYear}-`;

  // Buscar o último código do ano atual
  const lastCostCenter = await prisma.costCenter.findFirst({
    where: {
      code: {
        startsWith: prefix
      }
    },
    orderBy: {
      code: 'desc'
    }
  });

  let nextNumber = 1;

  if (lastCostCenter) {
    // Extrair o número do último código
    const lastNumber = parseInt(lastCostCenter.code.replace(prefix, ''), 10);
    if (!isNaN(lastNumber)) {
      nextNumber = lastNumber + 1;
    }
  }

  // Garantir que o código gerado seja único (caso raro de colisão)
  let attempts = 0;
  const maxAttempts = 1000; // Limite de segurança

  while (attempts < maxAttempts) {
    // Formatar com 3 dígitos (001, 002, etc.)
    const formattedNumber = nextNumber.toString().padStart(3, '0');
    const generatedCode = `${prefix}${formattedNumber}`;

    // Verificar se o código já existe
    const existing = await prisma.costCenter.findUnique({
      where: { code: generatedCode }
    });

    if (!existing) {
      return generatedCode;
    }

    // Se existir, tentar o próximo número
    nextNumber++;
    attempts++;
  }

  // Fallback: usar timestamp se atingir o limite (caso extremamente raro)
  const timestamp = Date.now().toString().slice(-6);
  return `${prefix}${timestamp}`;
}

export class CostCenterController {
  /**
   * Listar todos os centros de custo
   */
  async getAllCostCenters(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { search, isActive } = req.query;

      const where: any = {};

      if (search) {
        where.OR = [
          { code: { contains: search as string, mode: 'insensitive' } },
          { name: { contains: search as string, mode: 'insensitive' } },
          { description: { contains: search as string, mode: 'insensitive' } }
        ];
      }

      if (isActive !== undefined) {
        where.isActive = isActive === 'true';
      }

      const costCenters = await prisma.costCenter.findMany({
        where,
        orderBy: { code: 'asc' }
      });

      res.json({
        success: true,
        data: costCenters
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obter centro de custo por ID
   */
  async getCostCenterById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const costCenter = await prisma.costCenter.findUnique({
        where: { id }
      });

      if (!costCenter) {
        throw createError('Centro de custo não encontrado', 404);
      }

      res.json({
        success: true,
        data: costCenter
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Criar novo centro de custo
   */
  async createCostCenter(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { name, description, isActive } = req.body;

      if (!name) {
        throw createError('Nome é obrigatório', 400);
      }

      // Gerar código automaticamente
      const finalCode = await generateCostCenterCode();

      const costCenter = await prisma.costCenter.create({
        data: {
          code: finalCode,
          name,
          description: description || null,
          isActive: isActive !== undefined ? isActive : true
        }
      });

      res.status(201).json({
        success: true,
        data: costCenter,
        message: 'Centro de custo criado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Atualizar centro de custo
   */
  async updateCostCenter(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { code, name, description, isActive } = req.body;

      // Verificar se o centro de custo existe
      const existing = await prisma.costCenter.findUnique({
        where: { id }
      });

      if (!existing) {
        throw createError('Centro de custo não encontrado', 404);
      }

      // Se o código está sendo alterado, verificar se não existe outro com o mesmo código
      if (code && code !== existing.code) {
        const codeExists = await prisma.costCenter.findUnique({
          where: { code }
        });

        if (codeExists) {
          throw createError('Já existe um centro de custo com este código', 409);
        }
      }

      const costCenter = await prisma.costCenter.update({
        where: { id },
        data: {
          ...(code && { code }),
          ...(name && { name }),
          ...(description !== undefined && { description }),
          ...(isActive !== undefined && { isActive })
        }
      });

      res.json({
        success: true,
        data: costCenter,
        message: 'Centro de custo atualizado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Deletar centro de custo
   */
  async deleteCostCenter(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      // Verificar se o centro de custo existe
      const existing = await prisma.costCenter.findUnique({
        where: { id }
      });

      if (!existing) {
        throw createError('Centro de custo não encontrado', 404);
      }

      // Verificar dependências antes de excluir e buscar detalhes
      const [projects, materialRequests] = await Promise.all([
        prisma.project.findMany({
          where: { costCenterId: id },
          select: {
            id: true,
            code: true,
            name: true,
            description: true,
            status: true,
            startDate: true,
            endDate: true,
            createdAt: true
          }
        }),
        prisma.materialRequest.findMany({
          where: { costCenterId: id },
          select: {
            id: true,
            requestNumber: true,
            status: true,
            requestedAt: true
          },
          take: 10 // Limitar a 10 para não sobrecarregar a mensagem
        })
      ]);

      // Se houver dependências, retornar erro informativo com detalhes
      if (projects.length > 0 || materialRequests.length > 0) {
        let message = `Não é possível excluir este centro de custo.\n\n`;
        message += `Este centro de custo está sendo utilizado por:\n\n`;

        if (projects.length > 0) {
          message += `📋 ${projects.length} ${projects.length === 1 ? 'Projeto' : 'Projetos'}:\n`;
          projects.forEach((project, index) => {
            const statusMap: Record<string, string> = {
              'ACTIVE': 'ATIVO',
              'PLANNING': 'PLANEJAMENTO',
              'SUSPENDED': 'SUSPENSO',
              'COMPLETED': 'CONCLUÍDO',
              'CANCELLED': 'CANCELADO'
            };
            const statusLabel = statusMap[project.status] || project.status;
            
            message += `   ${index + 1}. ${project.code} - ${project.name}\n`;
            if (project.description) {
              message += `      Descrição: ${project.description}\n`;
            }
            message += `      Status: ${statusLabel}\n`;
            if (project.startDate) {
              const startDate = new Date(project.startDate).toLocaleDateString('pt-BR');
              message += `      Início: ${startDate}\n`;
            }
            if (project.endDate) {
              const endDate = new Date(project.endDate).toLocaleDateString('pt-BR');
              message += `      Término: ${endDate}\n`;
            }
            message += `\n`;
          });
        }

        if (materialRequests.length > 0) {
          message += `📦 ${materialRequests.length} ${materialRequests.length === 1 ? 'Requisição de Material' : 'Requisições de Material'}:\n`;
          materialRequests.forEach((request, index) => {
            const date = new Date(request.requestedAt).toLocaleDateString('pt-BR');
            message += `   ${index + 1}. ${request.requestNumber} - ${request.status} (${date})\n`;
          });
          if (materialRequests.length === 10) {
            message += `   ... (mostrando apenas as 10 primeiras)\n`;
          }
          message += `\n`;
        }

        message += `💡 Para desativar este centro de custo, edite-o e desmarque a opção "Ativo".`;

        throw createError(message, 409);
      }

      // Se não houver dependências, permitir exclusão
      await prisma.costCenter.delete({
        where: { id }
      });

      res.json({
        success: true,
        message: 'Centro de custo deletado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }
}

