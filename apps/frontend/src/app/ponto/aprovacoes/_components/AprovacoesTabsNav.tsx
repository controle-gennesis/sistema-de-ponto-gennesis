'use client';

import { NotificationCountBadge } from '@/components/ui/NotificationCountBadge';

export type AprovacaoTabId = 'dp' | 'espelho' | 'fd' | 'fuel' | 'rm' | 'oc';

export type AprovacaoTabDef = {
  id: AprovacaoTabId;
  label: string;
  count?: number;
};

export function AprovacoesTabsNav({
  tabs,
  activeTab,
  onTabChange,
}: {
  tabs: AprovacaoTabDef[];
  activeTab: AprovacaoTabId;
  onTabChange: (tab: AprovacaoTabId) => void;
}) {
  if (tabs.length <= 1) return null;

  return (
    <nav
      className="flex flex-wrap justify-center gap-1 border-b border-gray-200 dark:border-gray-700"
      aria-label="Abas de aprovações"
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center gap-2 whitespace-nowrap rounded-t-lg border-b-2 px-3 py-3 text-sm font-medium transition-colors sm:px-4 ${
              isActive
                ? 'border-red-600 text-red-700 dark:border-red-500 dark:text-red-400'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            {tab.label}
            <NotificationCountBadge count={tab.count ?? 0} inline />
          </button>
        );
      })}
    </nav>
  );
}
