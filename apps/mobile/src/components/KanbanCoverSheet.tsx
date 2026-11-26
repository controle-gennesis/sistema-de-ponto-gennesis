import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Check, ImagePlus } from 'lucide-react-native';
import SheetModal, { SheetPrimaryButton } from './SheetModal';
import FormFieldLabel from './FormFieldLabel';
import { useTheme } from '../context/ThemeContext';
import { KANBAN_COVER_COLORS, normalizeCoverSize } from '../lib/kanbanCover';

type CoverSize = 'NORMAL' | 'FULL';

const SEGMENT_PAD = 4;
const SEGMENT_GAP = 4;

type Props = {
  visible: boolean;
  onClose: () => void;
  coverColor?: string | null;
  coverSize?: string | null;
  onSave: (coverColor: string | null, coverSize: CoverSize) => Promise<void> | void;
  /** Miniatura da foto de capa atual (URL completa). */
  imageUri?: string | null;
  /** Imagens já anexadas ao card, que podem virar capa. */
  attachmentImages?: Array<{ id: string; fileName: string; uri: string }>;
  /** Envia a foto escolhida (arquivo do aparelho ou URL de um anexo). */
  onPickImage?: (uri: string) => Promise<void>;
  onRemoveImage?: () => Promise<void>;
};

/** "Capa do card" no padrão de formulário: foto ou cor, tamanho e botão principal. */
export default function KanbanCoverSheet({
  visible,
  onClose,
  coverColor,
  coverSize,
  onSave,
  imageUri,
  attachmentImages = [],
  onPickImage,
  onRemoveImage,
}: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const [color, setColor] = useState<string | null>(coverColor ?? null);
  const [size, setSize] = useState<CoverSize>(normalizeCoverSize(coverSize));
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);

  // Fundo vermelho do seletor de tamanho: desliza entre «Faixa» (0) e «Card inteiro» (1).
  const slide = useRef(new Animated.Value(normalizeCoverSize(coverSize) === 'FULL' ? 1 : 0)).current;
  const [segmentWidth, setSegmentWidth] = useState(0);
  const itemWidth = segmentWidth > 0 ? (segmentWidth - SEGMENT_PAD * 2 - SEGMENT_GAP) / 2 : 0;

  useEffect(() => {
    Animated.spring(slide, {
      toValue: size === 'FULL' ? 1 : 0,
      useNativeDriver: true,
      speed: 16,
      bounciness: 6,
    }).start();
  }, [size, slide]);

  useEffect(() => {
    if (!visible) return;
    setColor(coverColor ?? null);
    setSize(normalizeCoverSize(coverSize));
    setSaving(false);
    // Só ao abrir: uma atualização do card em segundo plano não desfaz a escolha em andamento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const save = async (nextColor: string | null, nextSize: CoverSize) => {
    setSaving(true);
    try {
      await onSave(nextColor, nextSize);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const unchanged = color === (coverColor ?? null) && size === normalizeCoverSize(coverSize);
  const busy = saving || sending;

  const sendImage = async (uri: string) => {
    if (!onPickImage) return;
    setSending(true);
    try {
      await onPickImage(uri);
      // A foto substitui a cor.
      setColor(null);
    } catch (e: any) {
      Alert.alert('Foto de capa', e?.message || 'Não foi possível usar essa imagem');
    } finally {
      setSending(false);
    }
  };

  const pickFrom = async (source: 'library' | 'camera') => {
    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert(
        'Permissão',
        source === 'camera' ? 'Precisamos da câmera para tirar a foto.' : 'Precisamos da galeria para escolher a foto.',
      );
      return;
    }
    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
    };
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    if (result.canceled || !result.assets?.length) return;
    await sendImage(result.assets[0].uri);
  };

  const removePhoto = async () => {
    if (!onRemoveImage) return;
    setSending(true);
    try {
      await onRemoveImage();
      onClose();
    } catch (e: any) {
      Alert.alert('Foto de capa', e?.message || 'Não foi possível remover a capa');
    } finally {
      setSending(false);
    }
  };

  return (
    <SheetModal visible={visible} onClose={onClose} title="Capa">
      {onPickImage ? (
        <>
          <FormFieldLabel label="Foto" style={styles.label} />
          {imageUri ? <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="cover" /> : null}
          {sending ? (
            <View style={styles.sending}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.photoButtonText}>Salvando foto...</Text>
            </View>
          ) : (
            <View style={styles.photoRow}>
              <TouchableOpacity style={styles.photoButton} onPress={() => void pickFrom('library')} disabled={busy}>
                <ImagePlus size={17} color={colors.text} />
                <Text style={styles.photoButtonText}>Galeria</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.photoButton} onPress={() => void pickFrom('camera')} disabled={busy}>
                <Camera size={17} color={colors.text} />
                <Text style={styles.photoButtonText}>Câmera</Text>
              </TouchableOpacity>
            </View>
          )}
          {attachmentImages.length > 0 ? (
            <>
              <Text style={styles.hint}>Ou use um anexo do card</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbs}>
                {attachmentImages.map((att) => (
                  <TouchableOpacity
                    key={att.id}
                    onPress={() => void sendImage(att.uri)}
                    disabled={busy}
                    accessibilityLabel={`Usar ${att.fileName} como capa`}
                  >
                    <Image source={{ uri: att.uri }} style={styles.thumb} resizeMode="cover" />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          ) : null}
        </>
      ) : null}

      <FormFieldLabel label="Cor" style={styles.label} />
      <View style={styles.grid}>
        {KANBAN_COVER_COLORS.map((c) => {
          const active = color === c.key;
          return (
            <View key={c.key} style={styles.cell}>
              <TouchableOpacity
                style={[styles.swatch, { backgroundColor: c.hex }, active && styles.swatchActive]}
                onPress={() => setColor(c.key)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={c.label}
                accessibilityState={{ selected: active }}
              >
                {active ? <Check size={18} color="#fff" strokeWidth={3} /> : null}
              </TouchableOpacity>
            </View>
          );
        })}
      </View>

      <FormFieldLabel label="Tamanho" style={styles.label} />
      <View style={styles.segment} onLayout={(e) => setSegmentWidth(e.nativeEvent.layout.width)}>
        {itemWidth > 0 ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.segmentThumb,
              {
                width: itemWidth,
                transform: [
                  {
                    translateX: slide.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, itemWidth + SEGMENT_GAP],
                    }),
                  },
                ],
              },
            ]}
          />
        ) : null}
        {(['NORMAL', 'FULL'] as const).map((option) => {
          const active = size === option;
          return (
            <TouchableOpacity
              key={option}
              style={styles.segmentItem}
              onPress={() => setSize(option)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                {option === 'NORMAL' ? 'Faixa' : 'Card inteiro'}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={styles.action}>
        <SheetPrimaryButton
          label="Salvar"
          loading={saving}
          disabled={sending || (!color && !imageUri) || unchanged}
          onPress={() => void save(color, size)}
        />
        {coverColor || imageUri ? (
          <TouchableOpacity
            style={styles.remove}
            onPress={() => void (imageUri ? removePhoto() : save(null, 'NORMAL'))}
            disabled={busy}
          >
            <Text style={styles.removeText}>Remover capa</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </SheetModal>
  );
}

function getStyles(colors: any, isDark: boolean) {
  const line = isDark ? 'transparent' : 'rgba(15, 23, 42, 0.08)';
  const fieldBg = isDark ? colors.card : colors.surface;
  return StyleSheet.create({
    label: { fontSize: 13, fontWeight: '600', marginBottom: 8, letterSpacing: -0.1, color: colors.textSecondary },
    preview: { width: '100%', height: 120, borderRadius: 12, marginBottom: 8 },
    photoRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
    photoButton: {
      flex: 1,
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 12,
      backgroundColor: fieldBg,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: line,
    },
    photoButtonText: { fontSize: 14, fontWeight: '600', color: colors.text },
    sending: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 10 },
    hint: { fontSize: 12, color: colors.textSecondary, marginBottom: 6 },
    thumbs: { marginBottom: 12 },
    thumb: { width: 64, height: 56, borderRadius: 10, marginRight: 8 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, marginBottom: 10 },
    cell: { width: '20%', paddingHorizontal: 4, marginBottom: 8 },
    swatch: { height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    swatchActive: { borderWidth: 2.5, borderColor: colors.text },
    segment: {
      flexDirection: 'row',
      gap: SEGMENT_GAP,
      // A borda conta na largura medida: o recuo interno desconta ela.
      padding: SEGMENT_PAD - StyleSheet.hairlineWidth * 1.5,
      borderRadius: 14,
      backgroundColor: fieldBg,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: line,
    },
    segmentItem: { flex: 1, minHeight: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    segmentThumb: {
      position: 'absolute',
      top: SEGMENT_PAD - StyleSheet.hairlineWidth * 1.5,
      left: SEGMENT_PAD - StyleSheet.hairlineWidth * 1.5,
      bottom: SEGMENT_PAD - StyleSheet.hairlineWidth * 1.5,
      borderRadius: 11,
      backgroundColor: colors.primary,
    },
    segmentText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
    segmentTextActive: { color: '#fff', fontWeight: '700' },
    action: { marginTop: 22, paddingBottom: 6 },
    remove: { alignItems: 'center', paddingVertical: 12 },
    removeText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  });
}
