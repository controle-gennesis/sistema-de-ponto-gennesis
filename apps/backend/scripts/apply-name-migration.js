#!/usr/bin/env node

/**
 * Script para aplicar a migração da coluna 'name' diretamente no banco
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function applyMigration() {
  try {
    console.log('🔄 Verificando se a coluna "name" já existe...');
    
    // Verifica se a coluna já existe
    const result = await prisma.$queryRawUnsafe(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'engineering_materials' 
      AND column_name = 'name'
    `);
    
    if (result && result.length > 0) {
      console.log('✅ Coluna "name" já existe na tabela engineering_materials');
      return;
    }
    
    console.log('📝 Adicionando coluna "name" à tabela engineering_materials...');
    
    // Aplica a migração
    await prisma.$executeRawUnsafe(`
      ALTER TABLE "engineering_materials" ADD COLUMN IF NOT EXISTS "name" TEXT;
    `);
    
    console.log('✅ Migração aplicada com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro ao aplicar migração:', error.message);
    
    // Se o erro for que a coluna já existe, tudo bem
    if (error.message.includes('already exists') || error.message.includes('duplicate')) {
      console.log('✅ Coluna já existe (isso é OK)');
      return;
    }
    
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

applyMigration()
  .then(() => {
    console.log('🎉 Processo concluído!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Erro fatal:', error);
    process.exit(1);
  });
