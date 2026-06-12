'use client';

import type { ControleNfsTab } from './controleNfsTypes';

export function ControleNfsTabNav({
  tabs,
  activeTab,
  onTabChange
}: {
  tabs: ControleNfsTab[];
  activeTab: string;
  onTabChange: (tabKey: string) => void;
}) {
  return (
    <nav
      className="-mx-1 flex gap-1 overflow-x-auto border-b border-gray-200 px-1 pb-px dark:border-gray-700"
      aria-label="Abas do controle de notas fiscais"
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange(tab.key)}
            className={`whitespace-nowrap rounded-t-lg border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              isActive
                ? 'border-red-600 text-red-700 dark:border-red-500 dark:text-red-400'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
            }`}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
