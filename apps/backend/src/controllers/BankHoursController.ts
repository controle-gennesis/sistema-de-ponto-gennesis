import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { TimeRecordService } from '../services/TimeRecordService';

const prisma = new PrismaClient();
const timeRecordService = new TimeRecordService();

export class BankHoursController {
  async getBankHoursByEmployee(req: Request, res: Response) {
    try {
      const { search, startDate, endDate, department, position, costCenter, client, polo, status } = req.query;
      
      // Usar as datas fornecidas ou calcular período padrão (mês atual)
      let startDateFilter: Date;
      let endDateFilter: Date;
      
      if (startDate && endDate) {
        // Criar datas no horário de Brasília
        const startDateStr = startDate as string;
        const endDateStr = endDate as string;
        
        // Parsear a data e criar no horário local
        const [startYear, startMonth, startDay] = startDateStr.split('T')[0].split('-').map(Number);
        const [endYear, endMonth, endDay] = endDateStr.split('T')[0].split('-').map(Number);
        
        startDateFilter = new Date(startYear, startMonth - 1, startDay, 1, 0, 0);
        endDateFilter = new Date(endYear, endMonth - 1, endDay, 23, 0, 0);
      } else {
        // Fallback para mês atual se não fornecido
        const now = new Date();
        startDateFilter = new Date(now.getFullYear(), now.getMonth(), 1, 1, 0, 0);
        endDateFilter = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 0, 0);
      }

      // Construir filtros de busca
      const whereClause: any = {
        user: {
          isActive: true
        }
      };

      if (search) {
        whereClause.user = {
          ...whereClause.user,
          OR: [
            { name: { contains: search as string, mode: 'insensitive' } },
            { cpf: { contains: search as string, mode: 'insensitive' } }
          ]
        };
      }

      if (department) {
        whereClause.department = { contains: department as string, mode: 'insensitive' };
      }

      if (position) {
        whereClause.position = { contains: position as string, mode: 'insensitive' };
      }

      if (costCenter) {
        whereClause.costCenter = { contains: costCenter as string, mode: 'insensitive' };
      }

      if (client) {
        whereClause.client = { contains: client as string, mode: 'insensitive' };
      }

      if (polo) {
        whereClause.polo = { contains: polo as string, mode: 'insensitive' };
      }

      // Buscar funcionários com filtros aplicados
      const employees = await prisma.employee.findMany({
        where: whereClause,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              cpf: true
            }
          }
        },
        orderBy: {
          user: {
            name: 'asc'
          }
        }
      });

      // Calcular banco de horas para cada funcionário usando TimeRecordService
      const bankHoursData = await Promise.all(
        employees.map(async (employee: any) => {
          // Usar o TimeRecordService para garantir consistência
          const bankHoursResult = await timeRecordService.calculateBankHours(
            employee.userId, 
            startDateFilter, 
            endDateFilter
          );

          // Usar o método detalhado para obter valores corretos
          const detailedResult = await timeRecordService.calculateBankHoursDetailed(
            employee.userId, 
            startDateFilter, 
            endDateFilter
          );

          return {
            employeeId: employee.employeeId,
            employeeName: employee.user.name,
            employeeCpf: employee.user.cpf,
            department: employee.department,
            position: employee.position,
            costCenter: employee.costCenter,
            client: employee.client,
            hireDate: employee.hireDate,
            actualStartDate: startDateFilter,
            totalWorkedHours: detailedResult.days.reduce((acc, d) => acc + (d.workedHours || 0), 0),
            totalExpectedHours: detailedResult.days.reduce((acc, d) => acc + (d.expectedHours || 0), 0),
            bankHours: bankHoursResult.balanceHours,
            overtimeHours: bankHoursResult.totalOvertimeRaw,
            overtimeMultipliedHours: bankHoursResult.totalOvertimeHours,
            pendingHours: bankHoursResult.totalOwedHours,
            lastUpdate: new Date().toISOString()
          };
        })
      );

      // Aplicar filtro de status se especificado
      let filteredData = bankHoursData;
      if (status) {
        switch (status) {
          case 'positive':
          filteredData = bankHoursData.filter(emp => emp.bankHours > 0);
            break;
          case 'negative':
          filteredData = bankHoursData.filter(emp => emp.bankHours < 0);
            break;
          case 'zero':
          filteredData = bankHoursData.filter(emp => emp.bankHours === 0);
            break;
        }
      }

      res.json({
        success: true,
        data: filteredData,
        total: filteredData.length,
        period: {
          startDate: startDateFilter,
          endDate: endDateFilter
        }
      });

    } catch (error) {
      console.error('Erro ao buscar banco de horas:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      });
    }
  }
}
