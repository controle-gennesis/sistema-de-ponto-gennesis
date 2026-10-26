import { createError } from '../middleware/errorHandler';
import { parseDateInput } from './dateInput';

export type MedicaoFaturamento = {
  measurementCode: string;
  measurementStart: Date;
  measurementEnd: Date;
};

/** Medição do faturamento: código + data de início e de fim (fim não pode ser antes do início). */
export function parseMedicaoFaturamento(body: Record<string, unknown>): MedicaoFaturamento {
  const code = String(body.measurementCode ?? '').trim();
  if (!code) throw createError('Código da medição é obrigatório', 400);
  if (!body.measurementStart) throw createError('Data de início da medição é obrigatória', 400);
  if (!body.measurementEnd) throw createError('Data de fim da medição é obrigatória', 400);
  const inicio = parseDateInput(body.measurementStart as string);
  const fim = parseDateInput(body.measurementEnd as string);
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) {
    throw createError('Datas da medição inválidas', 400);
  }
  if (fim < inicio) throw createError('A data de fim da medição não pode ser antes do início', 400);
  return { measurementCode: code, measurementStart: inicio, measurementEnd: fim };
}
