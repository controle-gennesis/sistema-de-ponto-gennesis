import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  Pressable,
  ActivityIndicator,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BadgeCheck,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  Fuel,
  MailPlus,
  Package,
  Ruler,
  ShoppingCart,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { usePermissions } from '../hooks/usePermissions';
import { showAppToast } from './AppToast';
import {
  approveDpRequest,
  approveFdRequest,
  approveFuelRequest,
  approveOcRequest,
  approveRmRequest,
  fetchApprovalNotificationCounts,
  nextOcApproveStatus,
  rejectDpRequest,
  rejectFdRequest,
  rejectFuelRequest,
  rejectOcRequest,
  rejectRmRequest,
  returnMedicao,
  type MedicaoApprovalRow,
  type OcApprovalRow,
} from '../services/approvals';
import {
  approvalApiId,
  fetchAllPendingApprovals,
  formatApprovalDate,
  type ApprovalListItemWithTab,
  type ApprovalTabId,
} from '../lib/approvalsHome';
import ApprovalActionSheet from './approvals/ApprovalActionSheet';

type Props = {
  visible: boolean;
  onClose: () => void;
};

function itemRefCode(item: ApprovalListItemWithTab): string {
  const raw = item.raw as { displayNumber?: string | number | null };
  if (raw?.displayNumber != null && String(raw.displayNumber).trim() !== '') {
    return `#${raw.displayNumber}`;
  }
  if (item.tab === 'rm' || item.tab === 'oc') {
    const m = item.title.match(/#\s*([^\s]+)/);
    if (m?.[1]) return `#${m[1]}`;
  }
  const fromMeta = item.meta.match(/#\s*([^\s·]+)/);
  if (fromMeta?.[1]) return `#${fromMeta[1]}`;
  return `#${approvalApiId(item).slice(0, 8)}`;
}

const APPROVAL_TYPE_ICONS: Record<ApprovalTabId, LucideIcon> = {
  dp: MailPlus,
  fuel: Fuel,
  fd: Wallet,
  rm: Package,
  oc: ShoppingCart,
  medicao: Ruler,
};

function itemDateLabel(item: ApprovalListItemWithTab): string {
  const raw = item.raw as {
    createdAt?: string | null;
    refuelDate?: string | null;
    requestedAt?: string | null;
    measurementDate?: string | null;
  };
  const date =
    raw.measurementDate ||
    raw.refuelDate ||
    raw.requestedAt ||
    raw.createdAt ||
    null;
  if (date) return formatApprovalDate(date);
  const parts = item.meta.split('·').map((p) => p.trim());
  return parts.length > 1 ? parts[parts.length - 1] : parts[0] || '—';
}

export default function ApprovalsSheet({ visible, onClose }: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const queryClient = useQueryClient();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const listMaxHeight = Math.max(
    180,
    windowHeight * 0.92 - 120 - Math.max(insets.bottom, 16),
  );
  const canDismissRef = useRef(false);
  const [busy, setBusy] = useState<{ id: string; action: 'approve' | 'reject' } | null>(
    null,
  );
  const [selected, setSelected] = useState<ApprovalListItemWithTab | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ApprovalListItemWithTab | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const {
    canAccessDpApproverPages,
    canApproveFuel,
    canApproveFd,
    canApproveMaterialRequests,
    canApproveOc,
    canApproveOcCompras,
    canApproveOcDiretoria,
    canApproveOcGestor,
    canApproveEmpreiteiroDaily,
  } = usePermissions();

  const enabledTabs = useMemo(() => {
    const list: ApprovalTabId[] = [];
    if (canAccessDpApproverPages) list.push('dp');
    if (canApproveFuel) list.push('fuel');
    if (canApproveFd) list.push('fd');
    if (canApproveMaterialRequests) list.push('rm');
    if (canApproveOc) list.push('oc');
    if (canApproveEmpreiteiroDaily) list.push('medicao');
    return list;
  }, [
    canAccessDpApproverPages,
    canApproveFuel,
    canApproveFd,
    canApproveMaterialRequests,
    canApproveOc,
    canApproveEmpreiteiroDaily,
  ]);

  const ocFlags = useMemo(
    () => ({
      canCompras: canApproveOcCompras,
      canGestor: canApproveOcGestor,
      canDiretoria: canApproveOcDiretoria,
    }),
    [canApproveOcCompras, canApproveOcGestor, canApproveOcDiretoria],
  );

  useEffect(() => {
    if (!visible) {
      canDismissRef.current = false;
      setSelected(null);
      setRejectTarget(null);
      setRejectReason('');
      return;
    }
    canDismissRef.current = false;
    const t = setTimeout(() => {
      canDismissRef.current = true;
    }, 350);
    return () => clearTimeout(t);
  }, [visible]);

  const countsQuery = useQuery({
    queryKey: ['approvals', 'notification-counts'],
    enabled: visible,
    queryFn: fetchApprovalNotificationCounts,
    refetchInterval: 60_000,
  });

  const listQuery = useQuery({
    queryKey: [
      'approvals',
      'home-pending-all',
      enabledTabs.join(','),
      ocFlags.canCompras,
      ocFlags.canGestor,
      ocFlags.canDiretoria,
    ],
    enabled: visible && enabledTabs.length > 0,
    queryFn: () => fetchAllPendingApprovals(enabledTabs, ocFlags),
    staleTime: 30_000,
  });

  const requestClose = () => {
    if (!canDismissRef.current) return;
    onClose();
  };

  const counts = countsQuery.data || { dp: 0, fuel: 0, fd: 0, rm: 0, oc: 0, total: 0 };
  const items = listQuery.data || [];

  const quickAction = useMutation({
    mutationFn: async (opts: {
      item: ApprovalListItemWithTab;
      action: 'approve' | 'reject';
      comment?: string;
    }) => {
      const { item, action } = opts;
      const comment = (opts.comment || '').trim();
      const id = approvalApiId(item);
      const tab = item.tab;
      if (tab === 'dp') {
        if (action === 'approve') await approveDpRequest(id);
        else await rejectDpRequest(id, comment || 'Recusado pelo gestor');
        return;
      }
      if (tab === 'fuel') {
        if (action === 'approve') await approveFuelRequest(id);
        else await rejectFuelRequest(id, comment || 'Recusado pelo gestor');
        return;
      }
      if (tab === 'fd') {
        if (action === 'approve') await approveFdRequest(id);
        else await rejectFdRequest(id, comment || 'Recusado pelo gestor');
        return;
      }
      if (tab === 'rm') {
        if (action === 'approve') await approveRmRequest(id);
        else await rejectRmRequest(id, comment || 'Cancelado pelo gestor');
        return;
      }
      if (tab === 'oc') {
        const row = item.raw as OcApprovalRow;
        if (action === 'approve') {
          const next = nextOcApproveStatus(row.status);
          if (!next) throw new Error('Esta OC não pode ser aprovada nesta etapa');
          await approveOcRequest(id, next);
        } else {
          await rejectOcRequest(id, comment || 'Cancelado pelo gestor');
        }
        return;
      }
      if (tab === 'medicao') {
        const row = item.raw as MedicaoApprovalRow;
        const empreiteiroId = row.empreiteiroId || row.empreiteiro?.id;
        if (!empreiteiroId) throw new Error('Empreiteiro não encontrado');
        if (action === 'reject') {
          if (!comment) throw new Error('Informe o motivo da devolução');
          await returnMedicao(empreiteiroId, id, comment);
        }
      }
    },
    onMutate: (vars) => {
      setBusy({ id: vars.item.id, action: vars.action });
    },
    onSuccess: async (_data, vars) => {
      showAppToast({
        type: 'success',
        text1: vars.action === 'approve' ? 'Aprovado com sucesso' : 'Recusado com sucesso',
      });
      setRejectTarget(null);
      setRejectReason('');
      await queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
    onError: (err: Error) => {
      showAppToast({
        type: 'error',
        text1: err.message || 'Não foi possível concluir a ação',
      });
    },
    onSettled: () => {
      setBusy(null);
    },
  });

  const openRejectModal = (item: ApprovalListItemWithTab) => {
    setRejectReason('');
    setRejectTarget(item);
  };

  const submitReject = () => {
    if (!rejectTarget) return;
    const reason = rejectReason.trim();
    if (!reason) {
      showAppToast({ type: 'error', text1: 'Informe o motivo da recusa' });
      return;
    }
    quickAction.mutate({
      item: rejectTarget,
      action: 'reject',
      comment: reason,
    });
  };

  const onApprove = (item: ApprovalListItemWithTab) => {
    // Medição precisa do valor aprovado — abre o detalhe.
    if (item.tab === 'medicao') {
      setSelected(item);
      return;
    }
    Alert.alert('Aprovar', `Confirma a aprovação de “${item.title}”?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Aprovar',
        onPress: () => quickAction.mutate({ item, action: 'approve' }),
      },
    ]);
  };

  const selectedForSheet = selected
    ? { ...selected, id: approvalApiId(selected) }
    : null;

  const closeReject = () => {
    if (quickAction.isPending) return;
    setRejectTarget(null);
    setRejectReason('');
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={
        rejectTarget || selected
          ? () => {
              if (rejectTarget) closeReject();
              else setSelected(null);
            }
          : onClose
      }
    >
      <View style={layout.root}>
        <Pressable
          style={layout.backdrop}
          onPress={() => {
            if (rejectTarget || selected) return;
            requestClose();
          }}
        />

        <View style={layout.sheetWrap} pointerEvents="box-none">
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.card,
                paddingBottom: Math.max(insets.bottom, 16),
              },
            ]}
          >
            <View style={styles.handleWrap}>
              <View
                style={[
                  styles.handle,
                  {
                    backgroundColor: isDark
                      ? 'rgba(255,255,255,0.22)'
                      : 'rgba(15,23,42,0.18)',
                  },
                ]}
              />
            </View>

            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={[styles.title, { color: colors.text }]}>Aprovações</Text>
                <Text style={[styles.headerSub, { color: colors.textSecondary }]} numberOfLines={1}>
                  {Number(counts.total || 0) === 0
                    ? 'Nada pendente no momento'
                    : `${counts.total} pendente${counts.total === 1 ? '' : 's'}`}
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={8}>
                <X size={18} color={colors.text} strokeWidth={2.2} />
              </TouchableOpacity>
            </View>

            <FlatList
              data={items}
              keyExtractor={(item) => item.id}
              style={[styles.list, { maxHeight: listMaxHeight }]}
              contentContainerStyle={
                items.length === 0 ? styles.emptyWrap : styles.listContent
              }
              showsVerticalScrollIndicator={false}
              ListEmptyComponent={
                listQuery.isLoading ? (
                  <View style={styles.loadingWrap}>
                    <ActivityIndicator color={colors.primary} />
                  </View>
                ) : (
                  <View style={styles.empty}>
                    <View
                      style={[
                        styles.emptyIcon,
                        { backgroundColor: isDark ? colors.surface : colors.background },
                      ]}
                    >
                      <BadgeCheck size={22} color={colors.textSecondary} strokeWidth={2} />
                    </View>
                    <Text style={[styles.emptyTitle, { color: colors.text }]}>Tudo em dia</Text>
                    <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                      Não há solicitações pendentes no momento.
                    </Text>
                  </View>
                )
              }
              renderItem={({ item }) => {
                const itemBusy = busy?.id === item.id;
                const approving = itemBusy && busy?.action === 'approve';
                const rejecting = itemBusy && busy?.action === 'reject';
                const TypeIcon = APPROVAL_TYPE_ICONS[item.tab] || ClipboardList;
                const person =
                  item.person && item.person !== item.title ? item.person : null;
                const place =
                  item.place &&
                  item.place !== item.title &&
                  item.place !== item.person
                    ? item.place
                    : !person && item.subtitle && item.subtitle !== item.title
                      ? item.subtitle
                      : item.place && item.place !== item.title
                        ? item.place
                        : null;
                const showUrgency =
                  item.urgencyTone === 'high' || item.urgencyTone === 'urgent';
                return (
                  <View style={styles.item}>
                    <TouchableOpacity
                      style={styles.itemBody}
                      onPress={() => setSelected(item)}
                      activeOpacity={0.75}
                      disabled={itemBusy}
                    >
                      <View style={styles.itemRefRow}>
                        <Text style={styles.itemRef}>{itemRefCode(item)}</Text>
                        {showUrgency ? (
                          <View
                            style={[
                              styles.urgencyChip,
                              item.urgencyTone === 'urgent'
                                ? styles.urgencyUrgent
                                : styles.urgencyHigh,
                            ]}
                          >
                            <Text
                              style={[
                                styles.urgencyChipText,
                                item.urgencyTone === 'urgent'
                                  ? styles.urgencyUrgentText
                                  : styles.urgencyHighText,
                              ]}
                            >
                              {item.urgencyLabel}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={styles.typeChip} accessibilityLabel={item.categoryLabel}>
                        <TypeIcon size={13} color={colors.primary} strokeWidth={2.2} />
                        <Text style={styles.typeChipText}>{item.categoryLabel}</Text>
                      </View>
                      <Text style={styles.itemTitle} numberOfLines={2}>
                        {item.title}
                      </Text>
                      {person ? (
                        <Text style={styles.itemPerson} numberOfLines={1}>
                          {person}
                        </Text>
                      ) : null}
                      {place ? (
                        <Text style={styles.itemPlace} numberOfLines={2}>
                          {place}
                        </Text>
                      ) : null}
                      <View style={styles.itemFooter}>
                        <View style={styles.metaLine}>
                          <CalendarDays
                            size={13}
                            color={isDark ? 'rgba(255,255,255,0.38)' : 'rgba(15,23,42,0.4)'}
                            strokeWidth={2.2}
                          />
                          <Text style={styles.itemMeta}>{itemDateLabel(item)}</Text>
                        </View>
                        <View style={styles.detailHint}>
                          <Text style={styles.detailHintText}>Detalhes</Text>
                          <ChevronRight
                            size={14}
                            color={colors.primary}
                            strokeWidth={2.4}
                          />
                        </View>
                      </View>
                    </TouchableOpacity>

                    <View style={styles.itemDivider} />

                    <View style={styles.itemActions}>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.rejectBtn]}
                        onPress={() => openRejectModal(item)}
                        activeOpacity={0.8}
                        disabled={itemBusy}
                      >
                        {rejecting ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.rejectBtnText}>Recusar</Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, styles.approveBtn]}
                        onPress={() => onApprove(item)}
                        activeOpacity={0.8}
                        disabled={itemBusy}
                      >
                        {approving ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <Text style={styles.approveBtnText}>Aprovar</Text>
                        )}
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              }}
            />
          </View>
        </View>

        {/* Overlays na mesma Modal — por cima da lista, sem Modal aninhada */}
        {rejectTarget ? (
          <View style={layout.layerOverlay}>
            <Pressable style={layout.layerBackdrop} onPress={closeReject} />
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : undefined}
              style={layout.layerCenter}
              pointerEvents="box-none"
            >
              <View style={[styles.rejectSheet, { backgroundColor: colors.card }]}>
                <View style={styles.rejectHeader}>
                  <Text style={[styles.rejectTitle, { color: colors.text }]}>Motivo da recusa</Text>
                  <Text style={[styles.rejectId, { color: colors.text }]}>
                    {itemRefCode(rejectTarget)}
                  </Text>
                </View>
                <Text style={[styles.rejectHint, { color: colors.textSecondary }]} numberOfLines={2}>
                  {rejectTarget.title}
                </Text>
                <TextInput
                  value={rejectReason}
                  onChangeText={setRejectReason}
                  placeholder="Descreva o motivo para o solicitante"
                  placeholderTextColor={colors.textSecondary}
                  style={[
                    styles.rejectInput,
                    {
                      color: colors.text,
                      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.1)',
                      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.03)',
                    },
                  ]}
                  multiline
                  textAlignVertical="top"
                  autoFocus
                />
                <View style={styles.rejectActions}>
                  <TouchableOpacity
                    style={[
                      styles.rejectCancelBtn,
                      {
                        borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.1)',
                      },
                    ]}
                    onPress={closeReject}
                    disabled={quickAction.isPending}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.rejectCancelText, { color: colors.text }]}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.rejectConfirmBtn}
                    onPress={submitReject}
                    disabled={quickAction.isPending}
                    activeOpacity={0.8}
                  >
                    {quickAction.isPending ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.rejectConfirmText}>Confirmar recusa</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        ) : null}

        <ApprovalActionSheet
          visible={!!selected}
          tab={selected?.tab ?? null}
          item={selectedForSheet}
          onClose={() => setSelected(null)}
          embedded
        />
      </View>
    </Modal>
  );
}

// Layout fora do useMemo: o Fast Refresh preserva o memo e deixaria chaves novas undefined.
const layout = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetWrap: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 12,
    paddingBottom: 16,
  },
  layerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    elevation: 1000,
  },
  layerBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  layerCenter: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
});

const getStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    sheet: {
      maxHeight: '92%',
      borderRadius: 22,
      paddingHorizontal: 16,
      paddingTop: 8,
    },
    handleWrap: { alignItems: 'center', marginBottom: 8 },
    handle: { width: 36, height: 4, borderRadius: 999 },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 14,
      paddingHorizontal: 2,
      gap: 10,
    },
    headerText: { flex: 1, minWidth: 0 },
    title: {
      fontSize: 22,
      fontWeight: '700',
      letterSpacing: -0.4,
    },
    headerSub: {
      marginTop: 2,
      fontSize: 13,
      fontWeight: '500',
    },
    closeBtn: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    list: { flexGrow: 0 },
    listContent: { gap: 12, paddingBottom: 4, paddingTop: 2 },
    emptyWrap: { justifyContent: 'center', paddingVertical: 48 },
    loadingWrap: { paddingVertical: 48, alignItems: 'center' },
    empty: { alignItems: 'center', paddingHorizontal: 28 },
    emptyIcon: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    emptyTitle: {
      fontSize: 17,
      fontWeight: '700',
      marginBottom: 6,
      letterSpacing: -0.2,
    },
    emptyText: {
      fontSize: 14,
      fontWeight: '500',
      textAlign: 'center',
      lineHeight: 20,
    },
    item: {
      position: 'relative',
      overflow: 'hidden',
      borderRadius: 18,
      backgroundColor: isDark ? 'rgba(255,255,255,0.055)' : 'rgba(15,23,42,0.03)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.07)',
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 14,
      gap: 12,
    },
    itemBody: {
      alignItems: 'center',
      gap: 7,
      paddingHorizontal: 8,
    },
    itemRefRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      flexWrap: 'wrap',
    },
    itemRef: {
      fontSize: 22,
      fontWeight: '800',
      letterSpacing: -0.5,
      color: colors.text,
      fontVariant: ['tabular-nums'],
      textAlign: 'center',
    },
    typeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: isDark ? 'rgba(239,68,68,0.22)' : '#fde8e8',
    },
    typeChipText: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.1,
      color: colors.primary,
    },
    urgencyChip: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 999,
    },
    urgencyHigh: {
      backgroundColor: isDark ? 'rgba(249,115,22,0.18)' : 'rgba(249,115,22,0.12)',
    },
    urgencyUrgent: {
      backgroundColor: isDark ? 'rgba(220,38,38,0.22)' : 'rgba(220,38,38,0.12)',
    },
    urgencyChipText: {
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.2,
    },
    urgencyHighText: { color: isDark ? '#fdba74' : '#c2410c' },
    urgencyUrgentText: { color: isDark ? '#fca5a5' : '#b91c1c' },
    itemTitle: {
      marginTop: 2,
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: -0.25,
      color: colors.text,
      textAlign: 'center',
    },
    metaLine: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 5,
      maxWidth: '100%',
    },
    itemPerson: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
      textAlign: 'center',
      flexShrink: 1,
    },
    itemPlace: {
      fontSize: 12,
      fontWeight: '500',
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 17,
      flexShrink: 1,
    },
    itemFooter: {
      marginTop: 4,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      flexWrap: 'wrap',
    },
    itemMeta: {
      fontSize: 12,
      fontWeight: '500',
      fontVariant: ['tabular-nums'],
      color: isDark ? 'rgba(255,255,255,0.38)' : 'rgba(15,23,42,0.4)',
    },
    detailHint: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 1,
    },
    detailHintText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.primary,
    },
    itemDivider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.08)',
      marginHorizontal: 2,
    },
    itemActions: {
      flexDirection: 'row',
      gap: 8,
    },
    actionBtn: {
      flex: 1,
      minHeight: 42,
      borderRadius: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: 12,
    },
    rejectBtn: {
      backgroundColor: isDark ? '#b91c1c' : '#dc2626',
    },
    rejectBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: '#fff',
    },
    approveBtn: {
      backgroundColor: isDark ? '#15803d' : '#16a34a',
    },
    approveBtnText: {
      fontSize: 13,
      fontWeight: '700',
      color: '#fff',
    },
    rejectSheet: {
      borderRadius: 20,
      padding: 20,
      gap: 10,
    },
    rejectHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    rejectTitle: {
      flex: 1,
      fontSize: 18,
      fontWeight: '700',
      letterSpacing: -0.3,
    },
    rejectId: {
      fontSize: 18,
      fontWeight: '800',
      letterSpacing: -0.4,
      fontVariant: ['tabular-nums'],
    },
    rejectHint: {
      fontSize: 13,
      fontWeight: '500',
      marginBottom: 4,
    },
    rejectInput: {
      minHeight: 110,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      fontWeight: '500',
      lineHeight: 21,
    },
    rejectActions: {
      flexDirection: 'row',
      gap: 8,
      marginTop: 6,
    },
    rejectCancelBtn: {
      flex: 1,
      minHeight: 44,
      borderRadius: 12,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rejectCancelText: {
      fontSize: 14,
      fontWeight: '600',
    },
    rejectConfirmBtn: {
      flex: 1.2,
      minHeight: 44,
      borderRadius: 12,
      backgroundColor: isDark ? '#b91c1c' : '#dc2626',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
    },
    rejectConfirmText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#fff',
    },
  });

