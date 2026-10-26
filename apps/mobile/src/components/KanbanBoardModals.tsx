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
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
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
    <Sheet visible={!!column} onClose={onClose} title="Editar coluna" subtitle="Nome, cor e limite de cards" icon={Pencil}>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Nome da coluna"
        placeholderTextColor={colors.textSecondary}
        style={styles.input}
      />
      <Text style={styles.fieldLabel}>Cor</Text>
      <View style={styles.swatchRow}>
        {KANBAN_COLUMN_COLORS.map((c) => (
          <TouchableOpacity
            key={c}
            onPress={() => setColor(c)}
            style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchActive]}
          />
        ))}
      </View>
      <Text style={styles.fieldLabel}>Limite de cards (opcional)</Text>
      <TextInput
        value={limit}
        onChangeText={(t) => setLimit(t.replace(/\D/g, ''))}
        placeholder="Sem limite"
        placeholderTextColor={colors.textSecondary}
        keyboardType="number-pad"
        style={styles.input}
      />
      <TouchableOpacity style={styles.primaryBtn} onPress={() => void save()} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Salvar</Text>}
      </TouchableOpacity>
      <TouchableOpacity style={styles.dangerBtn} onPress={remove}>
        <Trash2 size={16} color={colors.error} />
        <Text style={[styles.dangerText, { color: colors.error }]}>Excluir coluna</Text>
      </TouchableOpacity>
    </Sheet>
  );
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
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
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
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Cards arquivados"
      subtitle="Restaure um card para ele voltar ao quadro"
      icon={Archive}
    >
      {archivedQuery.isLoading ? (
        <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
      ) : list.length === 0 ? (
        <Text style={styles.empty}>Nenhum card arquivado</Text>
      ) : (
        <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
          {list.map((c) => (
            <View key={c.id} style={styles.listRow}>
              <TouchableOpacity
                style={{ flex: 1 }}
                activeOpacity={0.7}
                onPress={() => {
                  onClose();
                  onOpenCard(c.id);
                }}
              >
                <Text style={styles.rowTitle} numberOfLines={2}>
                  {c.title || 'Sem título'}
                </Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {c.columnTitle}
                </Text>
              </TouchableOpacity>
              {canWrite ? (
                <TouchableOpacity
                  style={styles.restoreBtn}
                  onPress={() => void restore(c.id)}
                  hitSlop={6}
                >
                  <ArchiveRestore size={15} color={colors.primary} />
                  <Text style={[styles.restoreText, { color: colors.primary }]}>Restaurar</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ))}
        </ScrollView>
      )}
    </Sheet>
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
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
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
    <Sheet
      visible={visible}
      onClose={onClose}
      title={editing === null ? 'Etiquetas do quadro' : 'Editar etiqueta'}
      subtitle={
        editing === null ? 'Toque numa etiqueta para mudar nome e cor' : 'Escolha o nome e a cor'
      }
      icon={Tag}
    >
      {editing === null ? (
        <>
          <ScrollView
            style={{ maxHeight: Dimensions.get('window').height * 0.45 }}
            showsVerticalScrollIndicator={false}
          >
            {draft.map((p, i) => {
              const fg = labelTextColor(p.color);
              return (
                <TouchableOpacity
                  key={i}
                  activeOpacity={0.85}
                  style={[styles.labelOption, { backgroundColor: p.color }]}
                  onPress={() => openEdit(i)}
                >
                  <Text style={[styles.labelOptionText, { color: fg }]} numberOfLines={1}>
                    {p.name || 'Sem nome'}
                  </Text>
                  <Pencil size={15} color={fg} />
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity style={styles.addLabelBtn} onPress={openNew}>
            <Plus size={16} color={colors.primary} />
            <Text style={[styles.linkText, { color: colors.primary }]}>Nova etiqueta</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => void save()}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.primaryText}>Salvar</Text>
            )}
          </TouchableOpacity>
        </>
      ) : (
        <>
          <View style={[styles.labelPreview, { backgroundColor: editColor }]}>
            <Text style={[styles.labelPreviewText, { color: previewFg }]} numberOfLines={1}>
              {editName.trim() || 'Etiqueta'}
            </Text>
          </View>

          <TextInput
            value={editName}
            onChangeText={setEditName}
            placeholder="Nome da etiqueta"
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
            autoCorrect={false}
          />

          <Text style={styles.fieldLabel}>Cor</Text>
          <View style={styles.colorGrid}>
            {LABEL_COLORS.map((c) => {
              const taken = usedByOthers.has(c.toLowerCase());
              const active = c.toLowerCase() === editColor.toLowerCase();
              return (
                <TouchableOpacity
                  key={c}
                  disabled={taken}
                  onPress={() => setEditColor(c)}
                  activeOpacity={0.8}
                  style={[
                    styles.colorTile,
                    { backgroundColor: c },
                    active && styles.colorTileActive,
                    taken && { opacity: 0.25 },
                  ]}
                >
                  {active ? <Check size={18} color={labelTextColor(c)} strokeWidth={3} /> : null}
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity style={styles.primaryBtn} onPress={applyEdit}>
            <Text style={styles.primaryText}>Concluído</Text>
          </TouchableOpacity>
          <View style={styles.editFooter}>
            <TouchableOpacity onPress={closeEdit} hitSlop={8}>
              <Text style={[styles.linkText, { color: colors.textSecondary }]}>Voltar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={removeEdit} hitSlop={8}>
              <Text style={[styles.linkText, { color: colors.error }]}>Excluir etiqueta</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </Sheet>
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
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Nome do quadro"
        placeholderTextColor={colors.textSecondary}
        style={styles.input}
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
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 18,
      paddingTop: 8,
      paddingBottom: Platform.OS === 'ios' ? 28 : 18,
      maxHeight: '85%',
      borderTopWidth: 1,
      borderColor: colors.border,
    },
    handle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginBottom: 12,
    },
    head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
    title: { fontSize: 17, fontWeight: '700', color: colors.text },
    subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 2 },
    close: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 15,
      backgroundColor: colors.background,
      color: colors.text,
      fontSize: 16,
      marginBottom: 10,
    },
    fieldLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginBottom: 8,
    },
    swatchRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 14 },
    swatch: { width: 32, height: 32, borderRadius: 16 },
    swatchActive: { borderWidth: 3, borderColor: colors.text },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 13,
      alignItems: 'center',
      marginTop: 6,
    },
    primaryText: { color: '#fff', fontWeight: '700' },
    dangerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 14,
    },
    dangerText: { fontWeight: '600' },
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
    restoreBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    restoreText: { fontSize: 12, fontWeight: '700' },
    toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
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
    labelOption: {
      minHeight: 44,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 8,
    },
    labelOptionText: { flex: 1, fontSize: 14, fontWeight: '700' },
    labelCheck: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    linkBtn: { alignItems: 'center', paddingVertical: 10 },
    linkText: { fontSize: 13, fontWeight: '700' },
    labelPreview: {
      minHeight: 48,
      borderRadius: 12,
      paddingHorizontal: 16,
      justifyContent: 'center',
      marginBottom: 14,
    },
    labelPreviewText: { fontSize: 15, fontWeight: '700' },
    colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 6 },
    colorTile: {
      width: 44,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    colorTileActive: { borderWidth: 3, borderColor: colors.text },
    editFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 14,
    },
    labelEditRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    labelDot: { width: 28, height: 28, borderRadius: 14 },
    labelDotActive: { borderWidth: 3, borderColor: colors.text },
    addLabelBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 10,
    },
  });
}
