'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { FORM_FIELD_TEXTAREA_CLS } from '@/lib/formFieldUi';
import { formatDateTimeBr } from '@/lib/dateTimeBr';
import { Button } from '@/components/ui/Button';
import { DpChatFeed } from '@/components/dp/DpChatFeed';

type Message = { id: string; userId: string; userName: string; body: string; createdAt: string };

/**
 * Conversa sobre uma solicitação entre DP, Administração e Contabilidade.
 * Não muda o status da solicitação. Abrir a conversa marca as mensagens como lidas.
 */
export function DpRequestMessages({
  requestId,
  title = 'Histórico de mensagens',
  placeholder = 'Escreva uma mensagem para o DP, a Administração ou a Contabilidade...',
  legacyItems = [],
  variant = 'default',
}: {
  requestId: string;
  title?: string;
  placeholder?: string;
  /** Mensagens antigas (ex.: histórico próprio da Contabilidade) mostradas na mesma lista, por data. */
  legacyItems?: Message[];
  /** `chat`: layout da aba Comentários das OCs (lista que rola + caixa fixa embaixo). */
  variant?: 'default' | 'chat';
}) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['dp-request-messages', requestId],
    queryFn: async () => {
      const res = await api.get(`/solicitacoes-dp/${requestId}/mensagens`);
      // Ao abrir, o servidor marca como lidas: atualiza o aviso do sininho.
      void queryClient.invalidateQueries({ queryKey: ['dp-request-unread-messages'] });
      return (res.data?.data?.items ?? []) as Message[];
    },
    enabled: !!requestId,
    refetchInterval: 30_000,
  });

  const send = useMutation({
    mutationFn: async (text: string) => {
      const res = await api.post(`/solicitacoes-dp/${requestId}/mensagens`, { body: text });
      return (res.data?.data?.items ?? []) as Message[];
    },
    onSuccess: (items) => {
      queryClient.setQueryData(['dp-request-messages', requestId], items);
      setBody('');
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data;
      toast.error(msg?.message || msg?.error || 'Não foi possível enviar a mensagem.');
    },
  });

  const items = [...legacyItems, ...(data ?? [])].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

  if (variant === 'chat') {
    return (
      <DpChatFeed
        items={items}
        loading={isLoading}
        error={isError}
        value={body}
        onChange={setBody}
        onSend={() => send.mutate(body.trim())}
        sending={send.isPending}
      />
    );
  }

  return (
    <div>
      <p className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">{title}</p>
      {isLoading ? (
        <div className="flex justify-center py-3">
          <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
        </div>
      ) : isError ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Não foi possível carregar as mensagens.</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">Nenhuma mensagem registrada ainda.</p>
      ) : (
        <div className="max-h-56 space-y-3 overflow-y-auto pr-1">
          {items.map((m) => (
            <div
              key={m.id}
              className="rounded-lg border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-800"
            >
              <div className="mb-1 flex items-center justify-between gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span className="font-medium text-gray-700 dark:text-gray-300">{m.userName}</span>
                <span>{formatDateTimeBr(m.createdAt, '—')}</span>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm text-gray-800 dark:text-gray-200">{m.body}</p>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 space-y-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={4000}
          placeholder={placeholder}
          className={FORM_FIELD_TEXTAREA_CLS}
        />
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={!body.trim() || send.isPending}
            onClick={() => send.mutate(body.trim())}
          >
            {send.isPending ? 'Enviando...' : 'Enviar mensagem'}
          </Button>
        </div>
      </div>
    </div>
  );
}
