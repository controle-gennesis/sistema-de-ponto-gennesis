import { Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { Cnab400Service } from '../services/Cnab400Service';
import { PayrollFilters } from '../services/PayrollService';

const cnab400Service = new Cnab400Service();

export class Cnab400Controller {
  /**
   * Gera arquivo CNAB400 para remessa de pagamentos
   */
  async generateCnab400(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { 
        company, 
        costCenter,
        month, 
        year,
        empresaCodigo,
        empresaAgencia,
        empresaConta,
        empresaDigito,
        sequencialRemessa
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

      // Obter configuração (pode vir do query ou usar padrão)
      let config;
      if (empresaCodigo && empresaAgencia && empresaConta) {
        const companySettings = await cnab400Service['getDefaultConfig']();
        config = {
          ...companySettings,
          empresaCodigo: empresaCodigo as string,
          empresaAgencia: empresaAgencia as string,
          empresaConta: empresaConta as string,
          empresaDigito: (empresaDigito as string) || '0',
          sequencialRemessa: (sequencialRemessa as string) || companySettings.sequencialRemessa
        };
      } else {
        config = await cnab400Service.getDefaultConfig();
      }

      const cnabContent = await cnab400Service.generateCnab400File(filters, config);

      // Configurar headers para download
      const fileName = `CNAB400-${monthNum.toString().padStart(2, '0')}-${yearNum}.txt`;
      
      res.setHeader('Content-Type', 'text/plain; charset=iso-8859-1');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.setHeader('Content-Length', Buffer.byteLength(cnabContent, 'latin1').toString());

      res.send(Buffer.from(cnabContent, 'latin1'));
    } catch (error: any) {
      next(error);
    }
  }

  /**
   * Retorna preview dos dados que serão incluídos no CNAB400
   */
  async getCnab400Preview(req: AuthRequest, res: Response, next: NextFunction) {
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

      const { BorderService } = await import('../services/BorderService');
      const borderService = new BorderService();
      const borderData = await borderService.generateBorderData(filters);

      // Filtrar apenas funcionários com dados bancários completos e banco Itaú
      const validPayments = borderData.filter(item => 
        (item.bank === 'ITAÚ' || item.bank === 'ITAU') &&
        item.agency &&
        item.account &&
        item.digit &&
        item.amount > 0
      );

      const totalAmount = validPayments.reduce((sum, item) => sum + item.amount, 0);

      res.json({
        success: true,
        data: {
          totalPayments: validPayments.length,
          totalAmount,
          payments: validPayments.map(item => ({
            name: item.name,
            cpf: item.cpf,
            amount: item.amount,
            bank: item.bank,
            agency: item.agency,
            account: item.account,
            digit: item.digit
          }))
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
