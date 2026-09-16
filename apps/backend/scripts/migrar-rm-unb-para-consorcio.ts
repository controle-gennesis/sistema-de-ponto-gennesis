/**
 * Migra RMs (e OCs ligadas) do centro "UNB" para "UNB - CONSÓRCIO PREDIAL BRASILIA".
 * Não altera UNB - SB nem contratos.
 *
 * Contagem (não grava):
 *   npx tsx scripts/migrar-rm-unb-para-consorcio.ts
 *
 * Aplicar:
 *   npx tsx scripts/migrar-rm-unb-para-consorcio.ts --apply
 */

import 'dotenv/config';
import { prisma } from '../src/lib/prisma';
import {
  applyMigrarRmUnbParaConsorcio,
  previewMigrarRmUnbParaConsorcio,
} from '../src/lib/migrarRmUnbParaConsorcio';

function printDatabaseTarget(): void {
  const raw = process.env.DATABASE_URL || '';
  if (!raw) {
    console.error('DATABASE_URL não definida.');
    return;
  }
  try {
    const u = new URL(raw);
    console.log(`Banco — host: ${u.hostname} | database: ${u.pathname.replace(/^\//, '')}`);
  } catch {
    console.log('Banco — DATABASE_URL definida');
  }
}

function isLocalDatabase(): boolean {
  const raw = process.env.DATABASE_URL || '';
  try {
    return /localhost|127\.0\.0\.1/i.test(new URL(raw).hostname);
  } catch {
    return false;
  }
}

async function main() {
  const apply = process.argv.includes('--apply');
  const allowLocal = process.argv.includes('--allow-local');
  printDatabaseTarget();

  if (isLocalDatabase() && !allowLocal) {
    throw new Error(
      'Este script está apontando para o banco LOCAL. A troca das OCs precisa do banco do deploy. Defina DATABASE_URL da URL pública do Postgres (Railway) nesta sessão do PowerShell, sem alterar o .env.',
    );
  }

  console.log(apply ? '\nMODO: APLICAR (grava no banco)\n' : '\nMODO: CONTAGEM (nada é alterado)\n');

  const preview = await previewMigrarRmUnbParaConsorcio();

  console.log(`Origem:  ${preview.from.code} — ${preview.from.name}`);
  console.log(`Destino: ${preview.to.code} — ${preview.to.name}`);
  console.log('\nO que seria migrado (RM → Consórcio; OC herda a RM):');
  console.log(`  RMs:              ${preview.rmCount}`);
  console.log(`  OCs ligadas:      ${preview.ocCount}`);
  console.log(`  Mov. estoque:     ${preview.stockCount}`);
  console.log(`  Furos de estoque: ${preview.shortfallCount}`);
  console.log(`  Contratos no CC UNB (NÃO entram na migração): ${preview.contractCount}`);

  if (preview.sampleRms.length) {
    console.log('\nRMs recentes:');
    for (const r of preview.sampleRms) console.log(`  ${r.requestNumber}  ${r.status}`);
  }
  if (preview.sampleOcs.length) {
    console.log('\nOCs recentes:');
    for (const o of preview.sampleOcs) console.log(`  ${o.orderNumber}  ${o.status}`);
  }

  if (!apply) {
    console.log('\nNada foi gravado. Para aplicar neste banco:');
    console.log('  npx tsx scripts/migrar-rm-unb-para-consorcio.ts --apply');
    return;
  }

  const result = await applyMigrarRmUnbParaConsorcio();
  console.log('\nAplicado:');
  console.log(`  RMs atualizadas:              ${result.applied.rms}`);
  console.log(`  Movimentações de estoque:     ${result.applied.stock}`);
  console.log(`  Furos de estoque:             ${result.applied.shortfalls}`);
  console.log('  OCs passam a mostrar o Consórcio na coluna CONTRATO.');
}

main()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
