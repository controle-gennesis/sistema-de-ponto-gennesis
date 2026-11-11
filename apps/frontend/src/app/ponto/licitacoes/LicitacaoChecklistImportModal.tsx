'use client';

import React, { useMemo } from 'react';
import { CheckCircle2, CircleDashed } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import type { RespostaImportada } from './licitacaoChecklistImportIa';

/** Prévia do checklist lido do PDF respondido pela IA, antes de preencher o Conecta. */
export function LicitacaoChecklistImportModal({
  respostas,
  nomeArquivo,
  onClose,
  onConfirmar,
}: {
  respostas: RespostaImportada[] | null;
  nomeArquivo: string;
  onClose: () => void;
  onConfirmar: (respondidas: RespostaImportada[]) => void;
}) {
  const respondidas = useMemo(() => (respostas ?? []).filter((r) => r.resposta.trim()), [respostas]);
  const total = respostas?.length ?? 0;
  const porSecao = useMemo(() => {
    const mapa = new Map<string, RespostaImportada[]>();
    for (const r of respostas ?? []) {
      const lista = mapa.get(r.secao) ?? [];
      lista.push(r);
      mapa.set(r.secao, lista);
    }
    return [...mapa.entries()];
  }, [respostas]);

  return (
    <Modal
      isOpen={!!respostas}
      onClose={onClose}
      title="Importar checklist respondido"
      size="xl"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={respondidas.length === 0}
            onClick={() => onConfirmar(respondidas)}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Preencher checklist ({respondidas.length})
          </button>
        </>
      }
    >
      {respostas ? (
        <div className="space-y-4">
          <div
            className={`rounded-lg border px-4 py-3 text-sm ${
              respondidas.length === 0
                ? 'border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950/30 dark:text-red-200'
                : 'border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200'
            }`}
          >
            <p className="font-semibold">
              {respondidas.length} de {total} item(ns) com resposta em “{nomeArquivo}”.
            </p>
            <p className="mt-0.5 text-xs opacity-90">
              {respondidas.length === 0
                ? 'Não encontrei respostas. Confira se é o PDF devolvido pela IA (com os códigos [1.1], [1.2]…) e se ele tem texto (PDF escaneado não pode ser lido).'
                : 'Ao confirmar, cada item respondido fica marcado e a resposta vai para o comentário. Itens sem resposta não mudam.'}
            </p>
          </div>

          <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
            {porSecao.map(([secao, itens]) => (
              <div key={secao}>
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{secao}</p>
                <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 dark:divide-gray-700/70 dark:border-gray-700">
                  {itens.map((r) => (
                    <li key={r.key} className="flex gap-3 px-3 py-2.5">
                      {r.resposta ? (
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
                      ) : (
                        <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" aria-hidden />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                          <span className="mr-1 font-mono text-xs text-gray-500">[{r.codigo}]</span>
                          {r.label}
                        </p>
                        <p
                          className={`mt-0.5 whitespace-pre-wrap break-words text-sm ${
                            r.resposta ? 'text-gray-700 dark:text-gray-300' : 'italic text-gray-400'
                          }`}
                        >
                          {r.resposta || 'Sem resposta no PDF — o item não será alterado.'}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
