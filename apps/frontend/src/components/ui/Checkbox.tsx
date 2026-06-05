'use client';

import React, { useEffect, useRef } from 'react';
import { clsx } from 'clsx';

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

export interface CheckboxIndicatorProps {
  checked: boolean;
  indeterminate?: boolean;
  onChange?: () => void;
  disabled?: boolean;
  className?: string;
  /** Quando true, renderiza como <button>; senão só o quadrado (uso dentro de <label>). */
  asButton?: boolean;
}

/** Quadrado do checkbox — mesmo visual da página de login. */
export function CheckboxIndicator({
  checked,
  indeterminate = false,
  onChange,
  disabled,
  className,
  asButton = false,
}: CheckboxIndicatorProps) {
  const active = checked || indeterminate;
  const box = (
    <div
      className={clsx(
        'w-5 h-5 rounded border-2 transition-all duration-200 flex items-center justify-center shrink-0',
        active
          ? 'bg-red-600 dark:bg-red-500 border-red-600 dark:border-red-500'
          : 'bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 group-hover:border-red-500 dark:group-hover:border-red-400',
      )}
    >
      {indeterminate ? (
        <span className="block h-0.5 w-2.5 rounded-full bg-white" aria-hidden />
      ) : checked ? (
        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      ) : null}
    </div>
  );

  if (asButton) {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        onClick={onChange}
        className={clsx(
          'group shrink-0 rounded focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0',
          disabled && 'opacity-50 cursor-not-allowed',
          className,
        )}
      >
        {box}
      </button>
    );
  }

  return <div className={clsx('relative shrink-0', className)}>{box}</div>;
}

/** Checkbox compacto para tabelas — mesmo visual da página de login. */
export function TableCheckbox({
  checked,
  indeterminate = false,
  onChange,
  ariaLabel,
  onClick,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel?: string;
  onClick?: (e: React.MouseEvent<HTMLLabelElement>) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate, checked]);

  return (
    <label
      className="inline-flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center group"
      onClick={onClick}
    >
      <input
        ref={inputRef}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={ariaLabel}
        className="sr-only"
      />
      <CheckboxIndicator checked={checked} indeterminate={indeterminate} />
    </label>
  );
}

/** Checkbox visual igual ao da página de login (Permanecer conectado). */
export function Checkbox({ checked, onChange, label, disabled, className }: CheckboxProps) {
  return (
    <label
      className={clsx(
        'flex items-center space-x-3 cursor-pointer group',
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <CheckboxIndicator checked={checked} />
      <span className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors">
        {label}
      </span>
    </label>
  );
}
