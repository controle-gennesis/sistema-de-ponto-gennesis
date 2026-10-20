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
import * as ImagePicker from 'expo-image-picker';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  User,
  Mail,
  Briefcase,
  Calendar,
  MapPin,
  Pencil,
  Phone,
  ScanFace,
  KeyRound,
  LogOut,
  Moon,
  Sun,
  ChevronRight,
} from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import AppHeader from '../components/AppHeader';
import UserAvatar from '../components/UserAvatar';
import { uploadMultipartFile } from '../utils/uploadMultipartFile';
import { api } from '../services/api';
import { saveBiometricCredentials } from '../services/biometricAuth';
import type { User as AuthUser } from '../types';

/** 61999998888 -> (61) 9 9999-8888 (ou (61) 9999-8888 com 10 dígitos). */
function formatPhone(input: string): string {
  const d = input.replace(/\D/g, '').slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 3)} ${d.slice(3, 7)}-${d.slice(7)}`;
}

type InfoRow = {
  key: string;
  label: string;
  value: string;
  icon: React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;
  onPress?: () => void;
  accessory?: React.ReactNode;
};

export default function ProfileScreen() {
  const navigation = useNavigation();
  const { user, updateUser, logout, biometric, enableBiometrics, disableBiometrics } = useAuth();
  const { colors, isDark, toggleTheme } = useTheme();
  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdCurrent, setPwdCurrent] = useState('');
  const [pwdNew, setPwdNew] = useState('');
  const [pwdConfirm, setPwdConfirm] = useState('');
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

  const closePasswordModal = () => {
    setPwdOpen(false);
    setPwdCurrent('');
    setPwdNew('');
    setPwdConfirm('');
  };

  const submitPasswordChange = async () => {
    if (!pwdCurrent || !pwdNew || !pwdConfirm) {
      Alert.alert('Senha', 'Preencha todos os campos.');
      return;
    }
    if (pwdNew.length < 8) {
      Alert.alert('Senha', 'A nova senha precisa ter pelo menos 8 caracteres.');
      return;
    }
    if (pwdNew !== pwdConfirm) {
      Alert.alert('Senha', 'A confirmação não confere com a nova senha.');
      return;
    }
    setPwdBusy(true);
    try {
      const res = await api.put('/api/auth/change-password', {
        currentPassword: pwdCurrent,
        newPassword: pwdNew,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.message || json?.error || 'Não foi possível alterar a senha.');
      }
      // A troca revoga as sessões antigas; guarda o token novo para manter este aparelho logado.
      const newToken = json?.data?.token;
      if (newToken) await AsyncStorage.setItem('token', newToken);
      if (biometric.enabled) {
        const identifier = String(user?.email || user?.cpf || '').trim();
        if (identifier) await saveBiometricCredentials(identifier, pwdNew);
      }
      closePasswordModal();
      Alert.alert('Pronto', 'Senha alterada com sucesso.');
    } catch (err) {
      Alert.alert('Senha', err instanceof Error ? err.message : 'Não foi possível alterar a senha.');
    } finally {
      setPwdBusy(false);
    }
  };

  const confirmLogout = () => {
    Alert.alert('Sair', 'Tem certeza que deseja sair?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => void logout() },
    ]);
  };

  const appVersion = Constants.expoConfig?.version || '';

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
  if (user?.employee) {
    const phoneDigits = String(user.employee.phone ?? '').replace(/\D/g, '');
    rows.push({
      key: 'phone',
      label: 'Telefone',
      value: phoneDigits ? formatPhone(phoneDigits) : 'Não informado',
      icon: Phone,
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

  return (
    <View style={styles.safeArea}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AppHeader showBack title="Perfil" />
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.profileCard}>
          <View style={styles.avatarWrap}>
            <UserAvatar
              uri={user?.profilePhotoUrl}
              size={104}
              backgroundColor={isDark ? colors.screenRoot : colors.surface}
              iconColor={colors.primary}
            />
            <TouchableOpacity
              style={styles.editPhotoBtn}
              onPress={openPhotoPicker}
              activeOpacity={0.85}
              disabled={uploadingPhoto}
              accessibilityLabel="Alterar foto de perfil"
              hitSlop={6}
            >
              {uploadingPhoto ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Pencil size={12} color="#fff" strokeWidth={2.4} />
              )}
            </TouchableOpacity>
          </View>
          <Text style={styles.name} numberOfLines={2}>
            {user?.name || 'Colaborador'}
          </Text>
          <Text style={styles.role} numberOfLines={1}>
            {roleLabel}
          </Text>
        </View>

        <View style={styles.body}>
          <Text style={styles.sectionTitle}>Informações</Text>
          <View style={styles.sectionCard}>
            {rows.length === 0 ? (
              <Text style={styles.emptyText}>Nenhuma informação disponível.</Text>
            ) : (
              rows.map((row, index) => {
                const Icon = row.icon;
                return (
                  <View key={row.key}>
                    {index > 0 ? <View style={styles.divider} /> : null}
                    <TouchableOpacity
                      style={styles.infoItem}
                      onPress={row.onPress}
                      disabled={!row.onPress}
                      activeOpacity={0.7}
                    >
                      <View style={styles.infoIcon}>
                        <Icon size={18} color={colors.primary} strokeWidth={2} />
                      </View>
                      <View style={styles.infoText}>
                        <Text style={styles.infoLabel}>{row.label}</Text>
                        <Text style={styles.infoValue}>{row.value}</Text>
                      </View>
                      {row.accessory ?? null}
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </View>

          <Text style={styles.sectionTitle}>Acesso</Text>
          <View style={styles.sectionCard}>
            {Platform.OS !== 'web' ? (
              <>
                <View style={styles.bioRow}>
                  <View style={styles.infoIcon}>
                    <ScanFace size={18} color={colors.primary} strokeWidth={2} />
                  </View>
                  <View style={styles.infoText}>
                    <Text style={styles.infoValue}>Entrar com {biometric.label}</Text>
                    <Text style={[styles.infoLabel, { marginTop: 2, marginBottom: 0 }]}>
                      {biometric.available
                        ? biometric.enabled
                          ? 'Ativado neste aparelho'
                          : 'Desativado'
                        : 'Indisponível neste aparelho'}
                    </Text>
                  </View>
                  <Switch
                    value={biometric.enabled}
                    onValueChange={onToggleBiometrics}
                    style={{ alignSelf: 'center' }}
                    disabled={bioBusy || !biometric.available}
                    trackColor={{ false: isDark ? '#374151' : '#d1d5db', true: '#fca5a5' }}
                    thumbColor={biometric.enabled ? colors.primary : '#f4f4f5'}
                  />
                </View>
                <View style={styles.divider} />
              </>
            ) : null}
            <TouchableOpacity
              style={styles.bioRow}
              onPress={() => setPwdOpen(true)}
              activeOpacity={0.7}
            >
              <View style={styles.infoIcon}>
                <KeyRound size={18} color={colors.primary} strokeWidth={2} />
              </View>
              <View style={styles.infoText}>
                <Text style={styles.infoValue}>Alterar senha</Text>
              </View>
              <ChevronRight size={18} color={colors.textSecondary} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          <Text style={styles.sectionTitle}>Preferências</Text>
          <View style={styles.sectionCard}>
            <View style={styles.bioRow}>
              <View style={styles.infoIcon}>
                {isDark ? (
                  <Moon size={18} color={colors.primary} strokeWidth={2} />
                ) : (
                  <Sun size={18} color={colors.primary} strokeWidth={2} />
                )}
              </View>
              <View style={styles.infoText}>
                <Text style={styles.infoValue}>Tema escuro</Text>
              </View>
              <Switch
                value={isDark}
                onValueChange={toggleTheme}
                style={{ alignSelf: 'center' }}
                trackColor={{ false: isDark ? '#374151' : '#d1d5db', true: '#fca5a5' }}
                thumbColor={isDark ? colors.primary : '#f4f4f5'}
              />
            </View>
          </View>

          <TouchableOpacity style={styles.logoutBtn} onPress={confirmLogout} activeOpacity={0.8}>
            <LogOut size={18} color={colors.primary} strokeWidth={2.2} />
            <Text style={styles.logoutText}>Sair da conta</Text>
          </TouchableOpacity>

          {appVersion ? <Text style={styles.versionText}>Versão {appVersion}</Text> : null}
        </View>
      </ScrollView>

      <Modal visible={pwdOpen} transparent animationType="fade" onRequestClose={closePasswordModal}>
        <Pressable style={styles.modalOverlay} onPress={closePasswordModal}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>Alterar senha</Text>
            <TextInput
              value={pwdCurrent}
              onChangeText={setPwdCurrent}
              placeholder="Senha atual"
              placeholderTextColor={colors.textSecondary}
              secureTextEntry
              style={styles.modalInput}
              autoFocus
            />
            <TextInput
              value={pwdNew}
              onChangeText={setPwdNew}
              placeholder="Nova senha (mín. 8 caracteres)"
              placeholderTextColor={colors.textSecondary}
              secureTextEntry
              style={styles.modalInput}
            />
            <TextInput
              value={pwdConfirm}
              onChangeText={setPwdConfirm}
              placeholder="Confirmar nova senha"
              placeholderTextColor={colors.textSecondary}
              secureTextEntry
              style={styles.modalInput}
            />
            <TouchableOpacity
              style={styles.modalPrimary}
              onPress={() => void submitPasswordChange()}
              disabled={pwdBusy}
            >
              {pwdBusy ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.modalPrimaryText}>Salvar</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={closePasswordModal}>
              <Text style={styles.modalCancel}>Cancelar</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

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
      paddingHorizontal: 20,
      paddingTop: 8,
      paddingBottom: 40,
      backgroundColor: colors.screenRoot,
      flexGrow: 1,
    },
    profileCard: {
      alignItems: 'center',
      paddingTop: 8,
      paddingBottom: 28,
    },
    avatarWrap: {
      width: 104,
      height: 104,
      marginBottom: 16,
    },
    editPhotoBtn: {
      position: 'absolute',
      right: 0,
      bottom: 0,
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.primary,
      borderWidth: 3,
      borderColor: colors.screenRoot,
      alignItems: 'center',
      justifyContent: 'center',
    },
    name: {
      color: colors.text,
      fontSize: 24,
      fontWeight: '700',
      letterSpacing: -0.5,
      textAlign: 'center',
      paddingHorizontal: 12,
    },
    role: {
      color: colors.textSecondary,
      fontSize: 14,
      fontWeight: '500',
      marginTop: 4,
      textAlign: 'center',
    },
    body: {},
    sectionTitle: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      marginBottom: 10,
      opacity: 0.55,
    },
    sectionCard: {
      backgroundColor: colors.card,
      borderRadius: 18,
      paddingHorizontal: 16,
      paddingVertical: 4,
      marginBottom: 20,
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
      paddingVertical: 12,
    },
    logoutBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      height: 48,
      borderRadius: 14,
      backgroundColor: colors.card,
      marginBottom: 16,
    },
    logoutText: { color: colors.primary, fontSize: 15, fontWeight: '700' },
    versionText: {
      textAlign: 'center',
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '500',
      opacity: 0.8,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.45)',
      // Na parte de cima da tela: com o teclado aberto o cartão (e o Cancelar) ficava por trás dele.
      justifyContent: 'flex-start',
      paddingHorizontal: 24,
      paddingTop: 110,
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
      paddingVertical: 12,
    },
  });
