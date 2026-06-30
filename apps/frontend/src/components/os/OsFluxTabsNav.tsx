'use client';

import { TabCountBadge } from '@/components/ui/TabCountBadge';
import type { OsTab, OsTabCounts } from './osFluxTypes';
import { OS_FLUX_DEFAULT_TAB, OS_TAB_LABELS } from './osFluxUtils';

export { OS_FLUX_DEFAULT_TAB };

const OS_FLUX_TABS: ReadonlyArray<{ id: OsTab; label: string }> = [
  { id: 'orcamento', label: OS_TAB_LABELS.orcamento },
  { id: 'aprovadas', label: OS_TAB_LABELS.aprovadas },
  { id: 'execucao', label: OS_TAB_LABELS.execucao },
  { id: 'pleito', label: OS_TAB_LABELS.pleito },
  { id: 'faturamento', label: OS_TAB_LABELS.faturamento },
  { id: 'concluidas', label: OS_TAB_LABELS.concluidas },
  { id: 'standby', label: OS_TAB_LABELS.standby }
];

export function OsFluxTabsNav({
  activeTab,
  onActiveTab,
  tabCounts
}: {
  activeTab: OsTab;
  onActiveTab: (tab: OsTab) => void;
  tabCounts: OsTabCounts;
}) {
  return (
    <div id="secao-fluxo-os-tabs" className="scroll-mt-4">
      <div className="bg-transparent px-2">
        <nav className="-mb-px flex flex-wrap justify-center gap-x-1 gap-y-2 overflow-x-auto py-3 sm:gap-x-2">
          {OS_FLUX_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onActiveTab(tab.id)}
              className={`flex items-center gap-2 whitespace-nowrap rounded-t-lg border-b-2 px-2 py-2 text-xs font-medium transition-colors sm:px-3 sm:text-sm ${
                activeTab === tab.id
                  ? 'border-red-500 text-red-600 dark:border-red-400 dark:text-red-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
              }`}
            >
              {tab.label}
              <TabCountBadge count={tabCounts[tab.id]} active={activeTab === tab.id} tone="red" />
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
