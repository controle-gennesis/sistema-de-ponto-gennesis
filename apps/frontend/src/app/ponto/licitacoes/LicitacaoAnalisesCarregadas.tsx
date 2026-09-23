'use client';

import { ExternalLink, FileText } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import {
  analisePreliminarRows,
  parseAnalisePreliminar,
  type AnalisePreliminarData,
} from './licitacaoAnalisePreliminar';
import { LicitacaoChecklistResumo } from './LicitacaoChecklistResumo';
import { LicitacaoNaoSeHabilitaPanel } from './LicitacaoNaoSeHabilitaPanel';
import type { ChecklistResumoSection } from './licitacaoChecklist';
import type { NaoSeHabilitaItem } from './LicitacaoNaoSeHabilitaPanel';

export type LicitacaoAnalisesCarregadasProps = {
  titulo?: string;
  /** Exibe o quadro da Análise Preliminar */
  showPreliminar?: boolean;
  analisePreliminar?: AnalisePreliminarData | null | unknown;
  linkNotebookLm?: string | null;
  showNotebook?: boolean;
  /** Sua análise + Análise de Viabilidade + Não se habilita */
  showEmAnaliseResumo?: boolean;
  analiseUsuario?: string | null;
  responsavelAnalise?: string | null;
  viabilidadeSections?: ChecklistResumoSection[];
  naoSeHabilita?: boolean;
  naoSeHabilitaItens?: NaoSeHabilitaItem[];
  /** Decisão / texto da Análise Diretoria */
  showDiretoria?: boolean;
  decisaoLabel?: string | null;
  analiseFinalTexto?: string | null;
  /** Anexos / documentos */
  anexos?: Array<{ id: string; nome: string; url?: string | null }>;
  className?: string;
};

function notebookHref(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function LicitacaoAnalisesCarregadas({
  titulo,
  showPreliminar = true,
  analisePreliminar,
  linkNotebookLm,
  showNotebook = true,
  showEmAnaliseResumo = false,
  analiseUsuario,
  responsavelAnalise,
  viabilidadeSections = [],
  naoSeHabilita = false,
  naoSeHabilitaItens = [],
  showDiretoria = false,
  decisaoLabel,
  analiseFinalTexto,
  anexos = [],
  className = '',
}: LicitacaoAnalisesCarregadasProps) {
  const prelim = parseAnalisePreliminar(analisePreliminar, titulo ?? '');
  const prelimRows = analisePreliminarRows(prelim);
  const hasPrelim =
    Boolean(prelim.cabecalho?.trim()) ||
    prelim.rows.some((r) => r.label.trim() || r.value.trim());
  const notebook = linkNotebookLm?.trim() ?? '';

  return (
    <div className={`space-y-5 ${className}`}>
      <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50/40 px-4 py-3 dark:border-gray-700 dark:bg-gray-950/20">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Análises carregadas das etapas anteriores
        </p>
        <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
          Conteúdo salvo nas fases anteriores desta licitação.
        </p>
      </div>

      {showDiretoria ? (
        <Card padding="none" className="shadow-sm">
          <CardHeader className="border-b border-gray-100 px-5 py-3 dark:border-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              Análise Diretoria
            </h3>
          </CardHeader>
          <CardContent className="space-y-3 px-5 py-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Decisão
              </p>
              <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                {decisaoLabel?.trim() || '—'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Análise final
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-gray-800 dark:text-gray-200">
                {analiseFinalTexto?.trim() || '—'}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {showPreliminar ? (
        <Card padding="none" className="shadow-sm">
          <CardHeader className="border-b border-gray-100 px-5 py-3 dark:border-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">
              Análise Preliminar
            </h3>
          </CardHeader>
          <CardContent className="px-5 py-4">
            {!hasPrelim ? (
              <p className="text-sm text-gray-500">Nenhuma análise preliminar salva.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-gray-900 dark:border-gray-300">
                {prelim.cabecalho.trim() ? (
                  <div className="border-b border-gray-900 px-3 py-2 text-center text-sm font-bold uppercase dark:border-gray-300">
                    {prelim.cabecalho}
                  </div>
                ) : null}
                <table className="w-full border-collapse text-sm">
                  <tbody>
                    {prelimRows.map((row) => (
                      <tr key={`${row.label}-${row.value}`} className="border-t border-gray-900 dark:border-gray-300">
                        <th className="w-[11rem] border-r border-gray-900 px-2 py-2 text-right align-top text-xs font-bold uppercase dark:border-gray-300 sm:w-[14rem]">
                          {row.label}
                        </th>
                        <td className="px-3 py-2 align-top whitespace-pre-wrap">{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

      {showNotebook ? (
        <Card padding="none" className="shadow-sm">
          <CardContent className="px-5 py-4">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Notebook LM
            </p>
            {notebook ? (
              <a
                href={notebookHref(notebook)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-start gap-1.5 break-all text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {notebook}
              </a>
            ) : (
              <p className="mt-1 text-sm text-gray-500">—</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {showEmAnaliseResumo ? (
        <>
          <Card padding="none" className="shadow-sm">
            <CardHeader className="border-b border-gray-100 px-5 py-3 dark:border-gray-800">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">Sua análise</h3>
            </CardHeader>
            <CardContent className="px-5 py-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800 dark:text-gray-200">
                {analiseUsuario?.trim() || '—'}
              </p>
            </CardContent>
          </Card>

          <Card padding="none" className="shadow-sm">
            <CardHeader className="border-b border-gray-100 px-5 py-4 dark:border-gray-800">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                Análise de Viabilidade
              </h3>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              <LicitacaoChecklistResumo
                sections={viabilidadeSections}
                responsavelAnalise={responsavelAnalise ?? ''}
                linkNotebookLm={showNotebook ? undefined : notebook}
                selectedTitulo={titulo}
                analiseUsuario={analiseUsuario ?? ''}
              />
            </CardContent>
          </Card>

          <LicitacaoNaoSeHabilitaPanel
            enabled={naoSeHabilita}
            onEnabledChange={() => undefined}
            items={naoSeHabilitaItens}
            onItemsChange={() => undefined}
            disabled
          />
        </>
      ) : null}

      {anexos.length > 0 ? (
        <Card padding="none" className="shadow-sm">
          <CardHeader className="border-b border-gray-100 px-5 py-3 dark:border-gray-800">
            <h3 className="font-semibold text-gray-900 dark:text-gray-100">Anexos</h3>
          </CardHeader>
          <CardContent className="px-5 py-4">
            <ul className="space-y-2">
              {anexos.map((anexo) => (
                <li key={anexo.id}>
                  {anexo.url ? (
                    <a
                      href={anexo.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
                    >
                      <FileText className="h-4 w-4" />
                      {anexo.nome}
                    </a>
                  ) : (
                    <span className="inline-flex items-center gap-2 text-sm text-gray-700 dark:text-gray-200">
                      <FileText className="h-4 w-4" />
                      {anexo.nome}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
