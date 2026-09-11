import { Prisma, type DpContabilidadeRequestType, type DpRequest } from '@prisma/client';
import { prisma } from './prisma';

const INTERNA_TYPE_LABELS: Record<string, string> = {
  ADMISSAO: 'Admissão',
  FERIAS: 'Férias',
  RESCISAO: 'Rescisão',
  ALTERACAO_FUNCAO_SALARIO: 'Alteração de função/salário',
  RETIFICACAO_ALOCACAO: 'Retificação de alocação',
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

function buildDescription(row: DpRequest, contractName: string | null, conclusionComment: string): string {
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

export async function createDpContabilidadeFromConcludedInterna(
  row: DpRequest,
  actor: { id: string; name: string }
): Promise<boolean> {
  const requestType = mapInternaTypeToContabilidade(row);
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

  const conclusionComment = (row.dpConclusionComment || row.dpFeedback || '').trim();
  const description = buildDescription(row, contractName, conclusionComment);

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
            body: `Solicitação interna nº ${row.displayNumber} encaminhada automaticamente à Contabilidade.`,
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
    return true;
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return false;
    }
    throw err;
  }
}
