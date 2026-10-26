import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Check, Search, UserPlus } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import KanbanSheet from './KanbanSheet';
import UserAvatar from './UserAvatar';
import { fetchKanbanPickerUsers, type KanbanPickerUser } from '../services/kanban';

export function memberInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '';
  return `${first}${last}`.toUpperCase();
}

/** Avatar do membro: foto quando existe, senão as iniciais sobre a cor do usuário. */
export function MemberAvatar({
  name,
  photoUrl,
  color,
  size = 28,
  ring,
}: {
  name: string;
  photoUrl?: string | null;
  color?: string | null;
  size?: number;
  ring?: string;
}) {
  const bg = color || '#6b7280';
  if (photoUrl) {
    return (
      <UserAvatar
        uri={photoUrl}
        size={size}
        backgroundColor={bg}
        borderColor={ring}
        borderWidth={ring ? 2 : 0}
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: bg,
        alignItems: 'center',
        justifyContent: 'center',
        borderColor: ring,
        borderWidth: ring ? 2 : 0,
      }}
    >
      <Text style={{ color: '#fff', fontSize: Math.round(size * 0.38), fontWeight: '800' }}>
        {memberInitials(name)}
      </Text>
    </View>
  );
}

/** Folha de seleção de pessoas (membros do card, responsável de tarefa...). */
export function MemberPickerSheet({
  visible,
  onClose,
  onSelect,
  excludeUserIds = [],
  title = 'Adicionar pessoa',
}: {
  visible: boolean;
  onClose: () => void;
  onSelect: (user: KanbanPickerUser) => void | Promise<void>;
  excludeUserIds?: string[];
  title?: string;
}) {
  const { colors } = useTheme();
  const styles = useMemo(() => getStyles(colors), [colors]);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: ['kanban-picker-users'],
    queryFn: fetchKanbanPickerUsers,
    enabled: visible,
    staleTime: 60_000,
  });

  const users = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (usersQuery.data ?? []).filter((u) => {
      if (excludeUserIds.includes(u.id)) return false;
      if (!q) return true;
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    });
  }, [usersQuery.data, search, excludeUserIds]);

  const pick = async (u: KanbanPickerUser) => {
    setBusyId(u.id);
    try {
      await onSelect(u);
      setSearch('');
      onClose();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <KanbanSheet visible={visible} onClose={onClose} title={title} subtitle="Busque pelo nome ou e-mail" icon={UserPlus}>
          <View style={styles.searchWrap}>
            <Search size={16} color={colors.textSecondary} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Buscar pessoa..."
              placeholderTextColor={colors.textSecondary}
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
              autoComplete="off"
            />
          </View>
          {usersQuery.isLoading ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: 24 }} />
          ) : (
            <ScrollView
              style={styles.list}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {users.length === 0 ? (
                <Text style={styles.empty}>Nenhuma pessoa encontrada</Text>
              ) : (
                users.map((u) => (
                  <TouchableOpacity
                    key={u.id}
                    style={styles.row}
                    activeOpacity={0.7}
                    disabled={busyId !== null}
                    onPress={() => void pick(u)}
                  >
                    <MemberAvatar name={u.name} photoUrl={u.profilePhotoUrl} size={34} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.name} numberOfLines={1}>
                        {u.name}
                      </Text>
                      <Text style={styles.email} numberOfLines={1}>
                        {u.email}
                      </Text>
                    </View>
                    {busyId === u.id ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Check size={16} color="transparent" />
                    )}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          )}
    </KanbanSheet>
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
      maxHeight: '80%',
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
    head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    title: { fontSize: 17, fontWeight: '700', color: colors.text },
    close: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
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
    list: {
      minHeight: Dimensions.get('window').height * 0.38,
      maxHeight: Dimensions.get('window').height * 0.5,
    },
    empty: { textAlign: 'center', color: colors.textSecondary, marginVertical: 24 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 10,
      paddingHorizontal: 4,
    },
    name: { fontSize: 14, fontWeight: '600', color: colors.text },
    email: { fontSize: 12, color: colors.textSecondary },
  });
}
