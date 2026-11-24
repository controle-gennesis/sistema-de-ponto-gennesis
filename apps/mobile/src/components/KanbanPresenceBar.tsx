import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { MemberAvatar } from './KanbanMemberUi';
import type { KanbanPresence } from '../lib/kanbanCollab';

const MAX_VISIBLE = 4;

/** Texto do que a pessoa está fazendo (para a etiqueta do cartão). */
export function presenceActionLabel(state: KanbanPresence['state']): string {
  if (state === 'dragging') return 'movendo';
  if (state === 'editing') return 'editando';
  return 'no quadro';
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** Fotos de quem está com o quadro aberto agora (sem mim), no estilo Google Docs. */
export default function KanbanPresenceBar({
  users,
  selfId,
}: {
  users: KanbanPresence[];
  selfId: string | null;
}) {
  const { colors, isDark } = useTheme();
  const others = users.filter((u) => u.userId !== selfId);
  if (others.length === 0) return null;
  const visible = others.slice(0, MAX_VISIBLE);
  const hidden = others.length - visible.length;
  const surface = isDark ? '#111827' : '#ffffff';

  return (
    <View
      style={styles.row}
      accessibilityLabel={`${others.length} ${others.length === 1 ? 'pessoa' : 'pessoas'} no quadro agora`}
    >
      {visible.map((u, i) => (
        <View key={u.userId} style={[styles.item, i > 0 && { marginLeft: -9 }]}>
          <MemberAvatar name={u.name} photoUrl={u.profilePhotoUrl} color={u.color} size={28} ring={u.color} />
          <View style={[styles.dot, { borderColor: surface }]} />
        </View>
      ))}
      {hidden > 0 ? (
        <View
          style={[
            styles.more,
            { marginLeft: -9, backgroundColor: isDark ? '#374151' : '#e5e7eb', borderColor: surface },
          ]}
        >
          <Text style={[styles.moreText, { color: colors.text }]}>+{hidden}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 8, paddingRight: 14 },
  item: { width: 28, height: 28 },
  dot: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#22c55e',
    borderWidth: 2,
  },
  more: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  moreText: { fontSize: 10, fontWeight: '800' },
});
