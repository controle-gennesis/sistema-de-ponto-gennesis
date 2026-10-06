import api from '@/lib/api';
import type { OcSupplierOption } from '@/components/oc/OcPurchaseOrderFormFields';

/** Busca fornecedores ativos no servidor (cadastro completo, não só os primeiros N). */
export async function searchOcSuppliers(query: string): Promise<OcSupplierOption[]> {
  const res = await api.get('/suppliers', {
    params: {
      search: query.trim() || undefined,
      isActive: true,
      limit: 80,
      page: 1,
    },
  });
  return res.data?.data || [];
}
