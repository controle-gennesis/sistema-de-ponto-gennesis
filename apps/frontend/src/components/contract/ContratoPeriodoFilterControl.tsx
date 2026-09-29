'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { clsx } from 'clsx';
import { FORM_FIELD_NO_FOCUS_CLS } from '@/lib/formFieldUi';

const MESES_CURTOS = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
] as const;

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'] as const;

type PeriodPresetId = 'este-mes' | 'mes-anterior' | 'este-ano' | 'todo-contrato' | 'personalizado';

type PeriodPreset = {
  id: Exclude<PeriodPresetId, 'personalizado'>;
  label: string;
};

const PERIOD_PRESETS: PeriodPreset[] = [
  { id: 'este-mes', label: 'Este mês' },
  { id: 'mes-anterior', label: 'Mês anterior' },
  { id: 'este-ano', label: 'Este ano' },
  { id: 'todo-contrato', label: 'Todo o contrato' },
];

function toYmd(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseYmd(value: string): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function compareYmd(a: string, b: string) {
  return a.localeCompare(b);
}

function daysInMonth(year: number, month1to12: number) {
  return new Date(year, month1to12, 0).getDate();
}

function formatDayLabel(ymd: string) {
  const date = parseYmd(ymd);
  if (!date) return ymd;
  return `${date.getDate()} ${MESES_CURTOS[date.getMonth()]}. ${date.getFullYear()}`;
}

export function formatContratoPeriodRangeLabel(from: string, to: string) {
  if (!from && !to) return 'Todo o contrato';
  if (from && to) {
    if (from === to) return formatDayLabel(from);
    return `${formatDayLabel(from)} – ${formatDayLabel(to)}`;
  }
  if (from) return `A partir de ${formatDayLabel(from)}`;
  return `Até ${formatDayLabel(to)}`;
}

function monthBounds(year: number, month1to12: number) {
  return {
    from: toYmd(new Date(year, month1to12 - 1, 1)),
    to: toYmd(new Date(year, month1to12 - 1, daysInMonth(year, month1to12))),
  };
}

function yearBounds(year: number) {
  return {
    from: `${year}-01-01`,
    to: `${year}-12-31`,
  };
}

export function resolveContratoPeriodPreset(
  from: string,
  to: string,
  now = new Date()
): PeriodPresetId {
  if (!from && !to) return 'todo-contrato';
  const curY = now.getFullYear();
  const curM = now.getMonth() + 1;
  const current = monthBounds(curY, curM);
  if (from === current.from && to === current.to) return 'este-mes';
  const prev = new Date(curY, curM - 2, 1);
  const previous = monthBounds(prev.getFullYear(), prev.getMonth() + 1);
  if (from === previous.from && to === previous.to) return 'mes-anterior';
  const year = yearBounds(curY);
  if (from === year.from && to === year.to) return 'este-ano';
  return 'personalizado';
}

/** Deriva mês/ano legados a partir do intervalo (YYYY-MM-DD). */
export function deriveMonthYearFromPeriod(from: string, to: string): {
  month: number;
  year: number;
} {
  if (!from && !to) return { month: 0, year: 0 };
  const start = parseYmd(from || to);
  const end = parseYmd(to || from);
  if (!start || !end) return { month: 0, year: 0 };

  if (start.getFullYear() !== end.getFullYear()) {
    return { month: 0, year: 0 };
  }

  const year = start.getFullYear();
  const fullYear = from === `${year}-01-01` && to === `${year}-12-31`;
  if (fullYear) return { month: 0, year };

  if (start.getMonth() === end.getMonth()) {
    return { month: start.getMonth() + 1, year };
  }

  return { month: 0, year };
}

export function createDefaultContratoPeriod(now = new Date()) {
  return monthBounds(now.getFullYear(), now.getMonth() + 1);
}

export type ContratoPeriodoFilterControlProps = {
  from: string;
  to: string;
  onPeriodChange: (from: string, to: string) => void;
  className?: string;
  /** `underline`: visual alinhado às abas (sem caixa/borda). */
  variant?: 'field' | 'underline';
};

export function ContratoPeriodoFilterControl({
  from,
  to,
  onPeriodChange,
  className = '',
  variant = 'field',
}: ContratoPeriodoFilterControlProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [presetOpen, setPresetOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [pickPhase, setPickPhase] = useState<'start' | 'end'>('start');
  const [viewDate, setViewDate] = useState(() => parseYmd(to || from) ?? new Date());

  const rangeLabel = useMemo(() => formatContratoPeriodRangeLabel(from, to), [from, to]);
  const activePreset = useMemo(() => resolveContratoPeriodPreset(from, to), [from, to]);
  const presetLabel =
    activePreset === 'personalizado'
      ? 'Personalizado'
      : PERIOD_PRESETS.find((preset) => preset.id === activePreset)?.label ?? 'Personalizado';

  useEffect(() => {
    if (!calendarOpen) return;
    setDraftFrom(from);
    setDraftTo(to);
    setPickPhase(from && !to ? 'end' : 'start');
    setViewDate(parseYmd(to || from) ?? new Date());
  }, [calendarOpen, from, to]);

  useEffect(() => {
    if (!calendarOpen && !presetOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setCalendarOpen(false);
        setPresetOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setCalendarOpen(false);
        setPresetOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [calendarOpen, presetOpen]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthLabel = viewDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysCount = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysCount; d++) cells.push(d);

  const activePickPhase: 'start' | 'end' = !draftFrom ? 'start' : !draftTo ? 'end' : pickPhase;
  const todayYmd = toYmd(new Date());

  function dayYmd(day: number) {
    return toYmd(new Date(year, month, day));
  }

  function getDayVisual(day: number) {
    const ymd = dayYmd(day);
    const isStart = !!draftFrom && ymd === draftFrom;
    const isEnd = !!draftTo && ymd === draftTo;
    const inRange =
      !!draftFrom &&
      !!draftTo &&
      draftFrom !== draftTo &&
      compareYmd(ymd, draftFrom) > 0 &&
      compareYmd(ymd, draftTo) < 0;
    return { isStart, isEnd, inRange, isToday: ymd === todayYmd };
  }

  function pickDay(day: number) {
    const ymd = dayYmd(day);
    if (activePickPhase === 'start') {
      setDraftFrom(ymd);
      setDraftTo('');
      setPickPhase('end');
      return;
    }

    let start = draftFrom;
    let end = ymd;
    if (start && compareYmd(end, start) < 0) {
      [start, end] = [end, start];
    }
    setDraftFrom(start);
    setDraftTo(end);
    setPickPhase('start');
    onPeriodChange(start, end);
    setCalendarOpen(false);
  }

  function applyPreset(id: PeriodPreset['id']) {
    const now = new Date();
    const curY = now.getFullYear();
    const curM = now.getMonth() + 1;
    if (id === 'este-mes') {
      const bounds = monthBounds(curY, curM);
      onPeriodChange(bounds.from, bounds.to);
    } else if (id === 'mes-anterior') {
      const prev = new Date(curY, curM - 2, 1);
      const bounds = monthBounds(prev.getFullYear(), prev.getMonth() + 1);
      onPeriodChange(bounds.from, bounds.to);
    } else if (id === 'este-ano') {
      const bounds = yearBounds(curY);
      onPeriodChange(bounds.from, bounds.to);
    } else {
      onPeriodChange('', '');
    }
    setPresetOpen(false);
    setCalendarOpen(false);
  }

  const underlineTriggerCls = (open: boolean) =>
    clsx(
      'inline-flex items-center gap-1.5 whitespace-nowrap rounded-t-lg border-b-2 px-2.5 py-2.5 text-sm font-medium transition-colors',
      open
        ? 'border-red-500 text-red-600 dark:border-red-400 dark:text-red-400'
        : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:border-gray-600 dark:hover:text-gray-200',
      FORM_FIELD_NO_FOCUS_CLS
    );

  const triggerRow =
    variant === 'underline' ? (
      <div className="inline-flex max-w-full items-stretch">
        <button
          type="button"
          onClick={() => {
            setCalendarOpen((open) => !open);
            setPresetOpen(false);
          }}
          className={underlineTriggerCls(calendarOpen)}
          aria-expanded={calendarOpen}
          aria-haspopup="dialog"
          title={rangeLabel}
        >
          <CalendarDays className="h-3.5 w-3.5 shrink-0 opacity-80" aria-hidden />
          <span className="max-w-[11rem] truncate sm:max-w-[14rem]">{rangeLabel}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setPresetOpen((open) => !open);
            setCalendarOpen(false);
          }}
          className={underlineTriggerCls(presetOpen)}
          aria-expanded={presetOpen}
          aria-haspopup="listbox"
        >
          <span>{presetLabel}</span>
          <ChevronDown
            className={clsx(
              'h-3.5 w-3.5 opacity-70 transition-transform',
              presetOpen && 'rotate-180'
            )}
            aria-hidden
          />
        </button>
      </div>
    ) : (
      <div
        className={`inline-flex h-10 max-w-full items-stretch overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800 ${FORM_FIELD_NO_FOCUS_CLS}`}
      >
        <button
          type="button"
          onClick={() => {
            setCalendarOpen((open) => !open);
            setPresetOpen(false);
          }}
          className={`inline-flex min-w-0 items-center gap-2 px-3 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700/60 ${FORM_FIELD_NO_FOCUS_CLS}`}
          aria-expanded={calendarOpen}
          aria-haspopup="dialog"
          title={rangeLabel}
        >
          <CalendarDays className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" aria-hidden />
          <span className="truncate whitespace-nowrap">{rangeLabel}</span>
        </button>

        <span className="w-px shrink-0 self-stretch bg-gray-200 dark:bg-gray-600" aria-hidden />

        <button
          type="button"
          onClick={() => {
            setPresetOpen((open) => !open);
            setCalendarOpen(false);
          }}
          className={`inline-flex shrink-0 items-center gap-1.5 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700/60 ${FORM_FIELD_NO_FOCUS_CLS}`}
          aria-expanded={presetOpen}
          aria-haspopup="listbox"
        >
          <span className="whitespace-nowrap">{presetLabel}</span>
          <ChevronDown
            className={`h-4 w-4 text-gray-400 transition-transform dark:text-gray-500 ${
              presetOpen ? 'rotate-180' : ''
            }`}
            aria-hidden
          />
        </button>
      </div>
    );

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {triggerRow}

      {calendarOpen ? (
        <div className="absolute right-0 z-50 mt-1.5 w-[min(100vw-2rem,20rem)] rounded-lg border border-gray-200 bg-white p-3 shadow-2xl dark:border-gray-600 dark:bg-gray-800">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={() => setViewDate(new Date(year, month - 1, 1))}
              aria-label="Mês anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-semibold capitalize text-gray-900 dark:text-gray-100">
              {monthLabel}
            </span>
            <button
              type="button"
              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
              onClick={() => setViewDate(new Date(year, month + 1, 1))}
              aria-label="Próximo mês"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <p className="mb-2 text-center text-[11px] text-gray-500 dark:text-gray-400">
            {activePickPhase === 'start'
              ? 'Selecione a data inicial'
              : 'Agora selecione a data final'}
          </p>

          <div className="mb-1 grid grid-cols-7 gap-0.5 text-center text-[10px] font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
            {WEEKDAYS.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((day, index) => {
              if (day == null) return <span key={`e-${index}`} />;
              const { isStart, isEnd, inRange, isToday } = getDayVisual(day);
              const isEndpoint = isStart || isEnd;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => pickDay(day)}
                  className={clsx(
                    'flex h-8 items-center justify-center rounded-md text-sm transition-colors',
                    isEndpoint && 'bg-red-600 font-semibold text-white dark:bg-red-500',
                    isToday && !isEndpoint && 'font-semibold text-red-600 dark:text-red-400',
                    inRange &&
                      !isEndpoint &&
                      'bg-red-100/90 text-red-800 dark:bg-red-950/45 dark:text-red-200',
                    !isEndpoint &&
                      !inRange &&
                      !isToday &&
                      'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-700/80'
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-between gap-2 border-t border-gray-200 pt-3 dark:border-gray-700">
            <button
              type="button"
              className="text-xs font-medium text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
              onClick={() => {
                onPeriodChange('', '');
                setCalendarOpen(false);
              }}
            >
              Limpar
            </button>
            <button
              type="button"
              className="text-xs font-semibold text-red-600 hover:text-red-700 dark:text-red-400"
              onClick={() => {
                if (draftFrom && draftTo) {
                  onPeriodChange(draftFrom, draftTo);
                  setCalendarOpen(false);
                }
              }}
            >
              Aplicar
            </button>
          </div>
        </div>
      ) : null}

      {presetOpen ? (
        <div
          role="listbox"
          aria-label="Atalhos de período"
          className="absolute right-0 z-50 mt-1.5 min-w-[11rem] overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-2xl dark:border-gray-600 dark:bg-gray-800"
        >
          {PERIOD_PRESETS.map((preset) => {
            const active = activePreset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => applyPreset(preset.id)}
                className={`flex w-full items-center px-3 py-2.5 text-left text-sm transition-colors ${
                  active
                    ? 'bg-gray-100 font-medium text-gray-900 dark:bg-gray-700/90 dark:text-white'
                    : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-gray-700/50'
                }`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
