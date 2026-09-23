'use client';

import dynamic from 'next/dynamic';
import { Loading } from '@/components/ui/Loading';

const RelatoriosUnidadePageClient = dynamic(() => import('./RelatoriosUnidadePageClient'), {
  ssr: false,
  loading: () => <Loading message="Carregando relatórios da localidade..." fullScreen size="lg" />
});

export default function RelatoriosUnidadePage() {
  return <RelatoriosUnidadePageClient />;
}
