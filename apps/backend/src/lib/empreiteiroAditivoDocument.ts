import fs from 'fs';
import JSZip from 'jszip';
import { prisma } from './prisma';
import { savePersistentBuffer } from './persistentUpload';
import {
  ContractDocData,
  MESES,
  StoredFile,
  TEMPLATE_PATH,
  brl,
  buildContractDocData,
  camposEmBranco,
  substituirDestaques,
  trocarTitulo,
  valorPorExtenso,
  xmlEscape,
} from './empreiteiroContractDocument';

/**
 * Termo Aditivo do contrato de serviço (Empreitas). Reaproveita o papel, as fontes, a qualificação das
 * partes e o bloco de assinaturas do modelo do contrato, mas o corpo segue o termo aditivo de exemplo:
 * considerandos, objeto, remuneração, vigência e disposições gerais.
 */

const ADITIVO_PREFIX = 'Termo Aditivo';

export type AditivoDocInput = {
  numero: number;
  motivo: string;
  servicosAdicionados: string | null;
  servicosRemovidos: string | null;
  valor: number;
  /** Data (ISO) do contrato original — "firmado em ...". */
  contratoOriginalEm: Date;
  pagamento: { modo: 'avista' | 'parcelado' | 'redistribuir'; parcelas: number[] };
};

function dataExtenso(d: Date): string {
  const p = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  return `${Number(get('day'))} de ${MESES[Number(get('month')) - 1] ?? ''} de ${get('year')}`;
}

const tokenText = (t: string) =>
  (t.match(/<w:t[^>]*>[^<]*<\/w:t>/g) || []).map((x) => x.replace(/<[^>]+>/g, '')).join('');

/** Parágrafo novo com a formatação (pPr + rPr do 1º trecho) de um parágrafo-modelo do contrato. */
function clonar(modelo: string, texto: string): string {
  const pPr = (modelo.match(/<w:pPr>[\s\S]*?<\/w:pPr>/) || [''])[0];
  const rPr = ((modelo.match(/<w:r(?: [^>]*)?>[\s\S]*?<\/w:r>/) || [''])[0].match(/<w:rPr>[\s\S]*?<\/w:rPr>/) || [''])[0];
  return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${xmlEscape(texto)}</w:t></w:r></w:p>`;
}

export async function montarTermoAditivoDocx(data: ContractDocData, a: AditivoDocInput): Promise<Buffer> {
  const zip = await JSZip.loadAsync(fs.readFileSync(TEMPLATE_PATH));
  const xml = await zip.file('word/document.xml')!.async('string');

  const bodyIni = xml.indexOf('<w:body>') + '<w:body>'.length;
  const bodyFim = xml.lastIndexOf('</w:body>');
  const antes = xml.slice(0, bodyIni);
  const depois = xml.slice(bodyFim);
  const corpo = xml.slice(bodyIni, bodyFim);

  // Itens de 1º nível: tabelas, parágrafos e a configuração de página.
  const toks = corpo.match(/<w:tbl>[\s\S]*?<\/w:tbl>|<w:p(?: [^>]*)?>[\s\S]*?<\/w:p>|<w:sectPr[\s\S]*?<\/w:sectPr>/g) || [];
  const achar = (prefixo: string) => toks.findIndex((t) => !t.startsWith('<w:tbl>') && tokenText(t).startsWith(prefixo));
  const iPelo = achar('Pelo presente');
  const iClausula = achar('Cláusula 1ª');
  const iData = achar('Brasília/DF,');
  if (iPelo < 0 || iClausula < 0 || iData < 0 || toks.length < 8) {
    throw new Error('Modelo de contrato alterado: não foi possível montar o termo aditivo');
  }
  const corpoModelo = toks[iPelo];
  const titulo = toks[iClausula];
  const branco = toks[iPelo + 1]; // parágrafo vazio entre os blocos

  const t = (texto: string) => clonar(corpoModelo, texto);
  const h = (texto: string) => clonar(titulo, texto);
  const nl = () => branco;
  const abs = Math.abs(a.valor);
  const valorTxt = `R$ ${brl(abs)} (${valorPorExtenso(abs)})`;
  const dataOriginal = dataExtenso(a.contratoOriginalEm);
  const necessidade = (a.servicosAdicionados || '').trim() || a.motivo.trim();

  const considerando =
    `As partes acima qualificadas, considerando o Contrato de Prestação de Serviços firmado em ${dataOriginal}, ` +
    `referente à prestação de serviços no âmbito do contrato ${data.contratoPrincipal}` +
    `${data.localExecucao.includes('____') ? '' : `, ${data.localExecucao}`}, ` +
    `e a necessidade de ${necessidade}, ` +
    `${a.valor < 0 ? `com redução de ${valorTxt}` : `no valor total de ${valorTxt}`}, ` +
    `no curso da execução contratual, resolvem celebrar o presente ${a.numero}º Termo Aditivo, que se regerá pelas ` +
    `cláusulas e condições a seguir expostas, ficando mantidas em sua integralidade as demais disposições do contrato original.`;

  const objeto = (a.servicosAdicionados || '').trim()
    ? `1.1. O presente Termo Aditivo tem por objeto a inclusão dos seguintes serviços correlatos ao escopo do contrato original: ${(a.servicosAdicionados || '').trim()}, mantendo-se inalteradas as demais condições ajustadas.`
    : `1.1. O presente Termo Aditivo tem por objeto ${a.motivo.trim()}, mantendo-se inalteradas as demais condições ajustadas.`;

  const remuneracao: string[] = [];
  const abertura = `2.1. O valor pelos serviços prestados é de ${a.valor < 0 ? '-' : ''}${valorTxt}. O pagamento será realizado `;
  if (a.pagamento.modo === 'parcelado' && a.pagamento.parcelas.length > 1) {
    remuneracao.push(t(`${abertura}da seguinte forma:`));
    a.pagamento.parcelas.forEach((v, i, arr) => {
      remuneracao.push(t(`${i + 1}ª Parcela: R$ ${brl(v)}${i === arr.length - 1 ? '.' : ';'}`));
    });
  } else if (a.pagamento.modo === 'redistribuir') {
    remuneracao.push(t(`${abertura}mediante redistribuição nas parcelas ainda pendentes do contrato original.`));
  } else {
    remuneracao.push(t(`${abertura}à vista.`));
  }

  const novo: string[] = [
    t(considerando),
    nl(),
    h('Cláusula 1ª - Do objeto do aditivo'),
    t(objeto),
    ...((a.servicosRemovidos || '').trim()
      ? [t(`1.2. Ficam excluídos do escopo do contrato original os seguintes serviços: ${(a.servicosRemovidos || '').trim()}.`)]
      : []),
    nl(),
    h('Cláusula 2ª - Da remuneração e forma de pagamento'),
    ...remuneracao,
    t('2.2. O pagamento será realizado em até 7 dias úteis contados a partir do recebimento da nota fiscal e da aprovação dos serviços, nos termos da cláusula 5.4.'),
    nl(),
    h('Cláusula 3ª - Da vigência'),
    t(`3.1. O presente contrato terá vigência de ${data.vigenciaInicio} a ${data.vigenciaFim}.`),
    t('3.2. O prazo de execução dos serviços acordados no contrato principal deverá ser cumprido dentro da vigência estipulada, aplicando-se, em caso de descumprimento sem justificativa plausível, as penalidades previstas na Cláusula 6ª do contrato original.'),
    nl(),
    h('Cláusula 4ª - Das disposições gerais'),
    t(`4.1. Permanecem inalteradas todas as demais cláusulas e condições do Contrato de Prestação de Serviços firmado entre as partes em ${dataOriginal}, que não tenham sido expressamente modificadas pelo presente instrumento.`),
    t('4.2. As partes elegem o Foro da Circunscrição Judiciária de Brasília/DF para dirimir quaisquer controvérsias oriundas do presente instrumento, com renúncia a qualquer outro, por mais privilegiado que seja.'),
    nl(),
    t('E por estarem justas e acordadas, as partes firmam o presente instrumento em duas vias de igual teor e forma, na presença das testemunhas abaixo.'),
  ];

  // Cabeçalho (título, partes) + corpo novo + data e assinaturas do modelo (da linha em branco antes da data até o fim).
  const montado = [...toks.slice(0, iPelo), ...novo, ...toks.slice(iData - 1)].join('');
  let docXml = antes + montado + depois;
  docXml = trocarTitulo(docXml, `${a.numero}º TERMO ADITIVO AO CONTRATO DE PRESTAÇÃO DE SERVIÇOS`);

  // Destaques que sobraram: contratado (6), data (3) e assinatura (2).
  const valores = [
    data.razaoSocial,
    data.cnpj,
    data.endereco,
    data.socio,
    data.cpf,
    data.telefone,
    data.dia,
    data.mes,
    data.ano,
    data.razaoSocial,
    `CNPJ n. ${data.cnpj}`,
  ];
  docXml = substituirDestaques(docXml, valores, !data.cpf, valores.length);

  zip.file('word/document.xml', docXml);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/** Gera o Termo Aditivo e anexa em "Contrato atualizado" do aditivo (substitui o gerado antes). */
export async function gerarTermoAditivo(addendumId: string): Promise<{ camposEmBranco: string[] }> {
  const ad = await prisma.empreiteiroContractAddendum.findUniqueOrThrow({
    where: { id: addendumId },
    select: {
      id: true,
      number: true,
      reason: true,
      amount: true,
      servicesAdded: true,
      servicesRemoved: true,
      files: true,
      applyPlan: true,
      empreiteiroContractId: true,
      empreiteiroContract: { select: { createdAt: true } },
    },
  });
  const plano = (ad.applyPlan || {}) as { paymentMode?: string; installments?: unknown[] };
  const parcelas = (Array.isArray(plano.installments) ? plano.installments : [])
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v));
  const modo: AditivoDocInput['pagamento']['modo'] =
    plano.paymentMode === 'redistribute' ? 'redistribuir' : parcelas.length > 1 ? 'parcelado' : 'avista';

  const data = await buildContractDocData(ad.empreiteiroContractId);
  const docx = await montarTermoAditivoDocx(data, {
    numero: ad.number,
    motivo: ad.reason,
    servicosAdicionados: ad.servicesAdded,
    servicosRemovidos: ad.servicesRemoved,
    valor: Number(ad.amount),
    contratoOriginalEm: ad.empreiteiroContract.createdAt,
    pagamento: { modo, parcelas },
  });

  const nome = `${ADITIVO_PREFIX} nº ${ad.number} - ${data.razaoSocial}`
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const saved = await savePersistentBuffer({
    folder: 'empreiteiro-files',
    fileName: `aditivo-${ad.id}-${Date.now()}.docx`,
    buffer: docx,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
  const atuais = (Array.isArray(ad.files) ? ad.files : []) as unknown as StoredFile[];
  const mantidos = atuais.filter((f) => !String(f?.name || '').startsWith(ADITIVO_PREFIX));
  await prisma.empreiteiroContractAddendum.update({
    where: { id: ad.id },
    data: {
      files: [...mantidos, { url: saved.url, key: saved.key, name: `${nome}.docx` }] as unknown as object,
    },
  });
  return { camposEmBranco: camposEmBranco(data) };
}
