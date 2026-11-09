'use client';

import React from 'react';
import { Paperclip, Upload, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { SingleSelectSearchDropdown } from '@/components/ui/SingleSelectSearchDropdown';
import { DP_SOLICITACOES_NO_FOCUS_CLS } from '@/lib/dpSolicitacoesUi';
import { toPersonSelectOptions } from '@/lib/personSelectOptions';
import {
  AdmAsosRepeatableFields,
  AdmSimpleRepeatableFields,
  AdmViagensRepeatableFields,
  ASO_TIPO_LABELS,
} from './dpSolicitacaoRepeatableFields';

export type AdmFormRequestType =
  | 'ADM_VIAGENS'
  | 'ADM_EPI_FARDAMENTO'
  | 'ADM_MANUTENCAO_ESCRITORIO'
  | 'ADM_MATERIAL_ESCRITORIO'
  | 'ADM_INFORMATICA'
  | 'ADM_TREINAMENTOS_NR'
  | 'ADM_ASOS'
  | 'ADM_OUTROS';

export const ADM_TYPE_LABELS: Record<AdmFormRequestType, string> = {
  ADM_VIAGENS: 'Viagens',
  ADM_EPI_FARDAMENTO: "EPI's e fardamento",
  ADM_MANUTENCAO_ESCRITORIO: 'Manutenção do escritório',
  ADM_MATERIAL_ESCRITORIO: 'Material de escritório',
  ADM_INFORMATICA: 'Informática',
  ADM_TREINAMENTOS_NR: "Treinamentos e NR's",
  ADM_ASOS: "ASO's",
  ADM_OUTROS: 'Outros',
};

export { ASO_TIPO_LABELS };

export const ADM_SIMPLE_DETAIL_TYPES: AdmFormRequestType[] = [
  'ADM_EPI_FARDAMENTO',
  'ADM_MANUTENCAO_ESCRITORIO',
  'ADM_MATERIAL_ESCRITORIO',
  'ADM_INFORMATICA',
  'ADM_TREINAMENTOS_NR',
];

export type SolicitacaoPayrollEmp = {
  id: string;
  name: string;
  cpf?: string;
  profilePhotoUrl?: string | null;
  department?: string;
  position?: string;
  company?: string | null;
  polo?: string | null;
  costCenter?: string | null;
  birthDate?: string | null;
};

/** Anexo de "Outros": o arquivo só é lido (Base64) no envio da solicitação. */
export type AdmAnexoDraft = { id: string; file: File | null };

export const MAX_ADM_ANEXOS = 10;
const MAX_ADM_ANEXO_BYTES = 15 * 1024 * 1024;

function formatarTamanhoArquivo(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function newAdmAnexoDraft(): AdmAnexoDraft {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, file: null };
}

const admFieldBox = `w-full px-3 py-2.5 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 text-sm appearance-none ${DP_SOLICITACOES_NO_FOCUS_CLS}`;
const admLabelCls = 'block text-sm font-medium mb-1 text-gray-800 dark:text-gray-200';

function admText(details: Record<string, unknown>, key: string): string {
  const v = details[key];
  return typeof v === 'string' ? v : '';
}

function AdmOutrosFields({
  details,
  patchDetails,
  employees,
  anexos,
  onAnexosChange,
}: {
  details: Record<string, unknown>;
  patchDetails: (p: Record<string, unknown>) => void;
  employees: SolicitacaoPayrollEmp[];
  anexos: AdmAnexoDraft[];
  onAnexosChange: (next: AdmAnexoDraft[]) => void;
}) {
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
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [arrastando, setArrastando] = React.useState(false);

  const adicionarArquivos = (arquivos: File[]) => {
    if (!arquivos.length) return;
    const validos = arquivos.filter((f) => {
      if (f.size > MAX_ADM_ANEXO_BYTES) {
        toast.error(`"${f.name}" passa de 15 MB e não foi anexado.`);
        return false;
      }
      return true;
    });
    const vagas = MAX_ADM_ANEXOS - anexos.length;
    if (validos.length > vagas) toast.error(`Máximo de ${MAX_ADM_ANEXOS} anexos por solicitação.`);
    const novos = validos.slice(0, Math.max(0, vagas)).map((file) => ({ ...newAdmAnexoDraft(), file }));
    if (novos.length) onAnexosChange([...anexos, ...novos]);
  };

  return (
    <>
      <div className="md:col-span-2">
        <label className={admLabelCls}>Assunto *</label>
        <input
          type="text"
          value={admText(details, 'assunto')}
          onChange={(e) => patchDetails({ assunto: e.target.value })}
          placeholder="Resumo do assunto"
          className={admFieldBox}
        />
      </div>
      <div className="md:col-span-2">
        <label className={admLabelCls}>Colaborador relacionado</label>
        <SingleSelectSearchDropdown
          value={admText(details, 'colaboradorEmployeeId')}
          onChange={(id) => patchDetails({ colaboradorEmployeeId: id })}
          options={employeeOptions}
          allowEmpty
          placeholder="Selecione o colaborador (opcional)..."
          searchPlaceholder="Pesquisar..."
          noFocusRing
        />
      </div>
      <div className="md:col-span-2">
        <label className={admLabelCls}>Solicitação / descrição detalhada *</label>
        <textarea
          value={admText(details, 'descricao')}
          onChange={(e) => patchDetails({ descricao: e.target.value })}
          placeholder="Descreva detalhadamente o que a Administração precisa tratar"
          className={`${admFieldBox} min-h-[110px] resize-y`}
        />
      </div>
      <div className="md:col-span-2">
        <label className={admLabelCls}>Anexar documento</label>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="sr-only"
          accept=".pdf,image/*,.doc,.docx,.xls,.xlsx,.csv,.txt"
          onChange={(e) => {
            adicionarArquivos(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
        <button
          type="button"
          disabled={anexos.length >= MAX_ADM_ANEXOS}
          onClick={() => inputRef.current?.click()}
          onDragEnter={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setArrastando(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setArrastando(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setArrastando(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setArrastando(false);
            adicionarArquivos(Array.from(e.dataTransfer.files ?? []));
          }}
          className={`flex h-44 w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 text-center transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
            arrastando
              ? 'border-red-500 bg-red-50/70 dark:border-red-500 dark:bg-red-950/30'
              : 'border-gray-300 bg-gray-50/60 hover:border-red-400 hover:bg-red-50/40 dark:border-gray-600 dark:bg-gray-800/40 dark:hover:border-red-500/50 dark:hover:bg-red-950/20'
          }`}
        >
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-500 dark:bg-gray-700 dark:text-gray-300">
            <Upload className="h-5 w-5" />
          </span>
          <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
            {arrastando ? 'Solte os arquivos aqui' : 'Escolher arquivo'}
          </span>
          {!arrastando ? (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Ou arraste e solte o anexo nesta área
            </span>
          ) : null}
        </button>
        {anexos.length > 0 ? (
          <ul className="mt-2 space-y-1.5">
            {anexos.map((anexo, index) => (
              <li
                key={anexo.id}
                className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
              >
                <Paperclip className="h-4 w-4 shrink-0 text-gray-500 dark:text-gray-400" />
                <span className="min-w-0 flex-1 truncate text-gray-800 dark:text-gray-200">
                  {anexo.file?.name ?? `Arquivo ${index + 1}`}
                </span>
                {anexo.file ? (
                  <span className="shrink-0 text-xs text-gray-500 dark:text-gray-400">
                    {formatarTamanhoArquivo(anexo.file.size)}
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => onAnexosChange(anexos.filter((a) => a.id !== anexo.id))}
                  className="rounded-md p-1 text-gray-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:text-gray-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                  aria-label={`Remover ${anexo.file?.name ?? `anexo ${index + 1}`}`}
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </>
  );
}

type Props = {
  requestType: AdmFormRequestType | '';
  details: Record<string, unknown>;
  patchDetails: (p: Record<string, unknown>) => void;
  employees: SolicitacaoPayrollEmp[];
  anexos?: AdmAnexoDraft[];
  onAnexosChange?: (next: AdmAnexoDraft[]) => void;
};

export function AdmTstSolicitacaoTypeFields({
  requestType,
  details,
  patchDetails,
  employees,
  anexos = [],
  onAnexosChange = () => undefined,
}: Props) {
  if (!requestType) return null;

  if (requestType === 'ADM_OUTROS') {
    return (
      <AdmOutrosFields
        details={details}
        patchDetails={patchDetails}
        employees={employees}
        anexos={anexos}
        onAnexosChange={onAnexosChange}
      />
    );
  }

  if (requestType === 'ADM_ASOS') {
    return (
      <div className="md:col-span-2">
        <AdmAsosRepeatableFields details={details} patchDetails={patchDetails} employees={employees} />
      </div>
    );
  }

  if (requestType === 'ADM_VIAGENS') {
    return (
      <div className="md:col-span-2">
        <AdmViagensRepeatableFields details={details} patchDetails={patchDetails} employees={employees} />
      </div>
    );
  }

  if ((ADM_SIMPLE_DETAIL_TYPES as readonly string[]).includes(requestType)) {
    return (
      <div className="md:col-span-2">
        <AdmSimpleRepeatableFields details={details} patchDetails={patchDetails} employees={employees} />
      </div>
    );
  }

  return null;
}

export function isDepartamentoPessoalSector(department?: string | null): boolean {
  const normalized = (department ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
  return normalized === 'departamento pessoal';
}
