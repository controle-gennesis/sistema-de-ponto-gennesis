'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowLeft, Moon, Sun } from 'lucide-react';
import { useTheme } from '@/context/ThemeContext';
import { useBrandingLogo } from '@/hooks/useBrandingLogo';

export const AUTH_INPUT_CLS =
  'login-form-field w-full py-4 text-base rounded-lg border border-gray-300 bg-white text-gray-900 placeholder-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500';

type AuthPageShellProps = {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
};

export function AuthPageShell({ title, subtitle, children }: AuthPageShellProps) {
  const { isDark, toggleTheme } = useTheme();
  const { logoSrc, logoAlt } = useBrandingLogo();

  return (
    <div className="app-theme-bg relative flex min-h-screen flex-col">
      <header className="w-full">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="relative flex h-24 items-center justify-between">
            <div className="flex w-1/3 justify-start">
              <button
                type="button"
                onClick={toggleTheme}
                className="flex items-center space-x-2 rounded-lg p-2 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
                title={isDark ? 'Modo Claro' : 'Modo Escuro'}
              >
                {isDark ? (
                  <Sun className="h-5 w-5 text-yellow-500" />
                ) : (
                  <Moon className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                )}
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {isDark ? 'Modo Claro' : 'Modo Escuro'}
                </span>
              </button>
            </div>

            <div className="absolute left-1/2 flex -translate-x-1/2 transform items-center justify-center">
              <img
                src={logoSrc}
                alt={logoAlt}
                width={220}
                height={56}
                className="h-14 w-auto max-w-[220px] object-contain"
                style={{ maxHeight: 56, maxWidth: 220, width: 'auto', height: 'auto' }}
              />
            </div>

            <div className="flex w-1/3 justify-end">
              <Link
                href="/auth/login"
                className="flex items-center gap-1 text-sm font-medium text-gray-700 transition-colors hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>Voltar ao login</span>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <h1 className="mb-2 text-center text-3xl font-bold text-gray-900 dark:text-gray-100">
            {title}
          </h1>
          {subtitle ? (
            <p className="mb-8 text-center text-gray-600 dark:text-gray-400">{subtitle}</p>
          ) : (
            <div className="mb-8" />
          )}
          {children}
        </div>
      </main>
    </div>
  );
}
