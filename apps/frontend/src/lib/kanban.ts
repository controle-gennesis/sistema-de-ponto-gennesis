import api from '@/lib/api';

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
  canWrite?: boolean;
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
}

export async function fetchKanbanBoards(): Promise<KanbanBoardSummary[]> {
  const res = await api.get('/kanban/boards');
  return res.data.data;
}

export async function fetchKanbanBoard(departmentKey?: string): Promise<KanbanBoard> {
  const res = await api.get('/kanban/board', {
    params: departmentKey ? { departmentKey } : undefined,
  });
  return res.data.data;
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
  payload: { title?: string; color?: string; cardLimit?: number | null },
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
  },
) {
  const res = await api.patch(`/kanban/cards/${id}`, payload);
  return res.data.data as KanbanCard;
}

export async function deleteKanbanCard(id: string) {
  await api.delete(`/kanban/cards/${id}`);
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

export async function fetchKanbanCard(id: string): Promise<KanbanCardDetail> {
  const res = await api.get(`/kanban/cards/${id}`);
  const data = res.data.data as KanbanCardDetail;
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

export async function deleteKanbanAttachment(id: string) {
  const res = await api.delete(`/kanban/attachments/${id}`);
  return res.data.data as KanbanCardDetail;
}
