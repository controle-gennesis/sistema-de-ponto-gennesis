import api from './api';
import { readApiJson } from './http';

export type ContractListItem = {
  id: string;
  name: string;
  number: string;
  startDate: string;
  endDate: string;
  /** Valor do contrato (já sem os aditivos, que vêm em `addendaTotal`). */
  valuePlusAddenda: number;
  addendaTotal: number;
  costCenter?: { id: string; code: string; name: string } | null;
  /** Cor do contrato (#RRGGBB), a mesma barra colorida do site. Vazio = sem cor. */
  defaultTituloFundo?: string | null;
};

/** Devolve a cor só se for um #RRGGBB válido (como no site). */
export function contractBarColor(c?: { defaultTituloFundo?: string | null } | null): string | null {
  const v = (c?.defaultTituloFundo ?? '').trim();
  return /^#[0-9a-f]{6}$/i.test(v) ? v : null;
}

export type ContractOverviewMonth = {
  label: string;
  faturado: number;
  /** 0 = sem meta definida para o mês. */
  meta: number;
  /** Previsão ainda não faturada (só no mês corrente). */
  previsao: number;
  /** Mês já encerrado ou em andamento. */
  decorrido: boolean;
};

/** Resumo do contrato calculado pelo servidor, com as mesmas regras do site. */
export type ContractOverview = {
  contract: { id: string; name: string; number: string; startDate: string; endDate: string };
  year: number;
  valorContratual: number;
  faturado: number;
  empenhado: number;
  saldoFaturamento: number;
  aEmpenhar: number;
  osAtivas: number;
  osFinalizadas: number;
  meses: ContractOverviewMonth[];
  mesAtual: null | {
    label: string;
    faturado: number;
    meta: number;
    previsao: number;
    producao: number;
  };
};

export async function fetchContracts(search?: string): Promise<ContractListItem[]> {
  const qs = new URLSearchParams({ limit: '200' });
  if (search?.trim()) qs.set('search', search.trim());
  const res = await api.get(`/api/contracts?${qs.toString()}`);
  const json = await readApiJson<{ data?: ContractListItem[] }>(res);
  return json.data ?? [];
}

export async function fetchContractOverview(id: string, year?: number): Promise<ContractOverview> {
  const qs = year ? `?year=${year}` : '';
  const res = await api.get(`/api/contracts/${id}/overview-summary${qs}`);
  const json = await readApiJson<{ data: ContractOverview }>(res);
  return json.data;
}
