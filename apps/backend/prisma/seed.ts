import { PrismaClient, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...');

  // Criar configurações da empresa
  await prisma.companySettings.upsert({
    where: { id: 'default' },
    update: {},
    create: {
      id: 'default',
      name: 'Gennesis Engenharia',
      cnpj: '38.294.339/0001-10',
      address: '24, St. de Habitações Individuais Sul QI 11 - Lago Sul, Brasília - DF, 70297-400',
      phone: '(61) 99517-6932',
      email: 'contato@gennesis.com.br',
      workStartTime: '07:00',
      workEndTime: '17:00',
      lunchStartTime: '12:00',
      lunchEndTime: '13:00',
      toleranceMinutes: 10,
      maxOvertimeHours: 2,
      maxDistanceMeters: 1000,
      defaultLatitude: -15.835840,
      defaultLongitude: -47.873407,
      vacationDaysPerYear: 30
    }
  });

  console.log('✅ Configurações da empresa criadas');

  // Criar funcionário diretor
  const directorPassword = await bcrypt.hash('diretor123', 12);
  const director = await prisma.user.upsert({
    where: { email: 'diretor@gennesis.com.br' },
    update: {},
    create: {
      email: 'diretor@gennesis.com.br',
      password: directorPassword,
      name: 'Carlos Eduardo Silva',
      cpf: '12345678901',
      role: UserRole.EMPLOYEE,
      isActive: true,
      isFirstLogin: false
    }
  });

  // Criar dados do funcionário diretor
  await prisma.employee.upsert({
    where: { userId: director.id },
    update: {},
    create: {
      userId: director.id,
      employeeId: 'DIR001',
      department: 'Projetos',
      position: 'Diretor',
      hireDate: new Date('2025-10-01'),
      birthDate: new Date('2002-10-24'),
      salary: 25000.00,
      workSchedule: {
        startTime: '07:00',
        endTime: '17:00',
        lunchStartTime: '12:00',
        lunchEndTime: '13:00',
        workDays: [1, 2, 3, 4, 5],
        toleranceMinutes: 10
      },
      isRemote: false,
      allowedLocations: [
        {
          id: 'loc_1',
          name: 'Escritório Principal',
          latitude: -15.835840,
          longitude: -47.873407,
          radius: 200
        }
      ],
      costCenter: 'SEDES',
      client: '004 - ADMINISTRATIVO DF',
      dailyFoodVoucher: 50.00,
      dailyTransportVoucher: 15.00,
      // Dados da empresa
      company: 'GÊNNESIS',
      // Dados bancários
      bank: 'BANCO DO BRASIL',
      accountType: 'CONTA CORRENTE',
      agency: '1234',
      operation: '01',
      account: '12345678',
      digit: '9',
      // Dados PIX
      pixKeyType: 'CPF',
      pixKey: '12345678901',
      // Modalidade e adicionais
      modality: 'CLT',
      familySalary: 0.00,
      dangerPay: 0.00,
      unhealthyPay: 0.00
    }
  });

  console.log('✅ Funcionário diretor criado: diretor@gennesis.com.br / diretor123');
  console.log('📋 Credenciais de acesso:');
  console.log('   Diretor: diretor@gennesis.com.br / diretor123');
}

main()
  .catch((e) => {
    console.error('❌ Erro durante o seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });