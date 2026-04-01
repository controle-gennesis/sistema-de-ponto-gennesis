'use client';

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import type { LinhaMedicao, DimensoesItem, TipoUnidadeFormula } from './orcamentoMedicaoTypes';
import { calcA, calcV, calcularQuantidadeLinha } from './orcamentoMedicaoCalc';

/** Painel de medições (C, L, H, N, %, A, V) — aba Memorial de cálculo. */
type Props = {
  rowKey: string;
  tipoUnidade: TipoUnidadeFormula;
  itemCodigo: string;
  itemBanco: string;
  itemDescricao: string;
  dim: DimensoesItem;
  ehCargaEntulho: boolean;
  draftCalc: Record<string, string>;
  setDraftCalc: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  handleCalcBlur: (draftKey: string, raw: string, onCommit: (n: number) => void) => void;
  updateLinhaMedicao: (itemKey: string, idx: number, campo: keyof LinhaMedicao, valor: number | string) => void;
  addLinhaMedicao: (itemKey: string) => void;
  removeLinhaMedicao: (itemKey: string, idx: number) => void;
};

export function OrcamentoMedicaoPainel({
  rowKey,
  tipoUnidade,
  itemCodigo,
  itemBanco,
  itemDescricao,
  dim,
  ehCargaEntulho,
  draftCalc,
  setDraftCalc,
  handleCalcBlur,
  updateLinhaMedicao,
  addLinhaMedicao,
  removeLinhaMedicao
}: Props) {
  const tipo = tipoUnidade;

  const renderLinhaCampos = (ln: LinhaMedicao, idx: number) => {
    const temDimensoes = (ln.C || 0) !== 0 || (ln.L || 0) !== 0 || (ln.H || 0) !== 0;
    const valorA = calcA(ln);
    const valorV = calcV(ln, tipo);
    const valorSubtotal = calcularQuantidadeLinha(ln, tipo);
    const empolVal =
      ln.empolamento ??
      ((ln as unknown as { percPerda?: number }).percPerda != null
        ? 1 + (ln as unknown as { percPerda: number }).percPerda / 100
        : 0);
    const mostrarC = tipo !== 'un';
    const mostrarL = tipo === 'm2' || tipo === 'm3';
    const mostrarH = tipo === 'm3';
    const mostrarN = tipo !== 'un';
    const mostrarA = tipo === 'm2' || tipo === 'un' || ehCargaEntulho;
    const mostrarV = tipo === 'm3' || tipo === 'un';
    const podeEditarCNaCarga = ehCargaEntulho && !!ln.editavelC;
    const podeEditarLNaCarga = ehCargaEntulho && !!ln.editavelL;
    const podeEditarHNaCarga = ehCargaEntulho && !!ln.editavelH;
    const bloquearDescricao = ehCargaEntulho;
    const bloquearN = ehCargaEntulho;

    return (
      <div key={idx} className="flex flex-wrap items-end gap-2">
        <div className="flex-1 min-w-[200px]">
          <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 block mb-1">Descrição</label>
          <input
            type="text"
            placeholder="Ex: COBERTURA DAS CALDEIRAS"
            value={ln.descricao || ''}
            onChange={e => !bloquearDescricao && updateLinhaMedicao(rowKey, idx, 'descricao', e.target.value)}
            readOnly={bloquearDescricao}
            className={`w-full h-9 px-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-inset focus:ring-red-500/30 dark:focus:ring-red-400/30 focus:border-red-400 dark:focus:border-red-500 ${bloquearDescricao ? 'bg-gray-100 dark:bg-gray-700/45 cursor-not-allowed' : 'bg-white dark:bg-gray-800'}`}
          />
        </div>
        {mostrarC && (
          <div className="w-[90px] shrink-0">
            <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 block mb-1">C (m)</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={draftCalc[`${rowKey}|${idx}|C`] ?? ((ln.C || 0) === 0 ? '' : String(ln.C))}
              onChange={e => (ehCargaEntulho ? podeEditarCNaCarga : true) && setDraftCalc(p => ({ ...p, [`${rowKey}|${idx}|C`]: e.target.value }))}
              onBlur={e =>
                (ehCargaEntulho ? podeEditarCNaCarga : true) &&
                handleCalcBlur(`${rowKey}|${idx}|C`, draftCalc[`${rowKey}|${idx}|C`] ?? e.target.value, n => updateLinhaMedicao(rowKey, idx, 'C', n))
              }
              readOnly={ehCargaEntulho ? !podeEditarCNaCarga : false}
              className={`w-full h-9 px-2 text-sm text-right rounded-md border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-inset focus:ring-red-500/30 dark:focus:ring-red-400/30 focus:border-red-400 dark:focus:border-red-500 ${ehCargaEntulho && !podeEditarCNaCarga ? 'bg-gray-100 dark:bg-gray-700/45 cursor-not-allowed' : 'bg-white dark:bg-gray-800'}`}
            />
          </div>
        )}
        {mostrarL && (
          <div className="w-[90px] shrink-0">
            <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 block mb-1">L (m)</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={draftCalc[`${rowKey}|${idx}|L`] ?? ((ln.L || 0) === 0 ? '' : String(ln.L))}
              onChange={e => (ehCargaEntulho ? podeEditarLNaCarga : true) && setDraftCalc(p => ({ ...p, [`${rowKey}|${idx}|L`]: e.target.value }))}
              onBlur={e =>
                (ehCargaEntulho ? podeEditarLNaCarga : true) &&
                handleCalcBlur(`${rowKey}|${idx}|L`, draftCalc[`${rowKey}|${idx}|L`] ?? e.target.value, n => updateLinhaMedicao(rowKey, idx, 'L', n))
              }
              readOnly={ehCargaEntulho ? !podeEditarLNaCarga : false}
              className={`w-full h-9 px-2 text-sm text-right rounded-md border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-inset focus:ring-red-500/30 dark:focus:ring-red-400/30 focus:border-red-400 dark:focus:border-red-500 ${ehCargaEntulho && !podeEditarLNaCarga ? 'bg-gray-100 dark:bg-gray-700/45 cursor-not-allowed' : 'bg-white dark:bg-gray-800'}`}
            />
          </div>
        )}
        {mostrarH && (
          <div className="w-[90px] shrink-0">
            <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 block mb-1">H (m)</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={draftCalc[`${rowKey}|${idx}|H`] ?? ((ln.H || 0) === 0 ? '' : String(ln.H))}
              onChange={e => (ehCargaEntulho ? podeEditarHNaCarga : true) && setDraftCalc(p => ({ ...p, [`${rowKey}|${idx}|H`]: e.target.value }))}
              onBlur={e =>
                (ehCargaEntulho ? podeEditarHNaCarga : true) &&
                handleCalcBlur(`${rowKey}|${idx}|H`, draftCalc[`${rowKey}|${idx}|H`] ?? e.target.value, n => updateLinhaMedicao(rowKey, idx, 'H', n))
              }
              readOnly={ehCargaEntulho ? !podeEditarHNaCarga : false}
              className={`w-full h-9 px-2 text-sm text-right rounded-md border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-inset focus:ring-red-500/30 dark:focus:ring-red-400/30 focus:border-red-400 dark:focus:border-red-500 ${ehCargaEntulho && !podeEditarHNaCarga ? 'bg-gray-100 dark:bg-gray-700/45 cursor-not-allowed' : 'bg-white dark:bg-gray-800'}`}
            />
          </div>
        )}
        {mostrarN && (
          <div className="w-[70px] shrink-0">
            <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 block mb-1">N</label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="1"
              value={draftCalc[`${rowKey}|${idx}|N`] ?? String(ln.N ?? 1)}
              onChange={e => !bloquearN && setDraftCalc(p => ({ ...p, [`${rowKey}|${idx}|N`]: e.target.value }))}
              onBlur={e =>
                !bloquearN && handleCalcBlur(`${rowKey}|${idx}|N`, draftCalc[`${rowKey}|${idx}|N`] ?? e.target.value, n => updateLinhaMedicao(rowKey, idx, 'N', Math.max(1, n)))
              }
              readOnly={bloquearN}
              className={`w-full h-9 px-2 text-sm text-right rounded-md border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-inset focus:ring-red-500/30 dark:focus:ring-red-400/30 focus:border-red-400 dark:focus:border-red-500 ${bloquearN ? 'bg-gray-100 dark:bg-gray-700/45 cursor-not-allowed' : 'bg-white dark:bg-gray-800'}`}
            />
          </div>
        )}
        <div className="w-[90px] shrink-0">
          <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 block mb-1">%</label>
          <input
            type="text"
            inputMode="decimal"
            placeholder="1"
            value={draftCalc[`${rowKey}|${idx}|empol`] ?? (empolVal === 0 ? '0' : empolVal === 1 ? '1' : String(empolVal))}
            onChange={e => setDraftCalc(p => ({ ...p, [`${rowKey}|${idx}|empol`]: e.target.value }))}
            onBlur={e =>
              handleCalcBlur(`${rowKey}|${idx}|empol`, draftCalc[`${rowKey}|${idx}|empol`] ?? e.target.value, n => updateLinhaMedicao(rowKey, idx, 'empolamento', Math.max(0, n)))
            }
            className="w-full h-9 px-2 text-sm text-right rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-inset focus:ring-red-500/30 dark:focus:ring-red-400/30 focus:border-red-400 dark:focus:border-red-500"
          />
        </div>
        {mostrarA && (
          <div className="w-[90px] shrink-0">
            <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 block mb-1">A</label>
            {!temDimensoes ? (
              <input
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={draftCalc[`${rowKey}|${idx}|A`] ?? (ln.valorManual == null || ln.valorManual === 0 ? '' : String(ln.valorManual))}
                onChange={e => !ehCargaEntulho && setDraftCalc(p => ({ ...p, [`${rowKey}|${idx}|A`]: e.target.value }))}
                onBlur={e =>
                  !ehCargaEntulho && handleCalcBlur(`${rowKey}|${idx}|A`, draftCalc[`${rowKey}|${idx}|A`] ?? e.target.value, n => updateLinhaMedicao(rowKey, idx, 'valorManual', n))
                }
                readOnly={ehCargaEntulho}
                className={`w-full h-9 px-2 text-sm text-right rounded-md border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-inset focus:ring-red-500/30 dark:focus:ring-red-400/30 focus:border-red-400 dark:focus:border-red-500 ${ehCargaEntulho ? 'bg-gray-100 dark:bg-gray-700/45 cursor-not-allowed' : 'bg-white dark:bg-gray-800'}`}
              />
            ) : (
              <div
                className={`h-9 px-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center justify-end ${ehCargaEntulho ? 'bg-gray-100 dark:bg-gray-700/45' : 'bg-white dark:bg-gray-800'}`}
              >
                {valorA.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
              </div>
            )}
          </div>
        )}
        {mostrarV && (
          <div className="w-[90px] shrink-0">
            <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 block mb-1">V</label>
            {!temDimensoes ? (
              <input
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={draftCalc[`${rowKey}|${idx}|V`] ?? (ln.valorManual == null || ln.valorManual === 0 ? '' : String(ln.valorManual))}
                onChange={e => !ehCargaEntulho && setDraftCalc(p => ({ ...p, [`${rowKey}|${idx}|V`]: e.target.value }))}
                onBlur={e =>
                  !ehCargaEntulho && handleCalcBlur(`${rowKey}|${idx}|V`, draftCalc[`${rowKey}|${idx}|V`] ?? e.target.value, n => updateLinhaMedicao(rowKey, idx, 'valorManual', n))
                }
                readOnly={ehCargaEntulho}
                className={`w-full h-9 px-2 text-sm text-right rounded-md border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100 outline-none focus:ring-2 focus:ring-inset focus:ring-red-500/30 dark:focus:ring-red-400/30 focus:border-red-400 dark:focus:border-red-500 ${ehCargaEntulho ? 'bg-gray-100 dark:bg-gray-700/45 cursor-not-allowed' : 'bg-white dark:bg-gray-800'}`}
              />
            ) : (
              <div
                className={`h-9 px-2 rounded-md border border-gray-300 dark:border-gray-600 text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center justify-end ${ehCargaEntulho ? 'bg-gray-100 dark:bg-gray-700/45' : 'bg-white dark:bg-gray-800'}`}
              >
                {valorV.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
              </div>
            )}
          </div>
        )}
        <div className="w-[110px] shrink-0">
          <label className="text-[11px] font-medium text-gray-500 dark:text-gray-400 block mb-1">Subtotal</label>
          <div className="h-9 px-2 rounded-md border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20 text-sm font-semibold text-red-700 dark:text-red-300 flex items-center justify-end">
            {valorSubtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
          </div>
        </div>
        {!ehCargaEntulho && (
          <div className="w-[34px] shrink-0">
            <label className="text-[11px] font-medium text-transparent block mb-1">.</label>
            <button
              type="button"
              onClick={() => removeLinhaMedicao(rowKey, idx)}
              className="h-9 w-9 flex items-center justify-center shrink-0 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
              title="Remover linha"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    );
  };

  if (!dim.linhas?.length) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800/40 p-6 text-center space-y-3">
        <p className="text-sm text-gray-600 dark:text-gray-400">Nenhuma linha de medição. Inclua C, L, H e demais campos para calcular a quantidade.</p>
        <button
          type="button"
          onClick={() => addLinhaMedicao(rowKey)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700"
        >
          <Plus className="w-4 h-4" />
          Iniciar medições
        </button>
      </div>
    );
  }

  if (!ehCargaEntulho) {
    return (
      <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/40 p-4 space-y-3">
        {dim.linhas.map((ln, idx) => (
          <div key={idx} className={idx > 0 ? 'pt-3 border-t border-gray-200 dark:border-gray-700' : ''}>
            {renderLinhaCampos(ln, idx)}
          </div>
        ))}
        <div className="pt-1">
          <button
            type="button"
            onClick={() => addLinhaMedicao(rowKey)}
            className="inline-flex items-center gap-2 h-8 px-3 text-sm font-medium border border-dashed border-gray-400 dark:border-gray-500 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition-colors"
          >
            <Plus className="w-4 h-4" /> Adicionar linha
          </button>
        </div>
      </div>
    );
  }

  const grupos = new Map<string, { ln: LinhaMedicao; idx: number }[]>();
  dim.linhas.forEach((ln, idx) => {
    const titulo = `${ln.origemComposicaoDescricao || itemDescricao || ''}`.trim().slice(0, 120) || `Linha ${idx + 1}`;
    const lista = grupos.get(titulo) || [];
    lista.push({ ln, idx });
    grupos.set(titulo, lista);
  });

  return (
    <div className="space-y-4">
      {Array.from(grupos.entries()).map(([titulo, linhas]) => (
        <div key={titulo} className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900/40 p-4 space-y-3">
          <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{titulo}</div>
          <div className="space-y-3">
            {linhas.map(({ ln, idx }, i) => (
              <div key={idx} className={i > 0 ? 'pt-3 border-t border-gray-200 dark:border-gray-700' : ''}>
                {renderLinhaCampos(ln, idx)}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
