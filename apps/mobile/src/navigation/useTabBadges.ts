import { useQuery } from '@tanstack/react-query';
import { usePermissions } from '../hooks/usePermissions';
import { useNotifications } from '../notifications/NotificationsContext';
import { approvalsPendingTotal, fetchApprovalNotificationCounts } from '../services/approvals';

export type TabBadgeRoute = 'Home' | 'Combustivel' | 'Reservas' | 'DpRequests' | 'GestaoOs';

/** Valor do `tabBarBadge`: número (pendências) ou espaço (bolinha de "teve atualização"). */
export type TabBadgeValue = string | undefined;

const DOT = ' ';

/**
 * Badges da tab bar.
 * - Número: coisas que esperam ação (Início = aprovações pendentes).
 * - Bolinha vermelha: houve atualização de status nas suas solicitações/chamados/reservas;
 *   some quando a aba é aberta.
 */
export function useTabBadges(): Record<TabBadgeRoute, TabBadgeValue> {
  const { unreadByKind } = useNotifications();
  const {
    canSeeAprovacoes,
    canAccessDpApproverPages,
    canApproveFuel,
    canApproveFd,
    canApproveOc,
    canApproveEmpreiteiroDaily,
  } = usePermissions();

  const hasAnyQueue =
    canAccessDpApproverPages ||
    canApproveFuel ||
    canApproveFd ||
    canApproveOc ||
    canApproveEmpreiteiroDaily;

  // Mesma chave do card de Aprovações da Home: compartilha cache e polling.
  const countsQuery = useQuery({
    queryKey: ['approvals', 'notification-counts'],
    enabled: canSeeAprovacoes && hasAnyQueue,
    queryFn: fetchApprovalNotificationCounts,
    refetchInterval: 60_000,
  });
  const pending = approvalsPendingTotal(countsQuery.data);

  return {
    Home: pending > 0 ? (pending > 99 ? '99+' : String(pending)) : undefined,
    Combustivel: unreadByKind.fuel > 0 ? DOT : undefined,
    Reservas: unreadByKind.reservation > 0 ? DOT : undefined,
    DpRequests: unreadByKind.dp > 0 ? DOT : undefined,
    GestaoOs: unreadByKind.workorder > 0 ? DOT : undefined,
  };
}
