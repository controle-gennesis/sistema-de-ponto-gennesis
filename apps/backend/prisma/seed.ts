import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...');

  try {
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
  } catch (error) {
    console.error('⚠️  Erro ao criar configurações da empresa:', error);
    // Continuar mesmo se houver erro
  }
  
  console.log('✅ Seed concluído com sucesso');
}

main()
  .catch((e) => {
    console.error('❌ Erro durante o seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });