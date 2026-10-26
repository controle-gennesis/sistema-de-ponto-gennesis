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
  Platform,
  Vibration,
  Animated,
  Easing,
  Keyboard,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Camera,
  Check,
  CloudUpload,
  LogIn,
  LogOut,
  MapPin,
  PersonStanding,
  QrCode,
  RotateCw,
  ScanFace,
  SwitchCamera,
  Utensils,
  X,
} from 'lucide-react-native';
import * as Location from 'expo-location';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import NetInfo from '@react-native-community/netinfo';
import MapView, { Circle, Marker, type Region } from 'react-native-maps';
import Svg, { Defs, Ellipse, LinearGradient as SvgGradient, Mask, Path, Rect, Stop } from 'react-native-svg';
import { useTheme } from '../context/ThemeContext';
import AppHeader from '../components/AppHeader';
import FormFieldLabel from '../components/FormFieldLabel';
import api from '../services/api';
import { uploadMultipartFile } from '../utils/uploadMultipartFile';
import { resolveMediaUrl } from '../utils/resolveMediaUrl';
import { isNetworkError } from '../utils/network';
import { enqueuePendingPunch, pendingPunchCount } from '../services/punchOfflineQueue';

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
  /** Forma de bater ponto neste local; null = segue a configuração geral. */
  punchMethod?: 'FACE' | 'QR' | 'BOTH' | null;
};

type PunchPolicy = {
  geofenceEnabled: boolean;
  geofenceBlockOutside: boolean;
  geofenceRequireLocation: boolean;
  requireFaceMatch: boolean;
  requirePunchQr: boolean;
  /** O que a pessoa pode usar pra bater ponto: rosto, QR ou os dois (escolhe um). */
  punchMethods?: { face: boolean; qr: boolean };
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

function metersToLatitudeDelta(meters: number) {
  return Math.max(meters / 111320, 0.003);
}

/** Um único leque: forte na bolinha e some no final (sem borda dura). */
/**
 * Círculo + pin de um local autorizado. Memoizado: a tela re-renderiza todo segundo (relógio) e,
 * sem isso, o pin era recriado e o balão (nome/raio) fechava ou nem abria.
 */
const PunchLocationMarker = React.memo(function PunchLocationMarker({
  loc,
  inside,
}: {
  loc: PunchPolicyLocation;
  inside: boolean;
}) {
  return (
    <>
      <Circle
        center={{ latitude: loc.latitude, longitude: loc.longitude }}
        radius={loc.radius}
        strokeWidth={2}
        strokeColor={inside ? 'rgba(22,163,74,0.9)' : 'rgba(220,38,38,0.85)'}
        fillColor={inside ? 'rgba(22,163,74,0.18)' : 'rgba(220,38,38,0.14)'}
      />
      <Marker
        coordinate={{ latitude: loc.latitude, longitude: loc.longitude }}
        title={loc.name}
        description={`Raio ${loc.radius} m`}
        pinColor={inside ? '#16a34a' : '#dc2626'}
      />
    </>
  );
});

function HeadingVisionCone({ color }: { color: string }) {
  const gid = color.replace('#', '');
  return (
    <Svg width={64} height={56} viewBox="0 0 64 56">
      <Defs>
        <SvgGradient id={`vision-${gid}`} x1="32" y1="54" x2="32" y2="0" gradientUnits="userSpaceOnUse">
          <Stop offset="0%" stopColor={color} stopOpacity="0.58" />
          <Stop offset="30%" stopColor={color} stopOpacity="0.34" />
          <Stop offset="55%" stopColor={color} stopOpacity="0.14" />
          <Stop offset="75%" stopColor={color} stopOpacity="0.04" />
          <Stop offset="90%" stopColor={color} stopOpacity="0" />
          <Stop offset="100%" stopColor={color} stopOpacity="0" />
        </SvgGradient>
      </Defs>
      {/* ponta curva + fade a 0 antes da borda — evita “linha” no fim */}
      <Path d="M32 54 L10 8 Q32 -4 54 8 Z" fill={`url(#vision-${gid})`} />
    </Svg>
  );
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
  const [heading, setHeading] = useState<number | null>(null);
  const [arriveFlash, setArriveFlash] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [pendingPunches, setPendingPunches] = useState(0);

  // Batidas guardadas no aparelho esperando sinal: confere ao abrir, a cada poucos segundos e
  // quando a conexão muda (a sincronização roda em segundo plano e esvazia a fila).
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void pendingPunchCount().then((n) => {
        if (alive) setPendingPunches(n);
      });
    };
    refresh();
    const timer = setInterval(refresh, 6000);
    const unsubscribe = NetInfo.addEventListener(() => refresh());
    return () => {
      alive = false;
      clearInterval(timer);
      unsubscribe();
    };
  }, []);

  // iOS: sobe o conteúdo acima do teclado (o campo de observação ficava escondido atrás dele).
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const subs = [
      Keyboard.addListener('keyboardWillChangeFrame', (e) =>
        setKeyboardHeight(Math.max(0, windowHeight - e.endCoordinates.screenY))
      ),
      Keyboard.addListener('keyboardWillHide', () => setKeyboardHeight(0)),
    ];
    return () => subs.forEach((sub) => sub.remove());
  }, [windowHeight]);

  useEffect(() => {
    if (!showSuccessModal) return;
    successPop.setValue(0);
    successPulse.setValue(0);
    successFade.setValue(0);
    // Vibração curta de confirmação (no iOS o sistema usa a vibração padrão).
    try {
      Vibration.vibrate([0, 40, 50, 80]);
    } catch {
      /* ignore */
    }
    Animated.sequence([
      Animated.delay(120),
      Animated.parallel([
        Animated.spring(successPop, {
          toValue: 1,
          friction: 4.5,
          tension: 140,
          useNativeDriver: true,
        }),
        Animated.timing(successPulse, {
          toValue: 1,
          duration: 700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(successFade, {
          toValue: 1,
          duration: 380,
          delay: 160,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [showSuccessModal, successFade, successPop, successPulse]);
  const [loading, setLoading] = useState(false);
  const [observation, setObservation] = useState('');
  const [todayRecords, setTodayRecords] = useState<Array<{ type: string; timestamp?: string }>>([]);
  const [allPointsCompleted, setAllPointsCompleted] = useState(false);
  const [selectedType, setSelectedType] = useState<TimeRecordType>(TimeRecordType.ENTRY);
  const [cameraPermission, setCameraPermission] = useState<boolean | null>(null);
  const [locationPermission, setLocationPermission] = useState<boolean | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [address, setAddress] = useState('Obtendo localização');
  const [loadingDots, setLoadingDots] = useState(1);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  // Animação do "ponto registrado": o check salta com mola e um anel se expande por trás.
  const successPop = useRef(new Animated.Value(0)).current;
  const successPulse = useRef(new Animated.Value(0)).current;
  const successFade = useRef(new Animated.Value(0)).current;
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
  const [faceCameraMode, setFaceCameraMode] = useState<'check' | 'register' | 'offline'>('check');
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
  const mapRef = useRef<MapView>(null);
  const mapFittedRef = useRef(false);
  const wasInsideFenceRef = useRef(false);
  const addressLookupAtRef = useRef(0);
  const headingFromCompassRef = useRef(false);

  useEffect(() => {
    void requestPermissions();
    void fetchTodayRecords();
    void fetchPunchPolicy();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const isAddressLoading = !location || address.startsWith('Obtendo localização');

  useEffect(() => {
    if (!isAddressLoading) return;
    const timer = setInterval(() => {
      setLoadingDots((prev) => (prev % 3) + 1);
    }, 450);
    return () => clearInterval(timer);
  }, [isAddressLoading]);

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
  };

  const resolveAddress = useCallback(async (lat: number, lon: number) => {
    const now = Date.now();
    if (now - addressLookupAtRef.current < 12000) return;
    addressLookupAtRef.current = now;
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&addressdetails=1&zoom=18`,
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
  }, []);

  useEffect(() => {
    if (!locationPermission) return;
    let cancelled = false;
    let positionSub: Location.LocationSubscription | null = null;

    const startWatch = async () => {
      try {
        const first = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        if (cancelled) return;
        setLocation(first);
        if (
          !headingFromCompassRef.current &&
          typeof first.coords.heading === 'number' &&
          first.coords.heading >= 0
        ) {
          setHeading(first.coords.heading);
        }
        void resolveAddress(first.coords.latitude, first.coords.longitude);

        positionSub = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 1200,
            distanceInterval: 2,
          },
          (next) => {
            setLocation(next);
            if (
              !headingFromCompassRef.current &&
              typeof next.coords.heading === 'number' &&
              next.coords.heading >= 0
            ) {
              setHeading(next.coords.heading);
            }
            void resolveAddress(next.coords.latitude, next.coords.longitude);
          }
        );
      } catch {
        if (!cancelled) setAddress('Erro ao obter localização');
      }
    };

    void startWatch();
    return () => {
      cancelled = true;
      positionSub?.remove();
    };
  }, [locationPermission, resolveAddress]);

  useEffect(() => {
    if (!locationPermission) return;
    let cancelled = false;
    let headingSub: Location.LocationSubscription | null = null;

    const startHeading = async () => {
      try {
        headingSub = await Location.watchHeadingAsync((next) => {
          if (cancelled) return;
          const value =
            typeof next.trueHeading === 'number' && next.trueHeading >= 0
              ? next.trueHeading
              : typeof next.magHeading === 'number' && next.magHeading >= 0
                ? next.magHeading
                : null;
          if (value == null) return;
          headingFromCompassRef.current = true;
          setHeading((prev) => {
            if (prev != null) {
              const diff = Math.abs(prev - value);
              const shortest = Math.min(diff, 360 - diff);
              if (shortest < 2) return prev;
            }
            return value;
          });
        });
      } catch {
        /* sem bússola — heading do GPS fica como fallback */
      }
    };

    void startHeading();
    return () => {
      cancelled = true;
      headingSub?.remove();
    };
  }, [locationPermission]);

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
    const net = await NetInfo.fetch();
    const offline = net.isConnected === false;
    faceMatchedRef.current = false;
    faceScanLockRef.current = false;
    setFaceCameraMode(offline ? 'offline' : 'check');
    setFaceConfirmed(false);
    setPhoto(null);
    setFaceScanStatus(offline ? 'Sem internet — capture a foto para sincronizar' : 'Encaixe o rosto no oval');
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

  const captureFaceOfflinePhoto = useCallback(async () => {
    if (faceRegisterBusy || faceCameraMode !== 'offline') return;
    setFaceRegisterBusy(true);
    setFaceScanStatus('Capturando...');
    setFaceScanTone('checking');
    try {
      const shot = await faceCameraRef.current?.takePictureAsync({
        quality: 0.7,
        shutterSound: false,
      });
      if (!shot?.uri) {
        setFaceScanStatus('Não foi possível capturar — tente de novo');
        setFaceScanTone('bad');
        return;
      }
      setPhoto(shot.uri);
      setFaceConfirmed(true);
      setFaceScanStatus('Foto salva — será conferida ao sincronizar');
      setFaceScanTone('ok');
      setTimeout(() => {
        setFaceCameraOpen(false);
        setFaceCameraMode('check');
        setFaceRegisterBusy(false);
        setFaceScanStatus('Encaixe o rosto no oval');
        setFaceScanTone('neutral');
      }, 700);
    } catch {
      setFaceScanStatus('Não foi possível capturar — tente de novo');
      setFaceScanTone('bad');
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
    } catch (err) {
      if (isNetworkError(err)) {
        setFaceCameraMode('offline');
        setFaceScanStatus('Sem internet — capture a foto para sincronizar');
        setFaceScanTone('neutral');
        return;
      }
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
    if (!methodDone) {
      Alert.alert(
        bothAllowed ? 'Confirmação' : qrAllowed ? 'QR da localidade' : 'Conferência facial',
        bothAllowed
          ? 'Abra a câmera e confirme o rosto ou leia o QR da localidade.'
          : qrAllowed
            ? 'Leia o QR Code do local onde o serviço será prestado.'
            : 'Abra a câmera e aguarde a confirmação do rosto.'
      );
      return;
    }
    if (!location) {
      Alert.alert('Localização', 'Não foi possível obter sua localização.');
      return;
    }
    if (punchPolicy?.geofenceEnabled && punchPolicy.geofenceBlockOutside && location) {
      const locs = punchPolicy.locations ?? [];
      if (locs.length > 0) {
        const nearest = locs
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
        if (nearest && nearest.distance > nearest.loc.radius) {
          Alert.alert(
            'Fora da área',
            `Você precisa estar dentro do raio de ${nearest.loc.name} para registrar o ponto.`
          );
          return;
        }
      }
    }
    if (!usingQrOnly && !hasPunchFacePhoto(punchPolicy)) {
      setShowFacePhotoModal(true);
      return;
    }

    setLoading(true);
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const localTimestamp = `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
    const punchTypeLabels: Record<TimeRecordType, string> = {
      ENTRY: 'Entrada',
      LUNCH_START: 'Saída para almoço',
      LUNCH_END: 'Retorno do almoço',
      EXIT: 'Saída',
      ABSENCE_JUSTIFIED: 'Ausência justificada',
    };

    try {
      const data = await uploadMultipartFile<{ punchLocationName?: string | null }>({
        path: '/api/time-records/punch',
        fieldName: 'photo',
        file: usingQrOnly || !photo ? undefined : { uri: photo, name: 'punch_photo.jpg', type: 'image/jpeg' },
        fields: {
          type: selectedType,
          latitude: location.coords.latitude.toString(),
          longitude: location.coords.longitude.toString(),
          observation: observation.trim() || '',
          clientTimestamp: localTimestamp,
          ...(scannedPunchQr ? { punchQrToken: scannedPunchQr } : {}),
        },
      });

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
      if (isNetworkError(error) && photo && location && !usingQrOnly) {
        try {
          await enqueuePendingPunch({
            type: selectedType,
            latitude: location.coords.latitude.toString(),
            longitude: location.coords.longitude.toString(),
            observation: observation.trim() || '',
            clientTimestamp: localTimestamp,
            punchQrToken: scannedPunchQr || undefined,
            photoUri: photo,
          });
          void pendingPunchCount().then(setPendingPunches);
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
          Alert.alert(
            'Salvo no aparelho',
            'Sem internet agora. O ponto será enviado automaticamente quando a conexão voltar.'
          );
          return;
        } catch {
          /* cai no alerta abaixo */
        }
      }
      Alert.alert('Erro ao registrar ponto', error instanceof Error ? error.message : 'Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  /** Botão único: abre a câmera no método permitido (rosto por padrão; QR se só ele vale). */
  const openPunchCamera = async () => {
    if (faceAllowed) {
      await openFaceCamera();
    } else {
      await openPunchQrScanner();
    }
  };

  /** Vira a câmera: rosto (frontal) <-> QR (traseira), sem sair da tela de câmera. */
  const flipPunchCamera = async () => {
    if (faceCameraOpen) {
      // Rosto -> QR: para a leitura do rosto sem apagar o que já foi confirmado.
      faceMatchedRef.current = false;
      faceScanLockRef.current = false;
      setFaceScanBusy(false);
      setFaceCameraOpen(false);
      qrLockRef.current = false;
      setQrScannerOpen(true);
    } else {
      setQrScannerOpen(false);
      await startFaceCheckCamera();
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
  const dateLabel = currentTime.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const nearestFence = useMemo(() => {
    if (!location || !punchPolicy?.locations?.length) return null;
    return punchPolicy.locations
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
  }, [location, punchPolicy?.locations]);

  let fenceOk = !punchPolicy?.geofenceEnabled;
  if (punchPolicy?.geofenceEnabled && nearestFence) {
    fenceOk = nearestFence.distance <= nearestFence.loc.radius;
  }

  // Formas permitidas de bater ponto: as do local onde a pessoa está (dentro do raio); fora de
  // qualquer local, a configuração geral. Rosto, QR ou as duas (escolhe uma).
  const currentPunchLocation =
    nearestFence && nearestFence.distance <= nearestFence.loc.radius ? nearestFence.loc : null;
  const generalMethods = {
    face: punchPolicy?.punchMethods?.face ?? true,
    qr: punchPolicy?.punchMethods?.qr ?? Boolean(punchPolicy?.requirePunchQr),
  };
  const locationMethod = currentPunchLocation?.punchMethod ?? null;
  const faceAllowed =
    locationMethod === 'QR' ? false : locationMethod ? true : generalMethods.face;
  const qrAllowed =
    locationMethod === 'FACE' ? false : locationMethod ? true : generalMethods.qr;
  const bothAllowed = faceAllowed && qrAllowed;
  const faceDone = faceAllowed && faceConfirmed && Boolean(photo);
  const qrDone = qrAllowed && Boolean(scannedPunchQr) && Boolean(scannedLocationName);
  const methodDone = faceDone || qrDone;
  // Com o QR lido e aceito, o QR basta (sem selfie); senão vale o rosto.
  const usingQrOnly = qrDone && !faceDone;


  const mapLocations = punchPolicy?.locations ?? [];
  const showGeoMap =
    Platform.OS !== 'web' &&
    Boolean(punchPolicy?.geofenceEnabled) &&
    mapLocations.length > 0 &&
    Boolean(location);

  const mapRegion = useMemo((): Region | null => {
    if (!location || !mapLocations.length) return null;
    const points = [
      { latitude: location.coords.latitude, longitude: location.coords.longitude },
      ...mapLocations.map((loc) => ({ latitude: loc.latitude, longitude: loc.longitude })),
    ];
    const lats = points.map((p) => p.latitude);
    const lons = points.map((p) => p.longitude);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const maxRadius = Math.max(...mapLocations.map((loc) => loc.radius), 100);
    const radiusPad = metersToLatitudeDelta(maxRadius * 1.35);
    const latSpan = Math.max(maxLat - minLat, 0.002) + radiusPad * 2;
    const lonSpan = Math.max(maxLon - minLon, 0.002) + radiusPad * 2;
    return {
      latitude: (minLat + maxLat) / 2,
      longitude: (minLon + maxLon) / 2,
      latitudeDelta: Math.max(latSpan * 1.35, 0.006),
      longitudeDelta: Math.max(lonSpan * 1.35, 0.006),
    };
  }, [location, mapLocations]);

  useEffect(() => {
    if (!punchPolicy?.geofenceEnabled || !nearestFence) return;
    const inside = nearestFence.distance <= nearestFence.loc.radius;
    if (inside && !wasInsideFenceRef.current) {
      wasInsideFenceRef.current = true;
      setArriveFlash(true);
      try {
        Vibration.vibrate([0, 70, 50, 90]);
      } catch {
        /* ignore */
      }
      const t = setTimeout(() => setArriveFlash(false), 2400);
      return () => clearTimeout(t);
    }
    if (!inside) {
      wasInsideFenceRef.current = false;
    }
  }, [nearestFence, punchPolicy?.geofenceEnabled]);

  useEffect(() => {
    if (!showGeoMap || !location || !mapLocations.length || mapFittedRef.current) return;
    const coords = [
      {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      },
      ...mapLocations.map((loc) => ({
        latitude: loc.latitude,
        longitude: loc.longitude,
      })),
    ];
    const t = setTimeout(() => {
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 48, right: 48, bottom: 48, left: 48 },
        animated: true,
      });
      mapFittedRef.current = true;
    }, 450);
    return () => clearTimeout(t);
  }, [showGeoMap, location, mapLocations]);

  const outsideBlocked =
    Boolean(punchPolicy?.geofenceEnabled) &&
    Boolean(punchPolicy?.geofenceBlockOutside) &&
    !fenceOk;

  const punchBlocked = loading || !methodDone || !location || allPointsCompleted || outsideBlocked;

  const registeredFacePhotoUri = resolveMediaUrl(punchPolicy?.facePhotoUrl ?? null);
  const confirmedFacePreviewUri = registeredFacePhotoUri || photo;

  const readyLabel = allPointsCompleted
    ? 'Todos os pontos de hoje já foram registrados.'
    : outsideBlocked
      ? 'Fora da área autorizada — aproxime-se do local para registrar.'
      : !location && !methodDone
        ? bothAllowed
          ? 'Permita a localização e confirme o rosto ou leia o QR para continuar.'
          : qrAllowed
            ? 'Permita a localização e leia o QR da localidade para continuar.'
            : 'Permita a localização e confirme o rosto para continuar.'
        : location && !methodDone
          ? bothAllowed
            ? 'Abra a câmera: confirme o rosto ou vire para ler o QR da localidade.'
            : qrAllowed
              ? 'Leia o QR da localidade para concluir.'
              : 'Abra a câmera e aguarde a confirmação do rosto.'
          : !location && methodDone
            ? 'Obtendo localização...'
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
        ref={scrollRef}
        style={styles.container}
        contentContainerStyle={[styles.body, keyboardHeight > 0 ? { paddingBottom: keyboardHeight + 24 } : null]}
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
          <View style={styles.timeline}>
            {PUNCH_TYPES.map((step, index) => {
              const record = todayRecords.find((rec) => rec.type === step.type);
              const done = Boolean(record);
              const isNext = !done && !allPointsCompleted && step.type === selectedType;
              const StepIcon = step.Icon;
              const time = record?.timestamp
                ? new Date(record.timestamp).toLocaleTimeString('pt-BR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : '';
              return (
                <React.Fragment key={step.type}>
                  {index > 0 ? (
                    <View
                      style={[
                        styles.timelineLine,
                        done || todayRecords.some((rec) => rec.type === PUNCH_TYPES[index - 1].type)
                          ? styles.timelineLineDone
                          : null,
                      ]}
                    />
                  ) : null}
                  <View style={styles.timelineStep}>
                    <View
                      style={[
                        styles.timelineDot,
                        done ? styles.timelineDotDone : null,
                        isNext ? styles.timelineDotNext : null,
                      ]}
                    >
                      {done ? (
                        <Check size={15} color="#fff" strokeWidth={3} />
                      ) : (
                        <StepIcon
                          size={16}
                          color={isNext ? '#fff' : colors.textSecondary}
                          strokeWidth={2.4}
                        />
                      )}
                    </View>
                    <Text style={[styles.timelineLabel, isNext ? styles.timelineLabelNext : null]}>
                      {step.label}
                    </Text>
                    <Text style={styles.timelineTime}>{time || ' '}</Text>
                  </View>
                </React.Fragment>
              );
            })}
          </View>
        </View>

        {pendingPunches > 0 ? (
          <View style={styles.pendingNotice} accessibilityRole="alert">
            <CloudUpload size={16} color={isDark ? '#fbbf24' : '#b45309'} strokeWidth={2.2} />
            <Text style={styles.pendingNoticeText}>
              {pendingPunches === 1
                ? '1 ponto aguardando envio'
                : `${pendingPunches} pontos aguardando envio`}
            </Text>
          </View>
        ) : null}

        <View style={styles.box}>
          <FormFieldLabel
            label={bothAllowed ? 'Confirmação' : qrAllowed ? 'QR da localidade' : 'Conferência do rosto'}
            required
            style={styles.boxTitle}
          />
          <View style={[styles.locationRow, { marginBottom: 14 }]}>
            <View style={styles.homeIcon}>
              {bothAllowed ? (
                <Camera size={20} color={colors.primary} strokeWidth={2.2} />
              ) : faceAllowed ? (
                <ScanFace size={20} color={colors.primary} strokeWidth={2.2} />
              ) : (
                <QrCode size={20} color={colors.primary} strokeWidth={2.2} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.locationText}>
                {faceDone
                  ? 'Rosto confirmado. Pode registrar o ponto.'
                  : qrDone
                    ? `QR lido: ${scannedLocationName}. Pode registrar o ponto.`
                    : bothAllowed
                      ? 'Abra a câmera: confirme o rosto ou vire para ler o QR da localidade'
                      : qrAllowed
                        ? 'Leia o QR Code do local onde o serviço será prestado'
                        : 'Abra a câmera e aguarde a confirmação automática'}
              </Text>
            </View>
          </View>
          {faceDone && confirmedFacePreviewUri ? (
            <TouchableOpacity
              onPress={() => setShowPhoto(true)}
              activeOpacity={0.9}
              accessibilityLabel="Ver foto"
            >
              <Image source={{ uri: confirmedFacePreviewUri }} style={styles.photo} />
            </TouchableOpacity>
          ) : null}
          <View style={styles.photoActions}>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => void openPunchCamera()} activeOpacity={0.85}>
              <View style={styles.btnRow}>
                {faceAllowed ? (
                  <Camera size={18} color="#fff" strokeWidth={2.2} />
                ) : (
                  <QrCode size={18} color="#fff" strokeWidth={2.2} />
                )}
                <Text style={styles.primaryBtnText}>
                  {methodDone
                    ? faceAllowed
                      ? 'Conferir de novo'
                      : 'Ler de novo'
                    : faceAllowed
                      ? 'Abrir câmera'
                      : 'Ler QR da localidade'}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.box}>
          <FormFieldLabel label="Localização" style={styles.boxTitle} />
          <View style={styles.locationRow}>
            <View style={styles.homeIcon}>
              <MapPin size={20} color={colors.primary} strokeWidth={2.2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.locationText}>
                {isAddressLoading ? `Obtendo localização${'.'.repeat(loadingDots)}` : address}
              </Text>
            </View>
          </View>
          {showGeoMap && mapRegion && location ? (
            <View style={[styles.mapWrap, arriveFlash ? styles.mapWrapActive : null]}>
              <MapView
                ref={mapRef}
                style={styles.map}
                initialRegion={mapRegion}
                pitchEnabled={false}
                rotateEnabled={false}
                showsUserLocation={false}
                showsMyLocationButton={false}
                toolbarEnabled={false}
              >
                {mapLocations.map((loc) => (
                  <PunchLocationMarker
                    key={loc.id}
                    loc={loc}
                    inside={
                      haversineMeters(
                        location.coords.latitude,
                        location.coords.longitude,
                        loc.latitude,
                        loc.longitude
                      ) <= loc.radius
                    }
                  />
                ))}
                <Marker
                  coordinate={{
                    latitude: location.coords.latitude,
                    longitude: location.coords.longitude,
                  }}
                  anchor={{ x: 0.5, y: 0.85 }}
                  flat
                  tracksViewChanges
                >
                  <View style={styles.youMarkerWrap}>
                    <View
                      style={[
                        styles.youVisionPivot,
                        {
                          transform: [
                            { rotate: `${typeof heading === 'number' ? heading : 0}deg` },
                          ],
                        },
                      ]}
                      pointerEvents="none"
                    >
                      <HeadingVisionCone color={fenceOk ? '#16a34a' : '#3b82f6'} />
                    </View>
                    <View
                      style={[
                        styles.youMarker,
                        {
                          backgroundColor: fenceOk ? '#16a34a' : '#2563eb',
                          borderColor: '#fff',
                        },
                      ]}
                    >
                      <PersonStanding size={16} color="#fff" strokeWidth={2.4} />
                    </View>
                  </View>
                </Marker>
              </MapView>
            </View>
          ) : null}
        </View>

        <View style={styles.box}>
          <FormFieldLabel label="Observação" style={styles.boxTitle} />
          <TextInput
            style={styles.input}
            value={observation}
            onChangeText={setObservation}
            onFocus={() => {
              // Espera o teclado abrir e leva o campo pra dentro da tela.
              setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 280);
            }}
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
        visible={faceCameraOpen || qrScannerOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        statusBarTranslucent
        onRequestClose={() => (faceCameraOpen ? closeFaceCamera() : setQrScannerOpen(false))}
      >
        <View style={styles.scannerContainer}>
          {faceCameraOpen ? (
            <>
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
          {faceCameraMode === 'register' || faceCameraMode === 'offline' ? (
            <TouchableOpacity
              style={[styles.faceCaptureBtn, { bottom: Math.max(insets.bottom + 88, 108) }]}
              onPress={() =>
                void (faceCameraMode === 'offline'
                  ? captureFaceOfflinePhoto()
                  : captureFaceRegisterPhoto())
              }
              disabled={faceRegisterBusy}
              activeOpacity={0.85}
            >
              {faceRegisterBusy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Camera size={20} color="#fff" strokeWidth={2.2} />
                  <Text style={styles.faceCaptureBtnText}>
                    {faceCameraMode === 'offline' ? 'Capturar foto (offline)' : 'Capturar foto do ponto'}
                  </Text>
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
            </>
          ) : (
            <>
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
            </>
          )}
          {bothAllowed && (qrScannerOpen || (faceCameraOpen && faceCameraMode === 'check')) ? (
            <TouchableOpacity
              style={[styles.flipBtn, { top: Math.max(insets.top + 12, 28) }]}
              onPress={() => void flipPunchCamera()}
              activeOpacity={0.85}
              accessibilityLabel={qrScannerOpen ? 'Voltar para o rosto' : 'Ler QR da localidade'}
            >
              <SwitchCamera size={20} color="#fff" strokeWidth={2.2} />
              <Text style={styles.flipBtnText}>{qrScannerOpen ? 'Rosto' : 'QR do local'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </Modal>

      <Modal visible={showSuccessModal} transparent animationType="fade" onRequestClose={() => { setShowSuccessModal(false); navigation.goBack(); }}>
        <Pressable style={styles.modalBackdrop} onPress={() => { setShowSuccessModal(false); navigation.goBack(); }}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.successRing}>
              {/* anel que se expande e some por trás do check */}
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.successPulse,
                  {
                    opacity: successPulse.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.45, 0] }),
                    transform: [
                      { scale: successPulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.9] }) },
                    ],
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.successIcon,
                  {
                    opacity: successPop.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
                    transform: [
                      { scale: successPop.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) },
                    ],
                  },
                ]}
              >
                <Check size={28} color="#fff" strokeWidth={3} />
              </Animated.View>
            </View>
            <Animated.Text
              style={[
                styles.modalTitle,
                {
                  opacity: successFade,
                  transform: [{ translateY: successFade.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
                },
              ]}
            >
              Ponto registrado
            </Animated.Text>
            {successData ? (
              <Animated.View
                style={[
                  styles.successMeta,
                  {
                    opacity: successFade,
                    transform: [{ translateY: successFade.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
                  },
                ]}
              >
                <Text style={styles.successLine}>{successData.type}</Text>
                <Text style={styles.successSub}>
                  {successData.date} · {successData.time}
                </Text>
              </Animated.View>
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
      fontSize: 38,
      fontWeight: '800',
      letterSpacing: -1,
      color: colors.text,
      // Dígitos de largura fixa: o relógio não "balança" a cada segundo.
      fontVariant: ['tabular-nums'],
    },
    timeline: {
      marginTop: 18,
      width: '100%',
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: 4,
    },
    timelineStep: { width: 64, alignItems: 'center' },
    timelineDot: {
      // Quadradinho arredondado, como o fundo do ícone da lista vazia.
      width: 36,
      height: 36,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? colors.card : colors.surface,
    },
    timelineDotDone: { backgroundColor: '#16a34a' },
    timelineDotNext: { backgroundColor: colors.primary },
    timelineLine: {
      flex: 1,
      height: 2,
      marginTop: 17,
      borderRadius: 1,
      backgroundColor: isDark ? colors.border : 'rgba(15, 23, 42, 0.12)',
    },
    timelineLineDone: { backgroundColor: '#16a34a' },
    timelineLabel: {
      marginTop: 6,
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    timelineLabelNext: { color: colors.primary, fontWeight: '800' },
    timelineTime: {
      marginTop: 1,
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary,
      fontVariant: ['tabular-nums'],
    },
    date: {
      marginTop: 6,
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '500',
    },
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
    locationRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
    locationIcon: {
      width: 36,
      height: 36,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(206,55,54,0.16)' : 'rgba(206,55,54,0.1)',
    },
    locationText: { color: colors.textSecondary, fontSize: 13, fontWeight: '500', lineHeight: 18 },
    coords: { marginTop: 4, color: colors.textSecondary, fontSize: 12, fontWeight: '500' },
    mapWrap: {
      marginTop: 12,
      borderRadius: 14,
      overflow: 'hidden',
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: isDark ? colors.border : 'rgba(15, 23, 42, 0.08)',
      backgroundColor: isDark ? colors.card : colors.surface,
    },
    pendingNotice: {
      marginTop: 14,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: 12,
      backgroundColor: isDark ? 'rgba(245,158,11,0.14)' : 'rgba(245,158,11,0.12)',
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: isDark ? 'rgba(245,158,11,0.3)' : 'rgba(217,119,6,0.25)',
    },
    pendingNoticeText: {
      flex: 1,
      fontSize: 12,
      fontWeight: '600',
      color: isDark ? '#fbbf24' : '#b45309',
    },
    confirmHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
    // Mesmas medidas dos cartões da tela de início (Agenda, Tarefas).
    homeIcon: {
      width: 42,
      height: 42,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `${colors.primary}14`,
    },
    confirmTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
      letterSpacing: -0.3,
      marginBottom: 0,
    },
    confirmHint: {
      marginTop: 2,
      fontSize: 13,
      fontWeight: '500',
      lineHeight: 18,
      color: colors.textSecondary,
    },
    mapWrapActive: {
      borderColor: '#16a34a',
      borderWidth: 2,
    },
    map: {
      width: '100%',
      height: 210,
    },
    youMarkerWrap: {
      width: 64,
      height: 72,
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingBottom: 2,
      overflow: 'visible',
    },
    youVisionPivot: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      bottom: 15,
      alignItems: 'center',
      justifyContent: 'flex-end',
      transformOrigin: '32px 57px',
    },
    youMarker: {
      width: 30,
      height: 30,
      borderRadius: 15,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2.5,
      shadowColor: '#0f172a',
      shadowOpacity: 0.25,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
      elevation: 3,
      zIndex: 2,
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
      ...StyleSheet.absoluteFill,
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
    flipBtn: {
      position: 'absolute',
      right: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: 'rgba(0,0,0,0.6)',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: 999,
      zIndex: 20,
    },
    flipBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
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
    successPulse: {
      position: 'absolute',
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: '#16a34a',
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
