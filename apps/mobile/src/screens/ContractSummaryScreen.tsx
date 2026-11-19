import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react-native';
import AppHeader from '../components/AppHeader';
import { useTheme } from '../context/ThemeContext';
import { fetchContractOverview } from '../services/contracts';
import { brlCompact, brlFull, percent } from '../lib/formatMoney';
import type { RootStackParamList } from '../../App';

const MONTHS_FULL = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const GREEN = '#16a34a';
const CHART_H = 132;

export default function ContractSummaryScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute();
  const { id, name } = (route.params ?? {}) as { id: string; name?: string };
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [selMonth, setSelMonth] = useState<number | null>(null);

  const query = useQuery({
    queryKey: ['contract-overview', id, year],
    queryFn: () => fetchContractOverview(id, year),
    staleTime: 2 * 60_000,
    placeholderData: (prev) => prev,
  });
  const data = query.data;

  // Meses do ano que estão dentro da vigência do contrato: os outros não aparecem no gráfico.
  const vigenteIdx = useMemo(() => {
    if (!data) return [] as number[];
    const s = new Date(data.contract.startDate).getTime();
    const e = new Date(data.contract.endDate).getTime();
    const all = data.meses.map((_, i) => i);
    if (!Number.isFinite(s) || !Number.isFinite(e)) return all;
    return all.filter((i) => {
      const ini = new Date(year, i, 1).getTime();
      const fim = new Date(year, i + 1, 0, 23, 59, 59).getTime();
      return fim >= s && ini <= e;
    });
  }, [data, year]);

  // Mês aberto no destaque: o atual (ou o último já decorrido) e sempre dentro da vigência.
  useEffect(() => {
    if (!data || vigenteIdx.length === 0) return;
    setSelMonth((cur) => {
      if (cur != null && vigenteIdx.includes(cur)) return cur;
      const preferred = year === currentYear ? new Date().getMonth() : null;
      if (preferred != null && vigenteIdx.includes(preferred)) return preferred;
      const last = vigenteIdx.filter((i) => data.meses[i]?.decorrido).pop();
      if (last != null) return last;
      // o mês escolhido saiu da vigência: usa o mais próximo
      const ref = cur ?? vigenteIdx[0];
      return vigenteIdx.reduce((best, i) => (Math.abs(i - ref) < Math.abs(best - ref) ? i : best), vigenteIdx[0]);
    });
  }, [data, year, currentYear, vigenteIdx]);

  // Troca o ano mantendo o mês aberto: sem apagar o destaque, a tela não encolhe e não «abaixa» ao carregar.
  const changeYear = (delta: number) => {
    setYear((y) => y + delta);
  };

  const meses = data?.meses ?? [];
  const sel = selMonth != null ? meses[selMonth] : undefined;
  const metaPct = sel && sel.meta > 0 ? (sel.faturado / sel.meta) * 100 : 0;
  const maxV = Math.max(1, ...vigenteIdx.map((i) => Math.max(meses[i].faturado + meses[i].previsao, meses[i].meta)));

  // Comparação do mês aberto com o anterior.
  const prev =
    selMonth != null && selMonth > 0 && vigenteIdx.includes(selMonth - 1) ? meses[selMonth - 1] : undefined;
  const variacao =
    sel && prev
      ? prev.faturado > 0
        ? { pct: ((sel.faturado - prev.faturado) / prev.faturado) * 100, novo: false }
        : sel.faturado > 0
          ? { pct: 0, novo: true }
          : null
      : null;

  const faturadoPct = data && data.valorContratual > 0 ? (data.faturado / data.valorContratual) * 100 : 0;
  const aEmpenharPct = data && data.valorContratual > 0 ? (data.aEmpenhar / data.valorContratual) * 100 : 0;
  const osPct = data && data.osAtivas > 0 ? (data.osFinalizadas / data.osAtivas) * 100 : 0;

  const kpis = data
    ? [
        { label: 'Valor contratual', value: brlCompact(data.valorContratual), sub: 'com aditivos' },
        { label: 'Faturado', value: brlCompact(data.faturado), sub: `${percent(faturadoPct)} do contrato` },
        {
          label: 'Saldo de faturamento',
          value: brlCompact(data.saldoFaturamento),
          sub: `de ${brlCompact(data.empenhado)} empenhados`,
        },
        { label: 'A empenhar', value: brlCompact(data.aEmpenhar), sub: `${percent(aEmpenharPct)} sem empenho` },
      ]
    : [];

  return (
    <View style={styles.safe}>
      <AppHeader showBack title="Resumo do contrato" onBack={() => navigation.goBack()} />

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching && !query.isLoading}
            onRefresh={() => void query.refetch()}
            tintColor={colors.primary}
          />
        }
      >
        {/* identificação do contrato */}
        <View style={styles.identity}>
          <Text style={styles.title} numberOfLines={3}>
            {data?.contract.name ?? name ?? 'Contrato'}
          </Text>

          <View style={styles.chips}>
            {data ? (
              <View style={styles.codeChip}>
                <Text style={styles.codeText}>{data.contract.number}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.divider} />

          <View style={styles.yearRow}>
            <TouchableOpacity style={styles.yearBtn} onPress={() => changeYear(-1)} hitSlop={8} accessibilityLabel="Ano anterior">
              <ChevronLeft size={18} color={colors.text} strokeWidth={2.4} />
            </TouchableOpacity>
            <View style={styles.yearCenter}>
              <Text style={styles.yearLabel}>Ano de referência</Text>
              <Text style={styles.yearText}>{year}</Text>
            </View>
            <TouchableOpacity style={styles.yearBtn} onPress={() => changeYear(1)} hitSlop={8} accessibilityLabel="Próximo ano">
              <ChevronRight size={18} color={colors.text} strokeWidth={2.4} />
            </TouchableOpacity>
          </View>
        </View>

        {query.isLoading && !data ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 48 }} />
        ) : query.isError && !data ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>Não foi possível carregar o resumo</Text>
            <Text style={styles.errorSub}>
              {(query.error as Error)?.message || 'Puxe a tela para tentar de novo.'}
            </Text>
          </View>
        ) : data ? (
          <View style={query.isPlaceholderData ? { opacity: 0.55 } : undefined}>
            {/* destaque do mês escolhido */}
            <View style={styles.hero}>
              <Text style={styles.heroLabel}>
                Faturamento de {sel && selMonth != null ? MONTHS_FULL[selMonth] : '—'}
              </Text>
              <Text style={styles.heroValue}>{brlFull(sel?.faturado ?? 0)}</Text>

              {variacao && selMonth != null ? (
                <View style={styles.deltaPill}>
                  {variacao.novo ? null : variacao.pct >= 0 ? (
                    <ArrowUpRight size={14} color="#fff" strokeWidth={2.6} />
                  ) : (
                    <ArrowDownRight size={14} color="#fff" strokeWidth={2.6} />
                  )}
                  <Text style={styles.deltaText}>
                    {variacao.novo
                      ? `Sem faturamento em ${MONTHS_FULL[selMonth - 1]}`
                      : `${percent(Math.abs(variacao.pct))} ${variacao.pct >= 0 ? 'acima' : 'abaixo'} de ${MONTHS_FULL[selMonth - 1]}`}
                  </Text>
                </View>
              ) : null}

              {sel && sel.meta > 0 ? (
                <>
                  <View style={styles.heroTrack}>
                    <View style={[styles.heroFill, { width: `${Math.min(100, metaPct)}%` }]} />
                  </View>
                  <View style={styles.heroRow}>
                    <Text style={styles.heroSmall}>{percent(metaPct)} da meta</Text>
                    <Text style={styles.heroSmall}>Meta {brlCompact(sel.meta)}</Text>
                  </View>
                </>
              ) : (
                <Text style={[styles.heroSmall, { marginTop: 12 }]}>Sem meta definida para este mês</Text>
              )}

              {sel && sel.previsao > 0 ? (
                <View style={styles.heroPill}>
                  <Text style={styles.heroPillText}>Previsão a faturar · {brlCompact(sel.previsao)}</Text>
                </View>
              ) : null}
            </View>

            {/* indicadores */}
            <View style={styles.grid}>
              {kpis.map((k) => (
                <View key={k.label} style={styles.kpi}>
                  <Text style={styles.kpiLabel} numberOfLines={1}>
                    {k.label}
                  </Text>
                  <Text style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit>
                    {k.value}
                  </Text>
                  <Text style={styles.kpiSub} numberOfLines={2}>
                    {k.sub}
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.block}>
              <View style={styles.blockHead}>
                <Text style={styles.blockTitle}>OS finalizadas</Text>
                <Text style={styles.wideValue}>
                  {data.osFinalizadas}
                  <Text style={styles.wideOf}> de {data.osAtivas}</Text>
                </Text>
              </View>
              <View style={styles.track}>
                <View style={[styles.fill, { width: `${Math.min(100, osPct)}%` }]} />
              </View>
              <Text style={[styles.kpiSub, { marginTop: 8 }]}>{percent(osPct)} das ordens de serviço ativas</Text>
            </View>

            {/* gráfico mensal */}
            <View style={styles.block}>
              <Text style={styles.blockTitle}>Faturamento por mês × meta</Text>
              <View style={styles.legend}>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
                  <Text style={styles.legendText}>Faturado</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={styles.legendTick} />
                  <Text style={styles.legendText}>Meta</Text>
                </View>
                <View style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: colors.primary, opacity: 0.3 }]} />
                  <Text style={styles.legendText}>Previsão</Text>
                </View>
              </View>

              <View style={styles.chart}>
                {vigenteIdx.map((i) => {
                  const m = meses[i];
                  const hFat = (m.faturado / maxV) * CHART_H;
                  const hPrev = (m.previsao / maxV) * CHART_H;
                  const metaBottom = (m.meta / maxV) * CHART_H;
                  const bateu = m.meta > 0 && m.faturado >= m.meta;
                  const active = i === selMonth;
                  return (
                    <Pressable
                      key={`${m.label}-${i}`}
                      style={[styles.col, active && styles.colActive]}
                      onPress={() => setSelMonth(i)}
                      accessibilityLabel={`${MONTHS_FULL[i]}: faturado ${brlFull(m.faturado)}`}
                    >
                      <View style={styles.barArea}>
                        {m.meta > 0 ? <View style={[styles.metaTick, { bottom: metaBottom }]} /> : null}
                        {m.decorrido ? (
                          <View style={styles.stack}>
                            {hPrev > 0 ? (
                              <View
                                style={[
                                  styles.bar,
                                  { height: hPrev, backgroundColor: colors.primary, opacity: 0.3 },
                                ]}
                              />
                            ) : null}
                            <View
                              style={[
                                styles.bar,
                                {
                                  height: Math.max(hFat, m.faturado > 0 ? 3 : 0),
                                  backgroundColor: bateu ? GREEN : colors.primary,
                                },
                              ]}
                            />
                          </View>
                        ) : null}
                      </View>
                      <Text style={[styles.monthLabel, active && styles.monthLabelActive]}>
                        {m.label.slice(0, 3)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {sel && selMonth != null ? (
                <View style={styles.detail}>
                  <Text style={styles.detailTitle}>{MONTHS_FULL[selMonth]}</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Faturado</Text>
                    <Text style={styles.detailValue}>{brlFull(sel.faturado)}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Meta</Text>
                    <Text style={styles.detailValue}>{sel.meta > 0 ? brlFull(sel.meta) : 'Sem meta'}</Text>
                  </View>
                  {sel.previsao > 0 ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Previsão a faturar</Text>
                      <Text style={styles.detailValue}>{brlFull(sel.previsao)}</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>

            <Text style={styles.foot}>
              Valores calculados pelo sistema, com as mesmas regras da versão web.
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const getStyles = (colors: any, isDark: boolean) => {
  const soft = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.07)';
  const card = {
    backgroundColor: colors.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  };
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.screenRoot },
    content: { paddingHorizontal: 20, paddingBottom: 48 },

    // identificação
    // Sem fundo e sem borda: o topo fica solto na tela.
    identity: { marginTop: 12, paddingTop: 10, paddingBottom: 6, paddingHorizontal: 4 },
    title: {
      fontSize: 28,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: -0.8,
      lineHeight: 33,
      textAlign: 'center',
    },
    chips: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 12 },
    codeChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: soft },
    codeText: { fontSize: 13, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'], letterSpacing: 0.2 },
    statusChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: soft,
    },
    statusDot: { width: 7, height: 7, borderRadius: 4 },
    statusText: { fontSize: 13, fontWeight: '700' },
    divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginTop: 18, marginBottom: 14 },
    yearRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    yearBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? colors.card : colors.background,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: isDark ? 'transparent' : 'rgba(15, 23, 42, 0.1)',
    },
    yearCenter: { alignItems: 'center' },
    yearLabel: { fontSize: 11, fontWeight: '600', color: colors.textSecondary, letterSpacing: 0.3, textTransform: 'uppercase' },
    yearText: { marginTop: 1, fontSize: 22, fontWeight: '800', color: colors.text, letterSpacing: -0.5, fontVariant: ['tabular-nums'] },

    errorBox: { marginTop: 40, alignItems: 'center', paddingHorizontal: 16 },
    errorTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
    errorSub: { marginTop: 6, fontSize: 14, color: colors.textSecondary, textAlign: 'center' },

    // destaque
    hero: { marginTop: 14, backgroundColor: colors.primary, borderRadius: 26, padding: 20 },
    heroLabel: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.8)' },
    heroValue: {
      marginTop: 6,
      fontSize: 34,
      fontWeight: '700',
      color: '#fff',
      letterSpacing: -1,
      fontVariant: ['tabular-nums'],
    },
    deltaPill: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 10,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.2)',
    },
    deltaText: { fontSize: 12, fontWeight: '700', color: '#fff' },
    heroTrack: {
      height: 6,
      borderRadius: 3,
      marginTop: 16,
      overflow: 'hidden',
      backgroundColor: 'rgba(255,255,255,0.25)',
    },
    heroFill: { height: 6, borderRadius: 3, backgroundColor: '#fff' },
    heroRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
    heroSmall: { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.88)' },
    heroPill: {
      alignSelf: 'flex-start',
      marginTop: 14,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: 'rgba(255,255,255,0.2)',
    },
    heroPillText: { fontSize: 13, fontWeight: '700', color: '#fff' },

    // indicadores
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
    kpi: { ...card, width: '48.4%', minHeight: 118, borderRadius: 20, padding: 14, justifyContent: 'space-between' },
    kpiLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
    kpiValue: { marginTop: 6, fontSize: 22, fontWeight: '700', color: colors.text, letterSpacing: -0.5 },
    kpiSub: { marginTop: 4, fontSize: 12, fontWeight: '500', color: colors.textSecondary },

    // blocos
    block: { ...card, marginTop: 14, borderRadius: 22, padding: 16 },
    blockHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 10 },
    blockTitle: { fontSize: 16, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
    blockHint: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
    badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
    badgeText: { fontSize: 12, fontWeight: '800' },
    statRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
    stat: { flex: 1 },
    statLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
    statValue: { marginTop: 3, fontSize: 18, fontWeight: '700', color: colors.text, letterSpacing: -0.4 },
    statFooter: {
      marginTop: 2,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      gap: 4,
    },
    statFooterText: { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
    datesRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 12 },
    dateLabel: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
    dateValue: { marginTop: 2, fontSize: 14, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
    datePct: { fontSize: 12, fontWeight: '700', color: colors.primary },
    wideValue: { fontSize: 22, fontWeight: '700', color: colors.text },
    wideOf: { fontSize: 14, fontWeight: '500', color: colors.textSecondary },
    track: { height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: soft },
    fill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },

    // gráfico
    legend: { flexDirection: 'row', gap: 14, marginTop: 8, marginBottom: 14 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 8, height: 8, borderRadius: 4 },
    legendTick: { width: 12, height: 2, borderRadius: 1, backgroundColor: colors.textSecondary },
    legendText: { fontSize: 12, fontWeight: '500', color: colors.textSecondary },
    chart: { flexDirection: 'row', alignItems: 'flex-end' },
    col: { flex: 1, alignItems: 'center', paddingBottom: 6, borderRadius: 10 },
    colActive: { backgroundColor: isDark ? 'rgba(206,55,54,0.16)' : 'rgba(206,55,54,0.07)' },
    barArea: { height: CHART_H, width: '100%', justifyContent: 'flex-end', alignItems: 'center' },
    stack: { alignItems: 'center', justifyContent: 'flex-end' },
    bar: { width: 12, borderRadius: 4 },
    metaTick: {
      position: 'absolute',
      width: '78%',
      height: 2,
      borderRadius: 1,
      backgroundColor: colors.textSecondary,
      opacity: 0.8,
    },
    monthLabel: { marginTop: 6, fontSize: 10, fontWeight: '600', color: colors.textSecondary },
    monthLabelActive: { color: colors.text },
    detail: {
      marginTop: 14,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
    },
    detailTitle: { fontSize: 14, fontWeight: '700', color: colors.text, marginBottom: 6 },
    detailRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
    detailLabel: { fontSize: 14, color: colors.textSecondary },
    detailValue: { fontSize: 14, fontWeight: '700', color: colors.text, fontVariant: ['tabular-nums'] },
    foot: { marginTop: 16, fontSize: 12, color: colors.textSecondary, textAlign: 'center' },
  });
};
