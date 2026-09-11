'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Loading } from '@/components/ui/Loading';

export default function LegacyGerenciarSolicitacoesDpPage() {
  const router = useRouter();
  React.useEffect(() => {
    router.replace('/ponto/gerenciar-solicitacoes-gerais');
  }, [router]);
  return <Loading message="Redirecionando..." fullScreen size="lg" />;
}
