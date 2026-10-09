import { Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { parseDateInput } from '../utils/dateInput';
import { assertContractModulePermission, assertLiberadoContractAccess } from '../lib/contractAccess';
import { resolvePleitoCreateCore } from '../utils/pleitoCreateHelpers';
const toDec = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
};

type BudgetAdditive = { orcamentoId: string; descricao: string; valor: number };

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseBudgetAdditives(raw: unknown): BudgetAdditive[] {
  if (!Array.isArray(raw)) return [];
  const out: BudgetAdditive[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const orcamentoId = String(row.orcamentoId ?? '').trim();
    const descricao = String(row.descricao ?? '').trim() || 'Aditivo';
    const valor = Number(row.valor);
    if (!orcamentoId || !Number.isFinite(valor)) continue;
    out.push({ orcamentoId, descricao, valor: roundMoney(valor) });
  }
  return out;
}

function sumAdditives(list: readonly BudgetAdditive[]): number {
  return roundMoney(list.reduce((sum, item) => sum + item.valor, 0));
}

function serializePleito(p: any) {
  const dec = (v: unknown) => (v != null ? Number(v) : null);
  return {
    ...p,
    accumulatedBilled: dec(p.accumulatedBilled),
    billingRequest: dec(p.billingRequest),
    budgetAmount1: dec(p.budgetAmount1),
    budgetAmount2: dec(p.budgetAmount2),
    budgetAmount3: dec(p.budgetAmount3),
    budgetAmount4: dec(p.budgetAmount4),
    budgetAdditives: parseBudgetAdditives(p.budgetAdditives),
  };
}

export class ContractPleitoController {
  async getPleitosByContract(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId } = req.params;
      await assertContractModulePermission(req, contractId, 'ordemServico');

      const contract = await prisma.contract.findUnique({ where: { id: contractId } });
      if (!contract) throw createError('Contrato não encontrado', 404);

      const rows = await prisma.pleito.findMany({
        where: { updatedContractId: contractId },
        orderBy: { createdAt: 'desc' }
      });

      res.json({ success: true, data: rows.map(serializePleito) });
    } catch (error) {
      return next(error);
    }
  }

  async createPleito(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId } = req.params;
      await assertContractModulePermission(req, contractId, 'ordemServico');

      const b = req.body;

      const contract = await prisma.contract.findUnique({ where: { id: contractId } });
      if (!contract) throw createError('Contrato não encontrado', 404);
      if (!b.serviceDescription?.trim()) throw createError('Descrição do serviço é obrigatória', 400);

      const creationYear = b.creationYear != null && b.creationYear !== '' ? Number(b.creationYear) : null;
      const core = await resolvePleitoCreateCore(
        b as Record<string, unknown>,
        Number.isInteger(creationYear) ? creationYear : null,
        {
          costCenterId: contract.costCenterId,
          contractStartDate: contract.startDate,
          contractEndDate: contract.endDate
        }
      );
      const data: Prisma.PleitoCreateInput = {
        mes: core.mes,
        ano: core.ano,
        valorPrevisto: core.valorPrevisto,
        service_orders: { connect: { id: core.serviceOrderId } },
        creationMonth: b.creationMonth?.trim() || null,
        creationYear: Number.isInteger(creationYear) ? creationYear : null,
        startDate: b.startDate ? parseDateInput(b.startDate) : null,
        endDate: b.endDate ? parseDateInput(b.endDate) : null,
        budgetStatus: b.budgetStatus?.trim() || null,
        folderNumber: b.folderNumber?.trim() || null,
        lot: b.lot?.trim() || null,
        divSe: b.divSe?.trim() || null,
        location: b.location?.trim() || null,
        unit: b.unit?.trim() || null,
        serviceDescription: b.serviceDescription.trim(),
        budget: b.budget?.trim() || null,
        executionStatus: b.executionStatus?.trim() || null,
        billingStatus: b.billingStatus?.trim() || null,
        accumulatedBilled: toDec(b.accumulatedBilled),
        billingRequest: toDec(b.billingRequest),
        invoiceNumber: b.invoiceNumber?.trim() || null,
        estimator: b.estimator?.trim() || null,
        budgetAmount1: toDec(b.budgetAmount1),
        budgetAmount2: toDec(b.budgetAmount2),
        budgetAmount3: toDec(b.budgetAmount3),
        budgetAmount4: toDec(b.budgetAmount4),
        budgetValueConfirmed:
          b.budgetValueConfirmed === true ||
          b.budgetValueConfirmed === 'true' ||
          b.budgetValueConfirmed === 1,
        pv: b.pv?.trim() || null,
        ipi: b.ipi?.trim() || null,
        reportsBilling: b.reportsBilling?.trim() || null,
        engineer: b.engineer?.trim() || null,
        supervisor: b.supervisor?.trim() || null,
        updatedContract: { connect: { id: contractId } }
      };

      const existing = await prisma.pleito.findUnique({
        where: {
          serviceOrderId_mes_ano: {
            serviceOrderId: core.serviceOrderId,
            mes: core.mes,
            ano: core.ano,
          },
        },
      });

      if (existing) {
        /** Já existe pleito nesta mesma OS + competência (único no BD). Gerar novamente acumula valor pleiteado. */
        const incrementoBR = new Decimal(toDec(b.billingRequest) ?? 0);
        const baseBR =
          existing.billingRequest != null ? new Decimal(existing.billingRequest.toString()) : new Decimal(0);
        const requestedReportsBilling = typeof data.reportsBilling === 'string' ? data.reportsBilling : null;
        const existingReportsBilling = existing.reportsBilling || null;
        const requestedIsGerado100 = requestedReportsBilling === '__PLEITO_HISTORICO__GERADO_100__';
        const reportsBillingToPersist =
          requestedIsGerado100
            ? existingReportsBilling
            : existingReportsBilling === '__PLEITO_HISTORICO__' || existingReportsBilling === '__PLEITO_HISTORICO__GERADO_100__'
            ? requestedReportsBilling
            : existingReportsBilling;
        const row = await prisma.pleito.update({
          where: { id: existing.id },
          data: {
            valorPrevisto: core.valorPrevisto,
            creationMonth: data.creationMonth,
            creationYear: data.creationYear,
            startDate: data.startDate,
            endDate: data.endDate,
            budgetStatus: data.budgetStatus,
            folderNumber: data.folderNumber,
            lot: data.lot,
            divSe: data.divSe,
            location: data.location,
            unit: data.unit,
            serviceDescription: data.serviceDescription,
            budget: data.budget,
            executionStatus: data.executionStatus,
            billingStatus: data.billingStatus,
            billingRequest: incrementoBR.gt(0) ? baseBR.plus(incrementoBR) : baseBR,
            accumulatedBilled: data.accumulatedBilled,
            invoiceNumber: data.invoiceNumber,
            estimator: data.estimator,
            budgetAmount1: data.budgetAmount1,
            budgetAmount2: data.budgetAmount2,
            budgetAmount3: data.budgetAmount3,
            budgetAmount4: data.budgetAmount4,
            pv: data.pv,
            ipi: data.ipi,
            reportsBilling: reportsBillingToPersist,
            engineer: data.engineer,
            supervisor: data.supervisor,
            updatedContract: { connect: { id: contractId } },
          },
        });
        return res.status(200).json({
          success: true,
          data: serializePleito(row),
          message: 'Pleito atualizado nesta mesma competência — valor pleiteado acumulado.',
        });
      }

      const row = await prisma.pleito.create({ data });
      return res.status(201).json({
        success: true,
        data: serializePleito(row),
        message: 'Andamento da OS cadastrado com sucesso'
      });
    } catch (error) {
      return next(error);
    }
  }

  /**
   * Cria ou atualiza a OS do contrato a partir de orçamento (criação/importação/revisão/aditivo).
   * Só age no contrato informado — nunca em outro contrato.
   */
  async syncFromOrcamento(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { contractId } = req.params;
      // Quem importa/cria orçamento no contrato (Liberado) pode gerar a OS —
      // não exige a coluna O.S. da aba Contratos.
      await assertLiberadoContractAccess(req, contractId);

      const contract = await prisma.contract.findUnique({ where: { id: contractId } });
      if (!contract) throw createError('Contrato não encontrado', 404);

      const b = req.body ?? {};
      const divSe = String(b.divSe ?? '').trim();
      const folderNumber = String(b.folderNumber ?? '').trim();
      const serviceDescription = String(b.serviceDescription ?? '').trim();
      const isAditivo = b.isAditivo === true || b.isAditivo === 'true' || b.isAditivo === 1;
      const confirmValor = b.confirmValor === true || b.confirmValor === 'true' || b.confirmValor === 1;
      const confirmSomarAditivo =
        b.confirmSomarAditivo === true ||
        b.confirmSomarAditivo === 'true' ||
        b.confirmSomarAditivo === 1;
      const linkOnly = b.linkOnly === true || b.linkOnly === 'true' || b.linkOnly === 1;
      const modeRaw = String(b.mode ?? (isAditivo ? 'aditivo' : 'create')).trim().toLowerCase();
      const mode =
        modeRaw === 'revisao' ||
        modeRaw === 'aditivo' ||
        modeRaw === 'sync-base' ||
        modeRaw === 'sync-aditivo' ||
        modeRaw === 'create'
          ? modeRaw
          : 'create';
      const valorInformado = Number(b.valor);
      const valor = Number.isFinite(valorInformado) ? roundMoney(valorInformado) : NaN;
      const gravaValorNaFinalizacao = mode === 'sync-base' || mode === 'sync-aditivo';
      const criaZerada = mode === 'create' && !isAditivo;

      if (!divSe) throw createError('Informe a OS.', 400);
      if (!folderNumber) throw createError('Informe o número da pasta.', 400);
      if (!serviceDescription) throw createError('Informe a descrição do serviço da OS.', 400);
      if (!criaZerada && !linkOnly && !confirmValor) {
        throw createError('Confirme o valor do orçamento para gravar na OS.', 400);
      }
      if (gravaValorNaFinalizacao && (!Number.isFinite(valor) || valor < 0)) {
        throw createError('Informe um valor de orçamento válido.', 400);
      }
      if (!criaZerada && !linkOnly && !gravaValorNaFinalizacao && (!Number.isFinite(valor) || valor <= 0)) {
        throw createError('Informe um valor de orçamento válido (maior que zero).', 400);
      }
      if ((isAditivo || mode === 'aditivo' || mode === 'sync-aditivo') && !confirmSomarAditivo && !linkOnly) {
        throw createError('Confirme a soma do valor aditivo ao total da OS.', 400);
      }

      const norm = (s: string) => s.trim().toLowerCase();
      const existingList = await prisma.pleito.findMany({
        where: { updatedContractId: contractId },
        orderBy: { createdAt: 'desc' },
      });
      const existing = existingList.find(
        (row) =>
          norm(row.divSe || '') === norm(divSe) &&
          norm(row.folderNumber || '') === norm(folderNumber)
      );

      if (existing && mode === 'create' && !isAditivo) {
        throw createError(
          'Esta OS e este número da pasta já existem neste contrato. Altere a OS ou o número da pasta.',
          409
        );
      }

      if (!existing && (isAditivo || mode === 'aditivo' || mode === 'sync-aditivo' || mode === 'sync-base' || mode === 'revisao')) {
        throw createError(
          'Não há OS com esta OS e número da pasta neste contrato para receber o valor do orçamento.',
          400
        );
      }

      const persistTotal = async (
        pleitoId: string,
        serviceOrderId: string | null | undefined,
        total: number,
        data: Prisma.PleitoUpdateInput
      ) => {
        const row = await prisma.pleito.update({
          where: { id: pleitoId },
          data: {
            ...data,
            budget: total.toFixed(2),
            serviceDescription,
            updatedContract: { connect: { id: contractId } },
          },
        });
        if (serviceOrderId) {
          await prisma.service_orders.update({
            where: { id: serviceOrderId },
            data: { valor: total },
          });
        }
        return row;
      };

      if (existing && linkOnly && (isAditivo || mode === 'aditivo')) {
        return res.status(200).json({
          success: true,
          data: { ...serializePleito(existing), action: 'additive' as const },
          message: 'OS vinculada. O valor do aditivo entra ao finalizar o orçamento.',
        });
      }

      if (existing && (mode === 'sync-base' || mode === 'revisao')) {
        const additives = parseBudgetAdditives(existing.budgetAdditives);
        const base = valor;
        const total = roundMoney(base + sumAdditives(additives));
        const row = await persistTotal(existing.id, existing.serviceOrderId, total, {
          budgetAmount1: base,
        });
        return res.status(200).json({
          success: true,
          data: { ...serializePleito(row), action: 'revised' as const },
          message: 'Valor do orçamento gravado na OS.',
        });
      }

      if (existing && (mode === 'sync-aditivo' || isAditivo || mode === 'aditivo')) {
        const orcamentoId = String(b.orcamentoId ?? '').trim();
        const additives = parseBudgetAdditives(existing.budgetAdditives);
        if (!orcamentoId) {
          throw createError('Informe o orçamento aditivo para gravar na OS.', 400);
        }
        const descricao = String(b.aditivoDescricao || serviceDescription || 'Aditivo').trim() || 'Aditivo';
        const idx = additives.findIndex((item) => item.orcamentoId === orcamentoId);
        const entry: BudgetAdditive = { orcamentoId, descricao, valor };
        if (idx >= 0) additives[idx] = entry;
        else additives.push(entry);
        const base = toDec(existing.budgetAmount1) ?? 0;
        const total = roundMoney(base + sumAdditives(additives));
        const row = await persistTotal(existing.id, existing.serviceOrderId, total, {
          budgetAdditives: additives as unknown as Prisma.InputJsonValue,
        });
        return res.status(200).json({
          success: true,
          data: { ...serializePleito(row), action: 'additive' as const },
          message: 'Aditivo gravado na OS. O total é a soma do orçamento com os aditivos.',
        });
      }

      const now = new Date();
      const creationMonth = String(now.getMonth() + 1).padStart(2, '0');
      const creationYear = now.getFullYear();
      const core = await resolvePleitoCreateCore(
        {
          creationMonth,
          creationYear,
          valorPrevisto: 0,
          budgetAmount1: 0,
          valor: 0,
          serviceDescription,
          startDate: b.startDate,
          endDate: b.endDate,
        },
        creationYear,
        {
          costCenterId: contract.costCenterId,
          contractStartDate: contract.startDate,
          contractEndDate: contract.endDate,
        },
        { allowZeroValor: true }
      );

      const data: Prisma.PleitoCreateInput = {
        mes: core.mes,
        ano: core.ano,
        valorPrevisto: core.valorPrevisto,
        service_orders: { connect: { id: core.serviceOrderId } },
        creationMonth,
        creationYear,
        startDate: b.startDate ? parseDateInput(String(b.startDate)) : null,
        endDate: b.endDate ? parseDateInput(String(b.endDate)) : null,
        folderNumber,
        divSe,
        serviceDescription,
        budget: '0.00',
        budgetAmount1: 0,
        budgetAdditives: [],
        updatedContract: { connect: { id: contractId } },
      };

      const row = await prisma.pleito.create({ data });
      return res.status(201).json({
        success: true,
        data: { ...serializePleito(row), action: 'created' as const },
        message: 'OS criada com orçamento zerado. O valor entra ao finalizar o orçamento.',
      });
    } catch (error) {
      return next(error);
    }
  }
}
