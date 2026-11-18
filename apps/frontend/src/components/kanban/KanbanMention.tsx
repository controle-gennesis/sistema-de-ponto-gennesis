'use client';

import React, { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import api from '@/lib/api';
import { isGennecyBotUser } from '@/lib/gennecyBot';
import { textMatchesSearch } from '@/lib/normalizeSearchText';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import { getKanbanInitials, resolveKanbanAvatarBg } from './kanbanAvatar';
import type { KanbanPickerUser } from './KanbanMemberPickerModal';
import { kanbanTextarea } from './kanbanFormStyles';

/** Mesma consulta (e cache) do seletor de membros: lista de quem pode ser marcado. */
export function useKanbanMentionUsers(enabled = true, cardId?: string) {
  const { data = [] } = useQuery({
    queryKey: ['kanban-member-picker-users', 'include-self', cardId ?? 'all'],
    queryFn: async (): Promise<KanbanPickerUser[]> => {
      const res = await api.get('/kanban/picker-users', { params: cardId ? { cardId } : undefined });
      return res.data.data;
    },
    enabled,
    staleTime: 60_000,
  });
  return useMemo(() => data.filter((u) => !isGennecyBotUser(u)), [data]);
}

/** Ids marcados que ainda aparecem como "@Nome" no texto final. */
export function mentionedIdsInText(text: string, picked: Map<string, string>): string[] {
  const ids: string[] = [];
  picked.forEach((name, id) => {
    if (text.includes(`@${name}`)) ids.push(id);
  });
  return ids;
}

const TOKEN_RE = /(^|\s)@([^\n@]{0,30})$/;

type Props = {
  value: string;
  onChange: (next: string) => void;
  onPick: (user: KanbanPickerUser) => void;
  users: KanbanPickerUser[];
  placeholder?: string;
  rows?: number;
  className?: string;
  onSubmitShortcut?: () => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
};

/** Caixa de texto que abre a lista de pessoas ao digitar "@". */
export function KanbanMentionTextarea({
  value,
  onChange,
  onPick,
  users,
  placeholder,
  rows = 2,
  className,
  onSubmitShortcut,
  textareaRef,
}: Props) {
  const innerRef = useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef ?? innerRef;
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);

  const options = useMemo(() => {
    if (query === null) return [];
    const q = query.trim();
    return users
      .filter((u) => !q || textMatchesSearch(`${u.name} ${u.email}`, q))
      .slice(0, 6);
  }, [users, query]);

  const open = query !== null && options.length > 0;

  function detect(text: string, caret: number) {
    const before = text.slice(0, caret);
    const m = TOKEN_RE.exec(before);
    if (m) {
      setQuery(m[2]);
      setActive(0);
    } else {
      setQuery(null);
    }
  }

  function choose(user: KanbanPickerUser) {
    const el = ref.current;
    const caret = el?.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const after = value.slice(caret);
    const m = TOKEN_RE.exec(before);
    if (!m) return;
    const start = before.length - m[2].length - 1; // posição do "@"
    const insert = `@${user.name} `;
    const next = `${before.slice(0, start)}${insert}${after}`;
    onChange(next);
    onPick(user);
    setQuery(null);
    const pos = start + insert.length;
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  }

  return (
    <div className="relative">
      {open && (
        <ul
          role="listbox"
          className="absolute bottom-full left-0 right-0 z-30 mb-1 max-h-56 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
        >
          {options.map((u, i) => {
            const photo = resolveApiMediaUrl(u.profilePhotoUrl ?? null);
            return (
              <li key={u.id} role="option" aria-selected={i === active}>
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    choose(u);
                  }}
                  onMouseEnter={() => setActive(i)}
                  className={clsx(
                    'flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm',
                    i === active
                      ? 'bg-gray-100 dark:bg-gray-700/70'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700/40',
                  )}
                >
                  <span
                    className={clsx(
                      'flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full text-[11px] font-semibold text-white',
                      photo ? '' : resolveKanbanAvatarBg(null, u.id),
                    )}
                  >
                    {photo ? (
                      <img src={photo} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      getKanbanInitials(u.name)
                    )}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-gray-900 dark:text-gray-100">{u.name}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <textarea
        ref={ref}
        value={value}
        rows={rows}
        placeholder={placeholder}
        className={clsx(kanbanTextarea, '!min-h-0 py-2 text-sm', className)}
        onChange={(e) => {
          onChange(e.target.value);
          detect(e.target.value, e.target.selectionStart ?? e.target.value.length);
        }}
        onClick={(e) => detect(value, e.currentTarget.selectionStart ?? value.length)}
        onBlur={() => setQuery(null)}
        onKeyDown={(e) => {
          if (open) {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => (a + 1) % options.length);
              return;
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => (a - 1 + options.length) % options.length);
              return;
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault();
              choose(options[active]);
              return;
            }
            if (e.key === 'Escape') {
              e.preventDefault();
              setQuery(null);
              return;
            }
          }
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && onSubmitShortcut) {
            e.preventDefault();
            onSubmitShortcut();
          }
        }}
      />
    </div>
  );
}

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Texto do comentário com os "@Nome" destacados. */
export function KanbanCommentText({ content, names }: { content: string; names: string[] }) {
  const parts = useMemo(() => {
    const list = [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length);
    if (list.length === 0) return [content];
    const re = new RegExp(`(@(?:${list.map(escapeRe).join('|')}))(?![\\p{L}\\p{N}])`, 'gu');
    return content.split(re);
  }, [content, names]);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('@') && names.includes(p.slice(1)) ? (
          <span
            key={i}
            className="rounded bg-blue-50 px-1 font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
          >
            {p}
          </span>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        ),
      )}
    </>
  );
}
