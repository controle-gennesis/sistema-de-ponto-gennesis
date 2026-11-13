'use client';

import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Folder, HardDrive, Loader2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import api from '@/lib/api';

export type DriveMoveTarget = {
  type: 'folder' | 'file';
  id: string;
  name: string;
  /** Várias pastas movidas juntas: nenhuma delas pode ser o destino. */
  blockedIds?: string[];
};

type PastaResumo = { id: string; name: string };

/** Janela "Mover para…": navega pelas pastas e move o item para a pasta aberta (ou para o Meu Drive). */
export function DriveMoveModal({
  item,
  onClose,
  onConfirm,
  moving,
}: {
  item: DriveMoveTarget | null;
  onClose: () => void;
  onConfirm: (item: DriveMoveTarget, destinoId: string | null) => void;
  moving: boolean;
}) {
  /** Caminho aberto: [] = Meu Drive. */
  const [caminho, setCaminho] = useState<PastaResumo[]>([]);
  useEffect(() => {
    if (item) setCaminho([]);
  }, [item]);
  const atual = caminho[caminho.length - 1] ?? null;

  const { data: pastas = [], isLoading } = useQuery<PastaResumo[]>({
    queryKey: ['drive-move-folders', atual?.id ?? 'root'],
    queryFn: async () => {
      const res = await api.get('/drive/folders', { params: atual ? { parentId: atual.id } : {} });
      return ((res.data?.data ?? []) as Array<{ id: string; name: string }>).map((f) => ({ id: f.id, name: f.name }));
    },
    enabled: !!item,
  });

  return (
    <Modal
      isOpen={!!item}
      onClose={onClose}
      title={item ? `Mover “${item.name}”` : 'Mover'}
      size="md"
      footer={
        item ? (
          <>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={moving}
              onClick={() => onConfirm(item, atual?.id ?? null)}
              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {moving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Mover aqui
            </button>
          </>
        ) : null
      }
    >
      {item ? (
        <div className="space-y-3">
          <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label="Caminho">
            <button
              type="button"
              onClick={() => setCaminho([])}
              className={`inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium ${
                caminho.length === 0
                  ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
              }`}
            >
              <HardDrive className="h-3.5 w-3.5" aria-hidden />
              Meu Drive
            </button>
            {caminho.map((p, i) => (
              <React.Fragment key={p.id}>
                <ChevronRight className="h-3.5 w-3.5 text-gray-400" aria-hidden />
                <button
                  type="button"
                  onClick={() => setCaminho(caminho.slice(0, i + 1))}
                  className={`max-w-[12rem] truncate rounded-md px-2 py-1 font-medium ${
                    i === caminho.length - 1
                      ? 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
                      : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
                  }`}
                >
                  {p.name}
                </button>
              </React.Fragment>
            ))}
          </nav>

          <div className="max-h-[50vh] min-h-[10rem] overflow-y-auto rounded-lg border border-gray-200 dark:border-gray-700">
            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-red-600" aria-hidden />
              </div>
            ) : pastas.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">Nenhuma subpasta aqui.</p>
            ) : (
              <ul className="divide-y divide-gray-100 dark:divide-gray-700/70">
                {pastas.map((p) => {
                  // A própria pasta não pode ser destino (nem as subpastas dela, que só se alcança por ela).
                  const bloqueada = (item.type === 'folder' && p.id === item.id) || !!item.blockedIds?.includes(p.id);
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        disabled={bloqueada}
                        onClick={() => setCaminho([...caminho, p])}
                        title={bloqueada ? 'Não é possível mover a pasta para dentro dela mesma' : 'Abrir'}
                        className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40 dark:text-gray-100 dark:hover:bg-gray-800/60"
                      >
                        <Folder className="h-4 w-4 shrink-0 text-red-500" aria-hidden />
                        <span className="min-w-0 flex-1 truncate">{p.name}</span>
                        {!bloqueada ? <ChevronRight className="h-4 w-4 text-gray-400" aria-hidden /> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Destino: <span className="font-medium text-gray-700 dark:text-gray-200">{atual?.name ?? 'Meu Drive'}</span>
          </p>
        </div>
      ) : null}
    </Modal>
  );
}
