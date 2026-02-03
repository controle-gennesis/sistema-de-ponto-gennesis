import { Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { CnabService } from '../services/CnabService';
import { PayrollFilters } from '../services/PayrollService';

const cnabService = new CnabService();

export class CnabController {
  /**
   * Gera arquivo CNAB400 para remessa de pagamentos
   */
  async generateCnab400(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { 
        company, 
        costCenter,
        month, 
        year 
      } = req.query;

      // Validar parâmetros obrigatórios
      if (!month || !year) {
        throw createError('Mês e ano são obrigatórios', 400);
      }

      const monthNum = parseInt(month as string);
      const yearNum = parseInt(year as string);

      // Validar valores
      if (monthNum < 1 || monthNum > 12) {
        throw createError('Mês deve estar entre 1 e 12', 400);
      }

      if (yearNum < 2020 || yearNum > 2030) {
        throw createError('Ano deve estar entre 2020 e 2030', 400);
      }

      const filters: PayrollFilters = {
        company: company as string,
        costCenter: costCenter as string,
        month: monthNum,
        year: yearNum
      };

      const cnabContent = await cnabService.generateCnab400(filters);

      // Configurar headers para download
      const fileName = `CNAB400-${monthNum.toString().padStart(2, '0')}-${yearNum}.txt`;
      
      res.setHeader('Content-Type', 'text/plain; charset=ISO-8859-1');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Length', Buffer.byteLength(cnabContent, 'latin1').toString());

      res.send(Buffer.from(cnabContent, 'latin1'));
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Retorna dados do CNAB em JSON (para preview)
   */
  async getCnabData(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { 
        company, 
        costCenter,
        month, 
        year 
      } = req.query;

      // Validar parâmetros obrigatórios
      if (!month || !year) {
        throw createError('Mês e ano são obrigatórios', 400);
      }

      const monthNum = parseInt(month as string);
      const yearNum = parseInt(year as string);

      // Validar valores
      if (monthNum < 1 || monthNum > 12) {
        throw createError('Mês deve estar entre 1 e 12', 400);
      }

      if (yearNum < 2020 || yearNum > 2030) {
        throw createError('Ano deve estar entre 2020 e 2030', 400);
      }

      const filters: PayrollFilters = {
        company: company as string,
        costCenter: costCenter as string,
        month: monthNum,
        year: yearNum
      };

      const cnabContent = await cnabService.generateCnab400(filters);
      const lines = cnabContent.split('\r\n');

      res.json({
        success: true,
        data: {
          totalLines: lines.length,
          header: lines[0] || '',
          transactions: lines.slice(1, -1),
          trailer: lines[lines.length - 1] || '',
          preview: lines.slice(0, 5) // Primeiras 5 linhas para preview
        },
        period: {
          month: monthNum,
          year: yearNum
        },
        filters: {
          company: company as string || null,
          costCenter: costCenter as string || null
        }
      });
    } catch (error: any) {
      next(error);
    }
  }
}
