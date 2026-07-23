'use client';

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock } from 'lucide-react';
import { clsx } from 'clsx';
import {
  DATE_PICKER_POPOVER_CLS,
  datePickerCalendarIconCls,
  datePickerTriggerCls,
  datePickerTriggerTextCls,
} from '@/components/ui/datePickerDropdownUi';
import { getDropdownPortalRoot } from '@/lib/zIndex';

export type TimePickerFieldProps = {
  /** Formato `HH:mm` */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  noFocusRing?: boolean;
  /** Intervalo em minutos (padrão: 15). */
  stepMinutes?: number;
  'aria-label'?: string;
};

function buildTimeOptions(stepMinutes: number): string[] {
  const step = Math.max(1, Math.min(60, stepMinutes));
  const options: string[] = [];
  for (let total = 0; total < 24 * 60; total += step) {
    const h = String(Math.floor(total / 60)).padStart(2, '0');
    const m = String(total % 60).padStart(2, '0');
    options.push(`${h}:${m}`);
  }
  return options;
}

function isValidHm(value: string): boolean {
  return /^\d{2}:\d{2}$/.test(value);
}

function nearestOption(value: string, options: string[]): string {
  if (!isValidHm(value) || options.length === 0) return options[0] ?? '09:00';
  if (options.includes(value)) return value;
  const [h, m] = value.split(':').map(Number);
  const target = h * 60 + m;
  let best = options[0];
  let bestDiff = Infinity;
  for (const opt of options) {
    const [oh, om] = opt.split(':').map(Number);
    const diff = Math.abs(oh * 60 + om - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = opt;
    }
  }
  return best;
}

export function TimePickerField({
  value,
  onChange,
  placeholder = 'hh:mm',
  disabled = false,
  className,
  noFocusRing = false,
  stepMinutes = 15,
  'aria-label': ariaLabel,
}: TimePickerFieldProps) {
  const listboxId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 140 });

  const options = useMemo(() => buildTimeOptions(stepMinutes), [stepMinutes]);
  const hasValue = isValidHm(value);
  const selected = hasValue ? nearestOption(value, options) : '';

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const popoverH = 220;
    const popoverW = Math.max(128, rect.width);
    const gap = 6;
    let top = rect.bottom + gap;
    if (top + popoverH > window.innerHeight - 8) {
      top = Math.max(8, rect.top - popoverH - gap);
    }
    let left = rect.left;
    if (left + popoverW > window.innerWidth - 8) {
      left = window.innerWidth - popoverW - 8;
    }
    left = Math.max(8, left);
    setCoords({ top, left, width: popoverW });
  }, []);

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

  useEffect(() => {
    if (!open || !selected || !listRef.current) return;
    const active = listRef.current.querySelector<HTMLElement>('[data-selected="true"]');
    active?.scrollIntoView({ block: 'center' });
  }, [open, selected]);

  const popover = open ? (
    <div
      ref={popoverRef}
      id={listboxId}
      role="listbox"
      aria-label="Selecionar hora"
      className={clsx(DATE_PICKER_POPOVER_CLS, 'p-1.5')}
      style={{ top: coords.top, left: coords.left, width: coords.width }}
    >
      <div
        ref={listRef}
        className="max-h-52 overflow-y-auto overscroll-contain py-0.5 [scrollbar-gutter:stable]"
        onWheel={(e) => e.stopPropagation()}
      >
        {options.map((opt) => {
          const isSelected = opt === selected;
          return (
            <button
              key={opt}
              type="button"
              role="option"
              aria-selected={isSelected}
              data-selected={isSelected ? 'true' : undefined}
              onClick={() => {
                onChange(opt);
                setOpen(false);
              }}
              className={clsx(
                'flex w-full items-center rounded-lg px-3 py-1.5 text-left text-sm tabular-nums transition-colors',
                isSelected
                  ? 'bg-red-50 font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300'
                  : 'text-gray-800 hover:bg-gray-100 dark:text-gray-100 dark:hover:bg-gray-700/80'
              )}
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel ?? 'Hora'}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        onClick={() => {
          if (disabled) return;
          setOpen((v) => !v);
        }}
        className={datePickerTriggerCls(open, 'field', noFocusRing, className)}
      >
        <span className={datePickerTriggerTextCls(hasValue)}>
          {hasValue ? value : placeholder}
        </span>
        <Clock className={datePickerCalendarIconCls('field')} aria-hidden />
      </button>
      {typeof document !== 'undefined' && popover
        ? createPortal(popover, getDropdownPortalRoot())
        : null}
    </>
  );
}
