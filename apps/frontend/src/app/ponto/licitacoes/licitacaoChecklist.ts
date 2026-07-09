export type ChecklistItemState = {
  checked: boolean;
  comentario: string;
};

export type ChecklistSectionDef = {
  id: string;
  title: string;
  items: Array<{ id: string; label: string }>;
};

export const LICITACAO_CHECKLIST: ChecklistSectionDef[] = [
  {
    id: 'viabilidade-financeira',
    title: '1. Viabilidade Financeira',
    items: [
      { id: 'valor-estimado', label: 'Valor estimado da contratação.' },
      { id: 'prazo-contratual', label: 'Prazo contratual.' },
      { id: 'possibilidade-prorrogacao', label: 'Possibilidade de prorrogação.' },
      { id: 'ticket-medio-mensal', label: 'Ticket médio mensal do contrato.' },
      { id: 'capital-giro-inicial', label: 'Necessidade de capital de giro inicial.' },
      { id: 'prazo-pagamento-orgao', label: 'Prazo médio de pagamento do órgão.' },
      { id: 'aquisicao-equipamentos', label: 'Necessidade de aquisição de equipamentos ou veículos.' },
      { id: 'mao-obra-adicional', label: 'Necessidade de contratação de mão de obra adicional.' },
      { id: 'garantias-contratuais', label: 'Necessidade de garantias contratuais.' },
      { id: 'reajuste-indice', label: 'Reajuste previsto e índice utilizado.' },
      { id: 'repactuacao-mao-obra', label: 'Existência de repactuação para mão de obra.' },
      { id: 'margem-liquida', label: 'Margem líquida estimada.' },
      { id: 'tir-roi', label: 'TIR e ROI estimados do contrato.' },
    ],
  },
  {
    id: 'criterio-julgamento',
    title: '2. Critério de Julgamento',
    items: [
      { id: 'menor-preco', label: 'Menor preço.' },
      { id: 'tecnica-preco', label: 'Técnica e preço.' },
      { id: 'maior-desconto', label: 'Maior desconto.' },
      { id: 'melhor-tecnica', label: 'Melhor técnica.' },
      { id: 'peso-tecnica', label: 'Peso da proposta técnica.' },
      { id: 'peso-comercial', label: 'Peso da proposta comercial.' },
      { id: 'nota-minima-tecnica', label: 'Nota mínima exigida na proposta técnica.' },
    ],
  },
  {
    id: 'objeto-licitacao',
    title: '3. Objeto da Licitação',
    items: [
      { id: 'manutencao-predial', label: 'Manutenção predial.' },
      { id: 'engenharia-civil', label: 'Engenharia civil.' },
      { id: 'ar-condicionado', label: 'Ar-condicionado.' },
      { id: 'eletrica', label: 'Elétrica.' },
      { id: 'hidraulica', label: 'Hidráulica.' },
      { id: 'reformas-obras', label: 'Reformas e obras.' },
      { id: 'facilities', label: 'Facilities.' },
      { id: 'escopo-compativel', label: 'Escopo compatível com a experiência da empresa.' },
      { id: 'complexidade-operacional', label: 'Complexidade operacional aceitável.' },
    ],
  },
  {
    id: 'capacidade-operacional',
    title: '4. Capacidade Operacional',
    items: [
      { id: 'quantidade-postos', label: 'Quantidade de postos previstos.' },
      { id: 'profissionais-tecnicos', label: 'Quantidade de profissionais técnicos exigidos.' },
      { id: 'equipes-simultaneas', label: 'Quantidade de equipes simultâneas necessárias.' },
      { id: 'supervisores-engenheiros', label: 'Disponibilidade de supervisores e engenheiros.' },
      { id: 'atendimento-24x7', label: 'Existência de atendimento 24x7 ou plantão.' },
      { id: 'sla-compativel', label: 'SLA de atendimento compatível com a estrutura atual.' },
      { id: 'regiao-logistica', label: 'Região de atendimento e logística.' },
    ],
  },
  {
    id: 'habilitacao-tecnica',
    title: '5. Habilitação Técnica',
    items: [
      { id: 'cat-compativel', label: 'CAT compatível.' },
      { id: 'acervos-tecnicos', label: 'Acervos técnicos suficientes.' },
      { id: 'quantitativos-minimos', label: 'Quantitativos mínimos atendidos.' },
      { id: 'atestados-capacidade', label: 'Atestados de capacidade técnica compatíveis.' },
      { id: 'registro-crea-cau', label: 'Registro CREA/CAU atualizado.' },
      { id: 'responsaveis-tecnicos', label: 'Responsáveis técnicos disponíveis.' },
      { id: 'certificacoes', label: 'Certificações exigidas.' },
    ],
  },
  {
    id: 'habilitacao-economico-financeira',
    title: '6. Habilitação Econômico-Financeira',
    items: [
      { id: 'patrimonio-liquido', label: 'Patrimônio líquido mínimo.' },
      { id: 'liquidez-corrente', label: 'Índice de liquidez corrente.' },
      { id: 'liquidez-geral', label: 'Índice de liquidez geral.' },
      { id: 'solvencia-geral', label: 'Índice de solvência geral.' },
      { id: 'capital-social-minimo', label: 'Capital social mínimo exigido.' },
      { id: 'garantia-proposta', label: 'Garantia de proposta.' },
      { id: 'seguro-garantia', label: 'Seguro garantia contratual.' },
    ],
  },
  {
    id: 'habilitacao-fiscal-trabalhista',
    title: '7. Habilitação Fiscal e Trabalhista',
    items: [
      { id: 'cnd-federal', label: 'CND Federal.' },
      { id: 'cnd-estadual', label: 'CND Estadual.' },
      { id: 'cnd-municipal', label: 'CND Municipal.' },
      { id: 'fgts', label: 'FGTS.' },
      { id: 'inss', label: 'INSS.' },
      { id: 'cndt', label: 'CNDT.' },
      { id: 'sicaf', label: 'SICAF atualizado.' },
      { id: 'cadastro-orgao', label: 'Cadastro do órgão atualizado.' },
    ],
  },
  {
    id: 'analise-edital',
    title: '8. Análise do Edital',
    items: [
      { id: 'penalidades', label: 'Penalidades previstas.' },
      { id: 'multas-sla', label: 'Multas por SLA.' },
      { id: 'glosas', label: 'Possibilidade de glosas.' },
      { id: 'responsabilidades-contratada', label: 'Responsabilidades da contratada.' },
      { id: 'riscos-transferidos', label: 'Riscos transferidos para a empresa.' },
      { id: 'exigencias-restritivas', label: 'Exigências excessivas ou restritivas.' },
      { id: 'impugnacao-esclarecimentos', label: 'Necessidade de impugnação ou esclarecimentos.' },
    ],
  },
  {
    id: 'analise-concorrencia',
    title: '9. Análise da Concorrência',
    items: [
      { id: 'empresas-participantes', label: 'Empresas que normalmente participam.' },
      { id: 'historico-descontos', label: 'Histórico de descontos vencedores.' },
      { id: 'historico-orgao', label: 'Histórico do órgão contratante.' },
      { id: 'agressividade-concorrencia', label: 'Grau de agressividade esperado da concorrência.' },
      { id: 'possibilidade-vitoria', label: 'Possibilidade real de vitória.' },
    ],
  },
  {
    id: 'estrategia-comercial',
    title: '10. Estratégia Comercial',
    items: [
      { id: 'preco-minimo', label: 'Preço mínimo sustentável.' },
      { id: 'preco-alvo', label: 'Preço alvo.' },
      { id: 'preco-agressivo', label: 'Preço agressivo.' },
      { id: 'margem-minima', label: 'Margem mínima aceitável.' },
      { id: 'estrategia-desconto', label: 'Estratégia de desconto.' },
      { id: 'estrategia-tecnica', label: 'Estratégia técnica.' },
    ],
  },
  {
    id: 'analise-riscos',
    title: '11. Análise de Riscos',
    items: [
      { id: 'dependencia-cliente-unico', label: 'Dependência excessiva de um único cliente.' },
      { id: 'financiamento-bancario', label: 'Necessidade de financiamento bancário.' },
      { id: 'exposicao-trabalhista', label: 'Exposição trabalhista.' },
      { id: 'variacao-materiais', label: 'Exposição a variações de materiais.' },
      { id: 'exposicao-cambial', label: 'Exposição cambial.' },
      { id: 'atraso-pagamento', label: 'Risco de atraso de pagamento.' },
      { id: 'risco-operacional', label: 'Risco operacional.' },
    ],
  },
  {
    id: 'decisao-final',
    title: '12. Decisão Final',
    items: [
      { id: 'participar', label: 'Participar.' },
      { id: 'participar-ajuste-edital', label: 'Participar apenas se houver ajuste no edital.' },
      { id: 'participar-consorcio', label: 'Participar em consórcio.' },
      { id: 'nao-participar', label: 'Não participar.' },
    ],
  },
  {
    id: 'criterios-rapidos',
    title: 'Critérios rápidos para decisão',
    items: [
      { id: 'margem-superior-8', label: 'Margem líquida estimada superior a 8%.' },
      { id: 'capital-giro-suportavel', label: 'Capital de giro suportável.' },
      { id: 'baixo-risco-juridico', label: 'Baixo risco jurídico.' },
      { id: 'habilitacao-tecnica-atendida', label: 'Habilitação técnica atendida.' },
      { id: 'equipe-disponivel', label: 'Equipe disponível para execução.' },
      { id: 'boa-probabilidade-vitoria', label: 'Boa probabilidade de vitória.' },
    ],
  },
];

export function checklistItemKey(sectionId: string, itemId: string): string {
  return `${sectionId}::${itemId}`;
}

export function emptyChecklistState(
  sections: ChecklistSectionDef[] = LICITACAO_CHECKLIST
): Record<string, ChecklistItemState> {
  const state: Record<string, ChecklistItemState> = {};
  for (const section of sections) {
    for (const item of section.items) {
      state[checklistItemKey(section.id, item.id)] = { checked: false, comentario: '' };
    }
  }
  return state;
}

export function mergeChecklistFromSaved(
  saved: Record<string, Partial<ChecklistItemState>> | null | undefined,
  sections: ChecklistSectionDef[] = LICITACAO_CHECKLIST
): Record<string, ChecklistItemState> {
  const base = emptyChecklistState(sections);
  if (!saved) return base;
  for (const [key, val] of Object.entries(saved)) {
    if (!base[key] || !val) continue;
    base[key] = {
      checked: Boolean(val.checked),
      comentario: typeof val.comentario === 'string' ? val.comentario : '',
    };
  }
  return base;
}

export function slugifyChecklistItemId(label: string): string {
  const slug = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
  return slug || 'item';
}

export function createUniqueChecklistItemId(
  section: ChecklistSectionDef,
  label: string
): string {
  const base = slugifyChecklistItemId(label);
  const used = new Set(section.items.map((i) => i.id));
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

export function serializeChecklistForSave(
  state: Record<string, ChecklistItemState>
): Record<string, ChecklistItemState> {
  const out: Record<string, ChecklistItemState> = {};
  for (const [key, val] of Object.entries(state)) {
    out[key] = {
      checked: val.checked,
      comentario: val.comentario.trim(),
    };
  }
  return out;
}

export type ChecklistResumoItem = {
  id: string;
  label: string;
  checked: boolean;
  comentario: string;
};

export type ChecklistResumoSection = {
  id: string;
  title: string;
  items: ChecklistResumoItem[];
};

export function buildChecklistResumo(
  sections: ChecklistSectionDef[],
  state: Record<string, ChecklistItemState>
): ChecklistResumoSection[] {
  const resumo: ChecklistResumoSection[] = [];
  for (const section of sections) {
    const items: ChecklistResumoItem[] = [];
    for (const item of section.items) {
      const key = checklistItemKey(section.id, item.id);
      const row = state[key];
      if (!row) continue;
      const comentario = row.comentario.trim();
      if (row.checked || comentario) {
        items.push({
          id: item.id,
          label: item.label,
          checked: row.checked,
          comentario,
        });
      }
    }
    if (items.length) {
      resumo.push({ id: section.id, title: section.title, items });
    }
  }
  return resumo;
}
