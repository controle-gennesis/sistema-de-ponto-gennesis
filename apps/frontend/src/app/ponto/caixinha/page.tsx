'use client';

import dynamic from 'next/dynamic';
import { Loading } from '@/components/ui/Loading';

const CaixinhaPageClient = dynamic(() => import('./CaixinhaPageClient'), {
  ssr: false,
  loading: () => <Loading message="Carregando Caixinha..." fullScreen size="lg" />
});

export default function CaixinhaPage() {
  return <CaixinhaPageClient />;
}
