'use client';

export const dynamic = 'force-dynamic';

import { FluigSolicitacoesPage } from '@/app/ponto/bi/FluigSolicitacoesPage';

export default function GestaoSolicitacoesFinanceiroPage() {
  return (
    <FluigSolicitacoesPage
      config={{
        title: 'Gestão de Solicitações',
        subtitle: 'Acompanhe em tempo real as solicitações do Fluig na visão financeira',
        datasets: ['G5-Relatorio-DF'],
        datasetTabLabels: {
          'G5-Relatorio-DF': 'G5',
        },
        g5TitleDatasets: ['G5-Relatorio-DF'],
        allowedFiliais: null,
        excludedFiliais: ['FILIAL PB'],
        hideFilialFilter: true,
        showProcessCard: false,
        fixedRecordsPerPage: 50,
        hideRecordsPerPageSelector: true,
        useEmployeeListLayout: true,
        showExportButton: true,
        leadTimeColumn: 'Início Data',
      }}
    />
  );
}
