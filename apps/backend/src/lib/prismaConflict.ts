import { Prisma } from '@prisma/client';

/**
 * Detecta o erro P2025 do Prisma (nenhum registro bateu com o `where` de um update/delete) —
 * usado nos fluxos de aprovação como sinal de que uma requisição concorrente (duplo clique,
 * retry de rede) já alterou o status do registro entre a leitura e a escrita.
 * Controllers que não repassam erros pro errorHandler global (via `next(error)`) devem
 * checar isso no próprio catch e responder 409.
 */
export function isConcurrentUpdateConflict(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025'
  );
}

export const CONCURRENT_UPDATE_CONFLICT_MESSAGE =
  'Este registro já foi alterado por outra ação (por exemplo, já aprovado/rejeitado por outra pessoa). Atualize a página e tente novamente.';
