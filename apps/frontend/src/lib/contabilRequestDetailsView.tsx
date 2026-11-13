'use client';

import React from 'react';
import { Paperclip } from 'lucide-react';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import { formatDateBr } from '@/lib/dateTimeBr';
import { DetailInfoSection, type DetailInfoField } from '@/components/ui/DetailInfoLayout';

/** Tipos criados direto para a Contabilidade (mesma lista do backend). */
const CONTABIL_DIRECT_TYPES = [
  'CONVENCAO_COLETIVA',
  'FECHAMENTO_FOLHA',
  'IMPOSTOS_ENCARGOS',
  'REALOCACAO_COLABORADOR',
  'RETIFICACAO_RECALCULO',
  'SOLICITACAO_GERAL',
  'CONTAB_ADMISSAO',
  'CONTAB_AFASTAMENTO',
  'CONTAB_ATESTADO',
  'CONTAB_ALTERACAO_FUNCAO',
  'CONTAB_ALTERACAO_SALARIAL',
  'CONTAB_FERIAS',
  'CONTAB_RESCISAO',
] as const;

export function isContabilDirectRequestType(requestType: string | null | undefined): boolean {
  return !!requestType && (CONTABIL_DIRECT_TYPES as readonly string[]).includes(requestType);
}

type FieldDef = { key: string; label: string; kind?: 'date' | 'employee' | 'simnao' | 'long' };

const FIELDS_BY_TYPE: Record<string, FieldDef[]> = {
  CONVENCAO_COLETIVA: [
    { key: 'sindicatoCategoria', label: 'Sindicato / categoria' },
    { key: 'vigenciaDataBase', label: 'Vigência / data-base' },
    { key: 'assunto', label: 'Assunto da solicitação' },
    { key: 'observacoes', label: 'Solicitação / observações', kind: 'long' },
  ],
  FECHAMENTO_FOLHA: [
    { key: 'competencia', label: 'Período / competência da folha' },
    { key: 'novosOptantesVt', label: 'Novos optantes de VT / tomador', kind: 'long' },
    { key: 'desistentesVt', label: 'Desistentes de VT / tomador', kind: 'long' },
    { key: 'outrasInformacoes', label: 'Outras informações para fechamento', kind: 'long' },
    { key: 'observacoes', label: 'Solicitação / observações', kind: 'long' },
  ],
  IMPOSTOS_ENCARGOS: [
    { key: 'competencia', label: 'Competência' },
    { key: 'tipoImpostoEncargo', label: 'Tipo de imposto / encargo' },
    { key: 'colaboradorEmployeeId', label: 'Colaborador relacionado', kind: 'employee' },
    { key: 'dataVencimento', label: 'Data de vencimento', kind: 'date' },
    { key: 'observacoes', label: 'Solicitação / observações', kind: 'long' },
  ],
  REALOCACAO_COLABORADOR: [
    { key: 'employeeId', label: 'Colaborador', kind: 'employee' },
    { key: 'empresaAtual', label: 'Empresa atual' },
    { key: 'poloAtual', label: 'Polo atual' },
    { key: 'contratoAtual', label: 'Contrato atual' },
    { key: 'setorAtual', label: 'Setor atual' },
    { key: 'novaEmpresa', label: 'Nova empresa' },
    { key: 'novoPolo', label: 'Novo polo' },
    { key: 'novoContrato', label: 'Novo contrato' },
    { key: 'novoSetor', label: 'Novo setor' },
    { key: 'dataRealocacao', label: 'Data da realocação', kind: 'date' },
    { key: 'funcaoPermanece', label: 'Função permanecerá a mesma?', kind: 'simnao' },
    { key: 'novaFuncao', label: 'Nova função' },
    { key: 'salarioPermanece', label: 'Salário permanecerá o mesmo?', kind: 'simnao' },
    { key: 'novoSalario', label: 'Novo salário' },
    { key: 'observacoes', label: 'Solicitação / observações', kind: 'long' },
  ],
  RETIFICACAO_RECALCULO: [
    { key: 'numeroSolicitacaoOriginal', label: 'Nº da solicitação original / retificada' },
    { key: 'tipoSolicitacaoOriginal', label: 'Tipo da solicitação original' },
    { key: 'competencia', label: 'Competência / período' },
    { key: 'motivo', label: 'Motivo da retificação / recálculo', kind: 'long' },
    { key: 'informacaoOriginal', label: 'Informação original', kind: 'long' },
    { key: 'informacaoCorreta', label: 'Informação correta', kind: 'long' },
    { key: 'observacoes', label: 'Solicitação / observações', kind: 'long' },
  ],
  CONTAB_ADMISSAO: [
    { key: 'nomeCompleto', label: 'Nome completo' },
    { key: 'dataAdmissao', label: 'Data de admissão', kind: 'date' },
    { key: 'tomadorLocal', label: 'Tomador / local de prestação' },
    { key: 'funcao', label: 'Função' },
    { key: 'salario', label: 'Salário' },
    { key: 'cargaHoraria', label: 'Carga horária semanal / jornada' },
    { key: 'pis', label: 'Nº do PIS' },
    { key: 'optanteVt', label: 'Optante por vale-transporte (VT)', kind: 'simnao' },
    { key: 'insalubridade', label: 'Possui insalubridade', kind: 'simnao' },
    { key: 'observacoes', label: 'Solicitação / observações', kind: 'long' },
  ],
  CONTAB_AFASTAMENTO: [
    { key: 'employeeId', label: 'Colaborador', kind: 'employee' },
    { key: 'tipoMotivo', label: 'Tipo / motivo do afastamento' },
    { key: 'dataInicio', label: 'Data de início do afastamento', kind: 'date' },
    { key: 'dataPrevistaTermino', label: 'Data prevista de término', kind: 'date' },
    { key: 'observacoes', label: 'Solicitação / observações', kind: 'long' },
  ],
  CONTAB_ATESTADO: [
    { key: 'employeeId', label: 'Colaborador', kind: 'employee' },
    { key: 'dataInicial', label: 'Data inicial do atestado', kind: 'date' },
    { key: 'dataFinal', label: 'Data final do atestado', kind: 'date' },
    { key: 'numeroDias', label: 'Nº de dias de afastamento' },
    { key: 'observacoes', label: 'Observações', kind: 'long' },
  ],
  CONTAB_ALTERACAO_FUNCAO: [
    { key: 'employeeId', label: 'Colaborador', kind: 'employee' },
    { key: 'funcaoAtual', label: 'Função atual' },
    { key: 'novaFuncao', label: 'Nova função' },
    { key: 'dataInicio', label: 'Data de início da nova função', kind: 'date' },
    { key: 'alteracaoSalarial', label: 'Haverá alteração salarial?', kind: 'simnao' },
    { key: 'novoSalario', label: 'Novo salário' },
    { key: 'observacoes', label: 'Solicitação / observações', kind: 'long' },
  ],
  CONTAB_ALTERACAO_SALARIAL: [
    { key: 'employeeId', label: 'Colaborador', kind: 'employee' },
    { key: 'salarioAtual', label: 'Salário atual' },
    { key: 'novoSalario', label: 'Novo salário' },
    { key: 'dataVigencia', label: 'Data de vigência do novo salário', kind: 'date' },
    { key: 'motivo', label: 'Motivo da alteração', kind: 'long' },
    { key: 'observacoes', label: 'Solicitação / observações', kind: 'long' },
  ],
  CONTAB_FERIAS: [
    { key: 'employeeId', label: 'Colaborador', kind: 'employee' },
    { key: 'dataInicio', label: 'Data de início das férias', kind: 'date' },
    { key: 'quantidadeDias', label: 'Quantidade de dias de férias' },
    { key: 'abonoPecuniario', label: 'Abono pecuniário', kind: 'simnao' },
    { key: 'quantidadeDiasAbono', label: 'Quantidade de dias de abono' },
    { key: 'adiantamento13', label: 'Adiantamento de 13º salário', kind: 'simnao' },
    { key: 'observacoes', label: 'Solicitação / observações', kind: 'long' },
  ],
  CONTAB_RESCISAO: [
    { key: 'employeeId', label: 'Colaborador', kind: 'employee' },
    { key: 'tipoRescisao', label: 'Tipo de rescisão' },
    { key: 'tipoAvisoPrevio', label: 'Tipo de aviso prévio' },
    { key: 'dataDemissao', label: 'Data da demissão / desligamento', kind: 'date' },
    { key: 'ultimoDiaTrabalhado', label: 'Último dia trabalhado', kind: 'date' },
    { key: 'possuiProventoDesconto', label: 'Possui provento ou desconto?', kind: 'simnao' },
    { key: 'proventoDesconto', label: 'Provento / desconto' },
    { key: 'valor', label: 'Valor' },
    { key: 'observacoes', label: 'Solicitação / observações', kind: 'long' },
  ],
  SOLICITACAO_GERAL: [
    { key: 'assunto', label: 'Assunto' },
    { key: 'colaboradorEmployeeId', label: 'Colaborador relacionado', kind: 'employee' },
    { key: 'descricao', label: 'Solicitação / descrição detalhada', kind: 'long' },
  ],
};

type StoredAnexo = {
  fileName?: string;
  tipoArquivo?: string;
  dataValidade?: string;
  url?: string;
};

function formatYmd(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDateBr(value) : value;
}

type Props = {
  requestType: string;
  details: unknown;
  employeeNameById?: Map<string, string>;
  /** Título da seção (mesmo padrão das "Informações gerais"). */
  title?: string;
};

/** Campos preenchidos de uma solicitação criada direto para a Contabilidade + anexos. */
export function ContabilRequestDetailsView({
  requestType,
  details,
  employeeNameById,
  title = 'Dados da solicitação',
}: Props) {
  const d = (details && typeof details === 'object' ? details : null) as Record<string, unknown> | null;
  const defs = FIELDS_BY_TYPE[requestType];
  if (!d || !defs) return null;

  const rows = defs
    .map((def) => {
      const raw = typeof d[def.key] === 'string' ? (d[def.key] as string).trim() : '';
      if (!raw) return null;
      let value = raw;
      if (def.kind === 'date') value = formatYmd(raw);
      if (def.kind === 'employee') value = employeeNameById?.get(raw) ?? raw;
      if (def.kind === 'simnao') value = raw === 'SIM' ? 'Sim' : raw === 'NAO' ? 'Não' : raw;
      return { ...def, value };
    })
    .filter((row): row is FieldDef & { value: string } => row !== null);

  const anexos = (Array.isArray(d.anexos) ? d.anexos : []) as StoredAnexo[];

  // Mesmo layout das "Informações gerais": linhas com divisor, rótulo à esquerda e valor à direita
  // (textos longos ficam em bloco abaixo do rótulo).
  const fields: DetailInfoField[] = rows.map((row) => ({
    label: row.label,
    value: <span className="whitespace-pre-wrap break-words">{row.value}</span>,
    stacked: row.kind === 'long',
  }));

  return (
    <div className="space-y-5">
      <DetailInfoSection title={title} fields={fields} />

      {anexos.length > 0 ? (
        <DetailInfoSection title="Anexos">
          <ul className="space-y-2">
            {anexos.map((anexo, index) => {
              const href = resolveApiMediaUrl(anexo.url);
              return (
                <li
                  key={`${anexo.url ?? anexo.fileName ?? 'anexo'}-${index}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-gray-50 px-3 py-2 text-sm dark:bg-gray-800/50"
                >
                  <Paperclip className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="min-w-0 truncate font-medium text-red-700 hover:underline dark:text-red-300"
                    >
                      {anexo.fileName || 'Anexo'}
                    </a>
                  ) : (
                    <span className="min-w-0 truncate font-medium text-gray-900 dark:text-gray-100">
                      {anexo.fileName || 'Anexo'}
                    </span>
                  )}
                  {anexo.tipoArquivo ? (
                    <span className="text-xs text-gray-500 dark:text-gray-400">{anexo.tipoArquivo}</span>
                  ) : null}
                  {anexo.dataValidade ? (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      Validade: {formatYmd(anexo.dataValidade)}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </DetailInfoSection>
      ) : null}
    </div>
  );
}
