'use client';

import React from 'react';
import {
  DetailInfoActions,
  DetailInfoSection,
  type DetailInfoField,
} from '@/components/ui/DetailInfoLayout';
import { AppUnderlineTabButton, AppUnderlineTabList } from '@/components/ui/AppTabButton';
import type { DpTimelineStep } from '@/lib/dpRequestTimeline';

export type DpRequestHistoryModalTab = 'detalhes' | 'timeline';

export type DpRequestHistoryMetaField = DetailInfoField;

export function DpRequestHistoryModalTabs<T extends DpRequestHistoryModalTab | 'comentarios' = DpRequestHistoryModalTab>({
  activeTab,
  onTabChange,
  showComments = false,
}: {
  activeTab: T;
  onTabChange: (tab: T) => void;
  /** Mostra a aba Comentários (conversa da solicitação). */
  showComments?: boolean;
}) {
  const tabCls = 'shrink-0 px-3 py-2.5 text-sm';
  return (
    <AppUnderlineTabList aria-label="Abas da solicitação" centered={false} className="px-6">
      <AppUnderlineTabButton
        active={activeTab === 'detalhes'}
        onClick={() => onTabChange('detalhes' as T)}
        className={tabCls}
      >
        Detalhes
      </AppUnderlineTabButton>
      <AppUnderlineTabButton
        active={activeTab === 'timeline'}
        onClick={() => onTabChange('timeline' as T)}
        className={tabCls}
      >
        Timeline
      </AppUnderlineTabButton>
      {showComments ? (
        <AppUnderlineTabButton
          active={activeTab === 'comentarios'}
          onClick={() => onTabChange('comentarios' as T)}
          className={tabCls}
        >
          Comentários
        </AppUnderlineTabButton>
      ) : null}
    </AppUnderlineTabList>
  );
}

/**
 * Corpo do modal da solicitação: as abas ficam fixas (fora da rolagem) e só o conteúdo abaixo delas rola,
 * com a barra de rolagem começando depois da linha das abas. Use com `scrollContent={false}` e
 * `contentClassName="!p-0"` no Modal.
 */
export function DpRequestHistoryModalBody({
  tabs,
  children,
  fill = false,
}: {
  tabs: React.ReactNode;
  children: React.ReactNode;
  /** Ocupa a altura toda sem rolar (aba Comentários, que rola só a lista de mensagens). */
  fill?: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="shrink-0">{tabs}</div>
      <div
        className={
          fill
            ? 'flex min-h-0 flex-1 flex-col overflow-hidden px-6 pb-6 pt-4'
            : 'app-thin-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pb-6 pt-4'
        }
      >
        {children}
      </div>
    </div>
  );
}

export function DpRequestHistoryMetaCard({
  title = 'Informações gerais',
  fields,
}: {
  title?: string;
  fields: DpRequestHistoryMetaField[];
}) {
  return <DetailInfoSection title={title} fields={fields} columns={3} />;
}

export function DpRequestHistorySectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return <DetailInfoSection title={title}>{children}</DetailInfoSection>;
}

export function DpRequestHistoryModalFooter({ children }: { children: React.ReactNode }) {
  return <DetailInfoActions>{children}</DetailInfoActions>;
}

function stripResponsibleFromNote(note: string) {
  return note
    .split(/\r?\n/)
    .filter((line) => !/^\s*respons[aá]vel\s*:/i.test(line))
    .join('\n')
    .trim();
}

export function DpRequestHistoryTimeline({
  steps,
  formatDateTime,
}: {
  steps: DpTimelineStep[];
  formatDateTime: (iso: string) => string;
}) {
  return (
    <div className="space-y-2">
      {steps.map((step) => {
        const noteWithoutResponsible = stripResponsibleFromNote(step.note || '');
        return (
          <div
            key={step.key}
            className="rounded-lg border border-gray-200 px-3 py-2.5 text-sm dark:border-gray-700"
          >
            <div className="flex justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-gray-900 dark:text-gray-100">{step.title}</p>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  {step.from === step.to ? (
                    formatDateTime(new Date(step.from).toISOString())
                  ) : (
                    <>
                      {formatDateTime(new Date(step.from).toISOString())}
                      {' → '}
                      {step.isOngoing
                        ? 'Em andamento'
                        : formatDateTime(new Date(step.to).toISOString())}
                    </>
                  )}
                </p>
                {step.actorName ? (
                  <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                    <span className="font-medium text-gray-700 dark:text-gray-200">Responsável:</span>{' '}
                    {step.actorName}
                  </p>
                ) : null}
                {noteWithoutResponsible ? (
                  <p className="mt-1 whitespace-pre-wrap break-words text-xs text-gray-600 dark:text-gray-400">
                    <span className="font-medium text-gray-700 dark:text-gray-300">Obs.:</span>{' '}
                    {noteWithoutResponsible}
                  </p>
                ) : null}
              </div>
              {step.from !== step.to ? (
                <span className="my-auto shrink-0 whitespace-nowrap text-xs text-gray-600 dark:text-gray-400">
                  {step.leadTime}
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
