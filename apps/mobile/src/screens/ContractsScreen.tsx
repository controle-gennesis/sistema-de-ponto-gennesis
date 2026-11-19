import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, FileSignature, Search, X } from 'lucide-react-native';
import AppHeader from '../components/AppHeader';
import { useTheme } from '../context/ThemeContext';
import { contractBarColor, fetchContracts, type ContractListItem } from '../services/contracts';
import { brlCompact } from '../lib/formatMoney';
import type { RootStackParamList } from '../../App';

const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function monthYear(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${MONTHS_SHORT[d.getMonth()]}/${d.getFullYear()}`;
}

/** Quanto da vigência já passou (0–100). */
function vigenciaProgress(c: ContractListItem): number {
  const s = new Date(c.startDate).getTime();
  const e = new Date(c.endDate).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return 0;
  return Math.max(0, Math.min(100, ((Date.now() - s) / (e - s)) * 100));
}

export default function ContractsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const [search, setSearch] = useState('');

  const query = useQuery({
    queryKey: ['contracts-list'],
    queryFn: () => fetchContracts(),
    staleTime: 5 * 60_000,
  });

  const contracts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const all = query.data ?? [];
    if (!q) return all;
    return all.filter((c) => c.name.toLowerCase().includes(q) || c.number.toLowerCase().includes(q));
  }, [query.data, search]);

  return (
    <View style={styles.safe}>
      <AppHeader showBack title="Contratos" onBack={() => navigation.goBack()} />

      <FlatList
        data={contracts}
        keyExtractor={(c) => c.id}
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
            <Text style={styles.title}>Meus contratos</Text>
            <Text style={styles.subtitle}>Acompanhe meta, faturamento e saldo de cada contrato</Text>
            <View style={styles.searchBox}>
              <Search size={16} color={colors.textSecondary} strokeWidth={2} />
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar por nome ou número"
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
          </View>
        }
        ListEmptyComponent={
          query.isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
          ) : query.isError ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Não foi possível carregar</Text>
              <Text style={styles.emptySub}>Puxe a tela para tentar de novo.</Text>
            </View>
          ) : (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <FileSignature size={28} color={colors.textSecondary} strokeWidth={1.8} />
              </View>
              <Text style={styles.emptyTitle}>
                {search ? 'Nenhum contrato encontrado' : 'Nenhum contrato por aqui'}
              </Text>
              <Text style={styles.emptySub}>
                {search ? 'Tente outro nome ou número.' : 'Você ainda não tem contratos liberados.'}
              </Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const progress = vigenciaProgress(item);
          const valor = (item.valuePlusAddenda ?? 0) + (item.addendaTotal ?? 0);
          const barColor = contractBarColor(item);
          return (
            <TouchableOpacity
              style={styles.card}
              activeOpacity={0.8}
              onPress={() => navigation.navigate('ContratoResumo', { id: item.id, name: item.name })}
              accessibilityRole="button"
              accessibilityLabel={`Abrir resumo do contrato ${item.name}`}
            >
              <View style={styles.cardTop}>
                {barColor ? <View style={[styles.bar, { backgroundColor: barColor }]} /> : null}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <Text style={styles.cardNumber} numberOfLines={1}>
                    {item.number}
                  </Text>
                </View>
                <View style={{ justifyContent: 'center' }}>
                  <ChevronRight size={18} color={colors.textSecondary} strokeWidth={2.2} />
                </View>
              </View>

              <View style={styles.metaRow}>
                <View>
                  <Text style={styles.metaLabel}>Valor</Text>
                  <Text style={styles.metaValue}>{brlCompact(valor)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.metaLabel}>Vigência</Text>
                  <Text style={styles.metaValue}>
                    {monthYear(item.startDate)} – {monthYear(item.endDate)}
                  </Text>
                </View>
              </View>

              <View style={styles.track}>
                <View style={[styles.fill, { width: `${progress}%` }]} />
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const getStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.screenRoot },
    content: { paddingHorizontal: 20, paddingBottom: 40 },
    title: { marginTop: 14, fontSize: 32, fontWeight: '800', color: colors.text, letterSpacing: -0.9 },
    subtitle: { marginTop: 4, fontSize: 14, fontWeight: '500', color: colors.textSecondary },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 18,
      marginBottom: 16,
      minHeight: 48,
      paddingHorizontal: 14,
      borderRadius: 14,
      backgroundColor: isDark ? colors.card : colors.surface,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: isDark ? 'transparent' : 'rgba(15, 23, 42, 0.08)',
    },
    searchInput: { flex: 1, fontSize: 15, color: colors.text, paddingVertical: 10 },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      padding: 16,
      marginBottom: 12,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    cardTop: { flexDirection: 'row', alignItems: 'stretch', gap: 12 },
    // Barra de cor do contrato (igual à do site); só aparece nos contratos que têm cor.
    bar: { width: 6, borderRadius: 3, alignSelf: 'stretch' },
    cardTitle: { fontSize: 16, fontWeight: '700', color: colors.text, letterSpacing: -0.3, lineHeight: 21 },
    cardNumber: { marginTop: 2, fontSize: 13, fontWeight: '500', color: colors.textSecondary },
    metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16 },
    metaLabel: { fontSize: 12, fontWeight: '500', color: colors.textSecondary },
    metaValue: { marginTop: 2, fontSize: 14, fontWeight: '700', color: colors.text },
    track: {
      height: 4,
      borderRadius: 2,
      marginTop: 12,
      overflow: 'hidden',
      backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.07)',
    },
    fill: { height: 4, borderRadius: 2, backgroundColor: colors.primary },
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
