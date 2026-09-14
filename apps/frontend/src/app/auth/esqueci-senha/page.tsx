'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, UserRound } from 'lucide-react';
import api from '@/lib/api';
import { normalizeLoginIdentifierInput } from '@/lib/cpf';
import { AUTH_INPUT_CLS, AuthPageShell } from '@/components/auth/AuthPageShell';

export default function EsqueciSenhaPage() {
  const [identifier, setIdentifier] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sentEmail, setSentEmail] = useState('');
  const [sentMessage, setSentMessage] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim()) {
      setError('Informe o e-mail ou CPF cadastrado.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await api.post<{ success: boolean; message?: string; email?: string }>(
        '/auth/forgot-password',
        {
          identifier: identifier.trim(),
        }
      );
      const email = res.data?.email?.trim() || '';
      setSentEmail(email);
      setSentMessage(
        email
          ? `Enviamos o link de redefinição para ${email}.`
          : res.data?.message ||
              'Se houver uma conta com esse e-mail, enviaremos as instruções de redefinição em instantes.'
      );
    } catch (err) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data
        ?.message;
      setError(message || 'Não foi possível enviar o e-mail de redefinição. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  if (sentMessage) {
    return (
      <AuthPageShell title="Verifique seu e-mail">
        <div className="space-y-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
            <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
          </div>
          {sentEmail ? (
            <>
              <p className="text-gray-600 dark:text-gray-400">
                Enviamos o link de redefinição para:
              </p>
              <p className="break-all text-base font-semibold text-gray-900 dark:text-gray-100">
                {sentEmail}
              </p>
            </>
          ) : (
            <p className="text-gray-600 dark:text-gray-400">{sentMessage}</p>
          )}
          <p className="text-sm text-gray-500 dark:text-gray-500">
            O link é válido por 1 hora. Não esqueça de conferir a caixa de spam.
          </p>
          <Link
            href="/auth/login"
            className="inline-flex w-full items-center justify-center rounded-lg bg-red-600 px-4 py-4 text-base font-medium text-white transition-colors hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
          >
            Voltar ao login
          </Link>
          <button
            type="button"
            onClick={() => {
              setSentMessage('');
              setSentEmail('');
              setIdentifier('');
            }}
            className="text-sm font-medium text-red-600 transition-colors hover:text-red-700 dark:text-red-400 dark:hover:text-red-500"
          >
            Usar outro e-mail ou CPF
          </button>
        </div>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell
      title="Recuperar senha"
      subtitle="Informe seu e-mail ou CPF e enviaremos um link para criar uma nova senha"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="relative">
          <UserRound className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 transform text-gray-400 dark:text-gray-500" />
          <input
            type="text"
            name="identifier"
            value={identifier}
            onChange={(e) => {
              setIdentifier(normalizeLoginIdentifierInput(e.target.value));
              if (error) setError('');
            }}
            required
            autoComplete="username"
            placeholder="E-mail ou CPF"
            className={`${AUTH_INPUT_CLS} pl-12 pr-4`}
          />
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/30">
            <div className="flex items-start space-x-3">
              <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500 dark:text-red-400" />
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          </div>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-red-600 py-4 text-base font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-red-700 dark:hover:bg-red-800"
        >
          {loading ? 'Enviando...' : 'Enviar link de redefinição'}
        </button>
      </form>
    </AuthPageShell>
  );
}
