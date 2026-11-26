'use client';

import { FileText } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { resolveApiMediaUrl } from '@/lib/resolveMediaUrl';
import { type AnaliseClaudeData } from './LicitacaoAnaliseClaudePanel';

/** PDF e recomendação da Análise Claude, mostrados nas etapas seguintes. */
export function LicitacaoAnaliseClaudeResumo({ analise }: { analise?: AnaliseClaudeData | null | unknown }) {
  const data = (analise ?? null) as AnaliseClaudeData | null;
  const url = resolveApiMediaUrl(data?.url ?? null);
  const link = /^https?:\/\//i.test(data?.linkClaude ?? '') ? data!.linkClaude! : '';
  const recomendacao = data?.recomendacao?.trim() ?? '';
  if (!url && !link && !recomendacao && !data?.rejeicaoMotivo) return null;

  return (
    <Card padding="none" className="shadow-sm">
      <CardContent className="px-5 py-4">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Análise Claude</p>
        {url ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex items-center gap-2 break-all text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            <FileText className="h-4 w-4 shrink-0" />
            {data?.nome || 'Abrir PDF'}
          </a>
        ) : null}
        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 block break-all text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
          >
            {link}
          </a>
        ) : null}
        {recomendacao ? (
          <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-200">Recomendação: {recomendacao}</p>
        ) : null}
        {data?.rejeicaoMotivo ? (
          <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700 dark:text-gray-200">
            Motivo da rejeição: {data.rejeicaoMotivo}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
