import api from './api';
import { uploadMultipartFile } from '../utils/uploadMultipartFile';

/**
 * Diário de Obra (RDO) no app: mesmas regras e mesmos campos do site. Um registro por obra por dia;
 * enquanto não for finalizado, ele pode ser editado (o app salva sozinho).
 */

export type Sky = 'SUN' | 'PARTLY' | 'RAIN' | null;
export type Period = { sky: Sky; practicable: boolean | null };
export type Photo = { url: string; key: string; name: string };
export type Row = { id: string } & Record<string, any>;

export type Rdo = {
  noActivity: boolean;
  noActivityReason: string;
  noActivityNote: string;
  weather: { morning: Period; afternoon: Period };
  activities: Row[];
  laborDirect: Row[];
  laborIndirect: Row[];
  equipment: Row[];
  materials: Row[];
  occurrences: Row[];
  notes: Row[];
};

export type SectionKey =
  | 'activities'
  | 'laborDirect'
  | 'laborIndirect'
  | 'equipment'
  | 'materials'
  | 'occurrences'
  | 'notes';

export type Field = {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'time' | 'select';
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  required?: boolean;
  /** Ocupa metade da linha (dois campos lado a lado). */
  half?: boolean;
  defaultValue?: string;
};

export type SectionConfig = {
  title: string;
  subtitle: string;
  sheetTitle: string;
  editTitle: string;
  addLabel: string;
  emptyLabel: string;
  fields: Field[];
  rowTitle: (r: Row) => string;
  rowDetail: (r: Row) => string;
};

export type RdoListItem = {
  id: string;
  date: string;
  obraId: string;
  obraName: string;
  contratoId: string;
  contratoName: string;
  contratoNumber: string;
  noActivity: boolean;
  noActivityReason: string | null;
  finalizedAt: string | null;
  activities: number;
  workers: number;
  occurrences: number;
  updatedAt: string;
  updatedByName: string;
};

export type ObraOption = {
  id: string;
  name: string;
  contratoId: string;
  contratoNome?: string;
  contrato?: { name?: string; number?: string } | null;
  isActive?: boolean;
};

// ── Constantes e textos ─────────────────────────────────────────────────────────

export const NO_ACTIVITY_REASONS: Array<{ group: string; options: string[] }> = [
  { group: 'Clima', options: ['Chuva', 'Solo encharcado após chuva', 'Vento forte'] },
  {
    group: 'Equipe',
    options: ['Equipe não compareceu', 'Empreiteiro não compareceu', 'Greve ou paralisação dos trabalhadores'],
  },
  {
    group: 'Material e equipamento',
    options: ['Falta de material', 'Atraso de entrega', 'Equipamento quebrado ou indisponível'],
  },
  { group: 'Concessionária', options: ['Falta de energia', 'Falta de água'] },
  {
    group: 'Contratante',
    options: [
      'Aguardando liberação ou definição',
      'Aguardando projeto',
      'Paralisação pelo contratante',
      'Sem acesso ao local',
    ],
  },
  { group: 'Órgão público', options: ['Embargo ou interdição'] },
  { group: 'Segurança', options: ['Acidente', 'Condição insegura'] },
  { group: 'Calendário', options: ['Domingo', 'Feriado', 'Recesso ou férias coletivas', 'Ponto facultativo'] },
];

/** Os motivos escolhidos ficam juntos no mesmo campo, separados por "; ". */
export const REASON_SEP = '; ';
export const splitReasons = (v: string) =>
  (v || '')
    .split(REASON_SEP)
    .map((x) => x.trim())
    .filter(Boolean);

export const SEVERITY_LABEL: Record<string, string> = { LOW: 'Baixa', MEDIUM: 'Média', HIGH: 'Alta' };
export const UNITS = ['un', 'kg', 'saco', 'm', 'm²', 'm³', 'L', 'caixa', 'barra', 'peça', 'lata', 'rolo'];

export const fmtNum = (v: unknown) => (v === null || v === undefined || v === '' ? '' : String(v).replace('.', ','));
const join = (...parts: Array<string | null | undefined | false>) => parts.filter(Boolean).join(' · ');
const interval = (r: Row) => (r.start || r.end ? `${r.start || '--:--'} às ${r.end || '--:--'}` : '');
const qty = (r: Row) => (r.quantity ? `× ${fmtNum(r.quantity)}` : '');

const laborFields: Field[] = [
  { key: 'role', label: 'Função', type: 'text', placeholder: 'Ex.: Pedreiro', required: true },
  { key: 'quantity', label: 'Quantidade', type: 'number', half: true, defaultValue: '1' },
  { key: 'hours', label: 'Horas trabalhadas', type: 'number', half: true, placeholder: 'Opcional' },
  { key: 'notes', label: 'Observações', type: 'textarea', placeholder: 'Opcional' },
];

export const SECTIONS: Record<SectionKey, SectionConfig> = {
  activities: {
    title: 'Atividades',
    subtitle: 'O que foi executado no dia',
    sheetTitle: 'Nova atividade',
    editTitle: 'Editar atividade',
    addLabel: 'Adicionar atividade',
    emptyLabel: 'Nenhuma atividade registrada.',
    fields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Ex.: Concretagem do pilar P3', required: true },
      { key: 'description', label: 'Descrição', type: 'textarea', placeholder: 'Detalhes da atividade executada' },
      { key: 'start', label: 'Início', type: 'time', half: true },
      { key: 'end', label: 'Fim', type: 'time', half: true },
    ],
    rowTitle: (r) => String(r.title ?? ''),
    rowDetail: (r) => join(interval(r), String(r.description ?? '')),
  },
  laborDirect: {
    title: 'Mão de obra direta',
    subtitle: 'Quem executou o serviço',
    sheetTitle: 'Adicionar função (direta)',
    editTitle: 'Editar função (direta)',
    addLabel: 'Adicionar função',
    emptyLabel: 'Nenhuma função lançada.',
    fields: laborFields,
    rowTitle: (r) => join(String(r.role ?? ''), qty(r)),
    rowDetail: (r) => join(r.hours ? `${fmtNum(r.hours)} h` : '', String(r.notes ?? '')),
  },
  laborIndirect: {
    title: 'Mão de obra indireta',
    subtitle: 'Gestão e apoio da obra',
    sheetTitle: 'Adicionar função (indireta)',
    editTitle: 'Editar função (indireta)',
    addLabel: 'Adicionar função',
    emptyLabel: 'Nenhuma função lançada.',
    fields: [
      { ...laborFields[0], placeholder: 'Ex.: Engenheiro, Mestre de obras' },
      ...laborFields.slice(1),
    ],
    rowTitle: (r) => join(String(r.role ?? ''), qty(r)),
    rowDetail: (r) => join(r.hours ? `${fmtNum(r.hours)} h` : '', String(r.notes ?? '')),
  },
  equipment: {
    title: 'Equipamentos',
    subtitle: 'Máquinas e ferramentas usadas',
    sheetTitle: 'Adicionar equipamento',
    editTitle: 'Editar equipamento',
    addLabel: 'Adicionar equipamento',
    emptyLabel: 'Nenhum equipamento lançado.',
    fields: [
      { key: 'name', label: 'Equipamento', type: 'text', placeholder: 'Ex.: Betoneira', required: true },
      { key: 'quantity', label: 'Quantidade', type: 'number', half: true, defaultValue: '1' },
      { key: 'hours', label: 'Horas trabalhadas', type: 'number', half: true, placeholder: 'Opcional' },
      { key: 'notes', label: 'Observações', type: 'textarea', placeholder: 'Opcional' },
    ],
    rowTitle: (r) => join(String(r.name ?? ''), qty(r)),
    rowDetail: (r) => join(r.hours ? `${fmtNum(r.hours)} h` : '', String(r.notes ?? '')),
  },
  materials: {
    title: 'Materiais recebidos',
    subtitle: 'O que chegou na obra',
    sheetTitle: 'Adicionar recebimento',
    editTitle: 'Editar recebimento',
    addLabel: 'Adicionar recebimento',
    emptyLabel: 'Nenhum material recebido neste dia.',
    fields: [
      { key: 'name', label: 'Material', type: 'text', placeholder: 'Ex.: Cimento CP-II', required: true },
      { key: 'quantity', label: 'Quantidade', type: 'number', half: true, required: true, defaultValue: '1' },
      {
        key: 'unit',
        label: 'Unidade',
        type: 'select',
        defaultValue: 'un',
        options: UNITS.map((u) => ({ value: u, label: u })),
      },
      { key: 'notes', label: 'Observações', type: 'textarea', placeholder: 'Opcional' },
    ],
    rowTitle: (r) => String(r.name ?? ''),
    rowDetail: (r) => join([fmtNum(r.quantity), String(r.unit ?? '')].filter(Boolean).join(' '), String(r.notes ?? '')),
  },
  occurrences: {
    title: 'Ocorrências',
    subtitle: 'Problemas e imprevistos',
    sheetTitle: 'Nova ocorrência',
    editTitle: 'Editar ocorrência',
    addLabel: 'Adicionar ocorrência',
    emptyLabel: 'Nenhuma ocorrência registrada.',
    fields: [
      {
        key: 'description',
        label: 'Descrição',
        type: 'textarea',
        placeholder: 'Ex.: Atraso na entrega de concreto',
        required: true,
      },
      {
        key: 'severity',
        label: 'Severidade',
        type: 'select',
        defaultValue: 'LOW',
        options: Object.entries(SEVERITY_LABEL).map(([value, label]) => ({ value, label })),
      },
      { key: 'start', label: 'Início', type: 'time', half: true },
      { key: 'end', label: 'Fim', type: 'time', half: true },
      { key: 'actions', label: 'Ações tomadas', type: 'textarea', placeholder: 'Opcional' },
    ],
    rowTitle: (r) => String(r.description ?? ''),
    rowDetail: (r) =>
      join(`Severidade ${SEVERITY_LABEL[String(r.severity)] ?? 'Baixa'}`, interval(r), String(r.actions ?? '')),
  },
  notes: {
    title: 'Observações',
    subtitle: 'Anotações gerais do dia',
    sheetTitle: 'Nova observação',
    editTitle: 'Editar observação',
    addLabel: 'Adicionar observação',
    emptyLabel: 'Nenhuma observação registrada.',
    fields: [
      {
        key: 'text',
        label: 'Observação',
        type: 'textarea',
        placeholder: 'Ex.: Visita do proprietário às 14h, acompanhada pelo engenheiro',
        required: true,
      },
    ],
    rowTitle: (r) => String(r.text ?? ''),
    rowDetail: () => '',
  },
};

export const SECTION_ORDER: SectionKey[] = [
  'activities',
  'laborDirect',
  'laborIndirect',
  'equipment',
  'materials',
  'occurrences',
  'notes',
];

// ── Datas ────────────────────────────────────────────────────────────────────────

export const WEEKDAY_FULL = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
];
export const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const MONTH_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const pad = (n: number) => String(n).padStart(2, '0');
export const toIso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayIso = () => toIso(new Date());
export const parseIso = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
export const brDate = (iso: string) => {
  const d = parseIso(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};
export const shiftIso = (iso: string, days: number) => {
  const d = parseIso(iso);
  d.setDate(d.getDate() + days);
  return toIso(d);
};

// ── Conversão API <-> formulário ─────────────────────────────────────────────────

const emptyPeriod = (): Period => ({ sky: null, practicable: null });
export const emptyRdo = (): Rdo => ({
  noActivity: false,
  noActivityReason: '',
  noActivityNote: '',
  weather: { morning: emptyPeriod(), afternoon: emptyPeriod() },
  activities: [],
  laborDirect: [],
  laborIndirect: [],
  equipment: [],
  materials: [],
  occurrences: [],
  notes: [],
});

export const newId = () => Math.random().toString(36).slice(2, 10);

export function fromApi(row: any): Rdo {
  const base = emptyRdo();
  if (!row) return base;
  const c = row.content ?? {};
  const withId = (list: any): Row[] =>
    (Array.isArray(list) ? list : []).map((r: any) => ({ ...r, id: r.id || newId() }));
  return {
    noActivity: !!row.noActivity,
    noActivityReason: row.noActivityReason ?? '',
    noActivityNote: String(c.noActivityNote ?? ''),
    weather: {
      morning: { ...emptyPeriod(), ...(c.weather?.morning ?? {}) },
      afternoon: { ...emptyPeriod(), ...(c.weather?.afternoon ?? {}) },
    },
    activities: withId(c.activities),
    laborDirect: withId(c.labor?.direct),
    laborIndirect: withId(c.labor?.indirect),
    equipment: withId(c.equipment),
    materials: withId(c.materials).map((m) => (m.unit === 'unidade' ? { ...m, unit: 'un' } : m)),
    occurrences: withId(c.occurrences),
    notes: withId(c.notes),
  };
}

export function toApi(r: Rdo) {
  return {
    noActivity: r.noActivity,
    noActivityReason: r.noActivityReason,
    noActivityNote: r.noActivityNote,
    weather: r.weather,
    activities: r.activities,
    labor: { direct: r.laborDirect, indirect: r.laborIndirect },
    equipment: r.equipment,
    materials: r.materials,
    occurrences: r.occurrences,
    notes: r.notes,
  };
}

// ── Chamadas à API ───────────────────────────────────────────────────────────────

async function readJson(res: Response) {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.message || json?.error || 'Erro na requisição');
  return json;
}

export async function fetchRdoList(params: {
  page: number;
  search?: string;
  limit?: number;
  from?: string;
  to?: string;
  contratoId?: string;
  obraId?: string;
}) {
  const q = new URLSearchParams({ page: String(params.page), limit: String(params.limit ?? 50) });
  if (params.search?.trim()) q.set('search', params.search.trim());
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  if (params.contratoId) q.set('contratoId', params.contratoId);
  if (params.obraId) q.set('obraId', params.obraId);
  const json = await readJson(await api.get(`/api/diario-obra?${q.toString()}`));
  return {
    items: (json?.data ?? []) as RdoListItem[],
    totalPages: Number(json?.pagination?.totalPages ?? 1),
    total: Number(json?.pagination?.total ?? 0),
  };
}

export async function fetchObras(): Promise<ObraOption[]> {
  const json = await readJson(await api.get('/api/obras?limit=500&isActive=true'));
  return ((json?.data ?? []) as ObraOption[]).filter((o) => o.isActive !== false);
}

export async function fetchRdo(obraId: string, date: string) {
  const json = await readJson(await api.get(`/api/diario-obra/${obraId}/${date}`));
  return (json?.data ?? null) as any;
}

export async function saveRdo(obraId: string, date: string, rdo: Rdo) {
  await readJson(await api.put(`/api/diario-obra/${obraId}/${date}`, toApi(rdo)));
}

export async function finalizeRdo(obraId: string, date: string): Promise<string> {
  const json = await readJson(await api.post(`/api/diario-obra/${obraId}/${date}/finalize`));
  return (json?.data?.finalizedAt as string) ?? new Date().toISOString();
}

export async function reopenRdo(obraId: string, date: string) {
  await readJson(await api.post(`/api/diario-obra/${obraId}/${date}/reopen`));
}

export async function deleteRdo(obraId: string, date: string) {
  await readJson(await api.delete(`/api/diario-obra/${obraId}/${date}`));
}

export async function uploadRdoPhoto(
  obraId: string,
  date: string,
  file: { uri: string; name: string; type: string },
): Promise<Photo> {
  const data = await uploadMultipartFile<{ url: string; key?: string; name?: string }>({
    path: `/api/diario-obra/${obraId}/${date}/photos`,
    fieldName: 'file',
    file,
  });
  return { url: data.url, key: data.key ?? '', name: data.name || file.name };
}

export async function deleteRdoPhoto(obraId: string, date: string, key: string) {
  await api.delete(`/api/diario-obra/${obraId}/${date}/photos`, { body: JSON.stringify({ key }) });
}
