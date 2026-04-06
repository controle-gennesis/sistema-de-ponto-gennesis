'use client';

import React from 'react';
import { Info, Plus, Trash2 } from 'lucide-react';
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

  /** Rótulos das colunas (uma vez no topo do card), usando a 1ª linha só para A/V (origem carga). */
  const renderHeaderLabels = (ln0: LinhaMedicao) => {
    const temDimensoes0 = (ln0.C || 0) !== 0 || (ln0.L || 0) !== 0 || (ln0.H || 0) !== 0;
    const mostrarC = tipo !== 'un';
    const mostrarL = tipo === 'm2' || tipo === 'm3';
    const mostrarH = tipo === 'm3';
    const mostrarN = tipo !== 'un';
    const mostrarA = tipo === 'm2' || tipo === 'un' || ehCargaEntulho;
    const mostrarV = tipo === 'm3' || tipo === 'un';
    const fieldLabel = 'text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400';
    const fieldLabelArea =
      'text-[10px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-400';
    const fieldLabelVolume =
      'text-[10px] font-semibold uppercase tracking-wider text-red-700 dark:text-red-400';
    const fieldLabelSubtotal =
      'text-[10px] font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-400';
    const fieldLabelOrigemCarga =
      'text-[10px] font-semibold uppercase tracking-wider text-slate-500/90 dark:text-slate-500';
    const podeEditarCNaCarga0 = ehCargaEntulho && !!ln0.editavelC;
    const podeEditarLNaCarga0 = ehCargaEntulho && !!ln0.editavelL;
    const podeEditarHNaCarga0 = ehCargaEntulho && !!ln0.editavelH;
    const bloquearN = ehCargaEntulho;

    return (
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2 mb-2">
        <div className="flex-1 min-w-[min(100%,220px)]">
          <span className={`${fieldLabel} block text-left`}>Descrição</span>
        </div>
        {mostrarC && (
          <div className="w-[88px] shrink-0 text-center">
            <span className={`${ehCargaEntulho && !podeEditarCNaCarga0 ? fieldLabelOrigemCarga : fieldLabel} block`}>C (m)</span>
          </div>
        )}
        {mostrarL && (
          <div className="w-[88px] shrink-0 text-center">
            <span className={`${ehCargaEntulho && !podeEditarLNaCarga0 ? fieldLabelOrigemCarga : fieldLabel} block`}>L (m)</span>
          </div>
        )}
        {mostrarH && (
          <div className="w-[88px] shrink-0 text-center">
            <span className={`${ehCargaEntulho && !podeEditarHNaCarga0 ? fieldLabelOrigemCarga : fieldLabel} block`}>H (m)</span>
          </div>
        )}
        {mostrarN && (
          <div className="w-[68px] shrink-0 text-center">
            <span className={`${bloquearN ? fieldLabelOrigemCarga : fieldLabel} block`}>N</span>
          </div>
        )}
        <div className="w-[84px] shrink-0 text-center">
          <span
            className={`${fieldLabel} block`}
            title={ehCargaEntulho ? 'Fator de empolamento — único campo editável nesta linha' : 'Fator de empolamento / perdas'}
          >
            %
          </span>
        </div>
        {mostrarA && (
          <div className="w-[88px] shrink-0 text-center">
            <span className={`${temDimensoes0 ? fieldLabelArea : ehCargaEntulho ? fieldLabelOrigemCarga : fieldLabel} block`}>A</span>
          </div>
        )}
        {mostrarV && (
          <div className="w-[88px] shrink-0 text-center">
            <span className={`${temDimensoes0 ? fieldLabelVolume : ehCargaEntulho ? fieldLabelOrigemCarga : fieldLabel} block`}>V</span>
          </div>
        )}
        <div className="w-[104px] shrink-0 text-center">
          <span className={`${fieldLabelSubtotal} block`}>Subtotal</span>
        </div>
        {!ehCargaEntulho && <div className="w-[34px] shrink-0" aria-hidden />}
      </div>
    );
  };

  const renderLinhaCampos = (ln: LinhaMedicao, idx: number, showLabels = true) => {
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

    const fieldLabelDesc =
      'text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1.5 text-left';
    const fieldLabelNum =
      'text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1.5 text-center';
    /** Valores calculados — uma cor por tipo (área / volume / quantidade na linha) */
    const fieldLabelArea =
      'text-[10px] font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-400 block mb-1.5 text-center';
    const fieldLabelVolume =
      'text-[10px] font-semibold uppercase tracking-wider text-red-700 dark:text-red-400 block mb-1.5 text-center';
    const fieldLabelSubtotal =
      'text-[10px] font-semibold uppercase tracking-wider text-emerald-800 dark:text-emerald-400 block mb-1.5 text-center';
    /** Carga manual: rótulos de dados vindos das demolições (não editáveis) */
    const fieldLabelOrigemCargaDesc =
      'text-[10px] font-semibold uppercase tracking-wider text-slate-500/90 dark:text-slate-500 block mb-1.5 text-left';
    const fieldLabelOrigemCargaNum =
      'text-[10px] font-semibold uppercase tracking-wider text-slate-500/90 dark:text-slate-500 block mb-1.5 text-center';
    const inputBase =
      'w-full h-9 px-2.5 text-sm rounded-md border border-slate-200/90 dark:border-gray-600/70 text-gray-900 dark:text-gray-100 outline-none transition-shadow focus:ring-2 focus:ring-inset focus:ring-red-500/25 dark:focus:ring-red-400/25 focus:border-red-400/70 dark:focus:border-red-500/60';
    /** Campos bloqueados na carga manual (vindos da demolição) — visual distinto do % editável */
    const inputBloqueadoCarga =
      'w-full h-9 px-2.5 text-sm rounded-md border border-slate-500/35 dark:border-slate-600/55 bg-slate-600/15 dark:bg-slate-950/70 text-slate-500 dark:text-slate-400 cursor-not-allowed outline-none focus:ring-0 focus:border-slate-500/40 dark:focus:border-slate-600/60';
    const caixaArea =
      'h-9 px-2.5 rounded-md border border-sky-400/50 dark:border-sky-600/50 bg-sky-50 dark:bg-sky-950/45 text-sm font-semibold tabular-nums text-sky-950 dark:text-sky-100 flex items-center justify-center cursor-default select-none';
    const caixaVolume =
      'h-9 px-2.5 rounded-md border border-red-400/50 dark:border-red-600/50 bg-red-50 dark:bg-red-950/45 text-sm font-semibold tabular-nums text-red-950 dark:text-red-100 flex items-center justify-center cursor-default select-none';
    const caixaSubtotal =
      'h-9 px-2.5 rounded-md border border-emerald-400/50 dark:border-emerald-600/50 bg-emerald-50 dark:bg-emerald-950/50 text-sm font-semibold tabular-nums text-emerald-950 dark:text-emerald-100 flex items-center justify-center cursor-default select-none';

    return (
      <div key={idx} className={`flex flex-wrap gap-x-3 gap-y-3 ${showLabels ? 'items-end' : 'items-center'}`}>
        <div className="flex-1 min-w-[min(100%,220px)]">
          {showLabels && (
            <label className={bloquearDescricao ? fieldLabelOrigemCargaDesc : fieldLabelDesc}>Descrição</label>
          )}
          <input
            type="text"
            placeholder="Ex: COBERTURA DAS CALDEIRAS"
            value={ln.descricao || ''}
            onChange={e => !bloquearDescricao && updateLinhaMedicao(rowKey, idx, 'descricao', e.target.value)}
            readOnly={bloquearDescricao}
            className={bloquearDescricao ? inputBloqueadoCarga : `${inputBase} bg-white dark:bg-gray-800/90`}
          />
        </div>
        {mostrarC && (
          <div className="w-[88px] shrink-0">
            {showLabels && (
              <label className={ehCargaEntulho && !podeEditarCNaCarga ? fieldLabelOrigemCargaNum : fieldLabelNum}>C (m)</label>
            )}
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
              className={
                ehCargaEntulho && !podeEditarCNaCarga
                  ? `${inputBloqueadoCarga} text-center`
                  : `${inputBase} text-center bg-white dark:bg-gray-800/90`
              }
            />
          </div>
        )}
        {mostrarL && (
          <div className="w-[88px] shrink-0">
            {showLabels && (
              <label className={ehCargaEntulho && !podeEditarLNaCarga ? fieldLabelOrigemCargaNum : fieldLabelNum}>L (m)</label>
            )}
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
              className={
                ehCargaEntulho && !podeEditarLNaCarga
                  ? `${inputBloqueadoCarga} text-center`
                  : `${inputBase} text-center bg-white dark:bg-gray-800/90`
              }
            />
          </div>
        )}
        {mostrarH && (
          <div className="w-[88px] shrink-0">
            {showLabels && (
              <label className={ehCargaEntulho && !podeEditarHNaCarga ? fieldLabelOrigemCargaNum : fieldLabelNum}>H (m)</label>
            )}
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
              className={
                ehCargaEntulho && !podeEditarHNaCarga
                  ? `${inputBloqueadoCarga} text-center`
                  : `${inputBase} text-center bg-white dark:bg-gray-800/90`
              }
            />
          </div>
        )}
        {mostrarN && (
          <div className="w-[68px] shrink-0">
            {showLabels && <label className={bloquearN ? fieldLabelOrigemCargaNum : fieldLabelNum}>N</label>}
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
              className={bloquearN ? `${inputBloqueadoCarga} text-center` : `${inputBase} text-center bg-white dark:bg-gray-800/90`}
            />
          </div>
        )}
        <div className="w-[84px] shrink-0">
          {showLabels && (
            <label className={fieldLabelNum} title={ehCargaEntulho ? 'Fator de empolamento — único campo editável nesta linha' : 'Fator de empolamento / perdas'}>
              %
            </label>
          )}
          <input
            type="text"
            inputMode="decimal"
            placeholder="1"
            value={draftCalc[`${rowKey}|${idx}|empol`] ?? (empolVal === 0 ? '0' : empolVal === 1 ? '1' : String(empolVal))}
            onChange={e => setDraftCalc(p => ({ ...p, [`${rowKey}|${idx}|empol`]: e.target.value }))}
            onBlur={e =>
              handleCalcBlur(`${rowKey}|${idx}|empol`, draftCalc[`${rowKey}|${idx}|empol`] ?? e.target.value, n => updateLinhaMedicao(rowKey, idx, 'empolamento', Math.max(0, n)))
            }
            className={`${inputBase} text-center bg-white dark:bg-gray-800/90`}
          />
        </div>
        {mostrarA && (
          <div className="w-[88px] shrink-0">
            {showLabels && (
              <label className={temDimensoes ? fieldLabelArea : ehCargaEntulho ? fieldLabelOrigemCargaNum : fieldLabelNum}>A</label>
            )}
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
                className={ehCargaEntulho ? `${inputBloqueadoCarga} text-center` : `${inputBase} text-center bg-white dark:bg-gray-800/90`}
              />
            ) : (
              <div
                className={caixaArea}
                title="Área (m²) — calculada (não editável)"
              >
                {valorA.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
              </div>
            )}
          </div>
        )}
        {mostrarV && (
          <div className="w-[88px] shrink-0">
            {showLabels && (
              <label className={temDimensoes ? fieldLabelVolume : ehCargaEntulho ? fieldLabelOrigemCargaNum : fieldLabelNum}>V</label>
            )}
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
                className={ehCargaEntulho ? `${inputBloqueadoCarga} text-center` : `${inputBase} text-center bg-white dark:bg-gray-800/90`}
              />
            ) : (
              <div
                className={caixaVolume}
                title="Volume (m³) — calculado (não editável)"
              >
                {valorV.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
              </div>
            )}
          </div>
        )}
        <div className="w-[104px] shrink-0">
          {showLabels && <label className={fieldLabelSubtotal}>Subtotal</label>}
          <div
            className={caixaSubtotal}
            title="Quantidade da linha — calculada (não editável)"
          >
            {valorSubtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
          </div>
        </div>
        {!ehCargaEntulho && (
          <div
            className={`w-[34px] shrink-0 flex flex-col ${showLabels ? 'items-center justify-end' : 'items-center justify-center'}`}
          >
            {showLabels && (
              <label className="text-[10px] font-semibold uppercase tracking-wider text-transparent block mb-1.5">·</label>
            )}
            <button
              type="button"
              onClick={() => removeLinhaMedicao(rowKey, idx)}
              className="h-9 w-9 flex items-center justify-center shrink-0 text-slate-500 hover:text-red-600 hover:bg-red-500/10 dark:text-slate-400 dark:hover:text-red-400 dark:hover:bg-red-950/40 rounded-md transition-colors"
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
    if (ehCargaEntulho) {
      return (
        <div className="rounded-xl border border-dashed border-slate-300/90 dark:border-gray-600/70 bg-slate-50 dark:bg-gray-900 px-6 py-7 sm:px-8 text-center space-y-3">
          <div className="flex justify-center">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-slate-200/90 dark:bg-gray-800 text-slate-600 dark:text-gray-400">
              <Info className="h-5 w-5" strokeWidth={2} aria-hidden />
            </span>
          </div>
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-relaxed max-w-lg mx-auto">
            A carga manual de entulho não é medida aqui: o volume vem dos demais serviços do mesmo bloco (demolições, remoções, escavações etc.).
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed max-w-lg mx-auto">
            Inclua primeiro, na aba <span className="font-medium text-gray-800 dark:text-gray-200">Orçamento</span>, as composições que geram entulho e preencha as medições delas. As linhas desta carga aparecem automaticamente quando houver volume calculado.
          </p>
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-dashed border-slate-300/90 dark:border-gray-600/70 bg-slate-50/40 dark:bg-gray-900/25 p-8 text-center space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed max-w-md mx-auto">
          Nenhuma linha de medição. Use os campos abaixo para registrar comprimentos, áreas ou volumes conforme o tipo de serviço.
        </p>
        <button
          type="button"
          onClick={() => addLinhaMedicao(rowKey)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-red-600 text-white text-sm font-semibold hover:bg-red-700 shadow-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          Iniciar medições
        </button>
      </div>
    );
  }

  /** Um único card por composição; cabeçalho das colunas uma vez; linhas só com valores. */
  const cardComposicao =
    'rounded-xl border border-slate-200/75 dark:border-gray-700/55 bg-slate-50/50 dark:bg-gray-950/40 p-3 sm:p-4 shadow-[0_1px_2px_rgba(0,0,0,0.04)] dark:shadow-none';

  if (!ehCargaEntulho) {
    return (
      <div className="space-y-3">
        <div className={cardComposicao}>
          {renderHeaderLabels(dim.linhas[0])}
          <div className="space-y-2.5">
            {dim.linhas.map((ln, idx) => (
              <div key={idx}>{renderLinhaCampos(ln, idx, false)}</div>
            ))}
          </div>
        </div>
        <div className="pt-0.5">
          <button
            type="button"
            onClick={() => addLinhaMedicao(rowKey)}
            className="inline-flex items-center gap-2 h-9 px-3.5 text-sm font-medium border border-dashed border-slate-400/80 dark:border-gray-500/80 rounded-lg hover:bg-slate-100/80 dark:hover:bg-gray-800/80 text-slate-700 dark:text-gray-300 transition-colors"
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
        <div
          key={titulo}
          className="rounded-xl border border-slate-200/80 dark:border-gray-700/60 bg-white/60 dark:bg-gray-950/30 p-4 space-y-3"
        >
          <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {titulo}
          </div>
          <div className={cardComposicao}>
            {renderHeaderLabels(linhas[0].ln)}
            <div className="space-y-2.5">
              {linhas.map(({ ln, idx }) => (
                <div key={idx}>{renderLinhaCampos(ln, idx, false)}</div>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
