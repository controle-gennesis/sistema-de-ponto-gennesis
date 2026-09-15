import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Modal,
  Pressable,
  useWindowDimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Camera,
  Check,
  Image as ImageIcon,
  LogIn,
  LogOut,
  MapPin,
  QrCode,
  RotateCw,
  ShieldCheck,
  Utensils,
  X,
} from 'lucide-react-native';
import * as Location from 'expo-location';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import Svg, { Defs, Ellipse, Mask, Rect } from 'react-native-svg';
import { useTheme } from '../context/ThemeContext';
import AppHeader from '../components/AppHeader';
import FormFieldLabel from '../components/FormFieldLabel';
import api from '../services/api';
import { uploadMultipartFile } from '../utils/uploadMultipartFile';
import { resolveMediaUrl } from '../utils/resolveMediaUrl';

enum TimeRecordType {
  ENTRY = 'ENTRY',
  LUNCH_START = 'LUNCH_START',
  LUNCH_END = 'LUNCH_END',
  EXIT = 'EXIT',
  ABSENCE_JUSTIFIED = 'ABSENCE_JUSTIFIED',
}

const PUNCH_TYPES = [
  { type: TimeRecordType.ENTRY, label: 'Entrada', Icon: LogIn },
  { type: TimeRecordType.LUNCH_START, label: 'Almoço', Icon: Utensils },
  { type: TimeRecordType.LUNCH_END, label: 'Retorno', Icon: RotateCw },
  { type: TimeRecordType.EXIT, label: 'Saída', Icon: LogOut },
];

type PunchPolicyLocation = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radius: number;
  hasQr?: boolean;
};

type PunchPolicy = {
  geofenceEnabled: boolean;
  geofenceBlockOutside: boolean;
  geofenceRequireLocation: boolean;
  requireFaceMatch: boolean;
  requirePunchQr: boolean;
  hasFacePhoto?: boolean;
  hasProfilePhoto: boolean;
  facePhotoUrl?: string | null;
  locations: PunchPolicyLocation[];
};

function hasPunchFacePhoto(policy: PunchPolicy | null): boolean {
  if (!policy) return true;
  return (policy.hasFacePhoto ?? policy.hasProfilePhoto) !== false;
}

function FaceGuideOverlay({
  width,
  height,
  statusLabel,
  statusTone = 'neutral',
}: {
  width: number;
  height: number;
  statusLabel: string;
  statusTone?: 'neutral' | 'checking' | 'ok' | 'bad';
}) {
  const rx = Math.min(width * 0.34, 148);
  const ry = rx * 1.32;
  const cx = width / 2;
  const cy = height * 0.46;
  const stroke =
    statusTone === 'ok' ? '#22c55e' : statusTone === 'bad' ? '#f87171' : '#fff';
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width={width} height={height}>
        <Defs>
          <Mask id="punchFaceHole">
            <Rect x={0} y={0} width={width} height={height} fill="#fff" />
            <Ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#000" />
          </Mask>
        </Defs>
        <Rect
          x={0}
          y={0}
          width={width}
          height={height}
          fill="rgba(0,0,0,0.58)"
          mask="url(#punchFaceHole)"
        />
        <Ellipse
          cx={cx}
          cy={cy}
          rx={rx}
          ry={ry}
          fill="none"
          stroke={stroke}
          strokeWidth={2.5}
          strokeDasharray="12 9"
        />
      </Svg>
      <Text
        style={{
          position: 'absolute',
          top: cy + ry + 18,
          left: 24,
          right: 24,
          color: stroke,
          fontSize: 15,
          fontWeight: '600',
          textAlign: 'center',
          textShadowColor: 'rgba(0,0,0,0.55)',
          textShadowOffset: { width: 0, height: 1 },
          textShadowRadius: 3,
        }}
      >
        {statusLabel}
      </Text>
    </View>
  );
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (n: number) => (n * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function parsePunchQr(raw: string): string {
  return (raw || '').trim().replace(/^gennesis-punch:/i, '').replace(/^punch:/i, '');
}

export default function PunchScreen() {
  const navigation = useNavigation();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const [photo, setPhoto] = useState<string | null>(null);
  const [showPhoto, setShowPhoto] = useState(false);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [loading, setLoading] = useState(false);
  const [observation, setObservation] = useState('');
  const [todayRecords, setTodayRecords] = useState<Array<{ type: string }>>([]);
  const [allPointsCompleted, setAllPointsCompleted] = useState(false);
  const [selectedType, setSelectedType] = useState<TimeRecordType>(TimeRecordType.ENTRY);
  const [cameraPermission, setCameraPermission] = useState<boolean | null>(null);
  const [locationPermission, setLocationPermission] = useState<boolean | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [address, setAddress] = useState('Obtendo localização...');
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [showFacePhotoModal, setShowFacePhotoModal] = useState(false);
  const [successData, setSuccessData] = useState<{
    type: string;
    time: string;
    date: string;
  } | null>(null);
  const [punchPolicy, setPunchPolicy] = useState<PunchPolicy | null>(null);
  const [scannedPunchQr, setScannedPunchQr] = useState<string | null>(null);
  const [scannedLocationName, setScannedLocationName] = useState<string | null>(null);
  const [qrScannerOpen, setQrScannerOpen] = useState(false);
  const [faceCameraOpen, setFaceCameraOpen] = useState(false);
  const [faceCameraMode, setFaceCameraMode] = useState<'check' | 'register'>('check');
  const [faceScanBusy, setFaceScanBusy] = useState(false);
  const [faceRegisterBusy, setFaceRegisterBusy] = useState(false);
  const [faceScanStatus, setFaceScanStatus] = useState('Encaixe o rosto no oval');
  const [faceScanTone, setFaceScanTone] = useState<'neutral' | 'checking' | 'ok' | 'bad'>('neutral');
  const [faceConfirmed, setFaceConfirmed] = useState(false);
  const [qrPermission, requestQrPermission] = useCameraPermissions();
  const qrLockRef = useRef(false);
  const faceCameraRef = useRef<CameraView>(null);
  const faceScanLockRef = useRef(false);
  const faceMatchedRef = useRef(false);

  useEffect(() => {
    void requestPermissions();
    void fetchTodayRecords();
    void fetchPunchPolicy();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    setSelectedType(getNextPunchType());
    setAllPointsCompleted(checkAllPointsCompleted(todayRecords));
  }, [todayRecords]);

  const fetchTodayRecords = async () => {
    try {
      const response = await api.get('/api/time-records/my-records/today');
      if (!response.ok) return;
      const data = await response.json();
      setTodayRecords(data.data?.records || []);
    } catch {
      /* ignore */
    }
  };

  const fetchPunchPolicy = async () => {
    try {
      const response = await api.get('/api/time-records/punch-policy');
      const json = await response.json().catch(() => ({}));
      if (response.ok) setPunchPolicy(json.data || json);
    } catch {
      /* ignore */
    }
  };

  const getNextPunchType = (): TimeRecordType => {
    if (!todayRecords.length) return TimeRecordType.ENTRY;
    const has = (type: TimeRecordType) => todayRecords.some((r) => r.type === type);
    if (!has(TimeRecordType.ENTRY)) return TimeRecordType.ENTRY;
    if (!has(TimeRecordType.LUNCH_START)) return TimeRecordType.LUNCH_START;
    if (!has(TimeRecordType.LUNCH_END)) return TimeRecordType.LUNCH_END;
    if (!has(TimeRecordType.EXIT)) return TimeRecordType.EXIT;
    return TimeRecordType.ENTRY;
  };

  const checkAllPointsCompleted = (records: Array<{ type: string }>) => {
    const has = (type: TimeRecordType) => records.some((r) => r.type === type);
    if (has(TimeRecordType.ABSENCE_JUSTIFIED)) return true;
    return (
      has(TimeRecordType.ENTRY) &&
      has(TimeRecordType.LUNCH_START) &&
      has(TimeRecordType.LUNCH_END) &&
      has(TimeRecordType.EXIT)
    );
  };

  const requestPermissions = async () => {
    const cam = await requestQrPermission();
    setCameraPermission(Boolean(cam.granted));
    const { status: locationStatus } = await Location.requestForegroundPermissionsAsync();
    setLocationPermission(locationStatus === 'granted');
    if (locationStatus === 'granted') void getCurrentLocation();
  };

  const getCurrentLocation = async () => {
    try {
      setAddress('Obtendo localização...');
      const next = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Highest,
      });
      setLocation(next);
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${next.coords.latitude}&lon=${next.coords.longitude}&addressdetails=1&zoom=18`,
          { headers: { 'User-Agent': 'GennesisPontoApp/1.0' } }
        );
        if (!response.ok) {
          setAddress('Não foi possível obter o endereço');
          return;
        }
        const data = await response.json();
        if (data?.address) {
          const addr = data.address;
          const parts = [
            addr.road || addr.street,
            addr.house_number,
            addr.suburb || addr.neighbourhood,
            addr.city || addr.town,
            addr.state,
            addr.postcode,
          ].filter(Boolean);
          setAddress(parts.length ? parts.join(', ') : data.display_name || 'Endereço não disponível');
        } else {
          setAddress('Endereço não disponível');
        }
      } catch {
        setAddress('Não foi possível obter o endereço');
      }
    } catch {
      setAddress('Erro ao obter localização');
    }
  };

  const ensureCameraPermission = async () => {
    if (qrPermission?.granted) return true;
    const res = await requestQrPermission();
    if (!res.granted) {
      Alert.alert('Permissão da câmera', 'Precisamos da câmera para a foto do ponto.');
      return false;
    }
    return true;
  };

  const startFaceCheckCamera = async () => {
    if (!(await ensureCameraPermission())) return;
    faceMatchedRef.current = false;
    faceScanLockRef.current = false;
    setFaceCameraMode('check');
    setFaceConfirmed(false);
    setPhoto(null);
    setFaceScanStatus('Encaixe o rosto no oval');
    setFaceScanTone('neutral');
    setFaceCameraOpen(true);
  };

  const startFaceRegisterCamera = async () => {
    setShowFacePhotoModal(false);
    if (!(await ensureCameraPermission())) return;
    faceMatchedRef.current = false;
    faceScanLockRef.current = false;
    setFaceCameraMode('register');
    setFaceConfirmed(false);
    setPhoto(null);
    setFaceRegisterBusy(false);
    setFaceScanStatus('Encaixe o rosto e capture a foto');
    setFaceScanTone('neutral');
    setFaceCameraOpen(true);
  };

  const openFaceCamera = async () => {
    if (!hasPunchFacePhoto(punchPolicy)) {
      setShowFacePhotoModal(true);
      return;
    }
    await startFaceCheckCamera();
  };

  const closeFaceCamera = useCallback(() => {
    faceMatchedRef.current = false;
    faceScanLockRef.current = false;
    setFaceCameraOpen(false);
    setFaceCameraMode('check');
    setFaceScanBusy(false);
    setFaceRegisterBusy(false);
    setFaceScanStatus('Encaixe o rosto no oval');
    setFaceScanTone('neutral');
  }, []);

  const captureFaceRegisterPhoto = useCallback(async () => {
    if (faceRegisterBusy || faceCameraMode !== 'register') return;
    setFaceRegisterBusy(true);
    setFaceScanStatus('Salvando foto...');
    setFaceScanTone('checking');
    try {
      const shot = await faceCameraRef.current?.takePictureAsync({
        quality: 0.75,
        shutterSound: false,
      });
      if (!shot?.uri) {
        setFaceScanStatus('Não foi possível capturar — tente de novo');
        setFaceScanTone('bad');
        return;
      }

      const uploaded = await uploadMultipartFile<{
        facePhotoUrl?: string | null;
        facePhotoKey?: string | null;
      }>({
        path: '/api/auth/me/face-photo',
        fieldName: 'facePhoto',
        method: 'PATCH',
        file: { uri: shot.uri, name: 'face_photo.jpg', type: 'image/jpeg' },
      });

      setPunchPolicy((prev) =>
        prev
          ? {
              ...prev,
              hasFacePhoto: true,
              hasProfilePhoto: true,
              facePhotoUrl: uploaded?.facePhotoUrl ?? prev.facePhotoUrl,
            }
          : {
              geofenceEnabled: false,
              geofenceBlockOutside: false,
              geofenceRequireLocation: false,
              requireFaceMatch: true,
              requirePunchQr: false,
              hasFacePhoto: true,
              hasProfilePhoto: true,
              facePhotoUrl: uploaded?.facePhotoUrl ?? null,
              locations: [],
            }
      );
      void fetchPunchPolicy();

      faceMatchedRef.current = false;
      faceScanLockRef.current = false;
      setFaceCameraMode('check');
      setFaceConfirmed(false);
      setPhoto(null);
      setFaceScanStatus('Foto salva — agora confirme o rosto');
      setFaceScanTone('ok');
      setTimeout(() => {
        setFaceScanStatus('Encaixe o rosto no oval');
        setFaceScanTone('neutral');
      }, 900);
    } catch (err) {
      setFaceScanStatus(err instanceof Error ? err.message : 'Erro ao salvar a foto');
      setFaceScanTone('bad');
    } finally {
      setFaceRegisterBusy(false);
    }
  }, [faceCameraMode, faceRegisterBusy]);

  const runFaceScanTick = useCallback(async () => {
    if (
      !faceCameraOpen ||
      faceCameraMode !== 'check' ||
      faceMatchedRef.current ||
      faceScanLockRef.current
    ) {
      return;
    }
    faceScanLockRef.current = true;
    setFaceScanBusy(true);
    try {
      const shot = await faceCameraRef.current?.takePictureAsync({
        quality: 0.45,
        shutterSound: false,
        skipProcessing: true,
      });
      if (!shot?.uri || faceMatchedRef.current) return;

      setFaceScanStatus('Verificando...');
      setFaceScanTone('checking');

      const result = await uploadMultipartFile<{
        matched?: boolean;
        status?: string;
        reason?: string;
        similarity?: number | null;
      }>({
        path: '/api/time-records/face-check',
        fieldName: 'photo',
        file: { uri: shot.uri, name: 'face_check.jpg', type: 'image/jpeg' },
      });

      if (faceMatchedRef.current) return;

      if (result?.matched || result?.status === 'matched') {
        faceMatchedRef.current = true;
        setFaceScanStatus('Rosto confirmado');
        setFaceScanTone('ok');
        setPhoto(shot.uri);
        setFaceConfirmed(true);
        setTimeout(() => {
          setFaceCameraOpen(false);
          setFaceCameraMode('check');
          setFaceScanBusy(false);
          setFaceScanStatus('Encaixe o rosto no oval');
          setFaceScanTone('neutral');
        }, 700);
        return;
      }

      if (result?.status === 'no_profile_photo') {
        closeFaceCamera();
        setShowFacePhotoModal(true);
        return;
      }

      if (result?.status === 'pending_review' || result?.status === 'unavailable') {
        setFaceScanStatus('Conferência automática indisponível');
        setFaceScanTone('bad');
        return;
      }

      setFaceScanStatus('Não reconhecido — mantenha o rosto no oval');
      setFaceScanTone('bad');
    } catch {
      if (!faceMatchedRef.current) {
        setFaceScanStatus('Tentando de novo...');
        setFaceScanTone('neutral');
      }
    } finally {
      faceScanLockRef.current = false;
      if (!faceMatchedRef.current) setFaceScanBusy(false);
    }
  }, [closeFaceCamera, faceCameraMode, faceCameraOpen]);

  useEffect(() => {
    if (!faceCameraOpen || faceCameraMode !== 'check') return;
    const boot = setTimeout(() => {
      void runFaceScanTick();
    }, 700);
    const timer = setInterval(() => {
      void runFaceScanTick();
    }, 2200);
    return () => {
      clearTimeout(boot);
      clearInterval(timer);
    };
  }, [faceCameraMode, faceCameraOpen, runFaceScanTick]);

  const punchInOut = async () => {
    if (!photo || !faceConfirmed) {
      Alert.alert('Conferência facial', 'Abra a câmera e aguarde a confirmação do rosto.');
      return;
    }
    if (!location) {
      Alert.alert('Localização', 'Não foi possível obter sua localização.');
      return;
    }
    if (punchPolicy?.requirePunchQr && !scannedPunchQr) {
      Alert.alert('QR da localidade', 'Leia o QR Code do local onde o serviço será prestado.');
      return;
    }
    if (!hasPunchFacePhoto(punchPolicy)) {
      setShowFacePhotoModal(true);
      return;
    }

    setLoading(true);
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const seconds = String(now.getSeconds()).padStart(2, '0');
      const localTimestamp = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;

      const data = await uploadMultipartFile<{ punchLocationName?: string | null }>({
        path: '/api/time-records/punch',
        fieldName: 'photo',
        file: { uri: photo, name: 'punch_photo.jpg', type: 'image/jpeg' },
        fields: {
          type: selectedType,
          latitude: location.coords.latitude.toString(),
          longitude: location.coords.longitude.toString(),
          observation: observation.trim() || '',
          clientTimestamp: localTimestamp,
          ...(scannedPunchQr ? { punchQrToken: scannedPunchQr } : {}),
        },
      });

      const punchTypeLabels: Record<TimeRecordType, string> = {
        ENTRY: 'Entrada',
        LUNCH_START: 'Saída para almoço',
        LUNCH_END: 'Retorno do almoço',
        EXIT: 'Saída',
        ABSENCE_JUSTIFIED: 'Ausência justificada',
      };

      setSuccessData({
        type: punchTypeLabels[selectedType],
        time: `${hours}:${minutes}:${seconds}`,
        date: now.toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        }),
      });
      setShowSuccessModal(true);
      setPhoto(null);
      setFaceConfirmed(false);
      setObservation('');
      setScannedPunchQr(null);
      setScannedLocationName(data?.punchLocationName || scannedLocationName);
      void fetchTodayRecords();
    } catch (error: unknown) {
      Alert.alert('Erro ao registrar ponto', error instanceof Error ? error.message : 'Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const openPunchQrScanner = async () => {
    if (!qrPermission?.granted) {
      const res = await requestQrPermission();
      if (!res.granted) {
        Alert.alert('Permissão da câmera', 'Precisamos da câmera para ler o QR da localidade.');
        return;
      }
    }
    qrLockRef.current = false;
    setQrScannerOpen(true);
  };

  const onPunchQrScanned = (result: BarcodeScanningResult) => {
    if (qrLockRef.current) return;
    const token = parsePunchQr(result?.data ?? '');
    if (!token) return;
    qrLockRef.current = true;
    setQrScannerOpen(false);
    setScannedPunchQr(token);
    void (async () => {
      try {
        const res = await api.post('/api/time-records/resolve-punch-qr', { token });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.message || json.error || 'QR inválido');
        setScannedLocationName(json.data?.name || 'Localidade autorizada');
      } catch (err) {
        setScannedPunchQr(null);
        setScannedLocationName(null);
        Alert.alert('QR inválido', err instanceof Error ? err.message : 'Não foi possível validar o QR.');
      }
    })();
  };

  const askLeave = () => {
    if (photo || faceConfirmed || observation.trim() || scannedPunchQr) {
      setShowWarningModal(true);
      return;
    }
    navigation.goBack();
  };

  const selectedPunch = PUNCH_TYPES.find((p) => p.type === selectedType);
  const SelectedIcon = selectedPunch?.Icon || LogIn;
  const dateLabel = currentTime.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  let fenceLabel = punchPolicy?.geofenceEnabled
    ? 'Confirmando se você está na área autorizada…'
    : 'Cerca virtual desligada — o ponto pode ser registrado de qualquer lugar.';
  let fenceOk = !punchPolicy?.geofenceEnabled;
  if (punchPolicy?.geofenceEnabled && location && punchPolicy.locations?.length) {
    const nearest = punchPolicy.locations
      .map((loc) => ({
        loc,
        distance: haversineMeters(
          location.coords.latitude,
          location.coords.longitude,
          loc.latitude,
          loc.longitude
        ),
      }))
      .sort((a, b) => a.distance - b.distance)[0];
    fenceOk = nearest.distance <= nearest.loc.radius;
    fenceLabel = fenceOk
      ? `Dentro de ${nearest.loc.name} (${Math.round(nearest.distance)} m)`
      : `Fora da área — ${Math.round(nearest.distance)} m de ${nearest.loc.name} (máx. ${nearest.loc.radius} m)`;
  }

  const punchBlocked =
    loading ||
    !photo ||
    !faceConfirmed ||
    !location ||
    allPointsCompleted ||
    Boolean(punchPolicy?.requirePunchQr && !scannedPunchQr);

  const registeredFacePhotoUri = resolveMediaUrl(punchPolicy?.facePhotoUrl ?? null);
  const confirmedFacePreviewUri = registeredFacePhotoUri || photo;

  const readyLabel = allPointsCompleted
    ? 'Todos os pontos de hoje já foram registrados.'
    : !location && !faceConfirmed
      ? 'Permita a localização e confirme o rosto para continuar.'
      : location && !faceConfirmed
        ? 'Abra a câmera e aguarde a confirmação do rosto.'
        : !location && faceConfirmed
          ? 'Obtendo localização...'
          : punchPolicy?.requirePunchQr && !scannedPunchQr
            ? 'Leia o QR da localidade para concluir.'
            : 'Tudo pronto para registrar.';

  if (cameraPermission === null || locationPermission === null) {
    return (
      <View style={styles.safeArea}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <AppHeader showBack title="Registrar ponto" onBack={() => navigation.goBack()} />
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.centeredText}>Solicitando permissões...</Text>
        </View>
      </View>
    );
  }

  if (!cameraPermission || !locationPermission) {
    return (
      <View style={styles.safeArea}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <AppHeader showBack title="Registrar ponto" onBack={() => navigation.goBack()} />
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Permissões necessárias</Text>
          <Text style={styles.centeredText}>
            Precisamos da câmera e da localização para registrar o ponto.
          </Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => void requestPermissions()}>
            <Text style={styles.primaryBtnText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.safeArea}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AppHeader showBack title="Registrar ponto" onBack={askLeave} />

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.hero}>
          <Text style={styles.clock}>
            {currentTime.toLocaleTimeString('pt-BR', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </Text>
          <Text style={styles.date}>{dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}</Text>
          <View style={styles.nextChip}>
            <SelectedIcon size={14} color={colors.primary} strokeWidth={2.3} />
            <Text style={styles.nextChipLabel}>Próximo</Text>
            <Text style={styles.nextChipValue}>{selectedPunch?.label}</Text>
          </View>
        </View>

        <View style={styles.box}>
          <FormFieldLabel label="Conferência do rosto" required style={styles.boxTitle} />
          <Text style={styles.boxHint}>
            {faceConfirmed
              ? 'Rosto confirmado. Pode registrar o ponto.'
              : 'Abra a câmera e aguarde a confirmação automática'}
          </Text>
          {faceConfirmed && confirmedFacePreviewUri ? (
            <Image source={{ uri: confirmedFacePreviewUri }} style={styles.photo} />
          ) : null}
          <View style={styles.photoActions}>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => void openFaceCamera()} activeOpacity={0.85}>
              <View style={styles.btnRow}>
                <Camera size={18} color="#fff" strokeWidth={2.2} />
                <Text style={styles.primaryBtnText}>
                  {faceConfirmed ? 'Conferir de novo' : 'Abrir câmera'}
                </Text>
              </View>
            </TouchableOpacity>
            {faceConfirmed && confirmedFacePreviewUri ? (
              <TouchableOpacity
                style={styles.secondaryBtn}
                onPress={() => setShowPhoto(true)}
                activeOpacity={0.85}
              >
                <View style={styles.btnRow}>
                  <ImageIcon size={16} color={colors.text} strokeWidth={2.2} />
                  <Text style={styles.secondaryBtnText}>Ver foto</Text>
                </View>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        <View style={styles.box}>
          <FormFieldLabel label="Localização" style={styles.boxTitle} />
          <View style={styles.locationRow}>
            <View style={styles.locationIcon}>
              <MapPin size={18} color={colors.primary} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.locationText}>{address}</Text>
              {location ? (
                <Text style={styles.coords}>
                  {location.coords.latitude.toFixed(6)}, {location.coords.longitude.toFixed(6)}
                </Text>
              ) : null}
            </View>
          </View>
          <View style={[styles.fence, fenceOk ? styles.fenceOk : styles.fenceBad]}>
            <ShieldCheck size={16} color={fenceOk ? '#16a34a' : '#dc2626'} strokeWidth={2.2} />
            <Text style={[styles.fenceText, { color: fenceOk ? '#15803d' : '#b91c1c' }]}>{fenceLabel}</Text>
          </View>
        </View>

        <View style={styles.box}>
          <FormFieldLabel
            label="QR da localidade"
            required={Boolean(punchPolicy?.requirePunchQr)}
            style={styles.boxTitle}
          />
          <Text style={styles.boxHint}>Identifique o local da batida</Text>
          <TouchableOpacity
            style={scannedLocationName ? styles.secondaryBtn : styles.darkBtn}
            onPress={() => void openPunchQrScanner()}
            activeOpacity={0.85}
          >
            <View style={styles.btnRow}>
              <QrCode size={18} color={scannedLocationName ? colors.text : '#fff'} strokeWidth={2.2} />
              <Text style={scannedLocationName ? styles.secondaryBtnText : styles.darkBtnText}>
                {scannedLocationName ? `QR lido: ${scannedLocationName}` : 'Ler QR da localidade'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.box}>
          <FormFieldLabel label="Observação" style={styles.boxTitle} />
          <TextInput
            style={styles.input}
            value={observation}
            onChangeText={setObservation}
            placeholder="Opcional"
            placeholderTextColor={colors.textSecondary}
            multiline
            maxLength={200}
            textAlignVertical="top"
          />
          <Text style={styles.charCount}>{observation.length}/200</Text>
        </View>

        <Text style={styles.readyHint}>{readyLabel}</Text>

        <TouchableOpacity
          style={[styles.primaryBtn, punchBlocked && { opacity: 0.45 }]}
          onPress={() => setShowConfirmModal(true)}
          disabled={punchBlocked}
          activeOpacity={0.85}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.primaryBtnText}>
              {allPointsCompleted ? 'Pontos de hoje concluídos' : `Registrar ${selectedPunch?.label || ''}`}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      <Modal visible={showPhoto} transparent animationType="fade" onRequestClose={() => setShowPhoto(false)}>
        <Pressable style={styles.photoBackdrop} onPress={() => setShowPhoto(false)}>
          {confirmedFacePreviewUri ? (
            <Image source={{ uri: confirmedFacePreviewUri }} style={styles.photoFull} />
          ) : null}
        </Pressable>
      </Modal>

      <Modal
        visible={faceCameraOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        statusBarTranslucent
        onRequestClose={closeFaceCamera}
      >
        <View style={styles.scannerContainer}>
          <CameraView
            ref={faceCameraRef}
            style={StyleSheet.absoluteFill}
            facing="front"
            mirror
            mode="picture"
          />
          <FaceGuideOverlay
            width={windowWidth}
            height={windowHeight}
            statusLabel={faceScanStatus}
            statusTone={faceScanTone}
          />
          {faceScanBusy && faceScanTone === 'checking' && faceCameraMode === 'check' ? (
            <View style={[styles.faceScanBusy, { bottom: Math.max(insets.bottom + 96, 118) }]}>
              <ActivityIndicator color="#fff" />
            </View>
          ) : null}
          {faceCameraMode === 'register' ? (
            <TouchableOpacity
              style={[styles.faceCaptureBtn, { bottom: Math.max(insets.bottom + 88, 108) }]}
              onPress={() => void captureFaceRegisterPhoto()}
              disabled={faceRegisterBusy}
              activeOpacity={0.85}
            >
              {faceRegisterBusy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Camera size={20} color="#fff" strokeWidth={2.2} />
                  <Text style={styles.faceCaptureBtnText}>Capturar foto do ponto</Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={[styles.scannerClose, { bottom: Math.max(insets.bottom + 28, 48) }]}
            onPress={closeFaceCamera}
          >
            <X size={22} color="#fff" />
            <Text style={styles.scannerCloseText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal
        visible={qrScannerOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        statusBarTranslucent
        onRequestClose={() => setQrScannerOpen(false)}
      >
        <View style={styles.scannerContainer}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={onPunchQrScanned}
          />
          <View pointerEvents="none" style={styles.scannerOverlay}>
            <View
              style={[
                styles.scannerCenterBlock,
                { top: Math.max(insets.top + 24, (windowHeight - 320) / 2) },
              ]}
            >
              <View style={styles.scannerFrame} />
              <Text style={styles.scannerHint}>Aponte para o QR da localidade</Text>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.scannerClose, { bottom: Math.max(insets.bottom + 28, 48) }]}
            onPress={() => setQrScannerOpen(false)}
          >
            <X size={22} color="#fff" />
            <Text style={styles.scannerCloseText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </Modal>

      <Modal visible={showSuccessModal} transparent animationType="fade" onRequestClose={() => { setShowSuccessModal(false); navigation.goBack(); }}>
        <Pressable style={styles.modalBackdrop} onPress={() => { setShowSuccessModal(false); navigation.goBack(); }}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.successRing}>
              <View style={styles.successIcon}>
                <Check size={28} color="#fff" strokeWidth={3} />
              </View>
            </View>
            <Text style={styles.modalTitle}>Ponto registrado</Text>
            {successData ? (
              <View style={styles.successMeta}>
                <Text style={styles.successLine}>{successData.type}</Text>
                <Text style={styles.successSub}>
                  {successData.date} · {successData.time}
                </Text>
              </View>
            ) : null}
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => {
                setShowSuccessModal(false);
                navigation.goBack();
              }}
            >
              <Text style={styles.primaryBtnText}>Fechar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showConfirmModal} transparent animationType="fade" onRequestClose={() => setShowConfirmModal(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowConfirmModal(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Confirmar registro</Text>
            <Text style={styles.modalBody}>
              Registrar o ponto de {selectedPunch?.label.toLowerCase()} agora?
            </Text>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => {
                setShowConfirmModal(false);
                void punchInOut();
              }}
            >
              <Text style={styles.primaryBtnText}>Confirmar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowConfirmModal(false)}>
              <Text style={styles.modalCancelText}>Cancelar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal visible={showWarningModal} transparent animationType="fade" onRequestClose={() => setShowWarningModal(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowWarningModal(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Sair sem registrar?</Text>
            <Text style={styles.modalBody}>A selfie e os dados desta tela serão perdidos.</Text>
            <TouchableOpacity
              style={styles.dangerBtn}
              onPress={() => {
                setShowWarningModal(false);
                navigation.goBack();
              }}
            >
              <Text style={styles.primaryBtnText}>Sair</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowWarningModal(false)}>
              <Text style={styles.modalCancelText}>Continuar aqui</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={showFacePhotoModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowFacePhotoModal(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowFacePhotoModal(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.facePhotoIconWrap}>
              <Camera size={26} color="#dc2626" strokeWidth={2.2} />
            </View>
            <Text style={styles.modalTitle}>Foto do ponto</Text>
            <Text style={styles.modalBody}>
              O DP ainda não cadastrou a foto de confronto na sua ficha. Você pode cadastrar agora e testar a
              conferência na sequência.
            </Text>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => void startFaceRegisterCamera()}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>Cadastrar foto</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowFacePhotoModal(false)}>
              <Text style={styles.modalCancelText}>Fechar</Text>
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
    body: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 40 },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 28,
      gap: 12,
    },
    centeredText: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '500',
      textAlign: 'center',
      lineHeight: 20,
    },
    emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
    hero: { alignItems: 'center', marginBottom: 8, paddingTop: 4 },
    clock: {
      fontSize: 40,
      fontWeight: '800',
      letterSpacing: -1.2,
      color: colors.text,
    },
    date: {
      marginTop: 6,
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '500',
    },
    nextChip: {
      marginTop: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: isDark ? colors.card : colors.surface,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: isDark ? colors.border : 'rgba(15, 23, 42, 0.08)',
    },
    nextChipLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    nextChipValue: { fontSize: 13, fontWeight: '700', color: colors.primary },
    box: {
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderRadius: 16,
      padding: 16,
      marginTop: 14,
      borderColor: isDark ? colors.border : 'rgba(15, 23, 42, 0.08)',
      backgroundColor: colors.card,
    },
    boxTitle: {
      fontWeight: '700',
      marginBottom: 6,
      fontSize: 16,
      letterSpacing: -0.2,
      color: colors.text,
    },
    boxHint: {
      color: colors.textSecondary,
      marginBottom: 14,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '500',
    },
    photo: {
      width: '100%',
      height: 180,
      borderRadius: 12,
      marginBottom: 12,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
    },
    photoActions: { gap: 8 },
    locationRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
    locationIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(206,55,54,0.16)' : 'rgba(206,55,54,0.1)',
    },
    locationText: { color: colors.text, fontSize: 14, fontWeight: '600', lineHeight: 20 },
    coords: { marginTop: 4, color: colors.textSecondary, fontSize: 12, fontWeight: '500' },
    fence: {
      marginTop: 12,
      borderRadius: 12,
      paddingVertical: 10,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    fenceOk: { backgroundColor: isDark ? 'rgba(22,163,74,0.14)' : 'rgba(22,163,74,0.1)' },
    fenceBad: { backgroundColor: isDark ? 'rgba(220,38,38,0.14)' : 'rgba(220,38,38,0.1)' },
    fenceText: { flex: 1, fontSize: 13, fontWeight: '600', lineHeight: 18 },
    input: {
      minHeight: 88,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderRadius: 12,
      padding: 12,
      color: colors.text,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : colors.surface,
      borderColor: isDark ? colors.border : 'rgba(15, 23, 42, 0.08)',
      fontSize: 15,
      fontWeight: '500',
    },
    charCount: {
      marginTop: 8,
      textAlign: 'right',
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '500',
    },
    readyHint: {
      marginTop: 16,
      marginBottom: 8,
      textAlign: 'center',
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '500',
    },
    primaryBtn: {
      width: '100%',
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      minHeight: 52,
    },
    primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    secondaryBtn: {
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : colors.surface,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: isDark ? colors.border : 'rgba(15, 23, 42, 0.08)',
    },
    secondaryBtnText: { color: colors.text, fontWeight: '700', fontSize: 13, textAlign: 'center' },
    darkBtn: {
      borderRadius: 14,
      paddingVertical: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? '#111827' : '#111827',
      minHeight: 50,
    },
    darkBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
    btnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    photoBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(15,23,42,0.92)',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },
    photoFull: { width: '100%', height: '70%', borderRadius: 16, resizeMode: 'contain' },
    scannerContainer: {
      flex: 1,
      width: '100%',
      height: '100%',
      backgroundColor: '#000',
    },
    scannerOverlay: {
      ...StyleSheet.absoluteFillObject,
    },
    scannerCenterBlock: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scannerFrame: {
      width: 260,
      height: 260,
      borderWidth: 3,
      borderColor: '#fff',
      borderRadius: 20,
      backgroundColor: 'transparent',
    },
    scannerHint: {
      color: '#fff',
      marginTop: 18,
      fontSize: 15,
      fontWeight: '600',
      textAlign: 'center',
      paddingHorizontal: 24,
      textShadowColor: 'rgba(0,0,0,0.55)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 3,
    },
    scannerClose: {
      position: 'absolute',
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: 'rgba(0,0,0,0.65)',
      paddingHorizontal: 22,
      paddingVertical: 14,
      borderRadius: 999,
    },
    scannerCloseText: { color: '#fff', fontWeight: '700' },
    faceScanBusy: {
      position: 'absolute',
      alignSelf: 'center',
      padding: 12,
      borderRadius: 999,
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.55)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 28,
    },
    modalCard: {
      width: '100%',
      maxWidth: 340,
      borderRadius: 22,
      paddingHorizontal: 22,
      paddingTop: 28,
      paddingBottom: 18,
      backgroundColor: colors.card,
      alignItems: 'center',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? colors.border : 'rgba(15, 23, 42, 0.06)',
    },
    successRing: {
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
    modalTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.text,
      textAlign: 'center',
      letterSpacing: -0.3,
    },
    modalBody: {
      marginTop: 8,
      marginBottom: 18,
      color: colors.textSecondary,
      fontSize: 14,
      lineHeight: 20,
      textAlign: 'center',
      fontWeight: '500',
    },
    successMeta: { alignItems: 'center', marginTop: 8, marginBottom: 18 },
    successLine: { color: colors.text, fontSize: 16, fontWeight: '700' },
    successSub: { marginTop: 4, color: colors.textSecondary, fontSize: 13, fontWeight: '500' },
    modalCancel: { marginTop: 10, paddingVertical: 8 },
    modalCancelText: { color: colors.textSecondary, fontWeight: '700', fontSize: 14 },
    dangerBtn: {
      marginTop: 18,
      width: '100%',
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
      backgroundColor: '#dc2626',
      minHeight: 52,
    },
    facePhotoIconWrap: {
      width: 56,
      height: 56,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(220, 38, 38, 0.2)' : 'rgba(220, 38, 38, 0.12)',
      marginBottom: 14,
    },
    faceCaptureBtn: {
      position: 'absolute',
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 20,
      paddingVertical: 14,
      borderRadius: 16,
      backgroundColor: colors.primary,
      minHeight: 52,
      minWidth: 240,
      justifyContent: 'center',
    },
    faceCaptureBtnText: {
      color: '#fff',
      fontSize: 15,
      fontWeight: '700',
    },
  });
