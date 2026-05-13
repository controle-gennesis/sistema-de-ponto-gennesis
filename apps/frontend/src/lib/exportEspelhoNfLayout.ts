import { format } from 'date-fns';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import {
  mergeFederalTaxStateFromApi,
  type FederalTaxContextKey,
  type FederalTaxRates
} from '@/components/espelho-nf/EspelhoNfTaxCodeContractFields';

/** Campos mínimos do espelho (espelho-nf/page.tsx) */
export type EspelhoMirrorDraft = {
  measurementRef: string;
  costCenterId: string;
  /** Texto para PDF/Excel; preencha ao exportar a partir do cadastro de centros de custo */
  costCenterLabel?: string;
  dueDate: string;
  empenhoNumber: string;
  processNumber: string;
  serviceOrder: string;
  measurementStartDate?: string;
  measurementEndDate?: string;
  buildingUnit: string;
  obraCno?: string;
  garantiaComplementar?: string;
  observations: string;
  notes: string;
  /** Valores em pt-BR (ex.: 50.000,00) */
  measurementAmount: string;
  laborAmount: string;
  materialAmount: string;
  providerId: string;
  providerName: string;
  takerId: string;
  takerName: string;
  bankAccountId: string;
  bankAccountName: string;
  taxCodeId: string;
  taxCodeCityName: string;
  /** Município do tomador (exibido nas outras informações) */
  municipality?: string;
  /** CNAE e lista de serviço escolhidos no espelho */
  cnae?: string;
  serviceIssqn?: string;
  /** Campos opcionais visíveis no formulário (espelho-nf) */
  nfConstarNaNota?: Record<string, boolean> | null;
};

export type EspelhoExportProvider = {
  id: string;
  cnpj: string;
  municipalRegistration: string;
  stateRegistration: string;
  corporateName: string;
  tradeName: string;
  address: string;
  city: string;
  state: string;
  email: string;
};

export type EspelhoExportTaker = {
  id: string;
  name: string;
  cnpj: string;
  municipalRegistration: string;
  stateRegistration: string;
  corporateName: string;
  address: string;
  city: string;
  state: string;
  contractRef: string;
  serviceDescription: string;
};

export type EspelhoExportBank = {
  id: string;
  name: string;
  bank: string;
  agency: string;
  account: string;
};

export type EspelhoTaxRule = { collectionType: 'RETIDO' | 'RECOLHIDO' };

/** Texto fixo + dinâmico do bloco "Outras informações" (corpo da NF). */
export function buildEspelhoOutrasInformacoesBlock(
  notesComplement: string,
  municipality: string | undefined,
  municipalityUf: string | undefined,
  issRule: EspelhoTaxRule | undefined | null
): string {
  const issAnswer =
    issRule?.collectionType === 'RETIDO'
      ? 'Sim'
      : issRule?.collectionType === 'RECOLHIDO'
        ? 'Não'
        : '—';
  const mun = (municipality ?? '').trim();
  const uf = (municipalityUf ?? '').trim().toUpperCase();
  const munWithUf = mun ? (uf ? `${mun} (${uf})` : mun) : '—';
  const lines = [
    '- Retenção do INSS no Percentual de 11%. Dedução da BC do INSS conforme art. 117, inciso IV da IN RFB No 2110/2022.',
    `O ISS desta NF-e será RETIDO pelo TOMADOR DE SERVIÇO? — ${issAnswer}`,
    `O ISS desta NF-e é devido no Município de ${munWithUf}.`
  ];
  const extra = (notesComplement ?? '').trim();
  return extra ? `${lines.join('\n')}\n\n${extra}` : lines.join('\n');
}

export type EspelhoExportTaxCode = {
  id: string;
  cityName: string;
  issRate: string;
  /** Possui garantia complementar (código tributário) */
  hasComplementaryWarranty?: boolean;
  /** Se possui garantia: a garantia é retida na nota? (null = não se aplica) */
  garantiaRetidaNaNota?: boolean | null;
  /** Alíquota da garantia (%), texto pt-BR (sem o símbolo %) */
  garantiaAliquota?: string;
  cofins: EspelhoTaxRule;
  csll: EspelhoTaxRule;
  inss: EspelhoTaxRule;
  irpj: EspelhoTaxRule;
  pis: EspelhoTaxRule;
  iss: EspelhoTaxRule;
  inssMaterialLimit: string;
  issMaterialLimit: string;
  /** JSON do cadastro — usado para alíquotas federais corretas no PDF */
  federalRatesByContext?: unknown;
  federalTaxContextEnabled?: unknown;
};

export type EspelhoFederalRates = {
  cofins: string;
  csll: string;
  inss: string;
  irpj: string;
  pis: string;
};

export type EspelhoExportBundle = {
  draft: EspelhoMirrorDraft;
  provider: EspelhoExportProvider | null;
  taker: EspelhoExportTaker | null;
  bank: EspelhoExportBank | null;
  taxCode: EspelhoExportTaxCode | null;
  federal: EspelhoFederalRates;
};

const COLS = 12;

/** Ordem de prioridade para escolher contexto federal ativo (igual à tela espelho-nf). */
const FEDERAL_CONTEXT_PRIORITY: FederalTaxContextKey[] = [
  'gdfObra',
  'gdfManutencaoReforma',
  'gdfMaoObraSemMaterial',
  'foraGdfObra',
  'foraGdfManutencaoReforma',
  'foraGdfMaoObraSemMaterial'
];

/** Alíquotas federais do código tributário do espelho; senão usa fallback (ex.: localStorage). */
export function resolveEspelhoFederalRatesForExport(
  taxCodes: EspelhoExportTaxCode[],
  taxCodeId: string,
  fallback: EspelhoFederalRates
): EspelhoFederalRates {
  const tc = taxCodes.find((t) => t.id === taxCodeId);
  if (!tc) return fallback;
  if (tc.federalRatesByContext == null && tc.federalTaxContextEnabled == null) {
    return fallback;
  }
  try {
    const merged = mergeFederalTaxStateFromApi(tc.federalRatesByContext, tc.federalTaxContextEnabled);
    const activeKey = FEDERAL_CONTEXT_PRIORITY.find((k) => merged.federalTaxContextEnabled[k]);
    if (activeKey) {
      const row = merged.federalRatesByContext[activeKey] as FederalTaxRates | undefined;
      if (row) {
        return {
          cofins: String(row.cofins ?? fallback.cofins),
          csll: String(row.csll ?? fallback.csll),
          inss: String(row.inss ?? fallback.inss),
          irpj: String(row.irpj ?? fallback.irpj),
          pis: String(row.pis ?? fallback.pis)
        };
      }
    }
  } catch {
    /* mantém fallback */
  }
  return fallback;
}

/**
 * Garante strings e campos esperados pelo PDF/Excel a partir do espelho vindo da API ou do storage.
 */
export function normalizeEspelhoMirrorDraft(
  raw: Partial<EspelhoMirrorDraft> | null | undefined
): EspelhoMirrorDraft {
  const o = (raw ?? {}) as Record<string, unknown>;
  const str = (key: string, def = '') => {
    const v = o[key];
    if (v === null || v === undefined) return def;
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
    return String(v);
  };
  let nfConstarNaNota: Record<string, boolean> | null | undefined;
  const nfRaw = o.nfConstarNaNota;
  if (nfRaw && typeof nfRaw === 'object' && !Array.isArray(nfRaw)) {
    nfConstarNaNota = nfRaw as Record<string, boolean>;
  }
  return {
    measurementRef: str('measurementRef'),
    costCenterId: str('costCenterId'),
    costCenterLabel: str('costCenterLabel') || undefined,
    dueDate: str('dueDate'),
    empenhoNumber: str('empenhoNumber'),
    processNumber: str('processNumber'),
    serviceOrder: str('serviceOrder'),
    measurementStartDate: str('measurementStartDate') || undefined,
    measurementEndDate: str('measurementEndDate') || undefined,
    buildingUnit: str('buildingUnit'),
    obraCno: str('obraCno') || undefined,
    garantiaComplementar: str('garantiaComplementar') || undefined,
    observations: str('observations'),
    notes: str('notes'),
    measurementAmount: str('measurementAmount'),
    laborAmount: str('laborAmount'),
    materialAmount: str('materialAmount'),
    providerId: str('providerId'),
    providerName: str('providerName'),
    takerId: str('takerId'),
    takerName: str('takerName'),
    bankAccountId: str('bankAccountId'),
    bankAccountName: str('bankAccountName'),
    taxCodeId: str('taxCodeId'),
    taxCodeCityName: str('taxCodeCityName'),
    municipality: str('municipality') || undefined,
    cnae: str('cnae') || undefined,
    serviceIssqn: str('serviceIssqn') || undefined,
    nfConstarNaNota: nfConstarNaNota ?? null
  };
}

function dash(s: string | undefined | null): string {
  const t = (s ?? '').trim();
  return t || '—';
}

function fmtPct(v: string | undefined | null): string {
  const t = (v ?? '').trim();
  return t ? `${t}%` : '—';
}

function ptNumeroExtenso(n: number): string {
  const ones: Record<number, string> = {
    0: 'zero',
    1: 'um',
    2: 'dois',
    3: 'três',
    4: 'quatro',
    5: 'cinco',
    6: 'seis',
    7: 'sete',
    8: 'oito',
    9: 'nove',
    10: 'dez',
    11: 'onze',
    12: 'doze',
    13: 'treze',
    14: 'quatorze',
    15: 'quinze',
    16: 'dezesseis',
    17: 'dezessete',
    18: 'dezoito',
    19: 'dezenove'
  };
  const tens: Record<number, string> = {
    20: 'vinte',
    30: 'trinta',
    40: 'quarenta',
    50: 'cinquenta',
    60: 'sessenta',
    70: 'setenta',
    80: 'oitenta',
    90: 'noventa'
  };
  const round = Math.max(0, Math.min(100, Math.round(n)));
  if (round === 100) return 'cem';
  if (round < 20) return ones[round] ?? String(round);
  const t = Math.floor(round / 10) * 10;
  const u = round % 10;
  if (u === 0) return tens[t] ?? String(round);
  return `${tens[t] ?? ''} e ${ones[u] ?? ''}`.trim();
}

function buildReforcoGarantiaMensagem(
  draft: EspelhoMirrorDraft,
  taxCode: EspelhoExportTaxCode | null
): string | null {
  if (!taxCode?.hasComplementaryWarranty) return null;
  const med = parseEspelhoBrCurrencyToNumber(draft.measurementAmount);
  const aliquotaNum = parseEspelhoPercentToNumber(taxCode.garantiaAliquota);
  if (med === null || aliquotaNum === null) return null;

  const aliquotaInt = Math.round(aliquotaNum);
  const aliquotaPctDisplay = taxCode.garantiaAliquota && taxCode.garantiaAliquota.trim() !== '';
  const aliquotaPctForMsg = aliquotaPctDisplay ? `${taxCode.garantiaAliquota}%` : `${aliquotaInt}%`;
  const porExtenso = `${ptNumeroExtenso(aliquotaInt)} por cento`;

  const x =
    taxCode.garantiaRetidaNaNota === true
      ? med * (aliquotaNum / 100)
      : med * (aliquotaNum / (100 - aliquotaNum));

  const xDisplay = Number.isFinite(x) ? fmtEspelhoBrl(round2(x)) : '—';

  if (taxCode.garantiaRetidaNaNota === true) {
    return `Como Reforço de Garantia será Retido ${aliquotaPctForMsg} (${porExtenso}) sobre o valor da NF igual a: ${xDisplay}`;
  }
  if (taxCode.garantiaRetidaNaNota === false) {
    return `Como Reforço de Garantia foi Retido ${aliquotaPctForMsg} (${porExtenso}) da Parcela na Medição no Valor de: ${xDisplay}`;
  }
  return null;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Valor (R$) do reforço de garantia retido na NF — medição × alíquota da garantia.
 * Só aplica quando há garantia complementar e ela é retida na nota.
 */
export function computeEspelhoReforcoGarantiaRetidoRs(
  draft: EspelhoMirrorDraft,
  taxCode: EspelhoExportTaxCode | null
): number {
  if (!taxCode?.hasComplementaryWarranty || taxCode.garantiaRetidaNaNota !== true) return 0;
  const med = parseEspelhoBrCurrencyToNumber(draft.measurementAmount);
  const aliquotaNum = parseEspelhoPercentToNumber(taxCode.garantiaAliquota);
  if (med === null || aliquotaNum === null) return 0;
  return round2(med * (aliquotaNum / 100));
}

/** Converte texto de moeda pt-BR (ex.: 50.000,00 ou 50000) em número. */
export function parseEspelhoBrCurrencyToNumber(raw: string): number | null {
  const s = String(raw ?? '')
    .trim()
    .replace(/R\$\s*/gi, '')
    /* NBSP e espaços estreitos (ex.: saída do Intl); reforço além de \s. */
    .replace(/[\s\u00A0\u202F\u2007\u2009]/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let normalized: string;
  if (lastComma > lastDot) {
    normalized = s.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    normalized = s.replace(/,/g, '');
  } else {
    normalized = s.replace(',', '.');
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Percentual do cadastro tributário (ex.: 50 ou 50,5 ou 12.345,67 ao colar). */
export function parseEspelhoPercentToNumber(s: string | undefined | null): number | null {
  const raw = String(s ?? '')
    .trim()
    .replace(/%/g, '')
    .replace(/[\s\u00A0\u202F\u2007\u2009]/g, '');
  if (raw === '') return null;
  const lastComma = raw.lastIndexOf(',');
  const lastDot = raw.lastIndexOf('.');
  let normalized: string;
  if (lastComma > lastDot) {
    normalized = raw.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    normalized = raw.replace(/,/g, '');
  } else {
    normalized = raw.replace(',', '.');
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function fmtEspelhoBrl(n: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

export function formatEspelhoMirrorCurrencyField(raw: string | undefined | null): string {
  const n = parseEspelhoBrCurrencyToNumber(raw ?? '');
  if (n === null) return '—';
  return fmtEspelhoBrl(n);
}

/** Limites de material = valor da medição × % do código tributário. */
export function computeEspelhoMaterialLimits(
  measurementAmountStr: string,
  inssPctStr: string | undefined | null,
  issPctStr: string | undefined | null
): { inssBrl: string; issBrl: string } {
  const base = parseEspelhoBrCurrencyToNumber(measurementAmountStr);
  const pInss = parseEspelhoPercentToNumber(inssPctStr);
  const pIss = parseEspelhoPercentToNumber(issPctStr);
  if (base === null) {
    return { inssBrl: '—', issBrl: '—' };
  }
  const inssVal = pInss !== null ? round2(base * (pInss / 100)) : null;
  const issVal = pIss !== null ? round2(base * (pIss / 100)) : null;
  return {
    inssBrl: inssVal !== null ? fmtEspelhoBrl(inssVal) : '—',
    issBrl: issVal !== null ? fmtEspelhoBrl(issVal) : '—'
  };
}

/**
 * Base de cálculo INSS/ISS: se material > limite do tributo → medição − limite; senão → medição − material.
 */
export function computeEspelhoBasesCalculoInssIss(
  measurementAmountStr: string,
  materialAmountStr: string,
  inssPctStr: string | undefined | null,
  issPctStr: string | undefined | null
): { baseInss: string; baseIss: string } {
  const med = parseEspelhoBrCurrencyToNumber(measurementAmountStr);
  const mat = parseEspelhoBrCurrencyToNumber(materialAmountStr);
  if (med === null || mat === null) {
    return { baseInss: '—', baseIss: '—' };
  }
  const pInss = parseEspelhoPercentToNumber(inssPctStr);
  const pIss = parseEspelhoPercentToNumber(issPctStr);
  const limInss = pInss !== null ? round2(med * (pInss / 100)) : null;
  const limIss = pIss !== null ? round2(med * (pIss / 100)) : null;

  const oneBase = (lim: number | null): string => {
    if (lim === null) return '—';
    const raw = mat > lim ? med - lim : med - mat;
    return fmtEspelhoBrl(Math.max(0, round2(raw)));
  };

  return {
    baseInss: oneBase(limInss),
    baseIss: oneBase(limIss)
  };
}

type EspelhoTaxLineComputed = { value: string; recolher: string | null };

function buildEspelhoTaxLineForExport(
  base: number | null,
  aliquotaRaw: string | undefined | null,
  collectionType: 'RETIDO' | 'RECOLHIDO' | undefined
): EspelhoTaxLineComputed {
  const aliquota = parseEspelhoPercentToNumber(aliquotaRaw);
  if (base === null || aliquota === null) {
    return { value: '—', recolher: null };
  }
  const calculado = fmtEspelhoBrl(round2((base * aliquota) / 100));
  if (collectionType === 'RECOLHIDO') {
    return { value: fmtEspelhoBrl(0), recolher: `Recolher ${calculado}` };
  }
  return { value: calculado, recolher: null };
}

function computeEspelhoImpostosBundle(b: EspelhoExportBundle): {
  cofins: EspelhoTaxLineComputed;
  csll: EspelhoTaxLineComputed;
  irpj: EspelhoTaxLineComputed;
  pis: EspelhoTaxLineComputed;
  inss: EspelhoTaxLineComputed;
  iss: EspelhoTaxLineComputed;
} {
  const { draft, taxCode, federal } = b;
  const med = parseEspelhoBrCurrencyToNumber(draft.measurementAmount);
  const bases = computeEspelhoBasesCalculoInssIss(
    draft.measurementAmount,
    draft.materialAmount,
    taxCode?.inssMaterialLimit,
    taxCode?.issMaterialLimit
  );
  const baseInss = parseEspelhoBrCurrencyToNumber(bases.baseInss);
  const baseIss = parseEspelhoBrCurrencyToNumber(bases.baseIss);

  return {
    cofins: buildEspelhoTaxLineForExport(med, federal.cofins, taxCode?.cofins?.collectionType),
    csll: buildEspelhoTaxLineForExport(med, federal.csll, taxCode?.csll?.collectionType),
    irpj: buildEspelhoTaxLineForExport(med, federal.irpj, taxCode?.irpj?.collectionType),
    pis: buildEspelhoTaxLineForExport(med, federal.pis, taxCode?.pis?.collectionType),
    inss: buildEspelhoTaxLineForExport(baseInss, federal.inss, taxCode?.inss?.collectionType),
    iss: buildEspelhoTaxLineForExport(baseIss, taxCode?.issRate, taxCode?.iss?.collectionType)
  };
}

function computeEspelhoValorLiquidoBundle(b: EspelhoExportBundle): string {
  const med = parseEspelhoBrCurrencyToNumber(b.draft.measurementAmount);
  if (med === null) return '—';
  const imp = computeEspelhoImpostosBundle(b);
  const retidos = [
    imp.cofins.value,
    imp.csll.value,
    imp.irpj.value,
    imp.pis.value,
    imp.inss.value,
    imp.iss.value
  ].reduce((acc, raw) => acc + (parseEspelhoBrCurrencyToNumber(raw) ?? 0), 0);
  const reforcoGarantiaRetido = computeEspelhoReforcoGarantiaRetidoRs(b.draft, b.taxCode);
  return fmtEspelhoBrl(round2(med - retidos - reforcoGarantiaRetido));
}

function fmtDateBr(iso: string): string {
  if (!iso?.trim()) return '—';
  const d = new Date(iso + (iso.length === 10 ? 'T12:00:00' : ''));
  if (Number.isNaN(d.getTime())) return iso;
  return format(d, 'dd/MM/yyyy');
}

function nowEmissionBr(): string {
  return format(new Date(), 'dd/MM/yyyy HH:mm');
}

function row(...parts: string[]): string[] {
  const r = [...parts];
  while (r.length < COLS) r.push('');
  return r.slice(0, COLS);
}

function mergeRow(r: number): XLSX.Range {
  return { s: { r, c: 0 }, e: { r, c: COLS - 1 } };
}

function serviceCodeLine(tax: EspelhoExportTaxCode | null): string {
  if (!tax?.cityName) return '—';
  return `Serviço / contrato: ${tax.cityName} (alíquota ISS ${fmtPct(tax.issRate)})`;
}

function issRetidoLine(tax: EspelhoExportTaxCode | null): string {
  const ret = tax?.iss?.collectionType === 'RETIDO';
  return `SIM ( ${ret ? 'X' : ' '} )    NÃO ( ${ret ? ' ' : 'X'} )`;
}

function resolveBundle(
  draft: EspelhoMirrorDraft,
  providers: EspelhoExportProvider[],
  takers: EspelhoExportTaker[],
  banks: EspelhoExportBank[],
  taxCodes: EspelhoExportTaxCode[],
  federal: EspelhoFederalRates
): EspelhoExportBundle {
  return {
    draft,
    provider: providers.find((p) => p.id === draft.providerId) ?? null,
    taker: takers.find((t) => t.id === draft.takerId) ?? null,
    bank: banks.find((b) => b.id === draft.bankAccountId) ?? null,
    taxCode: taxCodes.find((c) => c.id === draft.taxCodeId) ?? null,
    federal
  };
}

/** Monta planilha no padrão “espelho para emissão de NF” (estrutura por seções e mesclagens). */
function buildExcelSheet(b: EspelhoExportBundle): { sheet: XLSX.WorkSheet; merges: XLSX.Range[] } {
  const { draft, provider, taker, bank, taxCode } = b;
  const municipioIssCorpo = ((draft.municipality ?? taker?.city) ?? '').trim() || undefined;
  const outrasInformacoesCorpo = buildEspelhoOutrasInformacoesBlock(
    draft.notes,
    municipioIssCorpo,
    taker?.state,
    taxCode?.iss ?? null
  );
  const aoa: string[][] = [];
  const merges: XLSX.Range[] = [];
  let r = 0;

  const pushMergeTitle = (title: string) => {
    aoa.push(row(title));
    merges.push(mergeRow(r));
    r++;
  };

  pushMergeTitle('ESPELHO PARA EMISSÃO DE NOTA FISCAL');
  aoa.push(row());
  r++;
  aoa.push(row('', '', '', '', '', '', '', '', 'Número da Nota', '', '', '—'));
  r++;
  aoa.push(row('', '', '', '', '', '', '', '', 'Data e Hora de Emissão', '', '', nowEmissionBr()));
  r++;
  aoa.push(row('', '', '', '', '', '', '', '', 'Código de Verificação', '', '', '—'));
  r++;
  aoa.push(row());
  r++;

  pushMergeTitle('PRESTADOR DE SERVIÇOS');
  aoa.push(
    row(
      'CNPJ',
      dash(provider?.cnpj),
      'Inscrição Municipal',
      dash(provider?.municipalRegistration),
      'Inscrição Estadual',
      dash(provider?.stateRegistration),
      '',
      '',
      '',
      '',
      '',
      ''
    )
  );
  r++;
  aoa.push(row('Nome/Razão Social', dash(provider?.corporateName || draft.providerName)));
  merges.push({ s: { r, c: 1 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(row('Nome Fantasia', dash(provider?.tradeName)));
  merges.push({ s: { r, c: 1 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(row('Endereço', dash(provider?.address)));
  merges.push({ s: { r, c: 1 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(
    row(
      'Município',
      dash(provider?.city),
      'UF',
      dash(provider?.state),
      'E-mail',
      dash(provider?.email),
      '',
      '',
      '',
      '',
      '',
      ''
    )
  );
  r++;
  aoa.push(row());
  r++;

  pushMergeTitle('TOMADOR DE SERVIÇOS');
  aoa.push(
    row(
      'CNPJ',
      dash(taker?.cnpj),
      'Inscrição Municipal',
      dash(taker?.municipalRegistration),
      'Inscrição Estadual (ÓRGÃO PÚBLICO)',
      dash(taker?.stateRegistration),
      '',
      '',
      '',
      '',
      '',
      ''
    )
  );
  r++;
  aoa.push(row('Nome/Razão Social', dash(taker?.corporateName || draft.takerName)));
  merges.push({ s: { r, c: 1 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(row('Endereço', dash(taker?.address)));
  merges.push({ s: { r, c: 1 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(
    row(
      'Município',
      dash(taker?.city),
      'UF',
      dash(taker?.state),
      'Contrato',
      dash(taker?.contractRef),
      '',
      '',
      '',
      '',
      '',
      ''
    )
  );
  r++;
  aoa.push(row());
  r++;

  pushMergeTitle('DISCRIMINAÇÃO DOS SERVIÇOS');
  const disc =
    (taker?.serviceDescription ?? '').trim() || (draft.notes ?? '').trim() || '—';
  aoa.push(row(disc));
  merges.push({ s: { r, c: 0 }, e: { r, c: COLS - 1 } });
  r++;
  const refLine = `REFERÊNCIA: ${dash(draft.measurementRef)} | CC: ${dash(draft.costCenterLabel)}`;
  aoa.push(row(refLine));
  merges.push({ s: { r, c: 0 }, e: { r, c: COLS - 1 } });
  r++;
  const periodLine = `Período da medição: ${fmtDateBr(draft.measurementStartDate || '')} a ${fmtDateBr(draft.measurementEndDate || '')}`;
  aoa.push(row(periodLine));
  merges.push({ s: { r, c: 0 }, e: { r, c: COLS - 1 } });
  r++;
  const codVenLine = `Cód. tributário: ${dash(taxCode?.cityName || draft.taxCodeCityName)} | Vencimento: ${fmtDateBr(draft.dueDate)}`;
  aoa.push(row(codVenLine));
  merges.push({ s: { r, c: 0 }, e: { r, c: COLS - 1 } });
  r++;
  const extraInfoLine1 = `Nº Empenho: ${dash(draft.empenhoNumber)} | Nº Processo: ${dash(draft.processNumber)}`;
  aoa.push(row(extraInfoLine1));
  merges.push({ s: { r, c: 0 }, e: { r, c: COLS - 1 } });
  r++;
  const extraInfoLine2 = `Ordem de Serviço: ${dash(draft.serviceOrder)} | Unidade Predial: ${dash(draft.buildingUnit)}`;
  aoa.push(row(extraInfoLine2));
  merges.push({ s: { r, c: 0 }, e: { r, c: COLS - 1 } });
  r++;
  const cnoLine = `CNO (obra): ${dash(draft.obraCno)}`;
  aoa.push(row(cnoLine));
  merges.push({ s: { r, c: 0 }, e: { r, c: COLS - 1 } });
  r++;
  if ((draft.garantiaComplementar ?? '').trim()) {
    aoa.push(row(`Garantia complementar: ${String(draft.garantiaComplementar).trim()}`));
    merges.push({ s: { r, c: 0 }, e: { r, c: COLS - 1 } });
    r++;
  }
  const obsLine = `Observações: ${dash(draft.observations)}`;
  aoa.push(row(obsLine));
  merges.push({ s: { r, c: 0 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(row());
  r++;

  const medVal = formatEspelhoMirrorCurrencyField(draft.measurementAmount);
  const laborVal = formatEspelhoMirrorCurrencyField(draft.laborAmount);
  const matVal = formatEspelhoMirrorCurrencyField(draft.materialAmount);
  const matLimits = computeEspelhoMaterialLimits(
    draft.measurementAmount,
    taxCode?.inssMaterialLimit,
    taxCode?.issMaterialLimit
  );
  const basesInssIss = computeEspelhoBasesCalculoInssIss(
    draft.measurementAmount,
    draft.materialAmount,
    taxCode?.inssMaterialLimit,
    taxCode?.issMaterialLimit
  );
  const impostosExport = computeEspelhoImpostosBundle(b);
  const valorLiquidoExport = computeEspelhoValorLiquidoBundle(b);
  const issRetidoExport = taxCode?.iss?.collectionType === 'RETIDO' ? impostosExport.iss.value : '—';

  pushMergeTitle('VALORES / INFORMAÇÕES FINANCEIRAS E BANCÁRIAS');
  aoa.push(
    row(
      'Medição (valor total)',
      medVal,
      '',
      '',
      'OBSERVAÇÕES (corpo da NF)',
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    )
  );
  merges.push({ s: { r, c: 4 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(
    row(
      'Mão-de-obra',
      laborVal,
      'Material aplicado',
      matVal,
      dash(outrasInformacoesCorpo),
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    )
  );
  merges.push({ s: { r, c: 4 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(row('Vale-transporte', '—', 'Vale-alimentação', '—'));
  r++;
  aoa.push(row('Limite Material INSS', matLimits.inssBrl, 'Limite Material ISS', matLimits.issBrl));
  r++;
  aoa.push(row('Base de cálculo INSS', basesInssIss.baseInss, 'Base de cálculo ISS', basesInssIss.baseIss));
  r++;
  aoa.push(
    row(
      'Referência código tributário',
      `INSS mat.: ${fmtPct(taxCode?.inssMaterialLimit)} | ISS mat.: ${fmtPct(taxCode?.issMaterialLimit)}`,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    )
  );
  merges.push({ s: { r, c: 1 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(row('ISS retido (R$)', issRetidoExport, '', '', '', '', '', '', '', '', '', ''));
  r++;
  aoa.push(
    row(
      'Centro de custo',
      dash(draft.costCenterLabel),
      'Vencimento',
      fmtDateBr(draft.dueDate),
      dash(outrasInformacoesCorpo),
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    )
  );
  merges.push({ s: { r, c: 4 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(
    row(
      'Banco',
      dash(bank?.bank),
      'Agência',
      dash(bank?.agency),
      'C/C',
      dash(bank?.account),
      draft.buildingUnit.trim() ? `Unidade predial: ${draft.buildingUnit}` : '—',
      '',
      '',
      '',
      '',
      ''
    )
  );
  merges.push({ s: { r, c: 6 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(
    row(
      'Conta (nome)',
      dash(bank?.name || draft.bankAccountName),
      '',
      '',
      'Nº Ordem de Serviço / CNO',
      dash(draft.serviceOrder),
      '',
      '',
      '',
      '',
      '',
      ''
    )
  );
  merges.push({ s: { r, c: 4 }, e: { r, c: 5 } });
  r++;
  const reforcoGarantiaMensagem = buildReforcoGarantiaMensagem(draft, taxCode);
  aoa.push(
    row(
      'Reforço de garantia (%)',
      reforcoGarantiaMensagem ?? '—',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    )
  );
  r++;
  aoa.push(row());
  r++;

  pushMergeTitle('RETENÇÕES (VALORES A INFORMAR NA NF)');
  aoa.push(
    row(
      'COFINS',
      impostosExport.cofins.value,
      'CSLL',
      impostosExport.csll.value,
      'INSS',
      impostosExport.inss.value,
      'IRPJ',
      impostosExport.irpj.value,
      'PIS',
      impostosExport.pis.value,
      'ISS',
      impostosExport.iss.value
    )
  );
  r++;
  aoa.push(
    row(
      '',
      impostosExport.cofins.recolher ?? '',
      '',
      impostosExport.csll.recolher ?? '',
      '',
      impostosExport.inss.recolher ?? '',
      '',
      impostosExport.irpj.recolher ?? '',
      '',
      impostosExport.pis.recolher ?? '',
      '',
      impostosExport.iss.recolher ?? ''
    )
  );
  r++;
  aoa.push(
    row(
      `Alíq. federal COFINS ${fmtPct(b.federal.cofins)} (${taxCode?.cofins?.collectionType ?? '—'})`,
      '',
      `CSLL ${fmtPct(b.federal.csll)}`,
      '',
      `INSS ${fmtPct(b.federal.inss)}`,
      '',
      `IRPJ ${fmtPct(b.federal.irpj)}`,
      '',
      `PIS ${fmtPct(b.federal.pis)}`,
      '',
      `ISS ${fmtPct(taxCode?.issRate)} (${taxCode?.iss?.collectionType ?? '—'})`,
      ''
    )
  );
  r++;
  aoa.push(row());
  r++;

  pushMergeTitle('VALOR DA NOTA');
  aoa.push(row(medVal));
  merges.push({ s: { r, c: 0 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(row());
  r++;

  pushMergeTitle('TRIBUTAÇÃO DO ISSQN (RESUMO)');
  aoa.push(row(serviceCodeLine(taxCode)));
  merges.push({ s: { r, c: 0 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(
    row(
      'Deduções',
      '—',
      'Desconto incond.',
      '—',
      'Base de cálculo',
      basesInssIss.baseIss,
      'Alíquota (%)',
      fmtPct(taxCode?.issRate),
      'Valor do ISS',
      impostosExport.iss.value,
      'ISS a recolher',
      impostosExport.iss.recolher ?? '—'
    )
  );
  r++;
  aoa.push(row());
  r++;

  pushMergeTitle('OUTRAS INFORMAÇÕES');
  aoa.push(
    row(
      'Retenções federais e contribuições devem observar a legislação vigente e as alíquotas cadastradas no sistema.',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    )
  );
  merges.push({ s: { r, c: 0 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(
    row(
      `O ISS desta NF-e será RETIDO pelo tomador? SIM ( ${taxCode?.iss?.collectionType === 'RETIDO' ? 'X' : ' '} )   NÃO ( ${taxCode?.iss?.collectionType !== 'RETIDO' ? 'X' : ' '} )`,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    )
  );
  merges.push({ s: { r, c: 0 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(
    row(
      `O ISS desta NF-e é devido no Contrato ${dash(taxCode?.cityName || draft.taxCodeCityName)}`,
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    )
  );
  merges.push({ s: { r, c: 0 }, e: { r, c: COLS - 1 } });
  r++;
  aoa.push(row('Lista de Serviços - ISSQN', dash(draft.serviceIssqn), 'CNAE', dash(draft.cnae), '', '', '', '', '', '', '', ''));
  r++;
  aoa.push(row('Valor líquido a pagar', valorLiquidoExport, '', '', '', '', '', '', '', '', '', ''));
  r++;
  aoa.push(
    row(
      'Medição — Início',
      dash(draft.measurementStartDate) || '—',
      'Término',
      dash(draft.measurementEndDate) || '—',
      '',
      '',
      '',
      '',
      '',
      '',
      '',
      ''
    )
  );
  r++;

  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!merges'] = merges;
  ws['!cols'] = Array.from({ length: COLS }, () => ({ wch: 14 }));

  return { sheet: ws, merges };
}

function pdfCheckPage(doc: jsPDF, y: number, step: number, margin: number): number {
  const pageH = doc.internal.pageSize.getHeight();
  if (y + step > pageH - margin) {
    doc.addPage();
    return margin;
  }
  return y;
}

/** Paleta e ritmo visual do espelho (PDF não usa CSS — tudo via jsPDF). */
const PDF = {
  ink: [15, 23, 42] as [number, number, number],
  muted: [71, 85, 105] as [number, number, number],
  border: [203, 213, 225] as [number, number, number],
  surface: [248, 250, 252] as [number, number, number],
  accent: [185, 28, 28] as [number, number, number]
};

function pdfSetStroke(doc: jsPDF, rgb: [number, number, number], w = 0.25) {
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
  doc.setLineWidth(w);
}

/** Contorno do card; se o bloco passar de página, desenha um retângulo por página. */
function pdfStrokeSectionCard(
  doc: jsPDF,
  x: number,
  yTop: number,
  width: number,
  yBottom: number,
  layoutMargin: number,
  startPage: number,
  padBottom = 2.2
) {
  const endPage = doc.getNumberOfPages();
  const pageH = doc.internal.pageSize.getHeight();
  const innerBottom = pageH - layoutMargin;
  const r = 1.5;
  pdfSetStroke(doc, PDF.border, 0.28);
  for (let p = startPage; p <= endPage; p++) {
    doc.setPage(p);
    const top = p === startPage ? yTop : layoutMargin;
    const rawBottom = p === endPage ? yBottom + padBottom : innerBottom;
    const bottom = Math.min(rawBottom, innerBottom);
    const h = bottom - top;
    if (h > 1) doc.roundedRect(x, top, width, h, r, r, 'S');
  }
  doc.setPage(endPage);
}

function pdfSectionHeader(doc: jsPDF, y: number, margin: number, contentW: number, title: string): number {
  const h = 7;
  y = pdfCheckPage(doc, y, h + 3, margin);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
  doc.text(title.toUpperCase(), margin + contentW / 2, y + 4.6, { align: 'center' });
  pdfSetStroke(doc, PDF.border, 0.16);
  doc.line(margin + 10, y + h - 0.5, margin + contentW - 10, y + h - 0.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  return y + h + 1.8;
}

/** Linha(s) chave:valor — sem linhas verticais nem faixa entre campos. */
function pdfKeyRow(
  doc: jsPDF,
  y: number,
  margin: number,
  contentW: number,
  pairs: { k: string; v: string }[],
  _options?: { zebra?: boolean; rowIndex?: number }
): number {
  const n = Math.max(pairs.length, 1);
  const colW = contentW / n;
  const labelFrac = 0.38;
  const lineH = 3.6;
  const topPad = 1.4;
  const bottomPad = 1.4;
  const labelW = colW * labelFrac;
  const valueW = Math.max(colW - labelW - 2, 8);

  const cells = pairs.map((p) => {
    doc.setFontSize(7);
    doc.setFont('helvetica', 'bold');
    const labLines = doc.splitTextToSize(p.k, labelW);
    doc.setFont('helvetica', 'normal');
    const valLines = doc.splitTextToSize(p.v, valueW);
    const lab = Array.isArray(labLines) ? labLines : [String(labLines)];
    const val = Array.isArray(valLines) ? valLines : [String(valLines)];
    const lines = Math.max(lab.length, val.length);
    return { lab, val, lines };
  });
  const maxLines = Math.max(1, ...cells.map((c) => c.lines));
  const innerH = topPad + maxLines * lineH + bottomPad;
  y = pdfCheckPage(doc, y, innerH + 1.2, margin);

  cells.forEach((c, i) => {
    const x0 = margin + i * colW;
    const textY0 = y + topPad + 3;
    for (let j = 0; j < maxLines; j++) {
      const yy = textY0 + j * lineH;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
      doc.text(c.lab[j] ?? '', x0 + 0.5, yy);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
      doc.text(c.val[j] ?? '', x0 + labelW + 1.5, yy);
    }
  });
  doc.setTextColor(0, 0, 0);
  return y + innerH + 1.2;
}

/** Bloco label + texto longo — sem caixa ao redor do campo. */
function pdfWrappedBlock(doc: jsPDF, y: number, margin: number, contentW: number, label: string, text: string): number {
  const innerW = contentW;
  const lineArr = doc.splitTextToSize(dash(text), innerW);
  const lines = Array.isArray(lineArr) ? lineArr : [String(lineArr)];
  y = pdfCheckPage(doc, y, 7 + lines.length * 3.5, margin);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
  doc.text(label, margin, y + 3.6);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
  let yy = y + 7;
  lines.forEach((line: string) => {
    yy = pdfCheckPage(doc, yy, 4.5, margin);
    doc.text(line, margin, yy);
    yy += 3.5;
  });
  doc.setTextColor(0, 0, 0);
  return yy + 1.2;
}

/** Linha de referência (medição / CC) — sem fundo colorido. */
function pdfReferenceCard(
  doc: jsPDF,
  y: number,
  layoutMargin: number,
  x: number,
  contentW: number,
  text: string
): number {
  const lineArr = doc.splitTextToSize(text, contentW);
  const lines = Array.isArray(lineArr) ? lineArr : [String(lineArr)];
  const lineH = 3.8;
  const h = 2 + lines.length * lineH;
  y = pdfCheckPage(doc, y, h + 2, layoutMargin);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
  lines.forEach((line: string, i: number) => {
    doc.text(line, x, y + 2.8 + i * lineH);
  });
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  return y + h + 1.5;
}

function pdfHighlightAmount(
  doc: jsPDF,
  y: number,
  layoutMargin: number,
  x: number,
  w: number,
  label: string,
  amount: string
): number {
  const h = 7.5;
  y = pdfCheckPage(doc, y, h + 2, layoutMargin);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
  doc.text(label, x + 0.5, y + 5.2);
  doc.setFontSize(10);
  doc.setTextColor(PDF.accent[0], PDF.accent[1], PDF.accent[2]);
  doc.text(amount, x + w - 0.5, y + 5.5, { align: 'right' });
  doc.setFontSize(7);
  doc.setTextColor(0, 0, 0);
  doc.setFont('helvetica', 'normal');
  return y + h + 1.5;
}

function pdfRetentionGrid(
  doc: jsPDF,
  y: number,
  layoutMargin: number,
  x: number,
  contentW: number,
  retLabels: readonly string[],
  retVals: string[]
): number {
  const n = retLabels.length;
  const cellW = contentW / n;
  const headH = 4.8;
  const padX = 1;
  const lineGap = 3.4;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  const bodyLinesPerCol: string[][] = retVals.map((val) => {
    const raw = val ?? '—';
    const wrapped = doc.splitTextToSize(raw, cellW - padX * 2);
    const arr = Array.isArray(wrapped) ? wrapped : [String(wrapped)];
    return arr.length ? arr : ['—'];
  });
  const maxBodyLines = Math.max(1, ...bodyLinesPerCol.map((a) => a.length));
  const bodyH = 2.2 + maxBodyLines * lineGap;
  const th = headH + bodyH;
  y = pdfCheckPage(doc, y, th + 4, layoutMargin);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
  retLabels.forEach((lb, i) => {
    const cx = x + i * cellW + cellW / 2;
    doc.text(lb, cx, y + 3.8, { align: 'center' });
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.8);
  doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
  retVals.forEach((_val, i) => {
    const cx = x + i * cellW + cellW / 2;
    const lines = bodyLinesPerCol[i] ?? ['—'];
    let vy = y + headH + 2.4;
    lines.forEach((line) => {
      doc.text(line, cx, vy, { align: 'center' });
      vy += lineGap;
    });
  });
  doc.setTextColor(0, 0, 0);
  return y + th + 1.5;
}

function buildPdf(b: EspelhoExportBundle): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 8;
  const contentW = doc.internal.pageSize.getWidth() - margin * 2;
  let y = margin;
  const { draft, provider, taker, bank, taxCode } = b;
  const municipioIssCorpo = ((draft.municipality ?? taker?.city) ?? '').trim() || undefined;
  const outrasInformacoesCorpo = buildEspelhoOutrasInformacoesBlock(
    draft.notes,
    municipioIssCorpo,
    taker?.state,
    taxCode?.iss ?? null
  );

  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
  const title = 'Espelho para emissão de NF-e';
  doc.text(title, margin + contentW / 2, y, { align: 'center' });
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.2);
  doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
  doc.text(
    'Documento de conferência — não substitui o XML autorizado pela SEFAZ.',
    margin + contentW / 2,
    y,
    { align: 'center' }
  );
  y += 6;
  doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
  const metaRows: Array<{ label: string; value: string }> = [
    { label: 'Número da Nota:', value: '—' },
    { label: 'Data e Hora de Emissão:', value: nowEmissionBr() },
    { label: 'Código de Verificação:', value: '—' }
  ];
  const metaPad = 3;
  const labelColW = Math.min(contentW * 0.4, 52);
  const metaBoxH = metaRows.length * 4.8 + metaPad * 2 + 2;
  y = pdfCheckPage(doc, y, metaBoxH + 4, margin);
  doc.setFillColor(PDF.surface[0], PDF.surface[1], PDF.surface[2]);
  pdfSetStroke(doc, PDF.border, 0.18);
  doc.roundedRect(margin, y, contentW, metaBoxH, 0.7, 0.7, 'FD');
  const metaLabelX = margin + metaPad;
  const metaValueX = margin + labelColW + 2;
  const metaValueMaxW = Math.max(28, contentW - labelColW - metaPad * 2 - 4);
  let metaY = y + metaPad + 3.2;
  metaRows.forEach(({ label, value }) => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.8);
    doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
    doc.text(label, metaLabelX, metaY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
    const valueLines = doc.splitTextToSize(value, metaValueMaxW);
    doc.text(valueLines, metaValueX, metaY);
    const rowH = Math.max(4.6, (Array.isArray(valueLines) ? valueLines.length : 1) * 3.6);
    metaY += rowH;
  });
  y += metaBoxH + 4;

  const CARD_IN = 4;
  const iLeft = margin + CARD_IN;
  const iWide = contentW - 2 * CARD_IN;

  y += 1;
  const yPreTop = y;
  const pgPre = doc.getNumberOfPages();
  y = pdfSectionHeader(doc, y, margin, contentW, 'PRESTADOR DE SERVIÇOS');
  y = pdfKeyRow(doc, y, iLeft, iWide, [
    { k: 'CNPJ:', v: dash(provider?.cnpj) },
    { k: 'Insc. Mun.:', v: dash(provider?.municipalRegistration) },
    { k: 'Insc. Est.:', v: dash(provider?.stateRegistration) }
  ]);
  y = pdfWrappedBlock(doc, y, iLeft, iWide, 'Nome/Razão Social:', dash(provider?.corporateName || draft.providerName));
  y = pdfWrappedBlock(doc, y, iLeft, iWide, 'Nome Fantasia:', dash(provider?.tradeName));
  y = pdfWrappedBlock(doc, y, iLeft, iWide, 'Endereço:', dash(provider?.address));
  y = pdfKeyRow(doc, y, iLeft, iWide, [
    { k: 'Município:', v: dash(provider?.city) },
    { k: 'UF:', v: dash(provider?.state) },
    { k: 'E-mail:', v: dash(provider?.email) }
  ]);
  y += 1.5;
  pdfStrokeSectionCard(doc, margin, yPreTop, contentW, y, margin, pgPre);
  y += 2;

  y += 1;
  const yTomTop = y;
  const pgTom = doc.getNumberOfPages();
  y = pdfSectionHeader(doc, y, margin, contentW, 'TOMADOR DE SERVIÇOS');
  y = pdfKeyRow(doc, y, iLeft, iWide, [
    { k: 'CNPJ:', v: dash(taker?.cnpj) },
    { k: 'Insc. Mun.:', v: dash(taker?.municipalRegistration) },
    { k: 'Insc. Est. (ÓRGÃO PÚBLICO):', v: dash(taker?.stateRegistration) }
  ]);
  y = pdfWrappedBlock(doc, y, iLeft, iWide, 'Nome/Razão Social:', dash(taker?.corporateName || draft.takerName));
  y = pdfWrappedBlock(doc, y, iLeft, iWide, 'Endereço:', dash(taker?.address));
  y = pdfKeyRow(doc, y, iLeft, iWide, [
    { k: 'Município:', v: dash(taker?.city) },
    { k: 'UF:', v: dash(taker?.state) },
    { k: 'Contrato:', v: dash(taker?.contractRef) }
  ]);
  y += 1.5;
  pdfStrokeSectionCard(doc, margin, yTomTop, contentW, y, margin, pgTom);
  y += 2;

  y += 1;
  const yDisTop = y;
  const pgDis = doc.getNumberOfPages();
  y = pdfSectionHeader(doc, y, margin, contentW, 'DISCRIMINAÇÃO DOS SERVIÇOS');
  const discPdf =
    (taker?.serviceDescription ?? '').trim() || (draft.notes ?? '').trim() || '—';
  const discLines = doc.splitTextToSize(discPdf, iWide);
  const discLineArr = Array.isArray(discLines) ? discLines : [String(discLines)];
  y = pdfCheckPage(doc, y, 5 + discLineArr.length * 3.5, margin);
  doc.setFontSize(7.2);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
  let discY = y + 1.5;
  discLineArr.forEach((line: string) => {
    discY = pdfCheckPage(doc, discY, 4.5, margin);
    doc.text(line, iLeft, discY);
    discY += 3.4;
  });
  y = discY + 2;
  const refText = `REFERÊNCIA: ${dash(draft.measurementRef)} | CC: ${dash(draft.costCenterLabel)}`;
  y = pdfReferenceCard(doc, y, margin, iLeft, iWide, refText);
  y = pdfKeyRow(doc, y, iLeft, iWide, [
    { k: 'Cód. tributário (contrato):', v: dash(taxCode?.cityName || draft.taxCodeCityName) },
    { k: 'Vencimento:', v: fmtDateBr(draft.dueDate) }
  ]);
  y = pdfKeyRow(doc, y, iLeft, iWide, [
    { k: 'Início da medição:', v: fmtDateBr(draft.measurementStartDate || '') },
    { k: 'Fim da medição:', v: fmtDateBr(draft.measurementEndDate || '') }
  ]);
  y = pdfKeyRow(doc, y, iLeft, iWide, [
    { k: 'Número do Empenho:', v: dash(draft.empenhoNumber) },
    { k: 'Número do Processo:', v: dash(draft.processNumber) }
  ]);
  y = pdfKeyRow(doc, y, iLeft, iWide, [
    { k: 'Ordem de Serviço:', v: dash(draft.serviceOrder) },
    { k: 'Unidade Predial:', v: dash(draft.buildingUnit) }
  ]);
  y = pdfKeyRow(doc, y, iLeft, iWide, [{ k: 'CNO (inscrição obra):', v: dash(draft.obraCno) }]);
  if ((draft.garantiaComplementar ?? '').trim()) {
    y = pdfWrappedBlock(doc, y, iLeft, iWide, 'Garantia complementar:', draft.garantiaComplementar ?? '');
  }
  y = pdfWrappedBlock(doc, y, iLeft, iWide, 'Observações:', draft.observations);
  y += 1.5;
  pdfStrokeSectionCard(doc, margin, yDisTop, contentW, y, margin, pgDis);
  y += 2;

  const medValPdf = formatEspelhoMirrorCurrencyField(draft.measurementAmount);
  const laborValPdf = formatEspelhoMirrorCurrencyField(draft.laborAmount);
  const matValPdf = formatEspelhoMirrorCurrencyField(draft.materialAmount);
  const matLimitsPdf = computeEspelhoMaterialLimits(
    draft.measurementAmount,
    taxCode?.inssMaterialLimit,
    taxCode?.issMaterialLimit
  );
  const basesPdf = computeEspelhoBasesCalculoInssIss(
    draft.measurementAmount,
    draft.materialAmount,
    taxCode?.inssMaterialLimit,
    taxCode?.issMaterialLimit
  );
  const impostosPdf = computeEspelhoImpostosBundle(b);
  const valorLiquidoPdf = computeEspelhoValorLiquidoBundle(b);
  const issRetidoPdf = taxCode?.iss?.collectionType === 'RETIDO' ? impostosPdf.iss.value : '—';

  y += 1;
  const yFinTop = y;
  const pgFin = doc.getNumberOfPages();
  y = pdfSectionHeader(doc, y, margin, contentW, 'VALORES / INFORMAÇÕES FINANCEIRAS E BANCÁRIAS');

  y = pdfHighlightAmount(doc, y, margin, iLeft, iWide, 'Medição (valor total)', medValPdf);

  y = pdfKeyRow(doc, y, iLeft, iWide, [
    { k: 'Mão-de-obra:', v: laborValPdf },
    { k: 'Material aplicado:', v: matValPdf }
  ]);
  y = pdfKeyRow(doc, y, iLeft, iWide, [
    { k: 'Vale-transporte:', v: '—' },
    { k: 'Vale-alimentação:', v: '—' }
  ]);
  y = pdfCheckPage(doc, y, 6, margin);
  y = pdfKeyRow(doc, y, iLeft, iWide, [
    { k: 'Limite Material INSS:', v: matLimitsPdf.inssBrl },
    { k: 'Limite Material ISS:', v: matLimitsPdf.issBrl }
  ]);
  y = pdfCheckPage(doc, y, 6, margin);
  doc.setFontSize(6.3);
  doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
  const hintTax = `Referência código tributário — INSS mat.: ${fmtPct(taxCode?.inssMaterialLimit)} | ISS mat.: ${fmtPct(taxCode?.issMaterialLimit)}`;
  const hintWrapped = doc.splitTextToSize(hintTax, iWide);
  const hintLines = Array.isArray(hintWrapped) ? hintWrapped : [String(hintWrapped)];
  hintLines.forEach((line: string) => {
    y = pdfCheckPage(doc, y, 4, margin);
    doc.text(line, iLeft, y);
    y += 3.6;
  });
  doc.setTextColor(0, 0, 0);
  y += 1;
  y = pdfKeyRow(
    doc,
    y,
    iLeft,
    iWide,
    [
      { k: 'Base de cálculo INSS:', v: basesPdf.baseInss },
      { k: 'Base de cálculo ISS:', v: basesPdf.baseIss }
    ]
  );
  y = pdfKeyRow(
    doc,
    y,
    iLeft,
    iWide,
    [{ k: 'ISS retido (R$):', v: issRetidoPdf }]
  );

  y = pdfWrappedBlock(doc, y, iLeft, iWide, 'Outras informações (corpo da NF):', outrasInformacoesCorpo);
  y += 1;

  y = pdfKeyRow(doc, y, iLeft, iWide, [
    { k: 'Centro de custo:', v: dash(draft.costCenterLabel) },
    { k: 'Vencimento:', v: fmtDateBr(draft.dueDate) },
    { k: 'Banco:', v: dash(bank?.bank) }
  ]);
  y = pdfKeyRow(doc, y, iLeft, iWide, [
    { k: 'Agência:', v: dash(bank?.agency) },
    { k: 'C/C:', v: dash(bank?.account) },
    { k: 'Conta (nome):', v: dash(bank?.name || draft.bankAccountName) }
  ]);

  const reforcoGarantiaMensagemPdf = buildReforcoGarantiaMensagem(draft, taxCode);
  const reforcoGarantiaMsg = reforcoGarantiaMensagemPdf ?? '—';
  y = pdfWrappedBlock(doc, y, iLeft, iWide, 'Reforço de garantia:', reforcoGarantiaMsg);
  y += 1.5;
  pdfStrokeSectionCard(doc, margin, yFinTop, contentW, y, margin, pgFin);
  y += 2;

  y += 1;
  const yRetTop = y;
  const pgRet = doc.getNumberOfPages();
  y = pdfSectionHeader(doc, y, margin, contentW, 'RETENÇÕES');
  const retLabels = ['COFINS', 'CSLL', 'INSS', 'IRPJ', 'PIS', 'ISS'] as const;
  const retVals = [
    impostosPdf.cofins.value,
    impostosPdf.csll.value,
    impostosPdf.inss.value,
    impostosPdf.irpj.value,
    impostosPdf.pis.value,
    impostosPdf.iss.value
  ];
  y = pdfRetentionGrid(doc, y, margin, iLeft, iWide, retLabels, retVals);
  doc.setFontSize(5);
  const recHints = [
    impostosPdf.cofins.recolher,
    impostosPdf.csll.recolher,
    impostosPdf.inss.recolher,
    impostosPdf.irpj.recolher,
    impostosPdf.pis.recolher,
    impostosPdf.iss.recolher
  ]
    .filter(Boolean)
    .join('  |  ');
  if (recHints) {
    doc.setFontSize(5.5);
    doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
    const rh = doc.splitTextToSize(recHints, iWide);
    const rlines = Array.isArray(rh) ? rh : [String(rh)];
    rlines.forEach((line: string) => {
      y = pdfCheckPage(doc, y, 5, margin);
      doc.text(line, iLeft, y);
      y += 3.5;
    });
    doc.setTextColor(0, 0, 0);
    y += 2;
  }
  doc.setFontSize(6);
  doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
  const aliqLine = `Alíq. COFINS ${fmtPct(b.federal.cofins)} (${taxCode?.cofins?.collectionType}) | CSLL ${fmtPct(b.federal.csll)} | INSS ${fmtPct(b.federal.inss)} | IRPJ ${fmtPct(b.federal.irpj)} | PIS ${fmtPct(b.federal.pis)} | ISS ${fmtPct(taxCode?.issRate)} (${taxCode?.iss?.collectionType})`;
  const aliqW = doc.splitTextToSize(aliqLine, iWide);
  const aliqArr = Array.isArray(aliqW) ? aliqW : [String(aliqW)];
  aliqArr.forEach((line: string) => {
    y = pdfCheckPage(doc, y, 4, margin);
    doc.text(line, iLeft, y);
    y += 3.8;
  });
  doc.setTextColor(0, 0, 0);
  y += 2;
  pdfStrokeSectionCard(doc, margin, yRetTop, contentW, y, margin, pgRet);
  y += 2;

  y += 1;
  const yNotaTop = y;
  const pgNota = doc.getNumberOfPages();
  y = pdfSectionHeader(doc, y, margin, contentW, 'VALOR DA NOTA');
  y = pdfHighlightAmount(doc, y, margin, iLeft, iWide, 'Valor bruto da medição', medValPdf);
  y += 1;
  pdfStrokeSectionCard(doc, margin, yNotaTop, contentW, y, margin, pgNota);
  y += 2;

  y += 1;
  const yIssTop = y;
  const pgIss = doc.getNumberOfPages();
  y = pdfSectionHeader(doc, y, margin, contentW, 'TRIBUTAÇÃO DO ISSQN');
  const svcLine = serviceCodeLine(taxCode);
  const svcWrapped0 = doc.splitTextToSize(svcLine, iWide);
  const sl = Array.isArray(svcWrapped0) ? svcWrapped0 : [String(svcWrapped0)];
  y = pdfCheckPage(doc, y, 3 + sl.length * 3.5, margin);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
  let sy = y + 1.5;
  sl.forEach((line: string) => {
    doc.text(line, iLeft, sy);
    sy += 3.5;
  });
  y = sy + 1.2;
  y = pdfKeyRow(
    doc,
    y,
    iLeft,
    iWide,
    [
      { k: 'Deduções:', v: '—' },
      { k: 'Desc. incond.:', v: '—' },
      { k: 'Base cálculo:', v: basesPdf.baseIss }
    ]
  );
  y = pdfKeyRow(
    doc,
    y,
    iLeft,
    iWide,
    [
      { k: 'Alíq.:', v: fmtPct(taxCode?.issRate) },
      { k: 'Valor ISS:', v: impostosPdf.iss.value },
      { k: 'ISS recolher:', v: impostosPdf.iss.recolher ?? '—' }
    ]
  );
  y += 1.2;
  pdfStrokeSectionCard(doc, margin, yIssTop, contentW, y, margin, pgIss);
  y += 2;

  y += 1;
  const yOutTop = y;
  const pgOut = doc.getNumberOfPages();
  y = pdfSectionHeader(doc, y, margin, contentW, 'OUTRAS INFORMAÇÕES');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
  const legal =
    'Retenções e contribuições observam alíquotas e regras cadastradas (federais e municipais) e a legislação aplicável.';
  const legalLines = doc.splitTextToSize(legal, iWide);
  const legalArr = Array.isArray(legalLines) ? legalLines : [String(legalLines)];
  legalArr.forEach((line: string) => {
    y = pdfCheckPage(doc, y, 5, margin);
    doc.text(line, iLeft, y);
    y += 4;
  });
  y += 2;
  const issRetidoQuestion = `O ISS desta NF-e será RETIDO pelo tomador? ${issRetidoLine(taxCode)}`;
  const issQ = doc.splitTextToSize(issRetidoQuestion, iWide);
  const issQArr = Array.isArray(issQ) ? issQ : [String(issQ)];
  doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
  issQArr.forEach((line: string) => {
    y = pdfCheckPage(doc, y, 5, margin);
    doc.text(line, iLeft, y);
    y += 3.4;
  });
  doc.setTextColor(0, 0, 0);
  y += 2.5;
  const municipioComUfPdf = (() => {
    const mun = ((draft.municipality ?? taker?.city) ?? '').trim();
    const uf = (taker?.state ?? '').trim().toUpperCase();
    if (!mun) return '—';
    return uf ? `${mun} (${uf})` : mun;
  })();
  doc.setFontSize(7.2);
  doc.setTextColor(PDF.ink[0], PDF.ink[1], PDF.ink[2]);
  const munLine = `O ISS desta NF-e é devido no Município de ${municipioComUfPdf}`;
  const munWrapped = doc.splitTextToSize(munLine, iWide);
  const munArr = Array.isArray(munWrapped) ? munWrapped : [String(munWrapped)];
  munArr.forEach((line: string) => {
    y = pdfCheckPage(doc, y, 5, margin);
    doc.text(line, iLeft, y);
    y += 4;
  });
  y += 2;
  y = pdfKeyRow(doc, y, iLeft, iWide, [
    { k: 'Lista Serv. ISSQN:', v: dash(draft.serviceIssqn) },
    { k: 'CNAE:', v: dash(draft.cnae) }
  ]);
  y = pdfHighlightAmount(doc, y, margin, iLeft, iWide, 'Valor líquido a pagar', valorLiquidoPdf);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(PDF.muted[0], PDF.muted[1], PDF.muted[2]);
  const rodape = `Documento gerado em ${nowEmissionBr()} — Espelho para emissão de NF-e (conferência fiscal).`;
  const rodW = doc.splitTextToSize(rodape, iWide);
  const rodLines = Array.isArray(rodW) ? rodW : [String(rodW)];
  rodLines.forEach((line: string) => {
    y = pdfCheckPage(doc, y, 4, margin);
    doc.text(line, iLeft, y);
    y += 3.5;
  });
  doc.setTextColor(0, 0, 0);
  y += 1.5;
  pdfStrokeSectionCard(doc, margin, yOutTop, contentW, y, margin, pgOut);

  return doc;
}

export function sanitizeEspelhoFilenameBase(name: string): string {
  const s = name.trim().slice(0, 60) || 'espelho-nf';
  return s.replace(/[<>:"/\\|?*]+/g, '-').replace(/\s+/g, '_');
}

export function exportEspelhoNfExcel(
  draft: EspelhoMirrorDraft,
  providers: EspelhoExportProvider[],
  takers: EspelhoExportTaker[],
  banks: EspelhoExportBank[],
  taxCodes: EspelhoExportTaxCode[],
  federalFallback: EspelhoFederalRates
): void {
  const normalized = normalizeEspelhoMirrorDraft(draft);
  const federal = resolveEspelhoFederalRatesForExport(taxCodes, normalized.taxCodeId, federalFallback);
  const b = resolveBundle(normalized, providers, takers, banks, taxCodes, federal);
  const { sheet } = buildExcelSheet(b);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Espelho da Nota Fiscal');
  const base = sanitizeEspelhoFilenameBase(normalized.measurementRef || normalized.costCenterLabel || 'espelho-nf');
  XLSX.writeFile(wb, `espelho-nf_${base}.xlsx`);
}

export function exportEspelhoNfPdf(
  draft: EspelhoMirrorDraft,
  providers: EspelhoExportProvider[],
  takers: EspelhoExportTaker[],
  banks: EspelhoExportBank[],
  taxCodes: EspelhoExportTaxCode[],
  federalFallback: EspelhoFederalRates
): void {
  const normalized = normalizeEspelhoMirrorDraft(draft);
  const federal = resolveEspelhoFederalRatesForExport(taxCodes, normalized.taxCodeId, federalFallback);
  const b = resolveBundle(normalized, providers, takers, banks, taxCodes, federal);
  const doc = buildPdf(b);
  const base = sanitizeEspelhoFilenameBase(normalized.measurementRef || normalized.costCenterLabel || 'espelho-nf');
  doc.save(`espelho-nf_${base}.pdf`);
}

function resolveCostCenterRowLabel(
  m: EspelhoMirrorDraft,
  costCenters?: Array<{ id?: string; code?: string; name?: string }>
): string {
  const fromDraft = m.costCenterLabel?.trim();
  if (fromDraft) return fromDraft;
  if (m.costCenterId && costCenters?.length) {
    const cc = costCenters.find((c) => c.id === m.costCenterId);
    if (cc) return [cc.code, cc.name].filter(Boolean).join(' - ');
  }
  return '';
}

/** Linhas simples para modal “Ver detalhes” (mantém compatibilidade com a tela). */
export function buildEspelhoDetailRows(
  m: EspelhoMirrorDraft,
  costCenters?: Array<{ id?: string; code?: string; name?: string }>,
  taxCodeLimits?: { inssMaterialLimit: string; issMaterialLimit: string } | null,
  issRule?: EspelhoTaxRule | null
): [string, string][] {
  const ccRow = resolveCostCenterRowLabel(m, costCenters);
  const limits = computeEspelhoMaterialLimits(
    m.measurementAmount,
    taxCodeLimits?.inssMaterialLimit,
    taxCodeLimits?.issMaterialLimit
  );
  const bases = computeEspelhoBasesCalculoInssIss(
    m.measurementAmount,
    m.materialAmount,
    taxCodeLimits?.inssMaterialLimit,
    taxCodeLimits?.issMaterialLimit
  );
  return [
    ['Referência da medição', m.measurementRef],
    ['Medição (R$)', formatEspelhoMirrorCurrencyField(m.measurementAmount)],
    ['Mão de obra (R$)', formatEspelhoMirrorCurrencyField(m.laborAmount)],
    ['Material (R$)', formatEspelhoMirrorCurrencyField(m.materialAmount)],
    ['Limite Material INSS', limits.inssBrl],
    ['Limite Material ISS', limits.issBrl],
    ['Base de cálculo INSS', bases.baseInss],
    ['Base de cálculo ISS', bases.baseIss],
    ['Centro de custo', ccRow || '—'],
    ['Vencimento', m.dueDate || '—'],
    ['Nº Empenho', dash(m.empenhoNumber)],
    ['Nº Processo', dash(m.processNumber)],
    ['Ordem de Serviço', dash(m.serviceOrder)],
    ['Início da medição', dash(m.measurementStartDate)],
    ['Fim da medição', dash(m.measurementEndDate)],
    ['Unidade Predial', dash(m.buildingUnit)],
    ['CNO (obra)', dash(m.obraCno)],
    [
      'Garantia complementar',
      (m.garantiaComplementar ?? '').trim() ? String(m.garantiaComplementar).trim() : '—'
    ],
    ['CNAE', dash(m.cnae)],
    ['Lista Serv. ISSQN', dash(m.serviceIssqn)],
    ['Observações', m.observations.trim() ? m.observations : '—'],
    ['Prestador', m.providerName],
    ['Tomador', m.takerName],
    ['Conta bancária', m.bankAccountName],
    ['Código tributário (contrato)', m.taxCodeCityName],
    [
      'Outras informações',
      buildEspelhoOutrasInformacoesBlock(m.notes, m.municipality, undefined, issRule ?? null)
    ]
  ];
}

/** Garante costCenterLabel nos PDFs/Excel a partir do id e da lista da API. */
export function espelhoMirrorForExport(
  draft: EspelhoMirrorDraft,
  costCenters: Array<{ id?: string; code?: string; name?: string }>
): EspelhoMirrorDraft {
  const normalized = normalizeEspelhoMirrorDraft(draft);
  const label = resolveCostCenterRowLabel(normalized, costCenters);
  return { ...normalized, costCenterLabel: label || normalized.costCenterLabel };
}
