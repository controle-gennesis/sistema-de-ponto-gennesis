import fs from 'fs';
import path from 'path';

function normalizeUnbLabel(label: string): string {
  return label
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

/** Rótulo exatamente "UNB" (não "UNB - CAR" nem Consórcio). */
export function isExactUnbCostCenterLabel(label: string | null | undefined): boolean {
  if (!label?.trim()) return false;
  return normalizeUnbLabel(label) === 'UNB';
}

/** Centro/contrato UNB Consórcio Predial Brasília — não o HUB. */
export function isUnbConsorcioPredialLabel(
  name?: string | null,
  code?: string | null,
): boolean {
  const n = name?.trim() ? normalizeUnbLabel(name) : '';
  const c = code?.trim() ? normalizeUnbLabel(code).replace(/\s/g, '') : '';
  if (c === '009.01' || c === '00901') return true;
  if (n.startsWith('HUB')) return false;
  return n.startsWith('UNB') && n.includes('CONSORCIO PREDIAL');
}

/** Contrato, centro de custo, polo ou qualquer rótulo ligado à UNB. */
export function isUnbRelatedLabel(label: string | null | undefined): boolean {
  if (!label?.trim()) return false;
  const normalized = normalizeUnbLabel(label);

  if (normalized === 'UNB') return true;
  // "UNB - DF", "UNB/Predial", "UNB Engenharia"
  if (/^UNB(\s|$|-|\/)/.test(normalized)) return true;
  // "Centro UNB", "CC-UNB", "Predial UNB" (token UNB, evita falso positivo tipo SUNBEAM)
  return /(^|[^A-Z0-9])UNB([^A-Z0-9]|$)/.test(normalized);
}

export function shouldUseUnbBranding(...labels: (string | null | undefined)[]): boolean {
  return labels.some((label) => isUnbRelatedLabel(label));
}

/** Cabeçalho estruturado do emitente (layout Predial / Gennesis). */
export type PdfCompanyHeader = {
  name: string;
  cnpj: string;
  street: string;
  streetNumber: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
  phone: string;
  email: string;
  /** Fallback legado em uma linha (Gennesis). */
  addressLine?: string;
  subtitle?: string;
};

/** Emitente no PDF — dados exatos do Consórcio Predial (UNB) ou Gennesis. */
export function resolvePdfCompanyHeader(useUnbBranding: boolean): PdfCompanyHeader {
  if (useUnbBranding) {
    return {
      name: 'UNB - CONSÓRCIO PREDIAL BRASILIA',
      cnpj: '58.344.545/0001-03',
      street: 'Q SOFN QUADRA 4 CONJUNTO G',
      streetNumber: '7',
      complement: 'SALA 06',
      neighborhood: 'ZONA INDUSTRIAL',
      city: 'BRASÍLIA',
      state: 'DF',
      phone: '(61)3532-5007',
      email: 'financeiro@predialbrasilia.com.br',
    };
  }
  return {
    name: process.env.OC_PDF_COMPANY_NAME || 'Gennesis Engenharia e Consultoria LTDA',
    cnpj: process.env.OC_PDF_COMPANY_CNPJ || '17.851.596/0001-36',
    street: '',
    streetNumber: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
    phone: process.env.OC_PDF_COMPANY_PHONE || '',
    email: process.env.OC_PDF_COMPANY_EMAIL || '',
    addressLine:
      process.env.OC_PDF_COMPANY_ADDRESS ||
      'SHIS QI 15, Sobreloja 55 — Lago Sul — Brasília/DF',
    subtitle: process.env.OC_PDF_COMPANY_SUBTITLE || 'Engenharia e Consultoria',
  };
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
