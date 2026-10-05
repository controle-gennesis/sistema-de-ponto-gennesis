import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import {
  ClipboardList,
  Fuel,
  FileText,
  Package,
  ShoppingCart,
  Ruler,
} from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { usePermissions } from '../hooks/usePermissions';
import {
  fetchApprovalNotificationCounts,
} from '../services/approvals';
import {
  fetchPendingApprovalsForTab,
  type ApprovalListItem,
  type ApprovalTabId,
} from '../lib/approvalsHome';
import ApprovalActionSheet from './approvals/ApprovalActionSheet';

const MAX_ITEMS = 5;

type TabDef = {
  id: ApprovalTabId;
  label: string;
  icon: typeof ClipboardList;
  countKey?: 'dp' | 'fuel' | 'fd' | 'rm' | 'oc';
};

export default function HomeAprovacoesCard() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const {
    canSeeAprovacoes,
    canAccessDpApproverPages,
    canApproveFuel,
    canApproveFd,
    canApproveMaterialRequests,
    canApproveOc,
    canApproveOcCompras,
    canApproveOcDiretoria,
    canApproveOcGestor,
    canApproveEmpreiteiroDaily,
    isLoading: permissionsLoading,
  } = usePermissions();

  const tabs = useMemo(() => {
    const list: TabDef[] = [];
    if (canAccessDpApproverPages) {
      list.push({ id: 'dp', label: 'Internas', icon: ClipboardList, countKey: 'dp' });
    }
    if (canApproveFuel) {
      list.push({ id: 'fuel', label: 'Combustível', icon: Fuel, countKey: 'fuel' });
    }
    if (canApproveFd) {
      list.push({ id: 'fd', label: 'FD', icon: FileText, countKey: 'fd' });
    }
    if (canApproveMaterialRequests) {
      list.push({ id: 'rm', label: 'RM', icon: Package, countKey: 'rm' });
    }
    if (canApproveOc) {
      list.push({ id: 'oc', label: 'OC', icon: ShoppingCart, countKey: 'oc' });
    }
    if (canApproveEmpreiteiroDaily) {
      list.push({ id: 'medicao', label: 'Medições', icon: Ruler });
    }
    return list;
  }, [
    canAccessDpApproverPages,
    canApproveFuel,
    canApproveFd,
    canApproveMaterialRequests,
    canApproveOc,
    canApproveEmpreiteiroDaily,
  ]);

  const [tab, setTab] = useState<ApprovalTabId | null>(null);
  const activeTab = tab && tabs.some((t) => t.id === tab) ? tab : tabs[0]?.id ?? null;
  const [selected, setSelected] = useState<ApprovalListItem | null>(null);

  const ocFlags = useMemo(
    () => ({
      canCompras: canApproveOcCompras,
      canGestor: canApproveOcGestor,
      canDiretoria: canApproveOcDiretoria,
    }),
    [canApproveOcCompras, canApproveOcGestor, canApproveOcDiretoria],
  );

  const countsQuery = useQuery({
    queryKey: ['approvals', 'notification-counts'],
    enabled: canSeeAprovacoes,
    queryFn: fetchApprovalNotificationCounts,
    refetchInterval: 60_000,
  });

  const listQuery = useQuery({
    queryKey: [
      'approvals',
      'home-pending',
      activeTab,
      ocFlags.canCompras,
      ocFlags.canGestor,
      ocFlags.canDiretoria,
    ],
    enabled: !!activeTab && canSeeAprovacoes,
    queryFn: () => fetchPendingApprovalsForTab(activeTab!, ocFlags),
    staleTime: 30_000,
  });

  if (permissionsLoading || !canSeeAprovacoes || tabs.length === 0) {
    return null;
  }

  const counts = countsQuery.data || { dp: 0, fuel: 0, fd: 0, rm: 0, oc: 0, total: 0 };
  const items = listQuery.data || [];
  const visible = items.slice(0, MAX_ITEMS);
  const totalBadge = Number(counts.total || 0);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconWrap}>
            <ClipboardList size={20} color={colors.primary} strokeWidth={2.2} />
          </View>
          <View style={styles.headerText}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>Aprovações</Text>
              {totalBadge > 0 ? (
                <View style={styles.totalBadge}>
                  <Text style={styles.totalBadgeText}>
                    {totalBadge > 99 ? '99+' : String(totalBadge)}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={styles.subtitle} numberOfLines={1}>
              {listQuery.isLoading
                ? 'Carregando…'
                : items.length === 0
                  ? 'Nada pendente nesta fila'
                  : `${items.length} pendente${items.length === 1 ? '' : 's'}`}
            </Text>
          </View>
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
      >
        {tabs.map((t) => {
          const active = t.id === activeTab;
          const Icon = t.icon;
          const badge = t.countKey ? Number(counts[t.countKey] || 0) : 0;
          return (
            <TouchableOpacity
              key={t.id}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => {
                setTab(t.id);
                setSelected(null);
              }}
              activeOpacity={0.7}
            >
              <Icon
                size={14}
                color={active ? '#fff' : colors.textSecondary}
                strokeWidth={2.2}
              />
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{t.label}</Text>
              {badge > 0 ? (
                <View style={[styles.countBadge, active && styles.countBadgeActive]}>
                  <Text style={[styles.countBadgeText, active && styles.countBadgeTextActive]}>
                    {badge > 99 ? '99+' : String(badge)}
                  </Text>
                </View>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {listQuery.isLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : items.length === 0 ? (
        <Text style={styles.empty}>Nada pendente nesta fila</Text>
      ) : (
        <View style={styles.list}>
          {visible.map((item, index) => (
            <TouchableOpacity
              key={item.id}
              style={[styles.row, index === 0 && styles.rowFirst]}
              onPress={() => setSelected(item)}
              activeOpacity={0.7}
            >
              <View style={styles.rowMain}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.rowSubtitle} numberOfLines={1}>
                  {item.subtitle}
                </Text>
              </View>
              <Text style={styles.rowMeta} numberOfLines={1}>
                {item.meta}
              </Text>
            </TouchableOpacity>
          ))}
          {items.length > MAX_ITEMS ? (
            <Text style={styles.more}>+{items.length - MAX_ITEMS} na fila</Text>
          ) : null}
        </View>
      )}

      <ApprovalActionSheet
        visible={!!selected}
        tab={activeTab}
        item={selected}
        onClose={() => setSelected(null)}
      />
    </View>
  );
}

const getStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: 16,
      marginBottom: 16,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
      marginBottom: 12,
    },
    headerLeft: {
      flex: 1,
      minWidth: 0,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    iconWrap: {
      width: 42,
      height: 42,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `${colors.primary}14`,
    },
    headerText: { flex: 1, minWidth: 0 },
    titleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    title: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
      letterSpacing: -0.3,
    },
    totalBadge: {
      minWidth: 20,
      height: 20,
      borderRadius: 6,
      paddingHorizontal: 6,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    totalBadgeText: {
      fontSize: 11,
      fontWeight: '700',
      color: '#fff',
    },
    subtitle: {
      marginTop: 2,
      fontSize: 13,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    chipsRow: {
      gap: 8,
      paddingBottom: 10,
    },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : colors.screenRoot,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: isDark ? 'transparent' : 'rgba(15, 23, 42, 0.08)',
    },
    chipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    chipText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
    chipTextActive: { color: '#fff' },
    countBadge: {
      minWidth: 18,
      height: 18,
      borderRadius: 6,
      paddingHorizontal: 5,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    countBadgeActive: { backgroundColor: 'rgba(255,255,255,0.28)' },
    countBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
    countBadgeTextActive: { color: '#fff' },
    loadingWrap: {
      paddingVertical: 12,
      alignItems: 'flex-start',
    },
    empty: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.textSecondary,
      lineHeight: 20,
    },
    list: {},
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    rowFirst: {
      borderTopWidth: 0,
      paddingTop: 2,
    },
    rowMain: {
      flex: 1,
      minWidth: 0,
      gap: 2,
    },
    rowTitle: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.text,
      lineHeight: 19,
    },
    rowSubtitle: {
      fontSize: 12,
      fontWeight: '500',
      color: colors.textSecondary,
    },
    rowMeta: {
      fontSize: 11,
      fontWeight: '500',
      fontVariant: ['tabular-nums'],
      color: colors.textSecondary,
      maxWidth: '36%',
      textAlign: 'right',
    },
    more: {
      marginTop: 8,
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
  });
