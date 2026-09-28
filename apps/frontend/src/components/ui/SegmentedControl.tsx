'use client';

import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

export type SegmentedOption<T extends string> = {
  value: T;
  label: React.ReactNode;
  title?: string;
  ariaLabel?: string;
};

type SegmentedControlProps<T extends string> = {
  value: T;
  onChange: (next: T) => void;
  options: SegmentedOption<T>[];
  className?: string;
  pillClassName?: string;
  buttonClassName?: string;
  activeButtonClassName?: string;
  inactiveButtonClassName?: string;
  'aria-label'?: string;
};

type PillState = { left: number; width: number; ready: boolean };

function pillsEqual(a: PillState, b: PillState) {
  return a.ready === b.ready && a.left === b.left && a.width === b.width;
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  className = '',
  pillClassName = 'bg-white shadow-sm dark:bg-gray-600',
  buttonClassName = '',
  activeButtonClassName = 'font-medium text-red-600 dark:text-red-400',
  inactiveButtonClassName =
    'font-normal text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200',
  'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [pill, setPill] = useState<PillState>({ left: 0, width: 0, ready: false });
  const valueRef = useRef(value);
  const optionsRef = useRef(options);
  valueRef.current = value;
  optionsRef.current = options;
  const optionsKey = useMemo(() => options.map((o) => o.value).join('\0'), [options]);

  const measure = useCallback(() => {
    const root = rootRef.current;
    const idx = optionsRef.current.findIndex((o) => o.value === valueRef.current);
    const btn = btnRefs.current[idx];
    if (!root || !btn) return;
    const next: PillState = {
      left: Math.round(btn.offsetLeft),
      width: Math.round(btn.offsetWidth),
      ready: true,
    };
    setPill((prev) => (pillsEqual(prev, next) ? prev : next));
  }, []);

  useLayoutEffect(() => {
    measure();
  }, [measure, value, optionsKey]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || typeof ResizeObserver === 'undefined') return;
    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        measure();
      });
    };
    const ro = new ResizeObserver(schedule);
    ro.observe(root);
    window.addEventListener('resize', schedule);
    root.addEventListener('scroll', schedule, { passive: true });
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('resize', schedule);
      root.removeEventListener('scroll', schedule);
    };
  }, [measure, optionsKey]);

  return (
    <div
      ref={rootRef}
      className={`relative inline-flex h-9 shrink-0 items-stretch overflow-x-auto overflow-y-hidden rounded-lg bg-gray-100 dark:bg-gray-800 ${
        /\bp-\S/.test(className) ? '' : 'p-1 '
      }${className}`}
      role="group"
      aria-label={ariaLabel}
    >
      <span
        aria-hidden
        className={`pointer-events-none absolute top-1 bottom-1 rounded-md ${pillClassName}`}
        style={{
          left: pill.left,
          width: pill.width,
          opacity: pill.ready ? 1 : 0,
          transition:
            'left 280ms cubic-bezier(0.22, 1, 0.36, 1), width 280ms cubic-bezier(0.22, 1, 0.36, 1), opacity 120ms ease',
        }}
      />
      {options.map((opt, i) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              btnRefs.current[i] = el;
            }}
            type="button"
            title={opt.title}
            aria-label={opt.ariaLabel}
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={`relative z-10 inline-flex h-full shrink-0 items-center justify-center gap-1.5 rounded-md px-2.5 text-sm transition-colors duration-200 sm:px-3 outline-none ring-0 focus:outline-none focus-visible:outline-none ${buttonClassName} ${
              active ? activeButtonClassName : inactiveButtonClassName
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
