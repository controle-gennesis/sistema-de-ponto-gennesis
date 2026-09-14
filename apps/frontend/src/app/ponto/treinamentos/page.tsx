import dynamic from 'next/dynamic';
import { Loading } from '@/components/ui/Loading';

const TreinamentosPageClient = dynamic(() => import('./TreinamentosPageClient'), {
  ssr: false,
  loading: () => <Loading message="Carregando treinamentos..." fullScreen size="lg" />
});

export default function TreinamentosPage() {
  return <TreinamentosPageClient />;
}
