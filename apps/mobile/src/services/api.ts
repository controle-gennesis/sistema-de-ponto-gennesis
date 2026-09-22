import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { buildApiUrl } from '../config/api';

// Storage compatível com Web e Nativo
const storage = {
  getItem: async (key: string): Promise<string | null> => {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key);
    }
    return await AsyncStorage.getItem(key);
  },
  setItem: async (key: string, value: string): Promise<void> => {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
      return;
    }
    await AsyncStorage.setItem(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
      return;
    }
    await AsyncStorage.removeItem(key);
  }
};

// Flag para evitar loops infinitos de refresh
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value: any) => void;
  reject: (reason?: any) => void;
}> = [];

// Avisa o AuthContext quando a sessão é encerrada aqui dentro (token expirado/refresh
// falhou), pra ele limpar o `user` em memória — sem isso a UI continuava mostrando o
// app como autenticado mesmo com o storage já vazio.
type UnauthorizedHandler = () => void;
let unauthorizedHandler: UnauthorizedHandler | null = null;
export const setUnauthorizedHandler = (handler: UnauthorizedHandler | null) => {
  unauthorizedHandler = handler;
};

const clearSessionAndNotify = async () => {
  await storage.removeItem('token');
  await storage.removeItem('user');
  unauthorizedHandler?.();
};

/**
 * Tenta renovar o token de acesso usando o refresh-token armazenado.
 * Retorna o novo token em caso de sucesso, ou `null` (e já limpa a sessão) em caso de falha.
 */
export const refreshAuthToken = async (): Promise<string | null> => {
  const token = await storage.getItem('token');
  if (!token) {
    await clearSessionAndNotify();
    return null;
  }
  try {
    const refreshResponse = await fetch(buildApiUrl('/api/auth/refresh-token'), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
    if (!refreshResponse.ok) {
      throw new Error('Erro ao fazer refresh do token');
    }
    const refreshData = await refreshResponse.json();
    const newToken = refreshData?.data?.token;
    if (!newToken) {
      throw new Error('Token não recebido na resposta de refresh');
    }
    await storage.setItem('token', newToken);
    return newToken;
  } catch {
    await clearSessionAndNotify();
    return null;
  }
};

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  
  failedQueue = [];
};

interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
  _retry?: boolean;
}

/**
 * Faz uma requisição HTTP com refresh automático de token
 */
export const apiRequest = async (
  url: string,
  options: RequestOptions = {}
): Promise<Response> => {
  const { skipAuth = false, _retry = false, ...fetchOptions } = options;

  // Adicionar token se não for skipAuth
  if (!skipAuth) {
    const token = await storage.getItem('token');
    if (token) {
      fetchOptions.headers = {
        ...fetchOptions.headers,
        Authorization: `Bearer ${token}`,
      };
    }
  }

  try {
    const response = await fetch(url, fetchOptions);

    // Se for erro 401 e não for a rota de refresh e ainda não tentou refresh
    if (response.status === 401 && !skipAuth && !_retry) {
      // Se já está tentando refresh, adiciona à fila
      if (isRefreshing) {
        return new Promise<Response>((resolve, reject) => {
          failedQueue.push({
            resolve: async (newToken: string) => {
              try {
                const retryOptions: RequestInit = {
                  ...fetchOptions,
                  headers: {
                    ...fetchOptions.headers,
                    Authorization: `Bearer ${newToken}`,
                  },
                  _retry: true,
                };
                const retryResponse = await fetch(url, retryOptions);
                resolve(retryResponse);
              } catch (err) {
                reject(err);
              }
            },
            reject,
          });
        });
      }

      isRefreshing = true;
      const newToken = await refreshAuthToken();
      isRefreshing = false;

      if (newToken) {
        // Processar fila de requisições pendentes
        processQueue(null, newToken);

        // Retentar a requisição original com novo token
        const retryOptions = {
          ...fetchOptions,
          headers: {
            ...fetchOptions.headers,
            Authorization: `Bearer ${newToken}`,
          },
          _retry: true,
        };
        return fetch(url, retryOptions);
      }

      // Refresh falhou (ou não havia token) — refreshAuthToken já limpou a sessão
      // e avisou o AuthContext. Processa a fila com erro e retorna o 401 original.
      processQueue(new Error('Sessão expirada'), null);
      return response;
    }

    return response;
  } catch (error) {
    return Promise.reject(error);
  }
};

/**
 * Métodos HTTP simplificados
 */
export const api = {
  get: async (url: string, options?: RequestOptions): Promise<Response> => {
    return apiRequest(buildApiUrl(url), {
      ...options,
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
  },

  post: async (url: string, data?: any, options?: RequestOptions): Promise<Response> => {
    const isFormData = data instanceof FormData;
    
    return apiRequest(buildApiUrl(url), {
      ...options,
      method: 'POST',
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...options?.headers,
      },
      body: isFormData ? data : (data ? JSON.stringify(data) : undefined),
    });
  },

  patch: async (url: string, data?: any, options?: RequestOptions): Promise<Response> => {
    const isFormData = data instanceof FormData;

    return apiRequest(buildApiUrl(url), {
      ...options,
      method: 'PATCH',
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...options?.headers,
      },
      body: isFormData ? data : data ? JSON.stringify(data) : undefined,
    });
  },

  put: async (url: string, data?: any, options?: RequestOptions): Promise<Response> => {
    return apiRequest(buildApiUrl(url), {
      ...options,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
      body: data ? JSON.stringify(data) : undefined,
    });
  },

  delete: async (url: string, options?: RequestOptions): Promise<Response> => {
    return apiRequest(buildApiUrl(url), {
      ...options,
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
  },
};

export default api;

