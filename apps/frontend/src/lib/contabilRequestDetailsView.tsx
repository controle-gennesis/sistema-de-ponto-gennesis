'use client';

import React from 'react';
import { Paperclip } from 'lucide-react';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import { formatDateBr } from '@/lib/dateTimeBr';

/** Tipos criados direto para a Contabilidade (mesma lista do backend). */
const CONTABIL_DIRECT_TYPES = [
  'CONVENCAO_COLETIVA',
  'FECHAMENTO_FOLHA',
  'IMPOSTOS_ENCARGOS',
  'REALOCACAO_COLABORADOR',
  'RETIFICACAO_RECALCULO',
  'SOLICITACAO_GERAL',
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
};

/** Campos preenchidos de uma solicitação criada direto para a Contabilidade + anexos. */
export function ContabilRequestDetailsView({ requestType, details, employeeNameById }: Props) {
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

  return (
    <div className="space-y-4 rounded-lg border border-gray-200 px-4 py-3 text-sm dark:border-gray-700">
      <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.key} className={`space-y-0.5 ${row.kind === 'long' ? 'sm:col-span-2' : ''}`}>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">{row.label}</p>
            <p className="whitespace-pre-wrap break-words text-sm text-gray-900 dark:text-gray-100">
              {row.value}
            </p>
          </div>
        ))}
      </div>

      {anexos.length > 0 ? (
        <div className="space-y-2 border-t border-gray-100 pt-3 dark:border-gray-700">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Anexos</p>
          <ul className="space-y-2">
            {anexos.map((anexo, index) => {
              const href = resolveApiMediaUrl(anexo.url);
              return (
                <li
                  key={`${anexo.url ?? anexo.fileName ?? 'anexo'}-${index}`}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-gray-50 px-3 py-2 dark:bg-gray-800/50"
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
        </div>
      ) : null}
    </div>
  );
}
