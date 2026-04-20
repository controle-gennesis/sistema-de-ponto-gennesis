import { Decimal } from '@prisma/client/runtime/library';
import { createError } from '../middleware/errorHandler';
import { prisma } from '../lib/prisma';

export function toDecPleito(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

/** Campos obrigatórios do modelo Pleito após evolução do schema (OS + competência + valor previsto). */
export async function resolvePleitoCreateCore(
  b: Record<string, unknown>,
  creationYearParsed: number | null
): Promise<{ mes: number; ano: number; valorPrevisto: Decimal; serviceOrderId: string }> {
  const serviceOrderId = typeof b.serviceOrderId === 'string' ? b.serviceOrderId.trim() : '';
  if (!serviceOrderId) {
    throw createError('serviceOrderId é obrigatório (ordem de serviço vinculada)', 400);
  }

  let mes: number | null = null;
  if (b.mes != null && b.mes !== '') {
    const n = Number(b.mes);
    if (Number.isInteger(n) && n >= 1 && n <= 12) mes = n;
  }
  if (mes == null && b.creationMonth != null && String(b.creationMonth).trim() !== '') {
    const n = parseInt(String(b.creationMonth).trim().padStart(2, '0'), 10);
    if (n >= 1 && n <= 12) mes = n;
  }

  let ano: number | null = null;
  if (b.ano != null && b.ano !== '') {
    const n = Number(b.ano);
    if (Number.isInteger(n) && n > 1900 && n < 2200) ano = n;
  }
  if (ano == null && creationYearParsed != null && Number.isInteger(creationYearParsed)) {
    ano = creationYearParsed;
  }

  if (mes == null || ano == null) {
    throw createError(
      'Informe mês e ano da competência (mes e ano, ou creationMonth e creationYear)',
      400
    );
  }

  const so = await prisma.service_orders.findUnique({ where: { id: serviceOrderId } });
  if (!so) {
    throw createError('Ordem de serviço não encontrada', 404);
  }

  const vp =
    toDecPleito(b.valorPrevisto) ??
    toDecPleito(b.valor) ??
    toDecPleito(b.budgetAmount1) ??
    Number(so.valor);

  return {
    mes,
    ano,
    valorPrevisto: new Decimal(vp),
    serviceOrderId,
  };
}
