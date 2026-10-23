'use client';

import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import {
  fetchTrelloAttachmentMigration,
  startTrelloAttachmentMigration,
  stopTrelloAttachmentMigration,
  type TrelloAttachmentMigrationStatus,
} from '@/lib/kanban';

function formatBytes(bytes: number) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

/** Administrador: copia os anexos importados do Trello para o armazenamento do Conecta. */
export function KanbanTrelloMigrationModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [status, setStatus] = useState<TrelloAttachmentMigrationStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await fetchTrelloAttachmentMigration());
    } catch {
      toast.error('Não foi possível ler a situação da cópia');
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    void refresh();
  }, [isOpen, refresh]);

  const running = !!status?.job.running;
  useEffect(() => {
    if (!isOpen || !running) return;
    const timer = window.setInterval(() => void refresh(), 3000);
    return () => window.clearInterval(timer);
  }, [isOpen, running, refresh]);

  const act = async (fn: () => Promise<TrelloAttachmentMigrationStatus>, okMessage?: string) => {
    setBusy(true);
    try {
      setStatus(await fn());
      if (okMessage) toast.success(okMessage);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
      toast.error(message || 'Não foi possível concluir a ação');
    } finally {
      setBusy(false);
    }
  };

  const total = (status?.pending ?? 0) + (status?.migrated ?? 0);
  const pct = total > 0 ? Math.round(((status?.migrated ?? 0) / total) * 100) : 0;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Copiar anexos do Trello para o Conecta" size="md">
      <div className="space-y-4 text-sm">
        <p className="text-gray-600 dark:text-gray-300">
          Os anexos importados do Trello ainda apontam para o Trello. Esta cópia baixa cada arquivo e
          guarda no Conecta, para não depender mais do Trello. Pode ser pausada e retomada.
        </p>

        {status && !status.configured ? (
          <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-200">
            O servidor ainda não tem a chave do Trello. Configure <strong>TRELLO_API_KEY</strong> e{' '}
            <strong>TRELLO_API_TOKEN</strong> no Railway (serviço Back-end) para poder copiar.
          </p>
        ) : null}

        <div>
          <div className="mb-1 flex justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>{status?.migrated ?? 0} copiados</span>
            <span>{status?.pending ?? 0} ainda no Trello</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div className="h-full rounded-full bg-red-600 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-right text-xs text-gray-500 dark:text-gray-400">{pct}%</p>
        </div>

        {status && status.byBoard.length > 0 ? (
          <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-left text-gray-500 dark:bg-gray-800 dark:text-gray-400">
                <tr>
                  <th className="px-3 py-1.5 font-medium">Quadro</th>
                  <th className="px-2 py-1.5 text-right font-medium">No Trello</th>
                  <th className="px-2 py-1.5 text-right font-medium">Copiados</th>
                  <th className="px-3 py-1.5 text-right font-medium">Do Conecta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {status.byBoard.map((row) => (
                  <tr key={row.board} className="text-gray-700 dark:text-gray-200">
                    <td className="px-3 py-1.5">{row.board}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{row.pending}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{row.migrated}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{row.native + row.external}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {status && (running || status.job.startedAt) ? (
          <div className="rounded-lg border border-gray-200 px-3 py-2 dark:border-gray-700">
            <p className="font-medium text-gray-800 dark:text-gray-100">
              {running ? (status.job.stopRequested ? 'Parando…' : 'Copiando…') : 'Última execução'}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {status.job.copied} copiados · {status.job.failed} com falha ·{' '}
              {formatBytes(status.job.bytesCopied)}
            </p>
            {status.job.lastError ? (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">Erro: {status.job.lastError}</p>
            ) : null}
            {Object.keys(status.job.failureCounts ?? {}).length > 0 ? (
              <ul className="mt-2 space-y-0.5 text-xs text-gray-700 dark:text-gray-200">
                {Object.entries(status.job.failureCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([reason, count]) => (
                    <li key={reason}>
                      <strong>{count}</strong> × {reason}
                    </li>
                  ))}
              </ul>
            ) : null}
            {status.job.failures.length > 0 ? (
              <details className="mt-2 text-xs text-gray-600 dark:text-gray-300">
                <summary className="cursor-pointer">Ver falhas ({status.job.failures.length})</summary>
                <ul className="mt-1 max-h-48 space-y-1.5 overflow-y-auto">
                  {status.job.failures.map((f) => (
                    <li key={f.attachmentId} className="break-words">
                      <span className="font-medium">{f.fileName}</span>: {f.reason}
                      {f.board || f.cardTitle ? (
                        <span className="block text-[11px] text-gray-500 dark:text-gray-400">
                          {[f.board, f.cardTitle].filter(Boolean).join(' · ')}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2 border-t border-gray-200 pt-3 dark:border-gray-700">
          <Button type="button" variant="outline" onClick={onClose}>
            Fechar
          </Button>
          {running ? (
            <Button
              type="button"
              variant="outline"
              disabled={busy || status?.job.stopRequested}
              onClick={() => void act(stopTrelloAttachmentMigration, 'Pedido para parar enviado')}
            >
              Pausar
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={busy || !status?.configured || (status?.pending ?? 0) === 0}
                onClick={() => void act(() => startTrelloAttachmentMigration(10), 'Copiando 10 arquivos de teste')}
              >
                Testar com 10
              </Button>
              <Button
                type="button"
                variant="primary"
                disabled={busy || !status?.configured || (status?.pending ?? 0) === 0}
                className="!border-transparent !bg-red-600 !text-white hover:!bg-red-700"
                onClick={() => void act(() => startTrelloAttachmentMigration(), 'Cópia iniciada')}
              >
                Copiar todos
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
