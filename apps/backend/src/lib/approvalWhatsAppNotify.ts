import { PERMISSION_ACCESS_ACTION, pathToModuleKey } from '@sistema-ponto/permission-modules';
import { prisma } from './prisma';
import { metaWhatsApp } from '../services/MetaWhatsAppService';
import { DP_APPROVE_MODULE_KEY } from './dpApprovalAccess';
import { isDfAdmLocalLabel, sanitizeDpApprovalSectors, sectorSolicitanteMatches } from './dpApprovalSectors';
import { OC_APPROVE_COMPRAS_MODULE_KEY, OC_APPROVE_DIRETORIA_MODULE_KEY } from './ocApprovalAccess';
import { RM_APPROVE_MODULE_KEY } from './rmApprovalAccess';
import { CONTRACTS_MODULE_KEY } from './contractAccess';

/** Igual ao gate de acesso da página Fila de Abastecimento (usePermissions.ts). */
const FUEL_SUPPLIES_QUEUE_MODULE_KEY = pathToModuleKey('/ponto/solicitacoes-combustivel');

/** Idioma cadastrado nos templates no Meta Business Manager. */
const TEMPLATE_LANGUAGE = 'pt_BR';

/**
 * Templates aprovados no Meta Business Manager (WhatsApp Manager > Modelos de mensagem).
 * Usar template — em vez de texto livre — é o que permite avisar alguém que nunca
 * conversou com o bot, ou que não fala há mais de 24h (fora dessa janela, a Meta bloqueia
 * mensagem de texto livre iniciada pela empresa).
 */
type ApprovalTemplateName =
  | 'nova_solicitacao_pendente'
  | 'solicitacao_aprovada'
  | 'solicitacao_rejeitada'
  | 'solicitacao_cancelada';

/** Envia sem lançar — falha de WhatsApp nunca deve derrubar a criação/decisão da solicitação. */
async function sendApprovalTemplate(
  phone: string,
  template: ApprovalTemplateName,
  bodyParams: string[]
): Promise<void> {
  try {
    await metaWhatsApp.sendTemplate(phone, template, TEMPLATE_LANGUAGE, bodyParams);
  } catch (err) {
    console.error('[ApprovalWhatsAppNotify] Falha ao enviar WhatsApp:', err);
  }
}

/** Telefones (Employee.phone) únicos e não vazios de uma lista de userIds. */
async function resolvePhonesForUserIds(userIds: string[]): Promise<string[]> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  if (uniqueIds.length === 0) return [];
  const employees = await prisma.employee.findMany({
    where: { userId: { in: uniqueIds }, phone: { not: null } },
    select: { phone: true },
  });
  return [...new Set(employees.map((e) => e.phone!.trim()).filter(Boolean))];
}

/** Nome de exibição do ator (aprovador/rejeitador), pra usar em mensagens de broadcast. */
export async function resolveActorName(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
  return user?.name?.trim() || 'alguém';
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

/**
 * Linha "Cancelada por Fulano." — ou "Você cancelou esta solicitação." quando quem cancelou
 * é o próprio solicitante.
 */
async function buildCancelledByLine(requesterUserId: string, actorUserId: string): Promise<string> {
  if (actorUserId === requesterUserId) return 'Você cancelou esta solicitação.';
  const actor = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: { name: true },
  });
  const name = actor?.name?.trim();
  return name ? `Cancelada por ${name}.` : 'Solicitação cancelada.';
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
    await sendApprovalTemplate(phone, 'solicitacao_aprovada', [params.subjectLine, approvedLine]);
  } catch (err) {
    console.error('[ApprovalWhatsAppNotify] Falha ao notificar aprovação ao solicitante:', err);
  }
}

/** Avisa o solicitante original (Employee.phone) que a solicitação dele foi cancelada. Nunca lança. */
export async function notifyRequesterCancelledWhatsApp(params: {
  requesterUserId: string;
  actorUserId: string;
  subjectLine: string;
}): Promise<void> {
  try {
    const employee = await prisma.employee.findFirst({
      where: { userId: params.requesterUserId, phone: { not: null } },
      select: { phone: true },
    });
    const phone = employee?.phone?.trim();
    if (!phone) return;
    const cancelledLine = await buildCancelledByLine(params.requesterUserId, params.actorUserId);
    await sendApprovalTemplate(phone, 'solicitacao_cancelada', [params.subjectLine, cancelledLine]);
  } catch (err) {
    console.error('[ApprovalWhatsAppNotify] Falha ao notificar cancelamento ao solicitante:', err);
  }
}

/** Avisa (template «nova_solicitacao_pendente») todo mundo com telefone cadastrado nos userIds dados. Nunca lança. */
export async function notifyNewPendingApprovalWhatsApp(
  userIds: string[],
  subjectLine: string
): Promise<void> {
  try {
    const phones = await resolvePhonesForUserIds(userIds);
    if (phones.length === 0) return;
    await Promise.allSettled(
      phones.map((phone) => sendApprovalTemplate(phone, 'nova_solicitacao_pendente', [subjectLine]))
    );
  } catch (err) {
    console.error('[ApprovalWhatsAppNotify] Falha ao resolver aprovadores (nova pendência):', err);
  }
}

/**
 * Avisa (template «solicitacao_aprovada» ou «solicitacao_rejeitada») todo mundo com telefone
 * cadastrado nos userIds dados sobre a decisão tomada. Nunca lança.
 */
export async function notifyApprovalDecisionWhatsApp(
  userIds: string[],
  subjectLine: string,
  decisionLine: string,
  approved: boolean
): Promise<void> {
  try {
    const phones = await resolvePhonesForUserIds(userIds);
    if (phones.length === 0) return;
    const template: ApprovalTemplateName = approved ? 'solicitacao_aprovada' : 'solicitacao_rejeitada';
    await Promise.allSettled(
      phones.map((phone) => sendApprovalTemplate(phone, template, [subjectLine, decisionLine]))
    );
  } catch (err) {
    console.error('[ApprovalWhatsAppNotify] Falha ao resolver aprovadores (decisão):', err);
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

/** Todo mundo com acesso à página Fila de Abastecimento (mesmo gate de usePermissions.ts). */
export async function getFuelSuppliesQueueAccessUserIds(): Promise<string[]> {
  const [permitted, admins] = await Promise.all([
    userIdsWithModule(FUEL_SUPPLIES_QUEUE_MODULE_KEY),
    prisma.employee.findMany({
      where: { position: { equals: 'administrador', mode: 'insensitive' } },
      select: { userId: true },
    }),
  ]);
  return [...new Set([...permitted, ...admins.map((a) => a.userId)])];
}
