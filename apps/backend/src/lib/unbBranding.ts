import fs from 'fs';
import path from 'path';

/** Contrato, centro de custo, polo ou qualquer rótulo ligado à UNB. */
export function isUnbRelatedLabel(label: string | null | undefined): boolean {
  if (!label?.trim()) return false;
  const normalized = label
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (normalized === 'UNB') return true;
  return /^UNB(\s|$|-|\/)/.test(normalized);
}

export function shouldUseUnbBranding(...labels: (string | null | undefined)[]): boolean {
  return labels.some((label) => isUnbRelatedLabel(label));
}

export function resolvePdfLogoPathFromPublic(useUnbBranding: boolean): string | null {
  const publicRoot = path.resolve(__dirname, '..', '..', '..', 'frontend', 'public');
  const candidates = useUnbBranding
    ? ['predialpreto.png', 'predialbranco.png']
    : ['logopv.png', 'logo.png', 'logonome.jpg', 'logogrande.png'];

  for (const fileName of candidates) {
    const fullPath = path.join(publicRoot, fileName);
    if (fs.existsSync(fullPath)) return fullPath;
  }
  return null;
}
