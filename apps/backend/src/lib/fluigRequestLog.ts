import { AsyncLocalStorage } from 'async_hooks';
import { prisma } from './prisma';
import { ensureFluigRequestLogTable } from './ensureFluigDatasetMirrorSchema';

/** De onde partiu a chamada ao Fluig. */
export type OrigemChamadaFluig =
  | 'espelho_diario' // rotina automática (madrugada e 12:30) que sincroniza o espelho dos datasets
  | 'atualizacao_manual' // botão de atualizar o espelho de um dataset
  | 'aquecimento_automatico' // pré-carga/refresh automático do cache ao subir o servidor
  | 'abrir_solicitacao' // consulta de anexos ao abrir uma solicitação
  | 'download_anexo' // baixar o arquivo de um anexo
  | 'ver_anexo' // visualizar o anexo na tela (sem baixar)
  | 'consulta_usuario' // outras consultas feitas pelas telas
  | 'outra';

export type TipoChamadaFluig =
  | 'dataset'
  | 'busca'
  | 'estrutura'
  | 'lista_datasets'
  | 'documento_url'
  | 'download_arquivo'
  | 'outro';

type ContextoFluig = { origem: OrigemChamadaFluig; detalhe?: string; userId?: string };

const armazenamento = new AsyncLocalStorage<ContextoFluig>();

/** Tudo que o `fn` chamar (inclusive assíncrono) será registrado com esta origem. */
export function comOrigemFluig<T>(contexto: ContextoFluig, fn: () => T): T {
  return armazenamento.run(contexto, fn);
}

export function contextoFluigAtual(): ContextoFluig {
  return armazenamento.getStore() ?? { origem: 'outra' };
}

let tabelaPronta: Promise<void> | null = null;

function caminhoSemQuery(url: string): string {
  try {
    return new URL(url).pathname.slice(0, 300);
  } catch {
    return url.split('?')[0]!.slice(0, 300);
  }
}

/**
 * Registra uma chamada HTTP feita ao Fluig. Nunca lança erro nem atrasa a chamada original;
 * não grava chaves, tokens nem corpo da requisição.
 */
export function registrarChamadaFluig(dados: {
  tipo: TipoChamadaFluig;
  metodo: string;
  url: string;
  datasetId?: string;
  status?: number | null;
  ok: boolean;
  duracaoMs: number;
  erro?: string;
}): void {
  const ctx = contextoFluigAtual();
  void (async () => {
    try {
      tabelaPronta ??= ensureFluigRequestLogTable(prisma);
      await tabelaPronta;
      await prisma.fluigRequestLog.create({
        data: {
          origem: ctx.origem,
          detalhe: ctx.detalhe?.slice(0, 200) ?? null,
          userId: ctx.userId ?? null,
          tipo: dados.tipo,
          metodo: dados.metodo,
          path: caminhoSemQuery(dados.url),
          datasetId: dados.datasetId?.slice(0, 200) ?? null,
          status: dados.status ?? null,
          ok: dados.ok,
          durationMs: Math.max(0, Math.round(dados.duracaoMs)),
          erro: dados.erro ? dados.erro.slice(0, 300) : null,
        },
      });
    } catch (err) {
      tabelaPronta = null;
      console.warn('[fluig-log] não foi possível registrar a chamada:', (err as Error)?.message);
    }
  })();
}
