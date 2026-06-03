const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-6';

export type ComposicaoContextoSubServico = {
  chave?: string;
  codigo: string;
  descricao: string;
  subtitulo: string;
  unidade?: string;
  quantidade?: number;
};

export type GerarSubServicosInput = {
  servicoNome: string;
  dataInicioObra?: string;
  dataFimObra?: string;
  composicoes: ComposicaoContextoSubServico[];
};

export type SubServicoGerado = {
  nome: string;
  composicaoChave?: string;
  observacao?: string;
};

export type GerarSubServicosResult = {
  subServicos: SubServicoGerado[];
  origem: 'ia' | 'heuristica';
};

function isAnthropicEnabled(): boolean {
  const flag = String(process.env.GENNECY_ANTHROPIC_ENABLED ?? '').trim();
  if (flag === '0' || flag.toLowerCase() === 'false') return false;
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

async function callClaude(system: string, user: string): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) return null;

  const model = process.env.GENNECY_ANTHROPIC_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL;

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system,
      messages: [{ role: 'user', content: user }]
    })
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error('[CronogramaSubServico] Claude API error', res.status, errText.slice(0, 400));
    return null;
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  return data.content?.find((c) => c.type === 'text')?.text?.trim() ?? null;
}

function parseJsonArray(text: string): SubServicoGerado[] | null {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]) as unknown;
    if (!Array.isArray(parsed)) return null;
    const out: SubServicoGerado[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const nome = String(o.nome ?? o.name ?? '').trim();
      if (!nome) continue;
      out.push({
        nome: nome.slice(0, 200),
        composicaoChave:
          typeof o.composicaoChave === 'string' && o.composicaoChave.trim()
            ? o.composicaoChave.trim()
            : undefined
      });
    }
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

function gerarHeuristica(input: GerarSubServicosInput): SubServicoGerado[] {
  const { composicoes } = input;
  if (composicoes.length === 0) {
    return [
      { nome: `Planejamento — ${input.servicoNome}` },
      { nome: `Execução — ${input.servicoNome}` },
      { nome: `Encerramento — ${input.servicoNome}` }
    ];
  }

  const porSubtitulo = new Map<string, ComposicaoContextoSubServico[]>();
  for (const c of composicoes) {
    const st = c.subtitulo.trim() || 'Geral';
    const prev = porSubtitulo.get(st) ?? [];
    prev.push(c);
    porSubtitulo.set(st, prev);
  }

  if (porSubtitulo.size > 1) {
    return Array.from(porSubtitulo.entries()).map(([subtitulo, itens]) => ({
      nome: subtitulo,
      composicaoChave: itens[0]?.chave
    }));
  }

  const vistos = new Set<string>();
  const out: SubServicoGerado[] = [];
  for (const c of composicoes) {
    const chave = (c.chave || c.codigo || c.descricao).trim();
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    out.push({
      nome: c.descricao.trim() || c.codigo.trim() || 'Atividade',
      composicaoChave: c.chave
    });
  }
  return out;
}

export class OrcamentoCronogramaSubServicoService {
  async gerarSubServicos(input: GerarSubServicosInput): Promise<GerarSubServicosResult> {
    const composicoes = (input.composicoes ?? []).filter(
      (c) => c && typeof c.descricao === 'string' && c.descricao.trim()
    );

    if (isAnthropicEnabled()) {
      const listaComp = composicoes
        .map((c, i) => {
          const qtd =
            typeof c.quantidade === 'number' && Number.isFinite(c.quantidade) ? c.quantidade : null;
          return `${i + 1}. [${c.codigo || '—'}] ${c.descricao}${
            c.subtitulo ? ` (subtítulo: ${c.subtitulo})` : ''
          }${qtd != null ? ` — ${qtd} ${c.unidade ?? 'un'}` : ''}${c.chave ? ` [chave:${c.chave}]` : ''}`;
        })
        .join('\n');

      const system = `Você é especialista em planejamento de obras civis na Gennesis Engenharia.
Analise um serviço do orçamento e suas composições e proponha subserviços operacionais para acompanhamento do cronograma físico.
Responda APENAS com um JSON array válido (sem markdown), no formato:
[
  { "nome": "descrição curta da etapa", "composicaoChave": "chave opcional" }
]
Regras:
- 3 a 12 subserviços, em ordem lógica de execução na obra.
- Nomes em português, objetivos e práticos (como etapas de canteiro, fundação, etc.).
- Não inclua campo observacao; observações são preenchidas manualmente pelo usuário.
- Agrupe composições relacionadas quando fizer sentido; não repita nomes.
- Use composicaoChave apenas se houver chave informada na lista.
- Não invente composições que não estejam no contexto.`;

      const user = `Serviço: ${input.servicoNome}
Prazo geral da obra: ${input.dataInicioObra || '—'} a ${input.dataFimObra || '—'}

Composições do orçamento:
${listaComp || '(nenhuma composição listada — proponha etapas típicas deste serviço na construção civil)'}`;

      const text = await callClaude(system, user);
      if (text) {
        const parsed = parseJsonArray(text);
        if (parsed && parsed.length > 0) {
          return { subServicos: parsed, origem: 'ia' };
        }
      }
    }

    return { subServicos: gerarHeuristica({ ...input, composicoes }), origem: 'heuristica' };
  }
}
