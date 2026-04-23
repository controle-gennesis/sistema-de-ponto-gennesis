'use client';

export const dynamic = 'force-dynamic';

import { FluigSolicitacoesPage } from '@/app/ponto/bi/FluigSolicitacoesPage';

export default function GestaoSolicitacoesPage() {
  return (
    <FluigSolicitacoesPage
      config={{
        title: 'Gestão de Solicitações',
        subtitle: 'Acompanhe em tempo real as solicitações do Fluig na visão de suprimentos',
        datasets: ['DataSet_G3FollowUp', 'DataSet_G4FollowUp', 'G5-Relatorio-DF'],
        datasetTabLabels: {
          DataSet_G3FollowUp: 'G3',
          DataSet_G4FollowUp: 'G4',
          'G5-Relatorio-DF': 'G5',
        },
        g5TitleDatasets: ['G5-Relatorio-DF'],
        allowedFiliais: null,
        excludedFiliais: ['FILIAL PB'],
        hideFilialFilter: true,
        showProcessCard: true,
        fixedRecordsPerPage: 50,
        hideRecordsPerPageSelector: true,
        useEmployeeListLayout: true,
        leadTimeColumn: 'Início Data',
      }}
    />
  );
}
