import { PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { prisma } from './prisma';
import { metaWhatsApp } from '../services/MetaWhatsAppService';
import { DP_APPROVE_MODULE_KEY } from './dpApprovalAccess';
import { isDfAdmLocalLabel, sanitizeDpApprovalSectors, sectorSolicitanteMatches } from './dpApprovalSectors';
import { OC_APPROVE_COMPRAS_MODULE_KEY, OC_APPROVE_DIRETORIA_MODULE_KEY } from './ocApprovalAccess';
import { RM_APPROVE_MODULE_KEY } from './rmApprovalAccess';
import { CONTRACTS_MODULE_KEY } from './contractAccess';

/** Envia sem lançar — falha de WhatsApp nunca deve derrubar a criação da solicitação. */
async function sendApprovalWhatsApp(phone: string, text: string): Promise<void> {
  try {
    await metaWhatsApp.sendText(phone, text);
  } catch (err) {
    console.error('[ApprovalWhatsAppNotify] Falha ao enviar WhatsApp:', err);
  }
}

/**
 * Linha "Aprovada por Fulano." — ou "Você aprovou esta solicitação." quando o aprovador é o
 * próprio solicitante (ex.: admin que aprova o próprio pedido).
 */
export async function buildApprovedByLine(
  requesterUserId: string,
  approverUserId: string
): Promise<string> {
  if (approverUserId === requesterUserId) return 'Você aprovou esta solicitação.';
  const approver = await prisma.user.findUnique({
    where: { id: approverUserId },
    select: { name: true },
  });
  const name = approver?.name?.trim();
  return name ? `Aprovada por ${name}.` : 'Solicitação aprovada.';
}

/** Avisa o solicitante original (Employee.phone) que a solicitação dele foi aprovada. Nunca lança. */
export async function notifyRequesterApprovedWhatsApp(params: {
  requesterUserId: string;
  approverUserId: string;
  subjectLine: string;
}): Promise<void> {
  try {
    const employee = await prisma.employee.findFirst({
      where: { userId: params.requesterUserId, phone: { not: null } },
      select: { phone: true },
    });
    const phone = employee?.phone?.trim();
    if (!phone) return;
    const approvedLine = await buildApprovedByLine(params.requesterUserId, params.approverUserId);
    await sendApprovalWhatsApp(phone, [`✅ ${params.subjectLine}`, approvedLine].join('\n'));
  } catch (err) {
    console.error('[ApprovalWhatsAppNotify] Falha ao notificar aprovação ao solicitante:', err);
  }
}

/** Dispara em paralelo para todos os userIds com telefone cadastrado (Employee.phone). Nunca lança. */
export async function notifyApproversWhatsApp(userIds: string[], text: string): Promise<void> {
  try {
    const uniqueIds = [...new Set(userIds.filter(Boolean))];
    if (uniqueIds.length === 0) return;
    const employees = await prisma.employee.findMany({
      where: { userId: { in: uniqueIds }, phone: { not: null } },
      select: { phone: true },
    });
    const phones = [...new Set(employees.map((e) => e.phone!.trim()).filter(Boolean))];
    await Promise.allSettled(phones.map((phone) => sendApprovalWhatsApp(phone, text)));
  } catch (err) {
    console.error('[ApprovalWhatsAppNotify] Falha ao resolver aprovadores:', err);
  }
}

async function userIdsWithModule(module: string): Promise<string[]> {
  const rows = await prisma.userPermission.findMany({
    where: { module, action: PERMISSION_ACCESS_ACTION, allowed: true },
    select: { userId: true },
  });
  return rows.map((r) => r.userId);
}

/** Aprovadores da fila «Solicitações Internas» (DP) para o contrato/CC e tipo da nova solicitação. */
export async function getDpApprovalNotifyUserIds(params: {
  contractId: string | null;
  costCenterId: string;
  isSensitive: boolean;
  sectorSolicitante: string | null;
}): Promise<string[]> {
  if (params.isSensitive) {
    const rows = await prisma.userRestrictedDpApprovalCostCenter.findMany({
      where: { costCenterId: params.costCenterId },
      select: {
        userId: true,
        allowedSectors: true,
        costCenter: { select: { name: true, code: true } },
      },
    });
    return rows
      .filter((row) => {
        const isDfAdmLocal = isDfAdmLocalLabel(row.costCenter?.name, row.costCenter?.code);
        const allowedSectors = sanitizeDpApprovalSectors(row.allowedSectors);
        if (!isDfAdmLocal || allowedSectors.length === 0) return true;
        return sectorSolicitanteMatches(allowedSectors, params.sectorSolicitante);
      })
      .map((row) => row.userId);
  }

  const [approveIds, contractsModuleIds] = await Promise.all([
    userIdsWithModule(DP_APPROVE_MODULE_KEY),
    userIdsWithModule(CONTRACTS_MODULE_KEY),
  ]);
  const eligible = new Set(approveIds.filter((id) => contractsModuleIds.includes(id)));
  if (eligible.size === 0) return [];

  const contracts = await prisma.contract.findMany({
    where: { costCenterId: params.costCenterId },
    select: { id: true },
  });
  const contractIds = new Set(contracts.map((c) => c.id));
  if (params.contractId) contractIds.add(params.contractId);
  if (contractIds.size === 0) return [];

  const rows = await prisma.userContractPermission.findMany({
    where: { userId: { in: [...eligible] }, contractId: { in: [...contractIds] } },
    select: { userId: true },
  });
  return [...new Set(rows.map((r) => r.userId))];
}

/** Aprovadores da fila «Fichas de Demanda» para o contrato. */
export async function getFdApprovalNotifyUserIds(contractId: string): Promise<string[]> {
  const rows = await prisma.userFdApprovalContract.findMany({
    where: { contractId },
    select: { userId: true },
  });
  return [...new Set(rows.map((r) => r.userId))];
}

/** Aprovadores da fila «Requisições de Materiais» para o centro de custo. */
export async function getRmApprovalNotifyUserIds(costCenterId: string): Promise<string[]> {
  const [fullAccessIds, gestorContracts] = await Promise.all([
    userIdsWithModule(RM_APPROVE_MODULE_KEY),
    prisma.contract.findMany({ where: { costCenterId }, select: { id: true } }),
  ]);
  const contractIds = gestorContracts.map((c) => c.id);
  const gestorIds =
    contractIds.length === 0
      ? []
      : await prisma.userDpApprovalContract
          .findMany({ where: { contractId: { in: contractIds } }, select: { userId: true } })
          .then((rows) => rows.map((r) => r.userId));
  return [...new Set([...fullAccessIds, ...gestorIds])];
}

/** Aprovadores da fila «Ordens de Compra» na fase indicada. */
export async function getOcApprovalNotifyUserIds(params: {
  phase: 'compras' | 'gestor' | 'diretoria';
  costCenterId?: string | null;
}): Promise<string[]> {
  if (params.phase === 'compras') return userIdsWithModule(OC_APPROVE_COMPRAS_MODULE_KEY);
  if (params.phase === 'diretoria') return userIdsWithModule(OC_APPROVE_DIRETORIA_MODULE_KEY);

  if (!params.costCenterId) return [];
  const contracts = await prisma.contract.findMany({
    where: { costCenterId: params.costCenterId },
    select: { id: true },
  });
  const contractIds = contracts.map((c) => c.id);
  if (contractIds.length === 0) return [];
  const rows = await prisma.userDpApprovalContract.findMany({
    where: { contractId: { in: contractIds } },
    select: { userId: true },
  });
  return [...new Set(rows.map((r) => r.userId))];
}

/** Aprovadores da fila «Abastecimento» (fase gestor) para o contrato. */
export async function getFuelApprovalNotifyUserIds(contractId: string): Promise<string[]> {
  const rows = await prisma.userFuelApprovalContract.findMany({
    where: { contractId },
    select: { userId: true },
  });
  return [...new Set(rows.map((r) => r.userId))];
}
