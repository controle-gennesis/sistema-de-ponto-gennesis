'use client';

import { TabCountBadge } from '@/components/ui/TabCountBadge';
import type { OcTab } from './OcPurchaseOrdersPanel';

export type OcTabCounts = {
  compras: number;
  gestor: number;
  diretoria: number;
  IN_REVIEW: number;
  APPROVED: number;
  ATTACH_BOLETO: number;
  PROOF_VALIDATION: number;
  PROOF_CORRECTION: number;
  ATTACH_NF: number;
  outras: number;
};

export const OC_FLUX_DEFAULT_TAB: OcTab = 'compras';

const OC_FLUX_TABS: ReadonlyArray<{
  id: OcTab;
  label: string;
  countKey: keyof OcTabCounts | 'FINALIZADAS';
}> = [
  { id: 'compras', label: 'Aprovação Compras', countKey: 'compras' },
  { id: 'gestor', label: 'Aprovação Gestor', countKey: 'gestor' },
  { id: 'diretoria', label: 'Aprovação Diretoria', countKey: 'diretoria' },
  { id: 'ATTACH_BOLETO', label: 'Anexar Boleto', countKey: 'ATTACH_BOLETO' },
  { id: 'APPROVED', label: 'Pagamento', countKey: 'APPROVED' },
  { id: 'PROOF_VALIDATION', label: 'Validação Comprovante', countKey: 'PROOF_VALIDATION' },
  { id: 'PROOF_CORRECTION', label: 'Correção Comprovante', countKey: 'PROOF_CORRECTION' },
  { id: 'ATTACH_NF', label: 'Anexar NF', countKey: 'ATTACH_NF' },
  { id: 'FINALIZADAS', label: 'Finalizadas', countKey: 'FINALIZADAS' },
  { id: 'IN_REVIEW', label: 'Correção', countKey: 'IN_REVIEW' },
  { id: 'outras', label: 'Canceladas', countKey: 'outras' }
];

export function OcFluxTabsNav({
  activeTab,
  onActiveTab,
  tabCounts,
  finalizedTotal
}: {
  activeTab: OcTab;
  onActiveTab: (tab: OcTab) => void;
  tabCounts: OcTabCounts;
  finalizedTotal: number;
}) {
  const countFor = (key: keyof OcTabCounts | 'FINALIZADAS') =>
    key === 'FINALIZADAS' ? finalizedTotal : tabCounts[key];

  return (
    <div id="secao-fluxo-oc-tabs" className="scroll-mt-4">
      <div className="px-2 bg-transparent">
        <nav className="-mb-px flex flex-wrap justify-center gap-x-1 gap-y-2 overflow-x-auto py-3 sm:gap-x-2">
          {OC_FLUX_TABS.map((tab) => (
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
              <TabCountBadge count={countFor(tab.countKey)} active={activeTab === tab.id} tone="red" />
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
