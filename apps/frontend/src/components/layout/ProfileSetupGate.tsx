'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera } from 'lucide-react';
import toast from 'react-hot-toast';
import { CircularPhotoCropModal } from '@/components/conversas/CircularPhotoCropModal';
import { AppModalOverlay } from '@/components/ui/AppModalOverlay';
import { usePermissions } from '@/hooks/usePermissions';
import api from '@/lib/api';
import { onlyDigits } from '@/lib/cpf';

type SetupUser = {
  isFirstLogin?: boolean;
  profilePhotoUrl?: string | null;
  profileSetupCompletedAt?: string | null;
  impersonation?: { active?: boolean } | null;
  employee?: { id?: string; phone?: string | null } | null;
};

function maskPhoneInput(raw: string): string {
  const digits = onlyDigits(raw).slice(0, 11);
  if (digits.length <= 2) return digits.length ? `(${digits}` : '';
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

function needsProfileSetup(user: SetupUser | null | undefined): boolean {
  if (!user?.employee?.id) return false;
  if (user.impersonation?.active) return false;
  if (user.profileSetupCompletedAt) return false;
  if (String(user.profilePhotoUrl || '').trim()) return false;
  return true;
}

export function ProfileSetupGate() {
  const queryClient = useQueryClient();
  const { user, isLoading } = usePermissions();
  const setupUser = user as SetupUser | undefined;
  const open = !isLoading && needsProfileSetup(setupUser);
  const savedPhone = String(setupUser?.employee?.phone || '');
  const hasSavedPhone = onlyDigits(savedPhone).length >= 10;

  const [phone, setPhone] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const savedPhoneRef = useRef(savedPhone);
  savedPhoneRef.current = savedPhone;

  useEffect(() => {
    if (!open) return;
    const current = savedPhoneRef.current;
    setPhone(onlyDigits(current).length >= 10 ? maskPhoneInput(current) : '');
  }, [open]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!photoFile) throw new Error('Adicione uma foto');
      const digits = onlyDigits(phone);
      if (digits.length < 10) throw new Error('Informe um celular válido com DDD');
      const fd = new FormData();
      fd.append('profileAvatar', photoFile);
      fd.append('phone', digits);
      const res = await api.post('/auth/me/profile-setup', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data;
    },
    onSuccess: () => {
      toast.success('Foto e celular salvos');
      void queryClient.invalidateQueries({ queryKey: ['user'] });
    },
    onError: (error: { response?: { data?: { message?: string } }; message?: string }) => {
      toast.error(error.response?.data?.message || error.message || 'Não foi possível salvar');
    },
  });

  if (!open) return null;

  return (
    <>
      <AppModalOverlay className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/60 p-4">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="profile-setup-title"
          className="app-modal-panel w-full max-w-md rounded-2xl border border-gray-200 bg-white p-5 shadow-xl dark:border-gray-700 dark:bg-gray-900"
          onClick={(event) => event.stopPropagation()}
        >
          <h2 id="profile-setup-title" className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Complete seu cadastro
          </h2>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Adicione uma foto e confirme seu celular. Isso aparece só nesta primeira vez.
          </p>

          <div className="mt-5 flex flex-col items-center gap-3">
            <button
              type="button"
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = 'image/*';
                input.onchange = () => {
                  const file = input.files?.[0];
                  if (!file) return;
                  setCropSrc((prev) => {
                    if (prev) URL.revokeObjectURL(prev);
                    return URL.createObjectURL(file);
                  });
                };
                input.click();
              }}
              className="group relative h-28 w-28 overflow-hidden rounded-full border border-dashed border-gray-300 bg-gray-50 dark:border-gray-600 dark:bg-gray-800"
            >
              {previewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="Prévia da foto" className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-xs font-medium text-gray-500">
                  <Camera className="h-5 w-5" />
                  Adicionar foto
                </span>
              )}
            </button>
            <p className="text-xs text-gray-500 dark:text-gray-400">A foto é obrigatória.</p>
          </div>

          <label className="mt-5 block text-xs font-medium text-gray-600 dark:text-gray-300">
            {hasSavedPhone ? 'Confirme se este é o seu celular' : 'Número do celular'}
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              value={phone}
              onChange={(event) => setPhone(maskPhoneInput(event.target.value))}
              placeholder="(00) 00000-0000"
              className="mt-1 h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
            />
          </label>
          {hasSavedPhone ? (
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Se o número estiver errado, corrija antes de salvar.
            </p>
          ) : null}

          <div className="mt-5 flex justify-end">
            <button
              type="button"
              disabled={saveMutation.isPending || !photoFile || onlyDigits(phone).length < 10}
              onClick={() => saveMutation.mutate()}
              className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
            >
              {saveMutation.isPending ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </div>
      </AppModalOverlay>

      <CircularPhotoCropModal
        open={!!cropSrc}
        imageSrc={cropSrc ?? ''}
        onClose={() => {
          setCropSrc((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
          });
        }}
        onConfirm={async (file) => {
          setPhotoFile(file);
          setPreviewUrl((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(file);
          });
          setCropSrc((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return null;
          });
        }}
        onPickReplacement={(file) => {
          setCropSrc((prev) => {
            if (prev) URL.revokeObjectURL(prev);
            return URL.createObjectURL(file);
          });
        }}
      />
    </>
  );
}
