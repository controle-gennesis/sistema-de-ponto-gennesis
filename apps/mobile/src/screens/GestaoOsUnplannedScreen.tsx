import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, MapPin } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import AppHeader from '../components/AppHeader';
import FormFieldLabel from '../components/FormFieldLabel';
import {
  createUnplannedWorkOrder,
  fetchFieldBuildings,
  fetchGestaoOsCategories,
  type GestaoOsFieldBuilding,
} from '../services/gestaoOs';
import type { RootStackParamList } from '../../App';

export default function GestaoOsUnplannedScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const queryClient = useQueryClient();

  const [building, setBuilding] = useState<GestaoOsFieldBuilding | null>(null);
  const [category, setCategory] = useState('Outros');
  const [description, setDescription] = useState('');
  const [picker, setPicker] = useState<'building' | 'category' | null>(null);
  const [loading, setLoading] = useState(false);

  const buildingsQuery = useQuery({
    queryKey: ['gestao-os-field-buildings'],
    queryFn: fetchFieldBuildings,
  });
  const categoriesQuery = useQuery({
    queryKey: ['gestao-os-categories'],
    queryFn: fetchGestaoOsCategories,
  });

  const buildings = buildingsQuery.data || [];
  const categories = (categoriesQuery.data || [])
    .map((row) => String((row as { name?: string }).name || '').trim())
    .filter(Boolean);
  const categoryOptions = categories.length ? categories : ['Elétrica', 'Hidráulica', 'Outros'];

  const onSubmit = async () => {
    if (!building) {
      Alert.alert('Localidade', 'Selecione a localidade atendida.');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Descrição', 'Descreva a ocorrência não prevista.');
      return;
    }
    try {
      setLoading(true);
      const wo = (await createUnplannedWorkOrder({
        category: category || 'Outros',
        description: description.trim(),
        buildingId: building.id,
        sectorId: building.sectorId,
        placeId: building.placeId,
      })) as { id?: string; displayNumber?: number };
      void queryClient.invalidateQueries({ queryKey: ['gestao-os-mine'] });
      Alert.alert(
        'Ocorrência registrada',
        wo?.displayNumber ? `Chamado #${wo.displayNumber} aberto.` : 'Chamado aberto.',
        [
          {
            text: 'Ver chamado',
            onPress: () => {
              if (wo?.id) navigation.replace('GestaoOsDetail', { id: wo.id });
              else navigation.goBack();
            },
          },
        ]
      );
    } catch (err) {
      Alert.alert('Erro', err instanceof Error ? err.message : 'Não foi possível abrir a ocorrência.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.safe}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AppHeader />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Ocorrência não prevista</Text>
        <Text style={styles.subtitle}>
          Informe o que aconteceu na localidade mesmo sem o QR do ativo.
        </Text>

        <FormFieldLabel label="Localidade" required style={styles.label} />
        <TouchableOpacity style={styles.select} onPress={() => setPicker('building')} activeOpacity={0.8}>
          <MapPin size={16} color={colors.textSecondary} />
          <Text style={[styles.selectText, !building && styles.placeholder]} numberOfLines={2}>
            {building
              ? `${building.name}${building.address ? ` · ${building.address}` : ''}`
              : 'Selecionar localidade'}
          </Text>
          <ChevronDown size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        <FormFieldLabel label="Categoria" required style={styles.label} />
        <TouchableOpacity style={styles.select} onPress={() => setPicker('category')} activeOpacity={0.8}>
          <Text style={styles.selectText}>{category}</Text>
          <ChevronDown size={16} color={colors.textSecondary} />
        </TouchableOpacity>

        <FormFieldLabel label="O que aconteceu" required style={styles.label} />
        <TextInput
          value={description}
          onChangeText={setDescription}
          placeholder="Ex.: vazamento na copa, porta danificada, falha elétrica..."
          placeholderTextColor={colors.textSecondary}
          multiline
          style={styles.input}
          textAlignVertical="top"
        />

        <TouchableOpacity
          style={[styles.primary, (loading || !building || !description.trim()) && { opacity: 0.55 }]}
          disabled={loading || !building || !description.trim()}
          onPress={() => void onSubmit()}
          activeOpacity={0.85}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Registrar ocorrência</Text>}
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={Boolean(picker)} transparent animationType="fade" onRequestClose={() => setPicker(null)}>
        <Pressable style={styles.backdrop} onPress={() => setPicker(null)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>
              {picker === 'building' ? 'Localidade' : 'Categoria'}
            </Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {(picker === 'building' ? buildings : categoryOptions.map((name) => ({ id: name, name }))).map(
                (item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.option}
                    onPress={() => {
                      if (picker === 'building') setBuilding(item as GestaoOsFieldBuilding);
                      else setCategory(item.name);
                      setPicker(null);
                    }}
                  >
                    <Text style={styles.optionText}>{item.name}</Text>
                    {(picker === 'building' ? building?.id === item.id : category === item.name) ? (
                      <Check size={16} color={colors.primary} />
                    ) : null}
                  </TouchableOpacity>
                )
              )}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const getStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: 'transparent' },
    content: { padding: 20, paddingBottom: 40 },
    title: { fontSize: 24, fontWeight: '800', color: colors.text },
    subtitle: { marginTop: 6, marginBottom: 18, color: colors.textSecondary, lineHeight: 20 },
    label: { marginTop: 12, marginBottom: 6 },
    select: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)',
      backgroundColor: colors.surface,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    selectText: { flex: 1, color: colors.text, fontSize: 15 },
    placeholder: { color: colors.textSecondary },
    input: {
      minHeight: 120,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)',
      backgroundColor: colors.surface,
      borderRadius: 12,
      padding: 12,
      color: colors.text,
      fontSize: 15,
    },
    primary: {
      marginTop: 22,
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
    },
    primaryText: { color: '#fff', fontWeight: '700', fontSize: 16 },
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      padding: 20,
    },
    sheet: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
    },
    sheetTitle: { fontSize: 16, fontWeight: '700', color: colors.text, marginBottom: 10 },
    option: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
    },
    optionText: { color: colors.text, fontSize: 15, flex: 1, paddingRight: 12 },
  });
