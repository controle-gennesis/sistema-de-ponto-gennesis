import { pathToModuleKey, PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';
import { prisma } from './prisma';

/**
 * Trava do orçamento + FD: ao lançar a FD o orçamento fica trancado (status `aprovado` na meta).
 * Trancado, ninguém altera o orçamento nem a FD; só administrador ou quem tem
 * Controle → Aprovações → Destrancar orçamento e FD no centro de custo destranca.
 */
export const ORCAMENTO_UNLOCK_MODULE_KEY = pathToModuleKey('/ponto/controle/destrancar-orcamento-fd');

/** Status da meta que marca o orçamento trancado (mantido do fluxo antigo de FD aprovada). */
export const STATUS_ORCAMENTO_TRANCADO = 'aprovado';

/** Status a partir dos quais dá para trancar (aguardando aprovação = fluxo antigo, fica destrancado). */
const STATUS_PODE_TRANCAR = new Set(['finalizado', 'aguardando_aprovacao']);

export function statusDaSessao(sessao: unknown): string {
  if (!sessao || typeof sessao !== 'object') return '';
  const meta = (sessao as Record<string, unknown>).meta;
  if (!meta || typeof meta !== 'object') return '';
  return String((meta as Record<string, unknown>).statusAprovacao ?? '').trim().toLowerCase();
}

export function orcamentoTrancado(status: unknown): boolean {
  return String(status ?? '').trim().toLowerCase() === STATUS_ORCAMENTO_TRANCADO;
}

export function orcamentoPodeTrancar(status: unknown): boolean {
  return STATUS_PODE_TRANCAR.has(String(status ?? '').trim().toLowerCase());
}

export async function userCanUnlockOrcamento(
  userId: string,
  isAdmin: boolean,
  costCenterId: string
): Promise<boolean> {
  if (isAdmin) return true;
  if (!costCenterId) return false;
  const perm = await prisma.userPermission.findFirst({
    where: { userId, module: ORCAMENTO_UNLOCK_MODULE_KEY, action: PERMISSION_ACCESS_ACTION, allowed: true },
    select: { id: true },
  });
  if (!perm) return false;
  const cc = await prisma.userOrcamentoUnlockCostCenter.findFirst({
    where: { userId, costCenterId },
    select: { id: true },
  });
  return !!cc;
}

/**
 * Conteúdo do orçamento/FD que não muda com o orçamento trancado.
 * Fora daqui seguem gravando: cronograma (andamento), Qtd. compra / Valor unitário real (OCs pagas),
 * associação de materiais do pedido e preferências de tela.
 */
const SESSAO_PROTEGIDA = [
  'subtitulosNoOrcamento',
  'quantidadesPorItem',
  'formulasQuantidadePorItem',
  'dimensoesPorItem',
  'planilhaTipoInsumo',
  'observacoesPorItem',
  'moMatManualPorItem',
  'fichaDemandaObservacoes',
  'insumosAnaliticoManuais',
  'itensOcultosNoOrcamento',
  'insumosAnaliticoOcultos',
  'servicosDocumento',
] as const;

const META_PROTEGIDA = [
  'osNumeroPasta',
  'osCodigo',
  'numeroPasta',
  'obra',
  'isAditivo',
  'linkedPleitoId',
  'linkedContractId',
  'descontoPercentual',
  'bdiPercentual',
  'reajustes',
  'importadoPlanilha',
  'usarMemoriaCalculo',
  'temAnalitico',
  'modoArredondamento',
  'statusAprovacao',
  'fichaDemandaApprovalId',
  'congelado',
  'versao',
  'familiaId',
] as const;

function copiarChaves(
  destino: Record<string, unknown>,
  origem: Record<string, unknown>,
  chaves: readonly string[]
): void {
  for (const k of chaves) {
    if (k in origem) destino[k] = origem[k];
    else delete destino[k];
  }
}

function comoObjeto(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/**
 * Gravação recebida com o orçamento trancado: o que é protegido volta ao que está gravado
 * (inclusive a árvore de serviços); o resto da sessão segue normalmente.
 */
export function preservarConteudoTrancado(
  gravado: { sessaoOrcamento?: unknown },
  patch: { sessaoOrcamento?: unknown; servicos?: unknown[] }
): { sessaoOrcamento?: unknown; servicos?: unknown[] } {
  if (patch.sessaoOrcamento === undefined) return {};
  const sessaoGravada = comoObjeto(gravado.sessaoOrcamento);
  const sessao = { ...comoObjeto(patch.sessaoOrcamento) };
  copiarChaves(sessao, sessaoGravada, SESSAO_PROTEGIDA);
  const meta = { ...comoObjeto(sessao.meta) };
  copiarChaves(meta, comoObjeto(sessaoGravada.meta), META_PROTEGIDA);
  sessao.meta = meta;
  return { sessaoOrcamento: sessao };
}

/** Só o servidor tranca: a tela não grava o status de trancado por conta própria. */
export function impedirTrancarPelaTela(
  gravado: { sessaoOrcamento?: unknown },
  patch: { sessaoOrcamento?: unknown; servicos?: unknown[] }
): { sessaoOrcamento?: unknown; servicos?: unknown[] } {
  if (patch.sessaoOrcamento === undefined) return patch;
  if (!orcamentoTrancado(statusDaSessao(patch.sessaoOrcamento))) return patch;
  const sessao = { ...comoObjeto(patch.sessaoOrcamento) };
  const meta = { ...comoObjeto(sessao.meta) };
  const statusGravado = statusDaSessao(gravado.sessaoOrcamento);
  if (statusGravado) meta.statusAprovacao = statusGravado;
  else delete meta.statusAprovacao;
  sessao.meta = meta;
  return { ...patch, sessaoOrcamento: sessao };
}
