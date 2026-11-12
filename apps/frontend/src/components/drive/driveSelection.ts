/** Chaves de seleção usadas pelas vistas em grade e em lista (mesmo formato nas duas). */
export const folderKey = (id: string) => `folder-${id}`;
export const fileKey = (id: string) => `file-${id}`;

export type SelectMods = { ctrl: boolean; shift: boolean };

/**
 * Regras de seleção do Drive (como no Explorador/Google Drive):
 * - clique simples: só aquele item;
 * - Ctrl/Cmd + clique: liga/desliga o item na seleção;
 * - Shift + clique: do último item clicado até este (com Ctrl, soma ao que já estava).
 */
export function computeSelection(
  prev: string[],
  anchor: string | null,
  key: string,
  mods: SelectMods,
  ordered: string[]
): { selection: string[]; anchor: string | null } {
  if (mods.shift && anchor && ordered.includes(anchor) && ordered.includes(key)) {
    const a = ordered.indexOf(anchor);
    const b = ordered.indexOf(key);
    const range = ordered.slice(Math.min(a, b), Math.max(a, b) + 1);
    const selection = mods.ctrl ? Array.from(new Set([...prev, ...range])) : range;
    return { selection, anchor };
  }
  if (mods.ctrl) {
    const selection = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
    return { selection, anchor: key };
  }
  return { selection: [key], anchor: key };
}
