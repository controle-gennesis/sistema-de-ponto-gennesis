import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Pressable,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Check, QrCode, Wrench } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import AppHeader from '../components/AppHeader';
import FormFieldLabel from '../components/FormFieldLabel';
import { createWorkOrderFromQr, resolveAssetQr, saveCloseQrToken } from '../services/gestaoOs';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'GestaoOsQr'>;

type CreatedWorkOrder = {
  id: string;
  displayNumber: number;
};

export default function GestaoOsQrScreen({ route, navigation }: Props) {
  const { token } = route.params;
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [createdWo, setCreatedWo] = useState<CreatedWorkOrder | null>(null);
  const [resolved, setResolved] = useState<{
    kind?: string;
    id?: string;
    name: string;
    category?: string | null;
    buildingId?: string;
    sectorId?: string;
    placeId?: string;
    locationLabel?: string;
    closeToken?: string;
    qrToken?: string;
  } | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const data = await resolveAssetQr(token);
        if (!cancelled) setResolved(data);
      } catch (err) {
        if (!cancelled) {
          Alert.alert('QR inválido', (err as Error).message, [
            { text: 'Voltar', onPress: () => navigation.goBack() },
          ]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, navigation]);

  const isClose = resolved?.kind === 'building-close';

  const onSaveClose = async () => {
    const close =
      resolved?.closeToken || resolved?.qrToken || token.replace(/^gennesis-os-close:/, '');
    await saveCloseQrToken(close);
    Alert.alert(
      'QR da localidade',
      'Token salvo. Abra a OS e toque em Concluir serviço para encerrar com este QR.',
    );
    navigation.goBack();
  };

  const onCreate = async () => {
    if (isClose) {
      await onSaveClose();
      return;
    }
    if (!resolved?.buildingId) {
      Alert.alert('Ativo sem prédio vinculado');
      return;
    }
    if (!resolved?.sectorId || !resolved?.placeId) {
      Alert.alert('Ativo sem andar ou local vinculado');
      return;
    }
    if (!description.trim()) {
      Alert.alert('Descreva o problema');
      return;
    }
    try {
      setLoading(true);
      const wo = await createWorkOrderFromQr({
        category: resolved.category || 'Manutenção',
        description: description.trim(),
        buildingId: resolved.buildingId,
        sectorId: resolved.sectorId,
        placeId: resolved.placeId,
        assetId: resolved.id,
        origin: 'UNPLANNED',
      });
      setCreatedWo({ id: wo.id, displayNumber: wo.displayNumber });
      void queryClient.invalidateQueries({ queryKey: ['gestao-os-mine'] });
      void queryClient.invalidateQueries({ queryKey: ['gestao-os-assigned'] });
    } catch (err) {
      Alert.alert('Erro', (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const goToCreatedWorkOrder = () => {
    if (!createdWo) return;
    setCreatedWo(null);
    // Solicitante só acompanha: volta à lista (modal ao tocar no card)
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.navigate('Main' as never);
  };

  return (
    <View style={styles.safeArea}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AppHeader
        showBack
        title={isClose ? 'QR da localidade' : 'Abrir chamado'}
        onBack={() => navigation.goBack()}
        rightAction={<View style={{ width: 44 }} />}
      />

      {loading && !resolved ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
          <Text style={styles.loadingText}>Lendo QR...</Text>
        </View>
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={styles.container}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingBottom: Math.max(insets.bottom, 16) + 24 },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.assetHero}>
              <View style={styles.assetIconWrap}>
                {isClose ? (
                  <QrCode size={22} color={colors.primary} strokeWidth={2.2} />
                ) : (
                  <Wrench size={22} color={colors.primary} strokeWidth={2.2} />
                )}
              </View>
              <Text style={styles.assetName}>
                {resolved?.name || (isClose ? 'Localidade' : 'Ativo')}
              </Text>
              {resolved?.category ? (
                <Text style={styles.assetCategory}>{resolved.category}</Text>
              ) : null}
              {!isClose && resolved?.locationLabel ? (
                <Text style={styles.assetLocation}>
                  {resolved.locationLabel}
                </Text>
              ) : null}
              {isClose ? (
                <Text style={styles.assetLocation}>
                  Use este QR para encerrar a OS no campo.
                </Text>
              ) : null}
            </View>

            {isClose ? (
              <TouchableOpacity
                style={[styles.primaryBtn, loading && { opacity: 0.7 }]}
                disabled={loading}
                onPress={() => void onSaveClose()}
                activeOpacity={0.85}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Usar para encerrar OS</Text>
                )}
              </TouchableOpacity>
            ) : (
              <>
                <FormFieldLabel
                  label="Descrição do problema"
                  required
                  style={styles.fieldLabel}
                />
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Ex.: vazamento na junta, ruído anormal, falha no acionamento..."
                  placeholderTextColor={colors.textSecondary}
                  multiline
                  style={styles.input}
                  textAlignVertical="top"
                />

                <TouchableOpacity
                  style={[
                    styles.primaryBtn,
                    (loading || !description.trim()) && { opacity: 0.7 },
                  ]}
                  disabled={loading || !description.trim()}
                  onPress={() => void onCreate()}
                  activeOpacity={0.85}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.primaryBtnText}>Abrir chamado</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      )}

      <Modal
        visible={Boolean(createdWo)}
        transparent
        animationType="fade"
        onRequestClose={goToCreatedWorkOrder}
      >
        <Pressable style={styles.successBackdrop} onPress={goToCreatedWorkOrder}>
          <Pressable style={styles.successCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.successIconRing}>
              <View style={styles.successIcon}>
                <Check size={28} color="#fff" strokeWidth={3} />
              </View>
            </View>

            <Text style={styles.successTitle}>Chamado aberto</Text>
            <Text style={styles.successSubtitle}>
              Sua solicitação foi registrada e seguirá para análise.
            </Text>

            {createdWo ? (
              <View style={styles.successBadge}>
                <Text style={styles.successBadgeLabel}>Número</Text>
                <Text style={styles.successBadgeValue}>#{createdWo.displayNumber}</Text>
              </View>
            ) : null}

            {resolved?.name ? (
              <Text style={styles.successMeta} numberOfLines={2}>
                {resolved.name}
              </Text>
            ) : null}

            <TouchableOpacity
              style={styles.successBtn}
              onPress={goToCreatedWorkOrder}
              activeOpacity={0.88}
            >
              <Text style={styles.successBtnText}>Ir para chamados</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const getStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.screenRoot },
    container: { flex: 1, backgroundColor: colors.screenRoot },
    scrollContent: { paddingHorizontal: 20, paddingTop: 8 },
    loadingWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
    },
    loadingText: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '500',
    },
    assetHero: {
      alignItems: 'center',
      paddingHorizontal: 8,
      marginBottom: 24,
      marginTop: 4,
    },
    assetIconWrap: {
      width: 52,
      height: 52,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(206,55,54,0.16)' : 'rgba(206,55,54,0.1)',
      marginBottom: 14,
    },
    assetName: {
      color: colors.text,
      fontSize: 22,
      fontWeight: '700',
      letterSpacing: -0.4,
      textAlign: 'center',
      marginBottom: 6,
    },
    assetCategory: {
      color: colors.primary,
      fontSize: 12,
      fontWeight: '700',
      marginBottom: 10,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
      textAlign: 'center',
    },
    assetLocation: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '500',
      lineHeight: 18,
      textAlign: 'center',
      paddingHorizontal: 8,
    },
    fieldLabel: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '700',
      marginBottom: 8,
    },
    input: {
      minHeight: 140,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 14,
      fontSize: 15,
      fontWeight: '500',
      color: colors.text,
      backgroundColor: colors.card,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: isDark ? colors.border : 'rgba(15, 23, 42, 0.08)',
      marginBottom: 18,
    },
    primaryBtn: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 54,
    },
    primaryBtnText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: -0.2,
    },
    successBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.55)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 28,
    },
    successCard: {
      width: '100%',
      maxWidth: 340,
      borderRadius: 22,
      paddingHorizontal: 22,
      paddingTop: 28,
      paddingBottom: 20,
      backgroundColor: colors.card,
      alignItems: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? colors.border : 'rgba(15, 23, 42, 0.06)',
      shadowColor: '#0f172a',
      shadowOpacity: isDark ? 0.35 : 0.16,
      shadowRadius: 24,
      shadowOffset: { width: 0, height: 12 },
      elevation: 10,
    },
    successIconRing: {
      width: 72,
      height: 72,
      borderRadius: 36,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(22, 163, 74, 0.18)' : 'rgba(22, 163, 74, 0.12)',
      marginBottom: 16,
    },
    successIcon: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#16a34a',
    },
    successTitle: {
      color: colors.text,
      fontSize: 20,
      fontWeight: '800',
      letterSpacing: -0.4,
      textAlign: 'center',
      marginBottom: 6,
    },
    successSubtitle: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '500',
      lineHeight: 20,
      textAlign: 'center',
      marginBottom: 18,
      paddingHorizontal: 4,
    },
    successBadge: {
      minWidth: 140,
      alignItems: 'center',
      paddingVertical: 12,
      paddingHorizontal: 18,
      borderRadius: 14,
      backgroundColor: isDark ? 'rgba(206,55,54,0.16)' : 'rgba(206,55,54,0.08)',
      marginBottom: 10,
    },
    successBadgeLabel: {
      color: colors.textSecondary,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      marginBottom: 2,
    },
    successBadgeValue: {
      color: colors.primary,
      fontSize: 26,
      fontWeight: '800',
      letterSpacing: -0.6,
    },
    successMeta: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '500',
      textAlign: 'center',
      marginBottom: 18,
      paddingHorizontal: 8,
    },
    successBtn: {
      width: '100%',
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: 52,
    },
    successBtnText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: -0.2,
    },
  });
