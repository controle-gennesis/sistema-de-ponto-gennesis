#!/usr/bin/env node
// Localiza o binário do Next.js dinamicamente via require.resolve, em vez de um caminho
// relativo fixo (./node_modules/next/dist/bin/next) — o npm workspaces às vezes hasteia
// `next` para o node_modules da raiz do monorepo em vez de manter local em apps/frontend,
// dependendo de como resolve as versões entre os workspaces, e o caminho fixo quebra nesse caso.
const { spawnSync } = require('child_process');

const nextBin = require.resolve('next/dist/bin/next');
const result = spawnSync(process.execPath, [nextBin, ...process.argv.slice(2)], {
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
