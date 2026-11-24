import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, ClipboardList, Search, X } from 'lucide-react-native';
import AppHeader from '../components/AppHeader';
import { GlassBlur } from '../components/GlassBg';
import ApprovalActionSheet from '../components/approvals/ApprovalActionSheet';
import { useTheme } from '../context/ThemeContext';
import { usePermissions } from '../hooks/usePermissions';
import { fetchFdList, type FdApprovalRow } from '../services/approvals';
import { formatApprovalDate, formatApprovalMoney, type ApprovalListItem } from '../lib/approvalsHome';

/** Mesmas etapas do site (aprovação do gestor + andamento da compra). */
type StatusFilter = 'ALL' | 'IN_APPROVAL' | 'PENDING' | 'QUOTATION' | 'FINISHED' | 'CANCELLED';

const FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'ALL', label: 'Todas' },
  { key: 'IN_APPROVAL', label: 'Aguardando Aprovação' },
  { key: 'PENDING', label: 'Em Fila' },
  { key: 'QUOTATION', label: 'Em Cotação' },
  { key: 'FINISHED', label: 'Finalizadas' },
  { key: 'CANCELLED', label: 'Canceladas' },
];

const isCancelled = (r: FdApprovalRow) => r.status === 'CANCELLED' || r.purchaseStatus === 'CANCELLED';

/** Mesma regra do site para dizer em qual etapa a ficha está. */
function matchesStage(r: FdApprovalRow, stage: StatusFilter): boolean {
  switch (stage) {
    case 'ALL':
      return true;
    case 'IN_APPROVAL':
      return r.status === 'WAITING_MANAGER';
    case 'PENDING':
      return r.status === 'APPROVED' && !r.purchaseStatus;
    case 'QUOTATION':
      return (
        r.status === 'APPROVED' &&
        (r.purchaseStatus === 'QUOTATION' ||
          r.purchaseStatus === 'PURCHASE_REQUEST' ||
          r.purchaseStatus === 'SUPPLIES')
      );
    case 'FINISHED':
      return r.purchaseStatus === 'FINISHED';
    case 'CANCELLED':
      return isCancelled(r);
  }
}

/** Mesmo rótulo do site: FD lançada pelo orçamento não passa por aprovação e aparece como «Lançada». */
function statusLabel(row: FdApprovalRow): string {
  if (row.status === 'CANCELLED' && row.managerRejectionComment?.includes('exclusão de orçamento')) {
    return 'Cancelada (orçamento excluído)';
  }
  if (row.status === 'APPROVED' && row.orcamentoId && !row.managerApproverNome?.trim()) return 'Lançada';
  if (isCancelled(row)) return 'Cancelada';
  if (row.status === 'WAITING_MANAGER') return 'Aguardando Aprovação';
  if (row.status === 'REJECTED') return 'Reprovada';
  if (matchesStage(row, 'FINISHED')) return 'Finalizada';
  if (matchesStage(row, 'QUOTATION')) return 'Em Cotação';
  if (matchesStage(row, 'PENDING')) return 'Em Fila';
  return row.status;
}

function statusTone(row: FdApprovalRow): { fg: string; bg: string } {
  if (isCancelled(row) || row.status === 'REJECTED') return { fg: '#b91c1c', bg: 'rgba(239,68,68,0.16)' };
  if (row.status === 'WAITING_MANAGER') return { fg: '#6d28d9', bg: 'rgba(139,92,246,0.16)' };
  if (matchesStage(row, 'FINISHED')) return { fg: '#15803d', bg: 'rgba(34,197,94,0.16)' };
  if (matchesStage(row, 'QUOTATION')) return { fg: '#4338ca', bg: 'rgba(99,102,241,0.16)' };
  return { fg: '#b45309', bg: 'rgba(245,158,11,0.16)' };
}

export default function FichasDemandaScreen() {
  const navigation = useNavigation();
  const { colors, isDark } = useTheme();
  const { can } = usePermissions();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState<StatusFilter>('ALL');
  const [selected, setSelected] = useState<ApprovalListItem | null>(null);

  // Mesma permissão do site (Engenharia → Fichas de Demanda).
  const allowed = can('ponto_aprovacao-fds');

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const query = useQuery({
    queryKey: ['fd-list', debounced],
    enabled: allowed,
    queryFn: () => fetchFdList({ search: debounced }),
    staleTime: 30_000,
  });

  const all = query.data ?? [];
  const counts = useMemo(() => {
    const c = {} as Record<StatusFilter, number>;
    for (const f of FILTERS) c[f.key] = all.filter((r) => matchesStage(r, f.key)).length;
    return c;
  }, [all]);
  const rows = useMemo(() => all.filter((r) => matchesStage(r, status)), [all, status]);

  const openRow = (row: FdApprovalRow) => {
    setSelected({
      id: row.id,
      title: row.codFichaDemanda?.trim() || 'Ficha de demanda',
      subtitle: row.obra?.trim() || '',
      meta: formatApprovalDate(row.createdAt),
      statusLabel: statusLabel(row),
      pending: false,
      raw: row,
    });
  };

  return (
    <View style={styles.safe}>
      <AppHeader showBack title="FD's" onBack={() => navigation.goBack()} />

      <FlatList
        data={allowed ? rows : []}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching && !query.isLoading}
            onRefresh={() => void query.refetch()}
            tintColor={colors.primary}
          />
        }
        ListHeaderComponent={
          <View>
            <Text style={styles.pageTitle}>Fichas de Demanda</Text>
            <Text style={styles.pageSubtitle}>Acompanhe as fichas dos seus contratos</Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipsScroll}
              contentContainerStyle={styles.chips}
            >
              {FILTERS.map((f) => {
                const active = status === f.key;
                return (
                  <TouchableOpacity
                    key={f.key}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => setStatus(f.key)}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
                    <Text style={[styles.chipCount, active && styles.chipCountActive]}>{counts[f.key]}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={styles.searchBox}>
              <GlassBlur white radius={22} />
              <Search size={16} color={colors.textSecondary} strokeWidth={2} />
              <TextInput
                style={styles.searchInput}
                placeholder="Pesquisar"
                placeholderTextColor={colors.textSecondary}
                value={search}
                onChangeText={setSearch}
                returnKeyType="search"
                autoCorrect={false}
              />
              {search.length > 0 ? (
                <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                  <X size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              ) : null}
            </View>

            <View style={styles.sectionRow}>
              <Text style={styles.sectionTitle}>
                {status === 'ALL' ? 'Todas as fichas' : FILTERS.find((f) => f.key === status)?.label ?? 'Todas as fichas'}
              </Text>
              {allowed && !query.isLoading ? <Text style={styles.sectionCount}>{rows.length}</Text> : null}
            </View>
          </View>
        }
        ListEmptyComponent={
          !allowed ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Sem acesso</Text>
              <Text style={styles.emptySub}>Você não tem permissão para ver as fichas de demanda.</Text>
            </View>
          ) : query.isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
          ) : query.isError ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Não foi possível carregar</Text>
              <Text style={styles.emptySub}>Puxe a tela para tentar de novo.</Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <ClipboardList size={28} color={colors.textSecondary} strokeWidth={1.8} />
              </View>
              <Text style={styles.emptyTitle}>
                {debounced || status !== 'ALL' ? 'Nenhuma ficha encontrada' : 'Nenhuma ficha por aqui'}
              </Text>
              <Text style={styles.emptySub}>
                {debounced || status !== 'ALL'
                  ? 'Tente outro filtro ou outro termo.'
                  : 'Quando houver fichas nos seus contratos, elas aparecem aqui.'}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const tone = statusTone(item);
          const contrato = item.contratoNome?.trim() || item.contrato?.name?.trim() || '';
          const solicitante = item.solicitanteNome?.trim() || item.solicitante?.name?.trim() || '';
          return (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.8}
              onPress={() => openRow(item)}
              accessibilityRole="button"
              accessibilityLabel={`Abrir ficha ${item.codFichaDemanda ?? ''}`}
            >
              <View style={styles.cardTop}>
                <Text style={styles.code} numberOfLines={1}>
                  {item.codFichaDemanda?.trim() || '—'}
                </Text>
                <View style={[styles.badge, { backgroundColor: tone.bg }]}>
                  <Text style={[styles.badgeText, { color: tone.fg }]}>{statusLabel(item)}</Text>
                </View>
              </View>

              <Text style={styles.cardTitle} numberOfLines={2}>
                {item.obra?.trim() || 'Sem obra'}
              </Text>
              {contrato ? (
                <Text style={styles.cardLine} numberOfLines={1}>
                  {contrato}
                </Text>
              ) : null}
              {solicitante ? (
                <Text style={styles.cardLine} numberOfLines={1}>
                  {solicitante}
                </Text>
              ) : null}

              <View style={styles.metaRow}>
                <View>
                  <Text style={styles.metaLabel}>Custo estimado</Text>
                  <Text style={styles.metaValue}>{formatApprovalMoney(Number(item.custoEstimado))}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.metaLabel}>Faturamento</Text>
                  <Text style={styles.metaValue}>{formatApprovalMoney(Number(item.faturamentoEstimado))}</Text>
                </View>
              </View>

              <View style={styles.footer}>
                <Text style={styles.date}>{formatApprovalDate(item.createdAt)}</Text>
                <View style={styles.hint}>
                  <Text style={styles.hintText}>Ver detalhes</Text>
                  <ChevronRight size={15} color={colors.primary} strokeWidth={2.4} />
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />

      <ApprovalActionSheet
        visible={!!selected}
        tab={selected ? 'fd' : null}
        item={selected}
        onClose={() => setSelected(null)}
      />
    </View>
  );
}

const getStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.screenRoot },
    content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },
    pageTitle: { color: colors.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.6, marginBottom: 4 },
    pageSubtitle: { color: colors.textSecondary, fontSize: 14, fontWeight: '500', marginBottom: 18 },
    chipsScroll: { marginHorizontal: -20 },
    chips: { paddingHorizontal: 20, gap: 8, paddingBottom: 12 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 999,
      backgroundColor: isDark ? colors.card : colors.surface,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: isDark ? 'transparent' : 'rgba(15, 23, 42, 0.08)',
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
    chipTextActive: { color: '#fff' },
    chipCount: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, opacity: 0.7 },
    chipCountActive: { color: 'rgba(255,255,255,0.85)', opacity: 1 },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 16,
      minHeight: 44,
      paddingHorizontal: 14,
      borderRadius: 22,
    },
    searchInput: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 10 },
    sectionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    sectionTitle: { fontSize: 17, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
    sectionCount: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
    card: {
      backgroundColor: colors.card,
      borderRadius: 18,
      padding: 16,
      marginBottom: 10,
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    code: { flex: 1, fontSize: 14, fontWeight: '700', color: colors.textSecondary },
    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
    badgeText: { fontSize: 12, fontWeight: '700' },
    cardTitle: { marginTop: 10, fontSize: 17, fontWeight: '700', color: colors.text, letterSpacing: -0.3, lineHeight: 22 },
    cardLine: { marginTop: 3, fontSize: 14, fontWeight: '500', color: colors.textSecondary },
    metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
    metaLabel: { fontSize: 12, fontWeight: '500', color: colors.textSecondary },
    metaValue: { marginTop: 2, fontSize: 14, fontWeight: '700', color: colors.text },
    footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14 },
    date: { fontSize: 13, color: colors.textSecondary },
    hint: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    hintText: { fontSize: 13, fontWeight: '600', color: colors.primary },
    empty: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 24 },
    emptyIcon: {
      width: 60,
      height: 60,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.05)',
    },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
    emptySub: { marginTop: 6, fontSize: 14, color: colors.textSecondary, textAlign: 'center' },
  });
