'use client';

import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Loader2,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { absoluteUploadUrl } from '@/lib/apiOrigin';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { Modal } from '@/components/ui/Modal';
import {
  formatCurrencyInputBrFromNumber,
  maskCurrencyInputBrOrEmpty,
  parseCurrencyInputBr,
} from '@/lib/maskCurrencyBr';
import { formatPhoneBR } from '@/lib/phone';
import {
  MAPA_COTACAO_MAX_PROPOSTAS,
  MAPA_COTACAO_MIN_PROPOSTAS,
  chaveMapaCotacao,
  mapaCotacaoVazio,
  novaProposta,
  propostaMenorValor,
  statusDoMapa,
  valorAdotadoDoMapa,
  type MapaCotacao,
  type MapaCotacaoAnexo,
  type MapaCotacaoProposta,
  type MapasCotacao,
} from './orcamentoMapaCotacao';

export type ComposicaoCotacao = {
  /** Número do item no orçamento (ex.: 1.1.1). */
  item: string;
  banco: string;
  codigo: string;
  descricao: string;
  unidade: string;
  /** Valor unitário (sem BDI) que está no orçamento hoje. */
  precoOrcamento: number | null;
  /** Em quantos itens do orçamento a composição aparece. */
  usos: number;
};

type Props = {
  composicoes: ComposicaoCotacao[];
  mapas: MapasCotacao;
  onChange: (chave: string, mapa: MapaCotacao) => void;
  readOnly?: boolean;
  onUploadAnexo: (file: File) => Promise<MapaCotacaoAnexo>;
};

const brl = (n: number | null | undefined) =>
  n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Mesmo raio do seletor de data e dos selects, para os campos do cartão ficarem alinhados.
const inputCls = 'input !rounded-lg';

/** Máscara progressiva: CPF (11 dígitos) ou CNPJ (14 dígitos). */
function maskCpfCnpj(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 11) {
    if (d.length <= 3) return d;
    if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
    if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  if (d.length <= 12) return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8)}`;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

const labelCls = 'mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300';

function CampoValor({
  valor,
  onCommit,
  disabled,
  className,
}: {
  valor: number | null;
  onCommit: (n: number | null) => void;
  disabled?: boolean;
  className?: string;
}) {
  const semMoeda = (t: string) => t.replace(/^R\$\s*/, '');
  const [texto, setTexto] = useState(semMoeda(formatCurrencyInputBrFromNumber(valor)));
  const ultimoRef = useRef(valor);
  if (ultimoRef.current !== valor) {
    // Valor mudou por fora (ex.: limpou): acompanha, sem brigar com a digitação.
    ultimoRef.current = valor;
    if (parseCurrencyInputBr(texto) !== valor) setTexto(semMoeda(formatCurrencyInputBrFromNumber(valor)));
  }
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-500 dark:text-gray-400">
        R$
      </span>
      <input
        type="text"
        inputMode="numeric"
        disabled={disabled}
        value={texto}
        placeholder="0,00"
        onChange={(e) => {
          const masked = semMoeda(maskCurrencyInputBrOrEmpty(e.target.value));
          setTexto(masked);
          const n = parseCurrencyInputBr(masked);
          ultimoRef.current = n;
          onCommit(n);
        }}
        className={`${inputCls} pl-9 text-right tabular-nums ${className ?? ''}`}
      />
    </div>
  );
}

function ImagemProposta({
  anexo,
  disabled,
  enviando,
  onEscolher,
  onRemover,
}: {
  anexo: MapaCotacaoAnexo | null;
  disabled?: boolean;
  enviando: boolean;
  onEscolher: (file: File) => void;
  onRemover: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = useState(false);
  const [visualizando, setVisualizando] = useState(false);
  if (anexo) {
    const url = absoluteUploadUrl(anexo.url);
    return (
      <>
        <div className="group relative h-44 overflow-hidden rounded-lg border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/40">
          <button
            type="button"
            onClick={() => setVisualizando(true)}
            title="Ver print em tamanho maior"
            className="block h-full w-full cursor-zoom-in"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={anexo.name} className="h-full w-full object-contain p-2" />
          </button>
          {!disabled ? (
            <button
              type="button"
              onClick={onRemover}
              aria-label="Remover print"
              className="absolute right-2 top-2 inline-flex items-center justify-center rounded-md p-1 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-gray-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        <Modal isOpen={visualizando} onClose={() => setVisualizando(false)} title={anexo.name} size="5xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt={anexo.name} className="mx-auto max-h-[75vh] w-auto max-w-full object-contain" />
        </Modal>
      </>
    );
  }
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onEscolher(f);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        disabled={disabled || enviando}
        onClick={() => inputRef.current?.click()}
        onDragEnter={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!disabled && !enviando) setArrastando(true);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!disabled && !enviando) setArrastando(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setArrastando(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setArrastando(false);
          if (disabled || enviando) return;
          const f = Array.from(e.dataTransfer.files ?? []).find((x) => x.type.startsWith('image/'));
          if (f) onEscolher(f);
          else toast.error('Envie um arquivo de imagem');
        }}
        className={`flex h-44 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
          arrastando
            ? 'border-red-500 bg-red-50/70 dark:border-red-500 dark:bg-red-950/30'
            : 'border-gray-300 bg-gray-50/60 hover:border-red-400 hover:bg-red-50/40 dark:border-gray-600 dark:bg-gray-800/40 dark:hover:border-red-500/50 dark:hover:bg-red-950/20'
        }`}
      >
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-500 dark:bg-gray-700 dark:text-gray-300">
          {enviando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
        </span>
        <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
          {enviando ? 'Enviando…' : arrastando ? 'Solte a imagem aqui' : 'Escolher arquivo'}
        </span>
        {!arrastando && !enviando ? (
          <span className="text-xs text-gray-500 dark:text-gray-400">Ou arraste e solte o print nesta área</span>
        ) : null}
      </button>
    </>
  );
}

function CartaoProposta({
  indice,
  proposta,
  ehMenor,
  disabled,
  podeRemover,
  enviando,
  onChange,
  onRemover,
  onUpload,
}: {
  indice: number;
  proposta: MapaCotacaoProposta;
  ehMenor: boolean;
  disabled?: boolean;
  podeRemover: boolean;
  enviando: boolean;
  onChange: (patch: Partial<MapaCotacaoProposta>) => void;
  onRemover: () => void;
  onUpload: (file: File) => void;
}) {
  const temValor = proposta.valor != null && proposta.valor > 0;
  const siteHref = /^https?:\/\//i.test(proposta.site.trim()) ? proposta.site.trim() : proposta.site.trim() ? `https://${proposta.site.trim()}` : '';
  return (
    <div
      onPaste={(e) => {
        if (disabled) return;
        const arquivo = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'));
        if (arquivo) {
          e.preventDefault();
          onUpload(arquivo);
        }
      }}
      className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white p-3.5 dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold uppercase tracking-wide text-gray-700 dark:text-gray-200">
            {indice + 1}ª Proposta
          </span>
          {ehMenor ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
              Menor preço
            </span>
          ) : null}
        </div>
        {!disabled && podeRemover ? (
          <button
            type="button"
            onClick={onRemover}
            aria-label="Remover proposta"
            title="Remover proposta"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div>
        <label className={labelCls}>Fornecedor</label>
        <input
          type="text"
          disabled={disabled}
          value={proposta.fornecedor}
          placeholder="Nome do fornecedor"
          onChange={(e) => onChange({ fornecedor: e.target.value })}
          className={inputCls}
        />
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className={labelCls}>Valor</label>
          <CampoValor
            valor={proposta.valor}
            disabled={disabled}
            onCommit={(n) => onChange({ valor: n })}
            className={
              temValor
                ? ehMenor
                  ? '!text-emerald-700 dark:!text-emerald-300'
                  : '!text-red-600 dark:!text-red-400'
                : ''
            }
          />
        </div>
        <div>
          <label className={labelCls}>Data</label>
          <DatePickerField
            value={proposta.data}
            onChange={(v) => onChange({ data: v })}
            disabled={disabled}
            size="form"
            placeholder="dd/mm/aaaa"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label className={labelCls}>CNPJ / CPF</label>
          <input
            type="text"
            disabled={disabled}
            value={proposta.cnpj}
            inputMode="numeric"
            placeholder="00.000.000/0000-00"
            onChange={(e) => onChange({ cnpj: maskCpfCnpj(e.target.value) })}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Telefone</label>
          <input
            type="text"
            disabled={disabled}
            value={proposta.telefone}
            inputMode="tel"
            placeholder="(00) 00000-0000"
            onChange={(e) => onChange({ telefone: formatPhoneBR(e.target.value) })}
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <label className={labelCls}>Site</label>
        <div className="flex items-center gap-1.5">
          <input
            type="text"
            disabled={disabled}
            value={proposta.site}
            placeholder="https://…"
            onChange={(e) => onChange({ site: e.target.value })}
            className={inputCls}
          />
          {siteHref ? (
            <a
              href={siteHref}
              target="_blank"
              rel="noreferrer"
              title="Abrir site"
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 text-gray-500 hover:text-red-600 dark:border-gray-600 dark:text-gray-300"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          ) : null}
        </div>
      </div>

      <div>
        <label className={labelCls}>Print da proposta</label>
        <ImagemProposta
          anexo={proposta.anexo}
          disabled={disabled}
          enviando={enviando}
          onEscolher={onUpload}
          onRemover={() => onChange({ anexo: null })}
        />
      </div>

    </div>
  );
}

function CartaoComposicao({
  composicao,
  mapa,
  aberto,
  onToggle,
  readOnly,
  onChange,
  onUploadAnexo,
}: {
  composicao: ComposicaoCotacao;
  mapa: MapaCotacao;
  aberto: boolean;
  onToggle: () => void;
  readOnly?: boolean;
  onChange: (mapa: MapaCotacao) => void;
  onUploadAnexo: (file: File) => Promise<MapaCotacaoAnexo>;
}) {
  const [enviandoId, setEnviandoId] = useState<string | null>(null);
  const adotado = valorAdotadoDoMapa(mapa);
  const menor = propostaMenorValor(mapa);

  const atualizarProposta = (id: string, patch: Partial<MapaCotacaoProposta>) =>
    onChange({ ...mapa, propostas: mapa.propostas.map((p) => (p.id === id ? { ...p, ...patch } : p)) });

  const enviar = async (id: string, file: File) => {
    setEnviandoId(id);
    try {
      const anexo = await onUploadAnexo(file);
      atualizarProposta(id, { anexo });
      toast.success('Print anexado');
    } catch (e: unknown) {
      const err = e as { response?: { data?: { message?: string } }; message?: string };
      toast.error(err.response?.data?.message || err.message || 'Não foi possível enviar o print');
    } finally {
      setEnviandoId(null);
    }
  };

  return (
    <section className="overflow-hidden rounded-lg border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={aberto}
        className="flex w-full items-stretch text-left"
      >
        <span className="flex min-h-[2.75rem] w-[6.5rem] shrink-0 items-center justify-center bg-red-600 px-1 text-sm font-bold tabular-nums text-white dark:bg-red-950/90">
          {composicao.item || '—'}
        </span>
        {[
          { rotulo: 'Código', valor: composicao.codigo, largura: 'w-36' },
          { rotulo: 'Banco', valor: composicao.banco || '—', largura: 'w-28' },
        ].map((c) => (
          <span
            key={c.rotulo}
            className={`flex ${c.largura} shrink-0 flex-col items-center justify-center border-r border-gray-200 px-2 leading-tight dark:border-gray-700`}
          >
            <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              {c.rotulo}
            </span>
            <span className="text-xs font-bold uppercase tabular-nums text-gray-800 dark:text-gray-100">
              {c.valor}
            </span>
          </span>
        ))}
        <span className="flex min-w-0 flex-1 items-center border-r border-gray-200 px-3.5 py-2.5 dark:border-gray-700">
          <span className="min-w-0 flex-1 whitespace-normal break-words text-sm font-bold uppercase leading-relaxed text-gray-900 dark:text-gray-100">
            {composicao.descricao || 'Sem descrição'}
          </span>
        </span>
        <span className="flex w-24 shrink-0 items-center justify-center border-r border-gray-200 px-2 text-[11px] font-bold uppercase tracking-wide text-gray-700 dark:border-gray-700 dark:text-gray-200">
          {composicao.unidade || '—'}
        </span>
        <span className="flex w-40 shrink-0 flex-col items-center justify-center border-r border-gray-200 px-2 leading-tight dark:border-gray-700">
          <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
            Valor adotado
          </span>
          <span className="text-xs font-bold uppercase tabular-nums text-gray-800 dark:text-gray-100">
            {brl(adotado.valor)}
          </span>
        </span>
        <span className="flex w-12 shrink-0 items-center justify-center">
          <ChevronDown className={`h-5 w-5 text-gray-400 transition-transform ${aberto ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {aberto ? (
        <div className="space-y-4 border-t border-gray-200 p-4 dark:border-gray-700">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {mapa.propostas.map((proposta, i) => (
              <CartaoProposta
                key={proposta.id}
                indice={i}
                proposta={proposta}
                ehMenor={menor?.id === proposta.id}
                disabled={readOnly}
                podeRemover={mapa.propostas.length > MAPA_COTACAO_MIN_PROPOSTAS}
                enviando={enviandoId === proposta.id}
                onChange={(patch) => atualizarProposta(proposta.id, patch)}
                onRemover={() =>
                  onChange({
                    ...mapa,
                    propostas: mapa.propostas.filter((p) => p.id !== proposta.id),
                  })
                }
                onUpload={(file) => void enviar(proposta.id, file)}
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function OrcamentoMapaCotacaoPainel({ composicoes, mapas, onChange, readOnly, onUploadAnexo }: Props) {
  const [fechados, setFechados] = useState<Set<string>>(new Set());
  // Mapa ainda não salvo: mantém os mesmos ids entre renderizações (senão os campos perdem o foco).
  const vaziosRef = useRef<Record<string, MapaCotacao>>({});

  return (
    <div className="space-y-4">
      {composicoes.length === 0 ? (
        <p className="rounded-lg border border-dashed border-gray-300 py-10 text-center text-sm text-gray-500 dark:border-gray-600 dark:text-gray-400">
          Nenhuma composição encontrada.
        </p>
      ) : (
        composicoes.map((c) => {
          const chave = chaveMapaCotacao(c.codigo);
          return (
            <CartaoComposicao
              key={chave}
              composicao={c}
              mapa={mapas[chave] ?? (vaziosRef.current[chave] ??= mapaCotacaoVazio())}
              aberto={!fechados.has(chave)}
              onToggle={() =>
                setFechados((prev) => {
                  const next = new Set(prev);
                  if (next.has(chave)) next.delete(chave);
                  else next.add(chave);
                  return next;
                })
              }
              readOnly={readOnly}
              onChange={(mapa) => onChange(chave, mapa)}
              onUploadAnexo={onUploadAnexo}
            />
          );
        })
      )}
    </div>
  );
}
