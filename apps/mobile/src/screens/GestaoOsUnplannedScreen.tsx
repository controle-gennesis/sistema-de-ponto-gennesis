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
import { Check, ChevronDown } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import AppHeader from '../components/AppHeader';
import FormFieldLabel from '../components/FormFieldLabel';
import {
  createUnplannedWorkOrder,
  fetchFieldPlaces,
  fetchGestaoOsCategories,
  type GestaoOsFieldPlace,
} from '../services/gestaoOs';
import type { RootStackParamList } from '../../App';

export default function GestaoOsUnplannedScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const queryClient = useQueryClient();

  const [place, setPlace] = useState<GestaoOsFieldPlace | null>(null);
  const [category, setCategory] = useState('Outros');
  const [description, setDescription] = useState('');
  const [picker, setPicker] = useState<'place' | 'category' | null>(null);
  const [loading, setLoading] = useState(false);

  const placesQuery = useQuery({
    queryKey: ['gestao-os-field-places'],
    queryFn: fetchFieldPlaces,
  });
  const categoriesQuery = useQuery({
    queryKey: ['gestao-os-categories'],
    queryFn: fetchGestaoOsCategories,
  });

  const places = placesQuery.data || [];
  const categories = (categoriesQuery.data || [])
    .map((row) => String((row as { name?: string }).name || '').trim())
    .filter(Boolean);
  const categoryOptions = categories.length ? categories : ['Elétrica', 'Hidráulica', 'Outros'];

  const onSubmit = async () => {
    if (!place) {
      Alert.alert('Local', 'Selecione o local.');
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
        buildingId: place.buildingId,
        sectorId: place.sectorId,
        placeId: place.placeId,
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
      <AppHeader showBack title="Ocorrência não prevista" onBack={() => navigation.goBack()} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.subtitle}>
          Informe o que aconteceu na localidade mesmo sem o QR do ativo.
        </Text>

        <FormFieldLabel label="Local" required style={styles.label} />
        <TouchableOpacity style={styles.select} onPress={() => setPicker('place')} activeOpacity={0.8}>
          <Text style={[styles.selectText, !place && styles.placeholder]} numberOfLines={2}>
            {place
              ? [place.name, place.buildingName].filter(Boolean).join(' · ')
              : 'Selecionar local'}
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
          style={[styles.primary, (loading || !place || !description.trim()) && { opacity: 0.55 }]}
          disabled={loading || !place || !description.trim()}
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
              {picker === 'place' ? 'Local' : 'Categoria'}
            </Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {picker === 'place' && places.length === 0 ? (
                <Text style={styles.optionSub}>Nenhum local cadastrado.</Text>
              ) : (
                (picker === 'place' ? places : categoryOptions.map((name) => ({ id: name, name }))).map(
                  (item) => (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.option}
                      onPress={() => {
                        if (picker === 'place') setPlace(item as GestaoOsFieldPlace);
                        else setCategory(item.name);
                        setPicker(null);
                      }}
                    >
                      <View style={{ flex: 1, paddingRight: 12 }}>
                        <Text style={styles.optionText}>{item.name}</Text>
                        {picker === 'place' && 'buildingName' in item && item.buildingName ? (
                          <Text style={styles.optionSub}>
                            {[item.buildingName, (item as GestaoOsFieldPlace).sectorName]
                              .filter(Boolean)
                              .join(' · ')}
                          </Text>
                        ) : null}
                      </View>
                      {(picker === 'place' ? place?.id === item.id : category === item.name) ? (
                        <Check size={16} color={colors.primary} />
                      ) : null}
                    </TouchableOpacity>
                  )
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
    safe: { flex: 1, backgroundColor: colors.screenRoot },
    content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },
    subtitle: { marginBottom: 18, color: colors.textSecondary, lineHeight: 20, fontSize: 14 },
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
    optionText: { color: colors.text, fontSize: 15 },
    optionSub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  });
