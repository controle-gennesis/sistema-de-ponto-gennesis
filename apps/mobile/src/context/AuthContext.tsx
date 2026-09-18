import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '../types';
import { buildApiUrl } from '../config/api';
import { serializeLoginIdentifier } from '../lib/cpf';
import {
  authenticateWithBiometrics,
  disableBiometricLogin,
  enableBiometricLogin,
  getBiometricCapability,
  getStoredCredentials,
  isBiometricEnabled,
  saveBiometricCredentials,
  type BiometricCapability,
} from '../services/biometricAuth';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  loginWithBiometrics: () => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (user: User) => Promise<void>;
  loading: boolean;
  biometric: BiometricCapability & { enabled: boolean };
  refreshBiometric: () => Promise<void>;
  enableBiometrics: (identifier: string, password: string) => Promise<void>;
  disableBiometrics: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

const storage = {
  getItem: async (key: string) => {
    if (Platform.OS === 'web') {
      return Promise.resolve(localStorage.getItem(key));
    }
    return AsyncStorage.getItem(key);
  },
  setItem: async (key: string, value: string) => {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
      return Promise.resolve();
    }
    return AsyncStorage.setItem(key, value);
  },
  removeItem: async (key: string) => {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
      return Promise.resolve();
    }
    return AsyncStorage.removeItem(key);
  },
};

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [biometric, setBiometric] = useState<BiometricCapability & { enabled: boolean }>({
    available: false,
    enrolled: false,
    label: 'biometria',
    enabled: false,
  });

  const refreshBiometric = useCallback(async () => {
    const cap = await getBiometricCapability();
    const enabled = await isBiometricEnabled();
    setBiometric({ ...cap, enabled });
  }, []);

  useEffect(() => {
    void loadStoredAuth();
  }, []);

  const hydrateUserFromStorage = async () => {
    const token = await storage.getItem('token');
    const userData = await storage.getItem('user');
    if (!token || !userData) return false;
    setUser(JSON.parse(userData));
    return true;
  };

  const refreshProfileInBackground = async () => {
    try {
      const token = await storage.getItem('token');
      if (!token) return;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(buildApiUrl('/api/auth/me'), {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (res.ok) {
        const json = await res.json();
        const fresh = (json?.data ?? json) as User;
        if (fresh?.id) {
          setUser(fresh);
          await storage.setItem('user', JSON.stringify(fresh));
        }
      }
    } catch {
      /* mantém usuário do storage */
    }
  };

  const loadStoredAuth = async () => {
    try {
      const cap = await getBiometricCapability();
      const enabled = await isBiometricEnabled();
      setBiometric({ ...cap, enabled });

      const token = await storage.getItem('token');
      const userData = await storage.getItem('user');
      if (token && userData && !enabled) {
        setUser(JSON.parse(userData));
      }
    } catch (error) {
      console.error('Erro ao carregar dados de autenticação:', error);
    } finally {
      setLoading(false);
    }

    const enabled = await isBiometricEnabled();
    if (!enabled) void refreshProfileInBackground();
  };

  const persistSession = async (userData: User, token: string) => {
    await storage.setItem('token', token);
    await storage.setItem('user', JSON.stringify(userData));
    setUser(userData);
  };

  const login = async (identifier: string, password: string) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(buildApiUrl('/api/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: serializeLoginIdentifier(identifier),
          password,
          source: 'mobile',
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || 'Erro ao fazer login');
      }

      const data = await response.json();
      if (!data.success) throw new Error('Erro ao fazer login');
      const { user: userData, token } = data.data;
      await persistSession(userData, token);

      // Só atualiza as credenciais guardadas — não pede Face ID de novo.
      if (await isBiometricEnabled()) {
        try {
          await saveBiometricCredentials(identifier, password);
        } catch {
          /* sessão já aberta */
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error('Timeout: Servidor não respondeu em 10 segundos');
      }
      throw error;
    }
  };

  const loginWithBiometrics = async () => {
    const cap = await getBiometricCapability();
    if (!cap.available) {
      throw new Error(`Cadastre ${cap.label} neste aparelho para entrar.`);
    }
    await authenticateWithBiometrics(`Entre com ${cap.label}`);

    if (await hydrateUserFromStorage()) {
      void refreshProfileInBackground();
      return;
    }

    const creds = await getStoredCredentials();
    if (!creds) {
      throw new Error('Entre com e-mail/CPF e senha no primeiro acesso.');
    }
    await login(creds.identifier, creds.password);
  };

  const enableBiometrics = async (identifier: string, password: string) => {
    await enableBiometricLogin(identifier, password);
    await refreshBiometric();
  };

  const disableBiometrics = async () => {
    await disableBiometricLogin();
    await refreshBiometric();
  };

  const logout = async () => {
    try {
      const token = await storage.getItem('token');
      if (token) {
        await fetch(buildApiUrl('/api/auth/logout'), {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
      }
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
    } finally {
      await storage.removeItem('token');
      await storage.removeItem('user');
      setUser(null);
    }
  };

  const updateUser = async (next: User) => {
    setUser(next);
    await storage.setItem('user', JSON.stringify(next));
  };

  const value: AuthContextType = {
    user,
    isAuthenticated: !!user,
    login,
    loginWithBiometrics,
    logout,
    updateUser,
    loading,
    biometric,
    refreshBiometric,
    enableBiometrics,
    disableBiometrics,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
};
