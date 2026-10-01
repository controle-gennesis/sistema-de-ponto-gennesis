'use client';

import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { FluigSolicitacoesPage } from '@/components/fluig/FluigSolicitacoesPage';

export default function SolicitacoesFluigJuridicoPage() {
  return (
    <ProtectedRoute route="/ponto/juridico/solicitacoes-fluig">
      <FluigSolicitacoesPage
        config={{
          title: 'Solicitações - Fluig',
          subtitle: 'Solicitações do Jurídico no Fluig',
          datasets: ['G5-Relatorio-DF-GO-JURIDICO'],
          datasetTabLabels: {
            'G5-Relatorio-DF-GO-JURIDICO': 'Jurídico',
          },
          g5TitleDatasets: ['G5-Relatorio-DF-GO-JURIDICO'],
          allowedFiliais: null,
          hideFilialFilter: true,
          hideSetorSolicitanteFilter: true,
          showProcessCard: false,
          useEmployeeListLayout: true,
          showExportButton: true,
          leadTimeColumn: 'START_DATE',
          naturezaOrcamentariaColumn: 'natureza',
          responsavelColumn: 'responsavel_solicitacao',
        }}
      />
    </ProtectedRoute>
  );
}
