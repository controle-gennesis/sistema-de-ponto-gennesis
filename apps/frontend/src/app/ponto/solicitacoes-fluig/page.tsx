'use client';

import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { FluigSolicitacoesPage } from '@/components/fluig/FluigSolicitacoesPage';

export default function SolicitacoesFluigDpPage() {
  return (
    <ProtectedRoute route="/ponto/solicitacoes-fluig">
      <FluigSolicitacoesPage
        config={{
          title: 'Solicitações - Fluig',
          subtitle: 'Solicitações do Departamento Pessoal no Fluig',
          datasets: ['G5-Relatorio-DF-GO-DP'],
          datasetTabLabels: {
            'G5-Relatorio-DF-GO-DP': 'DP',
          },
          g5TitleDatasets: ['G5-Relatorio-DF-GO-DP'],
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
