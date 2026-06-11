'use client';

import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { clsx } from 'clsx';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/Button';
import { kanbanInput } from './kanbanFormStyles';
import { combineDateTime, splitDateTime, toYmd } from './kanbanDateTime';

function parseYmd(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s + 'T12:00:00');
  return Number.isNaN(d.getTime()) ? null : d;
}

function compareYmd(a: string, b: string): number {
  return a.localeCompare(b);
}

export interface KanbanCardDatesPanelProps {
  startDate: string;
  endDate: string;
  onClose: () => void;
  onSave: (start: string | null, end: string | null) => void | Promise<void>;
  saving?: boolean;
}

/** Conteúdo do painel de datas (usar dentro de Modal). */
export function KanbanCardDatesPanel({
  startDate: initialStart,
  endDate: initialEnd,
  onClose,
  onSave,
  saving,
}: KanbanCardDatesPanelProps) {
  const initialStartParts = splitDateTime(initialStart);
  const initialEndParts = splitDateTime(initialEnd);

  const [startDate, setStartDate] = useState(initialStartParts.date);
  const [startTime, setStartTime] = useState(initialStartParts.time);
  const [endDate, setEndDate] = useState(initialEndParts.date);
  const [endTime, setEndTime] = useState(initialEndParts.time);
  const [viewDate, setViewDate] = useState(
    () => parseYmd(initialEndParts.date || initialStartParts.date) ?? new Date(),
  );
  const [pickPhase, setPickPhase] = useState<'start' | 'end'>('start');

  useEffect(() => {
    const s = splitDateTime(initialStart);
    const e = splitDateTime(initialEnd);
    setStartDate(s.date);
    setStartTime(s.time);
    setEndDate(e.date);
    setEndTime(e.time);
    const anchor = parseYmd(e.date || s.date);
    if (anchor) setViewDate(anchor);
    if (initialStart && initialEnd) setPickPhase('start');
    else if (initialStart && !initialEnd) setPickPhase('end');
    else setPickPhase('start');
  }, [initialStart, initialEnd]);

  const activePickPhase: 'start' | 'end' = !startDate ? 'start' : !endDate ? 'end' : pickPhase;

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const monthLabel = viewDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const todayYmd = toYmd(new Date());
  const viewingTodayMonth =
    year === new Date().getFullYear() && month === new Date().getMonth();
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  function dayYmd(day: number): string {
    return toYmd(new Date(year, month, day));
  }

  function getDayVisual(day: number) {
    const ymd = dayYmd(day);
    const s = startDate;
    const e = endDate;
    const isStart = !!s && ymd === s;
    const isEnd = !!e && ymd === e;
    const inRange =
      !!s && !!e && s !== e && compareYmd(ymd, s) > 0 && compareYmd(ymd, e) < 0;
    const isToday = ymd === todayYmd;
    return { isStart, isEnd, inRange, isToday };
  }

  function pickDay(day: number) {
    const ymd = dayYmd(day);

    if (activePickPhase === 'start') {
      setStartDate(ymd);
      setEndDate('');
      setPickPhase('end');
      return;
    }

    let s = startDate;
    let e = ymd;
    if (s && compareYmd(e, s) < 0) {
      [s, e] = [e, s];
    }
    setStartDate(s);
    setEndDate(e);
    setPickPhase('start');
  }

  function validateDates(): { start: string; end: string } | null {
    if (!startDate.trim()) {
      toast.error('Informe a data de início');
      return null;
    }
    if (!startTime.trim()) {
      toast.error('Informe a hora de início');
      return null;
    }
    if (!endDate.trim()) {
      toast.error('Informe a data de término');
      return null;
    }
    if (!endTime.trim()) {
      toast.error('Informe a hora de término');
      return null;
    }
    const start = combineDateTime(startDate, startTime);
    const end = combineDateTime(endDate, endTime);
    if (new Date(end).getTime() <= new Date(start).getTime()) {
      toast.error('A data e hora de término devem ser posteriores à de início');
      return null;
    }
    return { start, end };
  }

  async function handleSave() {
    const validated = validateDates();
    if (!validated) return;
    await onSave(validated.start, validated.end);
    onClose();
  }

  async function handleRemove() {
    setStartDate('');
    setStartTime('09:00');
    setEndDate('');
    setEndTime('09:00');
    setPickPhase('start');
    await Promise.resolve(onSave(null, null));
    onClose();
  }

  return (
    <div className="w-full max-w-full overflow-x-hidden">
      <div className="select-none">
        <div className="flex items-center justify-between mb-2">
          <div className="flex gap-0.5">
            <button
              type="button"
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              onClick={() => setViewDate(new Date(year - 1, month, 1))}
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              onClick={() => setViewDate(new Date(year, month - 1, 1))}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-col items-center gap-0.5 min-w-0">
            <span className="text-sm font-medium text-gray-800 dark:text-gray-200 capitalize">
              {monthLabel}
            </span>
            {!viewingTodayMonth && (
              <button
                type="button"
                onClick={() => setViewDate(new Date())}
                className="text-[11px] font-medium text-red-600 dark:text-red-400 hover:underline"
              >
                Ir para hoje
              </button>
            )}
          </div>
          <div className="flex gap-0.5">
            <button
              type="button"
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              onClick={() => setViewDate(new Date(year, month + 1, 1))}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              onClick={() => setViewDate(new Date(year + 1, month, 1))}
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <p className="text-[11px] text-gray-500 dark:text-gray-400 text-center mb-2">
          {activePickPhase === 'start'
            ? 'Selecione a data de início no calendário'
            : 'Agora selecione a data de término'}
        </p>

        <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] text-gray-500 dark:text-gray-400 mb-1">
          {['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((day, i) => {
            if (day === null) return <span key={`e-${i}`} />;

            const { isStart, isEnd, inRange, isToday } = getDayVisual(day);
            const isEndpoint = isStart || isEnd;

            return (
              <button
                key={day}
                type="button"
                onClick={() => pickDay(day)}
                aria-current={isToday ? 'date' : undefined}
                title={isToday ? 'Hoje' : undefined}
                className={clsx(
                  'h-8 text-sm rounded-md transition-colors flex items-center justify-center',
                  isEndpoint &&
                    'bg-red-600 dark:bg-red-500 text-white font-semibold',
                  isToday &&
                    !isEndpoint &&
                    'font-semibold text-red-600 dark:text-red-400',
                  inRange &&
                    !isEndpoint &&
                    !isToday &&
                    'bg-red-100/90 dark:bg-red-950/45 text-red-800 dark:text-red-200',
                  !isEndpoint &&
                    !inRange &&
                    !isToday &&
                    'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700/80',
                  !isEndpoint &&
                    !inRange &&
                    isToday &&
                    'hover:bg-gray-100 dark:hover:bg-gray-700/80',
                )}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5 pt-5 border-t border-gray-200 dark:border-gray-700 space-y-5">
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Data de início *</p>
          <div className="kanban-datetime-field grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col">
              <span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                Data *
              </span>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={clsx(kanbanInput, 'w-full')}
              />
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                Hora *
              </span>
              <input
                type="time"
                required
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className={clsx(kanbanInput, 'w-full')}
                title="Hora de início"
              />
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-800 dark:text-gray-200">Data de término *</p>
          <div className="kanban-datetime-field grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col">
              <span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                Data *
              </span>
              <input
                type="date"
                required
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className={clsx(kanbanInput, 'w-full')}
              />
            </div>
            <div className="flex min-w-0 flex-col">
              <span className="mb-1 block text-xs font-medium text-gray-500 dark:text-gray-400">
                Hora *
              </span>
              <input
                type="time"
                required
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className={clsx(kanbanInput, 'w-full')}
                title="Hora de término"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 flex flex-col gap-2 border-t border-gray-200 dark:border-gray-700 pt-4">
        <Button
          type="button"
          className="w-full !bg-red-600 hover:!bg-red-700 !text-white border-transparent focus:outline-none focus:ring-0 focus-visible:ring-0"
          onClick={handleSave}
          loading={saving}
        >
          Salvar
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full border-gray-300 dark:border-gray-600"
          onClick={handleRemove}
          disabled={saving}
        >
          Remover
        </Button>
      </div>
    </div>
  );
}
