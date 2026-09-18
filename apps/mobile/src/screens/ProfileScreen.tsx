import React, { useMemo, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Switch,
  Modal,
  Pressable,
  TextInput,
  Platform,
  InteractionManager,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import {
  User,
  Mail,
  Briefcase,
  Calendar,
  MapPin,
  ArrowLeft,
  Bell,
  Pencil,
  ScanFace,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useNotifications } from '../notifications/NotificationsContext';
import UserAvatar from '../components/UserAvatar';
import { uploadMultipartFile } from '../utils/uploadMultipartFile';
import type { User as AuthUser } from '../types';

type InfoRow = {
  key: string;
  label: string;
  value: string;
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
};

export default function ProfileScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { user, updateUser, biometric, enableBiometrics, disableBiometrics } = useAuth();
  const { colors, isDark } = useTheme();
  const { unreadCount, openSheet } = useNotifications();
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);
  const [bioPasswordOpen, setBioPasswordOpen] = useState(false);
  const [bioPassword, setBioPassword] = useState('');
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  const uploadProfilePhoto = useCallback(
    async (asset: ImagePicker.ImagePickerAsset) => {
      const uri = asset.uri;
      if (!uri) return;

      const name =
        asset.fileName ||
        `profile-${Date.now()}.${(asset.mimeType || 'image/jpeg').split('/')[1] || 'jpg'}`;
      const type = asset.mimeType || 'image/jpeg';

      setUploadingPhoto(true);
      try {
        const next = await uploadMultipartFile<AuthUser>({
          path: '/api/auth/me/photo',
          fieldName: 'profileAvatar',
          method: 'PATCH',
          file: { uri, name, type },
        });
        if (next?.id) {
          await updateUser(next);
        }
      } catch {
        Alert.alert('Erro', 'Não foi possível atualizar a foto.');
      } finally {
        setUploadingPhoto(false);
      }
    },
    [updateUser],
  );

  const pickFromLibrary = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão', 'Precisamos da galeria para alterar a foto.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      await uploadProfilePhoto(result.assets[0]);
    }
  }, [uploadProfilePhoto]);

  const pickFromCamera = useCallback(async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão', 'Precisamos da câmera para alterar a foto.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (!result.canceled && result.assets[0]) {
      await uploadProfilePhoto(result.assets[0]);
    }
  }, [uploadProfilePhoto]);

  const openPhotoPicker = () => {
    if (uploadingPhoto) return;
    Alert.alert('Foto de perfil', 'Como deseja alterar a foto?', [
      { text: 'Câmera', onPress: () => void pickFromCamera() },
      { text: 'Galeria', onPress: () => void pickFromLibrary() },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const confirmEnableBiometrics = async () => {
    const identifier = String(user?.email || user?.cpf || '').trim();
    const password = bioPassword;
    if (!identifier || !password) {
      Alert.alert('Senha', 'Informe a senha da conta para ativar a biometria.');
      return;
    }
    // Fecha o modal antes do Face ID — no iOS o Modal bloqueia o prompt biométrico.
    setBioPasswordOpen(false);
    setBioPassword('');
    setBioBusy(true);
    try {
      await new Promise<void>((resolve) => {
        InteractionManager.runAfterInteractions(() => {
          setTimeout(resolve, 500);
        });
      });
      await enableBiometrics(identifier, password);
      Alert.alert('Pronto', `Acesso com ${biometric.label} ativado.`);
    } catch (err) {
      Alert.alert('Biometria', err instanceof Error ? err.message : 'Não foi possível ativar.');
    } finally {
      setBioBusy(false);
    }
  };

  const onToggleBiometrics = (value: boolean) => {
    if (!biometric.available) {
      Alert.alert(
        'Biometria',
        `Cadastre ${biometric.label} neste aparelho (Ajustes) para ativar o acesso rápido.`
      );
      return;
    }
    if (value) {
      setBioPassword('');
      setBioPasswordOpen(true);
      return;
    }
    Alert.alert('Desativar biometria', 'O próximo acesso vai pedir e-mail/CPF e senha.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Desativar',
        style: 'destructive',
        onPress: () => {
          void disableBiometrics();
        },
      },
    ]);
  };

  const roleLabel = user?.employee?.position || user?.role || 'Colaborador';

  const rows: InfoRow[] = [];
  if (user?.email) {
    rows.push({ key: 'email', label: 'Email', value: user.email, icon: Mail });
  }
  if (user?.cpf) {
    rows.push({ key: 'cpf', label: 'CPF', value: user.cpf, icon: User });
  }
  if (user?.employee?.birthDate) {
    rows.push({
      key: 'birth',
      label: 'Data de nascimento',
      value: new Date(user.employee.birthDate).toLocaleDateString('pt-BR'),
      icon: Calendar,
    });
  }
  if (user?.employee?.department) {
    rows.push({
      key: 'dept',
      label: 'Setor',
      value: user.employee.department,
      icon: Briefcase,
    });
  }
  if (user?.employee?.company) {
    rows.push({
      key: 'company',
      label: 'Empresa',
      value: user.employee.company,
      icon: Briefcase,
    });
  }
  if (user?.employee?.polo) {
    rows.push({
      key: 'polo',
      label: 'Polo',
      value: user.employee.polo,
      icon: MapPin,
    });
  }
  if (user?.employee?.modality) {
    rows.push({
      key: 'modality',
      label: 'Modalidade',
      value: user.employee.modality,
      icon: Briefcase,
    });
  }

  const badge = unreadCount > 9 ? '9+' : String(unreadCount);
  const heroBg = '#ce3736';

  return (
    <View style={styles.safeArea}>
      <StatusBar style="light" />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.hero, { backgroundColor: heroBg, paddingTop: insets.top + 6 }]}>
          <View style={styles.heroTop}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.heroIconBtn}
              hitSlop={8}
              accessibilityLabel="Voltar"
            >
              <ArrowLeft size={22} color="#fff" strokeWidth={2.2} />
            </TouchableOpacity>
            <Text style={styles.heroTitle}>Perfil</Text>
            <TouchableOpacity
              onPress={openSheet}
              style={styles.heroIconBtn}
              hitSlop={8}
              accessibilityLabel="Notificações"
            >
              <View>
                <Bell size={20} color="#fff" strokeWidth={2.1} />
                {unreadCount > 0 ? (
                  <View style={styles.badge}>
                    <Text style={[styles.badgeText, { color: heroBg }]}>{badge}</Text>
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
          </View>

          <View style={styles.heroProfile}>
            <View style={styles.avatarWrap}>
              <UserAvatar
                uri={user?.profilePhotoUrl}
                size={96}
                backgroundColor="rgba(255,255,255,0.18)"
                iconColor="#fff"
              />
              <TouchableOpacity
                style={styles.editPhotoBtn}
                onPress={openPhotoPicker}
                activeOpacity={0.85}
                disabled={uploadingPhoto}
                accessibilityLabel="Alterar foto de perfil"
                hitSlop={6}
              >
                <View style={styles.editPhotoBtnInner}>
                  {uploadingPhoto ? (
                    <ActivityIndicator size="small" color="#ce3736" />
                  ) : (
                    <Pencil size={14} color="#ce3736" strokeWidth={2.4} />
                  )}
                </View>
              </TouchableOpacity>
            </View>
            <Text style={styles.name} numberOfLines={2}>
              {user?.name || 'Colaborador'}
            </Text>
            <Text style={styles.role} numberOfLines={1}>
              {roleLabel}
            </Text>
          </View>
        </View>

        <View style={styles.body}>
          <Text style={styles.sectionTitle}>Informações</Text>
          <View style={styles.infoList}>
            {rows.length === 0 ? (
              <Text style={styles.emptyText}>Nenhuma informação disponível.</Text>
            ) : (
              rows.map((row, index) => {
                const Icon = row.icon;
                return (
                  <View key={row.key}>
                    {index > 0 ? <View style={styles.divider} /> : null}
                    <View style={styles.infoItem}>
                      <View style={styles.infoIcon}>
                        <Icon size={18} color={colors.primary} strokeWidth={2} />
                      </View>
                      <View style={styles.infoText}>
                        <Text style={styles.infoLabel}>{row.label}</Text>
                        <Text style={styles.infoValue}>{row.value}</Text>
                      </View>
                    </View>
                  </View>
                );
              })
            )}
          </View>

          {Platform.OS !== 'web' ? (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 8 }]}>Acesso</Text>
              <View style={styles.bioRow}>
                <View style={styles.infoIcon}>
                  <ScanFace size={18} color={colors.primary} strokeWidth={2} />
                </View>
                <View style={styles.infoText}>
                  <Text style={styles.infoLabel}>Entrar com {biometric.label}</Text>
                  <Text style={styles.infoValue}>
                    {biometric.available
                      ? biometric.enabled
                        ? 'Ativado neste aparelho'
                        : 'Após o primeiro acesso, use facial ou digital'
                      : 'Indisponível neste aparelho'}
                  </Text>
                </View>
                <Switch
                  value={biometric.enabled}
                  onValueChange={onToggleBiometrics}
                  disabled={bioBusy || !biometric.available}
                  trackColor={{ false: isDark ? '#374151' : '#d1d5db', true: '#fca5a5' }}
                  thumbColor={biometric.enabled ? colors.primary : '#f4f4f5'}
                />
              </View>
            </>
          ) : null}
        </View>
      </ScrollView>

      <Modal
        visible={bioPasswordOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setBioPasswordOpen(false)}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setBioPasswordOpen(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Ativar {biometric.label}</Text>
            <Text style={styles.modalBody}>
              Confirme a senha da conta para guardar o acesso rápido neste aparelho.
            </Text>
            <TextInput
              value={bioPassword}
              onChangeText={setBioPassword}
              placeholder="Senha"
              placeholderTextColor={colors.textSecondary}
              secureTextEntry
              style={styles.modalInput}
              autoFocus
            />
            <TouchableOpacity
              style={styles.modalPrimary}
              onPress={() => void confirmEnableBiometrics()}
              disabled={bioBusy}
            >
              {bioBusy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.modalPrimaryText}>Ativar</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setBioPasswordOpen(false)}>
              <Text style={styles.modalCancel}>Cancelar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const getStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.screenRoot,
    },
    container: {
      flex: 1,
      backgroundColor: colors.screenRoot,
    },
    scrollContent: {
      paddingBottom: 40,
      backgroundColor: colors.screenRoot,
      flexGrow: 1,
    },
    hero: {
      borderBottomLeftRadius: 36,
      borderBottomRightRadius: 36,
      paddingHorizontal: 16,
      paddingBottom: 22,
      marginBottom: 20,
      overflow: 'hidden',
    },
    heroTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 18,
    },
    heroIconBtn: {
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroTitle: {
      color: '#fff',
      fontSize: 17,
      fontWeight: '700',
      letterSpacing: -0.2,
    },
    badge: {
      position: 'absolute',
      top: -5,
      right: -7,
      minWidth: 16,
      height: 16,
      borderRadius: 8,
      paddingHorizontal: 3,
      backgroundColor: '#fff',
      alignItems: 'center',
      justifyContent: 'center',
    },
    badgeText: {
      fontSize: 9,
      fontWeight: '800',
      lineHeight: 11,
    },
    heroProfile: {
      alignItems: 'center',
      marginBottom: 4,
    },
    avatarWrap: {
      width: 96,
      height: 96,
      marginBottom: 14,
    },
    editPhotoBtn: {
      position: 'absolute',
      top: 0,
      right: 0,
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: '#ce3736',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    editPhotoBtnInner: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: '#fff',
      alignItems: 'center',
      justifyContent: 'center',
    },
    name: {
      color: '#fff',
      fontSize: 22,
      fontWeight: '700',
      letterSpacing: -0.3,
      textAlign: 'center',
      paddingHorizontal: 12,
    },
    role: {
      color: 'rgba(255,255,255,0.88)',
      fontSize: 14,
      fontWeight: '500',
      marginTop: 4,
      textAlign: 'center',
    },
    body: {
      paddingHorizontal: 20,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
      letterSpacing: -0.3,
      marginBottom: 12,
      textAlign: 'center',
    },
    infoList: {
      marginBottom: 16,
    },
    emptyText: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '500',
      padding: 16,
      textAlign: 'center',
    },
    infoItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      gap: 12,
    },
    infoIcon: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: isDark ? 'rgba(239,68,68,0.14)' : colors.iconBackground,
      alignItems: 'center',
      justifyContent: 'center',
    },
    infoText: {
      flex: 1,
      minWidth: 0,
    },
    infoLabel: {
      fontSize: 12,
      color: colors.textSecondary,
      fontWeight: '500',
      marginBottom: 2,
    },
    infoValue: {
      fontSize: 15,
      color: colors.text,
      fontWeight: '600',
      letterSpacing: -0.2,
    },
    divider: {
      height: StyleSheet.hairlineWidth,
      backgroundColor: isDark ? colors.border : 'rgba(15,23,42,0.08)',
      marginLeft: 48,
    },
    bioRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingVertical: 8,
      marginBottom: 16,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      justifyContent: 'center',
      padding: 24,
    },
    modalCard: {
      backgroundColor: colors.card,
      borderRadius: 18,
      padding: 20,
    },
    modalTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 8,
    },
    modalBody: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.textSecondary,
      marginBottom: 14,
    },
    modalInput: {
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: colors.text,
      fontSize: 15,
      backgroundColor: isDark ? colors.screenRoot : colors.surface,
      marginBottom: 14,
    },
    modalPrimary: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      marginBottom: 10,
    },
    modalPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    modalCancel: {
      textAlign: 'center',
      color: colors.textSecondary,
      fontWeight: '600',
      paddingVertical: 6,
    },
  });
