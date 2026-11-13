'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  CalendarDays,
  Check,
  Download,
  X,
  ChevronLeft,
  ChevronRight,
  CloudRain,
  CloudSun,
  Package,
  Pencil,
  Plus,
  StickyNote,
  Sun,
  Sunrise,
  Sunset,
  TriangleAlert,
  Trash2,
  Users,
  User,
  Wrench,
  ListChecks,
  type LucideIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Loading } from '@/components/ui/Loading';
import { Modal } from '@/components/ui/Modal';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { TimePickerField } from '@/components/ui/TimePickerField';
import { labeledToSelectOptions } from '@/lib/selectOptionBuilders';
import { PageStack } from '@/components/ui/pageLayout';
import { RowActionMenuCell, RowActionMenuPortal, cadastroListClasses } from '@/components/ui/RowActionMenu';
import { getListTableRowClassName } from '@/components/ui/listTableUi';
import { useRowActionMenu } from '@/hooks/useRowActionMenu';
import { CadastroListEmpty } from '@/components/ui/CadastroListSummary';
import { useBreadcrumbEntity } from '@/hooks/useBreadcrumbEntity';
import { FileDropZone } from '@/components/ui/FileDropZone';
import { FilePreviewCard } from '@/components/ui/FilePreviewCard';
import { exportDiarioObraPdf } from './diarioObraPdf';

// ---------------------------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------------------------

type Sky = 'SUN' | 'PARTLY' | 'RAIN' | null;
type Period = { sky: Sky; practicable: boolean | null };
type Photo = { url: string; key: string; name: string };
type Row = Record<string, string | number | null | Photo[]> & { id: string };

type Rdo = {
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

type SectionKey =
  | 'activities'
  | 'laborDirect'
  | 'laborIndirect'
  | 'equipment'
  | 'materials'
  | 'occurrences'
  | 'notes';

type Field = {
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

type SectionConfig = {
  modalTitle: string;
  addLabel: string;
  emptyLabel: string;
  fields: Field[];
  title: (r: Row) => string;
  detail: (r: Row) => string;
};

const emptyPeriod = (): Period => ({ sky: null, practicable: null });
const emptyRdo = (): Rdo => ({
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

const NO_ACTIVITY_REASONS: Array<{ group: string; options: string[] }> = [
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
const REASON_SEP = '; ';
const splitReasons = (v: string) =>
  v
    .split(REASON_SEP)
    .map((x) => x.trim())
    .filter(Boolean);

const SEVERITY_LABEL: Record<string, string> = { LOW: 'Baixa', MEDIUM: 'Média', HIGH: 'Alta' };
const UNITS = ['un', 'kg', 'saco', 'm', 'm²', 'm³', 'L', 'caixa', 'barra', 'peça', 'lata', 'rolo'];

const interval = (r: Row) => (r.start || r.end ? `${r.start || '--:--'} às ${r.end || '--:--'}` : '');
const join = (...parts: Array<string | null | undefined | false>) => parts.filter(Boolean).join(' · ');
const fmtNum = (v: unknown) => (v === null || v === undefined || v === '' ? '' : String(v).replace('.', ','));

const SECTIONS: Record<SectionKey, SectionConfig> = {
  activities: {
    modalTitle: 'Nova atividade',
    addLabel: 'Adicionar atividade',
    emptyLabel: 'Nenhuma atividade registrada. Adicione a primeira abaixo.',
    fields: [
      { key: 'title', label: 'Título', type: 'text', placeholder: 'Ex.: Concretagem do pilar P3', required: true },
      { key: 'description', label: 'Descrição', type: 'textarea', placeholder: 'Detalhes da atividade executada' },
      { key: 'start', label: 'Início', type: 'time', half: true },
      { key: 'end', label: 'Fim', type: 'time', half: true },
    ],
    title: (r) => String(r.title ?? ''),
    detail: (r) => join(interval(r), String(r.description ?? '')),
  },
  laborDirect: {
    modalTitle: 'Adicionar função (direta)',
    addLabel: 'Adicionar função',
    emptyLabel: 'Nenhuma função lançada.',
    fields: [
      { key: 'role', label: 'Função', type: 'text', placeholder: 'Ex.: Pedreiro', required: true },
      { key: 'quantity', label: 'Quantidade', type: 'number', half: true, defaultValue: '1' },
      { key: 'hours', label: 'Horas trabalhadas', type: 'number', half: true, placeholder: 'Opcional' },
      { key: 'notes', label: 'Observações', type: 'textarea', placeholder: 'Opcional' },
    ],
    title: (r) => join(String(r.role ?? ''), r.quantity ? `× ${fmtNum(r.quantity)}` : ''),
    detail: (r) => join(r.hours ? `${fmtNum(r.hours)} h` : '', String(r.notes ?? '')),
  },
  laborIndirect: {
    modalTitle: 'Adicionar função (indireta)',
    addLabel: 'Adicionar função',
    emptyLabel: 'Nenhuma função lançada.',
    fields: [
      { key: 'role', label: 'Função', type: 'text', placeholder: 'Ex.: Engenheiro, Mestre de obras', required: true },
      { key: 'quantity', label: 'Quantidade', type: 'number', half: true, defaultValue: '1' },
      { key: 'hours', label: 'Horas trabalhadas', type: 'number', half: true, placeholder: 'Opcional' },
      { key: 'notes', label: 'Observações', type: 'textarea', placeholder: 'Opcional' },
    ],
    title: (r) => join(String(r.role ?? ''), r.quantity ? `× ${fmtNum(r.quantity)}` : ''),
    detail: (r) => join(r.hours ? `${fmtNum(r.hours)} h` : '', String(r.notes ?? '')),
  },
  equipment: {
    modalTitle: 'Adicionar equipamento',
    addLabel: 'Adicionar equipamento',
    emptyLabel: 'Nenhum equipamento lançado.',
    fields: [
      { key: 'name', label: 'Equipamento', type: 'text', placeholder: 'Ex.: Betoneira', required: true },
      { key: 'quantity', label: 'Quantidade', type: 'number', half: true, defaultValue: '1' },
      { key: 'hours', label: 'Horas trabalhadas', type: 'number', half: true, placeholder: 'Opcional' },
      { key: 'notes', label: 'Observações', type: 'textarea', placeholder: 'Opcional' },
    ],
    title: (r) => join(String(r.name ?? ''), r.quantity ? `× ${fmtNum(r.quantity)}` : ''),
    detail: (r) => join(r.hours ? `${fmtNum(r.hours)} h` : '', String(r.notes ?? '')),
  },
  materials: {
    modalTitle: 'Adicionar recebimento',
    addLabel: 'Adicionar recebimento',
    emptyLabel: 'Nenhum material recebido neste dia.',
    fields: [
      { key: 'name', label: 'Material', type: 'text', placeholder: 'Ex.: Cimento CP-II', required: true },
      { key: 'quantity', label: 'Quantidade', type: 'number', half: true, required: true, defaultValue: '1' },
      {
        key: 'unit',
        label: 'Unidade',
        type: 'select',
        half: true,
        defaultValue: 'un',
        options: UNITS.map((u) => ({ value: u, label: u })),
      },
      { key: 'notes', label: 'Observações', type: 'textarea', placeholder: 'Opcional' },
    ],
    title: (r) => String(r.name ?? ''),
    detail: (r) => join(join(fmtNum(r.quantity), String(r.unit ?? '')).replace(' · ', ' '), String(r.notes ?? '')),
  },
  occurrences: {
    modalTitle: 'Nova ocorrência',
    addLabel: 'Adicionar ocorrência',
    emptyLabel: 'Nenhuma ocorrência registrada.',
    fields: [
      { key: 'description', label: 'Descrição', type: 'textarea', placeholder: 'Ex.: Atraso na entrega de concreto', required: true },
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
    title: (r) => String(r.description ?? ''),
    detail: (r) =>
      join(`Severidade ${SEVERITY_LABEL[String(r.severity)] ?? 'Baixa'}`, interval(r), String(r.actions ?? '')),
  },
  notes: {
    modalTitle: 'Nova observação',
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
    title: (r) => String(r.text ?? ''),
    detail: () => '',
  },
};

// ---------------------------------------------------------------------------------------------
// Datas
// ---------------------------------------------------------------------------------------------

const WEEKDAY_LETTER = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const WEEKDAY_FULL = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const pad = (n: number) => String(n).padStart(2, '0');
const toIso = (y: number, m0: number, d: number) => `${y}-${pad(m0 + 1)}-${pad(d)}`;
const parseIso = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m0: m - 1, d };
};
const todayIso = () => {
  const n = new Date();
  return toIso(n.getFullYear(), n.getMonth(), n.getDate());
};
const brDate = (iso: string) => {
  const { y, m0, d } = parseIso(iso);
  return `${pad(d)}/${pad(m0 + 1)}/${y}`;
};

// ---------------------------------------------------------------------------------------------
// Conversão API <-> formulário
// ---------------------------------------------------------------------------------------------

const newId = () => Math.random().toString(36).slice(2, 10);

function fromApi(row: any): Rdo {
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

function toApi(r: Rdo) {
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

// ---------------------------------------------------------------------------------------------
// Peças de interface
// ---------------------------------------------------------------------------------------------

const inputCls = 'input w-full';
const textareaCls =
  'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder:text-gray-500';

function SectionCard({
  Icon,
  title,
  subtitle,
  action,
  children,
  className,
}: {
  Icon: LucideIcon;
  title: string;
  subtitle?: string;
  /** Conteúdo à direita do cabeçalho (ex.: botões). */
  action?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={`${cadastroListClasses.card} ${className ?? ''}`}>
      <CardHeader className={children ? cadastroListClasses.cardHeader : 'border-b-0 !pb-6'}>
        <div className={cadastroListClasses.cardHeaderRow}>
          <div className={cadastroListClasses.cardHeaderIconRow}>
            <div className="rounded-lg bg-red-100 p-2 sm:p-3 dark:bg-red-900/30">
              <Icon className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
            </div>
            <div className="min-w-0">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">{title}</h3>
              {subtitle ? <p className="text-sm text-gray-600 dark:text-gray-400">{subtitle}</p> : null}
            </div>
          </div>
          {action}
        </div>
      </CardHeader>
      {children ? <CardContent className={cadastroListClasses.cardContent}>{children}</CardContent> : null}
    </Card>
  );
}

type TableColumn = {
  label: string;
  render: (r: Row) => React.ReactNode;
  center?: boolean;
};

const text = (v: unknown) => (v === null || v === undefined ? '' : String(v));
const dash = (v: unknown) => text(v).trim() || '—';

/** Colunas de cada lista (a atividade tem cartão próprio, por causa das fotos). */
const TABLE_COLUMNS: Record<Exclude<SectionKey, 'activities'>, TableColumn[]> = {
  laborDirect: [
    { label: 'Função', render: (r) => dash(r.role) },
    { label: 'Quantidade', render: (r) => dash(fmtNum(r.quantity)), center: true },
    { label: 'Horas', render: (r) => dash(fmtNum(r.hours)), center: true },
    { label: 'Observações', render: (r) => dash(r.notes) },
  ],
  laborIndirect: [
    { label: 'Função', render: (r) => dash(r.role) },
    { label: 'Quantidade', render: (r) => dash(fmtNum(r.quantity)), center: true },
    { label: 'Horas', render: (r) => dash(fmtNum(r.hours)), center: true },
    { label: 'Observações', render: (r) => dash(r.notes) },
  ],
  equipment: [
    { label: 'Equipamento', render: (r) => dash(r.name) },
    { label: 'Quantidade', render: (r) => dash(fmtNum(r.quantity)), center: true },
    { label: 'Horas', render: (r) => dash(fmtNum(r.hours)), center: true },
    { label: 'Observações', render: (r) => dash(r.notes) },
  ],
  materials: [
    { label: 'Material', render: (r) => dash(r.name) },
    { label: 'Quantidade', render: (r) => dash(fmtNum(r.quantity)), center: true },
    { label: 'Unidade', render: (r) => dash(r.unit), center: true },
    { label: 'Observações', render: (r) => dash(r.notes) },
  ],
  occurrences: [
    { label: 'Descrição', render: (r) => dash(r.description) },
    { label: 'Severidade', render: (r) => SEVERITY_LABEL[text(r.severity)] ?? 'Baixa', center: true },
    { label: 'Horário', render: (r) => dash(interval(r)), center: true },
    { label: 'Ações Tomadas', render: (r) => dash(r.actions) },
  ],
  notes: [{ label: 'Observação', render: (r) => dash(r.text) }],
};

/** Lista no formato padrão do sistema: cabeçalho de colunas e coluna Ação com o menu de três pontos. */
function SectionTable({
  section,
  rows,
  locked,
  onEdit,
  onRemove,
}: {
  section: Exclude<SectionKey, 'activities'>;
  rows: Row[];
  locked: boolean;
  onEdit: (r: Row) => void;
  onRemove: (r: Row) => void;
}) {
  const columns = TABLE_COLUMNS[section];
  const { rowActionMenu, rowForActionMenu, toggleRowActionMenu, closeRowActionMenu, isRowMenuOpen } =
    useRowActionMenu(rows);
  return (
    <>
      <div className="table-scroll">
        <table className={cadastroListClasses.table}>
          <thead className="border-b border-gray-200 dark:border-gray-700">
            <tr>
              {columns.map((c) => (
                <th key={c.label} className={`${cadastroListClasses.th}${c.center ? ' !text-center' : ''}`}>
                  {c.label}
                </th>
              ))}
              {locked ? null : <th className={cadastroListClasses.thRight}>Ação</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-800">
            {rows.map((row) => (
              <tr key={row.id} className={getListTableRowClassName(false)}>
                {columns.map((c, i) => (
                  <td
                    key={c.label}
                    className={`px-3 py-4 text-sm sm:px-6 ${
                      i === 0 ? 'font-medium text-gray-900 dark:text-gray-100' : 'text-gray-700 dark:text-gray-300'
                    } ${c.center ? 'whitespace-nowrap text-center' : 'whitespace-pre-wrap break-words'}`}
                  >
                    {c.render(row)}
                  </td>
                ))}
                {locked ? null : (
                  <RowActionMenuCell
                    isOpen={isRowMenuOpen(row.id)}
                    onToggle={(e) => toggleRowActionMenu(row.id, e.currentTarget as HTMLButtonElement)}
                  />
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rowActionMenu && rowForActionMenu ? (
        <RowActionMenuPortal
          menu={rowActionMenu}
          onClose={closeRowActionMenu}
          onEdit={() => onEdit(rowForActionMenu)}
          onDelete={() => onRemove(rowForActionMenu)}
        />
      ) : null}
    </>
  );
}

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** Atividades do dia: cabeçalho padrão (ícone, título e horário), descrição e fotos. */
function ActivityCards({
  rows,
  locked,
  uploadingId,
  onEdit,
  onRemove,
  onAddPhotos,
  onRemovePhoto,
}: {
  rows: Row[];
  locked: boolean;
  uploadingId: string | null;
  onEdit: (r: Row) => void;
  onRemove: (r: Row) => void;
  onAddPhotos: (r: Row, files: File[]) => void;
  onRemovePhoto: (r: Row, p: Photo) => void;
}) {
  return (
    <ul className="space-y-4">
      {rows.map((r, i) => {
        const photos = (Array.isArray(r.photos) ? r.photos : []) as Photo[];
        const start = String(r.start ?? '');
        const end = String(r.end ?? '');
        const description = String(r.description ?? '');
        return (
          <li
            key={r.id}
            className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800 sm:p-5"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-100 text-base font-bold text-red-600 dark:bg-red-900/30 dark:text-red-400">
                {i + 1}
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="break-words text-base font-semibold text-gray-900 dark:text-gray-100">
                  {String(r.title ?? '') || '—'}
                </h4>
                {start || end ? (
                  <p className="mt-0.5 text-sm tabular-nums text-gray-600 dark:text-gray-400">
                    {start || '--:--'} às {end || '--:--'}
                  </p>
                ) : null}
              </div>
              {locked ? null : (
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => onEdit(r)}
                    className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-gray-100 dark:hover:bg-gray-700"
                    aria-label="Editar"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(r)}
                    className="rounded-lg p-1.5 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                    aria-label="Remover"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>

            {description ? (
              <p className="mt-3 whitespace-pre-wrap break-words text-sm text-gray-700 dark:text-gray-300">
                {description}
              </p>
            ) : null}

            {photos.length > 0 ? (
              <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                {photos.map((ph) => (
                  <FilePreviewCard
                    key={ph.key || ph.url}
                    file={{ originalName: ph.name || 'Foto', fileUrl: ph.url, mimeType: 'image/jpeg' }}
                    onRemove={locked ? undefined : () => onRemovePhoto(r, ph)}
                  />
                ))}
              </div>
            ) : null}

            {locked ? null : (
              <FileDropZone
                className={photos.length > 0 ? 'mt-3 py-4' : 'mt-4 py-4'}
                label="Adicionar foto"
                hint="Clique ou arraste imagens (até 5 MB cada)"
                accept="image/*"
                multiple
                uploading={uploadingId === r.id}
                onFiles={(files) => onAddPhotos(r, files)}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function FieldsModal({
  config,
  initial,
  onClose,
  onSave,
}: {
  config: SectionConfig;
  initial: Row | null;
  onClose: () => void;
  onSave: (values: Record<string, string>) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const v: Record<string, string> = {};
    for (const f of config.fields) {
      const cur = initial?.[f.key];
      v[f.key] = cur !== undefined && cur !== null ? String(cur) : f.defaultValue ?? '';
    }
    return v;
  });
  const missing = config.fields.some((f) => f.required && !values[f.key]?.trim());

  const renderField = (f: Field, autoFocus: boolean) => {
    const value = values[f.key] ?? '';
    const set = (v: string) => setValues((st) => ({ ...st, [f.key]: v }));
    if (f.type === 'textarea') {
      return (
        <textarea
          value={value}
          rows={3}
          placeholder={f.placeholder}
          autoFocus={autoFocus}
          className={textareaCls}
          onChange={(e) => set(e.target.value)}
        />
      );
    }
    if (f.type === 'select') {
      return (
        <StringSingleSelectDropdown
          value={value}
          onChange={set}
          options={labeledToSelectOptions(f.options ?? [])}
          disableSearch
          matchTriggerWidth
        />
      );
    }
    if (f.type === 'time') {
      return <TimePickerField value={value} onChange={set} placeholder="--:--" allowEmpty stepMinutes={5} />;
    }
    return (
      <input
        type={f.type}
        value={value}
        placeholder={f.placeholder}
        autoFocus={autoFocus}
        className={inputCls}
        min={f.type === 'number' ? 0 : undefined}
        step={f.type === 'number' ? 'any' : undefined}
        onChange={(e) => set(e.target.value)}
      />
    );
  };

  const submit = () => {
    if (missing) {
      toast.error('Preencha os campos obrigatórios.');
      return;
    }
    onSave(values);
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={initial ? config.modalTitle.replace(/^Nova?o? |^Adicionar /, 'Editar ') : config.modalTitle}
      size="md"
      footer={
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={submit}
            className="rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700"
          >
            {initial ? 'Salvar' : 'Adicionar'}
          </button>
        </div>
      }
    >
      <div className="flex flex-wrap gap-x-3 gap-y-3">
        {config.fields.map((f, i) => (
          <label key={f.key} className={f.half ? 'w-[calc(50%-0.375rem)]' : 'w-full'}>
            <span className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
              {f.label}
              {f.required ? <span className="text-red-600 dark:text-red-400"> *</span> : null}
            </span>
            {renderField(f, i === 0)}
          </label>
        ))}
      </div>
    </Modal>
  );
}

function NoActivityModal({
  dateLabel,
  initialReason,
  initialNote,
  onClose,
  onConfirm,
}: {
  dateLabel: string;
  initialReason: string;
  initialNote: string;
  onClose: () => void;
  onConfirm: (reason: string, note: string) => void;
}) {
  const [reasons, setReasons] = useState<string[]>(() => splitReasons(initialReason));
  const [note, setNote] = useState(initialNote);

  const chip = (label: string) => {
    const active = reasons.includes(label);
    return (
      <button
        key={label}
        type="button"
        aria-pressed={active}
        onClick={() => setReasons((cur) => (active ? cur.filter((x) => x !== label) : [...cur, label]))}
        className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
          active
            ? 'border-red-300 bg-red-50 text-red-700 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300'
            : 'border-gray-300 bg-white text-gray-800 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={
        <span className="block">
          <span className="block">Sem atividade</span>
          <span className="block text-sm font-normal text-gray-500 dark:text-gray-400">RDO de {dateLabel}</span>
        </span>
      }
      size="2xl"
      footer={
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(reasons.join(REASON_SEP), note.trim())}
            disabled={reasons.length === 0}
            className="rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Confirmar
          </button>
        </div>
      }
    >
      <div className="space-y-5">
        <div>
          <p className="mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
            Motivo <span className="text-red-600 dark:text-red-400">*</span>
            <span className="ml-2 font-normal text-gray-500 dark:text-gray-400">Escolha um ou mais</span>
          </p>
          <div className="space-y-3">
            {NO_ACTIVITY_REASONS.map(({ group, options }) => (
              <div key={group} className="flex flex-col gap-2 sm:flex-row sm:gap-4">
                <span className="shrink-0 pt-1.5 text-sm text-gray-600 dark:text-gray-400 sm:w-40">{group}</span>
                <div className="flex flex-wrap gap-2">{options.map(chip)}</div>
              </div>
            ))}
            <div className="flex flex-col gap-2 border-t border-gray-200 pt-3 dark:border-gray-700 sm:flex-row sm:gap-4">
              <span className="hidden shrink-0 sm:block sm:w-40" />
              <div className="flex flex-wrap gap-2">{chip('Outro')}</div>
            </div>
          </div>
        </div>
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
            Nota
          </label>
          <textarea
            value={note}
            rows={3}
            placeholder="Detalhes sobre o motivo"
            onChange={(e) => setNote(e.target.value)}
            className={textareaCls}
          />
        </div>
      </div>
    </Modal>
  );
}

const SKY_OPTIONS: Array<{ value: Exclude<Sky, null>; Icon: LucideIcon; label: string }> = [
  { value: 'SUN', Icon: Sun, label: 'Ensolarado' },
  { value: 'PARTLY', Icon: CloudSun, label: 'Nublado' },
  { value: 'RAIN', Icon: CloudRain, label: 'Chuvoso' },
];

/**
 * Seletor em pílula (mesmo visual do SegmentedControl do sistema), com a pílula posicionada por porcentagem:
 * a folga da esquerda e da direita é sempre igual, sem arredondamento de pixels.
 */
function PillToggle<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  disabled = false,
}: {
  value: T | '';
  options: Array<{ value: T; label: React.ReactNode; title?: string; ariaLabel?: string }>;
  onChange: (next: T) => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  const n = options.length;
  const idx = options.findIndex((o) => o.value === value);
  return (
    <div role="group" aria-label={ariaLabel} className="rounded-lg bg-gray-100 p-1 dark:bg-gray-900">
      <div className="relative grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {idx >= 0 ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 rounded-md bg-white shadow-sm transition-[left] duration-300 ease-out dark:bg-gray-600"
            style={{ width: `${100 / n}%`, left: `${(idx * 100) / n}%` }}
          />
        ) : null}
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              title={o.title}
              aria-label={o.ariaLabel}
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onChange(o.value)}
              className={`relative z-10 inline-flex h-9 items-center justify-center rounded-md px-2.5 text-sm outline-none transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${
                active
                  ? 'font-medium text-red-600 dark:text-red-400'
                  : 'font-normal text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function WeatherPeriod({
  title,
  value,
  onChange,
  disabled = false,
}: {
  title: string;
  value: Period;
  onChange: (p: Period) => void;
  disabled?: boolean;
}) {
  const practicableValue = value.practicable === null ? '' : value.practicable ? 'yes' : 'no';
  return (
    <div className="min-w-0 space-y-4">
      <PillToggle
        ariaLabel={`${title}: clima`}
        value={value.sky ?? ''}
        disabled={disabled}
        onChange={(v) => onChange({ ...value, sky: v === value.sky ? null : v })}
        options={SKY_OPTIONS.map(({ value: v, Icon: SkyIcon, label }) => ({
          value: v,
          label: <SkyIcon className="h-5 w-5" aria-hidden />,
          title: label,
          ariaLabel: `${title}: ${label}`,
        }))}
      />
      <PillToggle
        ariaLabel={`${title}: condição de trabalho`}
        value={practicableValue}
        disabled={disabled}
        onChange={(v) => onChange({ ...value, practicable: v === practicableValue ? null : v === 'yes' })}
        options={[
          { value: 'yes', label: 'Praticável' },
          { value: 'no', label: 'Impraticável' },
        ]}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Página
// ---------------------------------------------------------------------------------------------

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

/** Editor do RDO. Dentro de uma obra de contrato (`contractId`), os links e o breadcrumb seguem o caminho do contrato. */
export function DiarioObraEditor({
  obraId,
  date,
  contractId,
}: {
  obraId: string;
  date: string;
  contractId?: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const today = todayIso();
  const rawDate = date;
  const selected = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : today;
  const [monthRef, setMonthRef] = useState(() => {
    const t = parseIso(selected);
    return { y: t.y, m0: t.m0 };
  });
  const [rdo, setRdo] = useState<Rdo>(emptyRdo);
  const [loadedKey, setLoadedKey] = useState('');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [modal, setModal] = useState<{ section: SectionKey; row: Row | null } | null>(null);
  const [noActivityOpen, setNoActivityOpen] = useState(false);
  const [finalizedAt, setFinalizedAt] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | 'delete' | 'finalize' | 'reopen'>(null);
  const [busy, setBusy] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const dirtyRef = useRef(false);
  const locked = !!finalizedAt;

  const handleLogout = () => {
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    router.push('/auth/login');
  };

  const { data: userData, isLoading: loadingUser } = useQuery({
    queryKey: ['user'],
    queryFn: async () => (await api.get('/auth/me')).data,
  });

  const { data: obraData, isLoading: loadingObra } = useQuery({
    queryKey: ['diario-obra-obra', obraId],
    enabled: !!obraId,
    queryFn: async () => (await api.get(`/obras/${obraId}`)).data?.data ?? null,
  });
  const obra: {
    name?: string;
    contratoId?: string;
    contratoNome?: string;
    contrato?: { name?: string; number?: string } | null;
  } | null =
    obraData ?? null;
  // Caminhos: dentro do contrato quando aberto pela obra; senão, pela rota geral do Diário de Obra.
  const diarioBase = contractId ? `/ponto/contratos/${contractId}/obras/${obraId}/diario` : `/ponto/diario-obra/${obraId}`;
  const obraContractId = contractId || obra?.contratoId || '';
  const obraHref = obraContractId ? `/ponto/contratos/${obraContractId}/obras/${obraId}` : undefined;
  const backHref = contractId && obraHref ? obraHref : '/ponto/diario-obra';
  useBreadcrumbEntity(
    obra?.name
      ? [
          // Dentro do contrato, a obra vem depois de «Obras» (aba do contrato).
          ...(contractId ? [{ label: 'Obras', href: `/ponto/contratos/${contractId}?tab=obras` }] : []),
          { label: obra.name, href: obraHref },
          // Dentro do contrato, «Diários de Obra» é a aba da obra; na rota geral o módulo já aparece no início.
          ...(contractId ? [{ label: 'Diários de Obra', href: obraHref }] : []),
          { label: brDate(selected), href: `${diarioBase}/${selected}` },
        ]
      : null,
    { priority: 1 },
  );
  const contratoLabel = obra?.contratoNome ?? obra?.contrato?.name ?? '';

  // Ao trocar de dia pelo calendário, o mês exibido acompanha a data aberta.
  useEffect(() => {
    const d = parseIso(selected);
    setMonthRef((m) => (m.y === d.y && m.m0 === d.m0 ? m : { y: d.y, m0: d.m0 }));
  }, [selected]);

  const monthKey = `${monthRef.y}-${pad(monthRef.m0 + 1)}`;
  const { data: monthDays } = useQuery({
    queryKey: ['diario-obra-month', obraId, monthKey],
    enabled: !!obraId,
    queryFn: async () => (await api.get(`/diario-obra/${obraId}/month/${monthKey}`)).data?.data ?? [],
  });
  const daysWithRdo = useMemo(() => {
    // 'final' = finalizado; 'draft' = com atividade, ainda não finalizado; 'none' = sem atividade
    const m = new Map<string, 'final' | 'draft' | 'none'>();
    for (const r of (monthDays ?? []) as Array<{ date: string; noActivity: boolean; finalizedAt?: string | null }>) {
      m.set(r.date, r.noActivity ? 'none' : r.finalizedAt ? 'final' : 'draft');
    }
    return m;
  }, [monthDays]);

  const currentKey = obraId ? `${obraId}|${selected}` : '';

  // Carrega o RDO do dia escolhido.
  useEffect(() => {
    if (!obraId) return;
    let cancelled = false;
    dirtyRef.current = false;
    setLoadedKey('');
    setSaveState('idle');
    api
      .get(`/diario-obra/${obraId}/${selected}`)
      .then((res) => {
        if (cancelled) return;
        setRdo(fromApi(res.data?.data));
        setFinalizedAt(res.data?.data?.finalizedAt ?? null);
        setLoadedKey(`${obraId}|${selected}`);
      })
      .catch(() => {
        if (cancelled) return;
        toast.error('Não foi possível carregar o RDO.');
        setRdo(emptyRdo());
        setFinalizedAt(null);
        setLoadedKey(`${obraId}|${selected}`);
      });
    return () => {
      cancelled = true;
    };
  }, [obraId, selected]);

  // Salva sozinho, um instante depois da última alteração.
  useEffect(() => {
    if (!dirtyRef.current || loadedKey !== currentKey || !obraId) return;
    setSaveState('saving');
    const key = currentKey;
    const timer = setTimeout(() => {
      api
        .put(`/diario-obra/${obraId}/${selected}`, toApi(rdo))
        .then(() => {
          if (key !== `${obraId}|${selected}`) return;
          dirtyRef.current = false;
          setSaveState('saved');
          void queryClient.invalidateQueries({ queryKey: ['diario-obra-month', obraId] });
        })
        .catch(() => setSaveState('error'));
    }, 900);
    return () => clearTimeout(timer);
  }, [rdo, loadedKey, currentKey, obraId, selected, queryClient]);

  const update = useCallback(
    (fn: (r: Rdo) => Rdo) => {
      if (locked) return; // RDO finalizado: sem edição até reabrir
      dirtyRef.current = true;
      setRdo(fn);
    },
    [locked],
  );

  const refreshLists = () => {
    void queryClient.invalidateQueries({ queryKey: ['diario-obra-month', obraId] });
    void queryClient.invalidateQueries({ queryKey: ['diario-obra-list'] });
  };

  const handleExportPdf = async () => {
    try {
      await exportDiarioObraPdf({
        obraName: obra?.name ?? '',
        contratoName: contratoLabel,
        dateIso: selected,
        weekday: WEEKDAY_FULL[new Date(parseIso(selected).y, parseIso(selected).m0, parseIso(selected).d).getDay()],
        finalized: locked,
        noActivity: rdo.noActivity,
        noActivityReason: rdo.noActivityReason,
        noActivityNote: rdo.noActivityNote,
        weather: rdo.weather,
        activities: rdo.activities,
        laborDirect: rdo.laborDirect,
        laborIndirect: rdo.laborIndirect,
        equipment: rdo.equipment,
        materials: rdo.materials,
        occurrences: rdo.occurrences,
        notes: rdo.notes,
        generatedBy: userData?.data?.name || undefined,
      });
    } catch {
      toast.error('Não foi possível gerar o PDF.');
    }
  };

  const handleFinalize = async () => {
    setBusy(true);
    try {
      // Grava o que está na tela (e cria o registro, se ainda não existir) antes de finalizar.
      await api.put(`/diario-obra/${obraId}/${selected}`, toApi(rdo));
      dirtyRef.current = false;
      const res = await api.post(`/diario-obra/${obraId}/${selected}/finalize`);
      setFinalizedAt(res.data?.data?.finalizedAt ?? new Date().toISOString());
      setSaveState('saved');
      toast.success('RDO finalizado.');
      refreshLists();
      setConfirm(null);
    } catch {
      toast.error('Não foi possível finalizar o RDO.');
    } finally {
      setBusy(false);
    }
  };

  const handleReopen = async () => {
    setBusy(true);
    try {
      await api.post(`/diario-obra/${obraId}/${selected}/reopen`);
      setFinalizedAt(null);
      toast.success('RDO reaberto para edição.');
      refreshLists();
      setConfirm(null);
    } catch {
      toast.error('Não foi possível reabrir o RDO.');
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try {
      await api.delete(`/diario-obra/${obraId}/${selected}`);
      dirtyRef.current = false;
      toast.success('Diário de obra excluído.');
      refreshLists();
      router.push(backHref);
    } catch {
      toast.error('Não foi possível excluir o diário de obra.');
      setBusy(false);
      setConfirm(null);
    }
  };

  /** Abre outro dia da mesma obra, gravando antes o que ainda estiver pendente. */
  const goToDate = async (iso: string) => {
    if (iso === selected) return;
    if (dirtyRef.current && loadedKey === currentKey) {
      try {
        await api.put(`/diario-obra/${obraId}/${selected}`, toApi(rdo));
        dirtyRef.current = false;
      } catch {
        toast.error('Não foi possível salvar o RDO antes de trocar de dia.');
        return;
      }
    }
    router.push(`${diarioBase}/${iso}`);
  };

  const shiftMonth = (delta: number) => {
    setMonthRef((m) => {
      const d = new Date(m.y, m.m0 + delta, 1);
      return { y: d.getFullYear(), m0: d.getMonth() };
    });
  };

  const daysInMonth = new Date(monthRef.y, monthRef.m0 + 1, 0).getDate();
  const selDate = parseIso(selected);
  const selWeekday = new Date(selDate.y, selDate.m0, selDate.d).getDay();

  const saveRow = (section: SectionKey, row: Row | null, values: Record<string, string>) => {
    const numeric = new Set(['quantity', 'hours']);
    const clean: Record<string, string | number | null> = {};
    for (const [k, v] of Object.entries(values)) {
      clean[k] = numeric.has(k) ? (v.trim() === '' ? null : Number(v.replace(',', '.'))) : v.trim();
    }
    update((r) => ({
      ...r,
      [section]: row
        ? r[section].map((x) => (x.id === row.id ? { ...x, ...clean } : x))
        : [...r[section], { id: newId(), ...clean }],
    }));
    setModal(null);
  };

  const photosUrl = `/diario-obra/${obraId}/${selected}/photos`;

  const removeRow = (section: SectionKey, row: Row) => {
    // Atividade removida: apaga também os arquivos das fotos dela (sem travar se algum falhar).
    if (section === 'activities' && Array.isArray(row.photos)) {
      for (const ph of row.photos as Photo[]) {
        if (ph.key) void api.delete(photosUrl, { data: { key: ph.key } }).catch(() => undefined);
      }
    }
    update((r) => ({ ...r, [section]: r[section].filter((x) => x.id !== row.id) }));
  };

  const addPhotos = async (row: Row, files: File[]) => {
    if (locked || files.length === 0) return;
    setUploadingId(row.id);
    const added: Photo[] = [];
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        toast.error(`"${file.name}" não é uma imagem.`);
        continue;
      }
      if (file.size > MAX_PHOTO_BYTES) {
        toast.error(`"${file.name}" passa de 5 MB.`);
        continue;
      }
      try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await api.post(photosUrl, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
        const d = res.data?.data;
        if (d?.url) added.push({ url: d.url, key: d.key ?? '', name: d.name || file.name });
      } catch {
        toast.error(`Não foi possível enviar "${file.name}".`);
      }
    }
    setUploadingId(null);
    if (added.length > 0) {
      update((r) => ({
        ...r,
        activities: r.activities.map((a) =>
          a.id === row.id ? { ...a, photos: [...((Array.isArray(a.photos) ? a.photos : []) as Photo[]), ...added] } : a,
        ),
      }));
    }
  };

  const removePhoto = (row: Row, photo: Photo) => {
    if (photo.key) void api.delete(photosUrl, { data: { key: photo.key } }).catch(() => undefined);
    update((r) => ({
      ...r,
      activities: r.activities.map((a) =>
        a.id === row.id
          ? { ...a, photos: ((Array.isArray(a.photos) ? a.photos : []) as Photo[]).filter((p) => p.url !== photo.url) }
          : a,
      ),
    }));
  };

  const NEW_LABEL: Record<SectionKey, string> = {
    activities: 'Nova Atividade',
    laborDirect: 'Nova Função',
    laborIndirect: 'Nova Função',
    equipment: 'Novo Equipamento',
    materials: 'Novo Recebimento',
    occurrences: 'Nova Ocorrência',
    notes: 'Nova Observação',
  };
  const EMPTY_TITLE: Record<SectionKey, string> = {
    activities: 'Nenhuma atividade registrada',
    laborDirect: 'Nenhuma função direta lançada',
    laborIndirect: 'Nenhuma função indireta lançada',
    equipment: 'Nenhum equipamento lançado',
    materials: 'Nenhum material recebido neste dia',
    occurrences: 'Nenhuma ocorrência registrada',
    notes: 'Nenhuma observação registrada',
  };

  /** Botão "Novo ..." no canto do cabeçalho, igual ao das demais listas do sistema. */
  const addAction = (section: SectionKey) => (
    <button
      type="button"
      disabled={locked}
      onClick={() => setModal({ section, row: null })}
      className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
    >
      <Plus className="h-4 w-4 shrink-0" />
      <span>{NEW_LABEL[section]}</span>
    </button>
  );

  const renderSection = (section: SectionKey, EmptyIcon: LucideIcon) => {
    if (rdo[section].length === 0) {
      return (
        <CadastroListEmpty
          icon={EmptyIcon}
          title={EMPTY_TITLE[section]}
          hint={`Clique em "${NEW_LABEL[section]}" para adicionar`}
        />
      );
    }
    if (section === 'activities') {
      return (
        <ActivityCards
          rows={rdo.activities}
          locked={locked}
          uploadingId={uploadingId}
          onEdit={(row) => setModal({ section, row })}
          onRemove={(row) => removeRow(section, row)}
          onAddPhotos={(row, files) => void addPhotos(row, files)}
          onRemovePhoto={removePhoto}
        />
      );
    }
    return (
      <SectionTable
        section={section}
        rows={rdo[section]}
        locked={locked}
        onEdit={(row) => setModal({ section, row })}
        onRemove={(row) => removeRow(section, row)}
      />
    );
  };

  if (loadingUser) {
    return (
      <ProtectedRoute route="/ponto/diario-obra">
        <MainLayout userRole="EMPLOYEE" userName="" onLogout={handleLogout}>
          <Loading message="Carregando..." fullScreen size="lg" />
        </MainLayout>
      </ProtectedRoute>
    );
  }
  const user = userData?.data || { name: 'Usuário', role: 'EMPLOYEE' };
  const ready = loadedKey === currentKey && !!obraId;

  const saveLabel =
    saveState === 'saving'
      ? 'Salvando…'
      : saveState === 'saved'
        ? 'Salvo'
        : saveState === 'error'
          ? 'Erro ao salvar — tente de novo'
          : '';

  const sub = (count: number, zero: string) => (count === 0 ? zero : `${count} registrado(s)`);
  const laborCount = rdo.laborDirect.length + rdo.laborIndirect.length;

  return (
    <ProtectedRoute route="/ponto/diario-obra">
      <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
        <PageStack>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            {/* Esquerda: excluir */}
            <div className="order-2 flex items-center justify-start gap-2 sm:order-1">
              {obra ? (
                <button
                  type="button"
                  onClick={() => setConfirm('delete')}
                  title="Excluir"
                  aria-label="Excluir"
                  className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 transition-colors hover:bg-red-50 dark:border-red-800/60 dark:bg-gray-800 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            {/* Centro: obra e contrato */}
            <div className="order-1 min-w-0 text-center sm:order-2">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 sm:text-3xl">
                {loadingObra ? 'Obra' : obra?.name || 'Obra'}
              </h1>
              <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 sm:text-base">
                {loadingObra ? '' : contratoLabel}
              </p>
            </div>

            {/* Direita: exportar e finalizar */}
            <div className="order-3 flex items-center justify-start gap-2 sm:justify-end">
              {obra ? (
                <>
                  <button
                    type="button"
                    onClick={() => void handleExportPdf()}
                    title="Exportar PDF"
                    aria-label="Exportar PDF"
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  {locked ? (
                    <button
                      type="button"
                      onClick={() => setConfirm('reopen')}
                      className="inline-flex h-10 items-center rounded-lg border border-red-200 bg-red-50 px-4 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                    >
                      Reabrir RDO
                    </button>
                  ) : rdo.noActivity ? null : (
                    // Dia sem atividade não tem o que finalizar: o botão só aparece para diários preenchidos.
                    <button
                      type="button"
                      disabled={!ready || saveState === 'saving'}
                      onClick={() => setConfirm('finalize')}
                      className="inline-flex h-10 items-center rounded-lg bg-red-600 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Finalizar
                    </button>
                  )}
                </>
              ) : null}
            </div>
          </div>

          {!loadingObra && !obra ? (
            <p className="rounded-xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300">
              Obra não encontrada.
            </p>
          ) : (
            <div className="space-y-6">
              {/* Dia aberto + calendário do mês (mesmo padrão do bloco Captações da página inicial) */}
              <Card className="min-w-0">
                <CardHeader className="border-b-0 pb-1">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 items-center space-x-3">
                      <div className="shrink-0 rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                        <CalendarDays className="h-5 w-5 text-red-600 dark:text-red-400 sm:h-6 sm:w-6" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 sm:text-lg">
                          Diário de Obra
                        </h3>
                        <p className="text-xs text-gray-600 dark:text-gray-400 sm:text-sm">
                          {brDate(selected)} · {WEEKDAY_FULL[selWeekday]}
                          {locked ? ' · Finalizado' : saveState === 'error' ? ' · Erro ao salvar' : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => shiftMonth(-1)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                        aria-label="Mês anterior"
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <span className="min-w-[7.5rem] text-center text-xs font-medium tabular-nums text-gray-600 dark:text-gray-300 sm:min-w-[8.5rem]">
                        {MONTH_NAMES[monthRef.m0]} de {monthRef.y}
                      </span>
                      <button
                        type="button"
                        onClick={() => shiftMonth(1)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
                        aria-label="Próximo mês"
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="min-w-0">
                  <div className="flex gap-1 overflow-x-auto pb-1">
                    {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => {
                      const iso = toIso(monthRef.y, monthRef.m0, d);
                      const wd = new Date(monthRef.y, monthRef.m0, d).getDay();
                      const isSel = iso === selected;
                      const future = iso > today;
                      const weekend = wd === 0 || wd === 6;
                      // verde = finalizado; amarelo = com atividade, ainda não finalizado; vermelho = sem atividade;
                      // sem cor = ainda não registrado
                      const status: 'final' | 'draft' | 'none' | null = daysWithRdo.get(iso) ?? null;
                      const tone =
                        status === 'final'
                          ? 'text-green-700 dark:text-green-400'
                          : status === 'draft'
                            ? 'text-amber-600 dark:text-amber-400'
                            : status === 'none'
                              ? 'text-red-600 dark:text-red-400'
                              : null;
                      // Hoje: sem fundo colorido, só o círculo — na cor da situação do dia (cinza se não começou)
                      const isToday = iso === today;
                      const ringHoje = !isToday
                        ? ''
                        : status === 'final'
                          ? 'ring-1 ring-green-600 dark:ring-green-400'
                          : status === 'draft'
                            ? 'ring-1 ring-amber-500 dark:ring-amber-400'
                            : status === 'none'
                              ? 'ring-1 ring-red-600 dark:ring-red-400'
                              : 'ring-1 ring-gray-400 dark:ring-gray-500';
                      return (
                        <button
                          key={iso}
                          type="button"
                          disabled={future}
                          onClick={() => void goToDate(iso)}
                          aria-pressed={isSel}
                          aria-label={`${d} de ${MONTH_NAMES[monthRef.m0]}`}
                          className={`flex min-w-9 flex-1 flex-col items-center gap-1 rounded-lg py-2 text-xs transition-colors ${
                            future ? 'cursor-not-allowed opacity-40' : ''
                          } ${
                            isToday && !isSel
                              ? future
                                ? ''
                                : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                              : isSel
                              ? status === 'final'
                                ? 'bg-green-100 hover:bg-green-200 dark:bg-green-900/30 dark:hover:bg-green-900/50'
                                : status === 'draft'
                                  ? 'bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/30 dark:hover:bg-amber-900/50'
                                  : 'bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50'
                              : weekend
                                ? `bg-gray-100 dark:bg-gray-800 ${future ? '' : 'hover:bg-gray-200 dark:hover:bg-gray-700'}`
                                : future
                                  ? ''
                                  : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                          }`}
                        >
                          <span className={`font-medium ${tone ?? (isSel ? 'text-red-700 dark:text-red-300' : 'text-gray-500')}`}>
                            {WEEKDAY_LETTER[wd]}
                          </span>
                          <span
                            className={`flex h-7 w-7 items-center justify-center rounded-full text-sm ${
                              tone
                                ? `font-semibold ${tone}`
                                : isSel
                                  ? 'font-semibold text-red-700 dark:text-red-300'
                                  : iso === today
                                    ? 'font-bold text-gray-900 dark:text-gray-100'
                                    : 'text-gray-800 dark:text-gray-200'
                            } ${ringHoje}`}
                          >
                            {d}
                          </span>
                          <span className="flex h-3 items-center justify-center">
                            {status === 'none' ? (
                              <X className="h-3 w-3 text-red-600 dark:text-red-400" strokeWidth={3} aria-label="Sem atividade" />
                            ) : status === 'final' ? (
                              <Check className="h-3 w-3 text-green-600 dark:text-green-400" strokeWidth={3} aria-label="Finalizado" />
                            ) : (
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  status === 'draft' ? 'bg-amber-500 dark:bg-amber-400' : 'bg-transparent'
                                }`}
                              />
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {!ready ? (
                <Loading message="Carregando RDO..." />
              ) : (
                <div className="flex flex-col gap-6">
                  {/* Sem atividade: mesmo cabeçalho dos demais blocos, inteiro clicável (abre o motivo) */}
                  <div className="group relative">
                    <SectionCard
                      Icon={Ban}
                      title="Sem atividade"
                      subtitle="Dia sem serviço"
                      action={
                        <button
                          type="button"
                          disabled={locked}
                          onClick={() =>
                            rdo.noActivity
                              ? update((r) => ({ ...r, noActivity: false }))
                              : setNoActivityOpen(true)
                          }
                          aria-pressed={rdo.noActivity || noActivityOpen}
                          aria-label="Sem atividade"
                          className={`relative z-10 flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                            rdo.noActivity || noActivityOpen ? 'bg-red-600' : 'bg-gray-300 dark:bg-gray-600'
                          }`}
                        >
                          <span
                            className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${
                              rdo.noActivity || noActivityOpen ? 'translate-x-5' : ''
                            }`}
                          />
                        </button>
                      }
                    >
                      {rdo.noActivity ? (
                        <div className="space-y-3">
                          {splitReasons(rdo.noActivityReason).length > 0 ? (
                            <div className="flex flex-wrap gap-2">
                              {splitReasons(rdo.noActivityReason).map((m) => (
                                <span
                                  key={m}
                                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-sm text-red-700 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300"
                                >
                                  {m}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-gray-500 dark:text-gray-400">Sem motivo informado</p>
                          )}
                          {rdo.noActivityNote ? (
                            <p className="whitespace-pre-wrap break-words border-l-2 border-gray-200 pl-3 text-sm text-gray-600 dark:border-gray-600 dark:text-gray-400">
                              {rdo.noActivityNote}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </SectionCard>
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => setNoActivityOpen(true)}
                      className="absolute inset-0 z-[5] cursor-pointer rounded-lg disabled:cursor-default"
                      aria-label={rdo.noActivity ? 'Editar motivo de sem atividade' : 'Registrar sem atividade'}
                    />
                  </div>

                  {/* Com "Sem atividade" marcado, o resto do RDO não é preenchido */}
                  {rdo.noActivity ? null : (
                    <>
                      <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
                        <SectionCard
                          className="h-full"
                          Icon={Sunrise}
                          title="Clima da Manhã"
                          subtitle="Condições pela manhã"
                        >
                          <WeatherPeriod
                            title="Manhã"
                            disabled={locked}
                            value={rdo.weather.morning}
                            onChange={(p) => update((r) => ({ ...r, weather: { ...r.weather, morning: p } }))}
                          />
                        </SectionCard>
                        <SectionCard
                          className="h-full"
                          Icon={Sunset}
                          title="Clima da Tarde"
                          subtitle="Condições à tarde"
                        >
                          <WeatherPeriod
                            title="Tarde"
                            disabled={locked}
                            value={rdo.weather.afternoon}
                            onChange={(p) => update((r) => ({ ...r, weather: { ...r.weather, afternoon: p } }))}
                          />
                        </SectionCard>
                      </div>

                      <SectionCard
                        Icon={ListChecks}
                        title="Atividades"
                        subtitle={sub(rdo.activities.length, 'Nenhuma atividade registrada')}
                        action={addAction('activities')}
                      >
                        {renderSection('activities', ListChecks)}
                      </SectionCard>

                      <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
                      <SectionCard
                        className="h-full"
                        Icon={Users}
                        title="Mão de Obra Direta"
                        subtitle={sub(rdo.laborDirect.length, 'Nenhuma função lançada')}
                        action={addAction('laborDirect')}
                      >
                        {renderSection('laborDirect', Users)}
                      </SectionCard>

                      <SectionCard
                        className="h-full"
                        Icon={User}
                        title="Mão de Obra Indireta"
                        subtitle={sub(rdo.laborIndirect.length, 'Nenhuma função lançada')}
                        action={addAction('laborIndirect')}
                      >
                        {renderSection('laborIndirect', User)}
                      </SectionCard>
                      </div>

                      <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-2">
                      <SectionCard
                        className="h-full"
                        Icon={Wrench}
                        title="Equipamentos"
                        subtitle={sub(rdo.equipment.length, 'Nenhum equipamento lançado')}
                        action={addAction('equipment')}
                      >
                        {renderSection('equipment', Wrench)}
                      </SectionCard>

                      <SectionCard
                        className="h-full"
                        Icon={Package}
                        title="Materiais Recebidos"
                        subtitle={sub(rdo.materials.length, 'Nenhum material recebido neste dia')}
                        action={addAction('materials')}
                      >
                        {renderSection('materials', Package)}
                      </SectionCard>
                      </div>

                      <SectionCard
                        Icon={TriangleAlert}
                        title="Ocorrências"
                        subtitle={sub(rdo.occurrences.length, 'Nenhuma ocorrência registrada')}
                        action={addAction('occurrences')}
                      >
                        {renderSection('occurrences', TriangleAlert)}
                      </SectionCard>

                      <SectionCard
                        Icon={StickyNote}
                        title="Observações Gerais"
                        subtitle={sub(rdo.notes.length, 'Nenhuma observação registrada')}
                        action={addAction('notes')}
                      >
                        {renderSection('notes', StickyNote)}
                      </SectionCard>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {confirm ? (
            <Modal
              isOpen
              onClose={() => (busy ? undefined : setConfirm(null))}
              title={confirm === 'delete' ? 'Excluir diário de obra' : confirm === 'finalize' ? 'Finalizar RDO' : 'Reabrir RDO'}
              size="sm"
              footer={
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirm(null)}
                    className="rounded-lg bg-gray-100 px-4 py-2 text-gray-700 transition-colors hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void (confirm === 'delete' ? handleDelete() : confirm === 'finalize' ? handleFinalize() : handleReopen())
                    }
                    className="rounded-lg bg-red-600 px-4 py-2 text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                  >
                    {busy ? 'Aguarde...' : confirm === 'delete' ? 'Excluir' : confirm === 'finalize' ? 'Finalizar' : 'Reabrir'}
                  </button>
                </div>
              }
            >
              <p className="text-sm text-gray-700 dark:text-gray-300">
                {confirm === 'delete'
                  ? `Excluir o RDO de ${brDate(selected)}? Todo o conteúdo do dia será perdido e não dá para desfazer.`
                  : confirm === 'finalize'
                    ? `Ao finalizar, o RDO de ${brDate(selected)} não poderá mais ser editado, a menos que seja reaberto.`
                    : `O RDO de ${brDate(selected)} voltará a ficar editável.`}
              </p>
            </Modal>
          ) : null}

          {noActivityOpen ? (
            <NoActivityModal
              dateLabel={brDate(selected)}
              initialReason={rdo.noActivityReason}
              initialNote={rdo.noActivityNote}
              onClose={() => setNoActivityOpen(false)}
              onConfirm={(reason, note) => {
                update((r) => ({ ...r, noActivity: true, noActivityReason: reason, noActivityNote: note }));
                setNoActivityOpen(false);
              }}
            />
          ) : null}

          {modal ? (
            <FieldsModal
              key={`${modal.section}:${modal.row?.id ?? 'new'}`}
              config={SECTIONS[modal.section]}
              initial={modal.row}
              onClose={() => setModal(null)}
              onSave={(values) => saveRow(modal.section, modal.row, values)}
            />
          ) : null}
        </PageStack>
      </MainLayout>
    </ProtectedRoute>
  );
}
