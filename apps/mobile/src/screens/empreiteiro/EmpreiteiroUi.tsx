import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, StatusBar, Image, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, HardHat, LogOut, Moon, Plus, Search, Sun, X } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import { resolveMediaUrl } from '../../utils/resolveMediaUrl';

export type Tone = 'info' | 'ok' | 'warn' | 'bad' | 'neutral';

const TONES: Record<Tone, { bg: string; fg: string }> = {
  info: { bg: '#dbeafe', fg: '#1e40af' },
  ok: { bg: '#dcfce7', fg: '#166534' },
  warn: { bg: '#fef3c7', fg: '#92400e' },
  bad: { bg: '#fee2e2', fg: '#991b1b' },
  neutral: { bg: '#e5e7eb', fg: '#374151' },
};

export function Badge({ label, tone }: { label: string; tone: Tone }) {
  const t = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]}>
      <Text style={[styles.badgeText, { color: t.fg }]}>{label}</Text>
    </View>
  );
}

/** Estilo de card igual ao da Home do app (superfície, cantos 20, borda fina e sombra leve). */
export function useCardStyle() {
  const { colors, isDark } = useTheme();
  return {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
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
  } as const;
}

/** Topo no padrão do app: fundo transparente, logo da Gennesis (ou voltar + título nas telas internas). */
export function EmpreiteiroHeader({ title, onBack }: { title: string; onBack?: () => void }) {
  const { colors, toggleTheme, isDark } = useTheme();
  const { logout } = useAuth();
  const insets = useSafeAreaInsets();
  const top =
    (Platform.OS === 'android' ? (insets.top > 0 ? insets.top : StatusBar.currentHeight ?? 24) : insets.top) +
    (Platform.OS === 'ios' ? 6 : 2);
  return (
    <View style={[styles.header, { paddingTop: top }]}>
      <View style={styles.headerSide}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} hitSlop={8} accessibilityLabel="Voltar" style={styles.iconBtn}>
            <ArrowLeft size={24} color={colors.text} strokeWidth={2.2} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity onPress={toggleTheme} hitSlop={8} accessibilityLabel="Alternar tema" style={styles.iconBtn}>
            {isDark ? <Sun size={22} color={colors.text} /> : <Moon size={22} color={colors.text} />}
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.headerCenter} pointerEvents="none">
        {onBack ? (
          <Text numberOfLines={1} style={[styles.headerTitle, { color: colors.text }]}>
            {title}
          </Text>
        ) : (
          <Image
            key={isDark ? 'logo-dark' : 'logo-light'}
            source={isDark ? require('../../../assets/logobrancavermelha.png') : require('../../../assets/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        )}
      </View>
      <View style={[styles.headerSide, { alignItems: 'flex-end' }]}>
        {!onBack ? (
          <TouchableOpacity onPress={() => void logout()} hitSlop={8} accessibilityLabel="Sair" style={styles.iconBtn}>
            <LogOut size={22} color={colors.text} />
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

/** Abas com sublinhado, como na versão web. */
export function UnderlineTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: Array<{ id: T; label: string }>;
  value: T;
  onChange: (id: T) => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={[styles.tabs, { borderBottomColor: colors.border }]}>
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <TouchableOpacity key={tab.id} onPress={() => onChange(tab.id)} style={styles.tab} activeOpacity={0.7}>
            <Text style={[styles.tabText, { color: active ? colors.primary : colors.textSecondary }]}>{tab.label}</Text>
            <View style={[styles.tabLine, { backgroundColor: active ? colors.primary : 'transparent' }]} />
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

type KpiItem = { label: string; value: string };

export function KpiRow({ items, grid = false }: { items: KpiItem[]; grid?: boolean }) {
  const { colors } = useTheme();
  const cardBox = useCardStyle();
  return (
    <View style={[styles.kpiRow, grid && { flexWrap: 'wrap' }]}>
      {items.map((it) => (
        <View
          key={it.label}
          style={[styles.kpiCard, cardBox, styles.semSombra, grid && { flexGrow: 0, flexBasis: '48%', flexShrink: 0 }]}
        >
          <Text style={[styles.kpiLabel, { color: colors.textSecondary }]} numberOfLines={1}>
            {it.label}
          </Text>
          <Text style={[styles.kpiValue, { color: colors.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {it.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

type ResumoItem = { label: string; value: string };

/** Valor, pago e saldo num cartão só (com divisórias) e o executado como barra de progresso. */
export function SummaryCard({
  items,
  progress,
  progressLabel,
}: {
  items: ResumoItem[];
  /** 0–100, ou null quando não dá para calcular. */
  progress: number | null;
  progressLabel: string;
}) {
  const { colors, isDark } = useTheme();
  const cardBox = useCardStyle();
  const linha = isDark ? colors.border : 'rgba(15,23,42,0.08)';
  return (
    <View style={[cardBox, styles.semSombra, styles.summary]}>
      <View style={styles.summaryRow}>
        {items.map((it, i) => (
          <React.Fragment key={it.label}>
            {i > 0 ? <View style={[styles.summaryDivider, { backgroundColor: linha }]} /> : null}
            <View style={styles.summaryCell}>
              <Text style={[styles.kpiLabel, { color: colors.textSecondary }]} numberOfLines={1}>
                {it.label}
              </Text>
              <Text
                style={[styles.summaryValue, { color: colors.text }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {it.value}
              </Text>
            </View>
          </React.Fragment>
        ))}
      </View>
      <View style={styles.progressHead}>
        <Text style={[styles.kpiLabel, { color: colors.textSecondary }]}>Executado</Text>
        <Text style={[styles.progressValue, { color: colors.text }]}>{progressLabel}</Text>
      </View>
      <View style={[styles.progressTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#eef0f3' }]}>
        <View
          style={[
            styles.progressFill,
            { backgroundColor: colors.primary, width: `${Math.max(0, Math.min(100, progress ?? 0))}%` },
          ]}
        />
      </View>
    </View>
  );
}

export function Avatar({ uri, size = 64 }: { uri?: string | null; size?: number }) {
  const { colors } = useTheme();
  const src = resolveMediaUrl(uri);
  const { isDark } = useTheme();
  return src ? (
    <Image source={{ uri: src }} style={{ width: size, height: size, borderRadius: size / 2 }} />
  ) : (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : '#f3f4f6',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <HardHat size={Math.round(size * 0.46)} color={isDark ? '#9ca3af' : '#9ca3af'} strokeWidth={1.9} />
    </View>
  );
}

/** Linha de busca + botão "+" vermelho, igual às listas do app (Reservas, Abastecimento...). */
export function ListToolbar({
  value,
  onChange,
  placeholder,
  onAdd,
  addLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onAdd: () => void;
  addLabel: string;
}) {
  const { colors, isDark } = useTheme();
  return (
    <View style={styles.toolbar}>
      <View
        style={[
          styles.searchBox,
          {
            backgroundColor: isDark ? colors.card : colors.surface,
            borderColor: isDark ? 'transparent' : 'rgba(15, 23, 42, 0.08)',
          },
        ]}
      >
        <Search size={16} color={colors.textSecondary} strokeWidth={2} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder={placeholder}
          placeholderTextColor={colors.textSecondary}
          value={value}
          onChangeText={onChange}
          returnKeyType="search"
        />
        {value.length > 0 ? (
          <TouchableOpacity onPress={() => onChange('')} hitSlop={8}>
            <X size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : null}
      </View>
      <TouchableOpacity
        style={[styles.addBtn, { backgroundColor: colors.primary }]}
        onPress={onAdd}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={addLabel}
      >
        <Plus size={22} color="#fff" strokeWidth={2.5} />
      </TouchableOpacity>
    </View>
  );
}

/** Título da lista com a contagem à direita ("Minhas Reservas  0"). */
export function ListHeading({ title, count }: { title: string; count: number }) {
  const { colors, isDark } = useTheme();
  return (
    <View style={styles.listHeader}>
      <Text style={[styles.listHeading, { color: colors.text }]}>{title}</Text>
      <View style={[styles.listCountPill, { backgroundColor: isDark ? colors.card : colors.surface }]}>
        <Text style={[styles.listCount, { color: colors.textSecondary }]}>{count}</Text>
      </View>
    </View>
  );
}

/** Estado vazio no padrão do app: ícone em quadrado, título em negrito e dica. */
export function EmptyState({
  icon: Icon,
  title,
  text,
}: {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  title: string;
  text: string;
}) {
  const { colors, isDark } = useTheme();
  return (
    <View style={styles.empty}>
      <View style={[styles.emptyIcon, { backgroundColor: isDark ? colors.card : colors.surface }]}>
        <Icon size={28} color={colors.textSecondary} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{text}</Text>
    </View>
  );
}

type InfoRow = {
  label: string;
  value?: string | null;
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
};

/** Lista de dados igual à do Perfil: ícone em quadrado suave, rótulo pequeno e valor em destaque. */
export function InfoList({ rows }: { rows: InfoRow[] }) {
  const { colors, isDark } = useTheme();
  return (
    <View style={[styles.infoCard, { backgroundColor: colors.card }]}>
      {rows.map((row, index) => {
        const Icon = row.icon;
        const vazio = !row.value || !String(row.value).trim();
        return (
          <View key={row.label}>
            {index > 0 ? (
              <View
                style={[
                  styles.infoDivider,
                  { backgroundColor: isDark ? colors.border : 'rgba(15,23,42,0.08)' },
                ]}
              />
            ) : null}
            <View style={styles.infoItem}>
              <View style={[styles.infoIcon, { backgroundColor: isDark ? 'rgba(239,68,68,0.14)' : colors.iconBackground }]}>
                <Icon size={18} color={colors.primary} strokeWidth={2} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>{row.label}</Text>
                <Text style={[styles.infoValue, { color: vazio ? colors.textSecondary : colors.text }]}>
                  {vazio ? '—' : row.value}
                </Text>
              </View>
            </View>
          </View>
        );
      })}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  loading,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
      style={[styles.primaryBtn, { backgroundColor: colors.primary, opacity: disabled || loading ? 0.5 : 1 }]}
    >
      <Text style={styles.primaryBtnText}>{loading ? 'Enviando…' : label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: '700' },
  header: { flexDirection: 'row', alignItems: 'center', paddingBottom: 12, paddingHorizontal: 14, minHeight: 52 },
  headerSide: { width: 48, justifyContent: 'center' },
  headerCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { textAlign: 'center', fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  logo: { width: 168, height: 44 },
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, marginTop: 12 },
  tab: { flex: 1, alignItems: 'center', paddingTop: 10 },
  tabText: { fontSize: 14, fontWeight: '600', paddingBottom: 8 },
  tabLine: { height: 2, borderRadius: 2, alignSelf: 'stretch' },
  semSombra: { shadowOpacity: 0, shadowRadius: 0, elevation: 0 },
  kpiRow: { flexDirection: 'row', gap: 10, marginTop: 18 },
  kpiCard: { flex: 1, minWidth: 0, paddingHorizontal: 12, paddingVertical: 14, alignItems: 'center' },
  kpiLabel: { fontSize: 12, fontWeight: '500', textAlign: 'center' },
  kpiValue: { fontSize: 17, fontWeight: '800', marginTop: 4, letterSpacing: -0.3, textAlign: 'center' },
  summary: { marginTop: 16, paddingHorizontal: 12, paddingTop: 14, paddingBottom: 14 },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryCell: { flex: 1, minWidth: 0, alignItems: 'center', paddingHorizontal: 4 },
  summaryValue: { fontSize: 16, fontWeight: '800', marginTop: 4, letterSpacing: -0.3, textAlign: 'center' },
  summaryDivider: { width: StyleSheet.hairlineWidth * 2, alignSelf: 'stretch', marginVertical: 2 },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, paddingHorizontal: 4 },
  progressValue: { fontSize: 13, fontWeight: '800' },
  progressTrack: { height: 6, borderRadius: 3, marginTop: 6, marginHorizontal: 4, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3 },
  toolbar: { flexDirection: 'row', alignItems: 'stretch', gap: 10, marginTop: 16, marginBottom: 16 },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 14,
    paddingHorizontal: 14,
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth * 1.5,
  },
  searchInput: { flex: 1, paddingVertical: Platform.OS === 'ios' ? 12 : 8, fontSize: 15 },
  addBtn: { width: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  listHeading: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  listCount: { fontSize: 13, fontWeight: '700' },
  listCountPill: { minWidth: 28, alignItems: 'center', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  empty: { alignItems: 'center', paddingVertical: 56, gap: 8, paddingHorizontal: 24 },
  emptyIcon: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  emptyText: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  infoCard: { borderRadius: 18, paddingHorizontal: 16, paddingVertical: 4, marginTop: 14 },
  infoItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  infoIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  infoLabel: { fontSize: 12, fontWeight: '500', marginBottom: 2 },
  infoValue: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2 },
  infoDivider: { height: StyleSheet.hairlineWidth, marginLeft: 48 },
  primaryBtn: { borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
