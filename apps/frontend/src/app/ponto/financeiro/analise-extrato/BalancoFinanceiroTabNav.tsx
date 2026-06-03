'use client';

export type BalancoFinanceiroTabId = 'extrato' | 'demonstrativo';

const TABS: ReadonlyArray<{ id: BalancoFinanceiroTabId; label: string }> = [
  { id: 'extrato', label: 'Extrato de Caixa' },
  { id: 'demonstrativo', label: 'Demonstrativo Financeiro' }
];

export function BalancoFinanceiroTabNav({
  activeTab,
  onTabChange
}: {
  activeTab: BalancoFinanceiroTabId;
  onTabChange: (tab: BalancoFinanceiroTabId) => void;
}) {
  return (
    <nav
      className="flex flex-wrap justify-center gap-1 border-b border-gray-200 dark:border-gray-700"
      aria-label="Abas do balanço financeiro"
    >
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange(tab.id)}
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
