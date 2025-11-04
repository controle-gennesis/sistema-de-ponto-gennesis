import { Request, Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { PayrollService, PayrollFilters } from '../services/PayrollService';

const payrollService = new PayrollService();

export class PayrollController {
  /**
   * Gera folha de pagamento mensal
   */
  async generateMonthlyPayroll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { 
        search, 
        company, 
        department, 
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
        search: search as string,
        company: company as string,
        department: department as string,
        month: monthNum,
        year: yearNum
      };

      const payrollData = await payrollService.generateMonthlyPayroll(filters);

      res.json({
        success: true,
        data: payrollData
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtém dados de um funcionário específico para folha
   */
  async getEmployeePayrollData(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { employeeId } = req.params;
      const { month, year } = req.query;

      if (!month || !year) {
        throw createError('Mês e ano são obrigatórios', 400);
      }

      const monthNum = parseInt(month as string);
      const yearNum = parseInt(year as string);

      const employeeData = await payrollService.getEmployeePayrollData(
        employeeId, 
        monthNum, 
        yearNum
      );

      if (!employeeData) {
        throw createError('Funcionário não encontrado', 404);
      }

      res.json({
        success: true,
        data: employeeData
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtém estatísticas de folha por empresa
   */
  async getPayrollStatsByCompany(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { month, year } = req.query;

      if (!month || !year) {
        throw createError('Mês e ano são obrigatórios', 400);
      }

      const monthNum = parseInt(month as string);
      const yearNum = parseInt(year as string);

      const stats = await payrollService.getPayrollStatsByCompany(monthNum, yearNum);

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtém estatísticas de folha por departamento
   */
  async getPayrollStatsByDepartment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { month, year } = req.query;

      if (!month || !year) {
        throw createError('Mês e ano são obrigatórios', 400);
      }

      const monthNum = parseInt(month as string);
      const yearNum = parseInt(year as string);

      const stats = await payrollService.getPayrollStatsByDepartment(monthNum, yearNum);

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Obtém lista de funcionários para folha (versão simplificada)
   */
  async getEmployeesForPayroll(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { 
        search, 
        company, 
        department, 
        position,
        costCenter,
        client,
        modality,
        bank,
        accountType,
        polo,
        month, 
        year,
        page = 1,
        limit = 50
      } = req.query;

      // Validar parâmetros obrigatórios
      if (!month || !year) {
        throw createError('Mês e ano são obrigatórios', 400);
      }

      const monthNum = parseInt(month as string);
      const yearNum = parseInt(year as string);
      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);

      const filters: PayrollFilters = {
        search: search as string,
        company: company as string,
        department: department as string,
        position: position as string,
        costCenter: costCenter as string,
        client: client as string,
        modality: modality as string,
        bank: bank as string,
        accountType: accountType as string,
        polo: polo as string,
        month: monthNum,
        year: yearNum
      };

      try {
        const payrollData = await payrollService.generateMonthlyPayroll(filters);

        // Aplicar paginação
        const startIndex = (pageNum - 1) * limitNum;
        const endIndex = startIndex + limitNum;
        const paginatedEmployees = payrollData.employees.slice(startIndex, endIndex);

        res.json({
          success: true,
          data: {
            employees: paginatedEmployees,
            period: payrollData.period,
            totals: payrollData.totals,
            pagination: {
              page: pageNum,
              limit: limitNum,
              total: payrollData.employees.length,
              totalPages: Math.ceil(payrollData.employees.length / limitNum)
            }
          }
        });
      } catch (serviceError: any) {
        console.error('Erro no PayrollService:', serviceError);
        console.error('Erro completo:', JSON.stringify(serviceError, null, 2));
        
        // Se for um erro do Prisma, tratar adequadamente
        if (serviceError.name === 'PrismaClientKnownRequestError') {
          console.error('Erro do Prisma:', serviceError.code, serviceError.meta);
          return res.status(500).json({
            success: false,
            error: 'Erro ao processar dados do banco de dados',
            details: process.env.NODE_ENV === 'development' ? serviceError.message : undefined
          });
        }
        
        throw serviceError;
      }
    } catch (error) {
      console.error('Erro no getEmployeesForPayroll:', error);
      next(error);
    }
  }

  /**
   * Salva valores manuais de INSS
   */
  async saveManualInssValues(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { employeeId, month, year, inssRescisao, inss13 } = req.body;

      // Validar parâmetros obrigatórios
      if (!employeeId || !month || !year) {
        throw createError('ID do funcionário, mês e ano são obrigatórios', 400);
      }

      // Validar valores numéricos
      if (month < 1 || month > 12) {
        throw createError('Mês deve estar entre 1 e 12', 400);
      }

      if (year < 2020 || year > 2030) {
        throw createError('Ano deve estar entre 2020 e 2030', 400);
      }

      if (inssRescisao < 0 || inss13 < 0) {
        throw createError('Valores de INSS não podem ser negativos', 400);
      }

      const result = await payrollService.saveManualInssValues({
        employeeId: employeeId, // Já é string, não precisa converter
        month: parseInt(month),
        year: parseInt(year),
        inssRescisao: parseFloat(inssRescisao) || 0,
        inss13: parseFloat(inss13) || 0
      });

      res.json({
        success: true,
        message: 'Valores manuais de INSS salvos com sucesso',
        data: result
      });
    } catch (error) {
      next(error);
    }
  }
}
