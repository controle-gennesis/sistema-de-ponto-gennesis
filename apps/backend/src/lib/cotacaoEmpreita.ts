import { getContractGestorCostCenterIds } from './contractGestorApprovalAccess';

/**
 * Cotação Empreita (aba do orçamento): empreitas com as cotações feitas com empreiteiros.
 * Fica em `sessaoOrcamento.cotacaoEmpreita`. Não bloqueia FD nem pedido de material; quando não está
 * finalizada (e válida), a aprovação da RM mostra o alerta "COTAÇÃO EMPREITA NÃO PREENCHIDA".
 * Depois de finalizada, só o gestor do contrato e o administrador alteram.
 */

const MIN_COTACOES_POR_EMPREITA = 3;

function digitos(v: unknown): string {
  return String(v ?? '').replace(/\D/g, '');
}

export function cpfValido(v: unknown): boolean {
  const c = digitos(v);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const dv = (base: string, pesoIni: number) => {
    let soma = 0;
    for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (pesoIni - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(c.slice(0, 9), 10) === Number(c[9]) && dv(c.slice(0, 10), 11) === Number(c[10]);
}

export function cnpjValido(v: unknown): boolean {
  const c = digitos(v);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const dv = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = base.split('').reduce((acc, d, i) => acc + Number(d) * pesos[i]!, 0);
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(c.slice(0, 12)) === Number(c[12]) && dv(c.slice(0, 13)) === Number(c[13]);
}

function texto(v: unknown): string {
  return String(v ?? '').trim();
}

function valorNumero(v: unknown): number {
  if (typeof v === 'number') return v;
  const s = texto(v).replace(/[^\d,.-]/g, '');
  if (!s) return NaN;
  const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s);
  return n;
}

/** Cotação completa: campos obrigatórios + CPF/CNPJ válido + valor > 0. */
function cotacaoCompleta(c: Record<string, unknown>): boolean {
  const doc = digitos(c.documento);
  const docOk = doc.length === 11 ? cpfValido(doc) : doc.length === 14 ? cnpjValido(doc) : false;
  const tel = digitos(c.telefone);
  return (
    !!texto(c.nome) &&
    docOk &&
    tel.length >= 10 &&
    valorNumero(c.valor) > 0 &&
    !!texto(c.condicoesPagamento) &&
    !!texto(c.servicos) &&
    !!texto(c.prazoEntrega) &&
    // E-mail é opcional; se preenchido, tem que estar no formato de e-mail.
    (!texto(c.email) || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(texto(c.email)))
  );
}

/** Regra: ao menos 1 empreita; cada uma com ≥3 cotações completas de empreiteiros diferentes (CPF/CNPJ). */
export function cotacaoEmpreitaValida(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return false;
  const empreitas = (raw as { empreitas?: unknown }).empreitas;
  if (!Array.isArray(empreitas) || empreitas.length === 0) return false;
  return empreitas.every((e) => {
    if (!e || typeof e !== 'object') return false;
    if (!texto((e as { nome?: unknown }).nome)) return false;
    const cotacoes = (e as { cotacoes?: unknown }).cotacoes;
    if (!Array.isArray(cotacoes)) return false;
    const completas = cotacoes.filter(
      (c): c is Record<string, unknown> => !!c && typeof c === 'object' && cotacaoCompleta(c as Record<string, unknown>)
    );
    if (completas.length !== cotacoes.length) return false;
    // Fornecedor escolhido ("será utilizado") é obrigatório: um por empreita.
    if (completas.filter((c) => c.escolhida === true).length !== 1) return false;
    return new Set(completas.map((c) => digitos(c.documento))).size >= MIN_COTACOES_POR_EMPREITA;
  });
}

/** Gasto com empreita: soma dos fornecedores marcados como "será utilizado" (um por empreita). */
export function gastoComEmpreita(sessaoOrcamento: unknown): number {
  const raw =
    sessaoOrcamento && typeof sessaoOrcamento === 'object'
      ? (sessaoOrcamento as { cotacaoEmpreita?: unknown }).cotacaoEmpreita
      : undefined;
  const empreitas = raw && typeof raw === 'object' ? (raw as { empreitas?: unknown }).empreitas : undefined;
  if (!Array.isArray(empreitas)) return 0;
  let total = 0;
  for (const e of empreitas) {
    const cotacoes = e && typeof e === 'object' ? (e as { cotacoes?: unknown }).cotacoes : undefined;
    if (!Array.isArray(cotacoes)) continue;
    const escolhida = cotacoes.find(
      (c) => !!c && typeof c === 'object' && (c as { escolhida?: unknown }).escolhida === true
    ) as Record<string, unknown> | undefined;
    const v = escolhida ? valorNumero(escolhida.valor) : NaN;
    if (Number.isFinite(v) && v > 0) total += v;
  }
  return Math.round(total * 100) / 100;
}

/** Preenchida = finalizada e dentro da regra. */
export function cotacaoEmpreitaPreenchida(sessaoOrcamento: unknown): boolean {
  const raw =
    sessaoOrcamento && typeof sessaoOrcamento === 'object'
      ? (sessaoOrcamento as { cotacaoEmpreita?: unknown }).cotacaoEmpreita
      : undefined;
  if (!raw || typeof raw !== 'object') return false;
  const fin = (raw as { finalizada?: unknown }).finalizada;
  return !!fin && typeof fin === 'object' && cotacaoEmpreitaValida(raw);
}

function cotacaoFinalizada(sessaoOrcamento: unknown): boolean {
  const raw =
    sessaoOrcamento && typeof sessaoOrcamento === 'object'
      ? (sessaoOrcamento as { cotacaoEmpreita?: { finalizada?: unknown } }).cotacaoEmpreita
      : undefined;
  return !!raw?.finalizada;
}

/** Gestor do contrato (coluna «Gestor» em Contratos) do centro de custo, ou administrador. */
export async function podeEditarCotacaoEmpreitaFinalizada(
  userId: string,
  isAdmin: boolean,
  centroCustoId: string
): Promise<boolean> {
  if (isAdmin) return true;
  if (!userId || !centroCustoId) return false;
  const ccs = await getContractGestorCostCenterIds(userId);
  return ccs.includes(centroCustoId);
}

/**
 * Gravação da tela: se a cotação gravada está finalizada e o usuário não pode alterá-la,
 * a cotação volta ao que está gravado (o resto da sessão segue normalmente).
 */
export function preservarCotacaoEmpreitaFinalizada(
  gravadoSessao: unknown,
  patch: { sessaoOrcamento?: unknown; servicos?: unknown[] },
  podeEditar: boolean
): { sessaoOrcamento?: unknown; servicos?: unknown[] } {
  if (podeEditar || patch.sessaoOrcamento === undefined) return patch;
  if (!cotacaoFinalizada(gravadoSessao)) return patch;
  const sessao = { ...(patch.sessaoOrcamento as Record<string, unknown>) };
  const gravada = (gravadoSessao as { cotacaoEmpreita?: unknown }).cotacaoEmpreita;
  sessao.cotacaoEmpreita = gravada;
  return { ...patch, sessaoOrcamento: sessao };
}
