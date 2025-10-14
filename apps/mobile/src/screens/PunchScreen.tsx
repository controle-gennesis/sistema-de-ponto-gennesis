import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  ActivityIndicator,
  Image,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { ArrowLeft } from 'lucide-react-native';
import * as Location from 'expo-location';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { buildApiUrl } from '../config/api';
import Toast from 'react-native-toast-message';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';

enum TimeRecordType {
  ENTRY = 'ENTRY',
  LUNCH_START = 'LUNCH_START',
  LUNCH_END = 'LUNCH_END',
  EXIT = 'EXIT',
  ABSENCE_JUSTIFIED = 'ABSENCE_JUSTIFIED',
}

const PUNCH_TYPES = [
  { type: TimeRecordType.ENTRY, label: 'Entrada', icon: '🌅' },
  { type: TimeRecordType.LUNCH_START, label: 'Almoço', icon: '🍽️' },
  { type: TimeRecordType.LUNCH_END, label: 'Retorno', icon: '🔄' },
  { type: TimeRecordType.EXIT, label: 'Saída', icon: '🌆' },
];

export default function PunchScreen() {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const [photo, setPhoto] = useState<string | null>(null);
  const [showPhoto, setShowPhoto] = useState(false);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [loading, setLoading] = useState(false);
  const [observation, setObservation] = useState('');
  const [todayRecords, setTodayRecords] = useState<any[]>([]);
  const [allPointsCompleted, setAllPointsCompleted] = useState(false);
  const [selectedType, setSelectedType] = useState<TimeRecordType>(TimeRecordType.ENTRY);
  const [cameraPermission, setCameraPermission] = useState<boolean | null>(null);
  const [locationPermission, setLocationPermission] = useState<boolean | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [address, setAddress] = useState<string>('Obtendo localização...');
  const { user } = useAuth();
  
  const styles = getStyles(colors);

  useEffect(() => {
    requestPermissions();
    fetchTodayRecords();
  }, []);

  // Atualizar o relógio a cada segundo
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Atualizar o tipo de ponto quando os registros mudarem
  useEffect(() => {
    const nextType = getNextPunchType();
    setSelectedType(nextType);
    setAllPointsCompleted(checkAllPointsCompleted(todayRecords));
  }, [todayRecords]);

  const fetchTodayRecords = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      const response = await fetch(buildApiUrl('/api/time-records/my-records/today'), {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        // A API retorna { success: true, data: { records: [...], summary: {...} } }
        const records = data.data?.records || [];
        setTodayRecords(records);
        setAllPointsCompleted(checkAllPointsCompleted(records));
      }
    } catch (error) {
      // Erro silencioso
    }
  };

  // Função para determinar o próximo tipo de ponto
  const getNextPunchType = (): TimeRecordType => {
    if (!todayRecords || todayRecords.length === 0) {
      return TimeRecordType.ENTRY;
    }

    const hasEntry = todayRecords.some(r => r.type === TimeRecordType.ENTRY);
    const hasLunchStart = todayRecords.some(r => r.type === TimeRecordType.LUNCH_START);
    const hasLunchEnd = todayRecords.some(r => r.type === TimeRecordType.LUNCH_END);
    const hasExit = todayRecords.some(r => r.type === TimeRecordType.EXIT);

    if (!hasEntry) return TimeRecordType.ENTRY;
    if (!hasLunchStart) return TimeRecordType.LUNCH_START;
    if (!hasLunchEnd) return TimeRecordType.LUNCH_END;
    if (!hasExit) return TimeRecordType.EXIT;

    return TimeRecordType.ENTRY;
  };

  const checkAllPointsCompleted = (records: any[]) => {
    const hasEntry = records.some(r => r.type === TimeRecordType.ENTRY);
    const hasLunchStart = records.some(r => r.type === TimeRecordType.LUNCH_START);
    const hasLunchEnd = records.some(r => r.type === TimeRecordType.LUNCH_END);
    const hasExit = records.some(r => r.type === TimeRecordType.EXIT);
    const hasAbsenceJustified = records.some(r => r.type === TimeRecordType.ABSENCE_JUSTIFIED);

    if (hasAbsenceJustified) {
      return true;
    }

    return hasEntry && hasLunchStart && hasLunchEnd && hasExit;
  };

  const requestPermissions = async () => {
    // Solicitar permissão da câmera
    const { status: cameraStatus } = await ImagePicker.requestCameraPermissionsAsync();
    setCameraPermission(cameraStatus === 'granted');

    // Solicitar permissão de localização
    const { status: locationStatus } = await Location.requestForegroundPermissionsAsync();
    setLocationPermission(locationStatus === 'granted');

    if (locationStatus === 'granted') {
      getCurrentLocation();
    }
  };

  const getCurrentLocation = async () => {
    try {
      setAddress('Obtendo localização...');
      
      // Usar a maior precisão possível e aguardar mais tempo
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });
      
      console.log('📍 Localização GPS:', {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: `±${location.coords.accuracy?.toFixed(0)}m`,
      });
      
      setLocation(location);

      // Buscar endereço a partir das coordenadas usando Nominatim (OpenStreetMap)
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${location.coords.latitude}&lon=${location.coords.longitude}&addressdetails=1&zoom=18`,
          {
            headers: {
              'User-Agent': 'GennesisPontoApp/1.0',
            }
          }
        );

        if (response.ok) {
          const data = await response.json();
          console.log('🗺️ Endereço retornado:', data.display_name);
          
          if (data && data.address) {
            const addr = data.address;
            const parts = [];
            
            // Montar endereço completo
            if (addr.road || addr.street) parts.push(addr.road || addr.street);
            if (addr.house_number) parts.push(addr.house_number);
            if (addr.suburb || addr.neighbourhood) parts.push(addr.suburb || addr.neighbourhood);
            if (addr.city || addr.town) parts.push(addr.city || addr.town);
            if (addr.state) parts.push(addr.state);
            if (addr.postcode) parts.push(addr.postcode);
            
            const fullAddress = parts.length > 0 ? parts.join(', ') : data.display_name || 'Endereço não disponível';
            setAddress(fullAddress);
          } else {
            setAddress('Endereço não disponível');
          }
        } else {
          setAddress('Não foi possível obter o endereço');
        }
      } catch (addressError) {
        console.error('❌ Erro ao obter endereço:', addressError);
        setAddress('Não foi possível obter o endereço');
      }
    } catch (error) {
      console.error('❌ Erro ao obter localização:', error);
      setAddress('Erro ao obter localização');
    }
  };

  const takePicture = async () => {
    try {
      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
      });
      
      if (!result.canceled && result.assets[0]) {
        setPhoto(result.assets[0].uri);
        Toast.show({
          type: 'success',
          text1: 'Foto capturada com sucesso!',
        });
      }
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível tirar a foto');
    }
  };

  const handleConfirm = () => {
    Alert.alert(
      'Confirmar Registro',
      `Deseja registrar o ponto de ${PUNCH_TYPES.find(p => p.type === selectedType)?.label}?`,
      [
        {
          text: 'Cancelar',
          style: 'cancel'
        },
        {
          text: 'Confirmar',
          onPress: punchInOut
        }
      ]
    );
  };

  const punchInOut = async () => {
    if (!photo) {
      Alert.alert('Erro', 'Por favor, tire uma foto antes de bater o ponto');
      return;
    }

    if (!location) {
      Alert.alert('Erro', 'Não foi possível obter sua localização');
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('type', selectedType);
      formData.append('latitude', location.coords.latitude.toString());
      formData.append('longitude', location.coords.longitude.toString());
      formData.append('observation', observation.trim() || '');
      formData.append('photo', {
        uri: photo,
        type: 'image/jpeg',
        name: 'punch_photo.jpg',
      } as any);

      const token = await AsyncStorage.getItem('token');

      const response = await fetch(buildApiUrl('/api/time-records/punch'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Erro ao registrar ponto');
      }

      const data = await response.json();
      
      if (data.success) {
        Toast.show({
          type: 'success',
          text1: 'Ponto registrado com sucesso!',
        });
        setPhoto(null);
        setObservation('');
        // Voltar para a página principal após sucesso
        setTimeout(() => {
          navigation.goBack();
        }, 1500);
      }
    } catch (error: any) {
      Toast.show({
        type: 'error',
        text1: 'Erro ao registrar ponto',
        text2: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  if (cameraPermission === null || locationPermission === null) {
    return (
      <SafeAreaView style={styles.safeArea}>
      <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#ce3736" />
        <Text style={styles.loadingText}>Solicitando permissões...</Text>
      </View>
      </SafeAreaView>
    );
  }

  if (!cameraPermission || !locationPermission) {
    return (
      <SafeAreaView style={styles.safeArea}>
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>
          Permissões necessárias não foram concedidas
        </Text>
        <TouchableOpacity style={styles.button} onPress={requestPermissions}>
          <Text style={styles.buttonText}>Tentar Novamente</Text>
        </TouchableOpacity>
      </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header com botão voltar */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTextContainer}>
          <Text style={styles.headerTitle}>Registrar Ponto</Text>
        </View>
        <View style={styles.placeholder} />
      </View>

      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        {/* Informações - Sem Card */}
        <View style={styles.infoContainer}>
          <Text style={styles.currentTime}>
            {currentTime.toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            })}
          </Text>
          <Text style={styles.currentDate}>
            {(() => {
              const dateStr = new Date().toLocaleDateString('pt-BR', { 
                weekday: 'long', 
                day: 'numeric', 
                month: 'long',
                year: 'numeric'
              });
              return dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
            })()}
          </Text>
          <View style={styles.divider} />
          <View style={styles.nextPunchContainer}>
            <Text style={styles.nextPunchLabel}>Próximo ponto</Text>
            <Text style={styles.nextPunchType}>
              {PUNCH_TYPES.find(p => p.type === selectedType)?.label}
            </Text>
          </View>
        </View>

        {/* Foto */}
        <View style={styles.photoSection}>
          <Text style={styles.sectionLabel}>Foto *</Text>
          <View style={styles.photoActions}>
            <TouchableOpacity
              style={styles.cameraButton} 
              onPress={takePicture}
            >
              <Ionicons name="camera" size={24} color="#fff" />
              <Text style={styles.cameraButtonText}>
                {photo ? 'Tirar nova foto' : 'Abrir câmera'}
              </Text>
            </TouchableOpacity>
            
            {photo && (
              <TouchableOpacity 
                style={styles.viewPhotoButton} 
                onPress={() => setShowPhoto(true)}
              >
                <Ionicons name="image" size={24} color={colors.primary} />
                <Text style={styles.viewPhotoButtonText}>Ver foto</Text>
              </TouchableOpacity>
          )}
        </View>
      </View>

        {/* Modal de visualização da foto */}
        {showPhoto && photo && (
          <View style={styles.photoModal}>
            <View style={styles.photoModalContent}>
              <Image source={{ uri: photo }} style={styles.photoPreview} />
              <TouchableOpacity 
                style={styles.closeButton} 
                onPress={() => setShowPhoto(false)}
              >
                <Ionicons name="close-circle" size={32} color="#fff" />
            </TouchableOpacity>
          </View>
          </View>
        )}

        {/* Observação */}
        <View style={styles.observationSection}>
          <Text style={styles.sectionLabel}>Observação</Text>
          <TextInput
            style={styles.observationInput}
            value={observation}
            onChangeText={setObservation}
            placeholder="Digite uma observação sobre este registro..."
            placeholderTextColor="#9ca3af"
            multiline
            numberOfLines={2}
            maxLength={200}
          />
          <Text style={styles.charCount}>{observation.length}/200</Text>
        </View>

        {/* Localização */}
        <View style={styles.locationSection}>
          <Text style={styles.sectionLabel}>Localização</Text>
          <View style={styles.locationCard}>
            <View style={styles.locationIcon}>
              <Ionicons name="location" size={20} color="#ce3736" />
            </View>
            <View style={styles.locationInfo}>
              <Text style={styles.locationText}>{address}</Text>
              {location && (
                <Text style={styles.coordinatesText}>
                  {location.coords.latitude.toFixed(6)}, {location.coords.longitude.toFixed(6)}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Status */}
        <View style={styles.statusBar}>
          <View style={[
            styles.statusDot,
            { backgroundColor: location && photo ? '#10b981' : '#fbbf24' }
          ]} />
          <Text style={styles.statusText}>
            {!location && !photo && 'Preparando registro...'}
            {location && !photo && 'Tire sua foto'}
            {!location && photo && 'Obtendo localização...'}
            {location && photo && 'Tudo pronto! Confirme abaixo'}
          </Text>
      </View>

      {/* Botão de Confirmar */}
      <TouchableOpacity
          style={[
            styles.confirmButton,
            (loading || !photo || !location || allPointsCompleted) && styles.confirmButtonDisabled
          ]}
          onPress={handleConfirm}
          disabled={loading || !photo || !location || allPointsCompleted}
          activeOpacity={0.8}
      >
        {loading ? (
            <View style={styles.confirmButtonContent}>
              <ActivityIndicator color="#fff" size="small" />
              <Text style={styles.confirmButtonText}>Registrando...</Text>
            </View>
        ) : (
            <View style={styles.confirmButtonContent}>
          <Text style={styles.confirmButtonText}>
                Registrar {PUNCH_TYPES.find(p => p.type === selectedType)?.label}
          </Text>
            </View>
        )}
      </TouchableOpacity>
    </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (colors: any) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 20,
    backgroundColor: 'transparent',
  },
  backButton: {
    padding: 4,
    width: 40,
  },
  headerTextContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: colors.text,
  },
  placeholder: {
    width: 40,
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.textSecondary,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#ce3736',
    textAlign: 'center',
    marginBottom: 20,
  },
  completedBanner: {
    backgroundColor: '#d1fae5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  completedText: {
    fontSize: 14,
    color: '#065f46',
    fontWeight: '500',
    textAlign: 'center',
  },
  infoContainer: {
    paddingHorizontal: 24,
    marginBottom: 20,
    alignItems: 'center',
  },
  currentTime: {
    fontSize: 48,
    fontWeight: '700',
    color: colors.text,
    letterSpacing: 2,
  },
  currentDate: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '500',
    marginTop: 4,
    marginBottom: 16,
  },
  divider: {
    width: 60,
    height: 1,
    backgroundColor: '#e5e7eb',
    marginBottom: 16,
  },
  nextPunchContainer: {
    alignItems: 'center',
    gap: 8,
  },
  nextPunchLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  nextPunchType: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.primary,
  },
  sectionTitle: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 12,
    marginHorizontal: 24,
    textTransform: 'uppercase',
    letterSpacing: 1,
    fontWeight: '600',
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 12,
  },
  photoSection: {
    marginBottom: 24,
  },
  photoActions: {
    flexDirection: 'row',
    gap: 12,
  },
  cameraButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ce3736',
    padding: 16,
    borderRadius: 12,
    gap: 8,
    elevation: 3,
  },
  cameraButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  viewPhotoButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 12,
    gap: 8,
    borderWidth: 2,
    borderColor: '#ce3736',
    elevation: 2,
  },
  viewPhotoButtonText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  photoModal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  photoModalContent: {
    width: '90%',
    aspectRatio: 3/4,
    position: 'relative',
  },
  photoPreview: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
  },
  closeButton: {
    position: 'absolute',
    top: -50,
    right: 0,
  },
  observationSection: {
    marginBottom: 24,
  },
  observationInput: {
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: '#111827',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  charCount: {
    fontSize: 12,
    color: '#9ca3af',
    textAlign: 'right',
    marginTop: 8,
  },
  locationSection: {
    marginBottom: 24,
  },
  locationCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    gap: 12,
  },
  locationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fee2e2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationInfo: {
    flex: 1,
  },
  locationText: {
    fontSize: 14,
    color: colors.text,
    lineHeight: 20,
    marginBottom: 4,
  },
  coordinatesText: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: 'monospace',
    marginTop: 2,
  },
  statusBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '500',
  },
  confirmButton: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 18,
    shadowColor: '#ce3736',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  confirmButtonDisabled: {
    backgroundColor: '#d1d5db',
    shadowOpacity: 0,
  },
  confirmButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  confirmButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  button: {
    backgroundColor: '#ce3736',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
