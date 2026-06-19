import type { FluxTab, GerenciarStats } from '../_lib/types';

type OcTabCounts = {
  compras: number;
  gestor: number;
  diretoria: number;
  IN_REVIEW: number;
  APPROVED: number;
  ATTACH_BOLETO: number;
  PROOF_VALIDATION: number;
  PROOF_CORRECTION: number;
  ATTACH_NF: number;
  FINALIZADAS: number;
};

export function FluxTabsNav({
  fluxTab,
  onFluxTab,
  stats,
  ocTabCounts,
  embeddedInCard = false,
  searchActive = false,
  rmSearchCounts,
  ocSearchCounts
}: {
  fluxTab: FluxTab;
  onFluxTab: (t: FluxTab) => void;
  stats: GerenciarStats;
  ocTabCounts: OcTabCounts;
  /** Abas coladas ao card da lista (sem cantos/ espaço extras). */
  embeddedInCard?: boolean;
  /** Quando há busca, exibe quantos itens batem em cada fase. */
  searchActive?: boolean;
  rmSearchCounts?: { pending: number; inReview: number; approved: number; cancelled: number };
  ocSearchCounts?: OcTabCounts;
}) {
  const rmPending = searchActive && rmSearchCounts ? rmSearchCounts.pending : stats.pending;
  const rmInReview = searchActive && rmSearchCounts ? rmSearchCounts.inReview : stats.inReview;
  const rmApproved = searchActive && rmSearchCounts ? rmSearchCounts.approved : stats.approved;
  const rmCancelled = searchActive && rmSearchCounts ? rmSearchCounts.cancelled : stats.cancelled;
  const ocCounts = searchActive && ocSearchCounts ? ocSearchCounts : ocTabCounts;
  return (
    <div id="secao-fluxo-tabs" className={embeddedInCard ? '' : 'scroll-mt-4'}>
      {!embeddedInCard && (
        <p className="text-center text-sm font-medium text-gray-800 dark:text-gray-200 mb-3">
          Requisições de materiais e fases de OC
        </p>
      )}
      <div className="px-2 bg-transparent">
        <nav className="-mb-px flex flex-wrap justify-center gap-x-1 gap-y-2 sm:gap-x-2 overflow-x-auto py-3">
          {(
            [
              { id: 'rm_PENDING' as const, label: 'Pendentes', count: rmPending },
              { id: 'rm_IN_REVIEW' as const, label: 'Correção RM', count: rmInReview },
              { id: 'rm_APPROVED' as const, label: 'RMs Aprovadas', count: rmApproved }
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onFluxTab(tab.id)}
              className={`flex items-center gap-2 py-2 px-2 sm:px-3 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap rounded-t-lg transition-colors ${
                fluxTab === tab.id
                  ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {tab.label}
              <span
                className={`px-2 py-0.5 rounded-full text-xs ${
                  fluxTab === tab.id
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
          <span
            className="hidden sm:inline-flex w-px min-h-[2rem] bg-gray-300 dark:bg-gray-600 self-center mx-1 shrink-0"
            aria-hidden
          />
          {(
            [
              { id: 'oc_compras' as const, label: 'Aprovação Compras', count: ocCounts.compras },
              { id: 'oc_gestor' as const, label: 'Aprovação Gestor', count: ocCounts.gestor },
              { id: 'oc_diretoria' as const, label: 'Aprovação Diretoria', count: ocCounts.diretoria },
              { id: 'oc_IN_REVIEW' as const, label: 'Correção', count: ocCounts.IN_REVIEW },
              {
                id: 'oc_ATTACH_BOLETO' as const,
                label: 'Anexar Boleto',
                count: ocCounts.ATTACH_BOLETO
              },
              { id: 'oc_APPROVED' as const, label: 'Pagamento', count: ocCounts.APPROVED },
              {
                id: 'oc_PROOF_VALIDATION' as const,
                label: 'Validação Comprovante',
                count: ocCounts.PROOF_VALIDATION
              },
              {
                id: 'oc_PROOF_CORRECTION' as const,
                label: 'Correção Comprovante',
                count: ocCounts.PROOF_CORRECTION
              },
              { id: 'oc_ATTACH_NF' as const, label: 'Anexar NF', count: ocCounts.ATTACH_NF },
              {
                id: 'oc_FINALIZADAS' as const,
                label: 'Finalizadas',
                count: ocCounts.FINALIZADAS
              }
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onFluxTab(tab.id)}
              className={`flex items-center gap-2 py-2 px-2 sm:px-3 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap rounded-t-lg transition-colors ${
                fluxTab === tab.id
                  ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              {tab.label}
              <span
                className={`px-2 py-0.5 rounded-full text-xs ${
                  fluxTab === tab.id
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
                }`}
              >
                {tab.count}
              </span>
            </button>
          ))}
          <span
            className="hidden sm:inline-flex w-px min-h-[2rem] bg-gray-300 dark:bg-gray-600 self-center mx-1 shrink-0"
            aria-hidden
          />
          <button
            type="button"
            onClick={() => onFluxTab('rm_CANCELLED')}
            className={`flex items-center gap-2 py-2 px-2 sm:px-3 border-b-2 font-medium text-xs sm:text-sm whitespace-nowrap rounded-t-lg transition-colors ${
              fluxTab === 'rm_CANCELLED'
                ? 'border-blue-500 dark:border-blue-400 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            Canceladas
            <span
              className={`px-2 py-0.5 rounded-full text-xs ${
                fluxTab === 'rm_CANCELLED'
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
              }`}
            >
              {rmCancelled}
            </span>
          </button>
        </nav>
      </div>
    </div>
  );
}
