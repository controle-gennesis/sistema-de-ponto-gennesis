'use client';

import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link2, Loader2, Unlink } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { usePermissions } from '@/hooks/usePermissions';

type TotvsLinkStatus = {
  linked: boolean;
  totvsUser: string | null;
  linkedAt: string | null;
};

export function OcTotvsUserLinkButton() {
  const queryClient = useQueryClient();
  const { user } = usePermissions();
  const [open, setOpen] = useState(false);
  const [totvsUser, setTotvsUser] = useState('');
  const [totvsPassword, setTotvsPassword] = useState('');

  const { data: status, isLoading } = useQuery({
    queryKey: ['purchase-orders', 'totvs-link', user?.id ?? 'anon'],
    queryFn: async () => {
      const res = await api.get('/purchase-orders/totvs-link');
      return res.data?.data as TotvsLinkStatus;
    },
    enabled: !!user?.id,
    staleTime: 30_000,
  });

  const linkMutation = useMutation({
    mutationFn: async () => {
      const res = await api.put('/purchase-orders/totvs-link', { totvsUser, totvsPassword });
      return res.data?.data as TotvsLinkStatus;
    },
    onSuccess: () => {
      toast.success('Seu usuário TOTVS foi vinculado');
      setTotvsPassword('');
      setOpen(false);
      queryClient.invalidateQueries({ queryKey: ['purchase-orders', 'totvs-link', user?.id ?? 'anon'] });
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (err instanceof Error ? err.message : 'Falha ao vincular');
      toast.error(msg);
    },
  });

  const unlinkMutation = useMutation({
    mutationFn: async () => {
      const res = await api.delete('/purchase-orders/totvs-link');
      return res.data?.data as TotvsLinkStatus;
    },
    onSuccess: () => {
      toast.success('Seu vínculo TOTVS foi removido');
      setTotvsUser('');
      setTotvsPassword('');
      queryClient.invalidateQueries({ queryKey: ['purchase-orders', 'totvs-link', user?.id ?? 'anon'] });
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        (err instanceof Error ? err.message : 'Falha ao remover vínculo');
      toast.error(msg);
    },
  });

  const openModal = () => {
    setTotvsUser(status?.totvsUser || '');
    setTotvsPassword('');
    setOpen(true);
  };

  const closeModal = () => {
    if (linkMutation.isPending) return;
    setTotvsPassword('');
    setOpen(false);
  };

  const linked = !!status?.linked;

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 shadow-sm transition hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100 dark:hover:bg-gray-800"
      >
        <Link2 className="h-4 w-4 shrink-0" />
        {isLoading ? '…' : linked ? 'Meu usuário Totvs vinculado' : 'Vincular meu usuário Totvs'}
      </button>

      <Modal isOpen={open} onClose={closeModal} title="Vincular meu usuário Totvs" size="md">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Cada pessoa informa o <strong>próprio</strong> login e senha do TOTVS RM. O vínculo fica
            ligado só à sua conta do Conecta
            {user?.name ? (
              <>
                {' '}
                (<strong>{user.name}</strong>)
              </>
            ) : null}
            . A senha fica criptografada no servidor, nunca é exibida de novo e ninguém consegue
            usar o login TOTVS de outra pessoa para enviar OC.
          </p>

          {linked && status?.totvsUser ? (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
              Seu vínculo: <strong>{status.totvsUser}</strong>
              {status.linkedAt
                ? ` · desde ${new Date(status.linkedAt).toLocaleString('pt-BR')}`
                : ''}
            </p>
          ) : null}

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Seu login TOTVS
            </label>
            <input
              type="text"
              name="totvs-user-personal"
              autoComplete="off"
              value={totvsUser}
              onChange={(e) => setTotvsUser(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              placeholder="Ex.: seu.usuario"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Sua senha TOTVS
            </label>
            <input
              type="password"
              name="totvs-password-personal"
              autoComplete="new-password"
              value={totvsPassword}
              onChange={(e) => setTotvsPassword(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
              placeholder={linked ? 'Informe a senha para atualizar o vínculo' : 'Senha do TOTVS'}
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              A senha não fica visível para outros usuários e não é retornada pela API.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            {linked ? (
              <Button
                type="button"
                variant="outline"
                disabled={unlinkMutation.isPending || linkMutation.isPending}
                onClick={() => unlinkMutation.mutate()}
                className="inline-flex items-center gap-2"
              >
                {unlinkMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Unlink className="h-4 w-4" />
                )}
                Remover meu vínculo
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={closeModal} disabled={linkMutation.isPending}>
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={linkMutation.isPending || !totvsUser.trim() || !totvsPassword.trim()}
              onClick={() => linkMutation.mutate()}
              className="inline-flex items-center gap-2"
            >
              {linkMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
              Salvar meu vínculo
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
