/**
 * Tempo máximo padrão para chamadas `fetch` que não definiram o próprio (Google, Sinapi, Anthropic,
 * Expo push etc.). Sem isso, uma API externa que trava deixa a requisição do usuário pendurada para
 * sempre. Quem já passa `signal` continua com o seu. Override: FETCH_DEFAULT_TIMEOUT_MS.
 */
const DEFAULT_TIMEOUT_MS = 90_000;

function limitMs(): number {
  const n = Number.parseInt(String(process.env.FETCH_DEFAULT_TIMEOUT_MS ?? ''), 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
}

const nativeFetch = globalThis.fetch;

if (typeof nativeFetch === 'function' && !(nativeFetch as { __comTimeout?: boolean }).__comTimeout) {
  const withTimeout = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    // Request pronto traz o próprio signal; e quem já passou `signal` decide sozinho.
    if (init?.signal || (typeof Request !== 'undefined' && input instanceof Request)) {
      return nativeFetch(input, init);
    }
    return nativeFetch(input, { ...init, signal: AbortSignal.timeout(limitMs()) });
  }) as typeof fetch & { __comTimeout?: boolean };
  withTimeout.__comTimeout = true;
  globalThis.fetch = withTimeout;
}

export {};
