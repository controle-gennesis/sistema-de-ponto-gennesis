import { v4 as uuidv4 } from 'uuid';
import { licitacaoService } from './LicitacaoService';
import { savePersistentUpload, deletePersistentUpload } from '../lib/persistentUpload';
import {
  emptyOrcamentoRegistro,
  getLicitacaoOrcamentoByLicitacaoId,
  normalizeOrcamentoRegistro,
  upsertLicitacaoOrcamento,
  type LicitacaoOrcamentoAnexo,
  type LicitacaoOrcamentoRecord,
  type LicitacaoOrcamentoRegistro,
} from './licitacaoOrcamentoStore';

const UPLOAD_FOLDER = 'licitacao-orcamentos';
const MAX_FILE_SIZE = 15 * 1024 * 1024;

function assertLicitacaoLiberadaParaOrcamento(licitacao: {
  arquivada?: boolean | null;
  arquivadaMotivo?: string | null;
}) {
  if (licitacao.arquivada !== true || licitacao.arquivadaMotivo !== 'orcamento') {
    throw new Error('Orçamento liberado apenas para licitações com status Orçamento.');
  }
}

function registroFromBody(raw: unknown, current: LicitacaoOrcamentoRegistro): LicitacaoOrcamentoRegistro {
  const parsed = normalizeOrcamentoRegistro(
    raw && typeof raw === 'object' ? { ...current, ...(raw as object), mode: 'externo' } : current
  );
  return {
    ...parsed,
    anexos: current.anexos,
  };
}

export async function getOrCreateLicitacaoOrcamentoView(
  licitacaoId: string
): Promise<LicitacaoOrcamentoRecord & { draft: boolean }> {
  const licitacao = await licitacaoService.getById(licitacaoId);
  if (!licitacao) throw new Error('Licitação não encontrada');
  assertLicitacaoLiberadaParaOrcamento(licitacao);

  const existing = await getLicitacaoOrcamentoByLicitacaoId(licitacaoId);
  if (existing) {
    return { ...existing, draft: false };
  }

  return {
    id: '',
    licitacaoId,
    registro: emptyOrcamentoRegistro(),
    createdBy: null,
    updatedBy: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    draft: true,
  };
}

export async function saveLicitacaoOrcamentoForLicitacao(params: {
  licitacaoId: string;
  registro: unknown;
  userId: string;
}): Promise<LicitacaoOrcamentoRecord & { draft: boolean }> {
  const licitacao = await licitacaoService.getById(params.licitacaoId);
  if (!licitacao) throw new Error('Licitação não encontrada');
  assertLicitacaoLiberadaParaOrcamento(licitacao);

  const existing = await getLicitacaoOrcamentoByLicitacaoId(params.licitacaoId);
  const current = existing?.registro ?? emptyOrcamentoRegistro();
  const registro = registroFromBody(params.registro, current);

  const saved = await upsertLicitacaoOrcamento({
    licitacaoId: params.licitacaoId,
    registro,
    userId: params.userId,
  });

  return { ...saved, draft: false };
}

export async function addLicitacaoOrcamentoAnexo(params: {
  licitacaoId: string;
  userId: string;
  file: { buffer: Buffer; originalname: string; mimetype: string; size: number };
}): Promise<LicitacaoOrcamentoRecord & { draft: boolean }> {
  const licitacao = await licitacaoService.getById(params.licitacaoId);
  if (!licitacao) throw new Error('Licitação não encontrada');
  assertLicitacaoLiberadaParaOrcamento(licitacao);

  if (!params.file.buffer?.length) throw new Error('Selecione um arquivo');
  if (params.file.size > MAX_FILE_SIZE) throw new Error('Arquivo muito grande. Máximo: 15 MB');

  const savedFile = await savePersistentUpload({
    folder: UPLOAD_FOLDER,
    buffer: params.file.buffer,
    originalName: params.file.originalname,
    mimeType: params.file.mimetype,
    includeSafeOriginalName: true,
  });

  const anexo: LicitacaoOrcamentoAnexo = {
    id: uuidv4(),
    name: params.file.originalname || savedFile.fileName,
    url: savedFile.url,
    mimeType: params.file.mimetype || 'application/octet-stream',
    size: params.file.size,
    uploadedAt: new Date().toISOString(),
  };

  const existing = await getLicitacaoOrcamentoByLicitacaoId(params.licitacaoId);
  const registro = existing?.registro ?? emptyOrcamentoRegistro();
  const saved = await upsertLicitacaoOrcamento({
    licitacaoId: params.licitacaoId,
    registro: { ...registro, anexos: [...registro.anexos, anexo] },
    userId: params.userId,
  });

  return { ...saved, draft: false };
}

export async function removeLicitacaoOrcamentoAnexo(params: {
  licitacaoId: string;
  anexoId: string;
  userId: string;
}): Promise<LicitacaoOrcamentoRecord & { draft: boolean }> {
  const licitacao = await licitacaoService.getById(params.licitacaoId);
  if (!licitacao) throw new Error('Licitação não encontrada');
  assertLicitacaoLiberadaParaOrcamento(licitacao);

  const existing = await getLicitacaoOrcamentoByLicitacaoId(params.licitacaoId);
  if (!existing) throw new Error('Orçamento não encontrado');

  const anexo = existing.registro.anexos.find((item) => item.id === params.anexoId);
  if (!anexo) throw new Error('Anexo não encontrado');

  const saved = await upsertLicitacaoOrcamento({
    licitacaoId: params.licitacaoId,
    registro: {
      ...existing.registro,
      anexos: existing.registro.anexos.filter((item) => item.id !== params.anexoId),
    },
    userId: params.userId,
  });

  await deletePersistentUpload(anexo.url);

  return { ...saved, draft: false };
}

export async function getOrcamentoLineTemplate() {
  return { expenseTypes: [], lines: [] };
}

export async function putOrcamentoLineTemplate(_raw: unknown) {
  return { expenseTypes: [], lines: [] };
}
