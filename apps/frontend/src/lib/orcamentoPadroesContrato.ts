/** Dados padrão do orçamento por contrato/órgão (BDI, desconto e data base do cabeçalho). */
export type OrcamentoPadraoContrato = {
  /** Percentuais no formato da tela (vírgula decimal, sem %). */
  bdiPercentual: string;
  descontoPercentual: string;
  /** Texto da DATA BASE no cabeçalho do Excel. */
  dataBase: string;
  /** Nº do contrato com o órgão, quando conhecido. */
  numeroContrato?: string;
};

const PADROES: Array<{ casa: (nomeNormalizado: string) => boolean; padrao: OrcamentoPadraoContrato }> = [
  {
    casa: (n) => /\bsenac\b/.test(n),
    padrao: { bdiPercentual: '22,46', descontoPercentual: '20', dataBase: 'ATUAL' },
  },
  {
    casa: (n) => /ministerio da cultura|\bminc\b/.test(n),
    padrao: {
      bdiPercentual: '25,10',
      descontoPercentual: '20',
      dataBase: 'JUL/2023',
      numeroContrato: '29/2025',
    },
  },
];

function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/** Procura o padrão pelo nome do contrato/órgão (aceita mais de um nome; vale o primeiro que casar). */
export function padraoOrcamentoDoContrato(...nomes: Array<string | null | undefined>): OrcamentoPadraoContrato | null {
  for (const nome of nomes) {
    const n = normalizar(String(nome ?? ''));
    if (!n) continue;
    const achado = PADROES.find((p) => p.casa(n));
    if (achado) return achado.padrao;
  }
  return null;
}
