export function isNetworkError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  // Não usar "typeerror" sozinho aqui: TypeError também é lançado por bugs de código
  // (ex.: acesso a propriedade de um retorno de API inesperado) que não têm nada a
  // ver com conectividade — isso fazia erros reais serem tratados como "sem internet"
  // e enfileirados silenciosamente em vez de mostrados ao usuário.
  return /network|failed to fetch|network request failed|timeout|offline|sem conexão|sem rede|econnrefused|enotfound|internet|timed out/i.test(
    msg
  );
}
