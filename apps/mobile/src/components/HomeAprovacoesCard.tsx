import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, ChevronRight } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { usePermissions } from '../hooks/usePermissions';
import { fetchApprovalNotificationCounts } from '../services/approvals';
import ApprovalsSheet from './ApprovalsSheet';

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
    canApproveEmpreiteiroDaily,
    isLoading: permissionsLoading,
  } = usePermissions();

  const hasAnyQueue =
    canAccessDpApproverPages ||
    canApproveFuel ||
    canApproveFd ||
    canApproveMaterialRequests ||
    canApproveOc ||
    canApproveEmpreiteiroDaily;

  const [sheetOpen, setSheetOpen] = useState(false);

  const countsQuery = useQuery({
    queryKey: ['approvals', 'notification-counts'],
    enabled: canSeeAprovacoes && hasAnyQueue,
    queryFn: fetchApprovalNotificationCounts,
    refetchInterval: 60_000,
  });

  const data = countsQuery.data;
  const total = Number(data?.total || 0);
  const hasPending = total > 0;

  const breakdownParts = useMemo(() => {
    if (!data) return [] as string[];
    const parts: string[] = [];
    if (canAccessDpApproverPages && data.dp > 0) parts.push(`Internas ${data.dp}`);
    if (canApproveFuel && data.fuel > 0) parts.push(`Combustível ${data.fuel}`);
    if (canApproveFd && data.fd > 0) parts.push(`FD ${data.fd}`);
    if (canApproveMaterialRequests && data.rm > 0) parts.push(`RM ${data.rm}`);
    if (canApproveOc && data.oc > 0) parts.push(`OC ${data.oc}`);
    return parts.slice(0, 3);
  }, [
    data,
    canAccessDpApproverPages,
    canApproveFuel,
    canApproveFd,
    canApproveMaterialRequests,
    canApproveOc,
  ]);

  if (permissionsLoading || !canSeeAprovacoes || !hasAnyQueue) {
    return null;
  }

  return (
    <>
      <TouchableOpacity
        style={[styles.card, hasPending ? styles.cardPending : null]}
        onPress={() => setSheetOpen(true)}
        activeOpacity={0.84}
        accessibilityRole="button"
        accessibilityLabel={
          hasPending
            ? `Abrir aprovações, ${total} pendentes`
            : 'Abrir aprovações, nada pendente'
        }
      >
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerDot} />
            <Text style={styles.kicker}>Aprovações</Text>
          </View>
          <ChevronRight size={18} color={colors.textSecondary} strokeWidth={2.2} />
        </View>

        {countsQuery.isLoading ? (
          <Text style={styles.loadingText}>Carregando…</Text>
        ) : hasPending ? (
          <>
            <View style={styles.hero}>
              <Text style={styles.heroCount}>{total > 99 ? '99+' : String(total)}</Text>
              <View style={styles.heroCopy}>
                <Text style={styles.heroTitle}>
                  {total === 1 ? 'pendente' : 'pendentes'}
                </Text>
                <Text style={styles.heroSub}>aguardando sua revisão</Text>
              </View>
            </View>

            {breakdownParts.length > 0 ? (
              <View style={styles.breakdownRow}>
                {breakdownParts.map((part, index) => (
                  <React.Fragment key={part}>
                    {index > 0 ? <View style={styles.breakdownDot} /> : null}
                    <Text style={styles.breakdownItem}>{part}</Text>
                  </React.Fragment>
                ))}
              </View>
            ) : null}

            <View style={styles.cta}>
              <Text style={styles.ctaText}>Revisar agora</Text>
            </View>
          </>
        ) : (
          <View style={styles.empty}>
            <View style={styles.emptyIcon}>
              <BadgeCheck size={24} color={colors.primary} strokeWidth={2.1} />
            </View>
            <View style={styles.emptyCopy}>
              <Text style={styles.emptyTitle}>Tudo em dia</Text>
              <Text style={styles.emptySub}>Nenhuma aprovação pendente</Text>
            </View>
          </View>
        )}
      </TouchableOpacity>

      <ApprovalsSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}

const getStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    card: {
      position: 'relative',
      overflow: 'hidden',
      backgroundColor: colors.surface,
      borderRadius: 20,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: 18,
      paddingTop: 16,
      paddingBottom: 16,
      marginBottom: 16,
      gap: 16,
      ...Platform.select({
        ios: {
          shadowColor: '#0f172a',
          shadowOpacity: isDark ? 0 : 0.07,
          shadowRadius: 14,
          shadowOffset: { width: 0, height: 6 },
        },
        android: { elevation: isDark ? 0 : 3 },
        default: {},
      }),
    },
    cardPending: {
      borderColor: isDark ? 'rgba(239,68,68,0.28)' : 'rgba(206,55,54,0.16)',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      zIndex: 1,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    headerDot: {
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: colors.primary,
    },
    kicker: {
      fontSize: 12,
      fontWeight: '700',
      letterSpacing: 0.8,
      textTransform: 'uppercase',
      color: colors.textSecondary,
    },
    loadingText: {
      fontSize: 15,
      fontWeight: '500',
      color: colors.textSecondary,
      paddingVertical: 10,
      zIndex: 1,
    },
    hero: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 22,
      zIndex: 1,
    },
    heroCount: {
      fontSize: 64,
      fontWeight: '800',
      letterSpacing: -2.2,
      color: colors.primary,
      fontVariant: ['tabular-nums'],
      lineHeight: 64,
      includeFontPadding: false,
      textAlignVertical: 'center',
      // Números grandes ficam opticamente mais altos que o bloco de texto ao lado
      transform: [{ translateY: 3 }],
    },
    heroCopy: {
      flex: 1,
      minWidth: 0,
      justifyContent: 'center',
      gap: 2,
      paddingRight: 4,
      paddingBottom: 1,
    },
    heroTitle: {
      fontSize: 22,
      fontWeight: '700',
      letterSpacing: -0.5,
      color: colors.text,
      lineHeight: 26,
    },
    heroSub: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.textSecondary,
      lineHeight: 19,
    },
    breakdownRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 8,
      zIndex: 1,
    },
    breakdownItem: {
      fontSize: 12,
      fontWeight: '600',
      color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(15,23,42,0.48)',
      letterSpacing: -0.1,
    },
    breakdownDot: {
      width: 3,
      height: 3,
      borderRadius: 2,
      backgroundColor: isDark ? 'rgba(255,255,255,0.28)' : 'rgba(15,23,42,0.22)',
    },
    cta: {
      marginTop: 2,
      minHeight: 46,
      borderRadius: 14,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
      zIndex: 1,
    },
    ctaText: {
      fontSize: 15,
      fontWeight: '700',
      color: '#fff',
      letterSpacing: -0.2,
    },
    empty: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingVertical: 6,
      zIndex: 1,
    },
    emptyIcon: {
      width: 52,
      height: 52,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(239,68,68,0.16)' : '#fde8e8',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(239,68,68,0.24)' : 'rgba(206,55,54,0.12)',
    },
    emptyCopy: {
      flex: 1,
      minWidth: 0,
      gap: 3,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '700',
      letterSpacing: -0.35,
      color: colors.text,
    },
    emptySub: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.textSecondary,
      lineHeight: 18,
    },
  });
