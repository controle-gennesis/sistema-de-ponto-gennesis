import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import {
  BookOpen,
  CalendarDays,
  CarFront,
  Clock,
  Fuel,
  Inbox,
  ListChecks,
  SquareKanban,
  Wrench,
  type LucideIcon,
} from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { usePermissions } from '../hooks/usePermissions';
import { useTabBadges, type TabBadgeRoute } from '../navigation/useTabBadges';

type Shortcut = {
  key: string;
  label: string;
  icon: LucideIcon;
  onPress: () => void;
  /** Aba que mostra a bolinha de "teve atualização" no atalho. */
  badgeRoute?: TabBadgeRoute;
};

const TILE = 64;
const ITEM_WIDTH = 76;

/**
 * Acesso rápido da tela inicial: atalhos em quadrados arredondados (ícone em cima, nome embaixo)
 * numa faixa que rola para o lado. Só aparecem as áreas que a pessoa tem permissão de abrir.
 */
export default function HomeQuickAccess() {
  const navigation = useNavigation<any>();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const { canSeeCombustivel, canSeeReservas, canSeeDpRequests, canSeeGestaoOs, canSeePonto, can } =
    usePermissions();
  const badges = useTabBadges();

  const goTab = (screen: TabBadgeRoute) => navigation.navigate('Main', { screen });

  const shortcuts: Shortcut[] = [
    { key: 'tasks', label: 'Tasks', icon: SquareKanban, onPress: () => navigation.navigate('KanbanBoard', {}) },
    {
      key: 'agenda',
      label: 'Agenda',
      icon: CalendarDays,
      onPress: () => navigation.navigate('Agenda', { mode: 'agenda' }),
    },
    {
      key: 'tarefas',
      label: 'Tarefas',
      icon: ListChecks,
      onPress: () => navigation.navigate('Agenda', { mode: 'tasks' }),
    },
    ...(can('ponto_diario-obra')
      ? [{ key: 'diario-obra', label: 'Diários de Obra', icon: BookOpen, onPress: () => navigation.navigate('DiarioObra') }]
      : []),
    ...(canSeePonto
      ? [{ key: 'registros', label: 'Registros de ponto', icon: Clock, onPress: () => navigation.navigate('TimeRecords') }]
      : []),
    ...(canSeeCombustivel
      ? [
          {
            key: 'combustivel',
            label: 'Abastecimento',
            icon: Fuel,
            onPress: () => goTab('Combustivel'),
            badgeRoute: 'Combustivel' as const,
          },
        ]
      : []),
    ...(canSeeReservas
      ? [{ key: 'frota', label: 'Frota', icon: CarFront, onPress: () => goTab('Reservas'), badgeRoute: 'Reservas' as const }]
      : []),
    ...(canSeeDpRequests
      ? [
          {
            key: 'solicitacoes',
            label: 'Solicitações',
            icon: Inbox,
            onPress: () => goTab('DpRequests'),
            badgeRoute: 'DpRequests' as const,
          },
        ]
      : []),
    ...(canSeeGestaoOs
      ? [{ key: 'chamados', label: 'Chamados', icon: Wrench, onPress: () => goTab('GestaoOs'), badgeRoute: 'GestaoOs' as const }]
      : []),
  ];

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Acesso rápido</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.row}
      >
        {shortcuts.map(({ key, label, icon: Icon, onPress, badgeRoute }) => {
          const hasBadge = badgeRoute ? badges[badgeRoute] !== undefined : false;
          return (
            <TouchableOpacity
              key={key}
              style={styles.item}
              activeOpacity={0.7}
              onPress={onPress}
              accessibilityRole="button"
              accessibilityLabel={hasBadge ? `${label}, com novidades` : label}
            >
              <View style={styles.tile}>
                <Icon size={26} color={colors.text} strokeWidth={1.8} />
                {hasBadge ? <View style={styles.dot} /> : null}
              </View>
              <Text style={styles.label} numberOfLines={2}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

function getStyles(colors: any, isDark: boolean) {
  return StyleSheet.create({
    wrap: { marginBottom: 20 },
    title: {
      fontSize: 15,
      fontWeight: '700',
      letterSpacing: -0.2,
      color: colors.text,
      marginBottom: 12,
    },
    // A tela tem 20 de margem lateral: a faixa sangra até a borda para rolar de ponta a ponta.
    scroll: { marginHorizontal: -20 },
    row: { paddingHorizontal: 20, gap: 8 },
    item: { width: ITEM_WIDTH, alignItems: 'center' },
    tile: {
      width: TILE,
      height: TILE,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? colors.border : 'rgba(15, 23, 42, 0.08)',
    },
    dot: {
      position: 'absolute',
      top: 8,
      right: 8,
      width: 10,
      height: 10,
      borderRadius: 5,
      backgroundColor: colors.primary,
      borderWidth: 2,
      borderColor: colors.surface,
    },
    label: {
      marginTop: 8,
      fontSize: 12,
      lineHeight: 15,
      fontWeight: '500',
      textAlign: 'center',
      color: colors.textSecondary,
    },
  });
}
