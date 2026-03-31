import { Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';

export class ContractAnnualValueController {
  /**
   * Listar todos os valores anuais de um contrato
   */
  async getAnnualValues(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId } = req.params;

      const contract = await prisma.contract.findUnique({
        where: { id: contractId }
      });
      if (!contract) {
        throw createError('Contrato não encontrado', 404);
      }

      const values = await prisma.contractAnnualValue.findMany({
        where: { contractId },
        orderBy: { year: 'asc' }
      });

      const withNumbers = values.map((v) => ({
        ...v,
        value: v.value ? Number(v.value) : 0
      }));

      res.json({
        success: true,
        data: withNumbers
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Definir valor anual para um ano específico (upsert)
   */
  async setAnnualValue(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId, year } = req.params;
      const { value } = req.body;

      const yearNum = parseInt(year, 10);
      if (isNaN(yearNum) || yearNum < 2000 || yearNum > 2100) {
        throw createError('Ano inválido', 400);
      }
      if (value === undefined || value === null || value === '') {
        throw createError('Valor é obrigatório', 400);
      }

      const contract = await prisma.contract.findUnique({
        where: { id: contractId }
      });
      if (!contract) {
        throw createError('Contrato não encontrado', 404);
      }

      const numericValue = Number(value) || 0;

      const annualValue = await prisma.contractAnnualValue.upsert({
        where: {
          contractId_year: { contractId, year: yearNum }
        },
        create: {
          contractId,
          year: yearNum,
          value: numericValue
        },
        update: { value: numericValue }
      });

      res.json({
        success: true,
        data: {
          ...annualValue,
          value: Number(annualValue.value)
        },
        message: 'Valor anual atualizado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }
}
