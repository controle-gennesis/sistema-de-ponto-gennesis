import { prisma } from './prisma';
import { metaWhatsApp } from '../services/MetaWhatsAppService';

/** Envia sem lançar — falha de WhatsApp nunca deve derrubar o job agendado. */
async function sendBirthdayTemplate(phone: string, firstName: string): Promise<void> {
  try {
    await metaWhatsApp.sendTemplate(phone, 'feliz_aniversario', 'pt_BR', [firstName]);
  } catch (err) {
    console.error('[BirthdayWhatsAppNotify] Falha ao enviar WhatsApp:', err);
  }
}

/**
 * Manda mensagem de parabéns pra quem faz aniversário hoje (Employee.birthDate),
 * usando a mesma leitura de mês/dia já confiável em EmployeeController.getBirthdayEmployees
 * (sem conversão explícita de fuso — o campo é salvo com horário fixo pra evitar deslocar o dia).
 */
export async function sendTodaysBirthdayGreetings(): Promise<void> {
  try {
    const today = new Date();
    const todayMonth = today.getMonth() + 1;
    const todayDay = today.getDate();

    const employees = await prisma.employee.findMany({
      where: {
        birthDate: { not: null },
        phone: { not: null },
        user: { isActive: true },
      },
      select: {
        phone: true,
        birthDate: true,
        user: { select: { name: true } },
      },
    });

    const birthdayEmployees = employees.filter((e) => {
      if (!e.birthDate) return false;
      const d = new Date(e.birthDate);
      return d.getMonth() + 1 === todayMonth && d.getDate() === todayDay;
    });

    if (birthdayEmployees.length === 0) return;

    await Promise.allSettled(
      birthdayEmployees.map((e) => {
        const phone = e.phone?.trim();
        if (!phone) return Promise.resolve();
        const firstName = e.user.name.trim().split(/\s+/)[0] || e.user.name.trim();
        return sendBirthdayTemplate(phone, firstName);
      })
    );
  } catch (err) {
    console.error('[BirthdayWhatsAppNotify] Falha ao processar aniversariantes do dia:', err);
  }
}
