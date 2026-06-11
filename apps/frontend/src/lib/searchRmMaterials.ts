import api from './api';

export type RmMaterialListItem = {
  id: string;
  code?: string;
  name?: string;
  description?: string;
  unit?: string;
};

export function getRmMaterialLabel(material?: RmMaterialListItem | null): string {
  return material?.name?.trim() || material?.code?.trim() || material?.description?.trim() || 'Material sem nome';
}

/** Busca materiais para RM (IDs de engenharia); mínimo 2 caracteres. */
export async function searchRmMaterials(search: string, limit = 50): Promise<RmMaterialListItem[]> {
  const term = search.trim();
  if (term.length < 2) return [];

  const res = await api.get('/material-requests/materials', {
    params: { search: term, limit },
  });

  return res.data?.data ?? [];
}
