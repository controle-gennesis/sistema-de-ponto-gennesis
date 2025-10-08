import { PrismaClient } from '@prisma/client';
import moment from 'moment';

const prisma = new PrismaClient();

export interface HoursExtrasCalculation {
  he50Hours: number;
  he50Value: number;
  he100Hours: number;
  he100Value: number;
  hourlyRate: number;
}

export interface DayHoursExtras {
  date: Date;
  dayOfWeek: number;
  totalHours: number;
  he50Hours: number;
  he100Hours: number;
  isWeekend: boolean;
  isHoliday: boolean;
}

export class HoursExtrasService {
  /**
   * Calcula o valor da hora normal baseado no salário base + periculosidade + insalubridade
   */
  private calculateHourlyRate(baseSalary: number, dangerPay: number, unhealthyPay: number): number {
    // 220 horas por mês (jornada padrão)
    const totalSalary = baseSalary + dangerPay + unhealthyPay;
    return totalSalary / 220;
  }

  /**
   * Verifica se é feriado (implementação básica - pode ser expandida)
   */
  private isHoliday(date: Date): boolean {
    const momentDate = moment(date);
    const year = momentDate.year();
    
    // Feriados fixos
    const fixedHolidays = [
      { month: 0, day: 1 },   // 1º de Janeiro
      { month: 3, day: 21 },  // Tiradentes
      { month: 4, day: 1 },   // Dia do Trabalhador
      { month: 8, day: 7 },   // Independência
      { month: 9, day: 12 },  // Nossa Senhora Aparecida
      { month: 10, day: 2 },  // Finados
      { month: 10, day: 15 }, // Proclamação da República
      { month: 11, day: 25 }, // Natal
    ];

    return fixedHolidays.some(holiday => 
      momentDate.month() === holiday.month && momentDate.date() === holiday.day
    );
  }

  /**
   * Calcula as horas trabalhadas em um dia específico
   */
  private async calculateDayHours(userId: string, date: Date): Promise<number> {
    const startOfDay = moment(date).startOf('day').toDate();
    const endOfDay = moment(date).endOf('day').toDate();

    const records = await prisma.timeRecord.findMany({
      where: {
        userId,
        timestamp: {
          gte: startOfDay,
          lte: endOfDay
        },
        isValid: true
      },
      orderBy: { timestamp: 'asc' }
    });

    if (records.length < 2) return 0;

    let totalMinutes = 0;
    let entryTime: Date | null = null;

    for (const record of records) {
      if (record.type === 'ENTRY' || record.type === 'LUNCH_END' || record.type === 'BREAK_END') {
        entryTime = record.timestamp;
      } else if ((record.type === 'EXIT' || record.type === 'LUNCH_START' || record.type === 'BREAK_START') && entryTime) {
        const diffMinutes = moment(record.timestamp).diff(moment(entryTime), 'minutes');
        totalMinutes += diffMinutes;
        entryTime = null;
      }
    }

    return totalMinutes / 60; // Converter para horas
  }

  /**
   * Calcula horas extras 50% para um dia específico
   */
  private calculateHE50ForDay(totalHours: number, dayOfWeek: number, isHoliday: boolean): number {
    // Domingo e feriados não têm H.E 50%
    if (dayOfWeek === 0 || isHoliday) {
      return 0;
    }
    
    let expectedHours = 0;
    
    if (dayOfWeek >= 1 && dayOfWeek <= 4) {
      // Segunda a Quinta: 9h
      expectedHours = 9;
    } else if (dayOfWeek === 5) {
      // Sexta: 8h
      expectedHours = 8;
    } else if (dayOfWeek === 6) {
      // Sábado: todas as horas são extras 50%
      return totalHours;
    }

    // Retorna apenas as horas acima do esperado
    return Math.max(0, totalHours - expectedHours);
  }

  /**
   * Calcula horas extras 100% para um dia específico
   */
  private async calculateHE100ForDay(userId: string, date: Date, dayOfWeek: number): Promise<number> {
    const startOfDay = moment(date).startOf('day').toDate();
    const endOfDay = moment(date).endOf('day').toDate();

    // Domingo: todas as horas são extras 100%
    if (dayOfWeek === 0) {
      return await this.calculateDayHours(userId, date);
    }

    // Feriado: todas as horas são extras 100%
    if (this.isHoliday(date)) {
      return await this.calculateDayHours(userId, date);
    }

    // Após 22h: calcular horas após 22h
    const records = await prisma.timeRecord.findMany({
      where: {
        userId,
        timestamp: {
          gte: startOfDay,
          lte: endOfDay
        },
        isValid: true
      },
      orderBy: { timestamp: 'asc' }
    });

    let hoursAfter22h = 0;
    let entryTime: Date | null = null;

    for (const record of records) {
      const recordHour = record.timestamp.getHours();
      
      if (record.type === 'ENTRY' || record.type === 'LUNCH_END' || record.type === 'BREAK_END') {
        entryTime = record.timestamp;
      } else if ((record.type === 'EXIT' || record.type === 'LUNCH_START' || record.type === 'BREAK_START') && entryTime) {
        // Se a entrada foi antes das 22h mas a saída foi depois das 22h
        if (entryTime.getHours() < 22 && recordHour >= 22) {
          const after22hTime = new Date(entryTime);
          after22hTime.setHours(22, 0, 0, 0);
          const diffMinutes = moment(record.timestamp).diff(moment(after22hTime), 'minutes');
          hoursAfter22h += diffMinutes / 60;
        }
        // Se tanto entrada quanto saída foram após 22h
        else if (entryTime.getHours() >= 22) {
          const diffMinutes = moment(record.timestamp).diff(moment(entryTime), 'minutes');
          hoursAfter22h += diffMinutes / 60;
        }
        entryTime = null;
      }
    }

    return hoursAfter22h;
  }

  /**
   * Calcula horas extras para um funcionário em um mês específico
   */
  async calculateHoursExtrasForMonth(
    userId: string, 
    year: number, 
    month: number, 
    baseSalary: number,
    dangerPay: number,
    unhealthyPay: number
  ): Promise<HoursExtrasCalculation> {
    const startDate = moment([year, month - 1, 1]).startOf('day').toDate();
    const endDate = moment([year, month - 1]).endOf('month').toDate();
    
    const hourlyRate = this.calculateHourlyRate(baseSalary, dangerPay, unhealthyPay);
    let totalHE50Hours = 0;
    let totalHE100Hours = 0;

    const cursor = moment(startDate);
    while (cursor.isSameOrBefore(endDate, 'day')) {
      const date = cursor.toDate();
      const dayOfWeek = cursor.day();
      const isHoliday = this.isHoliday(date);
      const totalHours = await this.calculateDayHours(userId, date);
      
      if (totalHours > 0) {
        const he50Hours = this.calculateHE50ForDay(totalHours, dayOfWeek, isHoliday);
        const he100Hours = await this.calculateHE100ForDay(userId, date, dayOfWeek);
        
        totalHE50Hours += he50Hours;
        totalHE100Hours += he100Hours;
      }
      
      cursor.add(1, 'day');
    }

    return {
      he50Hours: Number((totalHE50Hours * 1.5).toFixed(2)),
      he50Value: Number(((totalHE50Hours * 1.5) * hourlyRate).toFixed(2)),
      he100Hours: Number((totalHE100Hours * 2.0).toFixed(2)),
      he100Value: Number(((totalHE100Hours * 2.0) * hourlyRate).toFixed(2)),
      hourlyRate: Number(hourlyRate.toFixed(2))
    };
  }

  /**
   * Calcula detalhes dia a dia das horas extras
   */
  async calculateHoursExtrasDetailed(
    userId: string, 
    year: number, 
    month: number
  ): Promise<DayHoursExtras[]> {
    const startDate = moment([year, month - 1, 1]).startOf('day').toDate();
    const endDate = moment([year, month - 1]).endOf('month').toDate();
    
    const days: DayHoursExtras[] = [];
    const cursor = moment(startDate);
    
    while (cursor.isSameOrBefore(endDate, 'day')) {
      const date = cursor.toDate();
      const dayOfWeek = cursor.day();
      const isHoliday = this.isHoliday(date);
      const totalHours = await this.calculateDayHours(userId, date);
      
      if (totalHours > 0) {
        const he50Hours = this.calculateHE50ForDay(totalHours, dayOfWeek, isHoliday);
        const he100Hours = await this.calculateHE100ForDay(userId, date, dayOfWeek);
        
        days.push({
          date,
          dayOfWeek,
          totalHours: Number(totalHours.toFixed(2)),
          he50Hours: Number((he50Hours * 1.5).toFixed(2)),
          he100Hours: Number((he100Hours * 2.0).toFixed(2)),
          isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
          isHoliday
        });
      }
      
      cursor.add(1, 'day');
    }

    return days;
  }
}
