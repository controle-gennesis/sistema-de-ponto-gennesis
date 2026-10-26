import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, Minus, Package, Plus, Search, Trash2 } from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import KanbanSheet from './KanbanSheet';
import { useTheme } from '../context/ThemeContext';
import {
  addKanbanCardMaterials,
  searchConstructionMaterials,
  type ConstructionMaterialItem,
} from '../services/kanban';

type Row = {
  materialId: string;
  name: string;
  unit: string;
  code: string | null;
  qty: string;
  observation: string;
};

const OBSERVATION_MAX = 500;
const WINDOW_H = Dimensions.get('window').height;

function parseQty(raw: string): number {
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function formatQty(n: number): string {
  return String(Math.round(n * 1000) / 1000).replace('.', ',');
}

/**
 * Adicionar materiais ao card em dois passos:
 * 1) buscar e marcar os materiais; 2) revisar quantidade e observação de cada um.
 */
export default function KanbanMaterialsSheet({
  visible,
  cardId,
  alreadyIds,
  onClose,
  onSaved,
}: {
  visible: boolean;
  cardId: string;
  alreadyIds: string[];
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [step, setStep] = useState<'pick' | 'review'>('pick');
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) {
      setStep('pick');
      setSearch('');
      setTerm('');
      setRows([]);
    }
  }, [visible]);

  useEffect(() => {
    const t = setTimeout(() => setTerm(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const resultsQuery = useQuery({
    queryKey: ['kanban-material-search', term],
    queryFn: () => searchConstructionMaterials(term),
    enabled: visible && term.length !== 1,
  });

  const selectedIds = rows.map((r) => r.materialId);

  const toggle = (m: ConstructionMaterialItem) => {
    setRows((prev) =>
      prev.some((r) => r.materialId === m.id)
        ? prev.filter((r) => r.materialId !== m.id)
        : [
            ...prev,
            {
              materialId: m.id,
              name: m.name,
              unit: m.unit,
              code: m.code ?? null,
              qty: '1',
              observation: '',
            },
          ],
    );
  };

  const patchRow = (id: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.materialId === id ? { ...r, ...patch } : r)));

  const stepQty = (id: string, delta: number) =>
    setRows((prev) =>
      prev.map((r) =>
        r.materialId === id ? { ...r, qty: formatQty(Math.max(1, parseQty(r.qty) + delta)) } : r,
      ),
    );

  const removeRow = (id: string) => {
    setRows((prev) => {
      const next = prev.filter((r) => r.materialId !== id);
      if (next.length === 0) setStep('pick');
      return next;
    });
  };

  const save = async () => {
    if (rows.length === 0) return;
    setSaving(true);
    try {
      await addKanbanCardMaterials(
        cardId,
        rows.map((r) => ({
          materialId: r.materialId,
          quantity: parseQty(r.qty),
          observation: r.observation.trim() || undefined,
        })),
      );
      await onSaved();
      onClose();
      Toast.show({ type: 'success', text1: 'Materiais adicionados' });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.message || 'Falha ao adicionar materiais' });
    } finally {
      setSaving(false);
    }
  };

  const results = (resultsQuery.data ?? []).filter((m) => !alreadyIds.includes(m.id));

  return (
    <KanbanSheet
      visible={visible}
      onClose={onClose}
      title={step === 'pick' ? 'Adicionar materiais' : 'Quantidades'}
      subtitle={
        step === 'pick'
          ? 'Busque e marque os materiais'
          : 'Ajuste a quantidade e, se quiser, uma observação'
      }
      icon={Package}
    >
      {step === 'pick' ? (
        <>
          <View style={styles.searchWrap}>
            <Search size={16} color={colors.textSecondary} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar material..."
              placeholderTextColor={colors.textSecondary}
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
              returnKeyType="search"
            />
          </View>

          <ScrollView
            style={styles.results}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {term.length === 1 ? (
              <Text style={styles.hint}>Digite mais uma letra para buscar</Text>
            ) : resultsQuery.isLoading ? (
              <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
            ) : results.length === 0 ? (
              <Text style={styles.hint}>Nenhum material encontrado</Text>
            ) : (
              [
                ...results.map((m) => {
                const active = selectedIds.includes(m.id);
                return (
                  <TouchableOpacity
                    key={m.id}
                    style={[styles.resultRow, active && styles.resultRowOn]}
                    activeOpacity={0.7}
                    onPress={() => toggle(m)}
                  >
                    <View style={[styles.checkbox, active && styles.checkboxOn]}>
                      {active ? <Check size={13} color="#fff" strokeWidth={3} /> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowName} numberOfLines={2}>
                        {m.name}
                      </Text>
                      <Text style={styles.rowMeta} numberOfLines={1}>
                        {[m.code, m.unit].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
                }),
                results.length >= 50 ? (
                  <Text key="mais" style={styles.hint}>
                    Mostrando os 50 primeiros — digite para filtrar
                  </Text>
                ) : null,
              ]
            )}
          </ScrollView>

          <TouchableOpacity
            style={[styles.primaryBtn, rows.length === 0 && { opacity: 0.5 }]}
            onPress={() => setStep('review')}
            disabled={rows.length === 0}
          >
            <Text style={styles.primaryText}>
              {rows.length > 0
                ? `Continuar com ${rows.length} ${rows.length === 1 ? 'material' : 'materiais'}`
                : 'Marque ao menos um material'}
            </Text>
          </TouchableOpacity>
        </>
      ) : (
        <>
          <View style={styles.reviewHead}>
            <Text style={styles.reviewCount}>
              {rows.length} {rows.length === 1 ? 'material' : 'materiais'}
            </Text>
            <TouchableOpacity
              style={styles.addMoreBtn}
              onPress={() => setStep('pick')}
              activeOpacity={0.7}
              hitSlop={6}
            >
              <Plus size={14} color={colors.primary} strokeWidth={2.6} />
              <Text style={[styles.addMoreText, { color: colors.primary }]}>Adicionar mais</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.review}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {rows.map((r) => (
              <View key={r.materialId} style={styles.rowCard}>
                <View style={styles.cardHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowName} numberOfLines={2}>
                      {r.name}
                    </Text>
                    {r.code ? <Text style={styles.rowMeta}>{r.code}</Text> : null}
                  </View>
                  <TouchableOpacity onPress={() => removeRow(r.materialId)} hitSlop={8}>
                    <Trash2 size={16} color={colors.textSecondary} />
                  </TouchableOpacity>
                </View>

                <View style={styles.qtyRow}>
                  <Text style={styles.qtyLabel}>Quantidade</Text>
                  <View style={styles.stepper}>
                    <TouchableOpacity
                      style={styles.stepBtn}
                      onPress={() => stepQty(r.materialId, -1)}
                      hitSlop={6}
                    >
                      <Minus size={16} color={colors.text} />
                    </TouchableOpacity>
                    <TextInput
                      value={r.qty}
                      onChangeText={(t) => patchRow(r.materialId, { qty: t.replace(/[^0-9.,]/g, '') })}
                      keyboardType="decimal-pad"
                      style={styles.qtyInput}
                      selectTextOnFocus
                    />
                    <TouchableOpacity
                      style={styles.stepBtn}
                      onPress={() => stepQty(r.materialId, 1)}
                      hitSlop={6}
                    >
                      <Plus size={16} color={colors.text} />
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.unit}>{r.unit}</Text>
                </View>

                <TextInput
                  value={r.observation}
                  onChangeText={(t) => patchRow(r.materialId, { observation: t.slice(0, OBSERVATION_MAX) })}
                  placeholder="Observação (opcional)"
                  placeholderTextColor={colors.textSecondary}
                  style={styles.obsInput}
                  autoCorrect={false}
                  multiline
                />
              </View>
            ))}

          </ScrollView>

          <View style={styles.footerRow}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => setStep('pick')}
              disabled={saving}
              accessibilityLabel="Voltar para a busca"
            >
              <ArrowLeft size={18} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.primaryBtn, { flex: 1, marginTop: 0 }]}
              onPress={() => void save()}
              disabled={saving}
            >
              {saving ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryText}>Adicionar ao card</Text>
              )}
            </TouchableOpacity>
          </View>
        </>
      )}
    </KanbanSheet>
  );
}

function getStyles(colors: any) {
  return StyleSheet.create({
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.background,
      borderRadius: 12,
      paddingHorizontal: 12,
      marginBottom: 8,
    },
    searchInput: {
      flex: 1,
      minHeight: 42,
      paddingVertical: 12,
      color: colors.text,
      fontSize: 15,
    },
    results: {
      flexGrow: 0,
      flexShrink: 1,
      minHeight: WINDOW_H * 0.2,
      maxHeight: WINDOW_H * 0.42,
    },
    review: { flexGrow: 0, flexShrink: 1, maxHeight: WINDOW_H * 0.5 },
    hint: { textAlign: 'center', color: colors.textSecondary, marginVertical: 24, fontSize: 13 },
    resultRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 8,
      borderRadius: 12,
    },
    resultRowOn: { backgroundColor: `${colors.primary}10` },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
    rowName: { fontSize: 14, fontWeight: '600', color: colors.text },
    rowMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    rowCard: {
      backgroundColor: colors.background,
      borderRadius: 14,
      padding: 12,
      marginBottom: 10,
      gap: 10,
    },
    cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    qtyLabel: { flex: 1, fontSize: 13, fontWeight: '600', color: colors.textSecondary },
    stepper: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderRadius: 10,
    },
    stepBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
    qtyInput: {
      width: 56,
      minHeight: 38,
      paddingVertical: 8,
      textAlign: 'center',
      color: colors.text,
      fontSize: 15,
      fontWeight: '700',
    },
    unit: { minWidth: 28, fontSize: 12, color: colors.textSecondary },
    obsInput: {
      minHeight: 40,
      borderRadius: 10,
      backgroundColor: colors.surface,
      color: colors.text,
      fontSize: 14,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
      marginTop: 10,
    },
    primaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    reviewHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    reviewCount: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    addMoreBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 10,
      backgroundColor: `${colors.primary}14`,
    },
    addMoreText: { fontSize: 13, fontWeight: '700' },
    footerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
    backBtn: {
      width: 50,
      height: 50,
      borderRadius: 14,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
}
