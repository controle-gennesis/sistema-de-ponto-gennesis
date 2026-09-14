'use client';

import React, { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Lock } from 'lucide-react';
import { toast } from 'react-hot-toast';
import api from '@/lib/api';
import { Loading } from '@/components/ui/Loading';
import { AUTH_INPUT_CLS, AuthPageShell } from '@/components/auth/AuthPageShell';

type TokenState =
  | { status: 'checking' }
  | { status: 'valid'; name: string | null; email: string | null }
  | { status: 'invalid' };

function RedefinirSenhaContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams?.get('token') ?? '';

  const [tokenState, setTokenState] = useState<TokenState>({ status: 'checking' });
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setTokenState({ status: 'invalid' });
      return;
    }
    void (async () => {
      try {
        const res = await api.get<{
          success: boolean;
          data: { valid: boolean; name: string | null; email: string | null };
        }>('/auth/reset-password/validate', { params: { token } });
        if (cancelled) return;
        const data = res.data?.data;
        setTokenState(
          data?.valid
            ? { status: 'valid', name: data.name, email: data.email }
            : { status: 'invalid' }
        );
      } catch {
        if (!cancelled) setTokenState({ status: 'invalid' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError('A nova senha deve ter ao menos 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('As senhas não conferem.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/reset-password', { token, newPassword: password });
      setDone(true);
      toast.success('Senha redefinida com sucesso!');
      setTimeout(() => router.push('/auth/login'), 2500);
    } catch (err) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data
        ?.message;
      setError(message || 'Não foi possível redefinir a senha. Solicite um novo link.');
    } finally {
      setLoading(false);
    }
  };

  if (tokenState.status === 'checking') {
    return <Loading message="Validando link de redefinição..." fullScreen size="lg" />;
  }

  if (tokenState.status === 'invalid') {
    return (
      <AuthPageShell title="Link inválido ou expirado">
        <div className="space-y-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
            <AlertCircle className="h-7 w-7 text-red-600 dark:text-red-400" />
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            Links de redefinição valem por 1 hora e podem ser usados uma única vez. Solicite um
            novo para continuar.
          </p>
          <Link
            href="/auth/esqueci-senha"
            className="inline-flex w-full items-center justify-center rounded-lg bg-red-600 px-4 py-4 text-base font-medium text-white transition-colors hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
          >
            Solicitar novo link
          </Link>
        </div>
      </AuthPageShell>
    );
  }

  if (done) {
    return (
      <AuthPageShell title="Senha redefinida">
        <div className="space-y-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
            <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-400" />
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            Você já pode entrar com a nova senha. Estamos te levando para o login...
          </p>
          <Link
            href="/auth/login"
            className="inline-flex w-full items-center justify-center rounded-lg bg-red-600 px-4 py-4 text-base font-medium text-white transition-colors hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
          >
            Ir para o login
          </Link>
        </div>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell
      title="Criar nova senha"
      subtitle={
        tokenState.name
          ? `Olá, ${tokenState.name}. Defina a nova senha da sua conta${
              tokenState.email ? ` (${tokenState.email})` : ''
            }.`
          : 'Defina a nova senha da sua conta'
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="relative">
          <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 transform text-gray-400 dark:text-gray-500" />
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError('');
            }}
            required
            autoComplete="new-password"
            placeholder="Nova senha"
            className={`${AUTH_INPUT_CLS} pl-12 pr-12`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            className="absolute right-4 top-1/2 -translate-y-1/2 transform text-gray-400 transition-colors hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
            aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
          >
            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>

        <div className="relative">
          <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 transform text-gray-400 dark:text-gray-500" />
          <input
            type={showPassword ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => {
              setConfirmPassword(e.target.value);
              if (error) setError('');
            }}
            required
            autoComplete="new-password"
            placeholder="Confirmar nova senha"
            className={`${AUTH_INPUT_CLS} pl-12 pr-4`}
          />
        </div>

        <p className="text-sm text-gray-500 dark:text-gray-500">
          Use ao menos 8 caracteres, combinando letras e números.
        </p>

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
          {loading ? 'Salvando...' : 'Redefinir senha'}
        </button>
      </form>
    </AuthPageShell>
  );
}

export default function RedefinirSenhaPage() {
  return (
    <Suspense fallback={<Loading message="Carregando..." fullScreen size="lg" />}>
      <RedefinirSenhaContent />
    </Suspense>
  );
}
