import dynamic from 'next/dynamic';
import { Loading } from '@/components/ui/Loading';

const TreinamentosAdminPageClient = dynamic(() => import('./TreinamentosAdminPageClient'), {
  ssr: false,
  loading: () => <Loading message="Carregando treinamentos..." fullScreen size="lg" />
});

export default function TreinamentosAdminPage() {
  return <TreinamentosAdminPageClient />;
}
