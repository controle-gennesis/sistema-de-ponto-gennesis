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
  prisma = new PrismaClient();
} catch (error) {
  console.log('⚠️  Prisma Client não encontrado. Gerando...');
  try {
    execSync('npx prisma generate', { 
      stdio: 'inherit',
      cwd: path.join(__dirname, '..')
    });
    PrismaClient = require('@prisma/client').PrismaClient;
    prisma = new PrismaClient();
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
    
    // SQL para criar a tabela manual_inss_values
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS "manual_inss_values" (
        "id" TEXT NOT NULL,
        "employeeId" TEXT NOT NULL,
        "month" INTEGER NOT NULL,
        "year" INTEGER NOT NULL,
        "inssRescisao" DECIMAL(65,30) NOT NULL DEFAULT 0,
        "inss13" DECIMAL(65,30) NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL,
        CONSTRAINT "manual_inss_values_pkey" PRIMARY KEY ("id")
      );

      CREATE UNIQUE INDEX IF NOT EXISTS "manual_inss_values_employeeId_month_year_key" 
        ON "manual_inss_values"("employeeId", "month", "year");

      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'manual_inss_values_employeeId_fkey'
        ) THEN
          ALTER TABLE "manual_inss_values" 
          ADD CONSTRAINT "manual_inss_values_employeeId_fkey" 
          FOREIGN KEY ("employeeId") REFERENCES "employees"("id") 
          ON DELETE CASCADE ON UPDATE CASCADE;
        END IF;
      END $$;
    `;

    await prisma.$executeRawUnsafe(createTableSQL);
    console.log('✅ Tabela manual_inss_values criada com sucesso!');
    return true;
  } catch (error) {
    console.error('❌ Erro ao criar tabela manual_inss_values:', error.message);
    return false;
  }
}

async function resolveFailedMigrations() {
  try {
    console.log('🔍 Verificando migrations falhadas...');
    
    // Verifica se a tabela manual_inss_values existe
    const tableExists = await checkTableExists('manual_inss_values');
    
    if (!tableExists) {
      console.log('⚠️  Tabela manual_inss_values não encontrada. Criando...');
      const created = await createManualInssTable();
      if (!created) {
        console.log('⚠️  Não foi possível criar a tabela automaticamente. Continuando...');
      }
    } else {
      console.log('✅ Tabela manual_inss_values já existe');
    }
    
    // Tenta executar migrate deploy para ver se há migrations falhadas
    try {
      execSync('npx prisma migrate deploy', { 
        stdio: 'pipe',
        cwd: path.join(__dirname, '..')
      });
      console.log('✅ Migrations aplicadas com sucesso');
      return true;
    } catch (error) {
      const errorOutput = (error.stdout?.toString() || error.stderr?.toString() || error.message || '').trim();
      
      // Verifica se é erro P3009 (migration falhada)
      if (errorOutput.includes('P3009') || errorOutput.includes('failed migrations')) {
        console.log('⚠️  Migration falhada detectada. Tentando resolver...');
        
        // Procura pelo nome da migration falhada no output
        const migrationMatch = errorOutput.match(/`([^`]+)` migration/);
        if (migrationMatch) {
          const migrationName = migrationMatch[1];
          
          // Se a tabela manual_inss_values já existe, marca a migration como "applied"
          // porque as outras tabelas já foram criadas
          if (tableExists) {
            console.log(`📝 Marcando migration '${migrationName}' como aplicada (tabelas já existem)...`);
            try {
              execSync(`npx prisma migrate resolve --applied ${migrationName}`, {
                stdio: 'inherit',
                cwd: path.join(__dirname, '..')
              });
              console.log('✅ Migration marcada como aplicada');
              return true;
            } catch (applyError) {
              console.error('❌ Erro ao marcar migration como aplicada:', applyError.message);
              return false;
            }
          } else {
            // Se a tabela não existe, marca como rolled_back para tentar aplicar novamente
            console.log(`📝 Marcando migration '${migrationName}' como rolled back...`);
            try {
              execSync(`npx prisma migrate resolve --rolled-back ${migrationName}`, {
                stdio: 'inherit',
                cwd: path.join(__dirname, '..')
              });
              console.log('✅ Migration marcada como rolled back');
              return true;
            } catch (resolveError) {
              console.error('❌ Erro ao resolver migration:', resolveError.message);
              return false;
            }
          }
        } else {
          console.log('⚠️  Não foi possível identificar a migration falhada automaticamente');
          return false;
        }
      } else {
        // Outro tipo de erro
        console.log('⚠️  Erro ao verificar migrations:', errorOutput.substring(0, 200));
        return false;
      }
    }
  } catch (error) {
    console.error('❌ Erro inesperado:', error.message);
    return false;
  } finally {
    await prisma.$disconnect();
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

