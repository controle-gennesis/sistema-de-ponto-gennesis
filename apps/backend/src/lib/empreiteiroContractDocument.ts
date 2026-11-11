import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { prisma } from './prisma';
import { savePersistentBuffer } from './persistentUpload';

/**
 * Gera o "Contrato de Prestação de Serviços — Empreiteiro" (Word) a partir do modelo
 * em assets/contratos/contrato-empreiteiro.docx. Os trechos amarelos do modelo são trocados,
 * NA ORDEM em que aparecem, pelos valores abaixo (o destaque é removido).
 */

export const TEMPLATE_PATH = path.resolve(__dirname, '../../assets/contratos/contrato-empreiteiro.docx');
const TERMO_PATH = path.resolve(__dirname, '../../assets/contratos/termo-conduta.pdf');
const GENERATED_PREFIX = 'Contrato de Prestação de Serviços';
const TERMO_PREFIX = 'Termo de Ciência e Concordância';
const BLANK = '____________';
const TOTAL_HIGHLIGHTS = 28;

// ───────────────────────── formatação ─────────────────────────

const onlyDigits = (v: string | null | undefined) => String(v ?? '').replace(/\D/g, '');

function maskCnpj(v: string | null | undefined): string {
  const d = onlyDigits(v);
  if (d.length !== 14) return String(v ?? '').trim();
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function maskCpf(v: string | null | undefined): string {
  const d = onlyDigits(v);
  if (d.length !== 11) return String(v ?? '').trim();
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function maskPhone(v: string | null | undefined): string {
  const d = onlyDigits(v);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return String(v ?? '').trim();
}

export function brl(n: number): string {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDateBr(d: Date | null | undefined): string {
  if (!d) return '____/____/______';
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

const UNIDADES = [
  'zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze',
  'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove',
];
const DEZENAS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const CENTENAS = [
  '', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos',
  'oitocentos', 'novecentos',
];

function ate999(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  const c = Math.floor(n / 100);
  const resto = n % 100;
  const partes: string[] = [];
  if (c) partes.push(CENTENAS[c]);
  if (resto) {
    if (resto < 20) partes.push(UNIDADES[resto]);
    else {
      const d = Math.floor(resto / 10);
      const u = resto % 10;
      partes.push(u ? `${DEZENAS[d]} e ${UNIDADES[u]}` : DEZENAS[d]);
    }
  }
  return partes.join(' e ');
}

function inteiroPorExtenso(n: number): string {
  if (n === 0) return 'zero';
  const escalas: Array<[number, string, string]> = [
    [1_000_000_000, 'bilhão', 'bilhões'],
    [1_000_000, 'milhão', 'milhões'],
    [1_000, 'mil', 'mil'],
  ];
  let resto = n;
  const partes: string[] = [];
  for (const [valor, sing, plural] of escalas) {
    const q = Math.floor(resto / valor);
    if (q > 0) {
      partes.push(valor === 1000 && q === 1 ? 'mil' : `${ate999(q)} ${q === 1 ? sing : plural}`);
      resto %= valor;
    }
  }
  if (resto > 0) {
    const t = ate999(resto);
    // "mil e cem", "mil e quinhentos", "um milhão e duzentos mil" etc.
    const ultimaEscala = partes.length > 0;
    if (ultimaEscala && (resto < 100 || resto % 100 === 0)) partes.push(`e ${t}`);
    else partes.push(t);
  }
  return partes
    .reduce((acc, p, i) => (i === 0 ? p : p.startsWith('e ') ? `${acc} ${p}` : `${acc}, ${p}`), '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 12345.6 → "doze mil, trezentos e quarenta e cinco reais e sessenta centavos" */
export function valorPorExtenso(valor: number): string {
  const cents = Math.round(Math.abs(valor) * 100);
  const reais = Math.floor(cents / 100);
  const centavos = cents % 100;
  const partesTxt: string[] = [];
  if (reais > 0 || centavos === 0) {
    const milhaoExato = reais >= 1_000_000 && reais % 1_000_000 === 0;
    partesTxt.push(
      `${inteiroPorExtenso(reais)}${milhaoExato ? ' de' : ''} ${reais === 1 ? 'real' : 'reais'}`
    );
  }
  if (centavos > 0) {
    partesTxt.push(`${inteiroPorExtenso(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`);
  }
  return partesTxt.join(' e ');
}

export const MESES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro',
  'outubro', 'novembro', 'dezembro',
];

function hojeBrasilia(): { dia: string; mes: string; ano: string } {
  const parts = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { dia: String(Number(get('day'))), mes: MESES[Number(get('month')) - 1] ?? '', ano: get('year') };
}

export const xmlEscape = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ───────────────────────── dados ─────────────────────────

export type ContractDocData = {
  razaoSocial: string;
  cnpj: string;
  endereco: string;
  socio: string;
  cpf: string;
  telefone: string;
  contratoPrincipal: string;
  localExecucao: string;
  descricao: string;
  valorNumero: string;
  valorExtenso: string;
  peso: string;
  acumulado: string;
  formaPagamento: string;
  banco: string;
  agencia: string;
  tipoConta: string;
  conta: string;
  vigenciaInicio: string;
  vigenciaFim: string;
  dia: string;
  mes: string;
  ano: string;
};

/** Campos que ficaram em branco no documento (para avisar o usuário). */
export function camposEmBranco(data: ContractDocData): string[] {
  const rotulos: Array<[keyof ContractDocData, string]> = [
    ['endereco', 'endereço da empreita'],
    ['socio', 'sócio administrador (Responsável)'],
    ['telefone', 'telefone'],
    ['contratoPrincipal', 'contrato principal'],
    ['localExecucao', 'local de execução'],
    ['banco', 'banco'],
    ['agencia', 'agência'],
    ['conta', 'conta'],
    ['tipoConta', 'tipo de conta'],
    ['vigenciaInicio', 'data de início'],
    ['vigenciaFim', 'data de fim'],
  ];
  return rotulos.filter(([k]) => !data[k] || data[k].includes('____')).map(([, r]) => r);
}

export type ContractDocOverride = {
  descricao?: string;
  valor?: number;
  formaPagamento?: string;
};

export async function buildContractDocData(
  linkId: string,
  override?: ContractDocOverride
): Promise<ContractDocData> {
  const link = await prisma.empreiteiroContract.findUniqueOrThrow({
    where: { id: linkId },
    include: {
      empreiteiro: true,
      contract: { select: { name: true, number: true } },
      installments: { select: { id: true } },
    },
  });
  const e = link.empreiteiro;
  const valor = override?.valor ?? (link.plannedValue != null ? Number(link.plannedValue) : 0);
  const parcelas = link.installments.length;
  const hoje = hojeBrasilia();
  const enderecoPartes = [
    e.address?.trim(),
    [e.city?.trim(), e.state?.trim()].filter(Boolean).join('/'),
  ].filter(Boolean);
  const cnpjOuDoc = e.documentKind === 'CNPJ' || onlyDigits(e.document).length === 14 ? e.document : e.document;
  return {
    razaoSocial: e.name.trim(),
    cnpj: maskCnpj(cnpjOuDoc),
    endereco: enderecoPartes.join(', ') || BLANK,
    socio: e.contactName?.trim() || BLANK,
    cpf: e.cpf ? maskCpf(e.cpf) : '',
    telefone: maskPhone(e.phone) || BLANK,
    contratoPrincipal: link.contract
      ? `${link.contract.name} (nº ${link.contract.number})`
      : BLANK,
    localExecucao: link.location?.trim() || BLANK,
    descricao:
      override?.descricao ?? [link.name, link.description].filter((x) => x && x.trim()).join(' — '),
    valorNumero: brl(valor),
    valorExtenso: valorPorExtenso(valor),
    peso: brl(link.weightPercent != null ? Number(link.weightPercent) : 100) + '%',
    acumulado: brl(link.accumulatedPercent != null ? Number(link.accumulatedPercent) : 100) + '%',
    formaPagamento:
      override?.formaPagamento ??
      (parcelas > 1
        ? `em ${parcelas} parcelas, conforme medição e aprovação de cada etapa`
        : 'à vista'),
    banco: e.bank?.trim() || BLANK,
    agencia: e.agency?.trim() || BLANK,
    tipoConta: e.accountType?.trim().toLowerCase() || BLANK,
    conta: e.account?.trim() || BLANK,
    vigenciaInicio: formatDateBr(link.startDate),
    vigenciaFim: formatDateBr(link.endDate),
    dia: hoje.dia,
    mes: hoje.mes,
    ano: hoje.ano,
  };
}

// ───────────────────────── preenchimento do modelo ─────────────────────────

function valoresNaOrdemDoModelo(d: ContractDocData): string[] {
  return [
    d.razaoSocial, // Contratado: razão social
    d.cnpj,
    d.endereco,
    d.socio,
    d.cpf,
    d.telefone,
    d.contratoPrincipal, // Cláusula 1
    d.localExecucao,
    d.descricao, // Quadro: descrição
    `${d.valorNumero}`, // Quadro: valor (o "R$ " já está no texto do modelo)
    d.peso,
    d.acumulado,
    d.valorNumero, // 2.1
    d.valorExtenso,
    d.formaPagamento,
    d.banco, // Dados bancários
    d.agencia,
    d.tipoConta,
    d.conta,
    d.razaoSocial, // Titular
    d.cnpj,
    d.vigenciaInicio, // 3.1
    d.vigenciaFim,
    d.dia, // Local e data
    d.mes,
    d.ano,
    d.razaoSocial, // Assinatura
    `CNPJ n. ${d.cnpj}`,
  ];
}

export const RUN_RE = /<w:r(?: [^>]*)?>(?:(?!<\/w:r>)[\s\S])*<\/w:r>/g;

/** Troca o título (1º parágrafo) mantendo a formatação do primeiro trecho. */
export function trocarTitulo(xml: string, titulo: string): string {
  const m = xml.match(/<w:p(?: [^>]*)?>(?:(?!<\/w:p>)[\s\S])*<\/w:p>/);
  if (!m) return xml;
  let primeiro = true;
  const novo = m[0].replace(RUN_RE, (run) => {
    if (!/<w:t[ >]/.test(run)) return run;
    if (!primeiro) return '';
    primeiro = false;
    let usado = false;
    return run.replace(/<w:t(?: [^>]*)?>[^<]*<\/w:t>/g, () => {
      if (usado) return '';
      usado = true;
      return `<w:t xml:space="preserve">${xmlEscape(titulo)}</w:t>`;
    });
  });
  return xml.replace(m[0], novo);
}

/**
 * Troca os trechos em amarelo, NA ORDEM, pelos valores (e remove o destaque). Sem CPF, apaga a frase
 * "inscrito(a) no CPF sob o nº ..." e o 5º destaque (o CPF).
 */
export function substituirDestaques(
  xmlEntrada: string,
  valores: string[],
  semCpf: boolean,
  esperados: number
): string {
  let xml = xmlEntrada;
  if (semCpf) {
    xml = xml.replace(RUN_RE, (run) => {
      const texto = (run.match(/<w:t[^>]*>[^<]*<\/w:t>/g) || []).map((t) => t.replace(/<[^>]+>/g, '')).join('');
      return texto === ', inscrito(a) no CPF sob o nº ' ? '' : run;
    });
  }
  let idx = 0;
  xml = xml.replace(RUN_RE, (run) => {
    if (!/<w:highlight /.test(run)) return run;
    if (idx >= valores.length) throw new Error('Modelo de contrato tem mais campos em amarelo do que o esperado');
    const valor = valores[idx++];
    if (semCpf && idx === 5) return ''; // campo do CPF
    let usado = false;
    let out = run.replace(/<w:t(?: [^>]*)?>[^<]*<\/w:t>/g, () => {
      if (usado) return '';
      usado = true;
      return `<w:t xml:space="preserve">${xmlEscape(valor)}</w:t>`;
    });
    out = out.replace(/<w:highlight [^>]*\/>/g, '');
    return out;
  });
  if (idx !== esperados) {
    throw new Error(`Modelo alterado: esperados ${esperados} campos em amarelo, encontrados ${idx}`);
  }
  return xml;
}

export async function preencherModeloDocx(
  data: ContractDocData,
  opcoes?: { titulo?: string }
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(fs.readFileSync(TEMPLATE_PATH));
  let xml = await zip.file('word/document.xml')!.async('string');
  if (opcoes?.titulo) xml = trocarTitulo(xml, opcoes.titulo);

  xml = substituirDestaques(xml, valoresNaOrdemDoModelo(data), !data.cpf, TOTAL_HIGHLIGHTS);

  zip.file('word/document.xml', xml);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

// ───────────────────────── Termo de ciência (Manual de Conduta) ─────────────────────────

/**
 * Preenche o PDF "Termo de Ciência e Concordância" (papel timbrado da Gennesis) escrevendo por cima
 * dos espaços em branco: razão social, CNPJ e data. A assinatura continua em branco.
 * Coordenadas em pontos PDF (origem no canto inferior esquerdo), medidas no modelo original.
 */
export async function preencherTermoConduta(data: ContractDocData): Promise<Buffer> {
  const pdf = await PDFDocument.load(fs.readFileSync(TERMO_PATH));
  const page = pdf.getPage(0);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const cor = rgb(0, 0, 0);

  const escrever = (texto: string, x: number, y: number, larguraMax: number, tamanho = 11) => {
    let size = tamanho;
    while (size > 6 && font.widthOfTextAtSize(texto, size) > larguraMax) size -= 0.5;
    page.drawText(texto, { x, y: y + 1.5, size, font, color: cor });
  };
  const centralizar = (texto: string, xIni: number, largura: number, y: number) => {
    const w = font.widthOfTextAtSize(texto, 11);
    page.drawText(texto, { x: xIni + Math.max(0, (largura - w) / 2), y: y + 1.5, size: 11, font, color: cor });
  };

  // "A empresa, ______," → linha de sublinhados de x=182 a x=518 (y=709.7)
  escrever(data.razaoSocial.toUpperCase(), 184, 709.7, 332);
  // "portador do CNPJ n° ______," → sublinhados de x≈196 a x≈371 (y=689.6)
  escrever(data.cnpj, 198, 689.6, 171);
  // "Data: __/__/__" (y=276.6): três campos de 35 pt
  centralizar(data.dia.padStart(2, '0'), 143.3, 35, 276.6);
  const mesNum = String(MESES.indexOf(data.mes) + 1).padStart(2, '0');
  centralizar(mesNum, 183.3, 35, 276.6);
  centralizar(data.ano, 227, 35, 276.6);

  return Buffer.from(await pdf.save());
}

// ───────────────────────── geração + anexo ─────────────────────────

export type StoredFile = { url: string; name: string; key?: string };

export type GenerateResult = {
  docx: boolean;
  camposEmBranco: string[];
};

/** Gera o Word do serviço e anexa em "Anexos" (substitui a versão gerada anterior). */
export async function gerarContratoDoServico(linkId: string): Promise<GenerateResult> {
  const data = await buildContractDocData(linkId);
  const docx = await preencherModeloDocx(data);

  const base = `${GENERATED_PREFIX} - ${data.razaoSocial}`.replace(/[\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
  const stamp = Date.now();
  const novos: StoredFile[] = [];
  const savedDocx = await savePersistentBuffer({
    folder: 'empreiteiro-files',
    fileName: `contrato-${linkId}-${stamp}.docx`,
    buffer: docx,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  novos.push({ url: savedDocx.url, key: savedDocx.key, name: `${base}.docx` });

  // Termo de ciência do Manual de Conduta, já com empresa, CNPJ e data. Falha aqui não derruba o contrato.
  try {
    const termo = await preencherTermoConduta(data);
    const savedTermo = await savePersistentBuffer({
      folder: 'empreiteiro-files',
      fileName: `termo-conduta-${linkId}-${stamp}.pdf`,
      buffer: termo,
      mimeType: 'application/pdf',
    });
    const baseTermo = `${TERMO_PREFIX} - Manual de Conduta - ${data.razaoSocial}`
      .replace(/[\\/:*?"<>|]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    novos.push({ url: savedTermo.url, key: savedTermo.key, name: `${baseTermo}.pdf` });
  } catch (err) {
    console.error('[empreiteiros] falha ao gerar termo de conduta', err);
  }

  const link = await prisma.empreiteiroContract.findUniqueOrThrow({
    where: { id: linkId },
    select: { files: true },
  });
  const atuais = (Array.isArray(link.files) ? link.files : []) as unknown as StoredFile[];
  const mantidos = atuais.filter((f) => {
    const nome = String(f?.name || '');
    return !nome.startsWith(GENERATED_PREFIX) && !nome.startsWith(TERMO_PREFIX);
  });
  await prisma.empreiteiroContract.update({
    where: { id: linkId },
    data: { files: [...mantidos, ...novos] as unknown as object },
  });
  return { docx: true, camposEmBranco: camposEmBranco(data) };
}
