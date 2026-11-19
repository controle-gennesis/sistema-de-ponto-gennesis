import { prisma } from './prisma';

type OsKey = { divSe?: string | null; folderNumber?: string | null };

const norm = (v: unknown) => String(v ?? '').trim();
const same = (a: unknown, b: unknown) => norm(a).toLowerCase() === norm(b).toLowerCase();

/**
 * O Diário de Obra guarda uma cópia da OS (SE e Pasta). Quando a OS muda no contrato
 * (ex.: OS temporária do orçamento vira a OS definitiva), atualiza os diários da obra
 * que apontavam para o valor antigo. Nunca derruba a operação principal.
 */
export async function propagateOsChangeToDiarios(
  contratoId: string | null | undefined,
  from: OsKey,
  to: OsKey
): Promise<void> {
  try {
    const fromDiv = norm(from.divSe);
    const fromFolder = norm(from.folderNumber);
    const toDiv = norm(to.divSe);
    const toFolder = norm(to.folderNumber);
    if (!contratoId || (!fromDiv && !fromFolder)) return;
    if (same(fromDiv, toDiv) && same(fromFolder, toFolder)) return;
    await prisma.diarioObra.updateMany({
      where: {
        obra: { contratoId },
        osDivSe: { equals: fromDiv, mode: 'insensitive' },
        ...(fromFolder
          ? { osFolder: { equals: fromFolder, mode: 'insensitive' as const } }
          : { OR: [{ osFolder: null }, { osFolder: '' }] }),
      },
      data: { osDivSe: toDiv || null, osFolder: toFolder || null },
    });
  } catch (e) {
    console.warn('[diarioObraOsSync] falha ao propagar a OS para os diários:', e);
  }
}
