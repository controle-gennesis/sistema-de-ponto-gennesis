'use client';

import React, { useRef, useState } from 'react';
import { CheckCircle, Download, FileSpreadsheet, Loader2, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import api from '@/lib/api';
import {
  downloadBillingOnlyImportTemplate,
  parseBillingOnlyWorkbook,
  type BillingOnlyImportResult,
  type BillingOnlyImportSkipped,
} from '@/lib/billingOnlyImport';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  contractId: string;
  onImported: () => void;
};

function errMessage(err: unknown): string {
  const ax = err as { response?: { data?: { message?: string } }; message?: string };
  return ax.response?.data?.message || ax.message || 'Erro na importação';
}

export function BillingOnlyImportModal({ isOpen, onClose, contractId, onImported }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState('');
  const [parsed, setParsed] = useState<BillingOnlyImportResult | null>(null);
  const [skipped, setSkipped] = useState<BillingOnlyImportSkipped[]>([]);
  const [progress, setProgress] = useState<string | null>(null);

  const reset = () => {
    setFileName('');
    setParsed(null);
    setSkipped([]);
    setProgress(null);
    setIsDragging(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    if (isImporting) return;
    reset();
    onClose();
  };

  const applyFile = async (file: File) => {
    setFileName(file.name);
    try {
      const report = await parseBillingOnlyWorkbook(file);
      setParsed(report);
      setSkipped(report.skipped);
      if (report.rows.length === 0 && report.skipped.length === 0) {
        toast.error('Nenhuma nota encontrada na planilha.');
      }
    } catch {
      setParsed(null);
      setSkipped([]);
      toast.error('Não foi possível ler a planilha.');
    }
  };

  const runImport = async () => {
    if (!parsed?.rows.length) {
      toast.error('Nenhuma nota válida para importar.');
      return;
    }
    setIsImporting(true);
    const failures: string[] = [];
    let created = 0;
    try {
      for (const row of parsed.rows) {
        setProgress(`Importando NF ${row.invoiceNumber}…`);
        try {
          await api.post(`/contracts/${contractId}/billings`, {
            issueDate: row.issueDate,
            invoiceNumber: row.invoiceNumber,
            serviceOrder: '',
            pleitoId: '',
            grossValue: row.grossValue,
            netValue: row.netValue,
          });
          created += 1;
        } catch (err) {
          failures.push(`Linha ${row.line} (NF ${row.invoiceNumber}): ${errMessage(err)}`);
        }
      }

      onImported();

      if (created) {
        toast.success(`${created} faturamento(s) importado(s).`);
      }
      if (failures.length) {
        toast.error(`${failures.length} linha(s) com erro.`);
        setSkipped((prev) => [
          ...prev,
          ...failures.map((reason, i) => ({
            line: i + 1,
            reasons: [reason],
            preview: '',
          })),
        ]);
      } else if (created) {
        handleClose();
      } else {
        toast.error('Nenhum registro foi importado.');
      }
    } finally {
      setIsImporting(false);
      setProgress(null);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Importar faturamento" size="lg">
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Importe a planilha só com <strong>nota fiscal</strong>, <strong>emissão</strong>,{' '}
          <strong>valor bruto</strong> e <strong>valor líquido</strong>. OS e pleito ficam em branco.
        </p>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/40">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-gray-100">
              <FileSpreadsheet className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              Modelo da planilha
            </div>
            <button
              type="button"
              onClick={() => {
                try {
                  downloadBillingOnlyImportTemplate();
                  toast.success('Modelo baixado.');
                } catch {
                  toast.error('Erro ao baixar o modelo.');
                }
              }}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <Download className="h-4 w-4" />
              Baixar modelo
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
            Colunas: NOTA FISCAL, EMISSÃO, VALOR BRUTO, VALOR LÍQUIDO. A linha TOTAL é ignorada.
          </p>
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) void applyFile(file);
          }}
          className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
            isDragging
              ? 'border-green-400 bg-green-50 dark:border-green-500 dark:bg-green-950/30'
              : 'border-gray-300 dark:border-gray-600'
          }`}
        >
          <Upload className="mx-auto h-8 w-8 text-gray-400" />
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Arraste o arquivo .xlsx ou selecione no computador
          </p>
          <input
            ref={fileInputRef}
            id="billing-only-import-file"
            type="file"
            accept=".xlsx,.xls"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void applyFile(file);
            }}
          />
          <label
            htmlFor="billing-only-import-file"
            className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-gray-900 px-3 py-2 text-sm font-medium text-white dark:bg-gray-100 dark:text-gray-900"
          >
            Selecionar arquivo
          </label>
          {fileName ? (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{fileName}</p>
          ) : null}
        </div>

        {parsed ? (
          <div className="rounded-lg border border-gray-200 p-3 text-center text-sm dark:border-gray-700">
            <p className="text-xs text-gray-500">Notas válidas</p>
            <p className="font-semibold text-gray-900 dark:text-gray-100">{parsed.rows.length}</p>
          </div>
        ) : null}

        {progress ? (
          <p className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            {progress}
          </p>
        ) : null}

        {skipped.length > 0 ? (
          <div className="max-h-40 overflow-y-auto rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs dark:border-amber-800 dark:bg-amber-950/30">
            <p className="mb-1 font-medium text-amber-800 dark:text-amber-200">
              Avisos ({skipped.length})
            </p>
            <ul className="space-y-1 text-amber-900 dark:text-amber-100">
              {skipped.slice(0, 40).map((s, i) => (
                <li key={`${s.line}-${i}`}>
                  linha {s.line}: {s.reasons.join('; ')}
                  {s.preview ? ` — ${s.preview}` : ''}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex justify-end gap-2 border-t border-gray-200 pt-3 dark:border-gray-700">
          <button
            type="button"
            onClick={handleClose}
            disabled={isImporting}
            className="rounded-lg bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void runImport()}
            disabled={isImporting || !parsed?.rows.length}
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {isImporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4" />
            )}
            Importar{parsed?.rows.length ? ` (${parsed.rows.length})` : ''}
          </button>
        </div>
      </div>
    </Modal>
  );
}
