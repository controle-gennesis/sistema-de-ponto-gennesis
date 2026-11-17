'use client';

import React from 'react';
import { History } from 'lucide-react';

export type CorrecaoAlteracao = {
  campo: 'material' | 'quantidade' | 'cancelado';
  de?: string;
  para?: string;
};

export type CorrecaoRegistro = {
  em: string;
  por: string;
  alteracoes: CorrecaoAlteracao[];
};

/** Linha do histórico de correções da RM, como vem de `/material-requests/:id/correcoes`. */
export type RmCorrecaoLog = {
  id: string;
  materialId: string | null;
  previousMaterialId: string | null;
  userName: string | null;
  changes: CorrecaoAlteracao[];
  createdAt: string;
};

const fmtDataHora = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};

function textoAlteracao(a: CorrecaoAlteracao): string {
  if (a.campo === 'cancelado') return `item cancelado${a.de ? `: ${a.de}` : ''}`;
  const rotulo = a.campo === 'material' ? 'material' : 'quantidade';
  return `${rotulo}: ${a.de || '—'} → ${a.para || '—'}`;
}

/** Histórico das correções de um item: quem corrigiu, data e hora, e o que mudou. */
export function HistoricoCorrecoes({ registros }: { registros: CorrecaoRegistro[] }) {
  if (registros.length === 0) return null;
  return (
    <div className="mt-1.5 space-y-1 rounded-md border border-amber-200 bg-amber-50/60 px-2 py-1.5 text-[11px] text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/20 dark:text-amber-200">
      <p className="flex items-center gap-1 font-semibold">
        <History className="h-3 w-3" aria-hidden />
        Histórico de correção
      </p>
      {registros.map((r, i) => (
        <p key={`${r.em}-${i}`} className="whitespace-normal">
          <span className="font-medium">
            {r.por || 'Usuário'} · {fmtDataHora(r.em)}
          </span>
          {' — '}
          {r.alteracoes.map(textoAlteracao).join('; ')}
        </p>
      ))}
    </div>
  );
}

/**
 * Correções que levaram ao item atual da RM: segue a cadeia de trocas de material
 * a partir do material atual (material atual ← anterior ← ...).
 */
export function correcoesDoItemRm(logs: RmCorrecaoLog[], materialId: string): CorrecaoRegistro[] {
  const usados = new Set<string>();
  const cadeia: RmCorrecaoLog[] = [];
  let atual: string | null = materialId;
  let guarda = 0;
  while (atual && guarda < 50) {
    guarda += 1;
    const doMaterial = logs.filter((l) => !usados.has(l.id) && l.materialId === atual);
    if (doMaterial.length === 0) break;
    doMaterial.forEach((l) => usados.add(l.id));
    cadeia.push(...doMaterial);
    const anterior = doMaterial.find((l) => l.previousMaterialId && l.previousMaterialId !== atual);
    atual = anterior?.previousMaterialId ?? null;
  }
  return cadeia
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((l) => ({ em: l.createdAt, por: l.userName || '', alteracoes: l.changes }));
}
