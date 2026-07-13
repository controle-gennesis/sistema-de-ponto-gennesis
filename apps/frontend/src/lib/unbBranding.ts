const UNB_BRANDING_STORAGE_KEY = 'gennesis-unb-branding';

/** Centro de custo da UNB (nome ou código no cadastro do funcionário). */
export function isUnbCostCenter(costCenter: string | null | undefined): boolean {
  return isUnbRelatedLabel(costCenter);
}

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

/** Usuário UNB (localStorage) ou contexto do documento (contrato/CC/OS). */
export function shouldUseUnbBranding(...labels: (string | null | undefined)[]): boolean {
  if (labels.some((label) => isUnbRelatedLabel(label))) return true;
  return readStoredUnbBranding();
}

export function resolvePdfLogoCandidates(useUnbBranding: boolean): string[] {
  if (useUnbBranding) {
    return ['/predialpreto.png', '/predialbranco.png'];
  }
  return [
    process.env.NEXT_PUBLIC_OC_PDF_LOGO_URL,
    '/oc-pdf-logo.png',
    '/logopv.png',
    '/logo.png',
    '/logobranca.png',
  ].filter(Boolean) as string[];
}

export function resolveBrandingLogoSrc(isDark: boolean, useUnbBranding: boolean): string {
  if (useUnbBranding) {
    return isDark ? '/predialbranco.png' : '/predialpreto.png';
  }
  return isDark ? '/logobranca.png' : '/logopv.png';
}

export function resolveBrandingLogoAlt(useUnbBranding: boolean): string {
  return useUnbBranding ? 'Predial Engenharia' : 'Gennesis Engenharia';
}

export type OcPdfCompanyHeader = {
  name: string;
  subtitle: string;
  address: string;
  phone: string;
  cnpj: string;
};

/** Emitente da OC no PDF — Gennesis ou Consórcio Predial (UNB). */
export function resolveOcPdfCompanyHeader(useUnbBranding: boolean): OcPdfCompanyHeader {
  if (useUnbBranding) {
    return {
      name: 'Consórcio Predial',
      subtitle: '',
      address: 'SOFN, QUADRA 4, CONJUNTO G, LOTE 07, SALA 66, ZONA INDUSTRIAL, BRASÍLIA, DF',
      phone: '',
      cnpj: '58.344.545/0001-03',
    };
  }
  return {
    name:
      process.env.NEXT_PUBLIC_OC_PDF_COMPANY_NAME || 'Gennesis Engenharia e Consultoria LTDA',
    subtitle: process.env.NEXT_PUBLIC_OC_PDF_COMPANY_SUBTITLE || 'Engenharia e Consultoria',
    address:
      process.env.NEXT_PUBLIC_OC_PDF_COMPANY_ADDRESS ||
      'SHIS QI 15, Sobreloja 55 — Lago Sul — Brasília/DF',
    phone: process.env.NEXT_PUBLIC_OC_PDF_COMPANY_PHONE || '',
    cnpj: process.env.NEXT_PUBLIC_OC_PDF_COMPANY_CNPJ || '17.851.596/0001-36',
  };
}

export function readStoredUnbBranding(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(UNB_BRANDING_STORAGE_KEY) === '1';
}

export function persistUnbBranding(costCenter: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(UNB_BRANDING_STORAGE_KEY, isUnbCostCenter(costCenter) ? '1' : '0');
}
