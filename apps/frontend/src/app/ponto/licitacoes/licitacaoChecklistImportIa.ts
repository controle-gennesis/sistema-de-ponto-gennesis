import { loadPdfjs } from '@/lib/loadPdfjs';
import { checklistItemKey, type ChecklistSectionDef } from './licitacaoChecklist';

/** Código fixo de cada item no checklist para IA: seção.item, começando em 1 ("1.1", "1.2"…). */
export function codigosChecklistParaIa(sections: ChecklistSectionDef[]) {
  return sections.map((section, i) => ({
    codigo: String(i + 1),
    title: section.title,
    items: section.items.map((item, j) => ({
      codigo: `${i + 1}.${j + 1}`,
      label: item.label,
      key: checklistItemKey(section.id, item.id),
    })),
  }));
}

/** Texto do PDF, linha a linha (agrupa os trechos pela posição vertical na página). */
export async function extrairTextoPdf(file: File): Promise<string> {
  const pdfjs = await loadPdfjs();
  const doc = (await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise) as unknown as {
    numPages: number;
    getPage: (n: number) => Promise<{
      getTextContent: () => Promise<{ items: Array<{ str?: string; transform?: number[]; hasEOL?: boolean }> }>;
    }>;
  };
  const paginas: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const linhas: string[] = [];
    let atual = '';
    let yAtual: number | null = null;
    for (const it of content.items) {
      const str = it.str ?? '';
      const y = Array.isArray(it.transform) ? it.transform[5] : null;
      if (yAtual !== null && y !== null && Math.abs(y - yAtual) > 2) {
        linhas.push(atual);
        atual = '';
      }
      atual += atual && str && !atual.endsWith(' ') && !str.startsWith(' ') ? ` ${str}` : str;
      if (y !== null) yAtual = y;
      if (it.hasEOL) {
        linhas.push(atual);
        atual = '';
        yAtual = null;
      }
    }
    if (atual) linhas.push(atual);
    paginas.push(linhas.join('\n'));
  }
  return paginas.join('\n');
}

const norm = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Limpa a resposta: tira a pergunta repetida, "Resposta:", traços de preenchimento e rodapés. */
function limparResposta(bruto: string, label: string, titulosSecao: Set<string> = new Set()): string {
  let t = bruto
    .replace(/_{3,}/g, ' ')
    // Caixinhas que a IA coloca antes da pergunta ("[x] Prazo contratual:") e códigos repetidos.
    .replace(/^[ \t]*(?:\[[ xX✓✔]?\]|[☐☑☒□■])[ \t]*/gm, '')
    .replace(/^[ \t]*\[\s*\d+\s*\.\s*\d+\s*\][ \t]*/gm, '');
  // Tira a pergunta, se a IA a repetiu no começo.
  const idx = t.search(/resposta\s*:/i);
  if (idx >= 0) {
    t = t.slice(idx).replace(/^resposta\s*:\s*/i, '');
  } else {
    const nLabel = norm(label);
    const linhas = t.split('\n');
    let acumulado = '';
    let corte = 0;
    for (let i = 0; i < linhas.length; i++) {
      acumulado = norm(`${acumulado} ${linhas[i]}`);
      if (nLabel && nLabel.startsWith(acumulado) && acumulado.length > 0) corte = i + 1;
      else break;
    }
    t = linhas.slice(corte).join('\n');
  }
  return t
    .split('\n')
    .map((l) => l.trim())
    .filter(
      (l) =>
        l &&
        !/^p[aá]gina\s+\d+/i.test(l) &&
        !/^gerado em /i.test(l) &&
        !titulosSecao.has(norm(l))
    )
    .join('\n')
    .trim();
}

export type RespostaImportada = {
  key: string;
  codigo: string;
  secao: string;
  label: string;
  resposta: string;
};

/**
 * Acha a resposta de cada item no texto do PDF devolvido pela IA.
 * Cada código [x.y] marca um bloco; o item é reconhecido pela PERGUNTA que vem depois do código
 * (assim itens incluídos, excluídos ou reordenados no checklist depois da exportação não trocam
 * respostas de lugar). Se a pergunta não for reconhecida, vale o código. Sem códigos, procura a
 * pergunta no texto.
 */
export function lerRespostasChecklist(texto: string, sections: ChecklistSectionDef[]): RespostaImportada[] {
  const estrutura = codigosChecklistParaIa(sections);
  const itens = estrutura.flatMap((s) => s.items.map((it) => ({ ...it, secao: s.title })));
  const porCodigo = new Map(itens.map((it) => [it.codigo, it]));

  // Todos os códigos [x.y] do texto (mesmo os que não existem mais no checklist atual).
  const marcadores: Array<{ codigo: string; inicio: number; fim: number }> = [];
  const re = /\[\s*(\d+)\s*\.\s*(\d+)\s*\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(texto))) {
    const codigo = `${Number(m[1])}.${Number(m[2])}`;
    marcadores.push({ codigo, inicio: m.index, fim: m.index + m[0].length });
  }
  const porKey = new Map(itens.map((it) => [it.key, it]));
  /** Item cuja pergunta vem logo depois do código (a mais longa, se mais de uma combinar). */
  const itemPelaPergunta = (inicio: number) => {
    const depois = norm(texto.slice(inicio, inicio + 400));
    let melhor: (typeof itens)[number] | null = null;
    let melhorTam = 0;
    for (const it of itens) {
      const alvo = norm(it.label);
      if (!alvo) continue;
      const prefixo = alvo.slice(0, Math.min(alvo.length, 60));
      if (depois.startsWith(prefixo) && prefixo.length > melhorTam) {
        melhor = it;
        melhorTam = prefixo.length;
      }
    }
    return melhor;
  };

  /** O texto logo depois do código começa com a pergunta do item? */
  const seguidoDaPergunta = (inicio: number, label: string) => {
    const depois = norm(texto.slice(inicio, inicio + label.length + 40));
    const alvo = norm(label).slice(0, 25);
    return !!alvo && depois.startsWith(alvo);
  };

  // Títulos de seção ("1. Viabilidade Financeira"): não são perguntas nem fazem parte de respostas.
  const titulosSecao = new Set(
    estrutura.flatMap((s) => [norm(`${s.codigo}. ${s.title}`), norm(`${s.codigo} ${s.title}`), norm(s.title)])
  );

  // Busca cada pergunta no texto, onde estiver (a ordem do checklist pode ter mudado).
  // Numa linha que combina com mais de uma pergunta, fica a de texto mais longo.
  const linhasTexto = texto.split('\n');
  const inicioLinha: number[] = [];
  {
    let pos = 0;
    for (const l of linhasTexto) {
      inicioLinha.push(pos);
      pos += l.length + 1;
    }
  }
  const nLinhas = linhasTexto.map(norm);
  const alvos = itens.map((it) => ({ it, alvo: norm(it.label).slice(0, 40) })).filter((a) => a.alvo);
  const linhaDoItem = new Map<string, number>();
  nLinhas.forEach((l, i) => {
    if (titulosSecao.has(l)) return;
    let melhor: (typeof alvos)[number] | null = null;
    for (const a of alvos) {
      if (l.includes(a.alvo) && (!melhor || a.alvo.length > melhor.alvo.length)) melhor = a;
    }
    if (melhor && !linhaDoItem.has(melhor.it.key)) linhaDoItem.set(melhor.it.key, i);
  });
  /** Onde começam as perguntas: antes disso é cabeçalho/instruções (códigos ali são citações). */
  const inicioPerguntas = linhaDoItem.size
    ? inicioLinha[Math.min(...linhaDoItem.values())] ?? 0
    : 0;

  // 1º: código seguido da pergunta do item (ou de qualquer pergunta do checklist atual).
  const porPergunta = new Map<string, { resposta: string; ordem: number }>();
  // Reserva: código sozinho (pergunta não reconhecida depois dele).
  const soCodigo = new Map<string, { resposta: string; ordem: number }>();
  marcadores.forEach((mk, i) => {
    const proximo = marcadores[i + 1]?.inicio ?? texto.length;
    const pelaPergunta = itemPelaPergunta(mk.fim);
    const item = pelaPergunta ?? porCodigo.get(mk.codigo);
    if (!item) return;
    const resposta = limparResposta(texto.slice(mk.fim, proximo), item.label, titulosSecao);
    if (!resposta) return;
    const comPergunta = !!pelaPergunta || seguidoDaPergunta(mk.fim, item.label);
    if (!comPergunta && mk.inicio < inicioPerguntas) return; // citação nas instruções
    // Se o mesmo item aparecer mais de uma vez, vale a última ocorrência.
    (comPergunta ? porPergunta : soCodigo).set(item.key, { resposta, ordem: i });
  });

  // 2º: pergunta encontrada no texto (cobre a IA que trocou os códigos por "[x]").
  // A resposta vai até a próxima pergunta conhecida ou até a próxima linha que começa com
  // "[x]"/"[ ]"/código (pergunta de item que não existe mais no checklist).
  const ehInicioDePergunta = (l: string) => /^\s*(?:\[[ xX✓✔]?\]|\[\s*\d+\s*\.\s*\d+\s*\])/.test(l);
  const porBusca = new Map<string, string>();
  {
    const posicoes = [...linhaDoItem.entries()]
      .map(([key, linha]) => ({ key, linha }))
      .sort((a, b) => a.linha - b.linha);
    posicoes.forEach((ps, i) => {
      let fim = posicoes[i + 1]?.linha ?? linhasTexto.length;
      for (let j = ps.linha + 1; j < fim; j++) {
        if (ehInicioDePergunta(linhasTexto[j])) {
          fim = j;
          break;
        }
      }
      const item = porKey.get(ps.key)!;
      const resposta = limparResposta(linhasTexto.slice(ps.linha, fim).join('\n'), item.label, titulosSecao);
      if (resposta) porBusca.set(ps.key, resposta);
    });
  }

  const respostas = new Map<string, string>();
  for (const it of itens) {
    const r = porPergunta.get(it.key)?.resposta ?? porBusca.get(it.key) ?? soCodigo.get(it.key)?.resposta;
    if (r) respostas.set(it.codigo, r);
  }

  return itens.map((it) => ({
    key: it.key,
    codigo: it.codigo,
    secao: it.secao,
    label: it.label,
    resposta: respostas.get(it.codigo) ?? '',
  }));
}
