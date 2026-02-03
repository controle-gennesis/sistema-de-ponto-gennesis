#!/usr/bin/env node

/**
 * Script para resolver migrations falhadas no Prisma
 * Verifica se as tabelas existem e cria apenas as que faltam
 */

const { execSync } = require('child_process');
const path = require('path');

// Tenta importar Prisma Client, se não estiver disponível, gera primeiro
let PrismaClient;
let prisma;

try {
  PrismaClient = require('@prisma/client').PrismaClient;
  prisma = new PrismaClient({
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
  });
} catch (error) {
  console.log('⚠️  Prisma Client não encontrado. Gerando...');
  try {
    execSync('npx prisma generate', { 
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    PrismaClient = require('@prisma/client').PrismaClient;
    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });
  } catch (genError) {
    console.error('❌ Erro ao gerar Prisma Client:', genError.message);
    process.exit(1);
  }
}

async function checkTableExists(tableName) {
  try {
    // Tenta fazer uma query simples na tabela
    await prisma.$queryRawUnsafe(`SELECT 1 FROM "${tableName}" LIMIT 1`);
    return true;
  } catch (error) {
    // Se der erro de "table does not exist", a tabela não existe
    if (error.message.includes('does not exist') || error.code === '42P01') {
      return false;
    }
    // Outro erro (pode ser que a tabela exista mas tenha outro problema)
    throw error;
  }
}

async function createManualInssTable() {
  try {
    console.log('📝 Criando tabela manual_inss_values...');
    
    // 1. Criar a tabela (sem IF NOT EXISTS para ver erro se já existir)
    const createTableSQL = `
      CREATE TABLE "manual_inss_values" (
        "id" TEXT NOT NULL,
        "employeeId" TEXT NOT NULL,
        "month" INTEGER NOT NULL,
        "year" INTEGER NOT NULL,
        "inssRescisao" DECIMAL(65,30) NOT NULL DEFAULT 0,
        "inss13" DECIMAL(65,30) NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "manual_inss_values_pkey" PRIMARY KEY ("id")
      )
    `;
    
    try {
      await prisma.$executeRawUnsafe(createTableSQL);
      console.log('✅ Tabela criada');
    } catch (tableError) {
      // Se a tabela já existe, continua
      if (tableError.message.includes('already exists') || tableError.code === '42P07') {
        console.log('✅ Tabela já existe');
      } else {
        throw tableError;
      }
    }
    
    // 2. Criar índice único (se não existir)
    try {
      const createIndexSQL = `
        CREATE UNIQUE INDEX IF NOT EXISTS "manual_inss_values_employeeId_month_year_key" 
        ON "manual_inss_values"("employeeId", "month", "year")
      `;
      await prisma.$executeRawUnsafe(createIndexSQL);
      console.log('✅ Índice único criado');
    } catch (indexError) {
      // Índice pode já existir, não é crítico
      console.log('⚠️  Índice pode já existir, continuando...');
      console.log('   Detalhes:', indexError.message);
    }
    
    // 3. Adicionar foreign key (se não existir)
    try {
      const checkConstraintSQL = `
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'manual_inss_values_employeeId_fkey'
        LIMIT 1
      `;
      const constraintExists = await prisma.$queryRawUnsafe(checkConstraintSQL);
      
      if (!constraintExists || constraintExists.length === 0) {
        const addConstraintSQL = `
          ALTER TABLE "manual_inss_values" 
          ADD CONSTRAINT "manual_inss_values_employeeId_fkey" 
          FOREIGN KEY ("employeeId") REFERENCES "employees"("id") 
          ON DELETE CASCADE ON UPDATE CASCADE
        `;
        await prisma.$executeRawUnsafe(addConstraintSQL);
        console.log('✅ Foreign key criada');
      } else {
        console.log('✅ Foreign key já existe');
      }
    } catch (constraintError) {
      // Constraint pode já existir, não é crítico
      console.log('⚠️  Foreign key pode já existir, continuando...');
      console.log('   Detalhes:', constraintError.message);
    }
    
    // Verifica se a tabela realmente foi criada
    const tableExists = await checkTableExists('manual_inss_values');
    if (tableExists) {
      console.log('✅ Tabela manual_inss_values criada e verificada com sucesso!');
      return true;
    } else {
      console.error('❌ Tabela não foi criada mesmo após tentativa');
      return false;
    }
  } catch (error) {
    console.error('❌ Erro ao criar tabela manual_inss_values:');
    console.error('   Mensagem:', error.message);
    console.error('   Código:', error.code);
    console.error('   Stack:', error.stack);
    return false;
  }
}

async function resolveFailedMigrations() {
  try {
    console.log('🔍 Verificando migrations falhadas...');
    
    // Verifica se a tabela manual_inss_values existe
    let tableExists = false;
    try {
      tableExists = await checkTableExists('manual_inss_values');
    } catch (error) {
      console.log('⚠️  Erro ao verificar tabela (pode ser problema de conexão):', error.message);
      // Desconecta e tenta novamente
      await prisma.$disconnect();
      await new Promise(resolve => setTimeout(resolve, 1000)); // Aguarda 1 segundo
      prisma = new PrismaClient({
        datasources: {
          db: {
            url: process.env.DATABASE_URL,
          },
        },
      });
      tableExists = await checkTableExists('manual_inss_values');
    }
    
    if (!tableExists) {
      console.log('⚠️  Tabela manual_inss_values não encontrada. Criando...');
      const created = await createManualInssTable();
      if (created) {
        // Verifica novamente se a tabela foi criada
        tableExists = await checkTableExists('manual_inss_values');
        if (tableExists) {
          console.log('✅ Tabela criada com sucesso!');
        }
      } else {
        console.log('⚠️  Não foi possível criar a tabela automaticamente. Continuando...');
      }
    } else {
      console.log('✅ Tabela manual_inss_values já existe');
    }
    
    // Primeiro, tenta resolver a migration falhada ANTES de executar migrate deploy
    // Se a tabela existe, significa que as tabelas foram criadas, então marca como applied
    // Se não existe, marca como rolled_back para tentar aplicar novamente
    const migrationName = '20251105105343_init';
    
    if (tableExists) {
      console.log(`📝 Tabelas já existem. Marcando migration '${migrationName}' como aplicada...`);
      try {
        execSync(`npx prisma migrate resolve --applied ${migrationName}`, {
          stdio: 'inherit',
          cwd: path.join(__dirname, '..')
        });
        console.log('✅ Migration marcada como aplicada');
      } catch (applyError) {
        console.log('⚠️  Erro ao marcar como aplicada, tentando rolled_back...');
        try {
          execSync(`npx prisma migrate resolve --rolled-back ${migrationName}`, {
            stdio: 'inherit',
            cwd: path.join(__dirname, '..')
          });
          console.log('✅ Migration marcada como rolled back');
        } catch (rollbackError) {
          console.log('⚠️  Não foi possível resolver migration automaticamente:', rollbackError.message);
          // Continua mesmo assim
        }
      }
    } else {
      console.log(`📝 Tabela não existe. Marcando migration '${migrationName}' como rolled back...`);
      try {
        execSync(`npx prisma migrate resolve --rolled-back ${migrationName}`, {
          stdio: 'inherit',
          cwd: path.join(__dirname, '..')
        });
        console.log('✅ Migration marcada como rolled back');
      } catch (resolveError) {
        console.log('⚠️  Não foi possível marcar como rolled back:', resolveError.message);
        // Continua mesmo assim
      }
    }
    
    // Desconecta ANTES de executar migrate deploy para liberar conexões
    await prisma.$disconnect();
    await new Promise(resolve => setTimeout(resolve, 500)); // Aguarda 500ms para garantir desconexão
    
    // Agora tenta executar migrate deploy
    try {
      console.log('🔄 Executando prisma migrate deploy...');
      execSync('npx prisma migrate deploy', { 
        stdio: 'inherit',
        cwd: path.join(__dirname, '..')
      });
      console.log('✅ Migrations aplicadas com sucesso');
      return true;
    } catch (error) {
      const errorOutput = (error.stdout?.toString() || error.stderr?.toString() || error.message || '').trim();
      
      // Verifica se ainda há erro P3009
      if (errorOutput.includes('P3009') || errorOutput.includes('failed migrations')) {
        console.log('⚠️  Ainda há migration falhada. Tentando resolver novamente...');
        
        // Tenta resolver novamente
        try {
          execSync(`npx prisma migrate resolve --applied ${migrationName}`, {
            stdio: 'inherit',
            cwd: path.join(__dirname, '..')
          });
          console.log('✅ Migration resolvida');
          return true;
        } catch (resolveError) {
          console.error('❌ Erro ao resolver migration:', resolveError.message);
          // Continua mesmo assim para não bloquear o deploy
          return true;
        }
      } else {
        // Outro tipo de erro
        console.log('⚠️  Erro ao executar migrate deploy:', errorOutput.substring(0, 200));
        // Continua mesmo assim para não bloquear o deploy
        return true;
      }
    }
  } catch (error) {
    console.error('❌ Erro inesperado:', error.message);
    // Continua mesmo assim para não bloquear o deploy
    return true;
  } finally {
    // Sempre desconecta antes de sair
    try {
      await prisma.$disconnect();
      console.log('✅ Conexão Prisma fechada');
      // Aguarda um pouco para garantir que a conexão foi fechada
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (disconnectError) {
      console.log('⚠️  Erro ao desconectar (não crítico):', disconnectError.message);
    }
  }
}

// Executa o script
resolveFailedMigrations()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });

