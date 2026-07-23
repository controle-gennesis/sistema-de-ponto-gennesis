import api from '@/lib/api';

export type PlannerEvent = {
  id: string;
  userId: string;
  title: string;
  description: string;
  startAt: string;
  endAt: string;
  color: string;
  googleEventId?: string | null;
  ataFileName?: string | null;
  ataFileUrl?: string | null;
  ataFileKey?: string | null;
  ataFileSize?: number | null;
  ataMimeType?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type PlannerEventInput = {
  title: string;
  description?: string;
  startAt: string;
  endAt: string;
  color?: string;
  ownerId?: string;
};

export type PlannerAgendaPermission = 'OWNER' | 'READ' | 'WRITE';

export type PlannerAgenda = {
  ownerId: string;
  name: string;
  email: string;
  profilePhotoUrl: string | null;
  permission: PlannerAgendaPermission;
  isMine: boolean;
};

export type PlannerAgendaShare = {
  id: string;
  userId: string;
  permission: 'READ' | 'WRITE';
  user: {
    id: string;
    name: string;
    email: string;
    profilePhotoUrl: string | null;
  };
};

export type PlannerEventsMeta = {
  ownerId: string;
  permission: PlannerAgendaPermission;
  canWrite: boolean;
  isOwner: boolean;
};

export async function fetchPlannerAgendas(): Promise<PlannerAgenda[]> {
  const res = await api.get('/planner-events/agendas');
  return (res.data?.data || []) as PlannerAgenda[];
}

export async function fetchPlannerAgendaShares(): Promise<PlannerAgendaShare[]> {
  const res = await api.get('/planner-events/shares');
  return (res.data?.data || []) as PlannerAgendaShare[];
}

export async function addPlannerAgendaShare(
  userId: string,
  permission: 'READ' | 'WRITE'
): Promise<PlannerAgendaShare> {
  const res = await api.post('/planner-events/shares', { userId, permission });
  return res.data.data as PlannerAgendaShare;
}

export async function updatePlannerAgendaShare(
  userId: string,
  permission: 'READ' | 'WRITE'
): Promise<PlannerAgendaShare> {
  const res = await api.patch(`/planner-events/shares/${userId}`, { permission });
  return res.data.data as PlannerAgendaShare;
}

export async function removePlannerAgendaShare(userId: string): Promise<void> {
  await api.delete(`/planner-events/shares/${userId}`);
}

export async function fetchPlannerEvents(
  from: Date,
  to: Date,
  ownerId?: string
): Promise<{ events: PlannerEvent[]; meta: PlannerEventsMeta | null }> {
  const params = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
  });
  if (ownerId) params.set('ownerId', ownerId);
  const res = await api.get(`/planner-events?${params.toString()}`);
  return {
    events: (res.data?.data || []) as PlannerEvent[],
    meta: (res.data?.meta || null) as PlannerEventsMeta | null,
  };
}

export async function createPlannerEvent(input: PlannerEventInput): Promise<PlannerEvent> {
  const res = await api.post('/planner-events', input);
  return res.data.data as PlannerEvent;
}

export async function updatePlannerEvent(
  id: string,
  input: Partial<PlannerEventInput>
): Promise<PlannerEvent> {
  const res = await api.patch(`/planner-events/${id}`, input);
  return res.data.data as PlannerEvent;
}

export async function deletePlannerEvent(id: string): Promise<void> {
  await api.delete(`/planner-events/${id}`);
}

export async function uploadPlannerEventAta(
  eventId: string,
  file: File
): Promise<PlannerEvent> {
  const form = new FormData();
  form.append('ata', file);
  const res = await api.post(`/planner-events/${eventId}/ata`, form);
  return res.data.data as PlannerEvent;
}

export async function deletePlannerEventAta(eventId: string): Promise<PlannerEvent> {
  const res = await api.delete(`/planner-events/${eventId}/ata`);
  return res.data.data as PlannerEvent;
}

export async function downloadPlannerEventAta(
  fileUrl: string,
  fileName: string
): Promise<void> {
  const response = await api.get('/chats/direct/attachments/download', {
    params: { url: fileUrl, fileName: fileName || 'ata.pdf' },
    responseType: 'blob',
  });
  const blob = new Blob([response.data], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName || 'ata.pdf';
  a.click();
  URL.revokeObjectURL(url);
}

export async function fetchGoogleCalendarStatus(): Promise<{
  configured: boolean;
  connected: boolean;
}> {
  const res = await api.get('/planner-events/google/status');
  return res.data.data;
}

export async function fetchGoogleCalendarAuthUrl(returnTo: string): Promise<string> {
  const params = new URLSearchParams({ returnTo });
  const res = await api.get(`/planner-events/google/auth-url?${params.toString()}`);
  return res.data.data.url as string;
}

export async function syncGoogleCalendar(from: Date, to: Date): Promise<{
  imported: number;
  updated: number;
  skipped: number;
  calendars?: number;
}> {
  const res = await api.post('/planner-events/google/sync', {
    from: from.toISOString(),
    to: to.toISOString(),
  });
  return res.data.data;
}

export async function disconnectGoogleCalendarApi(): Promise<void> {
  await api.delete('/planner-events/google/disconnect');
}
