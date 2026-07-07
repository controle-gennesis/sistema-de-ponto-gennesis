import api from '@/lib/api';
import type { KanbanLabelPreset } from '@/components/kanban/kanbanLabels';

export type Priority = 'low' | 'medium' | 'high' | 'critical';

export interface KanbanCardLabel {
  color: string;
  text: string;
}

export interface KanbanCardMember {
  userId: string;
  name: string;
  profilePhotoUrl: string | null;
  avatarColor: string;
}

export interface KanbanCard {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  startDate: string | null;
  endDate: string | null;
  assignee: string;
  assigneeUserId?: string | null;
  assigneeProfilePhotoUrl?: string | null;
  assigneeColor: string;
  members?: KanbanCardMember[];
  progress: number;
  totalTasks: number;
  completedTasks: number;
  checklistEnabled: boolean;
  attachmentsEnabled: boolean;
  labels: KanbanCardLabel[];
  attachments: number;
  comments: number;
  createdAt: string;
  completedAt?: string | null;
  workHours?: number | null;
}

export interface KanbanCardCostPerson {
  userId: string;
  name: string;
  hourlyRate: number | null;
  cost: number | null;
  hasEmployeeRecord: boolean;
}

export interface KanbanCardCost {
  hours: number;
  periodStart: string;
  periodEnd: string;
  monthlyWorkHours: number;
  totalCost: number;
  hasMissingSalary: boolean;
  people: KanbanCardCostPerson[];
}

export function isKanbanCompletedColumn(title: string): boolean {
  const t = title.trim().toLowerCase();
  return t === 'completed' || t === 'concluído' || t === 'concluido';
}

export interface KanbanColumn {
  id: string;
  title: string;
  color: string;
  cards: KanbanCard[];
  limit?: number;
}

export interface KanbanBoard {
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
}

export interface KanbanBoardSummary {
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
  canManageShares: boolean;
  sharedWithMe: boolean;
}

export interface KanbanBoardShare {
  id: string;
  userId: string;
  permission: 'READ' | 'WRITE';
  user: {
    id: string;
    name: string;
    email: string;
    profilePhotoUrl: string | null;
  };
}

export async function fetchKanbanBoards(): Promise<KanbanBoardSummary[]> {
  const res = await api.get('/kanban/boards');
  return res.data.data;
}

export async function createKanbanBoard(name: string): Promise<KanbanBoardSummary> {
  const res = await api.post('/kanban/boards', { name });
  return res.data.data;
}

export async function updateKanbanBoard(boardId: string, name: string): Promise<KanbanBoardSummary> {
  const res = await api.patch(`/kanban/boards/${boardId}`, { name });
  return res.data.data;
}

export async function deleteKanbanBoard(boardId: string): Promise<{ departmentKey: string }> {
  const res = await api.delete(`/kanban/boards/${boardId}`);
  return res.data.data;
}

export async function fetchKanbanBoardShares(boardId: string): Promise<KanbanBoardShare[]> {
  const res = await api.get(`/kanban/boards/${boardId}/shares`);
  return res.data.data;
}

export async function addKanbanBoardShare(
  boardId: string,
  userId: string,
  permission: 'READ' | 'WRITE' = 'WRITE',
): Promise<KanbanBoardShare> {
  const res = await api.post(`/kanban/boards/${boardId}/shares`, { userId, permission });
  return res.data.data;
}

export async function updateKanbanBoardShare(
  boardId: string,
  userId: string,
  permission: 'READ' | 'WRITE',
): Promise<KanbanBoardShare> {
  const res = await api.patch(`/kanban/boards/${boardId}/shares/${userId}`, { permission });
  return res.data.data;
}

export async function removeKanbanBoardShare(boardId: string, userId: string): Promise<void> {
  await api.delete(`/kanban/boards/${boardId}/shares/${userId}`);
}

export async function fetchKanbanBoard(departmentKey?: string): Promise<KanbanBoard> {
  const res = await api.get('/kanban/board', {
    params: departmentKey ? { departmentKey } : undefined,
  });
  return res.data.data;
}

export async function updateKanbanBoardLabelPresets(
  presets: KanbanLabelPreset[],
  departmentKey?: string,
): Promise<KanbanLabelPreset[]> {
  const res = await api.patch('/kanban/board/label-presets', {
    presets,
    ...(departmentKey ? { departmentKey } : {}),
  });
  return res.data.data;
}

export type KanbanBoardCardChecklistPatch = Pick<
  KanbanCard,
  'completedTasks' | 'totalTasks' | 'progress' | 'checklistEnabled'
>;

/** Atualiza contadores de checklist de um card no cache do board (sem refetch). */
export function patchCardInBoardCache(
  board: KanbanBoard | undefined,
  cardId: string,
  patch: KanbanBoardCardChecklistPatch,
): KanbanBoard | undefined {
  if (!board) return board;

  let changed = false;
  const columns = board.columns.map((col) => {
    let colChanged = false;
    const cards = col.cards.map((card) => {
      if (card.id !== cardId) return card;
      if (
        card.completedTasks === patch.completedTasks &&
        card.totalTasks === patch.totalTasks &&
        card.progress === patch.progress &&
        card.checklistEnabled === patch.checklistEnabled
      ) {
        return card;
      }
      colChanged = true;
      changed = true;
      return { ...card, ...patch };
    });
    return colChanged ? { ...col, cards } : col;
  });

  return changed ? { ...board, columns } : board;
}

/** Insere um card no cache do board (ex.: após copiar), sem refetch do quadro inteiro. */
export function insertCardIntoBoardCache(
  board: KanbanBoard | undefined,
  columnId: string,
  card: KanbanCard,
  atTop = true,
): KanbanBoard | undefined {
  if (!board) return board;

  return {
    ...board,
    columns: board.columns.map((col) => {
      if (col.id !== columnId) return col;
      const withoutDup = col.cards.filter((c) => c.id !== card.id);
      const cards = atTop ? [card, ...withoutDup] : [...withoutDup, card];
      return { ...col, cards };
    }),
  };
}

export function buildOptimisticNewCard(title: string, tempId: string): KanbanCard {
  return {
    id: tempId,
    title,
    description: '',
    priority: 'medium',
    startDate: null,
    endDate: null,
    assignee: 'Sem responsável',
    assigneeUserId: null,
    assigneeProfilePhotoUrl: null,
    assigneeColor: '#9CA3AF',
    members: [],
    progress: 0,
    totalTasks: 0,
    completedTasks: 0,
    checklistEnabled: false,
    attachmentsEnabled: false,
    labels: [],
    attachments: 0,
    comments: 0,
    createdAt: new Date().toISOString(),
    completedAt: null,
    workHours: null,
  };
}

/** Remove um card do cache do board (ex.: após excluir), sem refetch. */
export function removeCardFromBoardCache(
  board: KanbanBoard | undefined,
  cardId: string,
): KanbanBoard | undefined {
  if (!board) return board;

  let changed = false;
  const columns = board.columns.map((col) => {
    const cards = col.cards.filter((c) => c.id !== cardId);
    if (cards.length === col.cards.length) return col;
    changed = true;
    return { ...col, cards };
  });

  return changed ? { ...board, columns } : board;
}

/** Substitui um card temporário (cópia otimista) pelo card real retornado da API. */
export function replaceCardInBoardCache(
  board: KanbanBoard | undefined,
  tempId: string,
  card: KanbanCard,
): KanbanBoard | undefined {
  if (!board) return board;

  let changed = false;
  const columns = board.columns.map((col) => {
    const index = col.cards.findIndex((c) => c.id === tempId);
    if (index < 0) return col;
    changed = true;
    const cards = [...col.cards];
    cards[index] = card;
    return { ...col, cards };
  });

  return changed ? { ...board, columns } : board;
}

/** Converte detalhe do card (modal) para o formato exibido no quadro. */
export function kanbanDetailToBoardCard(detail: KanbanCardDetail): KanbanCard {
  const {
    columnId: _columnId,
    columnTitle: _columnTitle,
    columnColor: _columnColor,
    checklistItems: _checklistItems,
    commentsList: _commentsList,
    attachmentsList: _attachmentsList,
    updatedAt: _updatedAt,
    ...card
  } = detail;
  return card;
}

/**
 * Atualiza um card no cache do quadro (campos + movimento entre colunas) sem refetch.
 */
export function syncCardOnBoardCache(
  board: KanbanBoard | undefined,
  card: KanbanCard,
  columnId: string,
): KanbanBoard | undefined {
  if (!board) return board;

  let sourceColumnId: string | null = null;
  let sourceIndex = -1;
  for (const col of board.columns) {
    const idx = col.cards.findIndex((c) => c.id === card.id);
    if (idx >= 0) {
      sourceColumnId = col.id;
      sourceIndex = idx;
      break;
    }
  }

  if (!sourceColumnId) {
    return insertCardIntoBoardCache(board, columnId, card, false);
  }

  if (sourceColumnId === columnId) {
    let changed = false;
    const columns = board.columns.map((col) => {
      if (col.id !== columnId) return col;
      const cards = col.cards.map((c) => {
        if (c.id !== card.id) return c;
        changed = true;
        return { ...c, ...card };
      });
      return changed ? { ...col, cards } : col;
    });
    return changed ? { ...board, columns } : board;
  }

  const columns = board.columns
    .map((col) => {
      if (col.id === sourceColumnId) {
        return { ...col, cards: col.cards.filter((c) => c.id !== card.id) };
      }
      return col;
    })
    .map((col) => {
      if (col.id !== columnId) return col;
      const cards = [...col.cards];
      const insertAt = Math.min(sourceIndex, cards.length);
      cards.splice(insertAt, 0, card);
      return { ...col, cards };
    });

  return { ...board, columns };
}

export function buildOptimisticCardCopy(
  source: KanbanCard,
  title: string,
  tempId: string,
): KanbanCard {
  return {
    ...source,
    id: tempId,
    title,
    progress: source.checklistEnabled ? 0 : source.progress,
    completedTasks: source.checklistEnabled ? 0 : source.completedTasks,
    comments: 0,
    attachments: 0,
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
}

/** Remove uma coluna do cache do board (ex.: após excluir), sem refetch. */
export function removeColumnFromBoardCache(
  board: KanbanBoard | undefined,
  columnId: string,
): KanbanBoard | undefined {
  if (!board) return board;

  const columns = board.columns.filter((col) => col.id !== columnId);
  return columns.length === board.columns.length ? board : { ...board, columns };
}

/** Insere uma coluna no cache do board (ex.: após criar), sem refetch. */
export function insertColumnIntoBoardCache(
  board: KanbanBoard | undefined,
  column: KanbanColumn,
  atEnd = true,
): KanbanBoard | undefined {
  if (!board) return board;

  const withoutDup = board.columns.filter((col) => col.id !== column.id);
  return {
    ...board,
    columns: atEnd ? [...withoutDup, column] : [column, ...withoutDup],
  };
}

export function buildOptimisticKanbanColumn(
  title: string,
  color: string,
  tempId: string,
  limit?: number,
): KanbanColumn {
  return {
    id: tempId,
    title,
    color,
    cards: [],
    ...(limit ? { limit } : {}),
  };
}

export function patchColumnInBoardCache(
  board: KanbanBoard | undefined,
  columnId: string,
  patch: Partial<Pick<KanbanColumn, 'title' | 'color' | 'limit'>>,
): KanbanBoard | undefined {
  if (!board) return board;

  let changed = false;
  const columns = board.columns.map((col) => {
    if (col.id !== columnId) return col;
    changed = true;
    return { ...col, ...patch };
  });

  return changed ? { ...board, columns } : board;
}

export async function createKanbanColumn(payload: {
  title: string;
  color: string;
  cardLimit?: number;
  boardId?: string;
}) {
  const res = await api.post('/kanban/columns', payload);
  return res.data.data as KanbanColumn;
}

export async function updateKanbanColumn(
  id: string,
  payload: { title?: string; color?: string; cardLimit?: number | null; position?: number },
) {
  const res = await api.patch(`/kanban/columns/${id}`, payload);
  return res.data.data as KanbanColumn;
}

export async function deleteKanbanColumn(id: string) {
  await api.delete(`/kanban/columns/${id}`);
}

export async function createKanbanCard(payload: {
  columnId: string;
  title: string;
  description?: string;
  priority?: Priority;
  startDate?: string | null;
  endDate?: string | null;
  labels?: KanbanCardLabel[];
  assigneeName?: string;
  assigneeUserId?: string | null;
  memberUserIds?: string[];
  totalTasks?: number;
  completedTasks?: number;
  insertAt?: 'top' | 'bottom';
}, options?: { timeout?: number }) {
  const res = await api.post('/kanban/cards', payload, {
    timeout: options?.timeout ?? 30_000,
  });
  return res.data.data as KanbanCard;
}

export async function addKanbanCardMember(cardId: string, userId: string) {
  const res = await api.post(`/kanban/cards/${cardId}/members`, { userId });
  return res.data.data as KanbanCardDetail;
}

export async function removeKanbanCardMember(cardId: string, userId: string) {
  const res = await api.delete(`/kanban/cards/${cardId}/members/${userId}`);
  return res.data.data as KanbanCardDetail;
}

export async function updateKanbanCard(
  id: string,
  payload: {
    columnId?: string;
    title?: string;
    description?: string;
    priority?: Priority;
    startDate?: string | null;
    endDate?: string | null;
    labels?: KanbanCardLabel[];
    assigneeName?: string;
    assigneeUserId?: string | null;
    totalTasks?: number;
    completedTasks?: number;
    checklistEnabled?: boolean;
    attachmentsEnabled?: boolean;
    position?: number;
    workHours?: number | null;
  },
  options?: { timeout?: number },
) {
  const res = await api.patch(`/kanban/cards/${id}`, payload, {
    timeout: options?.timeout ?? 120_000,
  });
  return res.data.data as KanbanCard;
}

export async function fetchKanbanCardCost(cardId: string): Promise<KanbanCardCost> {
  const res = await api.get(`/kanban/cards/${cardId}/cost`);
  return res.data.data as KanbanCardCost;
}

export async function deleteKanbanCard(id: string) {
  await api.delete(`/kanban/cards/${id}`);
}

export async function duplicateKanbanCard(
  id: string,
  payload?: { title?: string; columnId?: string },
  options?: { timeout?: number },
) {
  const res = await api.post(`/kanban/cards/${id}/duplicate`, payload ?? {}, {
    timeout: options?.timeout ?? 120_000,
  });
  return res.data.data as KanbanCard;
}

export interface KanbanChecklistItemAssignee {
  id: string;
  name: string;
  profilePhotoUrl: string | null;
  avatarColor: string;
}

export interface KanbanChecklistItem {
  id: string;
  cardId?: string;
  title: string;
  isDone: boolean;
  position: number;
  dueDate: string | null;
  assigneeUserId: string | null;
  assignee: KanbanChecklistItemAssignee | null;
}

export const KANBAN_LINK_MIME_TYPE = 'text/x-kanban-link';

export function isKanbanLinkAttachment(mimeType: string): boolean {
  return mimeType === KANBAN_LINK_MIME_TYPE;
}

export interface KanbanCardAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
  uploader: { id: string; name: string };
}

export interface KanbanCardComment {
  id: string;
  content: string;
  createdAt: string;
  author: {
    id: string;
    name: string;
    profilePhotoUrl: string | null;
    avatarColor: string;
  };
}

export interface KanbanCardDetail extends KanbanCard {
  columnId: string;
  columnTitle: string;
  columnColor: string;
  updatedAt?: string;
  checklistItems: KanbanChecklistItem[];
  commentsList: KanbanCardComment[];
  attachmentsList: KanbanCardAttachment[];
}

export function normalizeKanbanCardDetail(data: KanbanCardDetail): KanbanCardDetail {
  return {
    ...data,
    attachmentsList: data.attachmentsList ?? [],
    checklistItems: (data.checklistItems ?? []).map((item) => ({
      ...item,
      dueDate: item.dueDate ?? null,
      assigneeUserId: item.assigneeUserId ?? null,
      assignee: item.assignee ?? null,
    })),
  };
}

export const kanbanCardQueryKey = (cardId: string) => ['kanban-card', cardId] as const;

/** Dados do board para exibir a modal antes do fetch completo (checklist, comentários, anexos). */
export function boardCardToDetailPlaceholder(
  card: KanbanCard,
  columnId: string,
  column?: { title: string; color: string },
): KanbanCardDetail {
  return normalizeKanbanCardDetail({
    ...card,
    members: card.members ?? [],
    labels: card.labels ?? [],
    columnId,
    columnTitle: column?.title ?? '',
    columnColor: column?.color ?? '',
    checklistItems: [],
    commentsList: [],
    attachmentsList: [],
  });
}

export async function fetchKanbanCard(id: string): Promise<KanbanCardDetail> {
  const res = await api.get(`/kanban/cards/${id}`);
  return normalizeKanbanCardDetail(res.data.data as KanbanCardDetail);
}

export async function createChecklistItem(cardId: string, title: string) {
  const res = await api.post(`/kanban/cards/${cardId}/checklist-items`, { title });
  return res.data.data as { item: KanbanChecklistItem; card: KanbanCardDetail };
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
  const res = await api.patch(`/kanban/checklist-items/${id}`, payload);
  return res.data.data as { item: KanbanChecklistItem; card: KanbanCardDetail };
}

export async function deleteChecklistItem(id: string) {
  await api.delete(`/kanban/checklist-items/${id}`);
}

export async function createKanbanComment(cardId: string, content: string) {
  const res = await api.post(`/kanban/cards/${cardId}/comments`, { content });
  return res.data.data as KanbanCardComment;
}

export async function deleteKanbanComment(id: string) {
  await api.delete(`/kanban/comments/${id}`);
}

export async function uploadKanbanAttachments(cardId: string, files: File[]) {
  const form = new FormData();
  files.forEach((f) => form.append('attachments', f));
  const res = await api.post(`/kanban/cards/${cardId}/attachments`, form);
  return res.data.data as KanbanCardDetail;
}

export async function addKanbanLinkAttachment(
  cardId: string,
  payload: { url: string; displayName?: string },
) {
  const res = await api.post(`/kanban/cards/${cardId}/attachments/link`, payload);
  return res.data.data as KanbanCardDetail;
}

export async function deleteKanbanAttachment(id: string) {
  const res = await api.delete(`/kanban/attachments/${id}`);
  return res.data.data as KanbanCardDetail;
}
