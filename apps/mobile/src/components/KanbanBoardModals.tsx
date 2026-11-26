import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, Check, Pencil, Plus, Share2, Tag, Trash2 } from 'lucide-react-native';
import Toast from 'react-native-toast-message';
import { useTheme } from '../context/ThemeContext';
import KanbanSheet from './KanbanSheet';
import CenteredTextInput from './CenteredTextInput';
import SheetModal, { SheetPrimaryButton } from './SheetModal';
import FormFieldLabel from './FormFieldLabel';
import { MemberAvatar, MemberPickerSheet } from './KanbanMemberUi';
import {
  addKanbanBoardShare,
  deleteKanbanColumn,
  fetchKanbanArchivedCards,
  fetchKanbanBoardShares,
  removeKanbanBoardShare,
  updateKanbanBoard,
  updateKanbanBoardLabelPresets,
  updateKanbanBoardShare,
  updateKanbanCard,
  updateKanbanColumn,
  type KanbanColumn,
  type KanbanLabelPreset,
} from '../services/kanban';

export const KANBAN_COLUMN_COLORS = [
  '#6B7280',
  '#14B8A6',
  '#3B82F6',
  '#8B5CF6',
  '#EC4899',
  '#F59E0B',
  '#EF4444',
  '#10B981',
];

/** Paleta das etiquetas (as mesmas cores padrão do quadro). */
const LABEL_COLORS = [
  '#FF78CB',
  '#C377E0',
  '#9F8FEF',
  '#0079BF',
  '#00C2E0',
  '#51E898',
  '#61BD4F',
  '#B3D4A3',
  '#F2D600',
  '#FF9F1A',
  '#EB5A46',
  '#B04632',
  '#344563',
  '#838C91',
];

export function labelTextColor(background: string): string {
  const hex = background.replace('#', '').trim();
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex;
  if (full.length !== 6) return '#FFFFFF';
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return '#FFFFFF';
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.62 ? '#1F2937' : '#FFFFFF';
}

function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  icon,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  icon?: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  children: React.ReactNode;
}) {
  return (
    <KanbanSheet visible={visible} onClose={onClose} title={title} subtitle={subtitle} icon={icon}>
      {children}
    </KanbanSheet>
  );
}

/** Renomear, trocar a cor, definir limite e excluir uma coluna. */
export function ColumnEditModal({
  column,
  boardQueryKey,
  onClose,
}: {
  column: KanbanColumn | null;
  boardQueryKey: readonly unknown[];
  onClose: () => void;
}) {
  const { colors, isDark } = useTheme();
  const form = useMemo(() => getFormStyles(colors, isDark), [colors, isDark]);
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [color, setColor] = useState(KANBAN_COLUMN_COLORS[0]);
  const [limit, setLimit] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!column) return;
    setTitle(column.title);
    setColor(column.color || KANBAN_COLUMN_COLORS[0]);
    setLimit(column.limit ? String(column.limit) : '');
  }, [column]);

  const save = async () => {
    if (!column) return;
    const name = title.trim();
    if (!name) {
      Toast.show({ type: 'error', text1: 'Informe o nome da coluna' });
      return;
    }
    const n = parseInt(limit, 10);
    setSaving(true);
    try {
      await updateKanbanColumn(column.id, {
        title: name,
        color,
        cardLimit: Number.isFinite(n) && n > 0 ? n : null,
      });
      await queryClient.invalidateQueries({ queryKey: boardQueryKey });
      onClose();
      Toast.show({ type: 'success', text1: 'Coluna atualizada' });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.message || 'Falha ao salvar coluna' });
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    if (!column) return;
    Alert.alert(
      'Excluir coluna',
      `Excluir "${column.title}"? Os cards dela também serão removidos do quadro.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteKanbanColumn(column.id);
              await queryClient.invalidateQueries({ queryKey: boardQueryKey });
              onClose();
              Toast.show({ type: 'success', text1: 'Coluna excluída' });
            } catch (e: any) {
              Toast.show({ type: 'error', text1: e?.message || 'Falha ao excluir coluna' });
            }
          },
        },
      ],
    );
  };

  return (
    <SheetModal visible={!!column} onClose={onClose} title="Editar coluna">
      <FormFieldLabel label="Nome" required style={form.label} />
      <CenteredTextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Nome da coluna"
        placeholderTextColor={colors.textSecondary}
        boxStyle={form.box}
        style={form.input}
      />

      <FormFieldLabel label="Cor" style={form.label} />
      <View style={form.grid}>
        {KANBAN_COLUMN_COLORS.map((c) => {
          const active = color === c;
          return (
            <View key={c} style={form.cell}>
              <TouchableOpacity
                onPress={() => setColor(c)}
                style={[form.swatch, { backgroundColor: c }, active && form.swatchActive]}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
              >
                {active ? <Check size={18} color="#fff" strokeWidth={3} /> : null}
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      <FormFieldLabel label="Limite de cards (opcional)" style={form.label} />
      <CenteredTextInput
        value={limit}
        onChangeText={(t) => setLimit(t.replace(/\D/g, ''))}
        placeholder="Sem limite"
        placeholderTextColor={colors.textSecondary}
        keyboardType="number-pad"
        boxStyle={form.box}
        style={form.input}
      />

      <View style={form.action}>
        <SheetPrimaryButton label="Salvar" loading={saving} disabled={!title.trim()} onPress={() => void save()} />
        <TouchableOpacity style={form.remove} onPress={remove} disabled={saving}>
          <Text style={form.removeText}>Excluir coluna</Text>
        </TouchableOpacity>
      </View>
    </SheetModal>
  );
}

/** Mesmo visual de formulário da janela de capa. */
function getFormStyles(colors: any, isDark: boolean) {
  const line = isDark ? 'transparent' : 'rgba(15, 23, 42, 0.08)';
  const fieldBg = isDark ? colors.card : colors.surface;
  const field = { backgroundColor: fieldBg, borderWidth: StyleSheet.hairlineWidth * 1.5, borderColor: line };
  return StyleSheet.create({
    empty: { textAlign: 'center', color: colors.textSecondary, marginVertical: 24, fontSize: 14 },
    list: { gap: 8, paddingBottom: 6 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, ...field },
    rowTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
    rowMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    rowAction: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
    rowActionText: { fontSize: 13, fontWeight: '700', color: colors.primary },
    labelRow: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      paddingHorizontal: 14,
      borderRadius: 12,
      marginBottom: 8,
    },
    labelRowText: { flexShrink: 1, fontSize: 14, fontWeight: '700' },
    labelPreview: { height: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
    addButton: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 12,
      ...field,
    },
    addButtonText: { fontSize: 14, fontWeight: '600', color: colors.text },
    cellSmall: { width: '20%', paddingHorizontal: 4, marginBottom: 8 },
    label: { fontSize: 13, fontWeight: '600', marginBottom: 8, letterSpacing: -0.1, color: colors.textSecondary },
    box: {
      height: 50,
      paddingHorizontal: 14,
      borderRadius: 12,
      backgroundColor: isDark ? colors.card : colors.surface,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: line,
      marginBottom: 14,
    },
    input: { color: colors.text, fontSize: 15 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 6 },
    cell: { width: '25%', paddingHorizontal: 4, marginBottom: 8 },
    swatch: { height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    swatchActive: { borderWidth: 2.5, borderColor: colors.text },
    action: { marginTop: 8, paddingBottom: 6 },
    remove: { alignItems: 'center', paddingVertical: 12 },
    removeText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  });
}

/** Cards arquivados do quadro, com botão de restaurar. */
export function ArchivedCardsModal({
  visible,
  departmentKey,
  canWrite,
  boardQueryKey,
  onClose,
  onOpenCard,
}: {
  visible: boolean;
  departmentKey?: string;
  canWrite: boolean;
  boardQueryKey: readonly unknown[];
  onClose: () => void;
  onOpenCard: (cardId: string) => void;
}) {
  const { colors, isDark } = useTheme();
  const form = useMemo(() => getFormStyles(colors, isDark), [colors, isDark]);
  const queryClient = useQueryClient();

  const archivedQuery = useQuery({
    queryKey: ['kanban-archived', departmentKey ?? 'own'],
    queryFn: () => fetchKanbanArchivedCards(departmentKey),
    enabled: visible,
  });

  const restore = async (cardId: string) => {
    try {
      await updateKanbanCard(cardId, { archivedAt: null });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['kanban-archived', departmentKey ?? 'own'] }),
        queryClient.invalidateQueries({ queryKey: boardQueryKey }),
      ]);
      Toast.show({ type: 'success', text1: 'Card restaurado' });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.message || 'Falha ao restaurar' });
    }
  };

  const list = archivedQuery.data ?? [];

  return (
    <SheetModal visible={visible} onClose={onClose} title="Cards arquivados">
      {archivedQuery.isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
      ) : list.length === 0 ? (
        <Text style={form.empty}>Nenhum card arquivado</Text>
      ) : (
        <View style={form.list}>
          {list.map((c) => (
            <View key={c.id} style={form.row}>
              <TouchableOpacity
                style={{ flex: 1 }}
                activeOpacity={0.7}
                onPress={() => {
                  onClose();
                  onOpenCard(c.id);
                }}
              >
                <Text style={form.rowTitle} numberOfLines={2}>
                  {c.title || 'Sem título'}
                </Text>
                <Text style={form.rowMeta} numberOfLines={1}>
                  {c.columnTitle}
                </Text>
              </TouchableOpacity>
              {canWrite ? (
                <TouchableOpacity style={form.rowAction} onPress={() => void restore(c.id)} hitSlop={6}>
                  <ArchiveRestore size={15} color={colors.primary} />
                  <Text style={form.rowActionText}>Restaurar</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </SheetModal>
  );
}

/** Etiquetas do quadro: lista colorida; tocar numa etiqueta abre a edição de nome e cor. */
export function LabelSettingsModal({
  visible,
  presets,
  departmentKey,
  boardQueryKey,
  onClose,
}: {
  visible: boolean;
  presets: KanbanLabelPreset[];
  departmentKey?: string;
  boardQueryKey: readonly unknown[];
  onClose: () => void;
}) {
  const { colors, isDark } = useTheme();
  const form = useMemo(() => getFormStyles(colors, isDark), [colors, isDark]);
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Array<KanbanLabelPreset & { origColor?: string }>>([]);
  const [saving, setSaving] = useState(false);
  // Índice da etiqueta em edição (null = vendo a lista).
  const [editing, setEditing] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState(LABEL_COLORS[0]);

  useEffect(() => {
    if (visible) {
      setDraft(presets.map((p) => ({ ...p, origColor: p.color })));
      setEditing(null);
    }
  }, [visible, presets]);

  const openEdit = (index: number) => {
    setEditName(draft[index].name);
    setEditColor(draft[index].color);
    setEditing(index);
  };

  const openNew = () => {
    const used = new Set(draft.map((p) => p.color.toLowerCase()));
    const color = LABEL_COLORS.find((c) => !used.has(c.toLowerCase()));
    if (!color) {
      Toast.show({ type: 'error', text1: 'Não há mais cores disponíveis' });
      return;
    }
    setDraft([...draft, { color, name: '' }]);
    setEditName('');
    setEditColor(color);
    setEditing(draft.length);
  };

  const closeEdit = () => {
    // Etiqueta nova que ficou sem nome não entra na lista.
    if (editing !== null && !draft[editing]?.name.trim()) {
      setDraft((prev) => prev.filter((_, i) => i !== editing));
    }
    setEditing(null);
  };

  const applyEdit = () => {
    if (editing === null) return;
    const name = editName.trim();
    if (!name) {
      Toast.show({ type: 'error', text1: 'Dê um nome para a etiqueta' });
      return;
    }
    setDraft((prev) => prev.map((x, i) => (i === editing ? { ...x, name, color: editColor } : x)));
    setEditing(null);
  };

  const removeEdit = () => {
    if (editing === null) return;
    setDraft((prev) => prev.filter((_, i) => i !== editing));
    setEditing(null);
  };

  const save = async () => {
    const cleaned = draft.map((p) => ({ color: p.color, name: p.name.trim() }));
    if (cleaned.some((p) => !p.name)) {
      Toast.show({ type: 'error', text1: 'Dê um nome para cada etiqueta' });
      return;
    }
    // Etiqueta que mudou de cor: os cards que usavam a cor antiga passam para a nova.
    const colorRemaps = draft
      .filter((p) => p.origColor && p.origColor.toLowerCase() !== p.color.toLowerCase())
      .map((p) => ({ from: p.origColor as string, to: p.color }));
    setSaving(true);
    try {
      await updateKanbanBoardLabelPresets(cleaned, departmentKey, { colorRemaps });
      await queryClient.invalidateQueries({ queryKey: boardQueryKey });
      onClose();
      Toast.show({ type: 'success', text1: 'Etiquetas atualizadas' });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.message || 'Falha ao salvar etiquetas' });
    } finally {
      setSaving(false);
    }
  };

  const usedByOthers = new Set(
    draft.filter((_, i) => i !== editing).map((x) => x.color.toLowerCase()),
  );
  const previewFg = labelTextColor(editColor);

  return (
    <SheetModal
      visible={visible}
      onClose={onClose}
      onBack={editing === null ? undefined : closeEdit}
      title={editing === null ? 'Etiquetas do quadro' : 'Editar etiqueta'}
    >
      {editing === null ? (
        <>
          {draft.map((p, i) => {
            const fg = labelTextColor(p.color);
            return (
              <TouchableOpacity
                key={i}
                activeOpacity={0.85}
                style={[form.labelRow, { backgroundColor: p.color }]}
                onPress={() => openEdit(i)}
              >
                <Text style={[form.labelRowText, { color: fg }]} numberOfLines={1}>
                  {p.name || 'Sem nome'}
                </Text>
                <Pencil size={15} color={fg} />
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity style={form.addButton} onPress={openNew}>
            <Plus size={17} color={colors.text} />
            <Text style={form.addButtonText}>Nova etiqueta</Text>
          </TouchableOpacity>
          <View style={form.action}>
            <SheetPrimaryButton label="Salvar" loading={saving} onPress={() => void save()} />
          </View>
        </>
      ) : (
        <>
          <View style={[form.labelPreview, { backgroundColor: editColor }]}>
            <Text style={[form.labelRowText, { color: previewFg }]} numberOfLines={1}>
              {editName.trim() || 'Etiqueta'}
            </Text>
          </View>

          <FormFieldLabel label="Nome" required style={form.label} />
          <CenteredTextInput
            value={editName}
            onChangeText={setEditName}
            placeholder="Nome da etiqueta"
            placeholderTextColor={colors.textSecondary}
            boxStyle={form.box}
            style={form.input}
            autoCorrect={false}
          />

          <FormFieldLabel label="Cor" style={form.label} />
          <View style={form.grid}>
            {LABEL_COLORS.map((c) => {
              const taken = usedByOthers.has(c.toLowerCase());
              const active = c.toLowerCase() === editColor.toLowerCase();
              return (
                <View key={c} style={form.cellSmall}>
                  <TouchableOpacity
                    disabled={taken}
                    onPress={() => setEditColor(c)}
                    activeOpacity={0.8}
                    style={[
                      form.swatch,
                      { backgroundColor: c },
                      active && form.swatchActive,
                      taken && { opacity: 0.25 },
                    ]}
                  >
                    {active ? <Check size={18} color={labelTextColor(c)} strokeWidth={3} /> : null}
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>

          <View style={form.action}>
            <SheetPrimaryButton label="Concluído" disabled={!editName.trim()} onPress={applyEdit} />
            <TouchableOpacity style={form.remove} onPress={removeEdit}>
              <Text style={form.removeText}>Excluir etiqueta</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </SheetModal>
  );
}

/** Renomear um quadro personalizado. */
export function BoardRenameModal({
  board,
  onClose,
}: {
  board: { id: string; name: string } | null;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (board) setName(board.name);
  }, [board]);

  const save = async () => {
    if (!board) return;
    const next = name.trim();
    if (!next) {
      Toast.show({ type: 'error', text1: 'Informe o nome do quadro' });
      return;
    }
    setSaving(true);
    try {
      await updateKanbanBoard(board.id, next);
      await queryClient.invalidateQueries({ queryKey: ['kanban-boards'] });
      onClose();
      Toast.show({ type: 'success', text1: 'Quadro renomeado' });
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.message || 'Falha ao renomear' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet visible={!!board} onClose={onClose} title="Renomear quadro" subtitle="Escolha um novo nome" icon={Pencil}>
      <CenteredTextInput
        value={name}
        onChangeText={setName}
        placeholder="Nome do quadro"
        placeholderTextColor={colors.textSecondary}
        boxStyle={styles.inputBox}
        style={styles.inputText}
        autoFocus
      />
      <TouchableOpacity style={styles.primaryBtn} onPress={() => void save()} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Salvar</Text>}
      </TouchableOpacity>
    </Sheet>
  );
}

/** Compartilhar o quadro com outras pessoas (leitura ou edição). */
export function BoardShareModal({
  board,
  onClose,
}: {
  board: { id: string; name: string } | null;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const [pickerOpen, setPickerOpen] = useState(false);

  const sharesQuery = useQuery({
    queryKey: ['kanban-board-shares', board?.id],
    queryFn: () => fetchKanbanBoardShares(board!.id),
    enabled: !!board,
  });

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['kanban-board-shares', board?.id] }),
      queryClient.invalidateQueries({ queryKey: ['kanban-boards'] }),
    ]);

  const shares = sharesQuery.data ?? [];

  const add = async (u: { id: string }) => {
    if (!board) return;
    try {
      await addKanbanBoardShare(board.id, u.id, 'WRITE');
      await refresh();
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.message || 'Falha ao compartilhar' });
      throw e;
    }
  };

  const togglePermission = async (userId: string, current: 'READ' | 'WRITE') => {
    if (!board) return;
    try {
      await updateKanbanBoardShare(board.id, userId, current === 'WRITE' ? 'READ' : 'WRITE');
      await refresh();
    } catch (e: any) {
      Toast.show({ type: 'error', text1: e?.message || 'Falha ao alterar permissão' });
    }
  };

  const remove = (userId: string, name: string) => {
    if (!board) return;
    Alert.alert('Remover acesso', `${name} deixa de ver este quadro.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeKanbanBoardShare(board.id, userId);
            await refresh();
          } catch (e: any) {
            Toast.show({ type: 'error', text1: e?.message || 'Falha ao remover' });
          }
        },
      },
    ]);
  };

  return (
    <>
      <Sheet
        visible={!!board}
        onClose={onClose}
        title="Compartilhar quadro"
        subtitle={board?.name}
        icon={Share2}
      >
        {sharesQuery.isLoading ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
        ) : shares.length === 0 ? (
          <Text style={styles.empty}>Ninguém tem acesso ainda</Text>
        ) : (
          <ScrollView style={{ maxHeight: 360 }} showsVerticalScrollIndicator={false}>
            {shares.map((sh) => (
              <View key={sh.id} style={styles.listRow}>
                <MemberAvatar name={sh.user.name} photoUrl={sh.user.profilePhotoUrl} size={34} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {sh.user.name}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {sh.user.email}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => void togglePermission(sh.userId, sh.permission)}
                  hitSlop={6}
                >
                  <Text style={[styles.restoreText, { color: colors.primary }]}>
                    {sh.permission === 'WRITE' ? 'Pode editar' : 'Só ver'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => remove(sh.userId, sh.user.name)} hitSlop={8}>
                  <Trash2 size={15} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}
        <TouchableOpacity style={styles.primaryBtn} onPress={() => setPickerOpen(true)}>
          <Text style={styles.primaryText}>Adicionar pessoa</Text>
        </TouchableOpacity>
      </Sheet>
      <MemberPickerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={add}
        excludeUserIds={shares.map((x) => x.userId)}
        title="Compartilhar com"
      />
    </>
  );
}

function getStyles(colors: any) {
  return StyleSheet.create({
    inputBox: {
      height: 52,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 16,
      backgroundColor: colors.background,
      marginBottom: 10,
    },
    inputText: { color: colors.text, fontSize: 16 },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 13,
      alignItems: 'center',
      marginTop: 6,
    },
    primaryText: { color: '#fff', fontWeight: '700' },
    empty: { textAlign: 'center', color: colors.textSecondary, marginVertical: 24 },
    listRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    rowTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
    rowMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    restoreText: { fontSize: 12, fontWeight: '700' },
  });
}
