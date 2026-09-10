#!/usr/bin/env bash
# Build do frontend no deploy (monorepo). Rode a partir da raiz do repositório.
# Inclui rebuild de @sistema-ponto/permission-modules (rótulos/breadcrumb).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
npm install
npm run build:permission-modules
npm run build -w @sistema-ponto/frontend
