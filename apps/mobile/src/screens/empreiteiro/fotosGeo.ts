import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import type { GeoPhoto } from '../../services/empreiteiros';

async function posicaoAtual(): Promise<{ latitude: number; longitude: number; accuracy: number | null } | null> {
  const perm = await Location.requestForegroundPermissionsAsync();
  if (perm.status !== 'granted') {
    Alert.alert('Localização', 'Precisamos da localização para registrar o local da foto.');
    return null;
  }
  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return {
      latitude: pos.coords.latitude,
      longitude: pos.coords.longitude,
      accuracy: pos.coords.accuracy ?? null,
    };
  } catch {
    Alert.alert('Localização', 'Não foi possível obter a localização. Tente novamente em um local aberto.');
    return null;
  }
}

/** Tira (ou escolhe) uma foto e grava junto data, hora e local do GPS. */
export async function capturarFotoComLocal(fonte: 'camera' | 'galeria'): Promise<GeoPhoto | null> {
  if (fonte === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permissão', 'Precisamos da câmera para registrar a foto.');
      return null;
    }
  } else {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permissão', 'Precisamos acessar suas fotos para escolher a imagem.');
      return null;
    }
  }

  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.5,
    base64: true,
  };
  const result =
    fonte === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets[0]?.base64) return null;

  const pos = await posicaoAtual();
  if (!pos) return null;

  const asset = result.assets[0];
  const mime = asset.mimeType || 'image/jpeg';
  return {
    url: `data:${mime};base64,${asset.base64}`,
    name: asset.fileName || `foto-${Date.now()}.jpg`,
    latitude: pos.latitude,
    longitude: pos.longitude,
    accuracy: pos.accuracy,
    capturedAt: new Date().toISOString(),
  };
}

/** Pergunta se a foto vem da câmera ou da galeria. */
export function escolherFonteFoto(): Promise<'camera' | 'galeria' | null> {
  return new Promise((resolve) => {
    Alert.alert(
      'Adicionar foto',
      'De onde vem a foto?',
      [
        { text: 'Câmera', onPress: () => resolve('camera') },
        { text: 'Galeria', onPress: () => resolve('galeria') },
        { text: 'Cancelar', style: 'cancel', onPress: () => resolve(null) },
      ],
      { cancelable: true, onDismiss: () => resolve(null) }
    );
  });
}

/** Foto de perfil da pessoa (câmera ou galeria), recortada em quadrado, sem GPS. Devolve data URL. */
export async function capturarFotoPessoa(fonte: 'camera' | 'galeria'): Promise<string | null> {
  if (fonte === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permissão', 'Precisamos da câmera para tirar a foto.');
      return null;
    }
  } else {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (perm.status !== 'granted') {
      Alert.alert('Permissão', 'Precisamos acessar suas fotos para escolher a imagem.');
      return null;
    }
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.5,
    base64: true,
  };
  const result =
    fonte === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled || !result.assets[0]?.base64) return null;
  const asset = result.assets[0];
  return `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`;
}
