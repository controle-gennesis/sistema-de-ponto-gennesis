'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Bell,
  CalendarClock,
  CalendarRange,
  Calculator,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  FileCheck,
  FileText,
  Fuel,
  HardHat,
  MessageCircle,
  Package,
  PackageCheck,
  PackageX,
  Shield,
  ShoppingCart,
  Truck,
  Wrench,
  type LucideIcon,
  MessageSquare,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { pathToModuleKey } from '@sistema-ponto/permission-modules';
import { useApprovalNotificationCounts } from '@/hooks/useApprovalNotificationCounts';
import { useFdNotificationCounts } from '@/hooks/useFdNotificationCounts';
import { usePermissions } from '@/hooks/usePermissions';
import { visibleTabRefetchInterval } from '@/hooks/useVisibleTabRefetchInterval';
import { NotificationCountBadge } from '@/components/ui/NotificationCountBadge';

type NotificationItem = {
  id: string;
  title: string;
  description: string;
  count: number;
  href: string;
  Icon: LucideIcon;
};

type NotificationGroup = 'approval' | 'operation' | 'other';

const NOTIFICATION_GROUP_LABEL: Record<NotificationGroup, string> = {
  approval: 'Aprovações',
  operation: 'Compras, estoque e frota',
  other: 'Chamados e mensagens',
};

const NOTIFICATION_GROUP_ORDER: NotificationGroup[] = ['approval', 'operation', 'other'];

const APPROVAL_IDS = new Set(['dp', 'espelho', 'fd', 'fuel', 'rm', 'oc', 'medicao']);
const OPERATION_IDS = new Set([
  'fd-compras',
  'fd-reprovadas',
  'furo-estoque',
  'recebimento',
  'fuel-supplies',
  'vehicle-supplies',
  'entrega-logistica',
]);

function notificationGroupOf(id: string): NotificationGroup {
  if (APPROVAL_IDS.has(id)) return 'approval';
  if (OPERATION_IDS.has(id)) return 'operation';
  return 'other';
}

const NOTIFICATION_GROUP_STYLE: Record<
  NotificationGroup,
  { tile: string; pill: string; dot: string }
> = {
  approval: {
    tile: 'bg-red-50 text-red-600 dark:bg-red-900/25 dark:text-red-300',
    pill: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200 dark:bg-red-900/30 dark:text-red-200 dark:ring-red-800/60',
    dot: 'bg-red-500',
  },
  operation: {
    tile: 'bg-amber-50 text-amber-600 dark:bg-amber-900/25 dark:text-amber-300',
    pill: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200 dark:bg-amber-900/30 dark:text-amber-200 dark:ring-amber-800/60',
    dot: 'bg-amber-500',
  },
  other: {
    tile: 'bg-sky-50 text-sky-600 dark:bg-sky-900/25 dark:text-sky-300',
    pill: 'bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-200 dark:bg-sky-900/30 dark:text-sky-200 dark:ring-sky-800/60',
    dot: 'bg-sky-500',
  },
};

type NotificationsDropdownProps = {
  chatUnreadCount?: number;
};

export function NotificationsDropdown({ chatUnreadCount = 0 }: NotificationsDropdownProps) {
  const {
    isLoading: permissionsLoading,
    isAdministrator,
    can,
    canAccessDpApproverPages,
    canApproveFd,
    canApproveEspelhoNf,
    canApproveFuel,
    canApproveOc,
    canApproveMaterialRequests,
    canApproveEmpreiteiroDaily,
    canAccessRecebimentoEntregasRoutePage,
  } = usePermissions();
  const { counts, isLoading: approvalsLoading } = useApprovalNotificationCounts();
  const { counts: fdNotificationCounts } = useFdNotificationCounts();

  const canSeeFuroEstoque = isAdministrator || can(pathToModuleKey('/ponto/furo-estoque'));
  const canSeeFuelSupplies =
    isAdministrator || can(pathToModuleKey('/ponto/solicitacoes-combustivel'));
  const canSeeVehicleReservationSupplies =
    isAdministrator || can(pathToModuleKey('/ponto/solicitacoes-reserva-veiculos'));
  const canSeeEntregaLogistica =
    isAdministrator || can(pathToModuleKey('/ponto/entrega-logistica'));
  const canSeeFdAprovadas = isAdministrator || can(pathToModuleKey('/ponto/fds-aprovadas'));
  const canSeeAtendimentoContabil =
    isAdministrator ||
    can(pathToModuleKey('/ponto/dp-contabilidade'));

  const canSeeGestaoOs =
    isAdministrator ||
    can(pathToModuleKey('/ponto/sistema-gestao-os')) ||
    can(pathToModuleKey('/ponto/meus-chamados')) ||
    can(pathToModuleKey('/ponto/sistema-gestao-os/planos'));

  const { data: gestaoOsInboxRaw } = useQuery({
    queryKey: ['gestao-os-inbox'],
    queryFn: async () => {
      const res = await api.get('/gestao-os/inbox');
      return (res.data?.data ?? null) as {
        assignedCount: number;
        slaOverdueCount: number;
        slaWarningCount: number;
        overduePlansCount: number;
        warrantyExpiringCount: number;
        warrantyExpiredCount: number;
        unplannedOpenCount?: number;
        sacOpenCount?: number;
      } | null;
    },
    // Só busca a caixa de OS quem tem acesso ao módulo (antes buscava para todo mundo).
    enabled: canSeeGestaoOs && !permissionsLoading,
    refetchInterval: () => visibleTabRefetchInterval(60_000),
    refetchOnWindowFocus: true,
    staleTime: 20_000,
  });
  // A chave do cache não é por usuário: sem acesso, ignora qualquer dado que sobrou de outro login.
  const gestaoOsInbox = canSeeGestaoOs ? gestaoOsInboxRaw : null;

  const { data: atendimentoContabilPendingCount = 0 } = useQuery({
    queryKey: ['dp-contabilidade-pending-count'],
    queryFn: async () => {
      const res = await api.get('/dp-contabilidade/pending-count');
      const n = Number(res.data?.data?.count ?? res.data?.count);
      return Number.isFinite(n) && n > 0 ? n : 0;
    },
    enabled: canSeeAtendimentoContabil && !permissionsLoading,
    refetchInterval: () => visibleTabRefetchInterval(60_000),
    refetchOnWindowFocus: true,
    staleTime: 20_000,
  });

  // Mensagens novas nas conversas das solicitações (DP, Administração e Contabilidade).
  const { data: dpMessagesUnread } = useQuery({
    queryKey: ['dp-request-unread-messages'],
    queryFn: async () => {
      const res = await api.get('/solicitacoes-dp/mensagens/nao-lidas');
      return (res.data?.data ?? { count: 0, items: [] }) as {
        count: number;
        items: Array<{ requestId: string; displayNumber: number; title: string; unread: number; area: 'dp' | 'adm' | 'contabilidade' }>;
      };
    },
    enabled: !permissionsLoading,
    refetchInterval: () => visibleTabRefetchInterval(60_000),
    refetchOnWindowFocus: true,
    staleTime: 20_000,
  });
  // Solicitações do próprio usuário devolvidas para correção (status "Sua pendência"/"Correção").
  const canSeeMyDpRequests = isAdministrator || can(pathToModuleKey('/ponto/solicitacoes-dp'));
  const { data: dpReturnPendingCount = 0 } = useQuery({
    queryKey: ['dp-requester-return-count'],
    queryFn: async () => {
      const res = await api.get('/solicitacoes-dp/minhas/pendencias-count');
      const n = Number(res.data?.data?.count ?? 0);
      return Number.isFinite(n) && n > 0 ? n : 0;
    },
    enabled: canSeeMyDpRequests && !permissionsLoading,
    refetchInterval: () => visibleTabRefetchInterval(60_000),
    refetchOnWindowFocus: true,
    staleTime: 20_000,
  });

  const { data: pendingFuroCount = 0 } = useQuery({
    queryKey: ['stock-shortfalls-pending-count'],
    queryFn: async () => {
      const res = await api.get('/stock/shortfalls/pending-count');
      const n = Number(res.data?.count ?? res.data?.data?.count);
      return Number.isFinite(n) && n > 0 ? n : 0;
    },
    enabled: canSeeFuroEstoque && !permissionsLoading,
    refetchInterval: () => visibleTabRefetchInterval(60_000),
    refetchOnWindowFocus: true,
    staleTime: 20_000,
  });

  const { data: recebimentoPendingCount = 0 } = useQuery({
    queryKey: ['material-deliveries-recebimento-pending-count'],
    queryFn: async () => {
      const res = await api.get('/material-deliveries/summary', {
        params: { forRecebimento: 'true' },
      });
      const n = Number(res.data?.data?.awaitingEngineering ?? 0);
      return Number.isFinite(n) && n > 0 ? n : 0;
    },
    enabled: canAccessRecebimentoEntregasRoutePage && !permissionsLoading,
    refetchInterval: () => visibleTabRefetchInterval(60_000),
    refetchOnWindowFocus: true,
    staleTime: 20_000,
  });

  const { data: fuelSuppliesPendingCount = 0 } = useQuery({
    queryKey: ['fuel-supplies-pending-count'],
    queryFn: async () => {
      const res = await api.get('/fuel-refuel-requests/supplies-pending-count');
      const n = Number(res.data?.data?.count ?? res.data?.count);
      return Number.isFinite(n) && n > 0 ? n : 0;
    },
    enabled: canSeeFuelSupplies && !permissionsLoading,
    refetchInterval: () => visibleTabRefetchInterval(60_000),
    refetchOnWindowFocus: true,
    staleTime: 20_000,
  });

  const { data: vehicleReservationSuppliesPendingCount = 0 } = useQuery({
    queryKey: ['vehicle-reservation-supplies-pending-count'],
    queryFn: async () => {
      const res = await api.get('/vehicle-reservations/supplies-pending-count');
      const n = Number(res.data?.data?.count ?? res.data?.count);
      return Number.isFinite(n) && n > 0 ? n : 0;
    },
    enabled: canSeeVehicleReservationSupplies && !permissionsLoading,
    refetchInterval: () => visibleTabRefetchInterval(60_000),
    refetchOnWindowFocus: true,
    staleTime: 20_000,
  });

  const { data: entregaLogisticaPendingCount = 0 } = useQuery({
    queryKey: ['logistics-delivery-pending-count'],
    queryFn: async () => {
      const res = await api.get('/logistics-delivery-requests/pending-count');
      const n = Number(res.data?.data?.count ?? res.data?.count);
      return Number.isFinite(n) && n > 0 ? n : 0;
    },
    enabled: canSeeEntregaLogistica && !permissionsLoading,
    refetchInterval: () => visibleTabRefetchInterval(60_000),
    refetchOnWindowFocus: true,
    staleTime: 20_000,
  });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  const items = useMemo((): NotificationItem[] => {
    const list: NotificationItem[] = [];

    if (canAccessDpApproverPages && counts.dp > 0) {
      list.push({
        id: 'dp',
        title: 'Solicitações',
        description: 'Pendentes de aprovação do DP',
        count: counts.dp,
        href: '/ponto/aprovacoes?tab=dp',
        Icon: ClipboardList,
      });
    }
    if (canApproveEspelhoNf && counts.espelho > 0) {
      list.push({
        id: 'espelho',
        title: 'Espelhos da NF',
        description: 'Aguardando aprovação',
        count: counts.espelho,
        href: '/ponto/aprovacoes?tab=espelho',
        Icon: FileText,
      });
    }
    if (canApproveFd && counts.fd > 0) {
      list.push({
        id: 'fd',
        title: 'Fichas de Demanda',
        description: 'Pendentes de decisão',
        count: counts.fd,
        href: '/ponto/aprovacoes?tab=fd',
        Icon: FileCheck,
      });
    }
    if (canApproveFuel && counts.fuel > 0) {
      list.push({
        id: 'fuel',
        title: 'Combustível',
        description: 'Solicitações pendentes',
        count: counts.fuel,
        href: '/ponto/aprovacoes?tab=fuel',
        Icon: Fuel,
      });
    }
    if (canApproveMaterialRequests && counts.rm > 0) {
      list.push({
        id: 'rm',
        title: 'Requisições de Materiais',
        description: 'Aguardando aprovação',
        count: counts.rm,
        href: '/ponto/aprovacoes?tab=rm',
        Icon: Package,
      });
    }
    if (canApproveOc && counts.oc > 0) {
      list.push({
        id: 'oc',
        title: 'Ordens de Compra',
        description: 'Pendentes de aprovação',
        count: counts.oc,
        href: '/ponto/aprovacoes?tab=oc',
        Icon: ShoppingCart,
      });
    }
    if (canApproveEmpreiteiroDaily && counts.medicao > 0) {
      list.push({
        id: 'medicao',
        title: 'Medições de entrega',
        description: 'Aguardando aprovação',
        count: counts.medicao,
        href: '/ponto/aprovacoes?tab=medicao',
        Icon: HardHat,
      });
    }
    if (canApproveEmpreiteiroDaily && counts.aditivo > 0) {
      list.push({
        id: 'aditivo',
        title: 'Aditivos',
        description: 'Aguardando aprovação',
        count: counts.aditivo,
        href: '/ponto/aprovacoes?tab=aditivo',
        Icon: FileCheck,
      });
    }
    if (canSeeFdAprovadas && fdNotificationCounts.pendingPurchase > 0) {
      list.push({
        id: 'fd-compras',
        title: 'Fichas de Demanda',
        description: 'Pendentes em compras',
        count: fdNotificationCounts.pendingPurchase,
        href: '/ponto/fds-aprovadas',
        Icon: FileCheck,
      });
    }
    if (fdNotificationCounts.rejectedOwn > 0) {
      list.push({
        id: 'fd-reprovadas',
        title: 'Fichas de Demanda',
        description: 'Reprovadas — edite e reenvie',
        count: fdNotificationCounts.rejectedOwn,
        href: '/ponto/aprovacao-fds',
        Icon: ClipboardCheck,
      });
    }
    if (canSeeFuroEstoque && pendingFuroCount > 0) {
      list.push({
        id: 'furo-estoque',
        title: 'Furo de Estoque',
        description: 'Pendências de entrega',
        count: pendingFuroCount,
        href: '/ponto/furo-estoque',
        Icon: PackageX,
      });
    }
    if (canAccessRecebimentoEntregasRoutePage && recebimentoPendingCount > 0) {
      list.push({
        id: 'recebimento',
        title: 'Recebimento de Entregas',
        description: 'Aguardando confirmação',
        count: recebimentoPendingCount,
        href: '/ponto/recebimento-entregas',
        Icon: PackageCheck,
      });
    }
    if (canSeeFuelSupplies && fuelSuppliesPendingCount > 0) {
      list.push({
        id: 'fuel-supplies',
        title: 'Fila de Abastecimento',
        description: 'Abastecimentos pendentes',
        count: fuelSuppliesPendingCount,
        href: '/ponto/solicitacoes-combustivel',
        Icon: Fuel,
      });
    }
    if (canSeeVehicleReservationSupplies && vehicleReservationSuppliesPendingCount > 0) {
      list.push({
        id: 'vehicle-supplies',
        title: 'Gestão da Frota',
        description: 'Solicitações pendentes',
        count: vehicleReservationSuppliesPendingCount,
        href: '/ponto/solicitacoes-reserva-veiculos',
        Icon: CalendarRange,
      });
    }
    if (canSeeEntregaLogistica && entregaLogisticaPendingCount > 0) {
      list.push({
        id: 'entrega-logistica',
        title: 'Entrega da Logística',
        description: 'Pendentes de finalização',
        count: entregaLogisticaPendingCount,
        href: '/ponto/entrega-logistica',
        Icon: Truck,
      });
    }
    if (dpMessagesUnread && dpMessagesUnread.count > 0) {
      const first = dpMessagesUnread.items[0];
      const areaHref = (a: 'dp' | 'adm' | 'contabilidade') =>
        a === 'adm' ? '/ponto/gerenciar-solicitacoes-adm-tst' : a === 'dp' ? '/ponto/gerenciar-solicitacoes-gerais' : '/ponto/dp-contabilidade';
      list.push({
        id: 'dp-mensagens',
        title: 'Mensagens nas solicitações',
        description:
          dpMessagesUnread.items.length === 1 && first
            ? `Solicitação nº ${first.displayNumber}`
            : `${dpMessagesUnread.items.length} solicitações com mensagem nova`,
        count: dpMessagesUnread.count,
        href: first ? areaHref(first.area) : '/ponto/gerenciar-solicitacoes-gerais',
        Icon: MessageSquare,
      });
    }
    if (canSeeAtendimentoContabil && atendimentoContabilPendingCount > 0) {
      list.push({
        id: 'atendimento-contabil',
        title: 'Atendimento Contábil',
        description: 'Pedidos aguardando atendimento',
        count: atendimentoContabilPendingCount,
        href: '/ponto/dp-contabilidade',
        Icon: Calculator,
      });
    }
    if (canSeeMyDpRequests && dpReturnPendingCount > 0) {
      list.push({
        id: 'dp-correcao',
        title: 'Minhas solicitações',
        description: 'Precisam de correção — responda',
        count: dpReturnPendingCount,
        href: '/ponto/solicitacoes-dp',
        Icon: ClipboardCheck,
      });
    }
    if (chatUnreadCount > 0) {
      list.push({
        id: 'chat',
        title: 'Conversas',
        description: 'Mensagens não lidas',
        count: chatUnreadCount,
        href: '/ponto/conversas',
        Icon: MessageCircle,
      });
    }

    const assignedCount = gestaoOsInbox?.assignedCount ?? 0;
    const slaOverdueCount = gestaoOsInbox?.slaOverdueCount ?? 0;
    const slaWarningCount = gestaoOsInbox?.slaWarningCount ?? 0;
    const overduePlansCount = gestaoOsInbox?.overduePlansCount ?? 0;
    const warrantyCount =
      (gestaoOsInbox?.warrantyExpiredCount ?? 0) + (gestaoOsInbox?.warrantyExpiringCount ?? 0);
    const unplannedOpenCount = gestaoOsInbox?.unplannedOpenCount ?? 0;
    const sacOpenCount = gestaoOsInbox?.sacOpenCount ?? 0;
    const osHomeHref = canSeeGestaoOs
      ? '/ponto/sistema-gestao-os'
      : '/ponto/meus-chamados';
    if (assignedCount > 0) {
      list.push({
        id: 'gestao-os-assigned',
        title: 'OS atribuídas',
        description: 'Chamados sob sua responsabilidade',
        count: assignedCount,
        href: osHomeHref,
        Icon: Wrench,
      });
    }
    if (slaOverdueCount > 0) {
      list.push({
        id: 'gestao-os-sla-overdue',
        title: 'SLA atrasado',
        description: 'OS fora do prazo',
        count: slaOverdueCount,
        href: canSeeGestaoOs ? '/ponto/sistema-gestao-os?overdue=1' : '/ponto/meus-chamados',
        Icon: Wrench,
      });
    }
    if (slaWarningCount > 0) {
      list.push({
        id: 'gestao-os-sla-warning',
        title: 'SLA no fim do prazo',
        description: 'OS próximas do estouro',
        count: slaWarningCount,
        href: osHomeHref,
        Icon: Wrench,
      });
    }
    if (overduePlansCount > 0) {
      list.push({
        id: 'gestao-os-plans',
        title: 'Planos vencidos',
        description: 'Preventivas / PMOC em atraso',
        count: overduePlansCount,
        href: '/ponto/sistema-gestao-os/planos',
        Icon: CalendarClock,
      });
    }
    if (unplannedOpenCount > 0) {
      list.push({
        id: 'gestao-os-unplanned',
        title: 'Ocorrência não planejada',
        description: 'Registros abertos no campo',
        count: unplannedOpenCount,
        href: canSeeGestaoOs ? '/ponto/sistema-gestao-os' : '/ponto/meus-chamados',
        Icon: AlertTriangle,
      });
    }
    if (sacOpenCount > 0) {
      list.push({
        id: 'gestao-os-sac',
        title: 'SAC da localidade',
        description: 'Chamados, dúvidas e reclamações',
        count: sacOpenCount,
        href: '/ponto/meus-chamados',
        Icon: Wrench,
      });
    }
    if (warrantyCount > 0) {
      list.push({
        id: 'gestao-os-warranty',
        title: 'Garantia de ativos',
        description: 'Vencidas ou a vencer em 30 dias',
        count: warrantyCount,
        href: '/ponto/sistema-gestao-os/locais',
        Icon: Shield,
      });
    }

    return list;
  }, [
    canAccessDpApproverPages,
    canApproveFd,
    canApproveEspelhoNf,
    canApproveFuel,
    canApproveOc,
    canApproveMaterialRequests,
    canApproveEmpreiteiroDaily,
    canSeeFdAprovadas,
    canSeeFuroEstoque,
    canAccessRecebimentoEntregasRoutePage,
    canSeeFuelSupplies,
    canSeeVehicleReservationSupplies,
    canSeeEntregaLogistica,
    counts,
    fdNotificationCounts.pendingPurchase,
    fdNotificationCounts.rejectedOwn,
    pendingFuroCount,
    recebimentoPendingCount,
    fuelSuppliesPendingCount,
    vehicleReservationSuppliesPendingCount,
    entregaLogisticaPendingCount,
    canSeeAtendimentoContabil,
    atendimentoContabilPendingCount,
    canSeeMyDpRequests,
    dpReturnPendingCount,
    dpMessagesUnread,
    chatUnreadCount,
    gestaoOsInbox,
  ]);

  const badgeTotal = useMemo(
    () => items.reduce((sum, item) => sum + item.count, 0),
    [items],
  );

  const groupedItems = useMemo(
    () =>
      NOTIFICATION_GROUP_ORDER.map((group) => ({
        group,
        label: NOTIFICATION_GROUP_LABEL[group],
        items: items.filter((item) => notificationGroupOf(item.id) === group),
      }))
        .filter((entry) => entry.items.length > 0)
        .map((entry) => ({
          ...entry,
          total: entry.items.reduce((sum, item) => sum + item.count, 0),
        })),
    [items],
  );

  const updatePos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({
      top: Math.round(rect.bottom + 8),
      right: Math.round(window.innerWidth - rect.right),
    });
  }, []);

  useEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    updatePos();
    const handleClickOutside = (event: MouseEvent) => {
      const t = event.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      setOpen(false);
    };
    const handleReposition = () => updatePos();
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [open, updatePos]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Notificações${badgeTotal > 0 ? `, ${badgeTotal} pendentes` : ''}`}
        title="Notificações"
        onClick={() => setOpen((v) => !v)}
        className="notif-bell-btn relative flex size-10 shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200/80 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
      >
        <Bell className="notif-bell-btn__icon h-5 w-5" />
        <NotificationCountBadge count={badgeTotal} rail />
      </button>

      {open &&
        pos &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            <div
              className="fixed inset-0 z-[9998]"
              aria-hidden="true"
              onClick={() => setOpen(false)}
            />
            <div
              ref={panelRef}
              role="dialog"
              aria-label="Notificações"
              data-app-topnav
              style={{
                position: 'fixed',
                top: pos.top,
                right: pos.right,
                zIndex: 9999,
              }}
              className="app-popover-panel w-[min(24rem,calc(100vw-1.5rem))]"
            >
              {/* Setinha saindo do botão do sino (centro do botão = 20px da borda direita) */}
              <span
                aria-hidden="true"
                className="absolute -top-1.5 right-[14px] z-10 h-3 w-3 rotate-45 rounded-tl-sm border-l border-t border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
              />
              <div className="flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl ring-1 ring-black/5 dark:border-gray-700 dark:bg-gray-900">
                <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-4">
                  <div className="min-w-0">
                    <p className="text-base font-semibold tracking-tight text-gray-900 dark:text-gray-100">
                      Notificações
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                      {badgeTotal > 0
                        ? `${badgeTotal} pendência${badgeTotal === 1 ? '' : 's'} aguardando você`
                        : 'Você não tem pendências'}
                    </p>
                  </div>
                  {badgeTotal > 0 ? (
                    <span className="inline-flex h-7 min-w-[1.75rem] shrink-0 items-center justify-center rounded-full bg-gray-900 px-2.5 text-xs font-semibold text-white dark:bg-gray-100 dark:text-gray-900">
                      {badgeTotal > 99 ? '99+' : badgeTotal}
                    </span>
                  ) : null}
                </div>

                <div className="max-h-[min(28rem,70vh)] overflow-y-auto overscroll-contain border-t border-gray-100 dark:border-gray-800">
                  {approvalsLoading && items.length === 0 ? (
                    <div className="space-y-2 p-3">
                      {Array.from({ length: 4 }, (_, i) => (
                        <div
                          key={i}
                          className="h-14 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800"
                        />
                      ))}
                    </div>
                  ) : items.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
                      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-500 dark:bg-emerald-900/20 dark:text-emerald-400">
                        <ClipboardCheck className="h-6 w-6" />
                      </span>
                      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Tudo em dia</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Quando houver pendências, elas aparecem aqui.
                      </p>
                    </div>
                  ) : (
                    <div className="pb-2">
                      {groupedItems.map((entry) => {
                        const style = NOTIFICATION_GROUP_STYLE[entry.group];
                        return (
                          <section key={entry.group}>
                            <div className="flex items-center justify-between px-5 pb-1.5 pt-4">
                              <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
                                {entry.label}
                              </h3>
                              <span className="text-[11px] font-medium tabular-nums text-gray-400 dark:text-gray-500">
                                {entry.total > 99 ? '99+' : entry.total}
                              </span>
                            </div>
                            <ul className="px-2">
                              {entry.items.map((item) => {
                                const Icon = item.Icon;
                                return (
                                  <li key={item.id}>
                                    <Link
                                      href={item.href}
                                      onClick={() => setOpen(false)}
                                      className="group flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-gray-50 dark:hover:bg-gray-800"
                                    >
                                      <span
                                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${style.tile}`}
                                      >
                                        <Icon className="h-[18px] w-[18px]" />
                                      </span>
                                      <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-semibold text-gray-900 dark:text-gray-100">
                                          {item.title}
                                        </span>
                                        <span className="mt-0.5 block truncate text-xs text-gray-500 dark:text-gray-400">
                                          {item.description}
                                        </span>
                                      </span>
                                      <span
                                        className={`inline-flex h-6 min-w-[1.75rem] shrink-0 items-center justify-center rounded-full px-2 text-xs font-semibold tabular-nums ${style.pill}`}
                                      >
                                        {item.count > 99 ? '99+' : item.count}
                                      </span>
                                      <ChevronRight className="-mr-1 h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-gray-500 dark:text-gray-600 dark:group-hover:text-gray-300" />
                                    </Link>
                                  </li>
                                );
                              })}
                            </ul>
                          </section>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
