'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { FORM_FIELD_INPUT_CLS, FORM_FIELD_TEXTAREA_CLS } from '@/lib/formFieldUi';

export type TapRow3 = { a: string; b: string; c: string };
export type TapRisk = { risk: string; probability: string; impact: string; response: string };
export type TapData = {
  managerName: string;
  sponsorName: string;
  justification: string;
  objectives: string;
  scopeIn: string;
  scopeOut: string;
  deliverables: TapRow3[];
  assumptions: string;
  risks: TapRisk[];
  stakeholders: TapRow3[];
};

export const EMPTY_TAP: TapData = {
  managerName: '',
  sponsorName: '',
  justification: '',
  objectives: '',
  scopeIn: '',
  scopeOut: '',
  deliverables: [],
  assumptions: '',
  risks: [],
  stakeholders: [],
};

/** Campos sem os quais o TAP não é gerado. */
const REQUIRED: Array<{ key: keyof TapData; label: string }> = [
  { key: 'managerName', label: 'Gerente do projeto' },
  { key: 'justification', label: 'Justificativa' },
  { key: 'objectives', label: 'Objetivos' },
  { key: 'scopeIn', label: 'Escopo (o que está incluído)' },
];

export function tapMissing(tap: TapData | null | undefined): string[] {
  const t = tap ?? EMPTY_TAP;
  return REQUIRED.filter((f) => !String(t[f.key] ?? '').trim()).map((f) => f.label);
}

// Exemplos mostrados como sugestão (Tab para usar).
const EX = {
  managerName: 'Nome do gerente do projeto',
  sponsorName: 'Diretoria da Gennesis',
  justification:
    'O contratante necessita de serviços de engenharia para manutenção e adequação de suas unidades, de forma contínua e dentro dos prazos acordados. A contratação garante a regularidade técnica das instalações e reduz o risco de paralisação das atividades.',
  objectives:
    'Atender 100% das ordens de serviço emitidas pelo contratante durante a vigência.\nCumprir os prazos de execução acordados em cada ordem de serviço.\nManter as ARTs e a documentação técnica regulares durante todo o contrato.',
  scopeIn: 'Manutenção predial preventiva e corretiva das unidades do contratante.\nReformas e adequações solicitadas por ordem de serviço.',
  scopeOut: 'Obras novas e ampliações que não constem do contrato.\nFornecimento de equipamentos de uso exclusivo do contratante.',
  assumptions:
    'Premissa: o contratante libera o acesso às unidades nos dias combinados.\nPremissa: as ordens de serviço chegam por escrito, com descrição e prazo.\nRestrição: o valor global não pode ser ultrapassado sem aditivo.',
  deliverables: [
    { a: 'Plano de execução e cronograma das ordens de serviço', b: '30 dias após a assinatura', c: 'Gerente do projeto' },
    { a: 'Relatório mensal de serviços executados', b: 'Todo mês, até o dia 10', c: 'Engenharia' },
  ] as TapRow3[],
  risks: [
    { risk: 'Atraso na liberação de acesso às unidades', probability: 'Média', impact: 'Alto', response: 'Alinhar calendário de acessos' },
    { risk: 'Falta de ART ou ART não baixada', probability: 'Baixa', impact: 'Alto', response: 'Conferir as ARTs antes de cada O.S.' },
  ] as TapRisk[],
  stakeholders: [
    { a: 'Contratante', b: 'Cliente', c: 'Prazo e qualidade contratados' },
    { a: 'Diretoria da Gennesis', b: 'Patrocinador', c: 'Resultado e relacionamento' },
  ] as TapRow3[],
};

const same = (a: string, b: string) => a.trim() === b.trim();

/** Campo de texto com exemplo: Tab (campo vazio) transforma o exemplo em texto editável. */
function ExampleField({
  value,
  onChange,
  example,
  rows,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  example: string;
  rows?: number;
  invalid?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const use = () => {
    onChange(example);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.select();
    });
  };
  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab' && !e.shiftKey && value === '') {
      e.preventDefault();
      use();
    }
  };
  const cls = `${rows ? FORM_FIELD_TEXTAREA_CLS : FORM_FIELD_INPUT_CLS} ${invalid ? '!border-red-400' : ''}`;
  return (
    <div>
      {rows ? (
        <textarea
          ref={ref}
          rows={rows}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKey}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={example}
          className={cls}
        />
      ) : (
        <input
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKey}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={example}
          className={cls}
        />
      )}
      {value === '' ? (
        <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">
          {focused ? 'Pressione Tab para usar o exemplo, ou comece a digitar.' : null}
          {!focused ? (
            <button type="button" onClick={use} className="font-medium text-blue-600 hover:underline dark:text-blue-400">
              Usar exemplo
            </button>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}

function Field({ label, required, missing, children }: { label: string; required?: boolean; missing?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-700 dark:text-gray-300">
        {label}
        {required ? <span className="text-red-500"> *</span> : null}
        {missing ? <span className="ml-2 font-semibold text-red-500">preencha</span> : null}
      </label>
      {children}
    </div>
  );
}

/** Editor de linhas (tabela). Fora do modal para não perder o foco ao digitar. */
function RowsEditor<T extends Record<string, string>>({
  rows,
  onChange,
  columns,
  example,
  empty,
}: {
  rows: T[];
  onChange: (rows: T[]) => void;
  columns: Array<{ key: keyof T & string; label: string; width: string }>;
  example: T[];
  empty: T;
}) {
  const update = (i: number, key: keyof T & string, v: string) => onChange(rows.map((r, k) => (k === i ? { ...r, [key]: v } : r)));
  const rowEmpty = (r: T) => columns.every((c) => !r[c.key]);
  return (
    <div className="space-y-2">
      {rows.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Nenhuma linha ainda.{' '}
          <button type="button" onClick={() => onChange(example.map((r) => ({ ...r })))} className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            Usar exemplo
          </button>{' '}
          ou{' '}
          <button type="button" onClick={() => onChange([{ ...empty }])} className="font-medium text-blue-600 hover:underline dark:text-blue-400">
            adicionar uma linha
          </button>
          .
        </p>
      ) : null}
      {rows.map((r, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="grid flex-1 gap-2" style={{ gridTemplateColumns: columns.map((c) => c.width).join(' ') }}>
            {columns.map((c, ci) => (
              <input
                key={c.key}
                value={r[c.key]}
                onChange={(e) => update(i, c.key, e.target.value)}
                onKeyDown={(e) => {
                  // Tab na 1ª célula de uma linha vazia: preenche a linha com o exemplo correspondente
                  if (ci === 0 && e.key === 'Tab' && !e.shiftKey && rowEmpty(r) && example[i]) {
                    e.preventDefault();
                    onChange(rows.map((x, k) => (k === i ? { ...example[i] } : x)));
                  }
                }}
                placeholder={example[Math.min(i, example.length - 1)]?.[c.key] ?? c.label}
                aria-label={c.label}
                className={FORM_FIELD_INPUT_CLS}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => onChange(rows.filter((_, k) => k !== i))}
            className="mt-1 rounded-md p-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30"
            aria-label="Remover linha"
            title="Remover linha"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      {rows.length > 0 ? (
        <button type="button" onClick={() => onChange([...rows, { ...empty }])} className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">
          <Plus className="h-3.5 w-3.5" /> Adicionar linha
        </button>
      ) : null}
    </div>
  );
}

export function TapModal({
  contract,
  onClose,
  onSaved,
}: {
  contract: { id: string; contractNumber: string; contractorName: string; tap?: TapData | null } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<TapData>(EMPTY_TAP);
  const [busy, setBusy] = useState<'save' | 'generate' | null>(null);
  const [tried, setTried] = useState(false);

  useEffect(() => {
    if (contract) {
      setForm({ ...EMPTY_TAP, ...(contract.tap ?? {}) });
      setTried(false);
    }
  }, [contract]);

  const missing = useMemo(() => tapMissing(form), [form]);
  const set = <K extends keyof TapData>(k: K, v: TapData[K]) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!contract) return false;
    try {
      await api.patch(`/contract-registry/${contract.id}`, { tap: form });
      onSaved();
      return true;
    } catch (e) {
      const d = (e as { response?: { data?: { message?: string; error?: string } } })?.response?.data;
      toast.error(d?.message || d?.error || 'Não foi possível salvar o TAP.');
      return false;
    }
  };

  /** Campos que continuam idênticos ao exemplo, sem nenhuma edição. */
  const untouchedExamples = (): string[] => {
    const out: string[] = [];
    if (form.managerName && same(form.managerName, EX.managerName)) out.push('Gerente do projeto');
    if (form.sponsorName && same(form.sponsorName, EX.sponsorName)) out.push('Patrocinador');
    const textos: Array<[string, string, string]> = [
      ['Justificativa', form.justification, EX.justification],
      ['Objetivos', form.objectives, EX.objectives],
      ['Escopo incluído', form.scopeIn, EX.scopeIn],
      ['Fora do escopo', form.scopeOut, EX.scopeOut],
      ['Premissas e restrições', form.assumptions, EX.assumptions],
    ];
    textos.forEach(([l, v, e]) => {
      if (v && same(v, e)) out.push(l);
    });
    const rowsEq = (rows: Array<Record<string, string>>, ex: Array<Record<string, string>>) =>
      rows.length > 0 && JSON.stringify(rows) === JSON.stringify(ex);
    if (rowsEq(form.deliverables as never, EX.deliverables as never)) out.push('Entregas principais');
    if (rowsEq(form.risks as never, EX.risks as never)) out.push('Riscos iniciais');
    if (rowsEq(form.stakeholders as never, EX.stakeholders as never)) out.push('Partes interessadas');
    return out;
  };

  const saveOnly = async () => {
    setBusy('save');
    const ok = await save();
    setBusy(null);
    if (ok) {
      toast.success('TAP salvo.');
      onClose();
    }
  };

  const saveAndGenerate = async () => {
    if (!contract) return;
    setTried(true);
    if (missing.length) {
      toast.error(`Preencha: ${missing.join(', ')}.`);
      return;
    }
    const untouched = untouchedExamples();
    if (untouched.length && !window.confirm(`Estes campos ainda estão com o texto de exemplo, sem edição:\n\n• ${untouched.join('\n• ')}\n\nGerar o TAP mesmo assim?`)) {
      return;
    }
    setBusy('generate');
    try {
      if (!(await save())) return;
      const res = await api.post(`/contract-registry/${contract.id}/tap-pdf`, {}, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `TAP - Contrato ${contract.contractNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success('TAP gerado.');
      onClose();
    } catch {
      toast.error('Não foi possível gerar o TAP.');
    } finally {
      setBusy(null);
    }
  };

  const isMissing = (label: string) => tried && missing.includes(label);

  return (
    <Modal isOpen={!!contract} onClose={onClose} title={contract ? `TAP - Contrato ${contract.contractNumber}` : 'TAP'} size="xl">
      {contract ? (
        <div className="space-y-5">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {contract.contractorName}. Os dados do contrato (valores, prazos, ARTs) entram sozinhos no documento. Preencha abaixo o que é específico do TAP. Nos campos vazios, use <strong>Tab</strong> para aproveitar o exemplo e depois edite.
          </p>
          {missing.length ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/20 dark:text-amber-100">
              Para gerar o TAP, falta preencher: <strong>{missing.join(', ')}</strong>.
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Gerente do projeto" required missing={isMissing('Gerente do projeto')}>
              <ExampleField value={form.managerName} onChange={(v) => set('managerName', v)} example={EX.managerName} invalid={isMissing('Gerente do projeto')} />
            </Field>
            <Field label="Patrocinador">
              <ExampleField value={form.sponsorName} onChange={(v) => set('sponsorName', v)} example={EX.sponsorName} />
            </Field>
          </div>

          <Field label="Justificativa" required missing={isMissing('Justificativa')}>
            <ExampleField rows={4} value={form.justification} onChange={(v) => set('justification', v)} example={EX.justification} invalid={isMissing('Justificativa')} />
          </Field>
          <Field label="Objetivos (um por linha)" required missing={isMissing('Objetivos')}>
            <ExampleField rows={4} value={form.objectives} onChange={(v) => set('objectives', v)} example={EX.objectives} invalid={isMissing('Objetivos')} />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Escopo: o que está incluído (um por linha)" required missing={isMissing('Escopo (o que está incluído)')}>
              <ExampleField rows={4} value={form.scopeIn} onChange={(v) => set('scopeIn', v)} example={EX.scopeIn} invalid={isMissing('Escopo (o que está incluído)')} />
            </Field>
            <Field label="Escopo: o que fica fora (um por linha)">
              <ExampleField rows={4} value={form.scopeOut} onChange={(v) => set('scopeOut', v)} example={EX.scopeOut} />
            </Field>
          </div>

          <Field label="Entregas principais">
            <RowsEditor<TapRow3 & Record<string, string>>
              rows={form.deliverables}
              onChange={(rows) => set('deliverables', rows)}
              columns={[
                { key: 'a', label: 'Entrega', width: '2fr' },
                { key: 'b', label: 'Prazo', width: '1fr' },
                { key: 'c', label: 'Responsável', width: '1fr' },
              ]}
              example={EX.deliverables}
              empty={{ a: '', b: '', c: '' }}
            />
          </Field>

          <Field label="Premissas e restrições (uma por linha)">
            <ExampleField rows={4} value={form.assumptions} onChange={(v) => set('assumptions', v)} example={EX.assumptions} />
          </Field>

          <Field label="Riscos iniciais">
            <RowsEditor<TapRisk & Record<string, string>>
              rows={form.risks}
              onChange={(rows) => set('risks', rows)}
              columns={[
                { key: 'risk', label: 'Risco', width: '2fr' },
                { key: 'probability', label: 'Probabilidade', width: '1fr' },
                { key: 'impact', label: 'Impacto', width: '1fr' },
                { key: 'response', label: 'Resposta', width: '2fr' },
              ]}
              example={EX.risks}
              empty={{ risk: '', probability: '', impact: '', response: '' }}
            />
          </Field>

          <Field label="Partes interessadas">
            <RowsEditor<TapRow3 & Record<string, string>>
              rows={form.stakeholders}
              onChange={(rows) => set('stakeholders', rows)}
              columns={[
                { key: 'a', label: 'Parte', width: '1fr' },
                { key: 'b', label: 'Papel', width: '1fr' },
                { key: 'c', label: 'Interesse', width: '2fr' },
              ]}
              example={EX.stakeholders}
              empty={{ a: '', b: '', c: '' }}
            />
          </Field>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-200 pt-4 dark:border-gray-700">
            <Button type="button" variant="outline" onClick={onClose} disabled={busy !== null}>
              Cancelar
            </Button>
            <Button type="button" variant="outline" onClick={() => void saveOnly()} disabled={busy !== null}>
              {busy === 'save' ? 'Salvando...' : 'Salvar'}
            </Button>
            <Button type="button" onClick={() => void saveAndGenerate()} disabled={busy !== null}>
              {busy === 'generate' ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Gerando...
                </>
              ) : (
                'Salvar e gerar TAP'
              )}
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
