/**
 * Mescla de três vias para o orçamento (mesma ideia do `git merge`): junta o que eu alterei
 * com o que outra pessoa alterou, a partir da última versão que as duas pessoas tinham em comum.
 *
 * - Alterou só um lado: vale esse lado.
 * - Objetos (mapas por item, cores, observações...): mescla chave por chave, então duas pessoas
 *   mexendo em itens diferentes não se atrapalham.
 * - Mesmo valor mexido pelas duas: vale a minha alteração (quem salvou por último).
 * - Listas e valores simples são tratados como um bloco só.
 */

function ehObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function iguais(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) if (!iguais(a[i], b[i])) return false;
    return true;
  }
  if (ehObjeto(a)) {
    if (!ehObjeto(b)) return false;
    const chavesA = Object.keys(a);
    if (chavesA.length !== Object.keys(b).length) return false;
    for (const k of chavesA) {
      if (!Object.prototype.hasOwnProperty.call(b, k) || !iguais(a[k], b[k])) return false;
    }
    return true;
  }
  return false;
}

export function mesclarTresVias<T>(base: unknown, meu: T, remoto: unknown): T {
  if (iguais(meu, remoto)) return meu;
  if (iguais(meu, base)) return remoto as T;
  if (iguais(remoto, base)) return meu;
  if (ehObjeto(meu) && ehObjeto(remoto)) {
    const b = ehObjeto(base) ? base : {};
    const saida: Record<string, unknown> = {};
    const chaves = new Set([...Object.keys(meu), ...Object.keys(remoto)]);
    for (const k of chaves) {
      const noMeu = Object.prototype.hasOwnProperty.call(meu, k);
      const noRemoto = Object.prototype.hasOwnProperty.call(remoto, k);
      const naBase = Object.prototype.hasOwnProperty.call(b, k);
      if (noMeu && noRemoto) {
        saida[k] = mesclarTresVias(b[k], meu[k], remoto[k]);
      } else if (noMeu) {
        // O outro lado apagou: só apaga se eu não mexi nesse item.
        if (naBase && iguais(b[k], meu[k])) continue;
        saida[k] = meu[k];
      } else if (noRemoto) {
        // Eu apaguei: só apaga se o outro lado não mexeu nesse item.
        if (naBase && iguais(b[k], remoto[k])) continue;
        saida[k] = remoto[k];
      }
    }
    return saida as T;
  }
  return meu;
}
