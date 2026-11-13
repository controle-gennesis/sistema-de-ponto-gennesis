import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  BookOpen,
  CalendarDays,
  ChevronRight,
  Filter,
  Plus,
  Search,
  X,
} from 'lucide-react-native';
import AppHeader from '../../components/AppHeader';
import RdoFilterSheet, {
  EMPTY_RDO_FILTERS,
  RDO_STATUS_OPTIONS,
  type RdoFilters,
} from '../../components/diarioObra/RdoFilterSheet';
import RdoNewSheet from '../../components/diarioObra/RdoNewSheet';
import { useTheme } from '../../context/ThemeContext';
import {
  MONTH_SHORT,
  WEEKDAY_SHORT,
  fetchObras,
  fetchRdoList,
  parseIso,
  shiftIso,
  todayIso,
  type ObraOption,
  type RdoListItem,
} from '../../services/diarioObra';

type StatusKey = 'DRAFT' | 'FINAL' | 'NONE';

const statusOf = (r: RdoListItem): StatusKey => (r.noActivity ? 'NONE' : r.finalizedAt ? 'FINAL' : 'DRAFT');

const STATUS_LABEL: Record<StatusKey, string> = {
  DRAFT: 'Em preenchimento',
  FINAL: 'Finalizado',
  NONE: 'Sem atividade',
};

const HEADING: Record<RdoFilters['status'], string> = {
  all: 'Diários de Obra',
  DRAFT: 'Em preenchimento',
  FINAL: 'Finalizados',
  NONE: 'Sem atividade',
};

/** Quantos dias para trás aparecem na faixa de dias (contando hoje). */
const DAYS_BACK = 14;

/** Lista de diários de obra (RDO) das obras que a pessoa pode ver, no mesmo formato das outras listas do app. */
export default function DiarioObraListScreen() {
  const navigation = useNavigation<any>();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filters, setFilters] = useState<RdoFilters>(EMPTY_RDO_FILTERS);
  const [filterOpen, setFilterOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 400);
    return () => clearTimeout(t);
  }, [search]);

  const query = useInfiniteQuery({
    queryKey: ['diario-obra-list', debounced, filters.from, filters.to, filters.contratoId, filters.obraId],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      fetchRdoList({
        page: pageParam as number,
        search: debounced,
        from: filters.from,
        to: filters.to,
        contratoId: filters.contratoId,
        obraId: filters.obraId,
      }),
    getNextPageParam: (last, all) => (all.length < last.totalPages ? all.length + 1 : undefined),
    staleTime: 30_000,
  });

  // Voltando do editor, a lista reflete o que foi salvo/finalizado.
  useFocusEffect(
    useCallback(() => {
      void query.refetch();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const items = useMemo(() => (query.data?.pages ?? []).flatMap((p) => p.items), [query.data]);

  const filtered = useMemo(
    () => (filters.status === 'all' ? items : items.filter((r) => statusOf(r) === filters.status)),
    [items, filters.status],
  );

  // Nomes do contrato e da obra escolhidos (a lista de obras é a mesma da folha de filtros).
  const { data: obrasData } = useQuery({
    queryKey: ['diario-obra-obras'],
    queryFn: fetchObras,
    staleTime: 5 * 60 * 1000,
  });
  const contratoNome = useMemo(() => {
    const o = (obrasData ?? []).find((x) => x.contratoId === filters.contratoId);
    return o ? (o.contratoNome ?? o.contrato?.name ?? '') : '';
  }, [obrasData, filters.contratoId]);
  const obraNome = (obrasData ?? []).find((x) => x.id === filters.obraId)?.name ?? '';

  // Faixa de dias: hoje e os dias anteriores, para escolher o dia com um toque.
  const today = todayIso();
  const days = useMemo(() => {
    const list: Array<{ iso: string; label: string }> = [];
    for (let i = 0; i < DAYS_BACK; i++) {
      const iso = shiftIso(today, -i);
      const d = parseIso(iso);
      list.push({
        iso,
        label: i === 0 ? 'Hoje' : i === 1 ? 'Ontem' : `${WEEKDAY_SHORT[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}`,
      });
    }
    return list;
  }, [today]);

  const selectedDay = filters.from && filters.from === filters.to ? filters.from : '';
  const outsideStrip = selectedDay && !days.some((d) => d.iso === selectedDay) ? selectedDay : '';
  const noDayFilter = !filters.from && !filters.to;
  const customRange = !!(filters.from || filters.to) && !selectedDay;
  const filtersActive = !!(filters.status !== 'all' || filters.contratoId || filters.obraId || customRange);

  const pickDay = (iso: string) => setFilters((f) => ({ ...f, from: iso, to: iso }));
  const clearDay = () => setFilters((f) => ({ ...f, from: '', to: '' }));

  const openEditor = (p: { obraId: string; date: string; obraName?: string; contratoName?: string }) =>
    navigation.navigate('DiarioObraEditor', p);

  const onNew = (obra: ObraOption, date: string) => {
    setNewOpen(false);
    openEditor({
      obraId: obra.id,
      date,
      obraName: obra.name,
      contratoName: obra.contratoNome ?? obra.contrato?.name ?? '',
    });
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await query.refetch();
    } finally {
      setRefreshing(false);
    }
  };


  // A cor da data mostra a situação: amarelo = em preenchimento, verde = finalizado, cinza = sem atividade.
  const dateBg = (k: StatusKey) =>
    k === 'FINAL' ? styles.dateBgFinal : k === 'NONE' ? styles.dateBgNone : styles.dateBgDraft;
  const dateFg = (k: StatusKey) =>
    k === 'FINAL' ? styles.dateFgFinal : k === 'NONE' ? styles.dateFgNone : styles.dateFgDraft;

  const renderItem = ({ item }: { item: RdoListItem }) => {
    const d = parseIso(item.date);
    const status = statusOf(item);
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.75}
        onPress={() =>
          openEditor({
            obraId: item.obraId,
            date: item.date,
            obraName: item.obraName,
            contratoName: item.contratoName,
          })
        }
        accessibilityRole="button"
        accessibilityLabel={`Diário de ${item.obraName}, ${item.date}, ${STATUS_LABEL[status]}`}
      >
        <View style={styles.cardTop}>
          <View style={[styles.dateBlock, dateBg(status)]}>
            <Text style={[styles.dateDay, dateFg(status)]}>{String(d.getDate()).padStart(2, '0')}</Text>
            <Text style={[styles.dateMonth, dateFg(status)]}>{MONTH_SHORT[d.getMonth()]}</Text>
          </View>

          <View style={styles.cardMain}>
            <Text style={styles.cardTitle} numberOfLines={2}>
              {item.obraName || 'Obra'}
            </Text>
            {item.contratoName ? (
              <Text style={styles.cardSub} numberOfLines={1}>
                {item.contratoName}
              </Text>
            ) : null}
          </View>

          <ChevronRight size={18} color={colors.textSecondary} strokeWidth={2.2} />
        </View>

        <View style={styles.divider} />

        {status === 'NONE' ? (
          <Text style={styles.reason} numberOfLines={2}>
            {item.noActivityReason || 'Dia sem atividade'}
          </Text>
        ) : (
          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statNumber}>{item.activities}</Text>
              <Text style={styles.statLabel}>Atividades</Text>
            </View>
            <View style={styles.statSep} />
            <View style={styles.stat}>
              <Text style={styles.statNumber}>{item.workers}</Text>
              <Text style={styles.statLabel}>Equipe</Text>
            </View>
            <View style={styles.statSep} />
            <View style={styles.stat}>
              <Text style={[styles.statNumber, item.occurrences > 0 && { color: '#d97706' }]}>
                {item.occurrences}
              </Text>
              <Text style={styles.statLabel}>Ocorrências</Text>
            </View>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const header = (
    <View>
      <Text style={styles.pageTitle}>Diários de Obra</Text>
      <Text style={styles.pageSubtitle}>Registre o dia a dia das obras</Text>

      <FlatList
        horizontal
        data={[{ iso: '', label: 'Todos os dias' }, ...(outsideStrip ? [{ iso: outsideStrip, label: outsideStrip.split('-').reverse().slice(0, 2).join('/') }] : []), ...days]}
        keyExtractor={(d) => d.iso || 'all'}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipsRow}
        ListFooterComponent={
          <TouchableOpacity
            onPress={() => setFilterOpen(true)}
            style={styles.chip}
            activeOpacity={0.7}
            accessibilityLabel="Escolher outro dia"
          >
            <CalendarDays size={14} color={colors.textSecondary} strokeWidth={2.2} />
            <Text style={styles.chipText}>Outro dia</Text>
          </TouchableOpacity>
        }
        renderItem={({ item: d }) => {
          const active = d.iso ? selectedDay === d.iso : noDayFilter;
          return (
            <TouchableOpacity
              onPress={() => (d.iso ? pickDay(d.iso) : clearDay())}
              style={[styles.chip, active && styles.chipActive, { marginRight: 8 }]}
              activeOpacity={0.7}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]}>{d.label}</Text>
            </TouchableOpacity>
          );
        }}
      />

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Search size={16} color={colors.textSecondary} strokeWidth={2} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar obra ou contrato..."
            placeholderTextColor={colors.textSecondary}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            autoCorrect={false}
          />
          {search.length > 0 ? (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={8} accessibilityLabel="Limpar busca">
              <X size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>
        <TouchableOpacity
          style={[styles.filterBtn, filtersActive && styles.filterBtnActive]}
          onPress={() => setFilterOpen(true)}
          activeOpacity={0.75}
          accessibilityLabel="Filtros"
        >
          <Filter size={18} color={filtersActive ? '#fff' : colors.primary} strokeWidth={2.2} />
          {filtersActive ? <View style={styles.filterDot} /> : null}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.newBtn}
          activeOpacity={0.85}
          onPress={() => setNewOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Novo Diário de Obra"
        >
          <Plus size={22} color="#fff" strokeWidth={2.5} />
        </TouchableOpacity>
      </View>

      {filters.status !== 'all' || filters.contratoId || filters.obraId ? (
        <View style={styles.activeFilters}>
          {filters.status !== 'all' ? (
            <TouchableOpacity
              style={styles.activeChip}
              activeOpacity={0.75}
              onPress={() => setFilters((f) => ({ ...f, status: 'all' }))}
              accessibilityLabel="Remover filtro de situação"
            >
              <Text style={styles.activeChipText} numberOfLines={1}>
                {RDO_STATUS_OPTIONS.find((o) => o.key === filters.status)?.label}
              </Text>
              <X size={14} color={colors.primary} strokeWidth={2.6} />
            </TouchableOpacity>
          ) : null}
          {filters.contratoId ? (
            <TouchableOpacity
              style={styles.activeChip}
              activeOpacity={0.75}
              onPress={() => setFilters((f) => ({ ...f, contratoId: '', obraId: '' }))}
              accessibilityLabel="Remover filtro de contrato"
            >
              <Text style={styles.activeChipText} numberOfLines={1}>
                {contratoNome || 'Contrato'}
              </Text>
              <X size={14} color={colors.primary} strokeWidth={2.6} />
            </TouchableOpacity>
          ) : null}
          {filters.obraId ? (
            <TouchableOpacity
              style={styles.activeChip}
              activeOpacity={0.75}
              onPress={() => setFilters((f) => ({ ...f, obraId: '' }))}
              accessibilityLabel="Remover filtro de obra"
            >
              <Text style={styles.activeChipText} numberOfLines={1}>
                {obraNome || 'Obra'}
              </Text>
              <X size={14} color={colors.primary} strokeWidth={2.6} />
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}

      <View style={styles.listHeader}>
        <Text style={styles.listHeading}>{HEADING[filters.status]}</Text>
        <Text style={styles.listHeadingMeta}>{filtered.length}</Text>
      </View>
    </View>
  );

  return (
    <View style={styles.safeArea}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AppHeader showBack title="Diários de Obra" onBack={() => navigation.goBack()} />

      <FlatList
        data={filtered}
        keyExtractor={(r) => r.id}
        renderItem={renderItem}
        ListHeaderComponent={header}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        ListEmptyComponent={
          query.isLoading ? (
            <ActivityIndicator style={{ marginTop: 24 }} color={colors.primary} />
          ) : query.isError ? (
            <TouchableOpacity style={styles.empty} onPress={() => void query.refetch()} activeOpacity={0.7}>
              <Text style={styles.emptyTitle}>Não foi possível carregar</Text>
              <Text style={styles.emptyText}>Toque para tentar de novo.</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <BookOpen size={28} color={colors.textSecondary} />
              </View>
              <Text style={styles.emptyTitle}>
                {debounced || !noDayFilter || filtersActive ? 'Nenhum diário encontrado' : 'Nenhum diário ainda'}
              </Text>
              <Text style={styles.emptyText}>
                {debounced || !noDayFilter || filtersActive
                  ? 'Ajuste a busca ou os filtros.'
                  : 'Toque no + para registrar o primeiro diário de obra.'}
              </Text>
            </View>
          )
        }
        ListFooterComponent={
          <>{query.isFetchingNextPage ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} /> : null}</>
        }
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
      />

      <RdoFilterSheet
        visible={filterOpen}
        value={filters}
        onClose={() => setFilterOpen(false)}
        onApply={(f) => {
          setFilters(f);
          setFilterOpen(false);
        }}
      />

      <RdoNewSheet visible={newOpen} onClose={() => setNewOpen(false)} onConfirm={onNew} />
    </View>
  );
}

function getStyles(colors: any, isDark: boolean) {
  const line = isDark ? 'transparent' : 'rgba(15, 23, 42, 0.08)';
  const fieldBg = isDark ? colors.card : colors.surface;
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.screenRoot },
    content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },
    pageTitle: { color: colors.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.6, marginBottom: 4 },
    pageSubtitle: { color: colors.textSecondary, fontSize: 14, fontWeight: '500', marginBottom: 18 },

    chipsRow: { gap: 8, paddingBottom: 12 },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 999,
      backgroundColor: fieldBg,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: line,
    },
    chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    chipText: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
    chipTextActive: { color: '#fff' },
    chipCount: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, opacity: 0.7 },
    chipCountActive: { color: 'rgba(255,255,255,0.85)', opacity: 1 },

    searchRow: { flexDirection: 'row', alignItems: 'stretch', gap: 10, marginBottom: 16 },
    searchBox: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: fieldBg,
      borderRadius: 14,
      paddingHorizontal: 14,
      minHeight: 48,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: line,
    },
    searchInput: {
      flex: 1,
      paddingVertical: Platform.OS === 'ios' ? 12 : 8,
      color: colors.text,
      fontSize: 15,
    },
    filterBtn: {
      width: 48,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'stretch',
      backgroundColor: fieldBg,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: line,
    },
    filterBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    filterDot: {
      position: 'absolute',
      top: 10,
      right: 10,
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor: '#fff',
    },
    newBtn: {
      width: 48,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'stretch',
      backgroundColor: colors.primary,
    },

    listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    listHeading: { fontSize: 17, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
    listHeadingMeta: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },

    card: {
      backgroundColor: colors.card,
      borderRadius: 18,
      overflow: 'hidden',
    },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
    dateBlock: {
      width: 54,
      height: 62,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dateBgDraft: { backgroundColor: 'rgba(245, 158, 11, 0.16)' },
    dateBgFinal: { backgroundColor: 'rgba(34, 197, 94, 0.16)' },
    dateBgNone: { backgroundColor: 'rgba(239, 68, 68, 0.16)' },
    dateFgDraft: { color: isDark ? '#fbbf24' : '#b45309' },
    dateFgFinal: { color: isDark ? '#4ade80' : '#15803d' },
    dateFgNone: { color: isDark ? '#f87171' : '#b91c1c' },
    dateDay: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5, lineHeight: 26 },
    dateMonth: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
    cardMain: { flex: 1, minWidth: 0, alignItems: 'flex-start' },
    cardTitle: { fontSize: 16, fontWeight: '700', letterSpacing: -0.3, color: colors.text },
    cardSub: { marginTop: 2, fontSize: 12, fontWeight: '500', color: colors.textSecondary },

    divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
    stats: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
    stat: { flex: 1, alignItems: 'center', gap: 2 },
    statSep: { width: StyleSheet.hairlineWidth, height: 38, backgroundColor: colors.border },
    statNumber: { fontSize: 17, fontWeight: '800', letterSpacing: -0.3, color: colors.text, fontVariant: ['tabular-nums'] },
    statLabel: { fontSize: 11, fontWeight: '600', color: colors.textSecondary },
    reason: { paddingHorizontal: 16, paddingVertical: 14, fontSize: 13, fontWeight: '600', lineHeight: 18, color: colors.textSecondary },

    empty: { alignItems: 'center', paddingVertical: 56, gap: 8, paddingHorizontal: 24 },
    emptyIcon: {
      width: 56,
      height: 56,
      borderRadius: 16,
      backgroundColor: fieldBg,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
    emptyText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },

    activeFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
    activeChip: {
      maxWidth: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: `${colors.primary}14`,
    },
    activeChipText: { flexShrink: 1, fontSize: 13, fontWeight: '700', color: colors.primary },
  });
}
