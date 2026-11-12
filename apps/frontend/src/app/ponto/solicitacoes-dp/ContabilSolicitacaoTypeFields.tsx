'use client';

import React from 'react';
import { Paperclip, Plus, X } from 'lucide-react';
import { DatePickerField } from '@/components/ui/DatePickerField';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import type { MultiSelectSearchOption } from '@/components/ui/MultiSelectSearchDropdown';
import { maskCurrencyInputBrOrEmpty } from '@/lib/maskCurrencyBr';
import { DP_SOLICITACOES_NO_FOCUS_CLS } from '@/lib/dpSolicitacoesUi';
import { toPersonSelectOptions } from '@/lib/personSelectOptions';
import { ButtonSeg } from './dpSolicitacaoRepeatableUi';

/** Tipos criados direto para a Contabilidade (sem gestor/DP). */
export type ContabilFormRequestType =
  | 'CONVENCAO_COLETIVA'
  | 'FECHAMENTO_FOLHA'
  | 'IMPOSTOS_ENCARGOS'
  | 'REALOCACAO_COLABORADOR'
  | 'RETIFICACAO_RECALCULO'
  | 'SOLICITACAO_GERAL'
  | 'CONTAB_ADMISSAO'
  | 'CONTAB_AFASTAMENTO'
  | 'CONTAB_ALTERACAO_FUNCAO'
  | 'CONTAB_ALTERACAO_SALARIAL'
  | 'CONTAB_FERIAS'
  | 'CONTAB_RESCISAO';

export const CONTABIL_TYPE_LABELS: Record<ContabilFormRequestType, string> = {
  CONVENCAO_COLETIVA: 'Convenção Coletiva / CCT',
  FECHAMENTO_FOLHA: 'Fechamento da Folha',
  IMPOSTOS_ENCARGOS: 'Impostos / Encargos da Folha',
  REALOCACAO_COLABORADOR: 'Realocação de Colaborador',
  RETIFICACAO_RECALCULO: 'Retificação / Recálculo',
  SOLICITACAO_GERAL: 'Solicitação Geral',
  CONTAB_ADMISSAO: 'Admissão',
  CONTAB_AFASTAMENTO: 'Afastamento',
  CONTAB_ALTERACAO_FUNCAO: 'Alteração de Função',
  CONTAB_ALTERACAO_SALARIAL: 'Alteração Salarial',
  CONTAB_FERIAS: 'Férias',
  CONTAB_RESCISAO: 'Rescisão',
};

export function isContabilFormRequestType(value: string): value is ContabilFormRequestType {
  return value in CONTABIL_TYPE_LABELS;
}

export type ContabilAnexoDraft = {
  id: string;
  file: File | null;
  tipoArquivo: string;
  dataValidade: string;
};

export const MAX_CONTABIL_ANEXOS = 10;

export function newContabilAnexoDraft(): ContabilAnexoDraft {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    file: null,
    tipoArquivo: '',
    dataValidade: '',
  };
}

const TIPO_ARQUIVO_OPTIONS: MultiSelectSearchOption[] = [
  'Convenção coletiva / CCT',
  'Planilha',
  'Guia / boleto',
  'Comprovante',
  'Contrato',
  'Documento do colaborador',
  'Outros',
].map((label) => ({ value: label, label, searchText: label }));

type PayrollEmp = {
  id: string;
  name: string;
  cpf?: string;
  profilePhotoUrl?: string | null;
  department?: string;
  position?: string;
  company?: string | null;
  polo?: string | null;
  costCenter?: string | null;
};

const fieldBox = `w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 text-sm appearance-none ${DP_SOLICITACOES_NO_FOCUS_CLS}`;
const labelCls = 'block text-sm font-medium mb-1 text-gray-800 dark:text-gray-200';

function str(details: Record<string, unknown>, key: string): string {
  const v = details[key];
  return typeof v === 'string' ? v : '';
}

function TextField({
  label,
  value,
  onChange,
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className={labelCls}>
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={fieldBox}
      />
    </div>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  required,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  placeholder?: string;
}) {
  return (
    <div className="md:col-span-2">
      <label className={labelCls}>
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${fieldBox} min-h-[100px] resize-y`}
      />
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  return (
    <div>
      <label className={labelCls}>
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </label>
      <DatePickerField
        value={value}
        onChange={onChange}
        placeholder="dd/mm/aaaa"
        noFocusRing
        aria-label={label}
      />
    </div>
  );
}

function SimNaoField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: 'SIM' | 'NAO') => void;
}) {
  return (
    <div>
      <label className={labelCls}>{label} <span className="text-red-600">*</span></label>
      <div className="flex gap-2">
        <ButtonSeg active={value === 'SIM'} onClick={() => onChange('SIM')} label="Sim" />
        <ButtonSeg active={value === 'NAO'} onClick={() => onChange('NAO')} label="Não" />
      </div>
    </div>
  );
}

function AnexosField({
  anexos,
  onChange,
}: {
  anexos: ContabilAnexoDraft[];
  onChange: (next: ContabilAnexoDraft[]) => void;
}) {
  const update = (id: string, patch: Partial<ContabilAnexoDraft>) =>
    onChange(anexos.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  return (
    <div className="space-y-3 md:col-span-2">
      <div className="flex items-center justify-between">
        <label className={labelCls}>Anexo(s)</label>
        {anexos.length < MAX_CONTABIL_ANEXOS ? (
          <button
            type="button"
            title="Adicionar anexo"
            aria-label="Adicionar anexo"
            onClick={() => onChange([...anexos, newContabilAnexoDraft()])}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-300 bg-white text-gray-600 transition-colors hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <Plus className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      {anexos.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400">Nenhum anexo adicionado (opcional).</p>
      ) : null}
      {anexos.map((anexo, index) => (
        <div
          key={anexo.id}
          className="space-y-3 rounded-lg border border-gray-200 bg-gray-50/50 p-4 dark:border-gray-600 dark:bg-gray-800/40"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">Anexo {index + 1}</p>
            <button
              type="button"
              onClick={() => onChange(anexos.filter((a) => a.id !== anexo.id))}
              className="rounded-md p-1 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-gray-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
              aria-label={`Remover anexo ${index + 1}`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div>
            <label className={labelCls}>Arquivo <span className="text-red-600">*</span></label>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700">
              <Paperclip className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
              <span className="min-w-0 flex-1 truncate">
                {anexo.file ? anexo.file.name : 'Selecionar arquivo (até 15 MB)'}
              </span>
              <input
                type="file"
                className="hidden"
                accept=".pdf,image/*,.doc,.docx,.xls,.xlsx,.csv"
                onChange={(e) => {
                  update(anexo.id, { file: e.target.files?.[0] ?? null });
                  e.target.value = '';
                }}
              />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Tipo do arquivo <span className="text-red-600">*</span></label>
              <SingleSelectSearchDropdown
                value={anexo.tipoArquivo}
                onChange={(tipoArquivo) => update(anexo.id, { tipoArquivo })}
                options={TIPO_ARQUIVO_OPTIONS}
                allowEmpty
                placeholder="Selecione o tipo..."
                searchPlaceholder="Pesquisar..."
                noFocusRing
              />
            </div>
            <DateField
              label="Data de expiração / validade"
              value={anexo.dataValidade}
              onChange={(dataValidade) => update(anexo.id, { dataValidade })}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

type Props = {
  requestType: ContabilFormRequestType | '';
  details: Record<string, unknown>;
  patchDetails: (p: Record<string, unknown>) => void;
  employees: PayrollEmp[];
  anexos: ContabilAnexoDraft[];
  onAnexosChange: (next: ContabilAnexoDraft[]) => void;
};

export function ContabilSolicitacaoTypeFields({
  requestType,
  details,
  patchDetails,
  employees,
  anexos,
  onAnexosChange,
}: Props) {
  const employeeOptions = React.useMemo(
    () =>
      toPersonSelectOptions(
        employees.map((em) => ({
          value: em.id,
          name: em.name,
          cpf: em.cpf,
          profilePhotoUrl: em.profilePhotoUrl,
          extraSearchText: [em.department, em.position].filter(Boolean).join(' '),
        }))
      ),
    [employees]
  );

  if (!requestType) return null;

  const set = (key: string) => (value: string) => patchDetails({ [key]: value });
  const text = (key: string) => str(details, key);

  const employeeSelect = (key: string, label: string, required: boolean, onPick?: (id: string) => void) => (
    <div className="md:col-span-2">
      <label className={labelCls}>
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </label>
      <SingleSelectSearchDropdown
        value={text(key)}
        onChange={(id) => {
          patchDetails({ [key]: id });
          onPick?.(id);
        }}
        options={employeeOptions}
        allowEmpty={!required}
        placeholder="Selecione o colaborador..."
        searchPlaceholder="Pesquisar..."
        noFocusRing
      />
    </div>
  );

  let fields: React.ReactNode = null;

  switch (requestType) {
    case 'CONVENCAO_COLETIVA':
      fields = (
        <>
          <TextField label="Sindicato / categoria" value={text('sindicatoCategoria')} onChange={set('sindicatoCategoria')} required placeholder="Ex.: Sindicato dos Trabalhadores da Construção Civil" />
          <TextField label="Vigência / data-base" value={text('vigenciaDataBase')} onChange={set('vigenciaDataBase')} required placeholder="Ex.: 01/05/2026 a 30/04/2027 · data-base maio" />
          <div className="md:col-span-2">
            <TextField label="Assunto da solicitação" value={text('assunto')} onChange={set('assunto')} required placeholder="Resumo do assunto" />
          </div>
          <TextAreaField label="Solicitação / observações" value={text('observacoes')} onChange={set('observacoes')} required placeholder="Descreva a solicitação com o máximo de detalhes" />
        </>
      );
      break;

    case 'FECHAMENTO_FOLHA':
      fields = (
        <>
          <div className="md:col-span-2">
            <TextField
              label="Período / competência da folha"
              value={text('competencia')}
              onChange={set('competencia')}
              required
              placeholder="Ex.: 10/2026"
            />
          </div>
          <TextAreaField label="Novos optantes de VT / tomador" value={text('novosOptantesVt')} onChange={set('novosOptantesVt')} placeholder="Informe nomes e dados dos novos optantes de VT" />
          <TextAreaField label="Desistentes de VT / tomador" value={text('desistentesVt')} onChange={set('desistentesVt')} placeholder="Informe nomes dos desistentes de VT" />
          <TextAreaField label="Outras informações para fechamento" value={text('outrasInformacoes')} onChange={set('outrasInformacoes')} placeholder="Outras informações necessárias para o fechamento" />
          <TextAreaField label="Solicitação / observações" value={text('observacoes')} onChange={set('observacoes')} required placeholder="Descreva a solicitação com o máximo de detalhes" />
        </>
      );
      break;

    case 'IMPOSTOS_ENCARGOS':
      fields = (
        <>
          <TextField label="Competência" value={text('competencia')} onChange={set('competencia')} required placeholder="Ex.: 10/2026" />
          <TextField label="Tipo de imposto / encargo" value={text('tipoImpostoEncargo')} onChange={set('tipoImpostoEncargo')} required placeholder="Ex.: FGTS, INSS, IRRF" />
          {employeeSelect('colaboradorEmployeeId', 'Colaborador relacionado', false)}
          <DateField label="Data de vencimento" value={text('dataVencimento')} onChange={set('dataVencimento')} required />
          <TextAreaField label="Solicitação / observações" value={text('observacoes')} onChange={set('observacoes')} required placeholder="Descreva a solicitação com o máximo de detalhes" />
        </>
      );
      break;

    case 'REALOCACAO_COLABORADOR': {
      const funcaoPermanece = text('funcaoPermanece');
      const salarioPermanece = text('salarioPermanece');
      fields = (
        <>
          {employeeSelect('employeeId', 'Nome do colaborador', true, (id) => {
            const emp = employees.find((e) => e.id === id);
            if (!emp) return;
            patchDetails({
              empresaAtual: emp.company ?? '',
              poloAtual: emp.polo ?? '',
              contratoAtual: emp.costCenter ?? '',
              setorAtual: emp.department ?? '',
            });
          })}
          <TextField label="Empresa atual" value={text('empresaAtual')} onChange={set('empresaAtual')} required placeholder="Empresa em que o colaborador está hoje" />
          <TextField label="Polo atual" value={text('poloAtual')} onChange={set('poloAtual')} required placeholder="Polo atual" />
          <TextField label="Contrato atual" value={text('contratoAtual')} onChange={set('contratoAtual')} required placeholder="Contrato atual" />
          <TextField label="Setor atual" value={text('setorAtual')} onChange={set('setorAtual')} required placeholder="Setor atual" />
          <TextField label="Nova empresa" value={text('novaEmpresa')} onChange={set('novaEmpresa')} required placeholder="Empresa de destino" />
          <TextField label="Novo polo" value={text('novoPolo')} onChange={set('novoPolo')} required placeholder="Polo de destino" />
          <TextField label="Novo contrato" value={text('novoContrato')} onChange={set('novoContrato')} required placeholder="Contrato de destino" />
          <TextField label="Novo setor" value={text('novoSetor')} onChange={set('novoSetor')} required placeholder="Setor de destino" />
          <DateField label="Data da realocação" value={text('dataRealocacao')} onChange={set('dataRealocacao')} required />
          <div className="hidden md:block" />
          <SimNaoField label="A função permanecerá a mesma?" value={funcaoPermanece} onChange={set('funcaoPermanece')} />
          {funcaoPermanece === 'NAO' ? (
            <TextField label="Nova função" value={text('novaFuncao')} onChange={set('novaFuncao')} required placeholder="Informe a nova função" />
          ) : (
            <div className="hidden md:block" />
          )}
          <SimNaoField label="O salário permanecerá o mesmo?" value={salarioPermanece} onChange={set('salarioPermanece')} />
          {salarioPermanece === 'NAO' ? (
            <TextField
              label="Novo salário"
              value={text('novoSalario')}
              onChange={(v) => patchDetails({ novoSalario: maskCurrencyInputBrOrEmpty(v) })}
              required
              placeholder="R$ 0,00"
            />
          ) : (
            <div className="hidden md:block" />
          )}
          <TextAreaField label="Solicitação / observações" value={text('observacoes')} onChange={set('observacoes')} required placeholder="Descreva a solicitação com o máximo de detalhes" />
        </>
      );
      break;
    }

    case 'RETIFICACAO_RECALCULO':
      fields = (
        <>
          <TextField label="Nº da solicitação original / retificada" value={text('numeroSolicitacaoOriginal')} onChange={set('numeroSolicitacaoOriginal')} required placeholder="Número da solicitação original" />
          <TextField label="Tipo da solicitação original" value={text('tipoSolicitacaoOriginal')} onChange={set('tipoSolicitacaoOriginal')} required placeholder="Ex.: Férias, Rescisão, Fechamento da folha" />
          <div className="md:col-span-2">
            <TextField label="Competência / período" value={text('competencia')} onChange={set('competencia')} required placeholder="Ex.: 10/2026" />
          </div>
          <TextAreaField label="Motivo da retificação / recálculo" value={text('motivo')} onChange={set('motivo')} required placeholder="Explique o motivo da retificação ou do recálculo" />
          <TextAreaField label="Informação original" value={text('informacaoOriginal')} onChange={set('informacaoOriginal')} required placeholder="Como estava a informação original" />
          <TextAreaField label="Informação correta" value={text('informacaoCorreta')} onChange={set('informacaoCorreta')} required placeholder="Como deve ficar a informação correta" />
          <TextAreaField label="Solicitação / observações" value={text('observacoes')} onChange={set('observacoes')} required placeholder="Descreva a solicitação com o máximo de detalhes" />
        </>
      );
      break;

    case 'CONTAB_ADMISSAO':
      fields = (
        <>
          <div className="md:col-span-2">
            <TextField label="Nome completo" value={text('nomeCompleto')} onChange={set('nomeCompleto')} required placeholder="Nome completo do colaborador" />
          </div>
          <DateField label="Data de admissão" value={text('dataAdmissao')} onChange={set('dataAdmissao')} required />
          <TextField label="Tomador / local de prestação" value={text('tomadorLocal')} onChange={set('tomadorLocal')} placeholder="Onde o colaborador vai trabalhar" />
          <TextField label="Função" value={text('funcao')} onChange={set('funcao')} required placeholder="Função do colaborador" />
          <TextField label="Salário" value={text('salario')} onChange={(v) => patchDetails({ salario: maskCurrencyInputBrOrEmpty(v) })} required placeholder="R$ 0,00" />
          <TextField label="Carga horária semanal / jornada" value={text('cargaHoraria')} onChange={set('cargaHoraria')} required placeholder="Ex.: 44h semanais, 07h às 17h" />
          <TextField label="Nº do PIS" value={text('pis')} onChange={set('pis')} placeholder="Número do PIS" />
          <SimNaoField label="Optante por vale-transporte (VT)?" value={text('optanteVt')} onChange={set('optanteVt')} />
          <SimNaoField label="Possui insalubridade?" value={text('insalubridade')} onChange={set('insalubridade')} />
          <TextAreaField label="Solicitação / observações" value={text('observacoes')} onChange={set('observacoes')} required placeholder="Descreva a solicitação com o máximo de detalhes" />
        </>
      );
      break;

    case 'CONTAB_AFASTAMENTO':
      fields = (
        <>
          {employeeSelect('employeeId', 'Nome do colaborador', true)}
          <div className="md:col-span-2">
            <TextField label="Tipo / motivo do afastamento" value={text('tipoMotivo')} onChange={set('tipoMotivo')} required placeholder="Ex.: Auxílio-doença, licença-maternidade" />
          </div>
          <DateField label="Data de início do afastamento" value={text('dataInicio')} onChange={set('dataInicio')} required />
          <DateField label="Data prevista de término" value={text('dataPrevistaTermino')} onChange={set('dataPrevistaTermino')} />
          <TextAreaField label="Solicitação / observações" value={text('observacoes')} onChange={set('observacoes')} required placeholder="Descreva a solicitação com o máximo de detalhes" />
        </>
      );
      break;

    case 'CONTAB_ALTERACAO_FUNCAO': {
      const alteracaoSalarial = text('alteracaoSalarial');
      fields = (
        <>
          {employeeSelect('employeeId', 'Nome do colaborador', true, (id) => {
            const emp = employees.find((e) => e.id === id);
            if (emp?.position) patchDetails({ funcaoAtual: emp.position });
          })}
          <TextField label="Função atual" value={text('funcaoAtual')} onChange={set('funcaoAtual')} required placeholder="Função atual" />
          <TextField label="Nova função" value={text('novaFuncao')} onChange={set('novaFuncao')} required placeholder="Nova função" />
          <DateField label="Data de início da nova função" value={text('dataInicio')} onChange={set('dataInicio')} required />
          <div className="hidden md:block" />
          <SimNaoField label="Haverá alteração salarial?" value={alteracaoSalarial} onChange={set('alteracaoSalarial')} />
          {alteracaoSalarial === 'SIM' ? (
            <TextField label="Novo salário" value={text('novoSalario')} onChange={(v) => patchDetails({ novoSalario: maskCurrencyInputBrOrEmpty(v) })} required placeholder="R$ 0,00" />
          ) : (
            <div className="hidden md:block" />
          )}
          <TextAreaField label="Solicitação / observações" value={text('observacoes')} onChange={set('observacoes')} required placeholder="Descreva a solicitação com o máximo de detalhes" />
        </>
      );
      break;
    }

    case 'CONTAB_ALTERACAO_SALARIAL':
      fields = (
        <>
          {employeeSelect('employeeId', 'Nome do colaborador', true)}
          <TextField label="Salário atual" value={text('salarioAtual')} onChange={(v) => patchDetails({ salarioAtual: maskCurrencyInputBrOrEmpty(v) })} required placeholder="R$ 0,00" />
          <TextField label="Novo salário" value={text('novoSalario')} onChange={(v) => patchDetails({ novoSalario: maskCurrencyInputBrOrEmpty(v) })} required placeholder="R$ 0,00" />
          <DateField label="Data de vigência do novo salário" value={text('dataVigencia')} onChange={set('dataVigencia')} required />
          <TextField label="Motivo da alteração" value={text('motivo')} onChange={set('motivo')} required placeholder="Ex.: Promoção, dissídio, mérito" />
          <TextAreaField label="Solicitação / observações" value={text('observacoes')} onChange={set('observacoes')} required placeholder="Descreva a solicitação com o máximo de detalhes" />
        </>
      );
      break;

    case 'CONTAB_FERIAS': {
      const abono = text('abonoPecuniario');
      fields = (
        <>
          {employeeSelect('employeeId', 'Nome do colaborador', true)}
          <DateField label="Data de início das férias" value={text('dataInicio')} onChange={set('dataInicio')} required />
          <TextField label="Quantidade de dias de férias" value={text('quantidadeDias')} onChange={(v) => patchDetails({ quantidadeDias: v.replace(/\D/g, '') })} required placeholder="Ex.: 30" />
          <SimNaoField label="Abono pecuniário?" value={abono} onChange={set('abonoPecuniario')} />
          {abono === 'SIM' ? (
            <TextField label="Quantidade de dias de abono" value={text('quantidadeDiasAbono')} onChange={(v) => patchDetails({ quantidadeDiasAbono: v.replace(/\D/g, '') })} required placeholder="Ex.: 10" />
          ) : (
            <div className="hidden md:block" />
          )}
          <SimNaoField label="Adiantamento de 13º salário?" value={text('adiantamento13')} onChange={set('adiantamento13')} />
          <div className="hidden md:block" />
          <TextAreaField label="Solicitação / observações" value={text('observacoes')} onChange={set('observacoes')} required placeholder="Descreva a solicitação com o máximo de detalhes" />
        </>
      );
      break;
    }

    case 'CONTAB_RESCISAO': {
      const possui = text('possuiProventoDesconto');
      fields = (
        <>
          {employeeSelect('employeeId', 'Nome do colaborador', true)}
          <TextField label="Tipo de rescisão" value={text('tipoRescisao')} onChange={set('tipoRescisao')} required placeholder="Ex.: Sem justa causa, pedido de demissão" />
          <TextField label="Tipo de aviso prévio" value={text('tipoAvisoPrevio')} onChange={set('tipoAvisoPrevio')} required placeholder="Ex.: Trabalhado, indenizado, dispensado" />
          <DateField label="Data da demissão / desligamento" value={text('dataDemissao')} onChange={set('dataDemissao')} required />
          <DateField label="Último dia trabalhado" value={text('ultimoDiaTrabalhado')} onChange={set('ultimoDiaTrabalhado')} required />
          <SimNaoField label="Possui provento ou desconto?" value={possui} onChange={set('possuiProventoDesconto')} />
          <div className="hidden md:block" />
          {possui === 'SIM' ? (
            <>
              <div>
                <label className={labelCls}>Provento / desconto <span className="text-red-600">*</span></label>
                <div className="flex gap-2">
                  <ButtonSeg active={text('proventoDesconto') === 'Provento'} onClick={() => patchDetails({ proventoDesconto: 'Provento' })} label="Provento" />
                  <ButtonSeg active={text('proventoDesconto') === 'Desconto'} onClick={() => patchDetails({ proventoDesconto: 'Desconto' })} label="Desconto" />
                </div>
              </div>
              <TextField label="Valor" value={text('valor')} onChange={(v) => patchDetails({ valor: maskCurrencyInputBrOrEmpty(v) })} required placeholder="R$ 0,00" />
            </>
          ) : null}
          <TextAreaField label="Solicitação / observações" value={text('observacoes')} onChange={set('observacoes')} required placeholder="Descreva a solicitação com o máximo de detalhes" />
        </>
      );
      break;
    }

    case 'SOLICITACAO_GERAL':
      fields = (
        <>
          <div className="md:col-span-2">
            <TextField label="Assunto" value={text('assunto')} onChange={set('assunto')} required placeholder="Resumo do assunto" />
          </div>
          {employeeSelect('colaboradorEmployeeId', 'Colaborador relacionado', false)}
          <TextAreaField label="Solicitação / descrição detalhada" value={text('descricao')} onChange={set('descricao')} required placeholder="Descreva detalhadamente o que a Contabilidade precisa tratar" />
        </>
      );
      break;
  }

  return (
    <>
      {fields}
      <AnexosField anexos={anexos} onChange={onAnexosChange} />
    </>
  );
}
