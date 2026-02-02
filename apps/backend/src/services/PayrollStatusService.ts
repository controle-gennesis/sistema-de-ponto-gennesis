import { prisma } from '../lib/prisma';

export class PayrollStatusService {
  /**
   * Verifica se a folha está finalizada
   */
  async isPayrollFinalized(month: number, year: number): Promise<boolean> {
    const status = await prisma.payrollStatus.findUnique({
      where: {
        month_year: {
          month,
          year
        }
      }
    });

    return status?.isFinalized || false;
  }

  /**
   * Finaliza a folha de pagamento
   */
  async finalizePayroll(month: number, year: number, userId: string): Promise<void> {
    await prisma.payrollStatus.upsert({
      where: {
        month_year: {
          month,
          year
        }
      },
      update: {
        isFinalized: true,
        finalizedBy: userId,
        finalizedAt: new Date()
      },
      create: {
        month,
        year,
        isFinalized: true,
        finalizedBy: userId,
        finalizedAt: new Date()
      }
    });
  }

  /**
   * Reabre a folha de pagamento (se necessário)
   */
  async reopenPayroll(month: number, year: number): Promise<void> {
    await prisma.payrollStatus.update({
      where: {
        month_year: {
          month,
          year
        }
      },
      data: {
        isFinalized: false,
        finalizedBy: null,
        finalizedAt: null
      }
    });
  }

  /**
   * Obtém o status da folha
   */
  async getPayrollStatus(month: number, year: number) {
    return await prisma.payrollStatus.findUnique({
      where: {
        month_year: {
          month,
          year
        }
      },
      include: {
        finalizedByUser: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });
  }
}
