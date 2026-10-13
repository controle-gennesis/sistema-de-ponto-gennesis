'use client';

import React from 'react';
import { CronogramaCurvaSPanel } from './orcamentoCronogramaCurvaS';
import type { CronogramaLinhaServico, CronogramaPersist } from './orcamentoCronogramaTypes';

type Props = {
  linhas: CronogramaLinhaServico[];
  cronograma: CronogramaPersist;
  dataInicioObra?: string;
  dataFimObra?: string;
  hoje?: Date;
};

export function CronogramaGraficosPainel({
  linhas,
  cronograma,
  dataInicioObra,
  dataFimObra,
  hoje = new Date()
}: Props) {
  return (
    <div className="p-4">
      <CronogramaCurvaSPanel
        linhas={linhas}
        cronograma={cronograma}
        dataInicioObra={dataInicioObra}
        dataFimObra={dataFimObra}
        hoje={hoje}
        inModal
      />
    </div>
  );
}
