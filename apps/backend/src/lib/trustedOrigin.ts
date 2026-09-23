/**
 * Checagem de origem confiável para CORS, compartilhada por todo o backend.
 *
 * Antes cada arquivo repetia `origin.includes('gennesisconecta.com.br')`, que também
 * aceita domínios como `https://gennesisconecta.com.br.atacante.io` (o `.includes` casa
 * qualquer substring, não só o domínio real). Aqui comparamos o hostname exato via
 * `new URL(origin).hostname`, então só o domínio verdadeiro (ou um subdomínio dele) passa.
 */

const TRUSTED_HOSTS = new Set(['gennesisconecta.com.br', 'www.gennesisconecta.com.br']);
const TRUSTED_HOST_SUFFIXES = ['.gennesisconecta.com.br', '.railway.app'];
const TRUSTED_LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

export function isTrustedOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;

  let hostname: string;
  try {
    hostname = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }

  if (TRUSTED_HOSTS.has(hostname)) return true;
  if (TRUSTED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) return true;
  if (TRUSTED_LOCAL_HOSTS.has(hostname)) return true;

  return false;
}
