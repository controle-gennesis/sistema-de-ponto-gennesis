import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

interface CostCenter {
  id: string;
  code: string;
  name: string;
  description?: string;
  isActive: boolean;
}

/**
 * Hook para buscar centros de custo da API
 * Retorna os centros de custo com apenas o NOME (sem código)
 */
export function useCostCenters() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['cost-centers'],
    queryFn: async () => {
      const res = await api.get('/cost-centers', {
        params: { isActive: 'true', limit: 100 }
      });
      return res.data?.data || [];
    },
    staleTime: 5 * 60 * 1000, // Cache por 5 minutos
  });

  const costCenters: CostCenter[] = data || [];
  
  // Formatar com apenas o NOME
  const formattedCostCenters = costCenters.map(cc => ({
    ...cc,
    label: cc.name, // Apenas o nome
    value: cc.name // Usar o nome como value também
  }));

  return {
    costCenters: formattedCostCenters,
    isLoading,
    error,
    // Retornar também apenas os labels (nomes) para compatibilidade com código antigo
    costCentersList: formattedCostCenters.map(cc => cc.label)
  };
}

