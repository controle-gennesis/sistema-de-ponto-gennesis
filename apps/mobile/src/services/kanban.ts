import api from './api';
import { readApiData } from './http';

export type Priority = 'low' | 'medium' | 'high' | 'critical';

export type KanbanCardLabel = { color: string; text: string };

export type KanbanCardMember = {
  userId: string;
  name: string;
  profilePhotoUrl: string | null;
  avatarColor: string;
};

export type KanbanCard = {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  startDate: string | null;
  endDate: string | null;
  assignee: string;
  assigneeUserId?: string | null;
  assigneeProfilePhotoUrl?: string | null;
  assigneeColor?: string;
  members?: KanbanCardMember[];
  progress: number;
  totalTasks: number;
  completedTasks: number;
  checklistEnabled?: boolean;
  attachmentsEnabled?: boolean;
  labels: KanbanCardLabel[];
  attachments: number;
  /** Quantidade de materiais vinculados. */
  materials?: number;
  comments: number;
  workHours?: number | null;
  createdAt: string;
  completedAt?: string | null;
  checklistItems?: KanbanChecklistItem[];
};

export type KanbanColumn = {
  id: string;
  title: string;
  color: string;
  cards: KanbanCard[];
  limit?: number;
};

export type KanbanLabelPreset = { color: string; name: string };

export const DEFAULT_KANBAN_LABEL_PRESETS: KanbanLabelPreset[] = [
  { color: '#FF78CB', name: 'DP/RH' },
  { color: '#00C2E0', name: 'Sistema' },
  { color: '#FF9F1A', name: 'Engenharia' },
  { color: '#F2D600', name: 'Suprimentos' },
  { color: '#C377E0', name: 'Contratos e Licitações' },
  { color: '#51E898', name: 'Projetos' },
  { color: '#EB5A46', name: 'Diretoria/Auditoria' },
  { color: '#344563', name: 'Geral' },
];

export type KanbanBoard = {
  id: string;
  name: string;
  slug: string;
  department: string;
  departmentKey: string;
  isCustom?: boolean;
  isOwner?: boolean;
  canManageShares?: boolean;
  canWrite?: boolean;
  labelPresets?: KanbanLabelPreset[];
  columns: KanbanColumn[];
};

export type KanbanBoardSummary = {
  id: string;
  name: string;
  slug: string;
  departmentKey: string;
  department: string;
  columnCount: number;
  updatedAt: string;
  isOwnDepartment: boolean;
  isCustom: boolean;
  isOwner: boolean;
  canManageShares?: boolean;
  sharedWithMe: boolean;
};

export type KanbanChecklistItem = {
  id: string;
  title: string;
  isDone: boolean;
  position: number;
  dueDate: string | null;
  assigneeUserId?: string | null;
  assignee?: {
    id: string;
    name: string;
    profilePhotoUrl: string | null;
    avatarColor: string;
  } | null;
};

export type KanbanCardComment = {
  id: string;
  content: string;
  createdAt: string;
  author: {
    id: string;
    name: string;
    profilePhotoUrl?: string | null;
    avatarColor?: string;
  };
};

/** Ação registrada no histórico do card (mover, concluir, arquivar, editar...). */
export type KanbanCardActivity = {
  id: string;
  type: string;
  data: Record<string, unknown>;
  createdAt: string;
  user: {
    id: string;
    name: string;
    profilePhotoUrl: string | null;
    avatarColor: string;
  } | null;
};

export type KanbanCardAttachment = {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
  uploader?: { id: string; name: string };
};

export const KANBAN_LINK_MIME_TYPE = 'text/x-kanban-link';

export function isKanbanLinkAttachment(mimeType: string): boolean {
  return mimeType === KANBAN_LINK_MIME_TYPE;
}

export type KanbanCardDetail = KanbanCard & {
  columnId: string;
  columnTitle: string;
  columnColor: string;
  checklistItems: KanbanChecklistItem[];
  commentsList: KanbanCardComment[];
  attachmentsList: KanbanCardAttachment[];
  activitiesList?: KanbanCardActivity[];
};

export async function fetchKanbanBoards(): Promise<KanbanBoardSummary[]> {
  const res = await api.get('/api/kanban/boards');
  return (await readApiData<KanbanBoardSummary[]>(res)) || [];
}

export async function createKanbanBoard(name: string): Promise<KanbanBoardSummary> {
  const res = await api.post('/api/kanban/boards', { name });
  return readApiData<KanbanBoardSummary>(res);
}

export async function fetchKanbanBoard(departmentKey?: string): Promise<KanbanBoard> {
  const q = departmentKey
    ? `?departmentKey=${encodeURIComponent(departmentKey)}`
    : '';
  const res = await api.get(`/api/kanban/board${q}`);
  const data = await readApiData<KanbanBoard>(res);
  return {
    ...data,
    labelPresets:
      Array.isArray(data.labelPresets) && data.labelPresets.length > 0
        ? data.labelPresets
        : [...DEFAULT_KANBAN_LABEL_PRESETS],
  };
}

export async function createKanbanCard(payload: {
  columnId: string;
  title: string;
  description?: string;
  priority?: Priority;
  startDate?: string | null;
  endDate?: string | null;
  labels?: KanbanCardLabel[];
  assigneeUserId?: string | null;
  memberUserIds?: string[];
  insertAt?: 'top' | 'bottom';
}): Promise<KanbanCard> {
  const res = await api.post('/api/kanban/cards', payload);
  return readApiData<KanbanCard>(res);
}

export async function createKanbanColumn(payload: {
  title: string;
  color: string;
  boardId?: string;
  cardLimit?: number;
}): Promise<KanbanColumn> {
  const res = await api.post('/api/kanban/columns', payload);
  return readApiData<KanbanColumn>(res);
}

export async function updateKanbanCard(
  id: string,
  payload: {
    columnId?: string;
    title?: string;
    description?: string;
    priority?: Priority;
    labels?: KanbanCardLabel[];
    startDate?: string | null;
    endDate?: string | null;
    assigneeUserId?: string | null;
    assigneeName?: string;
    checklistEnabled?: boolean;
    attachmentsEnabled?: boolean;
    workHours?: number | null;
    completedAt?: string | null;
    archivedAt?: string | null;
  },
): Promise<KanbanCard> {
  const res = await api.patch(`/api/kanban/cards/${id}`, payload);
  return readApiData<KanbanCard>(res);
}

export async function moveKanbanCard(
  id: string,
  payload: { columnId: string; position: number },
): Promise<{ id: string; columnId: string; position: number }> {
  const res = await api.patch(`/api/kanban/cards/${id}/move`, payload);
  return readApiData(res);
}

export async function deleteKanbanCard(id: string): Promise<void> {
  const res = await api.delete(`/api/kanban/cards/${id}`);
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json?.message || 'Falha ao excluir card');
  }
}

export async function fetchKanbanCard(id: string): Promise<KanbanCardDetail> {
  const res = await api.get(`/api/kanban/cards/${id}`);
  const data = await readApiData<KanbanCardDetail>(res);
  return {
    ...data,
    checklistItems: data.checklistItems ?? [],
    commentsList: data.commentsList ?? [],
    attachmentsList: data.attachmentsList ?? [],
    activitiesList: data.activitiesList ?? [],
    members: data.members ?? [],
    labels: data.labels ?? [],
  };
}

export async function createChecklistItem(cardId: string, title: string) {
  const res = await api.post(`/api/kanban/cards/${cardId}/checklist-items`, { title });
  return readApiData<{ item: KanbanChecklistItem; card: KanbanCardDetail }>(res);
}

export async function updateChecklistItem(
  id: string,
  payload: {
    title?: string;
    isDone?: boolean;
    assigneeUserId?: string | null;
    dueDate?: string | null;
  },
) {
  const res = await api.patch(`/api/kanban/checklist-items/${id}`, payload);
  return readApiData<{ item: KanbanChecklistItem; card: KanbanCardDetail }>(res);
}

export async function deleteChecklistItem(id: string): Promise<void> {
  const res = await api.delete(`/api/kanban/checklist-items/${id}`);
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json?.message || 'Falha ao excluir item');
  }
}

export async function createKanbanComment(cardId: string, content: string) {
  const res = await api.post(`/api/kanban/cards/${cardId}/comments`, { content });
  return readApiData<KanbanCardComment>(res);
}

export async function uploadKanbanAttachments(
  cardId: string,
  files: Array<{ uri: string; name: string; type: string }>,
): Promise<KanbanCardDetail> {
  const form = new FormData();
  for (const file of files) {
    form.append('attachments', {
      uri: file.uri,
      name: file.name,
      type: file.type,
    } as any);
  }
  const res = await api.post(`/api/kanban/cards/${cardId}/attachments`, form);
  return readApiData<KanbanCardDetail>(res);
}

export async function addKanbanLinkAttachment(
  cardId: string,
  payload: { url: string; displayName?: string },
): Promise<KanbanCardDetail> {
  const res = await api.post(`/api/kanban/cards/${cardId}/attachments/link`, payload);
  return readApiData<KanbanCardDetail>(res);
}

export async function deleteKanbanAttachment(id: string): Promise<KanbanCardDetail> {
  const res = await api.delete(`/api/kanban/attachments/${id}`);
  return readApiData<KanbanCardDetail>(res);
}

export async function updateKanbanBoard(boardId: string, name: string): Promise<KanbanBoardSummary> {
  const res = await api.patch(`/api/kanban/boards/${boardId}`, { name });
  return readApiData<KanbanBoardSummary>(res);
}

export async function deleteKanbanBoard(boardId: string): Promise<void> {
  const res = await api.delete(`/api/kanban/boards/${boardId}`);
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json?.message || 'Falha ao excluir quadro');
  }
}

export type KanbanBoardShare = {
  id: string;
  userId: string;
  permission: 'READ' | 'WRITE';
  user: { id: string; name: string; email: string; profilePhotoUrl: string | null };
};

export async function fetchKanbanBoardShares(boardId: string): Promise<KanbanBoardShare[]> {
  const res = await api.get(`/api/kanban/boards/${boardId}/shares`);
  return (await readApiData<KanbanBoardShare[]>(res)) || [];
}

export async function addKanbanBoardShare(
  boardId: string,
  userId: string,
  permission: 'READ' | 'WRITE' = 'WRITE',
): Promise<KanbanBoardShare> {
  const res = await api.post(`/api/kanban/boards/${boardId}/shares`, { userId, permission });
  return readApiData<KanbanBoardShare>(res);
}

export async function updateKanbanBoardShare(
  boardId: string,
  userId: string,
  permission: 'READ' | 'WRITE',
): Promise<KanbanBoardShare> {
  const res = await api.patch(`/api/kanban/boards/${boardId}/shares/${userId}`, { permission });
  return readApiData<KanbanBoardShare>(res);
}

export async function removeKanbanBoardShare(boardId: string, userId: string): Promise<void> {
  const res = await api.delete(`/api/kanban/boards/${boardId}/shares/${userId}`);
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json?.message || 'Falha ao remover compartilhamento');
  }
}

export type KanbanPickerUser = {
  id: string;
  name: string;
  email: string;
  profilePhotoUrl?: string | null;
};

export async function fetchKanbanPickerUsers(): Promise<KanbanPickerUser[]> {
  const res = await api.get('/api/kanban/picker-users');
  return (await readApiData<KanbanPickerUser[]>(res)) || [];
}

export async function addKanbanCardMember(cardId: string, userId: string): Promise<KanbanCardDetail> {
  const res = await api.post(`/api/kanban/cards/${cardId}/members`, { userId });
  return readApiData<KanbanCardDetail>(res);
}

export async function removeKanbanCardMember(
  cardId: string,
  userId: string,
): Promise<KanbanCardDetail> {
  const res = await api.delete(`/api/kanban/cards/${cardId}/members/${userId}`);
  return readApiData<KanbanCardDetail>(res);
}

export async function updateKanbanColumn(
  id: string,
  payload: { title?: string; color?: string; cardLimit?: number | null; position?: number },
): Promise<KanbanColumn> {
  const res = await api.patch(`/api/kanban/columns/${id}`, payload);
  return readApiData<KanbanColumn>(res);
}

export async function deleteKanbanColumn(id: string): Promise<void> {
  const res = await api.delete(`/api/kanban/columns/${id}`);
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json?.message || 'Falha ao excluir coluna');
  }
}

export async function updateKanbanBoardLabelPresets(
  presets: KanbanLabelPreset[],
  departmentKey?: string,
  options?: { colorRemaps?: Array<{ from: string; to: string }> },
): Promise<KanbanLabelPreset[]> {
  const res = await api.patch('/api/kanban/board/label-presets', {
    presets,
    ...(departmentKey ? { departmentKey } : {}),
    ...(options?.colorRemaps?.length ? { colorRemaps: options.colorRemaps } : {}),
  });
  return readApiData<KanbanLabelPreset[]>(res);
}

export type KanbanArchivedCard = KanbanCard & {
  columnId: string;
  columnTitle: string;
  columnColor?: string;
  archivedAt: string | null;
};

export async function fetchKanbanArchivedCards(departmentKey?: string): Promise<KanbanArchivedCard[]> {
  const q = departmentKey ? `?departmentKey=${encodeURIComponent(departmentKey)}` : '';
  const res = await api.get(`/api/kanban/board/archived-cards${q}`);
  return (await readApiData<KanbanArchivedCard[]>(res)) || [];
}

export async function duplicateKanbanCard(
  id: string,
  payload?: { title?: string; columnId?: string; copyLabels?: boolean; copyAttachments?: boolean },
): Promise<KanbanCard> {
  const res = await api.post(`/api/kanban/cards/${id}/duplicate`, payload ?? {});
  return readApiData<KanbanCard>(res);
}

export async function deleteKanbanComment(id: string): Promise<void> {
  const res = await api.delete(`/api/kanban/comments/${id}`);
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json?.message || 'Falha ao excluir comentário');
  }
}

export type KanbanCardMaterial = {
  id: string;
  materialId: string;
  name: string;
  unit: string;
  code: string | null;
  productType: string | null;
  quantity: number;
  observation?: string | null;
};

export async function fetchKanbanCardMaterials(cardId: string): Promise<KanbanCardMaterial[]> {
  const res = await api.get(`/api/kanban/cards/${cardId}/materials`);
  return (await readApiData<KanbanCardMaterial[]>(res)) || [];
}

export async function removeKanbanCardMaterial(cardId: string, materialId: string): Promise<void> {
  const res = await api.delete(`/api/kanban/cards/${cardId}/materials/${materialId}`);
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json?.message || 'Falha ao remover material');
  }
}

export type ConstructionMaterialItem = {
  id: string;
  name: string;
  unit: string;
  code?: string | null;
  productType?: string | null;
};

/** Lista/busca no catálogo de materiais (somente os vindos do TOTVS), como no site. */
export async function searchConstructionMaterials(
  search: string,
  limit = 50,
): Promise<ConstructionMaterialItem[]> {
  const term = search.trim();
  // Sem texto, traz os primeiros materiais do catálogo; com 1 letra só, espera mais um pouco.
  if (term.length === 1) return [];
  const searchParam = term ? `&search=${encodeURIComponent(term)}` : '';
  const qs = `page=1&limit=${limit}${searchParam}&isActive=true&source=totvs`;
  const res = await api.get(`/api/construction-materials?${qs}`);
  return (await readApiData<ConstructionMaterialItem[]>(res)) || [];
}

export async function addKanbanCardMaterials(
  cardId: string,
  materials: Array<{ materialId: string; quantity: number; observation?: string }>,
): Promise<KanbanCardMaterial[]> {
  const res = await api.post(`/api/kanban/cards/${cardId}/materials`, { materials });
  return (await readApiData<KanbanCardMaterial[]>(res)) || [];
}

export type KanbanCardCost = {
  hours: number;
  periodStart: string;
  periodEnd: string;
  monthlyWorkHours: number;
  totalCost: number;
  hasMissingSalary: boolean;
  people: Array<{
    userId: string;
    name: string;
    hourlyRate: number | null;
    cost: number | null;
    hasEmployeeRecord: boolean;
  }>;
};

export async function fetchKanbanCardCost(cardId: string): Promise<KanbanCardCost> {
  const res = await api.get(`/api/kanban/cards/${cardId}/cost`);
  return readApiData<KanbanCardCost>(res);
}

export function isKanbanCompletedColumn(title: string): boolean {
  const t = title.trim().toLowerCase();
  return t === 'completed' || t === 'concluído' || t === 'concluido';
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  critical: 'Crítica',
};
