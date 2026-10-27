/**
 * Botão "Atualizar base": cada lista do TOTVS só pode ser atualizada manualmente a cada 10 minutos
 * (vale para todos os usuários — protege o servidor do RM de cliques repetidos).
 */
export const TOTVS_ATUALIZACAO_MANUAL_INTERVALO_MS = 10 * 60 * 1000;

export type BaseTotvs = 'fornecedores' | 'materiais' | 'condicoes-pagamento' | 'locais-estoque';

const ultimaAtualizacao = new Map<BaseTotvs, number>();

/**
 * Reserva a atualização manual da base. Devolve null se pode atualizar agora (e marca o horário),
 * ou quanto falta esperar.
 */
export function reservarAtualizacaoManual(
  base: BaseTotvs
): { segundosRestantes: number; mensagem: string; liberaEm: string } | null {
  const agora = Date.now();
  const ultima = ultimaAtualizacao.get(base);
  if (ultima && agora - ultima < TOTVS_ATUALIZACAO_MANUAL_INTERVALO_MS) {
    const liberaEm = ultima + TOTVS_ATUALIZACAO_MANUAL_INTERVALO_MS;
    const segundosRestantes = Math.ceil((liberaEm - agora) / 1000);
    const minutos = Math.ceil(segundosRestantes / 60);
    return {
      segundosRestantes,
      liberaEm: new Date(liberaEm).toISOString(),
      mensagem: `Esta base já foi atualizada há pouco. Aguarde ${minutos} min para atualizar de novo.`,
    };
  }
  ultimaAtualizacao.set(base, agora);
  return null;
}

/** Horário em que a próxima atualização manual será liberada (para o front travar o botão). */
export function proximaAtualizacaoManual(base: BaseTotvs): string | null {
  const ultima = ultimaAtualizacao.get(base);
  return ultima ? new Date(ultima + TOTVS_ATUALIZACAO_MANUAL_INTERVALO_MS).toISOString() : null;
}
