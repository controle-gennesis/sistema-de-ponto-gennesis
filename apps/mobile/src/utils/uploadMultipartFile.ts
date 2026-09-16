import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { File, UploadType } from 'expo-file-system';
import { buildApiUrl } from '../config/api';
import api from '../services/api';

async function getAuthToken(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return localStorage.getItem('token');
    return AsyncStorage.getItem('token');
  } catch {
    return null;
  }
}

type UploadFileInput = {
  uri: string;
  name: string;
  type: string;
};

type UploadMultipartOptions = {
  /** Path relativo da API, ex.: `/api/auth/me/photo` */
  path: string;
  fieldName: string;
  file: UploadFileInput;
  method?: 'POST' | 'PUT' | 'PATCH';
  fields?: Record<string, string>;
};

/**
 * Upload multipart compatível com Expo 57+ (evita "Unsupported FormDataPart implementation").
 */
export async function uploadMultipartFile<T = unknown>(
  options: UploadMultipartOptions
): Promise<T> {
  const { path, fieldName, file, method = 'POST', fields } = options;

  if (Platform.OS === 'web') {
    const form = new FormData();
    if (fields) {
      for (const [key, value] of Object.entries(fields)) {
        if (value != null) form.append(key, value);
      }
    }
    const blob = await fetch(file.uri).then((r) => r.blob());
    form.append(fieldName, blob, file.name);
    const res =
      method === 'PATCH'
        ? await api.patch(path, form)
        : method === 'PUT'
          ? await api.put(path, form)
          : await api.post(path, form);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json?.message || json?.error || 'Erro no upload');
    }
    return (json?.data ?? json) as T;
  }

  const token = await getAuthToken();
  const result = await new File(file.uri).upload(buildApiUrl(path), {
    uploadType: UploadType.MULTIPART,
    fieldName,
    mimeType: file.type || 'image/jpeg',
    httpMethod: method,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    parameters: fields,
  });

  let json: { message?: string; error?: string; data?: T } = {};
  try {
    json = JSON.parse(result.body || '{}');
  } catch {
    json = {};
  }
  if (result.status < 200 || result.status >= 300) {
    throw new Error(json?.message || json?.error || 'Erro no upload');
  }
  return (json.data ?? json) as T;
}
