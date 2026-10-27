/**
 * Fluxo direto TOTVS: OCs geradas com destino TOTVS não passam pela aprovação do Conecta.
 * Ficam em "TOTVS - OC's não enviadas" até o envio dar certo e depois em "TOTVS - OC's enviadas".
 * OCs antigas (sem a marca) seguem o fluxo de aprovação de sempre.
 */
export type OcTotvsFluxoDiretoPick = {
  status: string;
  totvsFluxoDireto?: boolean | null;
  totvsIdMov?: number | null;
};

const OC_FORA_DO_FLUXO = new Set(['CANCELLED', 'REJECTED']);

export function isOcFluxoDiretoTotvs(order: OcTotvsFluxoDiretoPick): boolean {
  return !!order.totvsFluxoDireto;
}

export function isOcTotvsNaoEnviada(order: OcTotvsFluxoDiretoPick): boolean {
  return isOcFluxoDiretoTotvs(order) && !order.totvsIdMov && !OC_FORA_DO_FLUXO.has(order.status);
}

export function isOcTotvsEnviada(order: OcTotvsFluxoDiretoPick): boolean {
  return isOcFluxoDiretoTotvs(order) && !!order.totvsIdMov && !OC_FORA_DO_FLUXO.has(order.status);
}
