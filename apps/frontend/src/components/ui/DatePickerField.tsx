'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import {
  DATE_PICKER_FOOTER_ACTION_CLS,
  DATE_PICKER_FOOTER_CLEAR_CLS,
  DATE_PICKER_FOOTER_CLS,
  DATE_PICKER_NAV_BTN_CLS,
  DATE_PICKER_POPOVER_CLS,
  DATE_PICKER_WEEKDAY_ROW_CLS,
  DATE_PICKER_WEEKDAYS,
  datePickerCalendarIconCls,
  datePickerDayButtonCls,
  datePickerTriggerCls,
  datePickerTriggerTextCls,
} from '@/components/ui/datePickerDropdownUi';

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

const WEEKDAYS = [...DATE_PICKER_WEEKDAYS];

export function DatePickerField({
  value,
  onChange,
  placeholder = 'dd/mm/aaaa',
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

  const triggerAppearance = appearance === 'inline' ? 'inline' : size === 'table' ? 'table' : 'field';

  const popover = open ? (
    <div
      ref={popoverRef}
      id={listboxId}
      role="dialog"
      aria-label="Calendário"
      className={DATE_PICKER_POPOVER_CLS}
      style={{ top: coords.top, left: coords.left, width: coords.width }}
    >
      <div className="mb-3 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setViewDate(new Date(year, month - 1, 1))}
          className={DATE_PICKER_NAV_BTN_CLS}
          aria-label="Mês anterior"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold capitalize text-gray-900 dark:text-gray-100">{monthLabel}</span>
        <button
          type="button"
          onClick={() => setViewDate(new Date(year, month + 1, 1))}
          className={DATE_PICKER_NAV_BTN_CLS}
          aria-label="Próximo mês"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className={DATE_PICKER_WEEKDAY_ROW_CLS}>
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
              className={datePickerDayButtonCls(selected, isToday)}
            >
              {day}
            </button>
          );
        })}
      </div>

      <div className={DATE_PICKER_FOOTER_CLS}>
        <button
          type="button"
          onClick={() => {
            onChange('');
            setOpen(false);
          }}
          className={DATE_PICKER_FOOTER_CLEAR_CLS}
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
          className={DATE_PICKER_FOOTER_ACTION_CLS}
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
        className={datePickerTriggerCls(open, triggerAppearance, noFocusRing, className)}
        data-form-field-trigger="true"
        onClick={() => {
          if (disabled) return;
          if (!open) updatePosition();
          setOpen((v) => !v);
        }}
      >
        <span className={clsx('min-w-0 truncate tabular-nums', datePickerTriggerTextCls(Boolean(value)))}>
          {value ? formatDisplayBr(value) : placeholder}
        </span>
        <Calendar className={datePickerCalendarIconCls(triggerAppearance)} aria-hidden />
      </button>
      {typeof document !== 'undefined' && popover ? createPortal(popover, document.body) : null}
    </>
  );
}
