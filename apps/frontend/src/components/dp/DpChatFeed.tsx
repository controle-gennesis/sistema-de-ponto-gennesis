'use client';

import React from 'react';
import { FORM_FIELD_TEXTAREA_CLS } from '@/lib/formFieldUi';

export type DpChatItem = { id: string; userName: string; body: string; createdAt: string };

function dayKey(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'unknown';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dayLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR');
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}

/**
 * Conversa no layout da aba Comentários das OCs: lista que rola (com separador por dia) e caixa fixa
 * embaixo com o botão "Comentar". Deve ficar dentro de um contêiner com altura definida.
 */
export function DpChatFeed({
  items,
  loading = false,
  error = false,
  value,
  onChange,
  onSend,
  sending = false,
  readOnly = false,
}: {
  items: DpChatItem[];
  loading?: boolean;
  error?: boolean;
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  sending?: boolean;
  /** Sem caixa de texto (ex.: solicitação encerrada). */
  readOnly?: boolean;
}) {
  const groups: Array<{ key: string; label: string; items: DpChatItem[] }> = [];
  for (const m of items) {
    const key = dayKey(m.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.items.push(m);
    else groups.push({ key, label: dayLabel(m.createdAt) || key, items: [m] });
  }

  const submit = () => {
    if (!value.trim() || sending) return;
    onSend();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {loading ? (
          <p className="py-16 text-center text-sm text-gray-400">Carregando…</p>
        ) : error ? (
          <p className="py-16 text-center text-sm text-gray-400">Não foi possível carregar os comentários.</p>
        ) : items.length === 0 ? (
          <p className="flex h-full min-h-[12rem] items-center justify-center px-2 text-center text-sm text-gray-400">
            Nenhum comentário ainda.
          </p>
        ) : (
          <div className="space-y-3 pb-2">
            {groups.map((g) => (
              <div key={g.key} className="space-y-3">
                <div className="flex items-center gap-3 py-2">
                  <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
                  <span className="shrink-0 text-[11px] font-medium tracking-wide text-gray-400 dark:text-gray-500">
                    {g.label}
                  </span>
                  <div className="h-px flex-1 bg-gray-200 dark:bg-gray-700" />
                </div>
                {g.items.map((m) => (
                  <div key={m.id} className="flex items-start gap-2.5 rounded-lg px-1 py-1">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-[11px] font-semibold text-gray-600 dark:bg-gray-700 dark:text-gray-200">
                      {initials(m.userName || '?')}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-medium leading-tight text-gray-900 dark:text-gray-100">
                          {m.userName}
                        </span>
                        <span className="shrink-0 text-[10px] leading-none whitespace-nowrap text-gray-400">
                          {timeLabel(m.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-snug text-gray-600 dark:text-gray-300">
                        {m.body}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {readOnly ? (
        <p className="shrink-0 border-t border-gray-200 pt-3 text-center text-xs text-gray-400 dark:border-gray-700">
          Esta solicitação está encerrada e permanece disponível apenas para consulta.
        </p>
      ) : (
        <div className="shrink-0 space-y-2 border-t border-gray-200 bg-white pt-3 dark:border-gray-700 dark:bg-gray-800">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            maxLength={4000}
            placeholder="Escrever um comentário..."
            rows={2}
            className={`${FORM_FIELD_TEXTAREA_CLS} mb-0 !min-h-0 resize-none py-2 text-sm`}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <button
            type="button"
            onClick={submit}
            disabled={!value.trim() || sending}
            className="w-full rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-sm font-medium text-gray-800 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"
          >
            {sending ? 'Enviando…' : 'Comentar'}
          </button>
        </div>
      )}
    </div>
  );
}
