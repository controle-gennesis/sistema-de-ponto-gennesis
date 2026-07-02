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
}) {
  const res = await api.post('/kanban/cards', payload);
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
) {
  const res = await api.patch(`/kanban/cards/${id}`, payload);
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
) {
  const res = await api.post(`/kanban/cards/${id}/duplicate`, payload ?? {});
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
