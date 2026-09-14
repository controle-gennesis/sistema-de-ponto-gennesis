import dynamic from 'next/dynamic';
import { Loading } from '@/components/ui/Loading';

const GestaoOsEquipesPageClient = dynamic(() => import('./GestaoOsEquipesPageClient'), {
  ssr: false,
  loading: () => <Loading message="Carregando equipes..." fullScreen size="lg" />
});

export default function GestaoOsEquipesPage() {
  return <GestaoOsEquipesPageClient />;
}
