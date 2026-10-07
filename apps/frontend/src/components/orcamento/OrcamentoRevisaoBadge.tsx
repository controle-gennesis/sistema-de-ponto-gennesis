'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { ChevronDown } from 'lucide-react';

export type OrcamentoRevisaoOption = {
  label: string;
  href: string;
  current?: boolean;
  congelada?: boolean;
};

/** Exibição: 1 → R01, 12 → R12 */
export function formatOrcamentoRevisao(versao: number | undefined | null): string {
  const n = Number(versao);
  const v = Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  return `R${String(v).padStart(2, '0')}`;
}

type OrcamentoRevisaoBadgeProps = {
  versao?: number | null;
  /** Se informado, tem prioridade sobre `versao` (ex.: crumb do breadcrumb). */
  label?: string;
  /** Se tiver 2+ itens, o badge abre menu para trocar de revisão. */
  options?: OrcamentoRevisaoOption[];
  className?: string;
  size?: 'sm' | 'md';
};

export function OrcamentoRevisaoBadge({
  versao,
  label: labelProp,
  options,
  className = '',
  size = 'md',
}: OrcamentoRevisaoBadgeProps) {
  const label = (labelProp || '').trim() || formatOrcamentoRevisao(versao);
  const menu = (options ?? []).filter((o) => o.href && o.label);
  const canOpen = menu.length > 1;
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const reactId = useId();
  const menuDomId = `orcamento-revisao-badge-menu-${reactId.replace(/:/g, '')}`;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const badgeCls =
    size === 'sm'
      ? 'rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-800 dark:bg-slate-800/60 dark:text-slate-200'
      : 'rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold tabular-nums text-slate-800 dark:bg-slate-800/60 dark:text-slate-200';

  if (!canOpen) {
    return (
      <span className={`inline-flex shrink-0 items-center justify-center ${badgeCls} ${className}`}>
        {label}
      </span>
    );
  }

  const toggle = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const nextOpen = !open;
    if (nextOpen) {
      const menuW = 180;
      let left = r.left;
      left = Math.max(8, Math.min(left, window.innerWidth - menuW - 8));
      setCoords({ top: r.bottom + 4, left });
    }
    setOpen(nextOpen);
  };

  const menuNode =
    open && coords && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={menuRef}
            id={menuDomId}
            role="menu"
            className="fixed z-[3000] min-w-[10.5rem] overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-800"
            style={{ top: coords.top, left: coords.left }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
              Revisões
            </p>
            {menu.map((opt) => (
              <Link
                key={opt.href}
                href={opt.href}
                scroll={false}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-700 ${
                  opt.current
                    ? 'font-semibold text-red-700 dark:text-red-300'
                    : 'text-gray-700 dark:text-gray-200'
                }`}
              >
                <span>{opt.label}</span>
                {opt.congelada ? (
                  <span className="text-[10px] font-medium text-amber-700 dark:text-amber-300">
                    congelada
                  </span>
                ) : opt.current ? (
                  <span className="text-[10px] font-medium text-gray-400">atual</span>
                ) : null}
              </Link>
            ))}
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className={`inline-flex shrink-0 items-center gap-0.5 ${badgeCls} transition-colors hover:bg-slate-200 dark:hover:bg-slate-700 ${className}`}
        title="Ver revisões"
        aria-label={`Revisão ${label}. Abrir lista de revisões`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {label}
        <ChevronDown className="h-3 w-3 opacity-70" aria-hidden />
      </button>
      {menuNode}
    </>
  );
}
