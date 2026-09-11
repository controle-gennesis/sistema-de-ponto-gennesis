#!/usr/bin/env bash
# Build do frontend no deploy (monorepo). Rode a partir da raiz do repositório.
# Inclui rebuild de @sistema-ponto/permission-modules (rótulos/breadcrumb).
# Redeploy 2026-09-11b — inclui devDeps (tsc) mesmo com NODE_ENV=production.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
# Railpack/Railway pode omitir devDependencies; precisamos do TypeScript para o pacote permission-modules.
npm install --include=dev
npm run build:permission-modules
npm run build -w @sistema-ponto/frontend
