'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { authService } from '@/lib/auth';

/** Logout padrão: limpa sessão, cache do React Query e redireciona para o login. */
export function useLogout() {
  const router = useRouter();
  const queryClient = useQueryClient();

  return useCallback(() => {
    void authService.logout().finally(() => {
      queryClient.clear();
      router.push('/auth/login');
    });
  }, [queryClient, router]);
}
