'use client';

import React, { useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  FileArchive,
  FileSpreadsheet,
  Loader2,
  Paperclip,
  Upload,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { Modal } from '@/components/ui/Modal';
import { postJuridicoMultipart } from '@/lib/juridicoMultipartUpload';
import {
  collectFdAnexos,
  inspectFdFilePack,
  parseFichaDemandaImportFromFile,
  type FdImportReport,
  type LinkedFilePack,
} from '@/lib/fichaDemandaImport';

type Props = {
  isOpen: boolean;
  onClose: () => void;
  onImported: () => void;
};

type DropKind = 'planilha' | 'anexos';

type ImportProgressState = {
  step: number;
  totalSteps: number;
  label: string;
  detail?: string;
  uploadPercent: number | null;
  /** true depois que o upload HTTP terminou e o servidor ainda processa */
  serverProcessing?: boolean;
};

function isZipName(name: string) {
  return name.toLowerCase().endsWith('.zip');
}

function DropZone({
  id,
  icon: Icon,
  title,
  hint,
  accept,
  multiple,
  fileLabel,
  ready,
  onFiles,
  onClear,
}: {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  hint: string;
  accept: string;
  multiple?: boolean;
  fileLabel: string;
  ready: boolean;
  onFiles: (files: File[]) => void;
  onClear?: () => void;
}) {
  return (
    <label
      htmlFor={id}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
      onDrop={(e) => {
        e.preventDefault();
        const list = Array.from(e.dataTransfer.files || []);
        if (list.length) onFiles(list);
      }}
      className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-5 text-center transition-colors ${
        ready
          ? 'border-green-500 bg-green-50/80 dark:border-green-600 dark:bg-green-950/20'
          : 'border-gray-300 bg-gray-50/60 hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800/40'
      }`}
    >
      {ready ? (
        <CheckCircle2 className="h-7 w-7 text-green-600 dark:text-green-400" />
      ) : (
        <Icon className="h-7 w-7 text-gray-400" />
      )}
      <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400">{fileLabel || hint}</p>
      {ready && onClear ? (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onClear();
          }}
          className="text-xs font-medium text-red-600 underline-offset-2 hover:underline dark:text-red-400"
        >
          Remover
        </button>
      ) : null}
      <input
        id={id}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const list = Array.from(e.target.files || []);
          if (list.length) onFiles(list);
          e.target.value = '';
        }}
      />
    </label>
  );
}

export function FichaDemandaImportModal({ isOpen, onClose, onImported }: Props) {
  const [report, setReport] = useState<FdImportReport | null>(null);
  const [sheetName, setSheetName] = useState('');
  const [anexoPack, setAnexoPack] = useState<LinkedFilePack | null>(null);
  const [anexoFiles, setAnexoFiles] = useState<File[]>([]);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<ImportProgressState | null>(null);
  const [lastResult, setLastResult] = useState<{
    created: number;
    updated: number;
    failed: number;
    anexosLinked: number;
    warnings: number;
    errors: { index: number; message: string }[];
  } | null>(null);
  const [reading, setReading] = useState<DropKind | null>(null);
  const dragKind = useRef<DropKind | null>(null);

  const anexos = useMemo(() => (report ? collectFdAnexos(report.fichas) : []), [report]);
  const usedSheets = report?.sheets.filter((s) => s.kind !== 'ignorada') || [];

  const reset = () => {
    setReport(null);
    setSheetName('');
    setAnexoPack(null);
    setAnexoFiles([]);
    setImportProgress(null);
    setLastResult(null);
  };

  const handleClose = () => {
    if (importing) return;
    reset();
    onClose();
  };

  const postImportStep = async (
    fd: FormData,
    progress: Omit<ImportProgressState, 'uploadPercent' | 'serverProcessing'>,
  ) => {
    setImportProgress({ ...progress, uploadPercent: 0, serverProcessing: false });
    const body = await postJuridicoMultipart<{
      data?: {
        created?: number;
        updated?: number;
        failed?: number;
        anexosLinked?: number;
        warnings?: number;
        errors?: { index: number; message: string }[];
      };
    }>('/demand-sheet-approvals/import', fd, (loaded, total) => {
      if (!total) {
        setImportProgress((prev) =>
          prev ? { ...prev, ...progress, uploadPercent: null, serverProcessing: false } : prev,
        );
        return;
      }
      const pct = Math.min(100, Math.round((loaded / total) * 100));
      const done = pct >= 100;
      setImportProgress((prev) =>
        prev
          ? {
              ...prev,
              ...progress,
              uploadPercent: pct,
              serverProcessing: done,
              label: done
                ? progress.label.replace(/^Enviando/, 'Processando').replace(/…$/, '') +
                  ' no servidor…'
                : progress.label,
              detail: done
                ? 'Upload concluído. Extraindo/vinculando anexos — pode levar vários minutos.'
                : progress.detail,
            }
          : prev,
      );
    });
    setImportProgress((prev) =>
      prev ? { ...prev, ...progress, uploadPercent: 100, serverProcessing: false } : prev,
    );
    return body?.data;
  };

  const handleSpreadsheet = async (files: File[]) => {
    const file = files[0];
    if (!file) return;
    setReading('planilha');
    try {
      const parsed = await parseFichaDemandaImportFromFile(file);
      setReport(parsed);
      setSheetName(file.name);
      setAnexoPack(null);
      setAnexoFiles([]);
      setLastResult(null);
      toast.success(
        `${parsed.fichas.length} ficha(s) lidas de ${parsed.fichaSheetName}` +
          (parsed.anexoPaths ? ` · ${parsed.anexoPaths} anexo(s)` : ''),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Falha ao ler a planilha.');
      setReport(null);
      setSheetName('');
    } finally {
      setReading(null);
    }
  };

  const handleAnexos = async (files: File[]) => {
    setReading('anexos');
    try {
      const pack = await inspectFdFilePack(files, report ? anexos : []);
      setAnexoFiles(files);
      setAnexoPack(pack);
      toast.success(
        report
          ? `${pack.names.length} arquivo(s) · ${pack.matched} com vínculo na planilha.`
          : `${pack.names.length} arquivo(s) no ZIP. O vínculo será feito com as fichas já cadastradas.`,
      );
    } catch (err) {
      // ZIP enorme: ainda assim guarda o arquivo para o envio no servidor.
      const zipOnly = files.filter((f) => isZipName(f.name));
      if (zipOnly.length) {
        setAnexoFiles(files);
        setAnexoPack({
          names: zipOnly.map((f) => f.name),
          matched: 0,
          unmatchedSample: [],
        });
        toast.success(
          'ZIP selecionado. O vínculo dos anexos será feito no servidor ao importar.',
        );
      } else {
        toast.error(err instanceof Error ? err.message : 'Falha ao ler os anexos.');
      }
    } finally {
      setReading(null);
    }
  };

  const runImport = async () => {
    if (!report?.fichas.length && !anexoFiles.length) {
      toast.error('Selecione a planilha e/ou o ZIP de anexos.');
      return;
    }

    const payloadJson = report?.fichas.length
      ? JSON.stringify({ fichas: report.fichas })
      : '';
    const anexoZips = anexoFiles.filter((f) => isZipName(f.name));
    const anexoLoose = anexoFiles.filter((f) => !isZipName(f.name));

    const steps: Array<{
      label: string;
      detail?: string;
      build: () => FormData;
    }> = [];

    if (report?.fichas.length) {
      steps.push({
        label: 'Salvando fichas da planilha…',
        detail: `${report.fichas.length} ficha(s)`,
        build: () => {
          const fd = new FormData();
          fd.append('payload', payloadJson);
          return fd;
        },
      });
    }

    /** ZIPs/avulsos: só o arquivo — o backend vincula pelos caminhos já salvos. */
    const linkPayload = JSON.stringify({ mode: 'link-anexos', fichas: [] });

    if (anexoLoose.length) {
      steps.push({
        label: 'Enviando anexos avulsos…',
        detail: `${anexoLoose.length} arquivo(s)`,
        build: () => {
          const fd = new FormData();
          fd.append('payload', linkPayload);
          for (const file of anexoLoose) fd.append('anexos', file);
          return fd;
        },
      });
    }

    anexoZips.forEach((file, idx) => {
      steps.push({
        label: `Enviando ZIP de anexos (${idx + 1}/${anexoZips.length})…`,
        detail: file.name,
        build: () => {
          const fd = new FormData();
          fd.append('payload', linkPayload);
          fd.append('anexosZip', file);
          return fd;
        },
      });
    });

    if (!steps.length) {
      toast.error('Nada para importar.');
      return;
    }

    setImporting(true);
    setLastResult(null);
    const totals = {
      created: 0,
      updated: 0,
      failed: 0,
      anexosLinked: 0,
      warnings: 0,
      errors: [] as { index: number; message: string }[],
    };
    const sheetStepIndex = report?.fichas.length ? 0 : -1;

    try {
      for (let i = 0; i < steps.length; i += 1) {
        const step = steps[i]!;
        const data = await postImportStep(step.build(), {
          step: i + 1,
          totalSteps: steps.length,
          label: step.label,
          detail: step.detail,
        });
        if (i === sheetStepIndex) {
          totals.created = data?.created || 0;
          totals.updated = data?.updated || 0;
          totals.failed = data?.failed || 0;
          totals.warnings = data?.warnings || 0;
          totals.errors = Array.isArray(data?.errors) ? data.errors : [];
        }
        totals.anexosLinked += data?.anexosLinked || 0;
        if (sheetStepIndex < 0) {
          totals.updated += data?.updated || 0;
          totals.warnings += data?.warnings || 0;
        }
      }

      setLastResult(totals);
      const saved = totals.created + totals.updated;
      if (saved === 0 && totals.anexosLinked === 0) {
        toast.error(
          totals.failed
            ? `Nenhuma ficha salva · ${totals.failed} falha(s). Veja os erros abaixo.`
            : 'Nada foi importado. Confira a planilha/ZIP e tente de novo.',
        );
        return;
      }

      toast.success(
        report?.fichas.length
          ? `Importação: ${totals.created} nova(s), ${totals.updated} atualizada(s)` +
              (totals.anexosLinked ? ` · ${totals.anexosLinked} anexo(s) vinculados` : '') +
              (totals.failed ? ` · ${totals.failed} falha(s)` : '')
          : `${totals.anexosLinked} anexo(s) vinculados` +
              (totals.updated ? ` em ${totals.updated} ficha(s)` : ''),
      );
      onImported();
      if (totals.failed === 0) {
        reset();
        onClose();
      }
    } catch (err: unknown) {
      const ax = err as { message?: string };
      toast.error(ax.message || 'Erro na importação.');
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  };

  const overallPercent = importProgress
    ? Math.round(
        ((importProgress.step - 1) / Math.max(1, importProgress.totalSteps)) * 100 +
          ((importProgress.uploadPercent ?? 50) / Math.max(1, importProgress.totalSteps)),
      )
    : 0;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Importar Fichas de Demanda"
      size="xl"
      closeOnOverlayClick={!importing}
    >
      <div className="space-y-5">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Envie a planilha <strong>DB_FD_SUPRIMENTOS.xlsx</strong> e/ou o ZIP dos anexos
          (<code className="text-xs">TB_ANEXO_FICHA_DEMANDA_Files_</code>). Se as fichas já
          estiverem cadastradas, pode importar <strong>só o ZIP</strong> para vincular os
          arquivos.
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div
            onDragEnter={() => {
              dragKind.current = 'planilha';
            }}
          >
            <DropZone
              id="fd-import-sheet"
              icon={FileSpreadsheet}
              title="Planilha Excel"
              hint="DB_FD_SUPRIMENTOS.xlsx"
              accept=".xlsx,.xls"
              fileLabel={
                reading === 'planilha'
                  ? 'Lendo planilha…'
                  : sheetName || 'Arraste ou clique para selecionar'
              }
              ready={!!report}
              onFiles={handleSpreadsheet}
              onClear={report ? reset : undefined}
            />
          </div>
          <div
            onDragEnter={() => {
              dragKind.current = 'anexos';
            }}
          >
            <DropZone
              id="fd-import-anexos"
              icon={FileArchive}
              title="Anexos (ZIP ou arquivos)"
              hint="Compacte a pasta TB_ANEXO_FICHA_DEMANDA_Files_ em .zip"
              accept=".zip,application/zip,*/*"
              multiple
              fileLabel={
                reading === 'anexos'
                  ? 'Lendo anexos…'
                  : anexoPack
                    ? report
                      ? `${anexoPack.names.length} arquivo(s) · ${anexoPack.matched} vinculados`
                      : `${anexoPack.names.length} arquivo(s) · vínculo no servidor`
                    : 'Opcional se já importou a planilha'
              }
              ready={!!anexoPack}
              onFiles={handleAnexos}
              onClear={
                anexoPack
                  ? () => {
                      setAnexoPack(null);
                      setAnexoFiles([]);
                    }
                  : undefined
              }
            />
          </div>
        </div>

        {report ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm dark:border-gray-700 dark:bg-gray-800/50">
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-gray-400" />
                <span>
                  <strong>{report.fichas.length}</strong> fichas
                </span>
              </div>
              <div>
                <strong>{report.anexoPaths}</strong> caminhos de anexo na planilha
              </div>
            </div>
            <p className="mt-2 text-xs text-gray-600 dark:text-gray-300">
              Fonte: <strong>{report.fichaSheetName}</strong>
              {report.anexoSheetName ? (
                <>
                  {' '}
                  · anexos: <strong>{report.anexoSheetName}</strong>
                </>
              ) : null}
            </p>
            {usedSheets.length ? (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                Abas: {usedSheets.map((s) => `${s.name} (${s.kind}, ${s.rows})`).join(' · ')}
              </p>
            ) : null}
            {anexoPack?.unmatchedSample?.length ? (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
                Exemplos sem vínculo: {anexoPack.unmatchedSample.join(', ')}
              </p>
            ) : null}
          </div>
        ) : null}

        {importProgress ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-950/20">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-red-800 dark:text-red-200">
              <Loader2 className="h-4 w-4 animate-spin" />
              Etapa {importProgress.step}/{importProgress.totalSteps}: {importProgress.label}
            </div>
            {importProgress.detail ? (
              <p className="mb-2 text-xs text-red-700/80 dark:text-red-300/80">
                {importProgress.detail}
              </p>
            ) : null}
            <div className="h-2 overflow-hidden rounded-full bg-red-100 dark:bg-red-950">
              <div
                className="h-full rounded-full bg-red-600 transition-all"
                style={{ width: `${overallPercent}%` }}
              />
            </div>
          </div>
        ) : null}

        {lastResult ? (
          <div
            className={`rounded-xl border p-4 text-sm ${
              lastResult.created + lastResult.updated === 0
                ? 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100'
                : 'border-green-300 bg-green-50 text-green-950 dark:border-green-800 dark:bg-green-950/30 dark:text-green-100'
            }`}
          >
            <p className="font-semibold">
              Resultado: {lastResult.created} nova(s), {lastResult.updated} atualizada(s)
              {lastResult.failed ? ` · ${lastResult.failed} falha(s)` : ''}
              {lastResult.anexosLinked ? ` · ${lastResult.anexosLinked} anexo(s)` : ''}
            </p>
            {lastResult.errors.length ? (
              <ul className="mt-2 max-h-40 list-disc space-y-1 overflow-y-auto pl-5 text-xs">
                {lastResult.errors.slice(0, 20).map((err) => (
                  <li key={`${err.index}-${err.message}`}>
                    Linha {err.index}: {err.message}
                  </li>
                ))}
                {lastResult.errors.length > 20 ? (
                  <li>… e mais {lastResult.errors.length - 20} erro(s)</li>
                ) : null}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="flex justify-end gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
          <button
            type="button"
            onClick={handleClose}
            disabled={importing}
            className="rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-800 hover:bg-gray-200 disabled:opacity-50 dark:bg-gray-700 dark:text-gray-200"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={runImport}
            disabled={(!report && !anexoFiles.length) || importing || reading !== null}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {report ? 'Importar' : 'Vincular anexos'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
