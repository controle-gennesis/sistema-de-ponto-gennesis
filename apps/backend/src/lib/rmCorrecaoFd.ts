import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from './prisma';

/**
 * Correções da RM (troca de material e/ou quantidade, item cancelado):
 * - grava o histórico (quem, quando, o que mudou) em `material_request_correction_logs`;
 * - espelha a correção nos itens pedidos da FD de onde a RM saiu (`demandSheetApproval.itensPedidos`).
 * Não altera o fluxo da RM nem o TOTVS.
 */

export type FdCorrecaoAlteracao = {
  campo: 'material' | 'quantidade' | 'cancelado';
  de?: string;
  para?: string;
};

export type FdCorrecaoRegistro = {
  em: string;
  por: string;
  alteracoes: FdCorrecaoAlteracao[];
};

export type RmCorrecaoLog = {
  id: string;
  materialRequestId: string;
  materialId: string | null;
  previousMaterialId: string | null;
  userId: string;
  userName: string | null;
  changes: FdCorrecaoAlteracao[];
  createdAt: string;
};

/** Uma linha da RM corrigida: material antes → depois (null = item cancelado/removido). */
export type RmLinhaCorrigida = {
  previousMaterialId: string;
  materialId: string | null;
  materialLabel?: string;
  unit?: string;
  /** Quantidade nova da linha da RM (soma de todos os itens da FD que ela atende). */
  quantity?: number;
  /** Quantidade anterior da linha (para repartir entre os itens da FD). */
  previousQuantity?: number;
  alteracoes: FdCorrecaoAlteracao[];
};

const fmtQtd = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 4 });

export function descreverQuantidade(qtd: number, unidade: string): string {
  return `${fmtQtd(qtd)} ${unidade}`.trim();
}

export async function nomeDoUsuario(userId: string): Promise<string> {
  try {
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { name: true } });
    return u?.name?.trim() || '';
  } catch {
    return '';
  }
}

/** Rótulo do material como na FD ("código — nome"). */
export async function rotuloDoMaterial(materialId: string): Promise<string> {
  try {
    const m = await prisma.engineeringMaterial.findUnique({
      where: { id: materialId },
      select: { sinapiCode: true, name: true, description: true },
    });
    if (!m) return '';
    const nome = (m.name || m.description || '').trim();
    const code = (m.sinapiCode || '').trim();
    return code && nome && code !== nome ? `${code} — ${nome}` : nome || code;
  } catch {
    return '';
  }
}

export async function registrarCorrecaoRm(params: {
  materialRequestId: string;
  materialId: string | null;
  previousMaterialId: string | null;
  userId: string;
  userName: string;
  changes: FdCorrecaoAlteracao[];
}): Promise<void> {
  if (params.changes.length === 0) return;
  try {
    await prisma.$executeRaw`
      INSERT INTO "material_request_correction_logs"
        ("id", "materialRequestId", "materialId", "previousMaterialId", "userId", "userName", "changes", "createdAt")
      VALUES (${randomUUID()}, ${params.materialRequestId}, ${params.materialId}, ${params.previousMaterialId},
        ${params.userId}, ${params.userName || null}, ${JSON.stringify(params.changes)}::jsonb, NOW())
    `;
  } catch (err) {
    console.warn('[RM correção] Falha ao gravar histórico:', err);
  }
}

export async function listarCorrecoesRm(materialRequestId: string): Promise<RmCorrecaoLog[]> {
  try {
    const rows = await prisma.$queryRaw<
      Array<{
        id: string;
        materialRequestId: string;
        materialId: string | null;
        previousMaterialId: string | null;
        userId: string;
        userName: string | null;
        changes: unknown;
        createdAt: Date;
      }>
    >`
      SELECT "id", "materialRequestId", "materialId", "previousMaterialId", "userId", "userName", "changes", "createdAt"
      FROM "material_request_correction_logs"
      WHERE "materialRequestId" = ${materialRequestId}
      ORDER BY "createdAt" ASC
    `;
    return rows.map((r) => ({
      ...r,
      changes: Array.isArray(r.changes) ? (r.changes as FdCorrecaoAlteracao[]) : [],
      createdAt: r.createdAt.toISOString(),
    }));
  } catch {
    return [];
  }
}

type Obj = Record<string, unknown>;

function recalcularItem(entry: Obj): Obj {
  const materiais = (Array.isArray(entry.materiais) ? entry.materiais : []) as Obj[];
  const unidadeFd = String(entry.unidadeFd || '');
  const alertas: string[] = [];
  if (materiais.length > 1) alertas.push('1:N');
  if (materiais.some((m) => String(m.unit || '') !== unidadeFd)) alertas.push('unidade');
  return {
    ...entry,
    materiais,
    quantidade: materiais.reduce((s, m) => s + (Number(m.quantity) || 0), 0),
    quantidadeNaUnidadeFd: materiais
      .filter((m) => String(m.unit || '') === unidadeFd)
      .reduce((s, m) => s + (Number(m.quantity) || 0), 0),
    alertas,
  };
}

/**
 * Espelha linhas corrigidas da RM nos itens pedidos da FD. Uma linha da RM pode atender vários itens
 * da FD (mesmo material somado): a quantidade nova é repartida na proporção do que cada item pedia.
 * Item da FD que fica sem material sai da lista (volta a ficar livre para um novo pedido).
 */
export async function espelharCorrecaoNaFd(params: {
  materialRequestId: string;
  requestNumber?: string;
  linhas: RmLinhaCorrigida[];
  por: string;
}): Promise<void> {
  const { materialRequestId, linhas } = params;
  if (linhas.length === 0) return;
  try {
    const fds = await prisma.demandSheetApproval.findMany({
      where: { itensPedidos: { array_contains: [{ materialRequestId }] } },
      select: { id: true, itensPedidos: true, numMovRm: true },
    });
    const em = new Date().toISOString();
    for (const fd of fds) {
      if (!Array.isArray(fd.itensPedidos)) continue;
      const brutos = fd.itensPedidos as unknown as Obj[];
      let mudou = false;
      const atualizados: Obj[] = [];
      for (const raw of brutos) {
        if (!raw || typeof raw !== 'object' || String(raw.materialRequestId || '') !== materialRequestId) {
          atualizados.push(raw);
          continue;
        }
        let entry: Obj = { ...raw };
        const alteracoesDoItem: FdCorrecaoAlteracao[] = [];
        for (const linha of linhas) {
          const materiais = (Array.isArray(entry.materiais) ? entry.materiais : []) as Obj[];
          const idx = materiais.findIndex((m) => String(m.materialId || '') === linha.previousMaterialId);
          if (idx < 0) continue;
          const atual = materiais[idx];
          const novos = [...materiais];
          if (linha.materialId === null) {
            novos.splice(idx, 1);
          } else {
            let quantidade = Number(atual.quantity) || 0;
            if (linha.quantity != null && Number.isFinite(linha.quantity)) {
              const anterior = Number(linha.previousQuantity) || 0;
              quantidade =
                anterior > 0 ? Math.round(((quantidade / anterior) * linha.quantity) * 10000) / 10000 : linha.quantity;
            }
            novos[idx] = {
              ...atual,
              materialId: linha.materialId,
              ...(linha.materialLabel ? { materialLabel: linha.materialLabel } : {}),
              ...(linha.unit ? { unit: linha.unit } : {}),
              quantity: quantidade,
            };
          }
          entry = { ...entry, materiais: novos };
          alteracoesDoItem.push(...linha.alteracoes);
        }
        if (alteracoesDoItem.length === 0) {
          atualizados.push(raw);
          continue;
        }
        mudou = true;
        entry = recalcularItem(entry);
        const historico = Array.isArray(entry.correcoes) ? (entry.correcoes as FdCorrecaoRegistro[]) : [];
        entry.correcoes = [...historico, { em, por: params.por, alteracoes: alteracoesDoItem }];
        if ((entry.materiais as Obj[]).length > 0) atualizados.push(entry);
      }
      if (!mudou) continue;
      // RM sem nenhum item restante na FD: o número dela sai do "Nº Mov.".
      const aindaTemRm = atualizados.some((r) => r && String(r.materialRequestId || '') === materialRequestId);
      const numMovRm =
        aindaTemRm || !params.requestNumber
          ? fd.numMovRm
          : String(fd.numMovRm || '')
              .split(',')
              .map((x) => x.trim())
              .filter((x) => x && x !== params.requestNumber)
              .join(', ');
      await prisma.demandSheetApproval.update({
        where: { id: fd.id },
        data: { itensPedidos: atualizados as unknown as Prisma.InputJsonValue, numMovRm },
      });
    }
  } catch (err) {
    console.warn('[RM correção] Falha ao atualizar a FD:', err);
  }
}
