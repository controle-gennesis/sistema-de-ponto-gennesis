import { Prisma, type DpContabilidadeRequestType, type DpRequest } from '@prisma/client';
import { prisma } from './prisma';
import { accountingTypeOfDirect, isAccountingDirectRequestType } from './dpRequestDetails';
import { savePersistentUpload, deletePersistentUpload } from './persistentUpload';
import { listDpContabilidadeUserIds } from './dpContabilidadeAccess';
import { sendPushToUsers } from '../services/PushNotificationService';

const INTERNA_TYPE_LABELS: Record<string, string> = {
  ADMISSAO: 'Admissão',
  FERIAS: 'Férias',
  RESCISAO: 'Rescisão',
  ALTERACAO_FUNCAO_SALARIO: 'Alteração de função/salário',
  RETIFICACAO_ALOCACAO: 'Retificação de alocação',
  CONVENCAO_COLETIVA: 'Convenção coletiva / CCT',
  FECHAMENTO_FOLHA: 'Fechamento da folha',
  IMPOSTOS_ENCARGOS: 'Impostos / encargos da folha',
  REALOCACAO_COLABORADOR: 'Realocação de colaborador',
  RETIFICACAO_RECALCULO: 'Retificação / recálculo',
  SOLICITACAO_GERAL: 'Solicitação geral',
  CONTAB_ADMISSAO: 'Admissão',
  CONTAB_AFASTAMENTO: 'Afastamento',
  CONTAB_ALTERACAO_FUNCAO: 'Alteração de função',
  CONTAB_ALTERACAO_SALARIAL: 'Alteração salarial',
  CONTAB_FERIAS: 'Férias',
  CONTAB_RESCISAO: 'Rescisão',
};

function mapInternaTypeToContabilidade(row: DpRequest): DpContabilidadeRequestType | null {
  switch (row.requestType) {
    case 'ADMISSAO':
      return 'ADMISSAO';
    case 'FERIAS':
      return 'FERIAS';
    case 'RESCISAO':
      return 'RESCISAO';
    case 'RETIFICACAO_ALOCACAO':
      return 'REALOCACAO_COLABORADOR';
    case 'ALTERACAO_FUNCAO_SALARIO': {
      const details = row.details as { alteracoes?: Array<{ tipoAlteracaoFuncaoOuSalario?: string }> } | null;
      const kinds = (details?.alteracoes ?? []).map((item) => item.tipoAlteracaoFuncaoOuSalario);
      if (kinds.includes('SALARIO') && !kinds.includes('FUNCAO')) return 'ALTERACAO_SALARIAL';
      return 'ALTERACAO_FUNCAO';
    }
    default:
      return null;
  }
}

/**
 * Envio automático para a Contabilidade ao finalizar no DP: DESLIGADO. O DP só finaliza; a Contabilidade
 * passa a ter uma etapa própria (a definir), antes da finalização. Para reativar o envio, volte para `true`.
 */
export const ENVIO_AUTOMATICO_CONTABILIDADE = false;

/** O tipo da solicitação gera pedido no Atendimento Contábil ao ser finalizada pelo DP? */
export function dpRequestGoesToAccounting(row: DpRequest): boolean {
  return ENVIO_AUTOMATICO_CONTABILIDADE && mapInternaTypeToContabilidade(row) !== null;
}

/** IDs de solicitações internas que já têm pedido correspondente no Atendimento Contábil. */
export async function findDpRequestIdsLinkedToAccounting(ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await prisma.$queryRaw<{ sourceDpRequestId: string }[]>`
    SELECT "sourceDpRequestId" FROM "dp_contabilidade_requests"
    WHERE "sourceDpRequestId" = ANY(${ids}::text[])
  `;
  return new Set(rows.map((r) => r.sourceDpRequestId));
}

/** Anexo recebido na criação (Base64) -> grava no S3 e devolve só a referência. */
type AccountingAttachmentInput = {
  fileName: string;
  mimeType: string;
  dataBase64: string;
  tipoArquivo?: string;
  dataValidade?: string;
};

export type StoredAccountingAttachment = {
  fileName: string;
  mimeType: string;
  tipoArquivo?: string;
  dataValidade?: string;
  url: string;
  key: string;
};

/**
 * Troca os anexos em Base64 de `details.anexos` por referências no armazenamento persistente (S3).
 * Devolve também as chaves gravadas, para o chamador remover se a criação falhar depois.
 */
export async function storeAccountingAttachments(
  details: Record<string, unknown>,
  opts?: { folder?: string; fileNamePrefix?: string }
): Promise<{ details: Record<string, unknown>; storedKeys: string[] }> {
  const raw = details.anexos;
  if (!Array.isArray(raw) || raw.length === 0) {
    const { anexos: _drop, ...rest } = details;
    return { details: rest, storedKeys: [] };
  }

  const stored: StoredAccountingAttachment[] = [];
  const storedKeys: string[] = [];
  try {
    for (const item of raw as AccountingAttachmentInput[]) {
      const saved = await savePersistentUpload({
        folder: opts?.folder ?? 'dp-contabilidade',
        buffer: Buffer.from(item.dataBase64, 'base64'),
        originalName: item.fileName,
        mimeType: item.mimeType,
        fileNamePrefix: opts?.fileNamePrefix ?? 'contab-',
        includeSafeOriginalName: true,
      });
      storedKeys.push(saved.key);
      stored.push({
        fileName: item.fileName,
        mimeType: item.mimeType,
        ...(item.tipoArquivo ? { tipoArquivo: item.tipoArquivo } : {}),
        ...(item.dataValidade ? { dataValidade: item.dataValidade } : {}),
        url: saved.url,
        key: saved.key,
      });
    }
  } catch (err) {
    await Promise.all(storedKeys.map((key) => deletePersistentUpload(key).catch(() => undefined)));
    throw err;
  }
  return { details: { ...details, anexos: stored }, storedKeys };
}

export async function deleteStoredAccountingAttachments(keys: string[]): Promise<void> {
  await Promise.all(keys.map((key) => deletePersistentUpload(key).catch(() => undefined)));
}

function strField(details: Record<string, unknown> | null, key: string): string {
  const value = details?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

/** Texto livre principal do pedido direto (usado na descrição e na busca do Atendimento Contábil). */
function directMainText(row: DpRequest): string {
  const details = (row.details ?? null) as Record<string, unknown> | null;
  const parts = [
    strField(details, 'assunto'),
    strField(details, 'observacoes'),
    strField(details, 'descricao'),
    strField(details, 'motivo'),
  ].filter(Boolean);
  return parts.join('\n');
}

function buildConcludedDescription(
  row: DpRequest,
  contractName: string | null,
  conclusionComment: string
): string {
  const typeLabel = INTERNA_TYPE_LABELS[row.requestType] || row.requestType;
  const lines = [
    `Gerada automaticamente ao finalizar a solicitação interna nº ${row.displayNumber}.`,
    `Tipo: ${typeLabel}`,
    `Solicitante: ${row.solicitanteNome}${row.solicitanteEmail ? ` (${row.solicitanteEmail})` : ''}`,
    row.sectorSolicitante ? `Setor: ${row.sectorSolicitante}` : '',
    contractName ? `Contrato: ${contractName}` : '',
    row.title ? `Título: ${row.title}` : '',
    conclusionComment ? `Comentário do DP: ${conclusionComment}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

function buildDirectDescription(row: DpRequest, contractName: string | null): string {
  const typeLabel = INTERNA_TYPE_LABELS[row.requestType] || row.requestType;
  const lines = [
    `Criada diretamente para a Contabilidade na solicitação interna nº ${row.displayNumber}.`,
    `Tipo: ${typeLabel}`,
    `Solicitante: ${row.solicitanteNome}${row.solicitanteEmail ? ` (${row.solicitanteEmail})` : ''}`,
    row.sectorSolicitante ? `Setor: ${row.sectorSolicitante}` : '',
    contractName ? `Contrato: ${contractName}` : '',
    directMainText(row),
  ];
  return lines.filter(Boolean).join('\n');
}

type MirrorMode = 'concluded' | 'direct';

async function createLinkedAccountingRequest(
  row: DpRequest,
  actor: { id: string; name: string },
  mode: MirrorMode
): Promise<boolean> {
  if (mode === 'concluded' && !ENVIO_AUTOMATICO_CONTABILIDADE) return false;
  const requestType: DpContabilidadeRequestType | null =
    mode === 'direct'
      ? isAccountingDirectRequestType(row.requestType)
        ? (accountingTypeOfDirect(row.requestType) as DpContabilidadeRequestType)
        : null
      : mapInternaTypeToContabilidade(row);
  if (!requestType) return false;

  const alreadyLinked = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM "dp_contabilidade_requests"
    WHERE "sourceDpRequestId" = ${row.id}
    LIMIT 1
  `;
  if (alreadyLinked.length > 0) return false;

  let contractName: string | null = null;
  if (row.contractId) {
    const contract = await prisma.contract.findUnique({
      where: { id: row.contractId },
      select: { name: true },
    });
    contractName = contract?.name ?? null;
  }

  const employee = await prisma.employee.findUnique({
    where: { id: row.employeeId },
    select: { userId: true },
  });

  const last = await prisma.dpContabilidadeRequest.findFirst({
    orderBy: { displayNumber: 'desc' },
    select: { displayNumber: true },
  });

  const description =
    mode === 'direct'
      ? buildDirectDescription(row, contractName)
      : buildConcludedDescription(row, contractName, (row.dpConclusionComment || row.dpFeedback || '').trim());
  const firstComment =
    mode === 'direct'
      ? `Solicitação interna nº ${row.displayNumber} enviada diretamente à Contabilidade.`
      : `Solicitação interna nº ${row.displayNumber} encaminhada automaticamente à Contabilidade.`;

  try {
    const created = await prisma.dpContabilidadeRequest.create({
      data: {
        displayNumber: (last?.displayNumber ?? 0) + 1,
        createdByUserId: employee?.userId || actor.id,
        createdByName: row.solicitanteNome || actor.name,
        createdByEmail: row.solicitanteEmail || '',
        sector: row.sectorSolicitante || null,
        requestType,
        title: row.title?.trim() || INTERNA_TYPE_LABELS[row.requestType] || 'Solicitação interna',
        description,
        contractId: row.contractId || null,
        contractName,
        status: 'OPEN',
        comments: {
          create: {
            userId: actor.id,
            userName: actor.name,
            body: firstComment,
          },
        },
      },
      select: { id: true },
    });
    await prisma.$executeRaw`
      UPDATE "dp_contabilidade_requests"
      SET "sourceDpRequestId" = ${row.id}
      WHERE id = ${created.id}
    `;
    void listDpContabilidadeUserIds()
      .then((ids) =>
        sendPushToUsers(ids, {
          title: 'Atendimento Contábil',
          body: `Novo pedido: ${row.title?.trim() || INTERNA_TYPE_LABELS[row.requestType] || 'Solicitação interna'}`,
          data: { type: 'dp-contabilidade', id: created.id },
        }),
      )
      .catch(() => undefined);
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return false;
    }
    throw err;
  }
}

/** DP finalizou uma solicitação interna de tipo que segue para a Contabilidade. */
export function createDpContabilidadeFromConcludedInterna(
  row: DpRequest,
  actor: { id: string; name: string }
): Promise<boolean> {
  return createLinkedAccountingRequest(row, actor, 'concluded');
}

/** Solicitação interna criada direto para a Contabilidade (sem gestor/DP). */
export function createDpContabilidadeFromDirectInterna(
  row: DpRequest,
  actor: { id: string; name: string }
): Promise<boolean> {
  return createLinkedAccountingRequest(row, actor, 'direct');
}
