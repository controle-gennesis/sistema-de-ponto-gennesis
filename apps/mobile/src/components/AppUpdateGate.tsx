import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Linking, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ArrowUpCircle } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { checkAppUpdate, type AppUpdateInfo } from '../services/appVersion';

const DISMISSED_KEY = '@app_update_dismissed_version';
const RECHECK_MS = 10 * 60 * 1000;

/**
 * Avisa quando há versão nova do app:
 * - abaixo da versão MÍNIMA: tela de atualização obrigatória (não dá pra fechar);
 * - abaixo da mais recente: aviso que pode ser dispensado (volta só quando sair outra versão).
 * Confere ao abrir e quando o app volta do segundo plano (no máximo a cada 10 minutos).
 */
export default function AppUpdateGate() {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const [info, setInfo] = useState<AppUpdateInfo | null>(null);
  const [visible, setVisible] = useState(false);
  const lastCheckRef = useRef(0);

  const check = useCallback(async () => {
    lastCheckRef.current = Date.now();
    const result = await checkAppUpdate();
    if (!result || result.mode === 'none') {
      setVisible(false);
      return;
    }
    if (result.mode === 'optional') {
      const dismissed = await AsyncStorage.getItem(DISMISSED_KEY).catch(() => null);
      if (dismissed && dismissed === result.latestVersion) return;
    }
    setInfo(result);
    setVisible(true);
  }, []);

  useEffect(() => {
    // Um respiro depois de abrir, pra não competir com o splash/login.
    const boot = setTimeout(() => void check(), 2500);
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && Date.now() - lastCheckRef.current > RECHECK_MS) void check();
    });
    return () => {
      clearTimeout(boot);
      sub.remove();
    };
  }, [check]);

  if (!info) return null;
  const required = info.mode === 'required';

  const openStore = () => {
    if (info.storeUrl) void Linking.openURL(info.storeUrl);
  };

  const later = () => {
    if (info.latestVersion) {
      void AsyncStorage.setItem(DISMISSED_KEY, info.latestVersion).catch(() => {});
    }
    setVisible(false);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      // Obrigatória: o botão voltar do Android também não fecha.
      onRequestClose={required ? () => undefined : later}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconBox}>
            <ArrowUpCircle size={26} color={colors.primary} strokeWidth={2.1} />
          </View>
          <Text style={styles.title}>
            {required ? 'Atualização necessária' : 'Nova versão disponível'}
          </Text>
          <Text style={styles.body}>
            {info.message ||
              (required
                ? 'Esta versão do app não é mais compatível. Atualize para continuar usando.'
                : 'Há uma versão mais nova do app, com melhorias e correções.')}
          </Text>
          <Text style={styles.versions}>
            Sua versão: {info.currentVersion}
            {info.latestVersion ? ` · Mais recente: ${info.latestVersion}` : ''}
          </Text>

          {info.storeUrl ? (
            <TouchableOpacity style={styles.primary} onPress={openStore} activeOpacity={0.9}>
              <Text style={styles.primaryText}>{required ? 'Atualizar agora' : 'Atualizar'}</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.noLink}>
              Procure a versão mais recente na loja de aplicativos ou fale com o suporte.
            </Text>
          )}

          {!required ? (
            <TouchableOpacity onPress={later} style={styles.laterBtn}>
              <Text style={styles.laterText}>Depois</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

const getStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    card: {
      width: '100%',
      maxWidth: 380,
      borderRadius: 20,
      padding: 22,
      alignItems: 'center',
      backgroundColor: isDark ? '#1f2937' : '#ffffff',
    },
    iconBox: {
      width: 56,
      height: 56,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `${colors.primary}1A`,
      marginBottom: 14,
    },
    title: {
      fontSize: 19,
      fontWeight: '800',
      letterSpacing: -0.3,
      color: colors.text,
      textAlign: 'center',
    },
    body: {
      marginTop: 8,
      fontSize: 14,
      lineHeight: 20,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    versions: {
      marginTop: 10,
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
      textAlign: 'center',
    },
    primary: {
      alignSelf: 'stretch',
      marginTop: 18,
      height: 50,
      borderRadius: 999,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    noLink: {
      marginTop: 16,
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
      textAlign: 'center',
    },
    laterBtn: { marginTop: 12, paddingVertical: 8, paddingHorizontal: 16 },
    laterText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  });
