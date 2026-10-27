'use client';

import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';

type ObraOption = { id: string; name: string };

/**
 * Obra do contrato (cadastro de obras), com "Criar nova obra neste contrato".
 * Mesmo comportamento do campo Obra da Ficha de Demanda.
 */
export function ObraSelectField({
  contratoId,
  value,
  onChange,
  disabled = false,
  label = 'Obra',
  required = true,
  hint,
}: {
  contratoId: string;
  value: string;
  onChange: (obra: string) => void;
  disabled?: boolean;
  label?: string;
  required?: boolean;
  hint?: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [novaObra, setNovaObra] = useState('');

  const { data: obrasData, isLoading } = useQuery({
    queryKey: ['obras-fd-approval', contratoId],
    queryFn: async () => {
      const res = await api.get('/obras', {
        params: { isActive: 'true', contratoId, limit: 500, page: 1 },
      });
      return res.data;
    },
    enabled: !!contratoId,
  });

  const options = useMemo(() => {
    const obras = ((obrasData?.data || []) as ObraOption[]).filter((o) => o.id && o.name?.trim());
    const lista = obras.map((o) => ({ value: o.name, label: o.name }));
    // Só obras do contrato. Exceção: valor já salvo que foi desativado depois continua visível
    // (lista já carregada e sem a obra) — nunca obra de outro contrato antes de a lista carregar.
    if (value && obrasData && !lista.some((o) => o.value === value)) lista.unshift({ value, label: value });
    return labeledToSelectOptions(lista);
  }, [obrasData, value]);

  const createMutation = useMutation({
    mutationFn: async (name: string) => {
      const res = await api.post('/obras', { name, contratoId });
      return res.data?.data as ObraOption | undefined;
    },
    onSuccess: async (created) => {
      const nome = created?.name?.trim() || novaObra.trim();
      toast.success('Obra criada');
      setShowCreate(false);
      setNovaObra('');
      await queryClient.invalidateQueries({ queryKey: ['obras-fd-approval', contratoId] });
      if (nome) onChange(nome);
    },
    onError: (err: unknown) => {
      const data = (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data;
      toast.error(data?.error || data?.message || 'Não foi possível criar a obra.');
    },
  });

  const placeholder = !contratoId
    ? 'Selecione um contrato primeiro'
    : isLoading
      ? 'Carregando obras...'
      : 'Selecione a obra';

  const criar = () => {
    const name = novaObra.trim().toLocaleUpperCase('pt-BR');
    if (name && !createMutation.isPending) createMutation.mutate(name);
  };

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </label>
      <StringSingleSelectDropdown
        value={value}
        onChange={onChange}
        options={options}
        disabled={disabled || !contratoId || isLoading}
        placeholder={placeholder}
        allowEmpty={false}
        matchTriggerWidth
        menuFooter={
          contratoId && !disabled ? (
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setNovaObra('');
                setShowCreate(true);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm font-medium text-red-600 transition-colors hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
            >
              <Plus className="h-4 w-4 shrink-0" />
              Criar nova obra neste contrato
            </button>
          ) : null
        }
      />
      {hint ? <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">{hint}</p> : null}

      {showCreate ? (
        <AppModalOverlay className="app-modal-overlay fixed inset-0 z-[2300] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            aria-hidden
            onClick={() => {
              if (!createMutation.isPending) setShowCreate(false);
            }}
          />
          <div className="relative z-[2301] w-full max-w-md rounded-lg bg-white p-5 shadow-xl dark:bg-gray-800">
            <h4 className="text-base font-semibold text-gray-900 dark:text-gray-100">Nova obra</h4>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              A obra será vinculada ao contrato deste orçamento.
            </p>
            <div className="mt-4">
              <label className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
                Nome da obra <span className="text-red-600">*</span>
              </label>
              <input
                type="text"
                value={novaObra}
                onChange={(e) => setNovaObra(e.target.value.toLocaleUpperCase('pt-BR'))}
                placeholder="EX.: UNIDADE CENTRO"
                className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm uppercase text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                autoFocus
                disabled={createMutation.isPending}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    criar();
                  }
                }}
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={createMutation.isPending}
                onClick={() => setShowCreate(false)}
                className="rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-800 transition-colors hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={createMutation.isPending || !novaObra.trim()}
                onClick={criar}
                className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Criando...
                  </>
                ) : (
                  'Criar obra'
                )}
              </button>
            </div>
          </div>
        </AppModalOverlay>
      ) : null}
    </div>
  );
}
