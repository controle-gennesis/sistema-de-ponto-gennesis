import {
  resolvePdfLogoCandidates,
  shouldUseUnbBranding,
} from '@/lib/unbBranding';

export type PdfBrandingLogo = {
  dataUrl: string;
  wMm: number;
  hMm: number;
};

export type LoadPdfBrandingLogoOptions = {
  contextLabels?: (string | null | undefined)[];
  maxW?: number;
  maxH?: number;
  extraCandidates?: string[];
};

function tryLoadImageAsDataUrl(
  src: string,
  maxW: number,
  maxH: number
): Promise<PdfBrandingLogo | null> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0);
      try {
        const dataUrl = c.toDataURL('image/png');
        const mmPerPx = 25.4 / 96;
        const iw = img.naturalWidth * mmPerPx;
        const ih = img.naturalHeight * mmPerPx;
        const s = Math.min(maxW / iw, maxH / ih, 1);
        resolve({ dataUrl, wMm: iw * s, hMm: ih * s });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    const url = src.startsWith('http')
      ? src
      : `${window.location.origin}${src.startsWith('/') ? src : `/${src}`}`;
    img.src = url;
  });
}

/** Carrega logo Gennesis ou Predial (UNB) para PDFs no navegador. */
export async function loadPdfBrandingLogo(
  options: LoadPdfBrandingLogoOptions = {}
): Promise<PdfBrandingLogo | null> {
  const { contextLabels = [], maxW = 36, maxH = 22, extraCandidates = [] } = options;
  const useUnb = shouldUseUnbBranding(...contextLabels);
  const candidates = [...extraCandidates, ...resolvePdfLogoCandidates(useUnb)];

  for (const src of candidates) {
    const loaded = await tryLoadImageAsDataUrl(src, maxW, maxH);
    if (loaded) return loaded;
  }
  return null;
}

/** Atalho para PDFs que só precisam do data URL (tamanho fixo no jsPDF). */
export async function loadPdfBrandingLogoDataUrl(
  options: LoadPdfBrandingLogoOptions = {}
): Promise<string | null> {
  const logo = await loadPdfBrandingLogo(options);
  return logo?.dataUrl ?? null;
}
