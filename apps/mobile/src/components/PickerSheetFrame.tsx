import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { Search } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';

type Props = {
  title: string;
  onClose: () => void;
  search: string;
  onSearchChange: (value: string) => void;
  /** A lista de opções (normalmente uma FlatList com `style={{ flex: 1 }}`). */
  children: React.ReactNode;
};

/**
 * Folha de seleção (lista com busca) no mesmo visual da "Recuperar senha" do login: colada no fim da
 * tela, cantos de 28, título centralizado e campo de busca arredondado — sem o ícone do topo.
 * Renderizar como overlay absoluto dentro do formulário (é um View, não um Modal).
 */
export default function PickerSheetFrame({ title, onClose, search, onSearchChange, children }: Props) {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const backdrop = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(0)).current;

  const C = useMemo(
    () => ({
      sheet: isDark ? '#111827' : '#ffffff',
      title: isDark ? '#f9fafb' : '#111827',
      inputBg: isDark ? '#1f2937' : '#ffffff',
      inputBorder: isDark ? '#374151' : '#e5e7eb',
      inputText: isDark ? '#f9fafb' : '#111827',
      icon: '#9ca3af',
    }),
    [isDark],
  );

  useEffect(() => {
    Animated.parallel([
      Animated.timing(backdrop, { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(slide, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, [backdrop, slide]);

  return (
    <View collapsable={false} style={styles.overlay}>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.55)', opacity: backdrop }]}
      />
      <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
      <Animated.View
        style={{ transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [520, 0] }) }] }}
      >
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: C.sheet,
              height: Math.round(height * 0.62),
              paddingBottom: Math.max(insets.bottom, 18) + 8,
            },
          ]}
        >
          <Text style={[styles.title, { color: C.title }]}>{title}</Text>
          <View style={[styles.searchBox, { backgroundColor: C.inputBg, borderColor: C.inputBorder }]}>
            <Search size={18} color={C.icon} />
            <TextInput
              style={[styles.searchInput, { color: C.inputText }]}
              placeholder="Buscar..."
              placeholderTextColor={C.icon}
              value={search}
              onChangeText={onSearchChange}
            />
          </View>
          <View style={{ flex: 1 }}>{children}</View>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    zIndex: 99999,
    elevation: 99999,
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 24,
    paddingHorizontal: 22,
  },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.3, textAlign: 'center', marginBottom: 18 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 50,
    marginBottom: 12,
  },
  searchInput: { flex: 1, paddingVertical: 0, fontSize: 16 },
});
