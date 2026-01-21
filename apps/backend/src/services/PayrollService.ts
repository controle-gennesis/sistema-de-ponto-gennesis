import { PrismaClient } from '@prisma/client';
import moment from 'moment';
import { HoursExtrasService } from './HoursExtrasService';

const prisma = new PrismaClient();
const hoursExtrasService = new HoursExtrasService();

// Função para calcular a alocação final baseada no centro de custo mais frequente
async function calculateAlocacaoFinal(employeeId: string, month: number, year: number, fallbackCostCenter?: string | null): Promise<string | null> {
  try {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    // Buscar todos os pontos do funcionário no mês
    const timeRecords = await prisma.timeRecord.findMany({
      where: {
        employeeId,
        timestamp: {
          gte: startDate,
          lte: endDate
        },
        costCenter: {
          not: null
        }
      },
      select: {
        costCenter: true
      }
    });

    if (timeRecords.length === 0) {
      // Se não tem pontos, usar o centro de custo cadastrado no funcionário
      return fallbackCostCenter || null;
    }

    // Contar frequência de cada centro de custo
    const costCenterCount: { [key: string]: number } = {};
    timeRecords.forEach(record => {
      if (record.costCenter) {
        costCenterCount[record.costCenter] = (costCenterCount[record.costCenter] || 0) + 1;
      }
    });

    // Encontrar o centro de custo mais frequente
    let mostFrequentCostCenter = null;
    let maxCount = 0;

    for (const [costCenter, count] of Object.entries(costCenterCount)) {
      if (count > maxCount) {
        maxCount = count;
        mostFrequentCostCenter = costCenter;
      }
    }

    return mostFrequentCostCenter;
  } catch (error) {
    console.error('Erro ao calcular alocação final:', error);
    return fallbackCostCenter || null;
  }
}

export interface PayrollEmployee {
  id: string;
  name: string;
  position: string;
  department: string;
  employeeId: string;
  company: string | null;
  polo: string | null;
  categoriaFinanceira: string | null;
  costCenter: string | null;
  client: string | null;
  alocacaoFinal: string | null; // Centro de custo mais frequente nos pontos
  cpf: string;
  bank: string | null;
  accountType: string | null;
  agency: string | null;
  operation: string | null;
  account: string | null;
  digit: string | null;
  pixKeyType: string | null;
  pixKey: string | null;
  modality: string | null;
  familySalary: number;
  dangerPay: number;
  unhealthyPay: number;
  salary: number;
  dailyFoodVoucher: number;
  dailyTransportVoucher: number;
  totalFoodVoucher: number;
  totalTransportVoucher: number;
  totalAdjustments: number;
  totalDiscounts: number;
  daysWorked: number;
  totalWorkingDays: number;
  // Horas Extras
  he50Hours: number;
  he50Value: number;
  he100Hours: number;
  he100Value: number;
  hourlyRate: number;
  // Férias
  vacationDays: number;
  baseInssFerias: number;
  inssFerias: number;
  // Valores Manuais
  inssRescisao: number;
  inss13: number;
  descontoPorFaltas?: number;
  dsrPorFalta?: number;
  horasExtrasValue?: number;
  dsrHEValue?: number;
  // FGTS
  fgts: number;
  fgtsFerias: number;
  fgtsTotal: number;
  // INSS Total
  inssTotal: number;
  // IRRF
  irrfMensal: number;
  irrfFerias: number;
  irrfTotal: number;
}

export interface MonthlyPayrollData {
  employees: PayrollEmployee[];
  period: {
    month: number;
    year: number;
    monthName: string;
  };
  totals: {
    totalEmployees: number;
    totalFoodVoucher: number;
    totalTransportVoucher: number;
    totalAdjustments: number;
    totalDiscounts: number;
  };
}

export interface PayrollFilters {
  search?: string;
  company?: string;
  department?: string;
  position?: string;
  costCenter?: string;
  client?: string;
  modality?: string;
  bank?: string;
  accountType?: string;
  polo?: string;
  month: number;
  year: number;
  forAllocation?: boolean; // Se true, filtra funcionários que não batem ponto (para relatório de alocação)
}

export class PayrollService {
  /**
   * Calcula os totais mensais de VA e VT para um funcionário
   */
  private async calculateMonthlyTotals(employeeId: string, month: number, year: number, controlStartDate?: Date) {
    // Buscar dados do funcionário para verificar se precisa bater ponto
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: {
        requiresTimeClock: true,
        dailyFoodVoucher: true,
        dailyTransportVoucher: true,
        createdAt: true // Usar createdAt para cálculos de folha
      }
    });

    // Se o funcionário não precisa bater ponto, calcular baseado nos dias úteis
    if (employee && employee.requiresTimeClock === false) {
      // Usar UTC para comparar com timestamps salvos em UTC
      const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
      // Último dia do mês: usar o primeiro dia do próximo mês e subtrair 1 dia
      const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
      const endDate = new Date(Date.UTC(year, month - 1, lastDay, 23, 59, 59));
      
      // Buscar faltas registradas manualmente no período (também para quem não bate ponto)
      // Faltas registradas manualmente sempre têm approvedBy preenchido
      const absences = await prisma.timeRecord.findMany({
        where: {
          employeeId,
          timestamp: {
            gte: startDate,
            lte: endDate
          },
          type: 'ABSENCE_JUSTIFIED',
          approvedBy: { not: null }
        }
      });
      
      // Para funcionários que não batem ponto, calcular folha completa do mês
      // (não usar createdAt, usar início do mês para funcionários antigos)
      const monthStartDate = new Date(year, month - 1, 1);
      const { daysWorked, totalWorkingDays } = await this.calculateWorkingDays(
        0, // Não há registros de ponto
        month, 
        year, 
        monthStartDate // Sempre usar início do mês para funcionários que não batem ponto
      );
      
      // Para funcionários que não batem ponto, considerar todos os dias úteis como presenças
      // MAS subtrair as faltas registradas
      const daysPresent = Math.max(0, totalWorkingDays - absences.length);
      
      // Calcular VA e VT baseado nos dias presentes (úteis menos faltas) e valores diários
      const dailyVA = Number(employee.dailyFoodVoucher || 0);
      const dailyVT = Number(employee.dailyTransportVoucher || 0);
      const totalVA = daysPresent * dailyVA;
      const totalVT = daysPresent * dailyVT;
      
      return { 
        totalVA, 
        totalVT, 
        daysWorked: daysPresent, // Dias úteis menos faltas
        totalWorkingDays,
        absences: absences.length // Retornar número de faltas para uso na folha
      };
    }

    // Para funcionários que batem ponto, usar a lógica normal
    // Usar UTC para comparar com timestamps salvos em UTC
    const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    // Último dia do mês: usar o primeiro dia do próximo mês e subtrair 1 dia
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const endDate = new Date(Date.UTC(year, month - 1, lastDay, 23, 59, 59));
    
    const timeRecords = await prisma.timeRecord.findMany({
      where: {
        employeeId,
        timestamp: {
          gte: startDate,
          lte: endDate
        },
        type: 'ENTRY' // Apenas entradas para contar dias trabalhados
      }
    });
    
    // Buscar faltas registradas manualmente no período
    // Faltas registradas manualmente sempre têm approvedBy preenchido
    const absences = await prisma.timeRecord.findMany({
      where: {
        employeeId,
        timestamp: {
          gte: startDate,
          lte: endDate
        },
        type: 'ABSENCE_JUSTIFIED',
        approvedBy: { not: null }
      }
    });
    
    const totalVA = timeRecords.reduce((sum: any, record: any) => 
      sum + (record.foodVoucherAmount || 0), 0
    );
    
    const totalVT = timeRecords.reduce((sum: any, record: any) => 
      sum + (record.transportVoucherAmount || 0), 0
    );
    
    // Calcular dias trabalhados e faltas de forma mais inteligente
    // Subtrair faltas registradas manualmente dos dias trabalhados
    const { daysWorked, totalWorkingDays } = await this.calculateWorkingDays(
      timeRecords.length, 
      month, 
      year, 
      controlStartDate
    );
    
    // Ajustar dias trabalhados subtraindo as faltas
    const adjustedDaysWorked = Math.max(0, daysWorked - absences.length);
    
    return { 
      totalVA, 
      totalVT, 
      daysWorked: adjustedDaysWorked,
      totalWorkingDays,
      absences: absences.length // Retornar número de faltas para uso na folha
    };
  }

  /**
   * Calcula dias trabalhados e faltas de forma inteligente
   */
  private async calculateWorkingDays(daysWorked: number, month: number, year: number, controlStartDate?: Date) {
    const today = new Date();
    const currentMonth = today.getMonth() + 1;
    const currentYear = today.getFullYear();
    
    // Se for o mês atual, só contar até hoje
    const endDay = (month === currentMonth && year === currentYear) 
      ? today.getDate() 
      : new Date(year, month, 0).getDate();
    
    // Data de início: createdAt (data de criação no sistema) ou início do mês
    const startDay = controlStartDate && controlStartDate.getMonth() + 1 === month && controlStartDate.getFullYear() === year
      ? controlStartDate.getDate()
      : 1;
    
    // Buscar feriados ativos no mês para desconsiderar da contagem de dias úteis
    const startDateRange = new Date(year, month - 1, startDay);
    const endDateRange = new Date(year, month - 1, endDay, 23, 59, 59);
    const holidays = await prisma.holiday.findMany({
      where: {
        isActive: true,
        date: {
          gte: startDateRange,
          lte: endDateRange
        }
      }
    });
    const holidaySet = new Set(
      holidays.map((h) => {
        const d = new Date(h.date);
        // Usar UTC para evitar problemas de timezone
        const yyyy = d.getUTCFullYear();
        const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(d.getUTCDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
      })
    );
    
    let totalWorkingDays = 0;
    
    // Contar apenas dias úteis (segunda a sexta) no período
    for (let day = startDay; day <= endDay; day++) {
      const date = new Date(year, month - 1, day);
      const dayOfWeek = date.getDay(); // 0 = domingo, 1 = segunda, ..., 6 = sábado
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      
      // Contar apenas dias úteis (1-5 = segunda a sexta), excluindo sábados, domingos e feriados
      if (dayOfWeek >= 1 && dayOfWeek <= 5 && !holidaySet.has(dateKey)) {
        totalWorkingDays++;
      }
    }
    
    return {
      daysWorked,
      totalWorkingDays
    };
  }

  /**
   * Calcula o total de acréscimos salariais para um funcionário no período
   */
  private async calculateMonthlyAdjustments(employeeId: string, month: number, year: number): Promise<number> {
    // Acréscimos fixos (sempre aplicados)
    const fixedAdjustments = await prisma.salaryAdjustment.findMany({
      where: {
        employeeId,
        isFixed: true
      }
    });

    // Acréscimos não fixos (apenas do mês específico)
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    
    const nonFixedAdjustments = await prisma.salaryAdjustment.findMany({
      where: {
        employeeId,
        isFixed: false,
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      }
    });

    const totalFixed = fixedAdjustments.reduce((sum: any, adjustment: any) => 
      sum + Number(adjustment.amount), 0
    );

    const totalNonFixed = nonFixedAdjustments.reduce((sum: any, adjustment: any) => 
      sum + Number(adjustment.amount), 0
    );
    
    return totalFixed + totalNonFixed;
  }

  /**
   * Calcula o total de descontos salariais para um funcionário no período
   */
  private async calculateMonthlyDiscounts(employeeId: string, month: number, year: number): Promise<number> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    
    const discounts = await prisma.salaryDiscount.findMany({
      where: {
        employeeId,
        createdAt: {
          gte: startDate,
          lte: endDate
        }
      }
    });
    
    return discounts.reduce((sum: any, discount: any) => 
      sum + Number(discount.amount), 0
    );
  }

  /**
   * Verifica se o funcionário estava ativo no período selecionado
   */
  private async isEmployeeActiveInPeriod(employeeId: string, month: number, year: number): Promise<boolean> {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      select: { createdAt: true } // Usar createdAt para verificar se está ativo no período
    });

    if (!employee) return false;

    // Funcionário deve ter sido criado no sistema antes ou durante o período
    return employee.createdAt <= endDate;
  }

  /**
   * Gera folha de pagamento mensal
   */
  async generateMonthlyPayroll(filters: PayrollFilters): Promise<MonthlyPayrollData> {
    const { search, company, department, position, costCenter, client, modality, bank, accountType, polo, month, year, forAllocation } = filters;

    // Validar período
    const currentDate = new Date();
    const selectedDate = new Date(year, month - 1, 1);
    
    if (selectedDate > currentDate) {
      throw new Error('Não é possível gerar folha para períodos futuros');
    }

    // Construir filtros de busca
    const where: any = {
      user: {
        isActive: true
      }
    };

    // Construir busca considerando CPF sem formatação
    let searchNumbers = '';
    let shouldFilterManually = false;
    
    if (search) {
      searchNumbers = search.replace(/\D/g, ''); // Remove tudo que não é número
      // Se o termo de busca contém números, vamos filtrar manualmente para considerar CPF sem formatação
      shouldFilterManually = searchNumbers.length > 0;
      
      if (!shouldFilterManually) {
        // Se não tem números, usar busca normal do Prisma
        where.OR = [
          { user: { name: { contains: search, mode: 'insensitive' } } },
          { user: { cpf: { contains: search, mode: 'insensitive' } } },
          { user: { email: { contains: search, mode: 'insensitive' } } },
          { employeeId: { contains: search, mode: 'insensitive' } },
          { department: { contains: search, mode: 'insensitive' } },
          { position: { contains: search, mode: 'insensitive' } },
          { company: { contains: search, mode: 'insensitive' } },
          { costCenter: { contains: search, mode: 'insensitive' } },
          { client: { contains: search, mode: 'insensitive' } },
          { modality: { contains: search, mode: 'insensitive' } },
          { bank: { contains: search, mode: 'insensitive' } },
          { accountType: { contains: search, mode: 'insensitive' } },
          { agency: { contains: search, mode: 'insensitive' } },
          { account: { contains: search, mode: 'insensitive' } },
          { pixKeyType: { contains: search, mode: 'insensitive' } },
          { pixKey: { contains: search, mode: 'insensitive' } }
        ];
      }
    }

    if (company) {
      where.company = { contains: company, mode: 'insensitive' };
    }

    if (department) {
      where.department = { contains: department, mode: 'insensitive' };
    }

    if (position) {
      // Combinar filtro de position com exclusão de administradores
      where.position = { 
        AND: [
          { contains: position, mode: 'insensitive' },
          { not: 'Administrador' }
        ]
      };
    } else {
      // Se não houver filtro de position, apenas excluir administradores
      where.position = { not: 'Administrador' };
    }

    if (costCenter) {
      where.costCenter = { contains: costCenter, mode: 'insensitive' };
    }

    if (client) {
      where.client = { contains: client, mode: 'insensitive' };
    }

    if (modality) {
      where.modality = { contains: modality, mode: 'insensitive' };
    }

    if (bank) {
      where.bank = { contains: bank, mode: 'insensitive' };
    }

    if (accountType) {
      where.accountType = { contains: accountType, mode: 'insensitive' };
    }

    if (polo) {
      where.polo = { contains: polo, mode: 'insensitive' };
    }

    // Adicionar filtro para funcionários que precisam bater ponto (apenas para relatório de alocação)
    // Nota: Para folha de pagamento (forAllocation = false ou undefined), não filtramos por requiresTimeClock
    // Mas para alocação (forAllocation = true), precisamos filtrar porque a alocação depende de registros de ponto
    if (forAllocation) {
      where.requiresTimeClock = true;
    }

    // Construir where clause para busca manual (aplicar filtros específicos)
    let manualWhere: any = {
      user: {
        isActive: true
      },
      // Excluir administradores da folha de pagamento
      position: { not: 'Administrador' }
    };
    
    if (company) manualWhere.company = { contains: company, mode: 'insensitive' };
    if (department) manualWhere.department = { contains: department, mode: 'insensitive' };
    if (position) {
      // Combinar filtro de position com exclusão de administradores
      manualWhere.position = { 
        AND: [
          { contains: position, mode: 'insensitive' },
          { not: 'Administrador' }
        ]
      };
    }
    if (costCenter) manualWhere.costCenter = { contains: costCenter, mode: 'insensitive' };
    if (client) manualWhere.client = { contains: client, mode: 'insensitive' };
    if (modality) manualWhere.modality = { contains: modality, mode: 'insensitive' };
    if (bank) manualWhere.bank = { contains: bank, mode: 'insensitive' };
    if (accountType) manualWhere.accountType = { contains: accountType, mode: 'insensitive' };
    if (polo) manualWhere.polo = { contains: polo, mode: 'insensitive' };
    // Adicionar filtro para funcionários que precisam bater ponto (apenas para relatório de alocação)
    if (forAllocation) {
      manualWhere.requiresTimeClock = true;
    }

    // Buscar funcionários
    let employees = await prisma.employee.findMany({
      where: shouldFilterManually ? manualWhere : where,
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

    // Filtrar manualmente se necessário (quando há números na busca)
    if (shouldFilterManually && search) {
      const searchLower = search.toLowerCase();
      employees = employees.filter((employee: any) => {
        // Verificar CPF sem formatação
        if (employee.user?.cpf) {
          const employeeCpfNumbers = employee.user.cpf.replace(/\D/g, '');
          if (employeeCpfNumbers.includes(searchNumbers)) {
            return true;
          }
        }
        
        // Verificar outros campos
        return (
          employee.user?.name?.toLowerCase().includes(searchLower) ||
          employee.user?.email?.toLowerCase().includes(searchLower) ||
          employee.employeeId?.toLowerCase().includes(searchLower) ||
          employee.department?.toLowerCase().includes(searchLower) ||
          employee.position?.toLowerCase().includes(searchLower) ||
          employee.company?.toLowerCase().includes(searchLower) ||
          employee.costCenter?.toLowerCase().includes(searchLower) ||
          employee.client?.toLowerCase().includes(searchLower) ||
          employee.modality?.toLowerCase().includes(searchLower) ||
          employee.bank?.toLowerCase().includes(searchLower) ||
          employee.accountType?.toLowerCase().includes(searchLower) ||
          employee.agency?.toLowerCase().includes(searchLower) ||
          employee.account?.toLowerCase().includes(searchLower) ||
          employee.pixKeyType?.toLowerCase().includes(searchLower) ||
          employee.pixKey?.toLowerCase().includes(searchLower)
        );
      });
      
      // Reordenar por nome
      employees.sort((a: any, b: any) => {
        const nameA = a.user?.name || '';
        const nameB = b.user?.name || '';
        return nameA.localeCompare(nameB);
      });
    }

    // Nota: O filtro de requiresTimeClock já foi aplicado na query do Prisma acima
    // Então não precisamos filtrar novamente aqui

    // Calcular totais para cada funcionário e filtrar apenas os ativos no período
    const employeesWithTotals = await Promise.all(
      employees.map(async (employee: any) => {
        try {
          // Excluir administradores da folha de pagamento
          if (employee.position === 'Administrador') {
            return null; // Administrador não deve aparecer na folha
          }
          
          // Verificar se o funcionário estava ativo no período
          const isActiveInPeriod = await this.isEmployeeActiveInPeriod(employee.id, month, year);
          
          if (!isActiveInPeriod) {
            return null; // Funcionário não estava ativo no período
          }

        // Usar createdAt (data de criação no sistema) para cálculos de folha
        const employeeControlDate = employee.createdAt ? new Date(employee.createdAt) : employee.hireDate ? new Date(employee.hireDate) : undefined;
        const totals = await this.calculateMonthlyTotals(employee.id, month, year, employeeControlDate);
        const totalAdjustments = await this.calculateMonthlyAdjustments(employee.id, month, year);
        const totalDiscounts = await this.calculateMonthlyDiscounts(employee.id, month, year);
        const alocacaoFinal = await calculateAlocacaoFinal(employee.id, month, year, employee.costCenter);
        
        // Calcular horas extras
        const hoursExtras = await hoursExtrasService.calculateHoursExtrasForMonth(
          employee.userId, 
          year, 
          month, 
          Number(employee.salary),
          Number(employee.dangerPay || 0),
          Number(employee.unhealthyPay || 0)
        );

        // Calcular variáveis necessárias para BASE INSS MENSAL
        const salarioBase = Number(employee.salary);
        const periculosidade = Number(employee.dangerPay || 0);
        const insalubridade = Number(employee.unhealthyPay || 0);
        const salarioFamilia = Number(employee.familySalary || 0);
        // Calcular faltas: usar o número de faltas retornado ou calcular pela diferença
        const faltas = totals.absences !== undefined ? totals.absences : (totals.totalWorkingDays ? (totals.totalWorkingDays - totals.daysWorked) : 0);
        
        // Buscar datas das faltas para cálculo correto de DSR
        const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
        const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
        const endDate = new Date(Date.UTC(year, month - 1, lastDay, 23, 59, 59));
        
        const absenceRecords = await prisma.timeRecord.findMany({
          where: {
            employeeId: employee.id,
            timestamp: {
              gte: startDate,
              lte: endDate
            },
            type: 'ABSENCE_JUSTIFIED',
            approvedBy: { not: null }
          },
          select: {
            timestamp: true
          }
        });
        
        const absenceDates = absenceRecords.map(record => new Date(record.timestamp));
        
        // Buscar feriados do mês
        const holidays = await prisma.holiday.findMany({
          where: {
            date: {
              gte: startDate,
              lte: endDate
            },
            isActive: true
          }
        });
        
        // Calcular número de dias do mês
        const diasDoMes = new Date(year, month, 0).getDate();
        // Calcular dias para desconto (30 ou 31 se for mês de criação no sistema)
        let diasParaDesconto = 30;
        const employeeControlDateForDiscount = employee.createdAt ? new Date(employee.createdAt) : employee.hireDate ? new Date(employee.hireDate) : null;
        if (employeeControlDateForDiscount) {
          const mesCriacao = employeeControlDateForDiscount.getMonth() + 1;
          const anoCriacao = employeeControlDateForDiscount.getFullYear();
          if (month === mesCriacao && year === anoCriacao) {
            const diasMesCriacao = new Date(anoCriacao, mesCriacao, 0).getDate();
            if (diasMesCriacao === 31) {
              diasParaDesconto = 31;
            }
          }
        }
        
        // Evitar divisão por zero
        const descontoPorFaltas = diasParaDesconto > 0 ? ((salarioBase + periculosidade + insalubridade) / diasParaDesconto) * faltas : 0;
        
        // Calcular DSR por faltas considerando feriados por semana
        const dsrPorFalta = this.calculateDSRPorFaltas(salarioBase, faltas, holidays, absenceDates);
        
        // Calcular DSR H.E
        const totalHorasExtras = hoursExtras.he50Hours + hoursExtras.he100Hours;
        const diasUteis = totals.totalWorkingDays || 0;
        const diasNaoUteis = diasDoMes - diasUteis;
        const dsrHE = diasUteis > 0 ? (totalHorasExtras / diasUteis) * diasNaoUteis : 0;
        
        // Calcular valor do DSR H.E considerando as diferentes taxas
        // hoursExtras.he50Hours e hoursExtras.he100Hours já vêm multiplicados do HoursExtrasService
        const valorDSRHE = diasUteis > 0 ? 
          ((hoursExtras.he50Hours / diasUteis) * diasNaoUteis * hoursExtras.hourlyRate) +  // DSR sobre HE 50% (já multiplicado)
          ((hoursExtras.he100Hours / diasUteis) * diasNaoUteis * hoursExtras.hourlyRate)   // DSR sobre HE 100% (já multiplicado)
          : 0;
        
        // Calcular BASE INSS MENSAL
        const valorHorasExtras = hoursExtras.he50Value + hoursExtras.he100Value;
        const baseInssMensal = employee.modality === 'MEI' || employee.modality === 'ESTAGIÁRIO' 
          ? 0 
          : Math.max(0, (salarioBase + periculosidade + insalubridade + valorHorasExtras + valorDSRHE) - descontoPorFaltas - dsrPorFalta);
        
        const { vacationDays, baseInssFerias, inssFerias } = await this.calculateBaseInssFerias(employee.id, month, year, baseInssMensal);
        
        // Buscar valores manuais de INSS
        const manualInss = await prisma.manualInssValue.findUnique({
          where: {
            employeeId_month_year: {
              employeeId: employee.id,
              month: month,
              year: year
            }
          }
        });
        
        // Usar valores manuais de descontoPorFaltas e dsrPorFalta se existirem
        const descontoPorFaltasFinal = manualInss?.descontoPorFaltas !== null && manualInss?.descontoPorFaltas !== undefined
          ? Number(manualInss.descontoPorFaltas)
          : descontoPorFaltas;
        
        const dsrPorFaltaFinal = manualInss?.dsrPorFalta !== null && manualInss?.dsrPorFalta !== undefined
          ? Number(manualInss.dsrPorFalta)
          : dsrPorFalta;
        
        // Calcular FGTS: 8% sobre a base de cálculo (mesma base do INSS)
        const baseFGTS = employee.modality === 'MEI' || employee.modality === 'ESTAGIÁRIO' 
          ? 0 
          : Math.max(0, (salarioBase + periculosidade + insalubridade + valorHorasExtras + valorDSRHE) - descontoPorFaltas - dsrPorFalta);
        const fgts = baseFGTS * 0.08; // 8% de alíquota
        
        // Calcular FGTS Férias: 8% sobre a base INSS Férias
        const fgtsFerias = employee.modality === 'MEI' || employee.modality === 'ESTAGIÁRIO' 
          ? 0 
          : baseInssFerias * 0.08; // 8% sobre a base de férias
        
        // Calcular FGTS Total: Soma FGTS + FGTS Férias
        const fgtsTotal = fgts + fgtsFerias;
        
        // Calcular INSS Mensal sobre a base
        const inssMensal = this.calculateINSS(baseInssMensal);
        
        // Calcular INSS Total: INSS Mensal + Base INSS Férias + INSS Férias + INSS Rescisão
        const inssRescisaoValue = manualInss ? Number(manualInss.inssRescisao) : 0;
        const inssTotal = inssMensal + baseInssFerias + inssFerias + inssRescisaoValue;
        
        // Calcular Base IRRF: Salário Bruto (com salário família) - valor fixo de 607,20
        const salarioBruto = salarioBase + periculosidade + insalubridade + salarioFamilia;
        const baseIRRF = employee.modality === 'MEI' || employee.modality === 'ESTAGIÁRIO' 
          ? 0 
          : salarioBruto - 607.20;
        
        // Calcular IRRF Mensal
        const irrfMensal = this.calculateIRRF(baseIRRF);
        
        // Calcular Base IRRF Férias: (Salário Bruto + 1/3 Férias) - valor fixo de 607,20
        const baseIRRFFerias = employee.modality === 'MEI' || employee.modality === 'ESTAGIÁRIO' 
          ? 0 
          : (salarioBruto + baseInssFerias) - 607.20;
        
        // Calcular IRRF Férias
        const irrfFerias = this.calculateIRRF(baseIRRFFerias);
        
        // Calcular IRRF Total: Soma IRRF Mensal + IRRF Férias
        const irrfTotal = irrfMensal + irrfFerias;
        
        // Verificar se employee.user existe para evitar erros
        if (!employee.user) {
          console.error(`Funcionário ${employee.id} não tem usuário associado`);
          return null;
        }

        return {
          id: employee.id,
          name: employee.user.name,
          position: employee.position,
          department: employee.department,
          employeeId: employee.employeeId,
          company: employee.company,
          polo: employee.polo,
          categoriaFinanceira: employee.categoriaFinanceira,
          costCenter: employee.costCenter,
          client: employee.client,
          alocacaoFinal: alocacaoFinal,
          cpf: employee.user.cpf,
          bank: employee.bank,
          accountType: employee.accountType,
          agency: employee.agency,
          operation: employee.operation,
          account: employee.account,
          digit: employee.digit,
          pixKeyType: employee.pixKeyType,
          pixKey: employee.pixKey,
          modality: employee.modality,
          familySalary: Number(employee.familySalary || 0),
          dangerPay: Number(employee.dangerPay || 0),
          unhealthyPay: Number(employee.unhealthyPay || 0),
          salary: Number(employee.salary),
          dailyFoodVoucher: employee.dailyFoodVoucher || 0,
          dailyTransportVoucher: employee.dailyTransportVoucher || 0,
          totalFoodVoucher: totals.totalVA,
          totalTransportVoucher: totals.totalVT,
          totalAdjustments,
          totalDiscounts,
          daysWorked: totals.daysWorked,
          totalWorkingDays: totals.totalWorkingDays,
          // Horas Extras
          he50Hours: hoursExtras.he50Hours,
          he50Value: hoursExtras.he50Value,
          he100Hours: hoursExtras.he100Hours,
          he100Value: hoursExtras.he100Value,
          hourlyRate: hoursExtras.hourlyRate,
          // Férias
          vacationDays,
          baseInssFerias,
          inssFerias,
          // Valores Manuais
          inssRescisao: manualInss ? Number(manualInss.inssRescisao) : 0,
          inss13: manualInss ? Number(manualInss.inss13) : 0,
          descontoPorFaltas: descontoPorFaltasFinal,
          dsrPorFalta: dsrPorFaltaFinal,
          // FGTS
          fgts,
          fgtsFerias,
          fgtsTotal,
          // INSS Total
          inssTotal,
          // IRRF
          irrfMensal,
          irrfFerias,
          irrfTotal
        } as PayrollEmployee;
        } catch (error) {
          console.error(`Erro ao processar funcionário ${employee.id}:`, error);
          return null; // Retornar null em caso de erro para não quebrar toda a folha
        }
      })
    );

    // Filtrar funcionários nulos (que não estavam ativos no período)
    const activeEmployees = employeesWithTotals.filter(emp => emp !== null) as PayrollEmployee[];

    // Calcular totais gerais apenas dos funcionários ativos
    const totalFoodVoucher = activeEmployees.reduce(
      (sum, emp) => sum + emp.totalFoodVoucher, 0
    );
    
    const totalTransportVoucher = activeEmployees.reduce(
      (sum, emp) => sum + emp.totalTransportVoucher, 0
    );

    const totalAdjustments = activeEmployees.reduce(
      (sum, emp) => sum + emp.totalAdjustments, 0
    );

    const totalDiscounts = activeEmployees.reduce(
      (sum, emp) => sum + emp.totalDiscounts, 0
    );

    // Nome do mês em português
    const monthNames = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
    ];

    return {
      employees: activeEmployees,
      period: {
        month,
        year,
        monthName: monthNames[month - 1]
      },
      totals: {
        totalEmployees: activeEmployees.length,
        totalFoodVoucher,
        totalTransportVoucher,
        totalAdjustments,
        totalDiscounts
      }
    };
  }

  /**
   * Calcula DSR por faltas considerando feriados por semana
   * Nova lógica: Se faltar em uma semana que tem feriado, perde 1 DSR pela falta + 1 DSR por cada feriado daquela semana
   */
  private calculateDSRPorFaltas(
    salarioBase: number,
    faltas: number,
    holidays: any[],
    absenceDates: Date[]
  ): number {
    if (faltas <= 0) return 0;

    // Filtrar apenas feriados úteis (segunda a sábado)
    const feriadosUteis = holidays.filter((holiday: any) => {
      const holidayDate = new Date(holiday.date);
      const dayOfWeek = holidayDate.getDay();
      return dayOfWeek >= 1 && dayOfWeek <= 6; // Segunda a sábado
    });

    // Função para obter o início da semana (domingo) de uma data
    const getWeekStart = (date: Date): Date => {
      const dateCopy = new Date(date);
      const dayOfWeek = dateCopy.getDay();
      const weekStart = new Date(dateCopy);
      weekStart.setDate(dateCopy.getDate() - dayOfWeek);
      weekStart.setHours(0, 0, 0, 0);
      return weekStart;
    };

    // Se temos as datas das faltas, calcular DSR por semana com falta
    if (absenceDates.length > 0 && absenceDates.length === faltas) {
      // Agrupar faltas por semana
      const semanasComFaltas = new Map<string, number>(); // semana -> quantidade de faltas
      absenceDates.forEach((absenceDate: Date) => {
        const weekStart = getWeekStart(absenceDate);
        const weekKey = weekStart.toISOString();
        semanasComFaltas.set(weekKey, (semanasComFaltas.get(weekKey) || 0) + 1);
      });

      let totalDSR = 0;

      // Para cada semana com falta, calcular DSR
      semanasComFaltas.forEach((numFaltasNaSemana, weekKey) => {
        const weekStart = new Date(weekKey);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6); // Fim da semana (sábado)

        // Contar quantos feriados estão nesta semana específica
        const feriadosNaSemana = feriadosUteis.filter((holiday: any) => {
          const holidayDate = new Date(holiday.date);
          return holidayDate >= weekStart && holidayDate <= weekEnd;
        }).length;

        // DSR = 1 pela semana (independente de quantas faltas) + 1 por cada feriado da semana
        // Exemplo: 2 faltas na mesma semana + 1 feriado = 1 DSR (semana) + 1 DSR (feriado) = 2 DSR
        // Exemplo: 1 falta semana 1 (com 1 feriado) + 1 falta semana 2 = 1 DSR (semana 1) + 1 DSR (feriado semana 1) + 1 DSR (semana 2) = 3 DSR
        const dsrDaSemana = 1 + feriadosNaSemana;
        totalDSR += dsrDaSemana;
      });

      return (salarioBase / 30) * totalDSR;
    } else {
      // Fallback: se não temos as datas exatas, assumir que estão em semanas diferentes
      // Contar todos os feriados do mês
      const quantidadeFeriados = feriadosUteis.length;
      // 1 DSR por falta + 1 DSR por cada feriado (assumindo que pode estar na mesma semana)
      const totalDSR = faltas + quantidadeFeriados;
      return (salarioBase / 30) * totalDSR;
    }
  }

  /**
   * Calcula o INSS usando a tabela progressiva
   */
  private calculateINSS(baseINSS: number): number {
    if (baseINSS <= 0) return 0;
    
    if (baseINSS <= 1518) {
      return baseINSS * 0.075; // 7,5%
    } else if (baseINSS <= 2793) {
      return (1518 * 0.075) + ((baseINSS - 1518) * 0.09); // 7,5% até 1518 + 9% do excedente
    } else if (baseINSS <= 4190) {
      return (1518 * 0.075) + ((2793 - 1518) * 0.09) + ((baseINSS - 2793) * 0.12); // 7,5% até 1518 + 9% até 2793 + 12% do excedente
    } else if (baseINSS <= 8157) {
      return (1518 * 0.075) + ((2793 - 1518) * 0.09) + ((4190 - 2793) * 0.12) + ((baseINSS - 4190) * 0.14); // 7,5% até 1518 + 9% até 2793 + 12% até 4190 + 14% do excedente
    } else {
      return (1518 * 0.075) + ((2793 - 1518) * 0.09) + ((4190 - 2793) * 0.12) + ((8157 - 4190) * 0.14); // Teto máximo
    }
  }

  /**
   * Calcula o IRRF Mensal baseado na tabela progressiva atualizada
   */
  private calculateIRRF(baseIRRF: number): number {
    if (baseIRRF <= 0) return 0;
    
    // Aplicar tabela progressiva do IRRF atualizada
    if (baseIRRF <= 2428.80) {
      return 0; // Isento
    } else if (baseIRRF <= 2826.65) {
      return (baseIRRF * 0.075) - 182.16; // 7,5% - parcela a deduzir
    } else if (baseIRRF <= 3751.05) {
      return (baseIRRF * 0.15) - 394.16; // 15% - parcela a deduzir
    } else if (baseIRRF <= 4664.68) {
      return (baseIRRF * 0.225) - 675.49; // 22,5% - parcela a deduzir
    } else {
      return (baseIRRF * 0.275) - 908.73; // 27,5% - parcela a deduzir
    }
  }

  /**
   * Calcula a BASE INSS FÉRIAS e INSS FÉRIAS para um funcionário
   */
  private async calculateBaseInssFerias(employeeId: string, month: number, year: number, baseInssMensal: number): Promise<{ vacationDays: number; baseInssFerias: number; inssFerias: number }> {
    try {
      // Buscar férias do funcionário no mês especificado
      const startDate = new Date(year, month - 1, 1);
      const endDate = new Date(year, month, 0, 23, 59, 59);

      const vacations = await prisma.vacation.findMany({
        where: {
          employeeId,
          startDate: {
            lte: endDate
          },
          endDate: {
            gte: startDate
          },
          status: 'APPROVED' // Apenas férias aprovadas
        }
      });

      // Calcular total de dias de férias no mês
      let totalVacationDays = 0;
      for (const vacation of vacations) {
        const vacationStart = new Date(vacation.startDate);
        const vacationEnd = new Date(vacation.endDate);
        
        // Calcular interseção com o mês
        const monthStart = new Date(year, month - 1, 1);
        const monthEnd = new Date(year, month, 0);
        
        const intersectionStart = new Date(Math.max(vacationStart.getTime(), monthStart.getTime()));
        const intersectionEnd = new Date(Math.min(vacationEnd.getTime(), monthEnd.getTime()));
        
        if (intersectionStart <= intersectionEnd) {
          const daysDiff = Math.ceil((intersectionEnd.getTime() - intersectionStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          totalVacationDays += daysDiff;
        }
      }

      // Buscar dados do funcionário para calcular a base
      const employee = await prisma.employee.findUnique({
        where: { id: employeeId },
        include: { user: true }
      });

      if (!employee) {
        return { vacationDays: 0, baseInssFerias: 0, inssFerias: 0 };
      }

      // Calcular BASE INSS FÉRIAS e INSS FÉRIAS
      let baseInssFerias = 0;
      let inssFerias = 0;
      
      if (employee.modality !== 'MEI' && employee.modality !== 'ESTÁGIO' && totalVacationDays > 0) {
        const salarioBase = Number(employee.salary);
        const periculosidade = Number(employee.dangerPay || 0);
        const insalubridade = Number(employee.unhealthyPay || 0);
        
        const remuneracaoBase = salarioBase + periculosidade + insalubridade;
        const salarioProporcional = remuneracaoBase * (totalVacationDays / 30);
        const tercoFerias = salarioProporcional / 3;
        
        baseInssFerias = salarioProporcional + tercoFerias;
        
        // Calcular INSS FÉRIAS: INSS(Total) - INSS(Mensal)
        const baseInssTotal = baseInssMensal + baseInssFerias;
        const inssTotal = this.calculateINSS(baseInssTotal);
        const inssMensal = this.calculateINSS(baseInssMensal);
        
        inssFerias = Math.max(0, inssTotal - inssMensal);
      }

      return { vacationDays: totalVacationDays, baseInssFerias, inssFerias };
    } catch (error) {
      console.error('Erro ao calcular BASE INSS FÉRIAS:', error);
      return { vacationDays: 0, baseInssFerias: 0, inssFerias: 0 };
    }
  }

  /**
   * Obtém dados de um funcionário específico para folha
   */
  async getEmployeePayrollData(employeeId: string, month: number, year: number): Promise<PayrollEmployee | null> {
    try {
      const employee = await prisma.employee.findUnique({
      where: { id: employeeId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            cpf: true
          }
        }
      }
    });

    if (!employee) {
      return null;
    }

    // Excluir administradores da folha de pagamento
    if (employee.position === 'Administrador') {
      return null;
    }

    // Verificar se employee.user existe
    if (!employee.user) {
      console.error(`Funcionário ${employee.id} não tem usuário associado`);
      return null;
    }

    // Usar createdAt (data de criação no sistema) para cálculos de folha
    const employeeControlDateForPayroll = employee.createdAt ? new Date(employee.createdAt) : employee.hireDate ? new Date(employee.hireDate) : undefined;
    const totals = await this.calculateMonthlyTotals(employee.id, month, year, employeeControlDateForPayroll);
    const totalAdjustments = await this.calculateMonthlyAdjustments(employee.id, month, year);
    const totalDiscounts = await this.calculateMonthlyDiscounts(employee.id, month, year);
    const alocacaoFinal = await calculateAlocacaoFinal(employee.id, month, year, employee.costCenter);
    
    // Calcular horas extras
    const hoursExtras = await hoursExtrasService.calculateHoursExtrasForMonth(
      employee.userId, 
      year, 
      month, 
      Number(employee.salary),
      Number(employee.dangerPay || 0),
      Number(employee.unhealthyPay || 0)
    );

    // Calcular variáveis necessárias para BASE INSS MENSAL
    const salarioBase = Number(employee.salary);
    const periculosidade = Number(employee.dangerPay || 0);
    const insalubridade = Number(employee.unhealthyPay || 0);
    const salarioFamilia = Number(employee.familySalary || 0);
    // Calcular faltas: usar o número de faltas retornado ou calcular pela diferença
    const faltas = totals.absences !== undefined ? totals.absences : (totals.totalWorkingDays ? (totals.totalWorkingDays - totals.daysWorked) : 0);
    
    // Calcular número de dias do mês para desconto de faltas
    // Usa 30 como padrão, ou 31 apenas se for o mês de criação no sistema E o mês tiver 31 dias
    let diasParaDesconto = 30; // Padrão
    const employeeControlDateForDiscount = employee.createdAt ? new Date(employee.createdAt) : employee.hireDate ? new Date(employee.hireDate) : null;
    if (employeeControlDateForDiscount) {
      const mesCriacao = employeeControlDateForDiscount.getMonth() + 1; // getMonth() retorna 0-11
      const anoCriacao = employeeControlDateForDiscount.getFullYear();
      
      // Só usa 31 dias se for o mês de criação no sistema e o mês tiver 31 dias
      if (month === mesCriacao && year === anoCriacao) {
        const diasMesCriacao = new Date(anoCriacao, mesCriacao, 0).getDate();
        if (diasMesCriacao === 31) {
          diasParaDesconto = 31;
        }
      }
    }
    
    // Calcular número de dias do mês atual (para outros cálculos)
    const diasDoMes = new Date(year, month, 0).getDate();
    
    // Buscar valores manuais de faltas e DSR (se existirem)
    const manualInss = await prisma.manualInssValue.findUnique({
      where: {
        employeeId_month_year: {
          employeeId: employee.id,
          month: month,
          year: year
        }
      }
    });
    
    // Buscar datas das faltas para cálculo correto de DSR
    const startDate = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const endDate = new Date(Date.UTC(year, month - 1, lastDay, 23, 59, 59));
    
    const absenceRecords = await prisma.timeRecord.findMany({
      where: {
        employeeId: employee.id,
        timestamp: {
          gte: startDate,
          lte: endDate
        },
        type: 'ABSENCE_JUSTIFIED',
        approvedBy: { not: null }
      },
      select: {
        timestamp: true
      }
    });
    
    const absenceDates = absenceRecords.map(record => new Date(record.timestamp));
    
    // Buscar feriados do mês
    const holidays = await prisma.holiday.findMany({
      where: {
        date: {
          gte: startDate,
          lte: endDate
        },
        isActive: true
      }
    });
    
    // Usar valores manuais se existirem, senão calcular
    // Evitar divisão por zero
    const descontoPorFaltas = manualInss?.descontoPorFaltas !== null && manualInss?.descontoPorFaltas !== undefined
      ? Number(manualInss.descontoPorFaltas)
      : diasParaDesconto > 0 ? ((salarioBase + periculosidade + insalubridade) / diasParaDesconto) * faltas : 0;
    
    // Calcular DSR por faltas considerando feriados por semana
    const dsrPorFaltaCalculado = this.calculateDSRPorFaltas(salarioBase, faltas, holidays, absenceDates);
    const dsrPorFalta = manualInss?.dsrPorFalta !== null && manualInss?.dsrPorFalta !== undefined
      ? Number(manualInss.dsrPorFalta)
      : dsrPorFaltaCalculado;
    
    // Calcular DSR H.E
    const totalHorasExtras = hoursExtras.he50Hours + hoursExtras.he100Hours;
    const diasUteis = totals.totalWorkingDays || 0;
    const diasNaoUteis = diasDoMes - diasUteis;
    const dsrHECalculado = diasUteis > 0 ? (totalHorasExtras / diasUteis) * diasNaoUteis : 0;
    
    // Usar valor manual de DSR HE se existir, senão usar o calculado
    const dsrHE = manualInss?.dsrHEValue !== null && manualInss?.dsrHEValue !== undefined
      ? Number(manualInss.dsrHEValue)
      : dsrHECalculado;
    
    // Calcular valor do DSR H.E considerando as diferentes taxas
    // hoursExtras.he50Hours e hoursExtras.he100Hours já vêm multiplicados do HoursExtrasService
    const valorDSRHECalculado = diasUteis > 0 ? 
      ((hoursExtras.he50Hours / diasUteis) * diasNaoUteis * hoursExtras.hourlyRate) +  // DSR sobre HE 50% (já multiplicado)
      ((hoursExtras.he100Hours / diasUteis) * diasNaoUteis * hoursExtras.hourlyRate)   // DSR sobre HE 100% (já multiplicado)
      : 0;
    
    // Usar valor manual se existir, senão usar o calculado
    const valorDSRHE = manualInss?.dsrHEValue !== null && manualInss?.dsrHEValue !== undefined
      ? (Number(manualInss.dsrHEValue) * hoursExtras.hourlyRate)
      : valorDSRHECalculado;
    
    // Calcular BASE INSS MENSAL
    // Usar valor manual de horas extras se existir, senão usar o calculado
    const valorHorasExtrasCalculado = hoursExtras.he50Value + hoursExtras.he100Value;
    const valorHorasExtras = manualInss?.horasExtrasValue !== null && manualInss?.horasExtrasValue !== undefined
      ? Number(manualInss.horasExtrasValue)
      : valorHorasExtrasCalculado;
    const baseInssMensal = employee.modality === 'MEI' || employee.modality === 'ESTAGIÁRIO' 
      ? 0 
      : Math.max(0, (salarioBase + periculosidade + insalubridade + valorHorasExtras + valorDSRHE) - descontoPorFaltas - dsrPorFalta);
    
    const { vacationDays, baseInssFerias, inssFerias } = await this.calculateBaseInssFerias(employee.id, month, year, baseInssMensal);
    
    // Usar o manualInss já buscado acima

    // Calcular FGTS: 8% sobre a base de cálculo (mesma base do INSS)
    const baseFGTS = employee.modality === 'MEI' || employee.modality === 'ESTAGIÁRIO' 
      ? 0 
      : Math.max(0, (salarioBase + periculosidade + insalubridade + valorHorasExtras + valorDSRHE) - descontoPorFaltas - dsrPorFalta);
    const fgts = baseFGTS * 0.08; // 8% de alíquota
    
    // Calcular FGTS Férias: 8% sobre a base INSS Férias
    const fgtsFerias = employee.modality === 'MEI' || employee.modality === 'ESTAGIÁRIO'
      ? 0 
      : baseInssFerias * 0.08; // 8% sobre a base de férias

    // Calcular FGTS Total: Soma FGTS + FGTS Férias
    const fgtsTotal = fgts + fgtsFerias;
    
    // Calcular INSS Mensal sobre a base
    const inssMensal = this.calculateINSS(baseInssMensal);
    
    // Calcular INSS Total: INSS Mensal + Base INSS Férias + INSS Férias + INSS Rescisão
    const inssRescisaoValue = manualInss ? Number(manualInss.inssRescisao) : 0;
    const inssTotal = inssMensal + baseInssFerias + inssFerias + inssRescisaoValue;
    
    // Calcular Base IRRF: Salário Bruto (com salário família) - valor fixo de 607,20
    const salarioBruto = salarioBase + periculosidade + insalubridade + salarioFamilia;
    const baseIRRF = employee.modality === 'MEI' || employee.modality === 'ESTAGIÁRIO' 
      ? 0 
      : salarioBruto - 607.20;
    
    // Calcular IRRF Mensal
    const irrfMensal = this.calculateIRRF(baseIRRF);
    
    // Calcular Base IRRF Férias: (Salário Bruto + 1/3 Férias) - valor fixo de 607,20
    const baseIRRFFerias = employee.modality === 'MEI' || employee.modality === 'ESTAGIÁRIO' 
      ? 0 
      : (salarioBruto + baseInssFerias) - 607.20;
    
    // Calcular IRRF Férias
    const irrfFerias = this.calculateIRRF(baseIRRFFerias);
    
    // Calcular IRRF Total: Soma IRRF Mensal + IRRF Férias
    const irrfTotal = irrfMensal + irrfFerias;

    return {
      id: employee.id,
      name: employee.user.name,
      position: employee.position,
      department: employee.department,
      employeeId: employee.employeeId,
      company: employee.company,
      polo: employee.polo,
      categoriaFinanceira: employee.categoriaFinanceira,
      costCenter: employee.costCenter,
      client: employee.client,
      alocacaoFinal: alocacaoFinal,
      cpf: employee.user.cpf,
      bank: employee.bank,
      accountType: employee.accountType,
      agency: employee.agency,
      operation: employee.operation,
      account: employee.account,
      digit: employee.digit,
      pixKeyType: employee.pixKeyType,
      pixKey: employee.pixKey,
      modality: employee.modality,
      familySalary: Number(employee.familySalary || 0),
      dangerPay: Number(employee.dangerPay || 0),
      unhealthyPay: Number(employee.unhealthyPay || 0),
      salary: Number(employee.salary),
      dailyFoodVoucher: employee.dailyFoodVoucher || 0,
      dailyTransportVoucher: employee.dailyTransportVoucher || 0,
      totalFoodVoucher: totals.totalVA,
      totalTransportVoucher: totals.totalVT,
      totalAdjustments,
      totalDiscounts,
      daysWorked: totals.daysWorked,
      totalWorkingDays: totals.totalWorkingDays,
      // Horas Extras
      he50Hours: hoursExtras.he50Hours,
      he50Value: hoursExtras.he50Value,
      he100Hours: hoursExtras.he100Hours,
      he100Value: hoursExtras.he100Value,
      hourlyRate: hoursExtras.hourlyRate,
      // Férias
      vacationDays,
      baseInssFerias,
      inssFerias,
      // Valores Manuais
      inssRescisao: manualInss ? Number(manualInss.inssRescisao) : 0,
      inss13: manualInss ? Number(manualInss.inss13) : 0,
      descontoPorFaltas: manualInss?.descontoPorFaltas !== null && manualInss?.descontoPorFaltas !== undefined ? Number(manualInss.descontoPorFaltas) : undefined,
      dsrPorFalta: manualInss?.dsrPorFalta !== null && manualInss?.dsrPorFalta !== undefined ? Number(manualInss.dsrPorFalta) : undefined,
      horasExtrasValue: manualInss?.horasExtrasValue !== null && manualInss?.horasExtrasValue !== undefined ? Number(manualInss.horasExtrasValue) : undefined,
      dsrHEValue: manualInss?.dsrHEValue !== null && manualInss?.dsrHEValue !== undefined ? Number(manualInss.dsrHEValue) : undefined,
      // FGTS
      fgts,
      fgtsFerias,
      fgtsTotal,
      // INSS Total
      inssTotal,
      // IRRF
      irrfMensal,
      irrfFerias,
      irrfTotal
    };
    } catch (error: any) {
      console.error(`Erro ao obter dados de folha para funcionário ${employeeId}:`, error);
      console.error('Stack trace:', error?.stack);
      throw error; // Re-lançar o erro para que o controller possa tratá-lo
    }
  }

  /**
   * Obtém estatísticas de folha por empresa
   */
  async getPayrollStatsByCompany(month: number, year: number) {
    const payrollData = await this.generateMonthlyPayroll({ month, year });
    
    const statsByCompany = payrollData.employees.reduce((acc, employee) => {
      const company = employee.company || 'Não informado';
      
      if (!acc[company]) {
        acc[company] = {
          company,
          totalEmployees: 0,
          totalFoodVoucher: 0,
          totalTransportVoucher: 0
        };
      }
      
      acc[company].totalEmployees++;
      acc[company].totalFoodVoucher += employee.totalFoodVoucher;
      acc[company].totalTransportVoucher += employee.totalTransportVoucher;
      
      return acc;
    }, {} as Record<string, any>);

    return Object.values(statsByCompany);
  }

  /**
   * Obtém estatísticas de folha por departamento
   */
  async getPayrollStatsByDepartment(month: number, year: number) {
    const payrollData = await this.generateMonthlyPayroll({ month, year });
    
    const statsByDepartment = payrollData.employees.reduce((acc, employee) => {
      const department = employee.department;
      
      if (!acc[department]) {
        acc[department] = {
          department,
          totalEmployees: 0,
          totalFoodVoucher: 0,
          totalTransportVoucher: 0
        };
      }
      
      acc[department].totalEmployees++;
      acc[department].totalFoodVoucher += employee.totalFoodVoucher;
      acc[department].totalTransportVoucher += employee.totalTransportVoucher;
      
      return acc;
    }, {} as Record<string, any>);

    return Object.values(statsByDepartment);
  }

  /**
   * Salva valores manuais de INSS para um funcionário
   */
  async saveManualInssValues(data: {
    employeeId: string;
    month: number;
    year: number;
    inssRescisao: number;
    inss13: number;
    descontoPorFaltas?: number | null;
    dsrPorFalta?: number | null;
    horasExtrasValue?: number | null;
    dsrHEValue?: number | null;
  }) {
    const { employeeId, month, year, inssRescisao, inss13, descontoPorFaltas, dsrPorFalta, horasExtrasValue, dsrHEValue } = data;

    // Verificar se o funcionário existe
    const employee = await prisma.employee.findUnique({
      where: { id: employeeId }
    });

    if (!employee) {
      throw new Error('Funcionário não encontrado');
    }

    // Salvar ou atualizar os valores manuais
    const result = await prisma.manualInssValue.upsert({
      where: {
        employeeId_month_year: {
          employeeId: employeeId,
          month,
          year
        }
      },
      update: {
        inssRescisao,
        inss13,
        descontoPorFaltas: descontoPorFaltas !== undefined ? descontoPorFaltas : null,
        dsrPorFalta: dsrPorFalta !== undefined ? dsrPorFalta : null,
        horasExtrasValue: horasExtrasValue !== undefined ? horasExtrasValue : null,
        dsrHEValue: dsrHEValue !== undefined ? dsrHEValue : null,
        updatedAt: new Date()
      },
      create: {
        employeeId: employeeId,
        month,
        year,
        inssRescisao,
        inss13,
        descontoPorFaltas: descontoPorFaltas !== undefined ? descontoPorFaltas : null,
        dsrPorFalta: dsrPorFalta !== undefined ? dsrPorFalta : null,
        horasExtrasValue: horasExtrasValue !== undefined ? horasExtrasValue : null,
        dsrHEValue: dsrHEValue !== undefined ? dsrHEValue : null
      }
    });

    return result;
  }
}
