import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, ClipboardList, HardHat, ScrollText, Search } from 'lucide-react-native';
import SheetModal, { SheetPrimaryButton } from '../SheetModal';
import DateField from '../DateField';
import FormFieldLabel from '../FormFieldLabel';
import { useTheme } from '../../context/ThemeContext';
import { fetchObras, fetchOsOptions, todayIso, type ObraOption, type OsOption } from '../../services/diarioObra';

type Props = {
  visible: boolean;
  onClose: () => void;
  onConfirm: (obra: ObraOption, date: string, os: OsOption | null) => void;
};

type Pick = null | 'contrato' | 'obra' | 'os';
const osKeyOf = (o: { divSe: string; folderNumber: string }) => `${o.divSe}|${o.folderNumber}`;
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

/** Novo diário: escolher contrato, depois a obra dele, e o dia. Se já existir RDO naquele dia, a tela seguinte abre ele. */
export default function RdoNewSheet({ visible, onClose, onConfirm }: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const [contratoId, setContratoId] = useState('');
  const [obraId, setObraId] = useState('');
  const [osKey, setOsKey] = useState('');
  const [date, setDate] = useState(todayIso());
  const [pick, setPick] = useState<Pick>(null);
  const [search, setSearch] = useState('');

  const { data: obras, isLoading, isError, refetch } = useQuery({
    queryKey: ['diario-obra-obras'],
    queryFn: fetchObras,
    enabled: visible,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!visible) return;
    setContratoId('');
    setObraId('');
    setOsKey('');
    setDate(todayIso());
    setPick(null);
    setSearch('');
  }, [visible]);

  // OS (SE e Pasta) do contrato escolhido.
  const { data: osData, isLoading: loadingOs } = useQuery({
    queryKey: ['diario-obra-os', contratoId],
    queryFn: () => fetchOsOptions(contratoId),
    enabled: visible && !!contratoId,
    staleTime: 2 * 60 * 1000,
  });
  const osOptions = osData ?? [];
  const osSel = osOptions.find((o) => osKeyOf(o) === osKey) ?? null;
  // Contrato com OS cadastradas: a OS é obrigatória.
  const osObrigatoria = osOptions.length > 0;

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
    () => (obras ?? []).filter((o) => !contratoId || o.contratoId === contratoId),
    [obras, contratoId],
  );

  const contratoSel = contratos.find((c) => c.id === contratoId);
  const obraSel = (obras ?? []).find((o) => o.id === obraId) ?? null;

  const q = norm(search.trim());
  const contratosFiltrados = contratos.filter((c) => !q || norm(`${c.name} ${c.number ?? ''}`).includes(q));
  const obrasFiltradas = obrasDoContrato.filter((o) => !q || norm(`${o.name} ${contratoOf(o).name}`).includes(q));

  const openPick = (p: Exclude<Pick, null>) => {
    setSearch('');
    setPick(p);
  };

  const selectField = (opts: {
    label: string;
    required?: boolean;
    icon: typeof HardHat;
    value: string;
    placeholder: string;
    onPress: () => void;
    disabled?: boolean;
  }) => {
    const Icon = opts.icon;
    return (
      <View style={{ marginBottom: 14 }}>
        <FormFieldLabel label={opts.label} required={opts.required} style={styles.label} />
        <TouchableOpacity
          style={[styles.field, opts.disabled && { opacity: 0.5 }]}
          activeOpacity={0.75}
          onPress={opts.onPress}
          disabled={opts.disabled}
          accessibilityRole="button"
          accessibilityState={{ disabled: !!opts.disabled }}
        >
          <View style={styles.fieldIcon}>
            <Icon size={16} color={colors.primary} strokeWidth={2.2} />
          </View>
          <Text style={[styles.fieldValue, !opts.value && styles.fieldPlaceholder]} numberOfLines={1}>
            {opts.value || opts.placeholder}
          </Text>
          <View style={styles.fieldIcon}>
            <ChevronDown size={16} color={colors.textSecondary} strokeWidth={2.2} />
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  // ── Lista para escolher contrato ou obra ─────────────────────────────────────
  if (pick === 'os') {
    const lista = osOptions.filter((o) => !q || norm(`${o.label} ${o.description}`).includes(q));
    return (
      <SheetModal visible={visible} onClose={onClose} onBack={() => setPick(null)} title="Escolher OS" size="tall">
        <View style={styles.searchBox}>
          <Search size={18} color={colors.textSecondary} strokeWidth={2.2} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar OS"
            placeholderTextColor={colors.textSecondary}
            style={styles.searchInput}
            autoCorrect={false}
          />
        </View>
        <View style={styles.list}>
          {lista.slice(0, MAX_RESULTS).map((o) => {
            const active = osKey === osKeyOf(o);
            return (
              <TouchableOpacity
                key={osKeyOf(o)}
                style={[styles.option, active && styles.optionActive]}
                activeOpacity={0.75}
                onPress={() => {
                  setOsKey(osKeyOf(o));
                  setPick(null);
                }}
              >
                <View style={[styles.optionIcon, active && styles.optionIconActive]}>
                  <ClipboardList size={18} color={active ? '#fff' : colors.primary} strokeWidth={2.2} />
                </View>
                <View style={styles.optionText}>
                  <Text style={styles.optionTitle} numberOfLines={2}>
                    {o.label}
                  </Text>
                  {o.description ? (
                    <Text style={styles.optionSub} numberOfLines={2}>
                      {o.description}
                    </Text>
                  ) : null}
                </View>
                {active ? <Check size={18} color={colors.primary} strokeWidth={2.6} /> : null}
              </TouchableOpacity>
            );
          })}
          {lista.length === 0 ? <Text style={styles.empty}>Nada encontrado.</Text> : null}
          {lista.length > MAX_RESULTS ? (
            <Text style={styles.more}>Mostrando {MAX_RESULTS} de {lista.length}. Use a busca para refinar.</Text>
          ) : null}
        </View>
      </SheetModal>
    );
  }

  if (pick) {
    const isContrato = pick === 'contrato';
    const list = isContrato ? contratosFiltrados : obrasFiltradas;
    return (
      <SheetModal
        visible={visible}
        onClose={onClose}
        onBack={() => setPick(null)}
        title={isContrato ? 'Escolher contrato' : 'Escolher obra'}
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
        ) : isError ? (
          <TouchableOpacity onPress={() => void refetch()} activeOpacity={0.7}>
            <Text style={styles.error}>Não foi possível carregar. Toque para tentar de novo.</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.list}>
            {isContrato
              ? contratosFiltrados.slice(0, MAX_RESULTS).map((c) => {
                  const active = contratoId === c.id;
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.option, active && styles.optionActive]}
                      activeOpacity={0.75}
                      onPress={() => {
                        setContratoId(c.id);
                        // Trocar de contrato limpa a obra se ela não for dele, e a OS.
                        if (obraSel && obraSel.contratoId !== c.id) setObraId('');
                        if (c.id !== contratoId) setOsKey('');
                        setPick(null);
                      }}
                    >
                      <View style={[styles.optionIcon, active && styles.optionIconActive]}>
                        <ScrollText size={18} color={active ? '#fff' : colors.primary} strokeWidth={2.2} />
                      </View>
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
                  const active = obraId === o.id;
                  return (
                    <TouchableOpacity
                      key={o.id}
                      style={[styles.option, active && styles.optionActive]}
                      activeOpacity={0.75}
                      onPress={() => {
                        setObraId(o.id);
                        setPick(null);
                      }}
                    >
                      <View style={[styles.optionIcon, active && styles.optionIconActive]}>
                        <HardHat size={18} color={active ? '#fff' : colors.primary} strokeWidth={2.2} />
                      </View>
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

            {list.length === 0 ? <Text style={styles.empty}>Nada encontrado.</Text> : null}
            {list.length > MAX_RESULTS ? (
              <Text style={styles.more}>Mostrando {MAX_RESULTS} de {list.length}. Use a busca para refinar.</Text>
            ) : null}
          </View>
        )}
      </SheetModal>
    );
  }

  // ── Formulário ───────────────────────────────────────────────────────────────
  return (
    <SheetModal visible={visible} onClose={onClose} title="Novo Diário de Obra">
      {selectField({
        label: 'Contrato',
        required: true,
        icon: ScrollText,
        value: contratoSel ? contratoSel.name : '',
        placeholder: 'Selecionar contrato',
        onPress: () => openPick('contrato'),
      })}
      {selectField({
        label: 'Obra',
        required: true,
        icon: HardHat,
        value: obraSel ? obraSel.name : '',
        placeholder: contratoSel ? 'Selecionar obra do contrato' : 'Escolha o contrato primeiro',
        onPress: () => openPick('obra'),
        disabled: !contratoId,
      })}
      {selectField({
        label: 'OS',
        required: osObrigatoria,
        icon: ClipboardList,
        value: osSel ? osSel.label : '',
        placeholder: !contratoId
          ? 'Escolha o contrato primeiro'
          : loadingOs
            ? 'Carregando OS...'
            : osObrigatoria
              ? 'Selecionar OS do contrato'
              : 'Nenhuma OS cadastrada neste contrato',
        onPress: () => openPick('os'),
        disabled: !contratoId || !osObrigatoria,
      })}

      <DateField label="Dia do diário" value={date} onChange={setDate} maximumDate={new Date()} />

      <View style={styles.action}>
        <SheetPrimaryButton
          label="Abrir diário"
          disabled={!contratoId || !obraSel || !date || (osObrigatoria && !osSel)}
          onPress={() => obraSel && onConfirm(obraSel, date, osSel)}
        />
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
    action: { marginTop: 8, paddingBottom: 6 },

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
      padding: 12,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    optionActive: { borderColor: colors.primary, backgroundColor: `${colors.primary}0F` },
    optionIcon: {
      width: 38,
      height: 38,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `${colors.primary}14`,
    },
    optionIconActive: { backgroundColor: colors.primary },
    optionText: { flex: 1, minWidth: 0 },
    optionTitle: { fontSize: 15, fontWeight: '700', color: colors.text, letterSpacing: -0.2 },
    optionSub: { marginTop: 2, fontSize: 12, fontWeight: '500', color: colors.textSecondary },
    empty: { fontSize: 14, fontWeight: '500', color: colors.textSecondary, paddingVertical: 12, textAlign: 'center' },
    error: { fontSize: 14, fontWeight: '600', color: colors.primary, paddingVertical: 12 },
    more: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, textAlign: 'center', paddingTop: 4 },
  });
}
