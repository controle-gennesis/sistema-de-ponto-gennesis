#!/usr/bin/env bash
# Build do backend no deploy (monorepo). Rode a partir da raiz do repositório.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
npm install
npm run build:permission-modules
npm run build -w @sistema-ponto/backend
