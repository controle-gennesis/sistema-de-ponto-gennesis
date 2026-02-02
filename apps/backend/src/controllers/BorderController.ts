import { Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { BorderService } from '../services/BorderService';
import { PayrollFilters } from '../services/PayrollService';

const borderService = new BorderService();

export class BorderController {
  /**
   * Gera borderô de pagamento em PDF
   */
  async generateBorderPDF(req: AuthRequest, res: Response, next: NextFunction) {
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

      const pdfBuffer = await borderService.generateBorderPDF(filters);

      // Configurar headers para download
      const fileName = `bordero-pagamento-${monthNum.toString().padStart(2, '0')}-${yearNum}.pdf`;
      
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Length', pdfBuffer.length.toString());

      res.send(pdfBuffer);
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Retorna dados do borderô em JSON (para preview)
   */
  async getBorderData(req: AuthRequest, res: Response, next: NextFunction) {
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

      const borderData = await borderService.generateBorderData(filters);

      res.json({
        success: true,
        data: borderData,
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
