'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  AlertTriangle,
  CalendarCheck,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  BadgeCheck,
  FilePlus2,
  FileSignature,
  Filter,
  Info,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
  Wallet,
} from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { Modal } from '@/components/ui/Modal';
import { Loading } from '@/components/ui/Loading';
import { FilterStatCard } from '@/components/ui/FilterStatCard';
import { cadastroListClasses } from '@/components/ui/RowActionMenu';
import { CadastroListEmpty } from '@/components/ui/CadastroListSummary';
import { ListPageHeader, PageStack, pageStatCardsGridClass } from '@/components/ui/pageLayout';
import { StringSingleSelectDropdown } from '@/components/ui/StringSingleSelectDropdown';
import { useLogout } from '@/hooks/useLogout';
import { authService } from '@/lib/auth';
import api from '@/lib/api';
import { FORM_FIELD_INPUT_CLS } from '@/lib/formFieldUi';
import { formatCurrencyInputBrFromNumber, maskCurrencyInputBrOrEmpty } from '@/lib/maskCurrencyBr';

type ArtEntry = { art: string; professional: string; baixada: string };
const EMPTY_ART: ArtEntry = { art: '', professional: '', baixada: '' };
const BAIXADA_OPTIONS = ['SIM', 'NÃO'];

type RegistryRow = {
  id: string;
  contractorName: string;
  uf: string | null;
  arts: ArtEntry[];
  contractNumber: string;
  document: string | null;
  signedAt: string | null;
  notes: string | null;
  value: number | null;
  startDate: string | null;
  guarantee: string | null;
  endDate: string | null;
  addenda: Array<{
    id: string;
    addendumNumber: string | null;
    arts: ArtEntry[];
    document: string | null;
    signedAt: string | null;
    startDate: string | null;
    endDate: string | null;
    guarantee: string | null;
    effectiveDate: string | null;
    amount: number;
    note: string | null;
  }>;
  addendaTotal: number;
  cats: Array<{
    id: string;
    catNumber: string;
    professional: string | null;
    protocol: string | null;
    issuedAt: string | null;
  }>;
};

type RegistryForm = {
  contractorName: string;
  uf: string;
  arts: ArtEntry[];
  contractNumber: string;
  document: string;
  signedAt: string;
  notes: string;
  value: string;
  startDate: string;
  guarantee: string;
  endDate: string;
};

const EMPTY_FORM: RegistryForm = {
  contractorName: '',
  uf: '',
  arts: [{ ...EMPTY_ART }],
  contractNumber: '',
  document: '',
  signedAt: '',
  notes: '',
  value: '',
  startDate: '',
  guarantee: '',
  endDate: '',
};

type ContractStatus = 'ANDAMENTO' | 'ENCERRADO' | 'A_INICIAR' | 'SEM_DATAS';

const UF_NAMES: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará',
  DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão',
  MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará',
  PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro',
  RN: 'Rio Grande do Norte', RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima',
  SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};
const NO_UF = '__sem_uf__';

/** Situação da garantia (mesma lista usada na planilha de controle). */
const GUARANTEE_OPTIONS = ['NÃO PRECISA', 'NÃO SEI', 'OK'];

const STATUS_LABEL: Record<ContractStatus, string> = {
  ANDAMENTO: 'Em andamento',
  ENCERRADO: 'Encerrado',
  A_INICIAR: 'A iniciar',
  SEM_DATAS: 'Sem prazo definido',
};
const STATUS_DOT: Record<ContractStatus, string> = {
  ANDAMENTO: 'bg-emerald-500',
  ENCERRADO: 'bg-red-500',
  A_INICIAR: 'bg-amber-500',
  SEM_DATAS: 'bg-gray-400',
};

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const brlCompact = (v: number) =>
  Math.abs(v) >= 1_000_000 ? `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi` : brl(v);
const dateBr = (iso: string | null) => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};
const todayYmd = () => new Date().toISOString().slice(0, 10);
const totalOf = (r: RegistryRow) => (Number(r.value) || 0) + (Number(r.addendaTotal) || 0);

/** Término em vigor: o mais tardio entre o do contrato e o dos aditivos. */
function effectiveEnd(r: RegistryRow): string | null {
  const ends = [r.endDate, ...r.addenda.map((a) => a.endDate)].filter((d): d is string => !!d).map((d) => d.slice(0, 10));
  return ends.length ? ends.sort()[ends.length - 1] : null;
}

function statusOf(r: RegistryRow, today: string): ContractStatus {
  const s = r.startDate?.slice(0, 10);
  const e = effectiveEnd(r);
  if (e && e < today) return 'ENCERRADO';
  if (s && s > today) return 'A_INICIAR';
  if (!s && !e) return 'SEM_DATAS';
  return 'ANDAMENTO';
}

function errMessage(e: unknown, fallback: string): string {
  return (e as { response?: { data?: { message?: string } } })?.response?.data?.message || fallback;
}

const ymdToBr = (ymd: string) => {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
};

/** dd/mm/aaaa → aaaa-mm-dd, ou null se não for uma data real. */
function brToYmd(text: string): string | null {
  const m = text.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/** Máscara dd/mm/aaaa a partir do que foi digitado ou colado. */
function maskDateBr(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** Campo de data que aceita digitar (dd/mm/aaaa) e também escolher no calendário. Valor em aaaa-mm-dd. */
function TypedDateField({
  value,
  onChange,
  placeholder = 'dd/mm/aaaa',
  ariaLabel,
}: {
  value: string;
  onChange: (ymd: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [text, setText] = useState(ymdToBr(value));
  const nativeRef = useRef<HTMLInputElement>(null);

  // Mantém o texto em sincronia quando o valor muda por fora (editar, limpar o formulário).
  useEffect(() => {
    if ((brToYmd(text) ?? '') !== (value || '')) setText(ymdToBr(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const invalid = text.length === 10 && brToYmd(text) === null;

  return (
    <div className="relative">
      <input
        value={text}
        onChange={(e) => {
          const masked = maskDateBr(e.target.value);
          setText(masked);
          if (masked === '') onChange('');
          else {
            const ymd = brToYmd(masked);
            if (ymd) onChange(ymd);
          }
        }}
        onBlur={() => {
          // Texto incompleto ou inválido volta para a última data válida.
          if (text !== '' && brToYmd(text) === null) setText(ymdToBr(value));
        }}
        inputMode="numeric"
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        aria-invalid={invalid}
        maxLength={10}
        className={`${FORM_FIELD_INPUT_CLS} block pr-10 ${invalid ? 'border-red-500' : ''}`}
      />
      <button
        type="button"
        onClick={() => nativeRef.current?.showPicker?.()}
        className="absolute inset-y-0 right-2 my-auto flex h-7 w-7 items-center justify-center rounded text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100"
        title="Escolher no calendário"
        aria-label="Escolher no calendário"
      >
        <CalendarDays className="h-4 w-4" />
      </button>
      <input
        ref={nativeRef}
        type="date"
        tabIndex={-1}
        aria-hidden
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        style={{ position: 'absolute', bottom: 0, right: 8, width: 0, height: 0, padding: 0, border: 0 }}
        className="pointer-events-none opacity-0"
      />
    </div>
  );
}

/** Lista editável de ARTs: cada linha tem a ART (da página ART's / Protocolos) e o profissional dela. */
function ArtsEditor({
  value,
  onChange,
  artOptions,
}: {
  value: ArtEntry[];
  onChange: (next: ArtEntry[]) => void;
  artOptions: Array<{ art: string; profissional: string | null }>;
}) {
  const rows = value.length ? value : [{ ...EMPTY_ART }];
  const update = (i: number, patch: Partial<ArtEntry>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="sm:col-span-3">
      <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">ARTs</span>
      <div className="space-y-2">
        {rows.map((row, i) => {
          const options = artOptions.map((a) => ({ value: a.art, label: a.art }));
          if (row.art && !options.some((o) => o.value === row.art)) options.unshift({ value: row.art, label: row.art });
          return (
            <div key={i} className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_1fr_120px_auto]">
              <StringSingleSelectDropdown
                value={row.art}
                onChange={(v) => {
                  const picked = artOptions.find((a) => a.art === v);
                  update(i, { art: v, professional: v ? picked?.profissional ?? row.professional : '' });
                }}
                options={options}
                allowEmpty
                emptyOptionLabel="Sem ART"
                placeholder="Selecione a ART"
                searchPlaceholder="Pesquisar ART..."
                matchTriggerWidth
                className="w-full"
              />
              <input
                value={row.professional}
                onChange={(e) => update(i, { professional: e.target.value })}
                placeholder="Profissional (preenchido ao escolher a ART)"
                className={FORM_FIELD_INPUT_CLS}
              />
              <StringSingleSelectDropdown
                value={row.baixada}
                onChange={(v) => update(i, { baixada: v })}
                options={BAIXADA_OPTIONS}
                allowEmpty
                emptyOptionLabel="Sem informação"
                placeholder="Baixada"
                disableSearch
                matchTriggerWidth
                className="w-full"
              />
              <button
                type="button"
                onClick={() => onChange(rows.length > 1 ? rows.filter((_, j) => j !== i) : [{ ...EMPTY_ART }])}
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-gray-300 text-red-600 hover:bg-red-50 dark:border-gray-600 dark:hover:bg-red-950/30"
                title="Remover esta ART"
                aria-label="Remover esta ART"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => onChange([...rows, { ...EMPTY_ART }])}
        className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
      >
        <Plus className="h-3.5 w-3.5" /> Adicionar ART
      </button>
    </div>
  );
}

const cleanArts = (arts: ArtEntry[]) => arts.filter((a) => a.art.trim() || a.professional.trim());
/** Uma linha por ART, com "—" quando o campo está vazio (mantém o alinhamento entre colunas). */
const artsLinesAll = (arts: ArtEntry[], field: 'art' | 'professional' | 'baixada') =>
  arts.map((a) => a[field] || '—').join('\n');
const artsLines = (arts: ArtEntry[], field: 'art' | 'professional') =>
  arts.map((a) => a[field]).filter(Boolean).join('\n');

function ValueBox({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="min-w-[130px] flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-center dark:border-gray-700 dark:bg-gray-800/60">
      <p className={`truncate text-sm font-bold tabular-nums ${tone ?? 'text-gray-900 dark:text-gray-100'}`} title={value}>{value}</p>
      <p className="text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  );
}

function ControleContratosPage() {
  const queryClient = useQueryClient();
  const handleLogout = useLogout();
  const user = authService.getUser();
  const today = todayYmd();

  const [search, setSearch] = useState('');
  const [ufFilter, setUfFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [editing, setEditing] = useState<RegistryRow | 'new' | null>(null);
  const [form, setForm] = useState<RegistryForm>(EMPTY_FORM);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [viewTab, setViewTab] = useState<'info' | 'aditivos' | 'cat'>('info');
  const [catNumber, setCatNumber] = useState('');
  const [catProfessional, setCatProfessional] = useState('');
  const [catProtocol, setCatProtocol] = useState('');
  const [catIssuedAt, setCatIssuedAt] = useState('');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [addSignedAt, setAddSignedAt] = useState('');
  const [addStart, setAddStart] = useState('');
  const [addEnd, setAddEnd] = useState('');
  const [addDocument, setAddDocument] = useState('');
  const [addGuarantee, setAddGuarantee] = useState('');
  const [editingAddendumId, setEditingAddendumId] = useState<string | null>(null);
  const [addAmount, setAddAmount] = useState('');
  const [addNumber, setAddNumber] = useState('');
  const [addNote, setAddNote] = useState('');
  const [addArts, setAddArts] = useState<ArtEntry[]>([{ ...EMPTY_ART }]);

  const { data: registry = [], isLoading, isError } = useQuery({
    queryKey: ['contract-registry'],
    queryFn: async () =>
      (((await api.get('/contract-registry')).data?.data ?? []) as RegistryRow[]).map((r) => ({
        ...r,
        arts: (r.arts ?? []).map((a) => ({ ...a, baixada: a.baixada ?? '' })),
        cats: r.cats ?? [],
        addenda: (r.addenda ?? []).map((x) => ({ ...x, arts: (x.arts ?? []).map((a) => ({ ...a, baixada: a.baixada ?? '' })) })),
        addendaTotal: r.addendaTotal ?? 0,
      })),
    enabled: !!user,
  });

  const { data: artOptions = [] } = useQuery({
    queryKey: ['contract-registry-art-options'],
    queryFn: async () =>
      ((await api.get('/contract-registry/art-options')).data?.data ?? []) as Array<{
        art: string;
        contratante: string | null;
        contrato: string | null;
        profissional: string | null;
      }>,
    enabled: !!user && (editing !== null || viewingId !== null),
    staleTime: 60_000,
  });

  const addGuaranteeOptions = useMemo(
    () => (addGuarantee && !GUARANTEE_OPTIONS.includes(addGuarantee) ? [addGuarantee, ...GUARANTEE_OPTIONS] : GUARANTEE_OPTIONS),
    [addGuarantee],
  );

  const guaranteeOptions = useMemo(
    () => (form.guarantee && !GUARANTEE_OPTIONS.includes(form.guarantee) ? [form.guarantee, ...GUARANTEE_OPTIONS] : GUARANTEE_OPTIONS),
    [form.guarantee],
  );



  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        arts: cleanArts(form.arts),
        value: form.value.trim() === '' ? null : form.value,
        signedAt: form.signedAt || null,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
      };
      if (editing === 'new' || editing == null) await api.post('/contract-registry', payload);
      else await api.patch(`/contract-registry/${editing.id}`, payload);
    },
    onSuccess: () => {
      toast.success(editing === 'new' ? 'Contrato adicionado.' : 'Contrato atualizado.');
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ['contract-registry'] });
    },
    onError: (e) => toast.error(errMessage(e, 'Não foi possível salvar o contrato.')),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/contract-registry/${id}`);
    },
    onSuccess: () => {
      toast.success('Contrato excluído.');
      void queryClient.invalidateQueries({ queryKey: ['contract-registry'] });
    },
    onError: (e) => toast.error(errMessage(e, 'Não foi possível excluir.')),
  });

  const addAddendumMutation = useMutation({
    mutationFn: async () => {
      if (!viewingId) return;
      const payload = {
        addendumNumber: addNumber,
        arts: cleanArts(addArts),
        document: addDocument,
        signedAt: addSignedAt,
        startDate: addStart,
        endDate: addEnd,
        guarantee: addGuarantee,
        amount: addAmount.trim() === '' ? null : addAmount,
        note: addNote,
      };
      if (editingAddendumId) await api.patch(`/contract-registry/${viewingId}/addenda/${editingAddendumId}`, payload);
      else await api.post(`/contract-registry/${viewingId}/addenda`, payload);
    },
    onSuccess: () => {
      toast.success(editingAddendumId ? 'Aditivo atualizado.' : 'Aditivo adicionado.');
      setEditingAddendumId(null);
      setAddSignedAt('');
      setAddStart('');
      setAddEnd('');
      setAddAmount('');
      setAddNumber('');
      setAddNote('');
      setAddArts([{ ...EMPTY_ART }]);
      setAddDocument('');
      setAddGuarantee('');
      void queryClient.invalidateQueries({ queryKey: ['contract-registry'] });
    },
    onError: (e) => toast.error(errMessage(e, 'Não foi possível adicionar o aditivo.')),
  });

  const resetCatForm = () => {
    setEditingCatId(null);
    setCatNumber('');
    setCatProfessional('');
    setCatProtocol('');
    setCatIssuedAt('');
  };

  const saveCatMutation = useMutation({
    mutationFn: async () => {
      if (!viewingId) return;
      const payload = { catNumber, professional: catProfessional, protocol: catProtocol, issuedAt: catIssuedAt || null };
      if (editingCatId) await api.patch(`/contract-registry/${viewingId}/cats/${editingCatId}`, payload);
      else await api.post(`/contract-registry/${viewingId}/cats`, payload);
    },
    onSuccess: () => {
      toast.success(editingCatId ? 'CAT atualizada.' : 'CAT adicionada.');
      resetCatForm();
      void queryClient.invalidateQueries({ queryKey: ['contract-registry'] });
    },
    onError: (e) => toast.error(errMessage(e, 'Não foi possível salvar a CAT.')),
  });

  const deleteCatMutation = useMutation({
    mutationFn: async (catId: string) => {
      await api.delete(`/contract-registry/${viewingId}/cats/${catId}`);
    },
    onSuccess: () => {
      toast.success('CAT removida.');
      void queryClient.invalidateQueries({ queryKey: ['contract-registry'] });
    },
    onError: (e) => toast.error(errMessage(e, 'Não foi possível remover a CAT.')),
  });

  const deleteAddendumMutation = useMutation({
    mutationFn: async (addendumId: string) => {
      await api.delete(`/contract-registry/${viewingId}/addenda/${addendumId}`);
    },
    onSuccess: () => {
      toast.success('Aditivo removido.');
      void queryClient.invalidateQueries({ queryKey: ['contract-registry'] });
    },
    onError: (e) => toast.error(errMessage(e, 'Não foi possível remover o aditivo.')),
  });

  const viewing = useMemo(() => registry.find((r) => r.id === viewingId) ?? null, [registry, viewingId]);

  const resetAddendumForm = () => {
    setEditingAddendumId(null);
    setAddSignedAt('');
    setAddStart('');
    setAddEnd('');
    setAddAmount('');
    setAddNumber('');
    setAddNote('');
    setAddArts([{ ...EMPTY_ART }]);
    setAddDocument('');
    setAddGuarantee('');
  };

  const startEditAddendum = (a: RegistryRow['addenda'][number]) => {
    setEditingAddendumId(a.id);
    setAddNumber(a.addendumNumber ?? '');
    setAddArts(a.arts.length ? a.arts.map((x) => ({ ...x })) : [{ ...EMPTY_ART }]);
    setAddDocument(a.document ?? '');
    setAddAmount(Math.abs(a.amount) < 1e-9 ? '' : formatCurrencyInputBrFromNumber(a.amount));
    setAddSignedAt(a.signedAt ?? '');
    setAddStart(a.startDate ?? '');
    setAddEnd(a.endDate ?? '');
    setAddGuarantee(a.guarantee ?? '');
    setAddNote(a.note ?? '');
  };

  // Ao abrir outro contrato, o formulário do aditivo começa em branco.
  useEffect(() => {
    setAddArts([{ ...EMPTY_ART }]);
    setAddDocument('');
    setAddGuarantee('');
    setEditingAddendumId(null);
    resetCatForm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return registry.filter((r) => {
      if (ufFilter && (ufFilter === NO_UF ? !!r.uf : r.uf !== ufFilter)) return false;
      if (statusFilter && statusOf(r, today) !== statusFilter) return false;
      if (!q) return true;
      return [r.contractorName, r.contractNumber, ...r.arts.flatMap((a) => [a.art, a.professional]), r.document, r.notes, r.guarantee]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [registry, search, ufFilter, statusFilter, today]);

  const groups = useMemo(() => {
    const map = new Map<string, RegistryRow[]>();
    for (const r of filtered) {
      const key = r.uf || NO_UF;
      map.set(key, [...(map.get(key) ?? []), r]);
    }
    return Array.from(map.entries())
      .map(([uf, rows]) => ({
        uf,
        label: uf === NO_UF ? 'Sem estado definido' : `${UF_NAMES[uf] ?? uf} (${uf})`,
        rows: rows.slice().sort((a, b) => {
          // Assinatura mais recente primeiro; sem data de assinatura vai para o fim.
          const sa = a.signedAt ?? '';
          const sb = b.signedAt ?? '';
          if (sa !== sb) return !sa ? 1 : !sb ? -1 : sb.localeCompare(sa);
          return a.contractorName.localeCompare(b.contractorName, 'pt-BR');
        }),
      }))
      .sort((a, b) => {
        if (a.uf === NO_UF) return 1;
        if (b.uf === NO_UF) return -1;
        return a.label.localeCompare(b.label, 'pt-BR');
      });
  }, [filtered]);

  const stats = useMemo(() => {
    let andamento = 0;
    let encerrado = 0;
    let valor = 0;
    for (const r of filtered) {
      const st = statusOf(r, today);
      if (st === 'ANDAMENTO') andamento += 1;
      if (st === 'ENCERRADO') encerrado += 1;
      valor += totalOf(r);
    }
    return { andamento, encerrado, valor };
  }, [filtered, today]);

  const hasActiveFilter = !!(ufFilter || statusFilter);
  const set = <K extends keyof RegistryForm>(k: K, v: RegistryForm[K]) => setForm((p) => ({ ...p, [k]: v }));

  const openNew = () => {
    setForm(EMPTY_FORM);
    setEditing('new');
  };
  const openEdit = (r: RegistryRow) => {
    setForm({
      contractorName: r.contractorName,
      uf: r.uf ?? '',
      arts: r.arts.length ? r.arts.map((a) => ({ ...a })) : [{ ...EMPTY_ART }],
      contractNumber: r.contractNumber,
      document: r.document ?? '',
      signedAt: r.signedAt ?? '',
      notes: r.notes ?? '',
      value: r.value != null ? formatCurrencyInputBrFromNumber(r.value) : '',
      startDate: r.startDate ?? '',
      guarantee: r.guarantee ?? '',
      endDate: r.endDate ?? '',
    });
    setEditing(r);
  };

  if (!user) {
    return (
      <MainLayout userRole="EMPLOYEE" userName="" onLogout={handleLogout}>
        <Loading message="Carregando..." fullScreen size="lg" />
      </MainLayout>
    );
  }

  return (
    <MainLayout userRole={user.role} userName={user.name} onLogout={handleLogout}>
      <PageStack>
        <ListPageHeader
          title="Controle de Contratos"
          description="Contratos agrupados por estado, com valor, garantia, prazos e observações"
        />

        <div className={pageStatCardsGridClass}>
          <FilterStatCard size="sm" label="Contratos" count={filtered.length} subtitle={brlCompact(stats.valor)} icon={FileSignature} iconBg="bg-blue-100 dark:bg-blue-900/30" iconColor="text-blue-600 dark:text-blue-300" loading={isLoading} />
          <FilterStatCard size="sm" label="Em andamento" count={stats.andamento} icon={CheckCircle2} iconBg="bg-emerald-100 dark:bg-emerald-900/30" iconColor="text-emerald-600 dark:text-emerald-300" loading={isLoading} isActive={statusFilter === 'ANDAMENTO'} onClick={() => setStatusFilter(statusFilter === 'ANDAMENTO' ? '' : 'ANDAMENTO')} />
          <FilterStatCard size="sm" label="Encerrados" count={stats.encerrado} icon={AlertTriangle} iconBg="bg-red-100 dark:bg-red-900/30" iconColor="text-red-600 dark:text-red-300" loading={isLoading} isActive={statusFilter === 'ENCERRADO'} onClick={() => setStatusFilter(statusFilter === 'ENCERRADO' ? '' : 'ENCERRADO')} />
          <FilterStatCard size="sm" label="Valor total" count={brlCompact(stats.valor)} icon={Wallet} iconBg="bg-amber-100 dark:bg-amber-900/30" iconColor="text-amber-600 dark:text-amber-300" loading={isLoading} />
        </div>

        <Card className={cadastroListClasses.card}>
          <CardHeader className={cadastroListClasses.cardHeader}>
            <div className={cadastroListClasses.cardHeaderRow}>
              <div className={cadastroListClasses.cardHeaderIconRow}>
                <div className="rounded-lg bg-red-100 p-2 dark:bg-red-900/30 sm:p-3">
                  <FileSignature className="h-5 w-5 text-red-600 dark:text-red-300 sm:h-6 sm:w-6" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 sm:text-xl">Contratos</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {filtered.length} contrato(s) em {groups.length} grupo(s)
                  </p>
                </div>
              </div>
              <div className={cadastroListClasses.cardToolbar}>
                <div className="relative min-w-0 w-full flex-1 basis-full sm:basis-auto sm:min-w-[260px] sm:w-[340px] sm:flex-none">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar contratante, contrato, ART, CPF/CNPJ…"
                    className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setIsFiltersOpen(true)}
                  className={`relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors ${
                    hasActiveFilter
                      ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40'
                      : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700'
                  }`}
                  aria-label="Abrir filtro"
                  title={hasActiveFilter ? 'Filtro (ativo)' : 'Filtro'}
                >
                  <Filter className="h-4 w-4" />
                  {hasActiveFilter ? <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white dark:ring-gray-900" /> : null}
                </button>
                <button
                  type="button"
                  onClick={openNew}
                  className="flex h-10 items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
                >
                  <Plus className="h-4 w-4 shrink-0" />
                  <span>Novo contrato</span>
                </button>
              </div>
            </div>
          </CardHeader>

          <CardContent className={cadastroListClasses.cardContent}>
            {isLoading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-gray-400" /></div>
            ) : isError ? (
              <p className="py-10 text-center text-sm text-gray-600 dark:text-gray-300">Não foi possível carregar os contratos.</p>
            ) : groups.length === 0 ? (
              <CadastroListEmpty
                icon={FileSignature}
                title="Nenhum contrato cadastrado"
                hint="Use Novo contrato para cadastrar o primeiro. Eles ficam agrupados por estado."
              />
            ) : (
              <div className="space-y-8">
                {groups.map((g) => (
                  <section key={g.uf}>
                    <div className="mb-3 flex items-center gap-3 border-b-2 border-gray-300 pb-2 dark:border-gray-600">
                      <MapPin className="h-5 w-5 text-red-600 dark:text-red-400" />
                      <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">{g.label}</h3>
                      <span className="rounded-full bg-gray-200 px-2.5 py-0.5 text-xs font-semibold text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                        {g.rows.length} {g.rows.length === 1 ? 'contrato' : 'contratos'}
                      </span>
                      <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
                        Total {brlCompact(g.rows.reduce((s, r) => s + totalOf(r), 0))}
                      </span>
                    </div>
                    <div className="space-y-3">
                      {g.rows.map((r) => {
                        const st = statusOf(r, today);
                        const ended = st === 'ENCERRADO';
                        return (
                          <div
                            key={r.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              setViewTab('info');
                              setViewingId(r.id);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                setViewTab('info');
                                setViewingId(r.id);
                              }
                            }}
                            className="flex cursor-pointer flex-col gap-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-colors hover:border-red-300 dark:border-gray-700 dark:bg-gray-800/40 dark:hover:border-red-800/60 lg:flex-row lg:items-center"
                          >
                            <div className="min-w-0 lg:w-[34%]">
                              <p className="flex items-center gap-2 text-base font-semibold text-gray-900 dark:text-gray-100">
                                <FileSignature className="h-4 w-4 shrink-0 text-gray-400" />
                                <span className="truncate" title={r.contractNumber}>{r.contractNumber}</span>
                              </p>
                              <p className="mt-0.5 truncate text-sm font-medium uppercase text-gray-700 dark:text-gray-200" title={r.contractorName}>{r.contractorName}</p>
                              <div className="mt-1.5 space-y-0.5 text-xs text-gray-500 dark:text-gray-400">
                                <p>CPF/CNPJ: {r.document || '—'} · ART: {r.arts.map((a) => a.art).filter(Boolean).join(', ') || '—'}</p>
                                <p>Assinado em: {dateBr(r.signedAt)} · Garantia: {r.guarantee || '—'}</p>
                                {r.notes ? <p className="line-clamp-2" title={r.notes}>Obs.: {r.notes}</p> : null}
                              </div>
                            </div>

                            <div className="flex flex-1 flex-wrap gap-2">
                              <ValueBox label="Valor original" value={r.value != null ? brl(r.value) : '—'} />
                              <ValueBox label="Aditivos" value={brl(Number(r.addendaTotal) || 0)} tone="text-emerald-600 dark:text-emerald-400" />
                              <ValueBox label="Total" value={brl(totalOf(r))} tone="text-blue-700 dark:text-blue-300" />
                            </div>

                            <div className="space-y-1 text-xs lg:w-[200px]">
                              <p className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100">
                                <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[st]}`} />
                                {STATUS_LABEL[st]}
                              </p>
                              <p className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300"><CalendarCheck className="h-3.5 w-3.5" />Início: {dateBr(r.startDate)}</p>
                              <p className={`flex items-center gap-1.5 font-semibold ${ended ? 'text-red-600 line-through dark:text-red-400' : 'text-gray-700 dark:text-gray-200'}`}><CalendarClock className="h-3.5 w-3.5" />Término: {dateBr(effectiveEnd(r))}</p>
                            </div>

                            <div className="flex shrink-0 gap-2" onClick={(e) => e.stopPropagation()}>
                              <button type="button" onClick={() => openEdit(r)} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700" title="Editar" aria-label="Editar">
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (window.confirm(`Excluir o contrato ${r.contractNumber} de ${r.contractorName}?`)) deleteMutation.mutate(r.id);
                                }}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-300 text-red-600 transition-colors hover:bg-red-50 dark:border-gray-600 dark:hover:bg-red-950/30"
                                title="Excluir"
                                aria-label="Excluir"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </PageStack>

      <Modal
        isOpen={viewing !== null}
        onClose={() => setViewingId(null)}
        title="Visualização do Contrato"
        size="2xl"
      >
        {viewing ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold text-gray-900 dark:text-gray-100">{viewing.contractNumber}</span>
              <span className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                Estado: {viewing.uf || '—'}
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200">
                <span className={`h-2 w-2 rounded-full ${STATUS_DOT[statusOf(viewing, today)]}`} />
                {STATUS_LABEL[statusOf(viewing, today)]}
              </span>
              <button
                type="button"
                onClick={() => {
                  const r = viewing;
                  setViewingId(null);
                  openEdit(r);
                }}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
              >
                <Pencil className="h-3.5 w-3.5" /> Editar dados
              </button>
            </div>

            <div className="rounded-xl border border-gray-200 p-4 dark:border-gray-700">
              <p className="text-base font-bold uppercase text-gray-900 dark:text-gray-100">{viewing.contractorName}</p>
              <p className="mt-1 flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-300">
                <CalendarClock className="h-4 w-4" /> Término: {dateBr(effectiveEnd(viewing))}
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                ['Valor original', viewing.value != null ? brl(viewing.value) : '—', 'Contrato base', 'text-blue-600 dark:text-blue-400'],
                ['Aditivos', brl(Number(viewing.addendaTotal) || 0), 'Acréscimos', 'text-amber-600 dark:text-amber-400'],
                ['Valor total', brl(totalOf(viewing)), 'Contrato + aditivos', 'text-emerald-600 dark:text-emerald-400'],
              ].map(([label, value, hint, tone]) => (
                <div key={label} className="rounded-xl border border-gray-200 p-4 text-center dark:border-gray-700">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</p>
                  <p className={`mt-1 text-xl font-bold tabular-nums ${tone}`}>{value}</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">{hint}</p>
                </div>
              ))}
            </div>

            <div className="flex gap-1 border-b border-gray-200 dark:border-gray-700">
              {([
                ['info', 'Informações gerais', Info, null],
                ['aditivos', 'Aditivos', FilePlus2, viewing.addenda.length],
                ['cat', 'CAT', BadgeCheck, viewing.cats.length],
              ] as const).map(([key, label, Icon, count]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setViewTab(key)}
                  className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                    viewTab === key
                      ? 'border-red-600 text-red-600 dark:border-red-400 dark:text-red-400'
                      : 'border-transparent text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-100'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                  {count !== null ? (
                    <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-700 dark:bg-gray-700 dark:text-gray-200">{count}</span>
                  ) : null}
                </button>
              ))}
            </div>

            {viewTab === 'info' ? (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-gray-200 dark:border-gray-700">
                  <h4 className="border-b border-gray-200 px-4 py-3 text-sm font-bold text-gray-900 dark:border-gray-700 dark:text-gray-100">Informações básicas</h4>
                  <dl className="space-y-3 p-4 text-sm">
                    {[
                      ['Contratante', viewing.contractorName],
                      ['Nº do contrato', viewing.contractNumber],
                      ['ARTs', viewing.arts.map((a) => [a.professional ? `${a.art || 'Sem número'} — ${a.professional}` : a.art, a.baixada ? `Baixada: ${a.baixada}` : ''].filter(Boolean).join(' · ')).filter(Boolean).join('\n') || '—'],
                      ['CPF/CNPJ', viewing.document || '—'],
                      ['Estado', viewing.uf ? `${UF_NAMES[viewing.uf] ?? viewing.uf} (${viewing.uf})` : '—'],
                      ['Assinado em', dateBr(viewing.signedAt)],
                      ['Observações', viewing.notes || '—'],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-xs text-gray-500 dark:text-gray-400">{k}</dt>
                        <dd className="whitespace-pre-line font-medium text-gray-900 dark:text-gray-100">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <div className="rounded-xl border border-gray-200 dark:border-gray-700">
                  <h4 className="border-b border-gray-200 px-4 py-3 text-sm font-bold text-gray-900 dark:border-gray-700 dark:text-gray-100">Informações financeiras e prazos</h4>
                  <dl className="grid grid-cols-2 gap-3 p-4 text-sm">
                    {[
                      ['Valor do contrato', viewing.value != null ? brl(viewing.value) : '—'],
                      ['Valor aditivo', brl(Number(viewing.addendaTotal) || 0)],
                      ['Valor total', brl(totalOf(viewing))],
                      ['Garantia', viewing.guarantee || '—'],
                      ['Início', dateBr(viewing.startDate)],
                      ['Término do contrato', dateBr(viewing.endDate)],
                      ['Término em vigor (com aditivos)', dateBr(effectiveEnd(viewing))],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-xs text-gray-500 dark:text-gray-400">{k}</dt>
                        <dd className="font-semibold tabular-nums text-gray-900 dark:text-gray-100">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            ) : viewTab === 'aditivos' ? (
              <div className="space-y-4">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    addAddendumMutation.mutate();
                  }}
                  className="grid grid-cols-1 gap-3 sm:grid-cols-3"
                >
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Contrato / Aditivo</span>
                    <input value={addNumber} onChange={(e) => setAddNumber(e.target.value)} placeholder="Ex.: 1º TA" className={FORM_FIELD_INPUT_CLS} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">CPF/CNPJ</span>
                    <input value={addDocument} onChange={(e) => setAddDocument(e.target.value)} className={FORM_FIELD_INPUT_CLS} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Valor (R$)</span>
                    <input value={addAmount} onChange={(e) => setAddAmount(maskCurrencyInputBrOrEmpty(e.target.value))} inputMode="decimal" placeholder="0,00" className={FORM_FIELD_INPUT_CLS} />
                  </label>
                  <div>
                    <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Assinado em</span>
                    <TypedDateField value={addSignedAt} onChange={setAddSignedAt} ariaLabel="Assinado em" />
                  </div>
                  <div>
                    <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Início</span>
                    <TypedDateField value={addStart} onChange={setAddStart} ariaLabel="Início do aditivo" />
                  </div>
                  <div>
                    <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Término</span>
                    <TypedDateField value={addEnd} onChange={setAddEnd} ariaLabel="Término do aditivo" />
                  </div>
                  <div>
                    <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Garantia</span>
                    <StringSingleSelectDropdown
                      value={addGuarantee}
                      onChange={setAddGuarantee}
                      options={addGuaranteeOptions}
                      allowEmpty
                      emptyOptionLabel="Sem informação"
                      placeholder="Selecione"
                      disableSearch
                      matchTriggerWidth
                      className="w-full"
                    />
                  </div>
                  <ArtsEditor value={addArts} onChange={setAddArts} artOptions={artOptions} />
                  <label className="block sm:col-span-3">
                    <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Observações</span>
                    <input value={addNote} onChange={(e) => setAddNote(e.target.value)} className={FORM_FIELD_INPUT_CLS} />
                  </label>
                  <div className="flex items-center justify-between gap-3 sm:col-span-3">
                    <p className="text-xs text-gray-500 dark:text-gray-400">Informe pelo menos o início ou a data de assinatura. Um término maior prorroga o contrato.</p>
                    <div className="flex shrink-0 items-center gap-2">
                      {editingAddendumId ? (
                        <button
                          type="button"
                          onClick={resetAddendumForm}
                          disabled={addAddendumMutation.isPending}
                          className="h-10 rounded-lg bg-gray-100 px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                        >
                          Cancelar edição
                        </button>
                      ) : null}
                      <button
                        type="submit"
                        disabled={addAddendumMutation.isPending}
                        className="flex h-10 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60"
                      >
                        {addAddendumMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : editingAddendumId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                        {editingAddendumId ? 'Salvar alterações' : 'Adicionar aditivo'}
                      </button>
                    </div>
                  </div>
                </form>

                  <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                    <table className="w-full min-w-[1040px] text-sm">
                      <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500 dark:bg-gray-900/40 dark:text-gray-400">
                        <tr>
                          <th className="px-3 py-2 text-center font-medium">Contrato / Aditivo</th>
                          <th className="px-3 py-2 text-center font-medium">ART</th>
                          <th className="px-3 py-2 text-left font-medium">Profissional</th>
                          <th className="px-3 py-2 text-center font-medium">Baixada</th>
                          <th className="px-3 py-2 text-center font-medium">CPF/CNPJ</th>
                          <th className="px-3 py-2 text-center font-medium">Assinado em</th>
                          <th className="px-3 py-2 text-center font-medium">Valor</th>
                          <th className="px-3 py-2 text-center font-medium">Início</th>
                          <th className="px-3 py-2 text-center font-medium">Término</th>
                          <th className="px-3 py-2 text-center font-medium">Garantia</th>
                          <th className="px-3 py-2 text-left font-medium">Observações</th>
                          <th className="px-3 py-2 text-right font-medium">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700/80">
                        <tr className="bg-gray-50 text-gray-900 dark:bg-gray-900/30 dark:text-gray-100">
                          <td className="whitespace-nowrap px-3 py-2 text-center font-bold">CONTRATO</td>
                          <td className="whitespace-pre-line px-3 py-2 text-center">{artsLines(viewing.arts, 'art') || '—'}</td>
                          <td className="whitespace-pre-line px-3 py-2">{artsLines(viewing.arts, 'professional') || '—'}</td>
                          <td className="whitespace-pre-line px-3 py-2 text-center">{viewing.arts.length ? artsLinesAll(viewing.arts, 'baixada') : '—'}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-center">{viewing.document || '—'}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-center">{dateBr(viewing.signedAt)}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-center tabular-nums">{viewing.value != null ? brl(viewing.value) : '—'}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-center">{dateBr(viewing.startDate)}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-center">{dateBr(viewing.endDate)}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-center">{viewing.guarantee || '—'}</td>
                          <td className="max-w-[220px] truncate px-3 py-2 text-gray-600 dark:text-gray-300" title={viewing.notes ?? ''}>{viewing.notes || '—'}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => {
                                const r = viewing;
                                setViewingId(null);
                                openEdit(r);
                              }}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                              title="Editar dados do contrato"
                              aria-label="Editar dados do contrato"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                        {viewing.addenda.map((a) => (
                          <tr key={a.id} className="text-gray-900 dark:text-gray-100">
                            <td className="whitespace-nowrap px-3 py-2 text-center font-medium">{a.addendumNumber || '—'}</td>
                            <td className="whitespace-pre-line px-3 py-2 text-center">{artsLines(a.arts, 'art') || '—'}</td>
                            <td className="whitespace-pre-line px-3 py-2">{artsLines(a.arts, 'professional') || '—'}</td>
                            <td className="whitespace-pre-line px-3 py-2 text-center">{a.arts.length ? artsLinesAll(a.arts, 'baixada') : '—'}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-center">{a.document || '—'}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-center">{dateBr(a.signedAt)}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-center tabular-nums">{Math.abs(a.amount) < 1e-9 ? 'Sem valor' : `${a.amount >= 0 ? '+' : ''}${brl(a.amount)}`}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-center">{dateBr(a.startDate)}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-center">{dateBr(a.endDate)}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-center">{a.guarantee || '—'}</td>
                            <td className="max-w-[220px] truncate px-3 py-2 text-gray-600 dark:text-gray-300" title={a.note ?? ''}>{a.note || '—'}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => startEditAddendum(a)}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                                title="Editar aditivo"
                                aria-label="Editar aditivo"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (window.confirm('Excluir este aditivo?')) deleteAddendumMutation.mutate(a.id);
                                }}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                                title="Excluir aditivo"
                                aria-label="Excluir aditivo"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                {viewing.addenda.length === 0 ? (
                  <p className="text-center text-sm text-gray-500 dark:text-gray-400">
                    Nenhum aditivo cadastrado. Os aditivos aparecerão abaixo do contrato.
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="space-y-4">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    saveCatMutation.mutate();
                  }}
                  className="grid grid-cols-1 gap-3 sm:grid-cols-2"
                >
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Nº CAT *</span>
                    <input value={catNumber} onChange={(e) => setCatNumber(e.target.value)} className={FORM_FIELD_INPUT_CLS} />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Profissional</span>
                    <input
                      list="cat-professionals"
                      value={catProfessional}
                      onChange={(e) => setCatProfessional(e.target.value)}
                      className={FORM_FIELD_INPUT_CLS}
                    />
                    <datalist id="cat-professionals">
                      {Array.from(
                        new Set(
                          [...viewing.arts, ...viewing.addenda.flatMap((a) => a.arts)].map((a) => a.professional).filter(Boolean),
                        ),
                      ).map((p) => (
                        <option key={p} value={p} />
                      ))}
                    </datalist>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Protocolo</span>
                    <input value={catProtocol} onChange={(e) => setCatProtocol(e.target.value)} className={FORM_FIELD_INPUT_CLS} />
                  </label>
                  <div>
                    <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Data de emissão</span>
                    <TypedDateField value={catIssuedAt} onChange={setCatIssuedAt} ariaLabel="Data de emissão da CAT" />
                  </div>
                  <div className="flex items-center justify-end gap-2 sm:col-span-2">
                    {editingCatId ? (
                      <button
                        type="button"
                        onClick={resetCatForm}
                        disabled={saveCatMutation.isPending}
                        className="h-10 rounded-lg bg-gray-100 px-4 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600"
                      >
                        Cancelar edição
                      </button>
                    ) : null}
                    <button
                      type="submit"
                      disabled={saveCatMutation.isPending}
                      className="flex h-10 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-60"
                    >
                      {saveCatMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : editingCatId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                      {editingCatId ? 'Salvar alterações' : 'Adicionar CAT'}
                    </button>
                  </div>
                </form>

                {viewing.cats.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-gray-300 py-10 text-center dark:border-gray-600">
                    <BadgeCheck className="h-10 w-10 text-gray-400" />
                    <p className="text-base font-semibold text-gray-600 dark:text-gray-300">Nenhuma CAT cadastrada</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">As CATs aparecerão aqui quando forem adicionadas ao contrato.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500 dark:bg-gray-900/40 dark:text-gray-400">
                        <tr>
                          <th className="px-3 py-2 text-center font-medium">Nº CAT</th>
                          <th className="px-3 py-2 text-left font-medium">Profissional</th>
                          <th className="px-3 py-2 text-center font-medium">Protocolo</th>
                          <th className="px-3 py-2 text-center font-medium">Data de emissão</th>
                          <th className="px-3 py-2 text-right font-medium">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700/80">
                        {viewing.cats.map((c) => (
                          <tr key={c.id} className="text-gray-900 dark:text-gray-100">
                            <td className="whitespace-nowrap px-3 py-2 text-center font-medium">{c.catNumber}</td>
                            <td className="px-3 py-2">{c.professional || '—'}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-center">{c.protocol || '—'}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-center">{dateBr(c.issuedAt)}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingCatId(c.id);
                                  setCatNumber(c.catNumber);
                                  setCatProfessional(c.professional ?? '');
                                  setCatProtocol(c.protocol ?? '');
                                  setCatIssuedAt(c.issuedAt ?? '');
                                }}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
                                title="Editar CAT"
                                aria-label="Editar CAT"
                              >
                                <Pencil className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (window.confirm('Excluir esta CAT?')) deleteCatMutation.mutate(c.id);
                                }}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
                                title="Excluir CAT"
                                aria-label="Excluir CAT"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : null}
      </Modal>

      <Modal isOpen={isFiltersOpen} onClose={() => setIsFiltersOpen(false)} title="Filtros — Controle de Contratos" size="md">
        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Estado</label>
            <StringSingleSelectDropdown
              value={ufFilter}
              onChange={setUfFilter}
              options={[
                ...Object.entries(UF_NAMES).map(([uf, name]) => ({ value: uf, label: `${name} (${uf})` })),
                { value: NO_UF, label: 'Sem estado definido' },
              ]}
              allowEmpty
              emptyOptionLabel="Todos os estados"
              placeholder="Todos os estados"
              searchPlaceholder="Pesquisar estado..."
              className="w-full"
            />
          </div>
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">Situação</label>
            <StringSingleSelectDropdown
              value={statusFilter}
              onChange={setStatusFilter}
              options={(Object.keys(STATUS_LABEL) as ContractStatus[]).map((k) => ({ value: k, label: STATUS_LABEL[k] }))}
              allowEmpty
              emptyOptionLabel="Todas"
              placeholder="Todas"
              disableSearch
              className="w-full"
            />
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
            <button
              type="button"
              onClick={() => {
                setUfFilter('');
                setStatusFilter('');
              }}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              Limpar filtros
            </button>
            <button
              type="button"
              onClick={() => setIsFiltersOpen(false)}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100 dark:border-red-800/60 dark:bg-red-950/30 dark:text-red-300 dark:hover:bg-red-900/40"
            >
              Aplicar
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={editing !== null}
        onClose={() => {
          if (!saveMutation.isPending) setEditing(null);
        }}
        title={editing === 'new' ? 'Novo contrato' : 'Editar contrato'}
        size="2xl"
        confirmBeforeClose
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveMutation.mutate();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Nome do contratante *</span>
              <input value={form.contractorName} onChange={(e) => set('contractorName', e.target.value)} className={FORM_FIELD_INPUT_CLS} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Estado</span>
              <select value={form.uf} onChange={(e) => set('uf', e.target.value)} className={FORM_FIELD_INPUT_CLS}>
                <option value="">Sem estado definido</option>
                {Object.entries(UF_NAMES).map(([uf, name]) => (
                  <option key={uf} value={uf}>{`${name} (${uf})`}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Contrato *</span>
              <input value={form.contractNumber} onChange={(e) => set('contractNumber', e.target.value)} className={FORM_FIELD_INPUT_CLS} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">CPF/CNPJ</span>
              <input value={form.document} onChange={(e) => set('document', e.target.value)} className={FORM_FIELD_INPUT_CLS} />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Valor do contrato (R$)</span>
              <input value={form.value} onChange={(e) => set('value', maskCurrencyInputBrOrEmpty(e.target.value))} inputMode="decimal" placeholder="0,00" className={FORM_FIELD_INPUT_CLS} />
            </label>
            <div>
              <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Assinado em</span>
              <TypedDateField value={form.signedAt} onChange={(v) => set('signedAt', v)} ariaLabel="Assinado em" />
            </div>
            <div>
              <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Início</span>
              <TypedDateField value={form.startDate} onChange={(v) => set('startDate', v)} ariaLabel="Início" />
            </div>
            <div>
              <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Término</span>
              <TypedDateField value={form.endDate} onChange={(v) => set('endDate', v)} ariaLabel="Término" />
            </div>
            <ArtsEditor value={form.arts} onChange={(next) => set('arts', next)} artOptions={artOptions} />
            <div className="sm:col-span-3">
              <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Garantia</span>
              <StringSingleSelectDropdown
                value={form.guarantee}
                onChange={(v) => set('guarantee', v)}
                options={guaranteeOptions}
                allowEmpty
                emptyOptionLabel="Sem informação"
                placeholder="Selecione"
                disableSearch
                matchTriggerWidth
                className="w-full"
              />
            </div>
            <label className="block sm:col-span-3">
              <span className="mb-1 block text-xs font-medium text-gray-600 dark:text-gray-400">Observações</span>
              <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} className={FORM_FIELD_INPUT_CLS} />
            </label>
          </div>
          <div className="flex items-center justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
            <button type="button" onClick={() => setEditing(null)} disabled={saveMutation.isPending} className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600">
              Cancelar
            </button>
            <button type="submit" disabled={saveMutation.isPending} className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60">
              {saveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Salvar
            </button>
          </div>
        </form>
      </Modal>
    </MainLayout>
  );
}

export default function ControleContratosRoute() {
  return (
    <ProtectedRoute route="/ponto/controle-contratos">
      <ControleContratosPage />
    </ProtectedRoute>
  );
}
