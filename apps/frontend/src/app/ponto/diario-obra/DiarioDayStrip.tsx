'use client';

import React from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';

const WEEKDAY_LETTER = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const WEEKDAY_FULL = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const pad = (n: number) => String(n).padStart(2, '0');
const toIso = (y: number, m0: number, d: number) => `${y}-${pad(m0 + 1)}-${pad(d)}`;
const brDate = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
};
const weekdayOf = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return WEEKDAY_FULL[new Date(y, m - 1, d).getDay()];
};

/**
 * Faixa de dias do mês para filtrar a lista de diários: clicar num dia mostra só os diários dele,
 * clicar de novo (ou em "Limpar dia") volta a mostrar todos. Mesmo visual da faixa do editor do diário,
 * só com os dias (sem marcadores de situação).
 */
export function DiarioDayStrip({
  year,
  month0,
  onShiftMonth,
  selected,
  onSelect,
  today,
}: {
  year: number;
  month0: number;
  onShiftMonth: (delta: number) => void;
  selected: string;
  onSelect: (iso: string) => void;
  today: string;
}) {
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();

  return (
    <Card className="min-w-0">
      <CardHeader className="border-b-0 pb-1">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-center space-x-3">
            <div className="shrink-0 rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
              <CalendarDays className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 sm:text-lg">Filtrar por dia</h3>
              <p className="text-xs text-gray-600 dark:text-gray-400 sm:text-sm">
                {selected
                  ? `${brDate(selected)} · ${weekdayOf(selected)}`
                  : 'Clique em um dia para ver só os diários dele'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selected ? (
              <button
                type="button"
                onClick={() => onSelect('')}
                className="inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
              >
                <X className="h-3.5 w-3.5" />
                Limpar dia
              </button>
            ) : null}
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => onShiftMonth(-1)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                aria-label="Mês anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[7.5rem] text-center text-xs font-medium tabular-nums text-gray-600 dark:text-gray-300 sm:min-w-[8.5rem]">
                {MONTH_NAMES[month0]} de {year}
              </span>
              <button
                type="button"
                onClick={() => onShiftMonth(1)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                aria-label="Próximo mês"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-w-0">
        <div className="flex gap-1 overflow-x-auto pb-1">
          {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
            const iso = toIso(year, month0, d);
            const wd = new Date(year, month0, d).getDay();
            const isSel = iso === selected;
            const future = iso > today;
            const weekend = wd === 0 || wd === 6;
            const isToday = iso === today;
            return (
              <button
                key={iso}
                type="button"
                disabled={future}
                onClick={() => onSelect(isSel ? '' : iso)}
                aria-pressed={isSel}
                aria-label={`${d} de ${MONTH_NAMES[month0]}`}
                className={`flex min-w-9 flex-1 flex-col items-center gap-1 rounded-lg py-2 text-xs transition-colors ${
                  future ? 'cursor-not-allowed opacity-40' : ''
                } ${
                  isSel
                    ? 'bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50'
                    : weekend
                      ? `bg-gray-100 dark:bg-gray-800 ${future ? '' : 'hover:bg-gray-200 dark:hover:bg-gray-700'}`
                      : future
                        ? ''
                        : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <span className={`font-medium ${isSel ? 'text-red-700 dark:text-red-300' : 'text-gray-500'}`}>
                  {WEEKDAY_LETTER[wd]}
                </span>
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${
                    isSel
                      ? 'font-semibold text-red-700 dark:text-red-300'
                      : isToday
                        ? 'font-bold text-gray-900 dark:text-gray-100'
                        : 'text-gray-800 dark:text-gray-200'
                  } ${isToday ? 'ring-1 ring-gray-400 dark:ring-gray-500' : ''}`}
                >
                  {d}
                </span>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
