'use client';

import React from 'react';
import {
  DetailInfoActions,
  DetailInfoSection,
  type DetailInfoField,
} from '@/components/ui/DetailInfoLayout';
import type { DpTimelineStep } from '@/lib/dpRequestTimeline';

export type DpRequestHistoryModalTab = 'detalhes' | 'timeline';

export type DpRequestHistoryMetaField = DetailInfoField;

const tabBtnCls = (active: boolean) =>
  `min-w-[7.5rem] rounded-md px-5 py-2 text-sm font-medium transition-all ${
    active
      ? 'bg-red-600 text-white shadow-sm dark:bg-red-600 dark:text-white'
      : 'text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
  }`;

export function DpRequestHistoryModalTabs({
  activeTab,
  onTabChange,
}: {
  activeTab: DpRequestHistoryModalTab;
  onTabChange: (tab: DpRequestHistoryModalTab) => void;
}) {
  return (
    <div className="flex justify-center px-1">
      <div
        className="inline-flex rounded-lg border border-gray-200 bg-gray-100 p-1 dark:border-gray-600 dark:bg-gray-800/90"
        role="tablist"
        aria-label="Abas da solicitação"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'detalhes'}
          onClick={() => onTabChange('detalhes')}
          className={tabBtnCls(activeTab === 'detalhes')}
        >
          Detalhes
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'timeline'}
          onClick={() => onTabChange('timeline')}
          className={tabBtnCls(activeTab === 'timeline')}
        >
          Timeline
        </button>
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
