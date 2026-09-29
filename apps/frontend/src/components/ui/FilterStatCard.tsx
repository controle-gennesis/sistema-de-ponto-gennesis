'use client';

import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { clsx } from 'clsx';
import { Card, CardContent } from '@/components/ui/Card';

type FilterStatCardProps = {
  label: string;
  count: number | string;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  isActive?: boolean;
  loading?: boolean;
  /** Segunda linha (ex.: total / contexto). */
  subtitle?: string;
  /** Terceira linha menor (opcional). */
  detail?: string;
  size?: 'md' | 'sm';
  /** Sem Card: ícone circular + texto, como métricas inline. */
  variant?: 'card' | 'flat';
  className?: string;
  onClick?: () => void;
};

export function FilterStatCard({
  label,
  count,
  icon: Icon,
  iconBg,
  iconColor,
  isActive = false,
  loading = false,
  subtitle,
  detail,
  size = 'md',
  variant = 'card',
  className,
  onClick,
}: FilterStatCardProps) {
  const clickable = typeof onClick === 'function';
  const compact = size === 'sm';

  const interactionProps = clickable
    ? {
        role: 'button' as const,
        tabIndex: 0,
        'aria-pressed': isActive,
        onClick,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick();
          }
        },
      }
    : {};

  if (variant === 'flat') {
    return (
      <div
        className={clsx(
          'flex min-w-0 items-center gap-3 rounded-xl px-3 py-2.5',
          clickable &&
            'cursor-pointer transition-colors hover:bg-gray-100/90 dark:hover:bg-gray-700/50',
          isActive && 'bg-gray-100 dark:bg-gray-700/40',
          className
        )}
        {...interactionProps}
      >
        <div
          className={clsx(
            'flex flex-shrink-0 items-center justify-center rounded-full',
            compact ? 'h-12 w-12' : 'h-14 w-14',
            iconBg || 'bg-gray-100 dark:bg-gray-700/60'
          )}
        >
          <Icon
            className={clsx(
              compact ? 'h-5 w-5' : 'h-6 w-6',
              iconColor || 'text-gray-600 dark:text-gray-300'
            )}
          />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
          {loading ? (
            <span
              className="mt-0.5 inline-block h-6 w-16 animate-pulse rounded-md bg-gray-200/90 dark:bg-gray-700/70"
              aria-hidden
            />
          ) : (
            <p
              className={clsx(
                'mt-0.5 font-bold tabular-nums text-gray-900 dark:text-gray-100',
                compact ? 'text-lg' : 'text-xl'
              )}
            >
              {count}
            </p>
          )}
          {subtitle ? (
            <p className="mt-0.5 truncate text-xs font-medium tabular-nums text-gray-600 dark:text-gray-300">
              {subtitle}
            </p>
          ) : null}
          {detail ? (
            <p className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">
              {detail}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <Card
      className={clsx(
        clickable && 'cursor-pointer transition-colors',
        isActive && 'bg-gray-50 dark:bg-gray-800/80',
        className
      )}
      {...interactionProps}
    >
      <CardContent className={compact ? 'p-3 sm:p-4' : 'p-4 sm:p-6'}>
        <div className="flex items-center">
          <div
            className={clsx(
              'flex-shrink-0 rounded-lg',
              compact ? 'p-2' : 'p-2 sm:p-3',
              iconBg
            )}
          >
            <Icon
              className={clsx(compact ? 'h-5 w-5' : 'h-5 w-5 sm:h-6 sm:w-6', iconColor)}
            />
          </div>
          <div className={clsx('min-w-0 flex-1', compact ? 'ml-3' : 'ml-3 sm:ml-4')}>
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 sm:text-sm">
              {label}
            </p>
            <p
              className={clsx(
                'mt-1 font-bold tabular-nums text-gray-900 dark:text-gray-100',
                compact ? 'text-lg sm:text-xl' : 'text-xl sm:text-2xl'
              )}
            >
              {loading ? (
                <span
                  className="mt-1 inline-block h-6 w-12 animate-pulse rounded-md bg-gray-200/90 dark:bg-gray-700/70 sm:h-7"
                  aria-hidden
                />
              ) : (
                count
              )}
            </p>
            {subtitle ? (
              <p className="mt-0.5 truncate text-xs font-medium tabular-nums text-gray-600 dark:text-gray-300">
                {subtitle}
              </p>
            ) : null}
            {detail ? (
              <p className="mt-0.5 truncate text-[11px] text-gray-500 dark:text-gray-400">
                {detail}
              </p>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
