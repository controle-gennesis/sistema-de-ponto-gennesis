'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loading } from '@/components/ui/Loading';

export default function LegacySolicitacoesDpPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/ponto/solicitacoes-gerais');
  }, [router]);
  return <Loading message="Redirecionando..." fullScreen size="lg" />;
}
