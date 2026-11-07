import api from './api';
import { readApiData } from './http';

export type EmpreiteiroMember = {
  id?: string;
  name: string;
  role: string;
  phone?: string | null;
  document?: string | null;
  photoUrl?: string | null;
};

export type EmpreiteiroServico = {
  id: string;
  name?: string | null;
  contratoNome?: string | null;
  description?: string | null;
  location?: string | null;
  iconName?: string | null;
  iconColor?: string | null;
  centroCustoNome?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  status?: string | null;
  isActive?: boolean;
  plannedValue?: number | null;
  currentValue?: number | null;
  executedAmountTotal?: number | null;
  installments?: Array<{ amount?: number | string | null; status?: string | null }>;
  teamCount?: number;
  team?: EmpreiteiroMember[];
  measurementCount?: number;
};

export type Empreiteiro = {
  id: string;
  name: string;
  tradeName?: string | null;
  cnpj?: string | null;
  document?: string | null;
  cpf?: string | null;
  phone?: string | null;
  specialty?: string | null;
  isActive?: boolean;
  contactName?: string | null;
  email?: string | null;
  city?: string | null;
  state?: string | null;
  pixKey?: string | null;
  bank?: string | null;
  agency?: string | null;
  account?: string | null;
  photoUrl?: string | null;
  contracts?: EmpreiteiroServico[];
};

export type GeoPhoto = {
  url: string;
  name: string;
  key?: string;
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  capturedAt: string;
  address?: string | null;
  /** Arquivo local, só para mostrar a miniatura na hora (não é enviado à API). */
  previewUri?: string;
};

export type DailyMeasurement = {
  id: string;
  workDate: string;
  description: string;
  contractId?: string | null;
  status?: string | null;
  correctionNote?: string | null;
  photos: Array<{ url: string; name?: string; capturedAt?: string | null; address?: string | null }>;
  teamPhoto: { url: string; name?: string; capturedAt?: string | null; address?: string | null } | null;
  workers: Array<{ id: string; teamMemberId: string | null; name: string; role: string }>;
  executedAmount?: number | null;
  approvedAt?: string | null;
  createdAt?: string | null;
};

export const EMPREITEIRO_TEAM_ROLES = [
  'Pedreiro',
  'Servente',
  'Eletricista',
  'Encanador',
  'Pintor',
  'Ajudante',
  'Mestre de obras',
  'Outros',
];

export async function fetchEmpreiteiro(id: string): Promise<Empreiteiro> {
  const res = await api.get(`/api/empreiteiros/${id}`);
  return readApiData<Empreiteiro>(res);
}

export async function fetchMeasurements(id: string): Promise<DailyMeasurement[]> {
  const res = await api.get(`/api/empreiteiros/${id}/daily-measurements`);
  const data = await readApiData<DailyMeasurement[]>(res);
  return Array.isArray(data) ? data : [];
}

export async function createMeasurement(
  id: string,
  payload: {
    workDate: string;
    empreiteiroContractId: string;
    contractId: string;
    description: string;
    confirmedBy: string | null;
    workerIds: string[];
    photos: GeoPhoto[];
    teamPhoto: GeoPhoto;
  }
): Promise<void> {
  const semPreview = ({ previewUri: _previewUri, ...foto }: GeoPhoto) => foto;
  const res = await api.post(`/api/empreiteiros/${id}/daily-measurements`, {
    ...payload,
    photos: payload.photos.map(semPreview),
    teamPhoto: semPreview(payload.teamPhoto),
    quantity: null,
    unit: null,
  });
  await readApiData<unknown>(res);
}

export async function saveServiceTeam(
  empreiteiroId: string,
  linkId: string,
  team: Array<{ name: string; role: string; phone: string; document: string; photo: string | null }>
): Promise<void> {
  const res = await api.patch(`/api/empreiteiros/${empreiteiroId}/contracts/${linkId}/team`, { team });
  await readApiData<unknown>(res);
}

export function formatMoney(value?: number | null): string {
  const n = Number(value ?? 0);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatDateBr(iso?: string | null): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}

export function maskCnpj(raw?: string | null): string {
  const d = String(raw ?? '').replace(/\D/g, '');
  if (d.length !== 14) return raw ? String(raw) : '—';
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export function maskPhone(raw?: string | null): string {
  const d = String(raw ?? '').replace(/\D/g, '').slice(0, 11);
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function maskCpf(raw?: string | null): string {
  const d = String(raw ?? '').replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

const STATUS_SERVICO: Record<string, { label: string; tone: 'info' | 'ok' | 'warn' | 'bad' | 'neutral' }> = {
  NOT_STARTED: { label: 'Não iniciado', tone: 'neutral' },
  IN_PROGRESS: { label: 'Em andamento', tone: 'info' },
  COMPLETED: { label: 'Concluído', tone: 'ok' },
  CANCELLED: { label: 'Cancelado', tone: 'bad' },
  OVERDUE: { label: 'Em atraso', tone: 'warn' },
};

export function statusServico(status?: string | null) {
  return STATUS_SERVICO[String(status ?? '').toUpperCase()] ?? { label: 'Em andamento', tone: 'info' as const };
}

const STATUS_MEDICAO: Record<string, { label: string; tone: 'info' | 'ok' | 'warn' | 'bad' | 'neutral' }> = {
  SUBMITTED: { label: 'Aguardando aprovação', tone: 'warn' },
  APPROVED: { label: 'Aprovada', tone: 'ok' },
  CORRECTION: { label: 'Devolvida', tone: 'bad' },
};

export function statusMedicao(status?: string | null) {
  return STATUS_MEDICAO[String(status ?? '').toUpperCase()] ?? STATUS_MEDICAO.SUBMITTED;
}
