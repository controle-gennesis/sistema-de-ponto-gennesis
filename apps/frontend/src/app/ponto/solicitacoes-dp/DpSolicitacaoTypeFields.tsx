'use client';

import React from 'react';
import { Paperclip, Upload, X } from 'lucide-react';
import { Input as BaseInput } from '@/components/ui/Input';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { DateTimePickerField } from '@/components/ui/DateTimePickerField';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import type { MultiSelectSearchOption } from '@/components/ui/MultiSelectSearchDropdown';
import { QuantityStepperInput } from '@/components/ui/QuantityStepperInput';
import { DEPARTMENTS_LIST } from '@/constants/payrollFilters';
import { CARGOS_AVAILABLE } from '@/constants/cargos';
import { maskCurrencyInputBrOrEmpty } from '@/lib/maskCurrencyBr';
import { DP_SOLICITACOES_NO_FOCUS_CLS } from '@/lib/dpSolicitacoesUi';

export type DpFormRequestType =
  | 'ADMISSAO'
  | 'ADVERTENCIA_SUSPENSAO'
  | 'ALTERACAO_FUNCAO_SALARIO'
  | 'ATESTADO_MEDICO'
  | 'BENEFICIOS_VIAGEM'
  | 'FERIAS'
  | 'HORA_EXTRA'
  | 'OUTRAS_SOLICITACOES'
  | 'RESCISAO'
  | 'RETIFICACAO_ALOCACAO';

type PayrollEmp = { id: string; name: string };

const fieldBox =
  `w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 text-sm appearance-none ${DP_SOLICITACOES_NO_FOCUS_CLS}`;
const labelCls = 'block text-sm font-medium mb-1 text-gray-800 dark:text-gray-200';
const taCls = `${fieldBox} min-h-[100px] resize-y`;
const inputFieldCls = `border-gray-300 dark:border-gray-600 ${DP_SOLICITACOES_NO_FOCUS_CLS}`;
const Input = (props: React.ComponentProps<typeof BaseInput>) => (
  <BaseInput
    {...props}
    className={[inputFieldCls, props.className].filter(Boolean).join(' ')}
  />
);

function DpFileAttachmentField({
  label,
  fileName,
  accept,
  onFileSelect,
}: {
  label: string;
  fileName: string;
  accept: string;
  onFileSelect: (file: File | null) => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  const clearFile = () => {
    onFileSelect(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div>
      <label className={labelCls}>{label}</label>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        accept={accept}
        onChange={(e) => onFileSelect(e.target.files?.[0] ?? null)}
      />
      {fileName ? (
        <div className="flex overflow-hidden rounded-lg border border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800">
          <div className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5">
            <Paperclip className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
            <span
              className="truncate text-sm font-medium text-gray-900 dark:text-gray-100"
              title={fileName}
            >
              {fileName}
            </span>
          </div>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="shrink-0 border-l border-gray-300 px-3 py-2.5 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-600"
          >
            Trocar
          </button>
          <button
            type="button"
            onClick={clearFile}
            className="shrink-0 border-l border-gray-300 px-3 py-2.5 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
            aria-label="Remover anexo"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          data-form-field-shell="true"
          onClick={() => inputRef.current?.click()}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50/60 px-4 py-6 text-center transition-colors hover:border-red-400 hover:bg-red-50/40 dark:border-gray-600 dark:bg-gray-800/40 dark:hover:border-red-500/50 dark:hover:bg-red-950/20"
        >
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-500 shadow-sm dark:bg-gray-700 dark:text-gray-300">
            <Upload className="h-5 w-5" />
          </span>
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">Escolher arquivo</span>
        </button>
      )}
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
  'aria-label': ariaLabel,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  'aria-label'?: string;
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <DatePickerField
        value={value}
        onChange={onChange}
        placeholder="dd/mm/aaaa"
        noFocusRing
        aria-label={ariaLabel ?? label}
      />
    </div>
  );
}

function toOptions(items: { value: string; label: string }[]): MultiSelectSearchOption[] {
  return items.map((item) => ({ value: item.value, label: item.label, searchText: item.label }));
}

function SearchSelectField({
  label,
  value,
  onChange,
  options,
  placeholder = 'Selecione...',
  allowEmpty = true,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: MultiSelectSearchOption[];
  placeholder?: string;
  allowEmpty?: boolean;
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <SingleSelectSearchDropdown
        value={value}
        onChange={onChange}
        options={options}
        allowEmpty={allowEmpty}
        placeholder={placeholder}
        searchPlaceholder="Pesquisar..."
        noFocusRing
      />
    </div>
  );
}

function EmployeeSearchSelect({
  label,
  value,
  onChange,
  employees,
}: {
  label: string;
  value: string;
  onChange: (id: string) => void;
  employees: PayrollEmp[];
}) {
  const options = React.useMemo<MultiSelectSearchOption[]>(
    () => employees.map((em) => ({ value: em.id, label: em.name, searchText: em.name })),
    [employees]
  );

  return (
    <SearchSelectField
      label={label}
      value={value}
      onChange={onChange}
      options={options}
      placeholder="Selecionar colaborador..."
    />
  );
}

const MOTIVO_CONTRATACAO = [
  { value: 'AUMENTO_QUADRO', label: 'Aumento de quadro' },
  { value: 'SUBSTITUICAO', label: 'Substituição' },
  { value: 'DEMANDA_TEMPORARIA', label: 'Demanda temporária / obra' },
  { value: 'OUTRO', label: 'Outro' },
];

const TIPO_AVISO = [
  { value: 'TRABALHADO', label: 'Trabalhado' },
  { value: 'INDENIZADO', label: 'Indenizado' },
  { value: 'PEDIDO_DEMISSAO', label: 'Pedido de demissão' },
  { value: 'OUTRO', label: 'Outro' },
];

const TIPO_RESCISAO = [
  { value: 'SEM_JUSTA_CAUSA', label: 'Sem justa causa' },
  { value: 'COM_JUSTA_CAUSA', label: 'Com justa causa' },
  { value: 'ACORDO', label: 'Acordo' },
  { value: 'CONTRATO_EXPERIENCIA', label: 'Contrato de experiência' },
  { value: 'OUTRO', label: 'Outro' },
];

const MOTIVO_CONTRATACAO_OPTIONS = toOptions(MOTIVO_CONTRATACAO);
const TIPO_AVISO_OPTIONS = toOptions(TIPO_AVISO);
const TIPO_RESCISAO_OPTIONS = toOptions(TIPO_RESCISAO);
const SETOR_OPTIONS = toOptions(DEPARTMENTS_LIST.map((s) => ({ value: s, label: s })));
const CARGO_OPTIONS = toOptions(CARGOS_AVAILABLE.map((c) => ({ value: c, label: c })));

function cargoOptionsWithCurrent(current: string): MultiSelectSearchOption[] {
  const trimmed = current.trim();
  if (trimmed && !CARGOS_AVAILABLE.includes(trimmed)) {
    return [{ value: trimmed, label: trimmed, searchText: trimmed }, ...CARGO_OPTIONS];
  }
  return CARGO_OPTIONS;
}

type AdmissaoCandidato = { nome: string; funcao: string; contato: string };

const ADMISSAO_MAX_CANDIDATOS = 30;

function emptyAdmissaoCandidato(): AdmissaoCandidato {
  return { nome: '', funcao: '', contato: '' };
}

function parseAdmissaoCandidatos(details: Record<string, unknown>): AdmissaoCandidato[] {
  const raw = details.candidatos;
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    if (!item || typeof item !== 'object') return emptyAdmissaoCandidato();
    const row = item as Record<string, unknown>;
    return {
      nome: String(row.nome ?? ''),
      funcao: String(row.funcao ?? ''),
      contato: String(row.contato ?? ''),
    };
  });
}

function AdmissaoCandidatosFields({
  details,
  patchDetails,
}: {
  details: Record<string, unknown>;
  patchDetails: (p: Record<string, unknown>) => void;
}) {
  const quantidadeRaw = details.quantidade;
  const quantidade =
    typeof quantidadeRaw === 'number'
      ? quantidadeRaw
      : parseInt(String(quantidadeRaw ?? ''), 10) || 0;
  const candidatos = parseAdmissaoCandidatos(details);

  const syncQuantidade = (nextQty: number) => {
    const qty = Math.max(0, Math.min(ADMISSAO_MAX_CANDIDATOS, nextQty));
    const next = [...candidatos];
    while (next.length < qty) next.push(emptyAdmissaoCandidato());
    while (next.length > qty) next.pop();
    patchDetails({ quantidade: qty, candidatos: next });
  };

  const updateCandidato = (index: number, field: keyof AdmissaoCandidato, value: string) => {
    const next = candidatos.map((row, i) => (i === index ? { ...row, [field]: value } : row));
    patchDetails({ candidatos: next });
  };

  return (
    <div className="space-y-4">
      <div className="max-w-[220px]">
        <label className={labelCls}>Quantidade *</label>
        <QuantityStepperInput
          required
          allowEmpty
          value={quantidade}
          min={1}
          max={ADMISSAO_MAX_CANDIDATOS}
          unit="pessoa(s)"
          placeholder="Ex.: 3"
          onChange={syncQuantidade}
        />
      </div>

      {quantidade > 0 ? (
        <div className="space-y-3">
          {candidatos.map((candidato, index) => (
            <div
              key={index}
              className="rounded-lg border border-gray-200 dark:border-gray-600 bg-gray-50/50 dark:bg-gray-800/40 p-4 space-y-3"
            >
              <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                Pessoa {index + 1}
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className={labelCls}>Nome *</label>
                  <Input
                    value={candidato.nome}
                    onChange={(e) => updateCandidato(index, 'nome', e.target.value)}
                    placeholder="Nome completo"
                    required
                  />
                </div>
                <div>
                  <label className={labelCls}>Função *</label>
                  <Input
                    value={candidato.funcao}
                    onChange={(e) => updateCandidato(index, 'funcao', e.target.value)}
                    placeholder="Ex.: Pedreiro"
                    required
                  />
                </div>
                <div>
                  <label className={labelCls}>Contato *</label>
                  <Input
                    value={candidato.contato}
                    onChange={(e) => updateCandidato(index, 'contato', e.target.value)}
                    placeholder="Telefone ou e-mail"
                    required
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Informe a quantidade para exibir os campos de nome, função e contato.
        </p>
      )}
    </div>
  );
}

type Props = {
  requestType: DpFormRequestType | '';
  details: Record<string, unknown>;
  patchDetails: (p: Record<string, unknown>) => void;
  employees: PayrollEmp[];
  setEmployeeId: (id: string) => void;
  onAtestadoFile: (file: File | null) => void;
  onHoraExtraFile: (file: File | null) => void;
  atestadoFileName: string;
  horaExtraFileName: string;
};

export function DpSolicitacaoTypeFields({
  requestType,
  details,
  patchDetails,
  employees,
  setEmployeeId,
  onAtestadoFile,
  onHoraExtraFile,
  atestadoFileName,
  horaExtraFileName,
}: Props) {
  const employeeIds = (details.employeeIds as string[] | undefined) ?? [];
  const selectedEmployeeId = employeeIds[0] ?? '';

  switch (requestType) {
    case '':
      return null;
    case 'ADMISSAO': {
      const setorAtual = ((details.setor as string) ?? '').trim();
      const setorForaDaLista = setorAtual && !DEPARTMENTS_LIST.includes(setorAtual);
      return (
        <div className="md:col-span-2 space-y-4">
          <AdmissaoCandidatosFields details={details} patchDetails={patchDetails} />
          <SearchSelectField
            label="Motivo da contratação *"
            value={(details.motivoContratacao as string) ?? ''}
            onChange={(motivoContratacao) => patchDetails({ motivoContratacao })}
            options={MOTIVO_CONTRATACAO_OPTIONS}
            placeholder="Selecione o motivo..."
          />
          <SearchSelectField
            label="Setor *"
            value={(details.setor as string) ?? ''}
            onChange={(setor) => patchDetails({ setor })}
            options={
              setorForaDaLista
                ? [{ value: setorAtual, label: setorAtual, searchText: setorAtual }, ...SETOR_OPTIONS]
                : SETOR_OPTIONS
            }
            placeholder="Selecione o setor..."
          />
          <div>
            <label className={labelCls}>Observação</label>
            <textarea
              className={taCls}
              placeholder="Informações complementares sobre a admissão (opcional)"
              value={(details.observacao as string) ?? ''}
              onChange={(e) => patchDetails({ observacao: e.target.value })}
            />
          </div>
        </div>
      );
    }

    case 'FERIAS':
      return (
        <div className="md:col-span-2 space-y-4">
          <EmployeeSearchSelect
            label="Colaborador *"
            value={(details.employeeId as string) ?? ''}
            onChange={(id) => patchDetails({ employeeId: id })}
            employees={employees}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DateField
              label="Data inicial *"
              value={(details.dataInicial as string) ?? ''}
              onChange={(dataInicial) => patchDetails({ dataInicial })}
            />
            <DateField
              label="Data final *"
              value={(details.dataFinal as string) ?? ''}
              onChange={(dataFinal) => patchDetails({ dataFinal })}
            />
          </div>
          <div>
            <label className={labelCls}>Observação</label>
            <textarea
              className={taCls}
              placeholder="Informações complementares sobre as férias (opcional)"
              value={(details.observacao as string) ?? ''}
              onChange={(e) => patchDetails({ observacao: e.target.value })}
            />
          </div>
        </div>
      );

    case 'RESCISAO':
      return (
        <div className="md:col-span-2 space-y-4">
          <EmployeeSearchSelect
            label="Colaborador *"
            value={(details.employeeId as string) ?? ''}
            onChange={(id) => patchDetails({ employeeId: id })}
            employees={employees}
          />
          <SearchSelectField
            label="Tipo de aviso *"
            value={(details.tipoAviso as string) ?? ''}
            onChange={(tipoAviso) => patchDetails({ tipoAviso })}
            options={TIPO_AVISO_OPTIONS}
            placeholder="Selecione o tipo de aviso..."
          />
          <SearchSelectField
            label="Tipo de rescisão *"
            value={(details.tipoRescisao as string) ?? ''}
            onChange={(tipoRescisao) => patchDetails({ tipoRescisao })}
            options={TIPO_RESCISAO_OPTIONS}
            placeholder="Selecione o tipo de rescisão..."
          />
          <div>
            <label className={labelCls}>Motivo *</label>
            <Input
              value={(details.motivo as string) ?? ''}
              onChange={(e) => patchDetails({ motivo: e.target.value })}
              placeholder="Ex.: Redução de quadro"
              required
            />
          </div>
          <div>
            <label className={labelCls}>Observações / particularidades</label>
            <textarea
              className={taCls}
              placeholder="Informações complementares sobre a rescisão (opcional)"
              value={(details.observacoes as string) ?? ''}
              onChange={(e) => patchDetails({ observacoes: e.target.value })}
            />
          </div>
        </div>
      );

    case 'ALTERACAO_FUNCAO_SALARIO':
      {
        const storedTipo = details.tipoAlteracaoFuncaoOuSalario as
          | 'FUNCAO'
          | 'SALARIO'
          | undefined;

        const looksLikeSalary =
          typeof details.funcaoSalarioAntigo === 'string' && /R\$\s*\d/.test(details.funcaoSalarioAntigo);

        const tipoAlteracao: 'FUNCAO' | 'SALARIO' = storedTipo ?? (looksLikeSalary ? 'SALARIO' : 'FUNCAO');

        const setTipoAlteracao = (next: 'FUNCAO' | 'SALARIO') => {
          patchDetails({
            tipoAlteracaoFuncaoOuSalario: next,
            funcaoSalarioAntigo: '',
            funcaoSalarioNovo: '',
          });
        };

        const funcaoAntiga = ((details.funcaoSalarioAntigo as string) ?? '').trim();
        const funcaoNova = ((details.funcaoSalarioNovo as string) ?? '').trim();

        return (
          <div className="md:col-span-2 space-y-4">
            <EmployeeSearchSelect
              label="Colaborador *"
              value={(details.employeeId as string) ?? ''}
              onChange={(id) => patchDetails({ employeeId: id })}
              employees={employees}
            />

            <div>
              <label className={labelCls}>Alteração de função ou salário *</label>
              <div className="flex gap-2">
                <ButtonSeg
                  active={tipoAlteracao === 'FUNCAO'}
                  onClick={() => setTipoAlteracao('FUNCAO')}
                  label="Função"
                />
                <ButtonSeg
                  active={tipoAlteracao === 'SALARIO'}
                  onClick={() => setTipoAlteracao('SALARIO')}
                  label="Salário"
                />
              </div>
            </div>

            {tipoAlteracao === 'FUNCAO' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <SearchSelectField
                  label="Função antiga *"
                  value={funcaoAntiga}
                  onChange={(funcaoSalarioAntigo) => patchDetails({ funcaoSalarioAntigo })}
                  options={cargoOptionsWithCurrent(funcaoAntiga)}
                  allowEmpty={false}
                  placeholder="Selecione a função..."
                />
                <SearchSelectField
                  label="Função nova *"
                  value={funcaoNova}
                  onChange={(funcaoSalarioNovo) => patchDetails({ funcaoSalarioNovo })}
                  options={cargoOptionsWithCurrent(funcaoNova)}
                  allowEmpty={false}
                  placeholder="Selecione a função..."
                />
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Salário antigo *</label>
                  <Input
                    value={(details.funcaoSalarioAntigo as string) ?? ''}
                    onChange={(e) =>
                      patchDetails({ funcaoSalarioAntigo: maskCurrencyInputBrOrEmpty(e.target.value) })
                    }
                    placeholder="R$ 2.500,00"
                    required
                  />
                </div>
                <div>
                  <label className={labelCls}>Salário novo *</label>
                  <Input
                    value={(details.funcaoSalarioNovo as string) ?? ''}
                    onChange={(e) =>
                      patchDetails({ funcaoSalarioNovo: maskCurrencyInputBrOrEmpty(e.target.value) })
                    }
                    placeholder="R$ 2.500,00"
                    required
                  />
                </div>
              </div>
            )}

            <div>
              <label className={labelCls}>Justificativa *</label>
              <textarea
                className={taCls}
                placeholder="Descreva o motivo da alteração de função ou salário..."
                value={(details.justificativa as string) ?? ''}
                onChange={(e) => patchDetails({ justificativa: e.target.value })}
                required
              />
            </div>
          </div>
        );
      }

    case 'ADVERTENCIA_SUSPENSAO':
      return (
        <div className="md:col-span-2 space-y-4">
          <EmployeeSearchSelect
            label="Colaborador *"
            value={(details.employeeId as string) ?? ''}
            onChange={(id) => patchDetails({ employeeId: id })}
            employees={employees}
          />
          <div>
            <label className={labelCls}>Punição *</label>
            <div className="flex gap-2">
              <ButtonSeg
                active={(details.punicao as string) === 'ADVERTENCIA'}
                onClick={() => patchDetails({ punicao: 'ADVERTENCIA' })}
                label="Advertência"
              />
              <ButtonSeg
                active={(details.punicao as string) === 'SUSPENSAO'}
                onClick={() => patchDetails({ punicao: 'SUSPENSAO' })}
                label="Suspensão"
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Motivo *</label>
            <textarea
              className={taCls}
              placeholder="Descreva o motivo da advertência ou suspensão..."
              value={(details.motivo as string) ?? ''}
              onChange={(e) => patchDetails({ motivo: e.target.value })}
              required
            />
          </div>
        </div>
      );

    case 'ATESTADO_MEDICO':
      return (
        <div className="md:col-span-2 space-y-4">
          <EmployeeSearchSelect
            label="Colaborador *"
            value={(details.employeeId as string) ?? ''}
            onChange={(id) => patchDetails({ employeeId: id })}
            employees={employees}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DateField
              label="Data inicial *"
              value={(details.dataInicial as string) ?? ''}
              onChange={(dataInicial) => patchDetails({ dataInicial })}
            />
            <DateField
              label="Data final *"
              value={(details.dataFinal as string) ?? ''}
              onChange={(dataFinal) => patchDetails({ dataFinal })}
            />
          </div>
          <div className="max-w-[220px]">
            <label className={labelCls}>Número de dias *</label>
            <QuantityStepperInput
              required
              allowEmpty
              value={
                typeof details.numeroDias === 'number'
                  ? details.numeroDias
                  : parseInt(String(details.numeroDias ?? ''), 10) || 0
              }
              min={1}
              max={365}
              unit="dia(s)"
              placeholder="Ex.: 3"
              onChange={(qty) => patchDetails({ numeroDias: qty > 0 ? String(qty) : '' })}
            />
          </div>
          <DpFileAttachmentField
            label="Anexo do atestado *"
            fileName={atestadoFileName}
            accept=".pdf,image/*"
            onFileSelect={onAtestadoFile}
          />
        </div>
      );

    case 'RETIFICACAO_ALOCACAO':
      return (
        <div className="md:col-span-2 space-y-4">
          <EmployeeSearchSelect
            label="Colaborador *"
            value={(details.employeeId as string) ?? ''}
            onChange={(id) => patchDetails({ employeeId: id })}
            employees={employees}
          />
          <DateField
            label="Data *"
            value={(details.data as string) ?? ''}
            onChange={(data) => patchDetails({ data })}
          />
          <div>
            <label className={labelCls}>Justificativa *</label>
            <textarea
              className={taCls}
              placeholder="Descreva o motivo da retificação de alocação..."
              value={(details.justificativa as string) ?? ''}
              onChange={(e) => patchDetails({ justificativa: e.target.value })}
              required
            />
          </div>
        </div>
      );

    case 'HORA_EXTRA':
      return (
        <div className="md:col-span-2 space-y-4">
          <EmployeeSearchSelect
            label="Colaborador *"
            value={selectedEmployeeId}
            onChange={setEmployeeId}
            employees={employees}
          />
          <div>
            <label className={labelCls}>Justificativa *</label>
            <textarea
              className={taCls}
              placeholder="Explique o motivo/justificativa da solicitação..."
              value={(details.justificativa as string) ?? ''}
              onChange={(e) => patchDetails({ justificativa: e.target.value })}
              required
            />
          </div>
          {(() => {
            const datasRaw = String(details.datas ?? '').trim();
            const [inicioRaw, fimRaw] = datasRaw.includes(' - ')
              ? datasRaw.split(' - ').map((s) => s.trim())
              : ['', ''];

            const inicio = inicioRaw || '';
            const fim = fimRaw || '';

            const patchPeriodo = (nextInicio: string, nextFim: string) => {
              patchDetails({ datas: nextInicio && nextFim ? `${nextInicio} - ${nextFim}` : '' });
            };

            return (
              <div className="space-y-4">
                <div>
                  <label className={labelCls}>Período *</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-800 dark:text-gray-200">
                        Início do período *
                      </label>
                      <DateTimePickerField
                        value={inicio}
                        onChange={(value) => patchPeriodo(value, fim)}
                        placeholder="dd/mm/aaaa hh:mm"
                        noFocusRing
                        aria-label="Início do período"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1 text-gray-800 dark:text-gray-200">
                        Fim do período *
                      </label>
                      <DateTimePickerField
                        value={fim}
                        onChange={(value) => patchPeriodo(inicio, value)}
                        placeholder="dd/mm/aaaa hh:mm"
                        noFocusRing
                        aria-label="Fim do período"
                      />
                    </div>
                  </div>
                </div>

                <DpFileAttachmentField
                  label="Anexar autorização de hora extra *"
                  fileName={horaExtraFileName}
                  accept=".pdf,image/*"
                  onFileSelect={onHoraExtraFile}
                />
              </div>
            );
          })()}
        </div>
      );

    case 'BENEFICIOS_VIAGEM':
      return (
        <div className="md:col-span-2 space-y-4">
          <EmployeeSearchSelect
            label="Colaborador *"
            value={(details.employeeId as string) ?? ''}
            onChange={(id) => patchDetails({ employeeId: id })}
            employees={employees}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DateField
              label="Data de início *"
              value={(details.dataInicial as string) ?? ''}
              onChange={(dataInicial) => patchDetails({ dataInicial })}
            />
            <DateField
              label="Data final *"
              value={(details.dataFinal as string) ?? ''}
              onChange={(dataFinal) => patchDetails({ dataFinal })}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Número de dias *</label>
              <QuantityStepperInput
                required
                allowEmpty
                value={
                  typeof details.numeroDias === 'number'
                    ? details.numeroDias
                    : parseInt(String(details.numeroDias ?? ''), 10) || 0
                }
                min={1}
                max={365}
                unit="dia(s)"
                placeholder="Ex.: 5"
                onChange={(qty) => patchDetails({ numeroDias: qty > 0 ? String(qty) : '' })}
              />
            </div>
            <div>
              <label className={labelCls}>Hotel (opcional)</label>
              <QuantityStepperInput
                allowEmpty
                value={
                  typeof details.diasHotel === 'number'
                    ? details.diasHotel
                    : parseInt(String(details.diasHotel ?? ''), 10) || 0
                }
                min={1}
                max={365}
                unit="dia(s)"
                placeholder="Ex.: 2"
                onChange={(qty) =>
                  patchDetails({ diasHotel: qty > 0 ? String(qty) : undefined })
                }
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Motivo da viagem *</label>
            <Input
              value={(details.motivoViagem as string) ?? ''}
              onChange={(e) => patchDetails({ motivoViagem: e.target.value })}
              placeholder="Ex.: Reunião com cliente"
              required
            />
          </div>
        </div>
      );

    case 'OUTRAS_SOLICITACOES': {
      const datasRaw = String(details.datas ?? '').trim();
      const [dataInicioRaw, dataFimRaw] = datasRaw.includes(' - ')
        ? datasRaw.split(' - ').map((s) => s.trim())
        : ['', ''];
      const dataInicio = dataInicioRaw || '';
      const dataFim = dataFimRaw || '';

      const patchDatas = (nextInicio: string, nextFim: string) => {
        if (!nextInicio && !nextFim) {
          patchDetails({ datas: '' });
          return;
        }
        if (nextInicio && nextFim) {
          patchDetails({ datas: `${nextInicio} - ${nextFim}` });
          return;
        }
        patchDetails({ datas: nextInicio || nextFim });
      };

      return (
        <div className="md:col-span-2 space-y-4">
          <div>
            <label className={labelCls}>Tipo de solicitação *</label>
            <Input
              value={(details.tipoSolicitacao as string) ?? ''}
              onChange={(e) => patchDetails({ tipoSolicitacao: e.target.value })}
              placeholder="Ex.: Alteração de benefício"
              required
            />
          </div>
          <EmployeeSearchSelect
            label="Colaborador *"
            value={selectedEmployeeId}
            onChange={setEmployeeId}
            employees={employees}
          />
          <div>
            <label className={labelCls}>Situação *</label>
            <Input
              value={(details.situacao as string) ?? ''}
              onChange={(e) => patchDetails({ situacao: e.target.value })}
              placeholder="Ex.: Aguardando análise do DP"
              required
            />
          </div>
          <div>
            <label className={labelCls}>Justificativa *</label>
            <textarea
              className={taCls}
              value={(details.justificativa as string) ?? ''}
              onChange={(e) => patchDetails({ justificativa: e.target.value })}
              placeholder="Descreva o motivo e os detalhes da solicitação..."
              required
            />
          </div>
          <div>
            <label className={labelCls}>Datas</label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
              <DateField
                label="Data inicial"
                value={dataInicio}
                onChange={(value) => patchDatas(value, dataFim)}
              />
              <DateField
                label="Data final"
                value={dataFim}
                onChange={(value) => patchDatas(dataInicio, value)}
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Valores</label>
            <Input
              value={(details.valores as string) ?? ''}
              onChange={(e) =>
                patchDetails({ valores: maskCurrencyInputBrOrEmpty(e.target.value) || undefined })
              }
              placeholder="R$ 1.500,00"
            />
          </div>
          <div>
            <label className={labelCls}>Observações</label>
            <textarea
              className={taCls}
              value={(details.observacoes as string) ?? ''}
              onChange={(e) => patchDetails({ observacoes: e.target.value })}
              placeholder="Informações complementares (opcional)"
            />
          </div>
        </div>
      );
    }

    default:
      return null;
  }
}

export function ButtonSeg({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? 'border-red-600 bg-red-50 text-red-800 dark:bg-red-950/40 dark:text-red-200'
          : 'border-gray-300 bg-white text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200'
      }`}
    >
      {label}
    </button>
  );
}
