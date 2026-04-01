import { Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

export class ContractController {
  /**
   * Listar todos os contratos
   */
  async getAllContracts(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { search, page = 1, limit = 20 } = req.query;

      const where: any = {};

      if (search) {
        where.OR = [
          { name: { contains: search as string, mode: 'insensitive' } },
          { number: { contains: search as string, mode: 'insensitive' } }
        ];
      }

      const limitNum = Math.min(Number(limit) || 20, 200);
      const skip = (Number(page) - 1) * limitNum;

      const [contracts, total] = await Promise.all([
        prisma.contract.findMany({
          where,
          skip,
          take: limitNum,
          orderBy: { createdAt: 'desc' },
          include: {
            costCenter: {
              select: { id: true, code: true, name: true }
            }
          }
        }),
        prisma.contract.count({ where })
      ]);

      // Converter Decimal para número na resposta
      const contractsWithNumbers = contracts.map((c) => ({
        ...c,
        valuePlusAddenda: c.valuePlusAddenda ? Number(c.valuePlusAddenda) : 0
      }));

      res.json({
        success: true,
        data: contractsWithNumbers,
        pagination: {
          page: Number(page),
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum)
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obter contrato por ID
   */
  async getContractById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const contract = await prisma.contract.findUnique({
        where: { id },
        include: {
          costCenter: {
            select: { id: true, code: true, name: true }
          }
        }
      });

      if (!contract) {
        throw createError('Contrato não encontrado', 404);
      }

      res.json({
        success: true,
        data: {
          ...contract,
          valuePlusAddenda: contract.valuePlusAddenda ? Number(contract.valuePlusAddenda) : 0
        }
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Criar novo contrato
   */
  async createContract(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { name, number, startDate, endDate, validityCycle, costCenterId, valuePlusAddenda } = req.body;

      if (!name?.trim()) {
        throw createError('Nome do contrato é obrigatório', 400);
      }
      if (!number?.trim()) {
        throw createError('Número do contrato é obrigatório', 400);
      }
      if (!startDate) {
        throw createError('Data de início da vigência é obrigatória', 400);
      }
      if (!endDate) {
        throw createError('Data de fim da vigência é obrigatória', 400);
      }
      if (!costCenterId) {
        throw createError('Centro de custo é obrigatório', 400);
      }
      if (valuePlusAddenda === undefined || valuePlusAddenda === null || valuePlusAddenda === '') {
        throw createError('Valor mais aditivos é obrigatório', 400);
      }

      const costCenterExists = await prisma.costCenter.findUnique({
        where: { id: costCenterId }
      });
      if (!costCenterExists) {
        throw createError('Centro de custo não encontrado', 404);
      }

      const numberExists = await prisma.contract.findUnique({
        where: { number: String(number).trim() }
      });
      if (numberExists) {
        throw createError('Já existe um contrato com este número', 409);
      }

      const value = Number(valuePlusAddenda) || 0;
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (end < start) {
        throw createError('Data de fim da vigência deve ser posterior à data de início', 400);
      }

      const contract = await prisma.contract.create({
        data: {
          name: name.trim(),
          number: String(number).trim(),
          startDate: start,
          endDate: end,
          costCenterId,
          valuePlusAddenda: value
        },
        include: {
          costCenter: {
            select: { id: true, code: true, name: true }
          }
        }
      });

      res.status(201).json({
        success: true,
        data: {
          ...contract,
          valuePlusAddenda: Number(contract.valuePlusAddenda)
        },
        message: 'Contrato criado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Atualizar contrato
   */
  async updateContract(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { name, number, startDate, endDate, costCenterId, valuePlusAddenda } = req.body;

      const existing = await prisma.contract.findUnique({
        where: { id }
      });

      if (!existing) {
        throw createError('Contrato não encontrado', 404);
      }

      if (number && String(number).trim() !== existing.number) {
        const numberExists = await prisma.contract.findUnique({
          where: { number: String(number).trim() }
        });
        if (numberExists) {
          throw createError('Já existe um contrato com este número', 409);
        }
      }

      if (costCenterId) {
        const costCenterExists = await prisma.costCenter.findUnique({
          where: { id: costCenterId }
        });
        if (!costCenterExists) {
          throw createError('Centro de custo não encontrado', 404);
        }
      }

      const updateData: any = {};
      if (name !== undefined) updateData.name = name.trim();
      if (number !== undefined) updateData.number = String(number).trim();
      if (startDate !== undefined) updateData.startDate = new Date(startDate);
      if (endDate !== undefined) updateData.endDate = new Date(endDate);
      if (costCenterId !== undefined) updateData.costCenterId = costCenterId;
      if (valuePlusAddenda !== undefined) updateData.valuePlusAddenda = Number(valuePlusAddenda) || 0;

      if (updateData.endDate && updateData.startDate && updateData.endDate < updateData.startDate) {
        throw createError('Data de fim da vigência deve ser posterior à data de início', 400);
      }

      const contract = await prisma.contract.update({
        where: { id },
        data: updateData,
        include: {
          costCenter: {
            select: { id: true, code: true, name: true }
          }
        }
      });

      res.json({
        success: true,
        data: {
          ...contract,
          valuePlusAddenda: Number(contract.valuePlusAddenda)
        },
        message: 'Contrato atualizado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Controle geral: listar todos os contratos com dados agregados
   * (faturamento, ordens de serviço, produção semanal)
   */
  async getOverview(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { year } = req.query;
      const filterYear = year ? Number(year) : new Date().getFullYear();

      const contracts = await prisma.contract.findMany({
        where: {},
        orderBy: { name: 'asc' },
        include: {
          costCenter: {
            select: { id: true, code: true, name: true }
          },
          billings: {
            where: year
              ? {
                  issueDate: {
                    gte: new Date(filterYear, 0, 1),
                    lt: new Date(filterYear + 1, 0, 1)
                  }
                }
              : undefined,
            select: { grossValue: true, netValue: true }
          },
          pleitos: true,
          weeklyProductions: {
            where: year
              ? {
                  fillingDate: {
                    gte: new Date(filterYear, 0, 1),
                    lt: new Date(filterYear + 1, 0, 1)
                  }
                }
              : undefined,
            select: { weeklyProductionValue: true }
          }
        }
      });

      const overview = contracts.map((c) => {
        const totalBruto =
          c.billings?.reduce((s, b) => s + Number(b.grossValue || 0), 0) ?? 0;
        const totalLiquido =
          c.billings?.reduce((s, b) => s + Number(b.netValue || 0), 0) ?? 0;
        const totalProducao =
          c.weeklyProductions?.reduce(
            (s, p) => s + Number(p.weeklyProductionValue || 0),
            0
          ) ?? 0;
        return {
          id: c.id,
          name: c.name,
          number: c.number,
          startDate: c.startDate,
          endDate: c.endDate,
          costCenter: c.costCenter,
          valuePlusAddenda: c.valuePlusAddenda ? Number(c.valuePlusAddenda) : 0,
          qtdOrdensServico: c.pleitos?.length ?? 0,
          qtdFaturamentos: c.billings?.length ?? 0,
          totalFaturamentoBruto: totalBruto,
          totalFaturamentoLiquido: totalLiquido,
          qtdProducoesSemanais: c.weeklyProductions?.length ?? 0,
          totalProducaoSemanal: totalProducao
        };
      });

      res.json({
        success: true,
        data: overview,
        filterYear: year ? filterYear : null
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Deletar contrato
   */
  async deleteContract(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const existing = await prisma.contract.findUnique({
        where: { id }
      });

      if (!existing) {
        throw createError('Contrato não encontrado', 404);
      }

      await prisma.contract.delete({
        where: { id }
      });

      res.json({
        success: true,
        message: 'Contrato excluído com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }
}
