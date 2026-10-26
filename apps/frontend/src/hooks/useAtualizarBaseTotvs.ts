'use client';

import { useCallback, useEffect, useState } from 'react';

/** Mesmo intervalo do servidor (`totvsManualSyncCooldown.ts`): 10 minutos entre atualizações manuais. */
const INTERVALO_MS = 10 * 60 * 1000;

export type BaseTotvs = 'fornecedores' | 'materiais' | 'condicoes-pagamento' | 'locais-estoque';

const chave = (base: BaseTotvs) => `totvs-atualizar-base:${base}`;

function lerLiberaEm(base: BaseTotvs): number {
  try {
    const v = Number(window.localStorage.getItem(chave(base)));
    return Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}

/**
 * Trava do botão "Atualizar base": depois de um clique, só libera de novo em 10 minutos.
 * O servidor também bloqueia (vale para todos os usuários); aqui o botão já mostra quanto falta.
 */
export function useAtualizarBaseTotvs(base: BaseTotvs) {
  const [liberaEm, setLiberaEm] = useState(0);
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    setLiberaEm(lerLiberaEm(base));
  }, [base]);

  useEffect(() => {
    if (liberaEm <= Date.now()) return;
    const t = window.setInterval(() => setAgora(Date.now()), 15_000);
    return () => window.clearInterval(t);
  }, [liberaEm]);

  /** Trava até o horário informado pelo servidor (ISO) ou, sem ele, por 10 minutos a partir de agora. */
  const bloquear = useCallback(
    (liberaEmIso?: string | null) => {
      const alvo = liberaEmIso ? new Date(liberaEmIso).getTime() : NaN;
      const ate = Number.isFinite(alvo) ? alvo : Date.now() + INTERVALO_MS;
      setLiberaEm(ate);
      setAgora(Date.now());
      try {
        window.localStorage.setItem(chave(base), String(ate));
      } catch {
        /* sem storage: a trava do servidor continua valendo */
      }
    },
    [base]
  );

  const bloqueado = liberaEm > agora;
  const minutosRestantes = bloqueado ? Math.max(1, Math.ceil((liberaEm - agora) / 60_000)) : 0;
  const rotulo = bloqueado ? `Atualizar base (${minutosRestantes} min)` : 'Atualizar base';
  const dica = bloqueado
    ? `Base atualizada há pouco. Disponível de novo em ${minutosRestantes} min.`
    : 'Busca agora no TOTVS (a base também é atualizada sozinha de madrugada e às 12:30)';

  return { bloqueado, minutosRestantes, rotulo, dica, bloquear };
}

/** Lê do erro da API o horário de liberação (429) — para travar o botão mesmo se outro usuário atualizou. */
export function liberaEmDoErro(error: unknown): { bloqueio: boolean; liberaEm: string | null; mensagem: string | null } {
  const resp = (error as { response?: { status?: number; data?: { liberaEm?: string; message?: string } } })?.response;
  if (resp?.status === 429) {
    return { bloqueio: true, liberaEm: resp.data?.liberaEm ?? null, mensagem: resp.data?.message ?? null };
  }
  return { bloqueio: false, liberaEm: null, mensagem: null };
}
