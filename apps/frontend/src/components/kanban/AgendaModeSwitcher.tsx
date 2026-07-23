'use client';

import React from 'react';

export type AgendaSurfaceMode = 'planner' | 'tasks';

export function AgendaModeSwitcher({
  mode,
  onChange,
}: {
  mode: AgendaSurfaceMode;
  onChange: (next: AgendaSurfaceMode) => void;
}) {
  return (
    <div
      className="inline-flex items-center overflow-hidden rounded-full border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-900"
      role="group"
      aria-label="Alternar Agenda e Tarefas"
    >
      <button
        type="button"
        onClick={() => onChange('planner')}
        title="Agenda"
        aria-label="Agenda"
        aria-pressed={mode === 'planner'}
        className={`inline-flex h-9 w-9 items-center justify-center transition-colors ${
          mode === 'planner'
            ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200'
            : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'
        }`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden
        >
          <rect width="18" height="18" x="3" y="4" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
          <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => onChange('tasks')}
        title="Tarefas"
        aria-label="Tarefas"
        aria-pressed={mode === 'tasks'}
        className={`inline-flex h-9 w-9 items-center justify-center transition-colors ${
          mode === 'tasks'
            ? 'bg-sky-100 text-sky-800 dark:bg-sky-900/50 dark:text-sky-200'
            : 'text-gray-600 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800'
        }`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
          aria-hidden
        >
          <circle cx="12" cy="12" r="10" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      </button>
    </div>
  );
}
