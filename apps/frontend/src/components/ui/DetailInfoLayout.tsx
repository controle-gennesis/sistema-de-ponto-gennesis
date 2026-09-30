'use client';

import React from 'react';
import { clsx } from 'clsx';
import { AppModalTabButton } from '@/components/ui/AppTabButton';

export type DetailInfoField = {
  label: string;
  value: React.ReactNode;
  /** Valor em bloco abaixo do label (ex.: descrição longa). */
  stacked?: boolean;
  /** @deprecated Mantido por compatibilidade; o layout em linhas ignora. */
  fullWidth?: boolean;
};

export type DetailInfoTabItem<T extends string = string> = {
  id: T;
  label: string;
};

/** Lista label/valor no estilo RM: linhas com divisor, valor à direita. */
export function DetailInfoRows({ fields }: { fields: DetailInfoField[] }) {
  if (!fields.length) return null;
  return (
    <dl className="divide-y divide-gray-200 dark:divide-gray-700">
      {fields.map((field, index) => (
        <div
          key={`${field.label}-${index}`}
          className={
            field.stacked
              ? 'flex flex-col gap-1.5 py-3'
              : 'flex flex-col gap-0.5 py-3 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6'
          }
        >
          <dt className="shrink-0 text-xs font-medium text-gray-500 dark:text-gray-400">
            {field.label}
          </dt>
          <dd
            className={
              field.stacked
                ? 'min-w-0 text-left text-sm text-gray-900 dark:text-gray-100'
                : 'min-w-0 break-words text-sm text-gray-900 dark:text-gray-100 sm:text-right'
            }
          >
            {field.value == null || field.value === '' ? '—' : field.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Abas sublinhadas no estilo RM/OC: linha base contínua + underline vermelho da ativa
 * encostado nela (`-mb-px` + `border-b-2`).
 */
export function DetailInfoTabs<T extends string>({
  tabs,
  active,
  onChange,
  ariaLabel = 'Seções',
  className,
}: {
  tabs: DetailInfoTabItem<T>[];
  active: T;
  onChange: (id: T) => void;
  ariaLabel?: string;
  /** Padding horizontal das abas (a borda inferior fica full-bleed no container). */
  className?: string;
}) {
  return (
    <div
      className={clsx(
        'shrink-0 border-b border-gray-200 dark:border-gray-700',
        className,
      )}
      role="tablist"
      aria-label={ariaLabel}
    >
      <div className="table-scroll -mb-px flex gap-1">
        {tabs.map((tab) => (
          <AppModalTabButton
            key={tab.id}
            active={active === tab.id}
            onClick={() => onChange(tab.id)}
            className="shrink-0 px-3 py-2.5 text-sm"
          >
            {tab.label}
          </AppModalTabButton>
        ))}
      </div>
    </div>
  );
}

/**
 * Seção com título opcional + lista em linhas (sem card/borda).
 * Preferir `DetailInfoRows` direto dentro de abas.
 */
export function DetailInfoSection({
  title,
  fields,
  headerAction,
  children,
  className,
}: {
  title?: string;
  fields?: DetailInfoField[];
  /** @deprecated Ignorado no layout em linhas. */
  columns?: 2 | 3;
  headerAction?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={clsx('space-y-3', className)}>
      {title || headerAction ? (
        <div className="flex items-center justify-between gap-3">
          {title ? (
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
          ) : (
            <span />
          )}
          {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
        </div>
      ) : null}
      {fields && fields.length > 0 ? <DetailInfoRows fields={fields} /> : null}
      {children}
    </section>
  );
}

/** Bloco de parecer / observação (sem caixa). */
export function DetailInfoNote({
  title,
  children,
  tone = 'neutral',
}: {
  title: string;
  children: React.ReactNode;
  tone?: 'neutral' | 'success' | 'warning';
}) {
  return (
    <section className="space-y-1.5 py-3">
      <h3
        className={clsx(
          'text-xs font-medium',
          tone === 'success' && 'text-green-700 dark:text-green-300',
          tone === 'warning' && 'text-amber-700 dark:text-amber-300',
          tone === 'neutral' && 'text-gray-500 dark:text-gray-400',
        )}
      >
        {title}
      </h3>
      <div
        className={clsx(
          'whitespace-pre-wrap break-words text-sm',
          tone === 'success' && 'text-green-900 dark:text-green-100',
          tone === 'warning' && 'text-amber-900 dark:text-amber-100',
          tone === 'neutral' && 'text-gray-900 dark:text-gray-100',
        )}
      >
        {children}
      </div>
    </section>
  );
}

/** Rodapé de ações do modal. */
export function DetailInfoActions({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
      {children}
    </div>
  );
}
