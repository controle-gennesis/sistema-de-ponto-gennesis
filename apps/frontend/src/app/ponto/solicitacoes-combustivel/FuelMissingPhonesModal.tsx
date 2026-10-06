'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Loading } from '@/components/ui/Loading';
import api from '@/lib/api';
import { onlyDigits } from '@/lib/cpf';
import { formatPhoneBR } from '@/lib/phone';

type MissingPhoneRequester = {
  userId: string;
  name: string;
};

type Props = {
  enabled: boolean;
};

function isValidBrPhone(value: string): boolean {
  const digits = onlyDigits(value);
  return digits.length === 10 || digits.length === 11;
}

export function FuelMissingPhonesModal({ enabled }: Props) {
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);
  const [dismissedThisVisit, setDismissedThisVisit] = useState(false);
  const [phones, setPhones] = useState<Record<string, string>>({});

  const { data: requesters = [], isLoading } = useQuery({
    queryKey: ['fuel-requesters-missing-phone'],
    queryFn: async () => {
      const res = await api.get('/fuel-refuel-requests/requesters-missing-phone');
      return (res.data?.data || []) as MissingPhoneRequester[];
    },
    enabled,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  useEffect(() => {
    if (!enabled || dismissedThisVisit || isLoading) return;
    if (requesters.length > 0) setIsOpen(true);
    else setIsOpen(false);
  }, [enabled, dismissedThisVisit, isLoading, requesters.length]);

  useEffect(() => {
    setPhones((prev) => {
      const next: Record<string, string> = {};
      for (const row of requesters) {
        next[row.userId] = prev[row.userId] || '';
      }
      return next;
    });
  }, [requesters]);

  const filledItems = useMemo(
    () =>
      requesters
        .map((row) => ({
          userId: row.userId,
          phone: onlyDigits(phones[row.userId] || ''),
        }))
        .filter((item) => item.phone.length > 0),
    [requesters, phones],
  );

  const allFilledValid =
    filledItems.length > 0 && filledItems.every((item) => isValidBrPhone(item.phone));

  const saveMutation = useMutation({
    mutationFn: async (items: Array<{ userId: string; phone: string }>) => {
      const res = await api.put('/fuel-refuel-requests/requesters-phones', { items });
      return res.data;
    },
    onSuccess: async (data) => {
      toast.success(data?.message || 'Telefones salvos');
      await queryClient.invalidateQueries({ queryKey: ['fuel-requesters-missing-phone'] });
    },
    onError: (err: unknown) => {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Não foi possível salvar os telefones';
      toast.error(message);
    },
  });

  const handleClose = () => {
    setDismissedThisVisit(true);
    setIsOpen(false);
  };

  const handleSave = () => {
    if (filledItems.length === 0) {
      toast.error('Preencha ao menos um telefone');
      return;
    }
    const invalid = filledItems.find((item) => !isValidBrPhone(item.phone));
    if (invalid) {
      toast.error('Use o formato com DDD: (61) 99999-9999');
      return;
    }
    saveMutation.mutate(filledItems);
  };

  if (!enabled) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Telefones pendentes"
      size="lg"
      closeOnOverlayClick={false}
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Estas pessoas já solicitaram abastecimento e estão sem telefone cadastrado. Preencha
          para contactá-las pelo WhatsApp.
        </p>

        {isLoading ? (
          <Loading message="Carregando…" size="sm" />
        ) : requesters.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Nenhum solicitante sem telefone no momento.
          </p>
        ) : (
          <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
            {requesters.map((row) => (
              <div
                key={row.userId}
                className="grid grid-cols-1 gap-2 rounded-xl border border-gray-200 p-3 dark:border-gray-700 sm:grid-cols-[1fr_180px] sm:items-center"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                    {row.name}
                  </p>
                </div>
                <Input
                  value={phones[row.userId] || ''}
                  onChange={(e) =>
                    setPhones((prev) => ({
                      ...prev,
                      [row.userId]: formatPhoneBR(e.target.value),
                    }))
                  }
                  placeholder="(00) 00000-0000"
                  inputMode="tel"
                  autoComplete="tel"
                  aria-label={`Telefone de ${row.name}`}
                />
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
          <Button type="button" variant="outline" onClick={handleClose}>
            Fechar
          </Button>
          <Button
            type="button"
            disabled={saveMutation.isPending || !allFilledValid}
            onClick={handleSave}
          >
            {saveMutation.isPending ? 'Salvando…' : 'Salvar telefones'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
