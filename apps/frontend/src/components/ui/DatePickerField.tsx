'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';

export type DatePickerFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  /** `form` = altura alinhada aos inputs do formulário; `table` = célula da grade */
  size?: 'form' | 'table';
  /** `field` = caixa com borda; `inline` = só texto + ícone (tabela) */
  appearance?: 'field' | 'inline';
  className?: string;
  noFocusRing?: boolean;
  'aria-label'?: string;
};

function parseYmd(s: string): Date | null {
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toYmd(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${mo}-${day}`;
}

function formatDisplayBr(ymd: string): string {
  const d = parseYmd(ymd);
  if (!d) return '';
  return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export function DatePickerField({
  value,
  onChange,
  placeholder = 'Selecione a data',
  disabled = false,
  size = 'form',
  appearance = 'field',
  className,
  noFocusRing = false,
  'aria-label': ariaLabel
}: DatePickerFieldProps) {
  const listboxId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => parseYmd(value) ?? new Date());
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 280 });

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const popoverH = 340;
    const gap = 6;
    let top = rect.bottom + gap;
    if (top + popoverH > window.innerHeight - 8) {
      top = Math.max(8, rect.top - popoverH - gap);
    }
    const width = 280;
    let left = rect.left;
    if (left + width > window.innerWidth - 8) {
      left = window.innerWidth - width - 8;
    }
    left = Math.max(8, left);
    setCoords({ top, left, width });
  }, []);

  useEffect(() => {
    if (parseYmd(value)) setViewDate(parseYmd(value)!);
  }, [value]);

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const onScrollOrResize = () => updatePosition();
    window.addEventListener('scroll', onScrollOrResize, true);
    window.addEventListener('resize', onScrollOrResize);
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    };
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthLabel = viewDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const todayYmd = toYmd(new Date());
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const pickDay = (day: number) => {
    onChange(toYmd(new Date(year, month, day, 12, 0, 0, 0)));
    setOpen(false);
  };

  const triggerCls = clsx(
    'group flex w-full min-w-0 items-center justify-between gap-2 text-left transition-[border-color,box-shadow,background-color]',
    'disabled:cursor-not-allowed disabled:opacity-60',
    appearance === 'inline'
      ? clsx(
          'h-auto cursor-pointer border-0 bg-transparent px-1 py-1 text-xs shadow-none focus:outline-none focus:ring-0 sm:text-sm',
          !noFocusRing && open && 'rounded-md ring-2 ring-red-500 dark:ring-red-400'
        )
      : clsx(
          'rounded-md border border-gray-300 bg-white text-gray-900 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100',
          noFocusRing
            ? 'focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0'
            : 'focus:outline-none focus:ring-2 focus:ring-red-500 dark:focus:ring-red-400 focus:border-transparent',
          size === 'form' ? 'h-10 rounded-lg px-3 text-sm' : 'h-9 px-2.5 text-xs sm:text-sm',
          !noFocusRing && open && 'ring-2 ring-red-500 dark:ring-red-400 border-transparent'
        ),
    className
  );

  const popover = open ? (
    <div
      ref={popoverRef}
      id={listboxId}
      role="dialog"
      aria-label="Calendário"
      className="fixed z-[9999] rounded-xl border border-gray-200 bg-white p-3 shadow-xl dark:border-gray-600 dark:bg-gray-800"
      style={{ top: coords.top, left: coords.left, width: coords.width }}
    >
      <div className="flex items-center justify-between mb-3">
        <button
          type="button"
          onClick={() => setViewDate(new Date(year, month - 1, 1))}
          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
          aria-label="Mês anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 capitalize">{monthLabel}</span>
        <button
          type="button"
          onClick={() => setViewDate(new Date(year, month + 1, 1))}
          className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-100"
          aria-label="Próximo mês"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-1">
        {WEEKDAYS.map((d) => (
          <span key={d} className="py-1">
            {d}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (day === null) return <span key={`e-${i}`} aria-hidden />;
          const ymd = toYmd(new Date(year, month, day, 12, 0, 0, 0));
          const selected = value === ymd;
          const isToday = ymd === todayYmd;
          return (
            <button
              key={day}
              type="button"
              onClick={() => pickDay(day)}
              className={clsx(
                'h-9 rounded-lg text-sm transition-colors flex items-center justify-center',
                selected && 'bg-red-600 text-white font-semibold dark:bg-red-500',
                !selected &&
                  isToday &&
                  'font-semibold text-red-600 ring-1 ring-inset ring-red-500/40 dark:text-red-400 dark:ring-red-400/50',
                !selected &&
                  !isToday &&
                  'text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700/80'
              )}
            >
              {day}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-gray-200 pt-3 dark:border-gray-600">
        <button
          type="button"
          onClick={() => {
            onChange('');
            setOpen(false);
          }}
          className="text-xs font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
        >
          Limpar
        </button>
        <button
          type="button"
          onClick={() => {
            onChange(todayYmd);
            setViewDate(new Date());
            setOpen(false);
          }}
          className="text-xs font-semibold text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
        >
          Hoje
        </button>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel ?? placeholder}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? listboxId : undefined}
        className={triggerCls}
        onClick={() => {
          if (disabled) return;
          if (!open) updatePosition();
          setOpen((v) => !v);
        }}
      >
        <span
          className={clsx(
            'min-w-0 truncate tabular-nums',
            value ? 'text-gray-900 dark:text-gray-100' : 'text-gray-400 dark:text-gray-500'
          )}
        >
          {value ? formatDisplayBr(value) : placeholder}
        </span>
        <Calendar
          className={clsx(
            'h-4 w-4 shrink-0',
            appearance === 'inline'
              ? 'text-gray-400 dark:text-gray-500'
              : 'text-gray-400 transition-colors group-hover:text-red-600 dark:text-gray-300 dark:group-hover:text-red-400'
          )}
          aria-hidden
        />
      </button>
      {typeof document !== 'undefined' && popover ? createPortal(popover, document.body) : null}
    </>
  );
}
