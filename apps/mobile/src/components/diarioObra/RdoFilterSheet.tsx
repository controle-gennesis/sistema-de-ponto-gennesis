import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronRight, HardHat, Search, ScrollText } from 'lucide-react-native';
import SheetModal, { SheetPrimaryButton } from '../SheetModal';
import DateField from '../DateField';
import { useTheme } from '../../context/ThemeContext';
import { fetchObras, type ObraOption } from '../../services/diarioObra';

export type RdoStatusFilter = 'all' | 'DRAFT' | 'FINAL' | 'NONE';
export type RdoFilters = {
  status: RdoStatusFilter;
  contratoId: string;
  obraId: string;
  from: string;
  to: string;
};
export const EMPTY_RDO_FILTERS: RdoFilters = { status: 'all', contratoId: '', obraId: '', from: '', to: '' };

export const RDO_STATUS_OPTIONS: Array<{ key: RdoStatusFilter; label: string }> = [
  { key: 'all', label: 'Todos' },
  { key: 'DRAFT', label: 'Em preenchimento' },
  { key: 'FINAL', label: 'Finalizados' },
  { key: 'NONE', label: 'Sem atividade' },
];

type Props = {
  visible: boolean;
  value: RdoFilters;
  onClose: () => void;
  onApply: (filters: RdoFilters) => void;
};

type Pick = null | 'contrato' | 'obra';
type ContratoOption = { id: string; name: string; number?: string };

const MAX_RESULTS = 50;

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const contratoOf = (o: ObraOption) => ({
  name: o.contratoNome ?? o.contrato?.name ?? '',
  number: o.contrato?.number ?? '',
});

/** Filtros da lista de diários: contrato, obra e período. Contratos e obras vêm do que a pessoa pode ver. */
export default function RdoFilterSheet({ visible, value, onClose, onApply }: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const [draft, setDraft] = useState<RdoFilters>(value);
  const [pick, setPick] = useState<Pick>(null);
  const [search, setSearch] = useState('');

  const { data: obras, isLoading } = useQuery({
    queryKey: ['diario-obra-obras'],
    queryFn: fetchObras,
    enabled: visible,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!visible) return;
    setDraft(value);
    setPick(null);
    setSearch('');
  }, [visible, value]);

  const contratos = useMemo<ContratoOption[]>(() => {
    const map = new Map<string, ContratoOption>();
    for (const o of obras ?? []) {
      if (!o.contratoId || map.has(o.contratoId)) continue;
      const c = contratoOf(o);
      map.set(o.contratoId, { id: o.contratoId, name: c.name || 'Contrato', number: c.number });
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [obras]);

  const obrasDoContrato = useMemo(
    () => (obras ?? []).filter((o) => !draft.contratoId || o.contratoId === draft.contratoId),
    [obras, draft.contratoId],
  );

  const contratoSel = contratos.find((c) => c.id === draft.contratoId);
  const obraSel = (obras ?? []).find((o) => o.id === draft.obraId);

  const q = norm(search.trim());
  const contratosFiltrados = contratos.filter((c) => !q || norm(`${c.name} ${c.number ?? ''}`).includes(q));
  const obrasFiltradas = obrasDoContrato.filter((o) => !q || norm(`${o.name} ${contratoOf(o).name}`).includes(q));

  const openPick = (p: Exclude<Pick, null>) => {
    setSearch('');
    setPick(p);
  };

  const hasAny = !!(draft.status !== 'all' || draft.contratoId || draft.obraId || draft.from || draft.to);

  const selectRow = (opts: {
    icon: typeof HardHat;
    label: string;
    value: string;
    placeholder: string;
    onPress: () => void;
  }) => {
    const Icon = opts.icon;
    return (
      <View style={{ marginBottom: 14 }}>
        <Text style={styles.label}>{opts.label}</Text>
        <TouchableOpacity style={styles.field} activeOpacity={0.75} onPress={opts.onPress} accessibilityRole="button">
          <View style={styles.fieldIcon}>
            <Icon size={16} color={colors.primary} strokeWidth={2.2} />
          </View>
          <Text style={[styles.fieldValue, !opts.value && styles.fieldPlaceholder]} numberOfLines={1}>
            {opts.value || opts.placeholder}
          </Text>
          <ChevronRight size={16} color={colors.textSecondary} strokeWidth={2.2} />
        </TouchableOpacity>
      </View>
    );
  };

  // ── Escolher contrato / obra ────────────────────────────────────────────────
  if (pick) {
    const isContrato = pick === 'contrato';
    return (
      <SheetModal
        visible={visible}
        onClose={onClose}
        onBack={() => setPick(null)}
        title={isContrato ? 'Contrato' : 'Obra'}
        size="tall"
      >
        <View style={styles.searchBox}>
          <Search size={18} color={colors.textSecondary} strokeWidth={2.2} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={isContrato ? 'Buscar contrato' : 'Buscar obra'}
            placeholderTextColor={colors.textSecondary}
            style={styles.searchInput}
            autoCorrect={false}
          />
        </View>

        {isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} />
        ) : (
          <View style={styles.list}>
            <TouchableOpacity
              style={[styles.option, !(isContrato ? draft.contratoId : draft.obraId) && styles.optionActive]}
              activeOpacity={0.75}
              onPress={() => {
                setDraft((d) => (isContrato ? { ...d, contratoId: '', obraId: '' } : { ...d, obraId: '' }));
                setPick(null);
              }}
            >
              <Text style={styles.optionTitle}>{isContrato ? 'Todos os contratos' : 'Todas as obras'}</Text>
              {!(isContrato ? draft.contratoId : draft.obraId) ? (
                <Check size={18} color={colors.primary} strokeWidth={2.6} />
              ) : null}
            </TouchableOpacity>

            {isContrato
              ? contratosFiltrados.slice(0, MAX_RESULTS).map((c) => {
                  const active = draft.contratoId === c.id;
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.option, active && styles.optionActive]}
                      activeOpacity={0.75}
                      onPress={() => {
                        // Trocar de contrato limpa a obra se ela não for dele.
                        setDraft((d) => ({
                          ...d,
                          contratoId: c.id,
                          obraId: (obras ?? []).find((o) => o.id === d.obraId)?.contratoId === c.id ? d.obraId : '',
                        }));
                        setPick(null);
                      }}
                    >
                      <View style={styles.optionText}>
                        <Text style={styles.optionTitle} numberOfLines={2}>
                          {c.name}
                        </Text>
                        {c.number ? <Text style={styles.optionSub}>{c.number}</Text> : null}
                      </View>
                      {active ? <Check size={18} color={colors.primary} strokeWidth={2.6} /> : null}
                    </TouchableOpacity>
                  );
                })
              : obrasFiltradas.slice(0, MAX_RESULTS).map((o) => {
                  const active = draft.obraId === o.id;
                  return (
                    <TouchableOpacity
                      key={o.id}
                      style={[styles.option, active && styles.optionActive]}
                      activeOpacity={0.75}
                      onPress={() => {
                        setDraft((d) => ({ ...d, obraId: o.id, contratoId: o.contratoId || d.contratoId }));
                        setPick(null);
                      }}
                    >
                      <View style={styles.optionText}>
                        <Text style={styles.optionTitle} numberOfLines={2}>
                          {o.name}
                        </Text>
                        {contratoOf(o).name ? (
                          <Text style={styles.optionSub} numberOfLines={1}>
                            {contratoOf(o).name}
                          </Text>
                        ) : null}
                      </View>
                      {active ? <Check size={18} color={colors.primary} strokeWidth={2.6} /> : null}
                    </TouchableOpacity>
                  );
                })}

            {(isContrato ? contratosFiltrados : obrasFiltradas).length === 0 ? (
              <Text style={styles.empty}>Nada encontrado.</Text>
            ) : null}
            {(isContrato ? contratosFiltrados : obrasFiltradas).length > MAX_RESULTS ? (
              <Text style={styles.more}>Mostrando {MAX_RESULTS}. Use a busca para refinar.</Text>
            ) : null}
          </View>
        )}
      </SheetModal>
    );
  }

  // ── Filtros ─────────────────────────────────────────────────────────────────
  return (
    <SheetModal visible={visible} onClose={onClose} title="Filtros">
      <View style={{ marginBottom: 14 }}>
        <Text style={styles.label}>Situação</Text>
        <View style={styles.chips}>
          {RDO_STATUS_OPTIONS.map((o) => {
            const active = draft.status === o.key;
            return (
              <TouchableOpacity
                key={o.key}
                style={[styles.chip, active && styles.chipActive]}
                activeOpacity={0.75}
                onPress={() => setDraft((d) => ({ ...d, status: o.key }))}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{o.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {selectRow({
        icon: ScrollText,
        label: 'Contrato',
        value: contratoSel ? contratoSel.name : '',
        placeholder: 'Todos os contratos',
        onPress: () => openPick('contrato'),
      })}
      {selectRow({
        icon: HardHat,
        label: 'Obra',
        value: obraSel ? obraSel.name : '',
        placeholder: 'Todas as obras',
        onPress: () => openPick('obra'),
      })}

      <DateField
        label="De"
        value={draft.from}
        onChange={(v) => setDraft((d) => ({ ...d, from: v }))}
        placeholder="Qualquer data"
      />
      <DateField
        label="Até"
        value={draft.to}
        onChange={(v) => setDraft((d) => ({ ...d, to: v }))}
        placeholder="Qualquer data"
      />

      <View style={styles.actions}>
        <SheetPrimaryButton label="Aplicar" onPress={() => onApply(draft)} />
        {hasAny ? (
          <TouchableOpacity
            style={styles.clearBtn}
            activeOpacity={0.7}
            onPress={() => {
              setDraft(EMPTY_RDO_FILTERS);
              onApply(EMPTY_RDO_FILTERS);
            }}
          >
            <Text style={styles.clearText}>Limpar filtros</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </SheetModal>
  );
}

function getStyles(colors: any, isDark: boolean) {
  const line = isDark ? 'transparent' : 'rgba(15, 23, 42, 0.08)';
  const fieldBg = isDark ? colors.card : colors.surface;
  return StyleSheet.create({
    label: { fontSize: 13, fontWeight: '600', marginBottom: 8, letterSpacing: -0.1, color: colors.textSecondary },
    field: {
      minHeight: 48,
      borderRadius: 14,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: fieldBg,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: line,
    },
    fieldIcon: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
    },
    fieldValue: { flex: 1, fontSize: 15, fontWeight: '600', letterSpacing: -0.2, color: colors.text },
    fieldPlaceholder: { color: colors.textSecondary, fontWeight: '500' },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: {
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipActive: { borderColor: colors.primary, backgroundColor: `${colors.primary}14` },
    chipText: { fontSize: 14, fontWeight: '600', color: colors.text },
    chipTextActive: { color: colors.primary },
    actions: { marginTop: 8, gap: 6, paddingBottom: 4 },
    clearBtn: { height: 48, alignItems: 'center', justifyContent: 'center' },
    clearText: { fontSize: 15, fontWeight: '700', color: colors.textSecondary },

    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      minHeight: 48,
      paddingHorizontal: 14,
      borderRadius: 14,
      backgroundColor: fieldBg,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: line,
      marginBottom: 14,
    },
    searchInput: { flex: 1, fontSize: 15, fontWeight: '500', color: colors.text, paddingVertical: 10 },
    list: { gap: 8, paddingBottom: 8 },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    optionActive: { borderColor: colors.primary, backgroundColor: `${colors.primary}0F` },
    optionText: { flex: 1, minWidth: 0 },
    optionTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text, letterSpacing: -0.2 },
    optionSub: { marginTop: 2, fontSize: 12, fontWeight: '500', color: colors.textSecondary },
    empty: { fontSize: 14, fontWeight: '500', color: colors.textSecondary, paddingVertical: 12, textAlign: 'center' },
    more: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, textAlign: 'center', paddingTop: 4 },
  });
}
