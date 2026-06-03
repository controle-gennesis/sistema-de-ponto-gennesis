import api from '@/lib/api';
import type { CronogramaComposicaoRef } from './orcamentoCronogramaTypes';

export type GerarSubServicosPayload = {
  servicoId: string;
  servicoNome: string;
  dataInicioObra?: string;
  dataFimObra?: string;
  composicoes: CronogramaComposicaoRef[];
};

export type SubServicoGeradoApi = {
  nome: string;
  composicaoChave?: string;
  observacao?: string;
};

export async function gerarSubServicosCronograma(
  centroCustoId: string,
  orcamentoId: string,
  payload: GerarSubServicosPayload
): Promise<{ subServicos: SubServicoGeradoApi[]; origem: 'ia' | 'heuristica' }> {
  const res = await api.post(
    `/orcamento/${centroCustoId}/orcamentos/${orcamentoId}/cronograma/gerar-sub-servicos`,
    {
      servicoId: payload.servicoId,
      servicoNome: payload.servicoNome,
      dataInicioObra: payload.dataInicioObra,
      dataFimObra: payload.dataFimObra,
      composicoes: payload.composicoes.map((c) => ({
        chave: c.chave,
        codigo: c.codigo,
        descricao: c.descricao,
        subtitulo: c.subtituloNome,
        unidade: c.unidade,
        quantidade: c.quantidade
      }))
    }
  );
  return res.data;
}
