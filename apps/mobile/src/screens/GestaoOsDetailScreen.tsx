import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Check } from 'lucide-react-native';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import AppHeader from '../components/AppHeader';
import { resolveMediaUrl } from '../utils/resolveMediaUrl';
import {
  GESTAO_OS_SAFETY_CHECKLIST_ITEMS,
  fetchWorkOrder,
  fetchGestaoOsMe,
  transitionWorkOrder,
  patchWorkOrder,
  uploadGestaoOsAttachment,
  readCloseQrToken,
  saveCloseQrToken,
  clearCloseQrToken,
  syncGestaoOsOfflineQueue,
  loadGestaoOsLocalDraft,
  saveGestaoOsLocalDraft,
  clearGestaoOsLocalDraft,
} from '../services/gestaoOs';
import type { RootStackParamList } from '../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'GestaoOsDetail'>;

function mediaUri(url: string | null | undefined): string | undefined {
  return resolveMediaUrl(url);
}

type ChecklistItem = {
  id: string;
  label: string;
  checked: boolean;
  startedAt?: string | null;
  completedAt?: string | null;
  beforePhotoUrl?: string | null;
  afterPhotoUrl?: string | null;
};

type SafetyItem = {
  id: string;
  label: string;
  checked: boolean;
  required?: boolean;
};

const NEXT: Record<string, string[]> = {
  APPROVED: ['IN_PROGRESS'],
  SAFETY_CHECK: ['IN_PROGRESS'],
  IN_PROGRESS: ['WAITING_PARTS', 'COMPLETED'],
  WAITING_PARTS: ['IN_PROGRESS', 'COMPLETED'],
  REWORK: ['IN_PROGRESS'],
};

const ACTION_LABEL: Record<string, string> = {
  IN_PROGRESS: 'Iniciar / Retomar',
  WAITING_PARTS: 'Aguardando peça',
  COMPLETED: 'Concluir serviço',
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: 'Aberta',
  UNDER_REVIEW: 'Em análise',
  APPROVED: 'Aprovada',
  SAFETY_CHECK: 'Segurança',
  IN_PROGRESS: 'Em execução',
  WAITING_PARTS: 'Aguardando peça',
  COMPLETED: 'Concluída',
  REWORK: 'Ajuste',
  CLOSED: 'Encerrada',
  CANCELLED: 'Cancelada',
};

const PRIORITY_LABEL: Record<string, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

function statusTone(status: string, primary: string): string {
  switch (status) {
    case 'IN_PROGRESS':
    case 'APPROVED':
    case 'SAFETY_CHECK':
      return '#2563eb';
    case 'WAITING_PARTS':
    case 'UNDER_REVIEW':
    case 'REWORK':
      return '#d97706';
    case 'COMPLETED':
    case 'CLOSED':
      return '#16a34a';
    case 'CANCELLED':
      return '#94a3b8';
    case 'OPEN':
    default:
      return primary;
  }
}

function mergeSafetyChecklist(items?: SafetyItem[] | null): SafetyItem[] {
  const byId = new Map((items || []).map((item) => [item.id, item]));
  return GESTAO_OS_SAFETY_CHECKLIST_ITEMS.map((item) => ({
    ...item,
    checked: Boolean(byId.get(item.id)?.checked),
  }));
}

function extractCloseQrToken(raw: string): string {
  const value = (raw || '').trim();
  return value.replace(/^gennesis-os-close:/i, '');
}

export default function GestaoOsDetailScreen({ route, navigation }: Props) {
  const { id } = route.params;
  const { colors, isDark } = useTheme();
  const { user } = useAuth();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [safetyChecklist, setSafetyChecklist] = useState<SafetyItem[]>([]);
  const [safetyPhotoUrl, setSafetyPhotoUrl] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [startPhotoUrl, setStartPhotoUrl] = useState<string | null>(null);
  const [endPhotoUrl, setEndPhotoUrl] = useState<string | null>(null);
  const [uploadingStart, setUploadingStart] = useState(false);
  const [uploadingEnd, setUploadingEnd] = useState(false);
  const [parts, setParts] = useState<Array<{ id: string; name: string; quantity: number }>>([]);
  const [newPartName, setNewPartName] = useState('');
  const [partsModalOpen, setPartsModalOpen] = useState(false);
  const [closeScannerOpen, setCloseScannerOpen] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const scanLockRef = useRef(false);

  const meQuery = useQuery({
    queryKey: ['gestao-os-me-mobile'],
    queryFn: fetchGestaoOsMe,
  });

  const query = useQuery({
    queryKey: ['gestao-os-detail', id],
    queryFn: () => fetchWorkOrder(id)
  });

  useEffect(() => {
    void syncGestaoOsOfflineQueue().then(() => {
      void queryClient.invalidateQueries({ queryKey: ['gestao-os-detail', id] });
    });
  }, [id, queryClient]);

  useEffect(() => {
    const data = query.data;
    if (!data) return;
    let cancelled = false;
    void loadGestaoOsLocalDraft(id).then((draft) => {
      if (cancelled) return;
      const nextChecklist: ChecklistItem[] = Array.isArray(draft?.checklist)
        ? (draft.checklist as ChecklistItem[])
        : Array.isArray(data.checklistResponses)
          ? data.checklistResponses
          : [];
      setChecklist(nextChecklist);
      if (
        data.status === 'APPROVED' ||
        data.status === 'SAFETY_CHECK' ||
        (Array.isArray(data.safetyChecklistResponses) && data.safetyChecklistResponses.length > 0) ||
        (draft?.safetyChecklist && draft.safetyChecklist.length > 0)
      ) {
        setSafetyChecklist(
          mergeSafetyChecklist(draft?.safetyChecklist ?? data.safetyChecklistResponses)
        );
      }
      setSafetyPhotoUrl(draft?.safetyPhotoUrl ?? data.safetyPhotoUrl ?? null);
      setStartPhotoUrl(draft?.startPhotoUrl ?? data.startPhotoUrl ?? null);
      setEndPhotoUrl(draft?.endPhotoUrl ?? data.endPhotoUrl ?? null);
      setParts(
        Array.isArray(draft?.parts)
          ? draft.parts.map((p) => ({ id: p.id, name: p.name, quantity: p.quantity || 1 }))
          : Array.isArray(data.parts)
            ? data.parts.map((p) => ({ id: p.id, name: p.name, quantity: p.quantity || 1 }))
            : []
      );
      if (draft?.note) setNote(draft.note);
    });
    return () => {
      cancelled = true;
    };
  }, [query.data, id]);

  const mutation = useMutation({
    mutationFn: async (status: string) => {
      const closeQrToken =
        status === 'COMPLETED' ? (await readCloseQrToken()) || undefined : undefined;
      const result = await transitionWorkOrder(id, {
        status,
        note: note.trim() || undefined,
        completionNote: status === 'COMPLETED' ? note.trim() || 'Concluído em campo' : undefined,
        checklistResponses: checklist.length ? checklist : undefined,
        safetyChecklistResponses: safetyChecklist.length ? safetyChecklist : undefined,
        safetyPhotoUrl: safetyPhotoUrl || undefined,
        startPhotoUrl: startPhotoUrl || undefined,
        endPhotoUrl: endPhotoUrl || undefined,
        closeQrToken,
        parts:
          status === 'WAITING_PARTS'
            ? parts.map((p) => ({
                id: p.id,
                name: p.name,
                supplier: null,
                quantity: p.quantity || 1,
                unitCost: null,
                expectedAt: null,
                notes: null
              }))
            : undefined,
      });
      if (status === 'COMPLETED') await clearCloseQrToken();
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gestao-os-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['gestao-os-mine'] });
      queryClient.invalidateQueries({ queryKey: ['gestao-os-assigned'] });
      setPartsModalOpen(false);
      Alert.alert('Status atualizado');
      setNote('');
    },
    onError: (err: Error) => Alert.alert('Erro', err.message)
  });

  const persistProgress = async (next?: {
    checklist?: ChecklistItem[];
    safetyChecklist?: SafetyItem[];
    safetyPhotoUrl?: string | null;
    startPhotoUrl?: string | null;
    endPhotoUrl?: string | null;
    parts?: Array<{ id: string; name: string; quantity: number }>;
    note?: string;
  }) => {
    const payload = {
      checklist: next?.checklist ?? checklist,
      safetyChecklist: next?.safetyChecklist ?? safetyChecklist,
      safetyPhotoUrl: next?.safetyPhotoUrl !== undefined ? next.safetyPhotoUrl : safetyPhotoUrl,
      startPhotoUrl: next?.startPhotoUrl !== undefined ? next.startPhotoUrl : startPhotoUrl,
      endPhotoUrl: next?.endPhotoUrl !== undefined ? next.endPhotoUrl : endPhotoUrl,
      parts: next?.parts ?? parts,
      note: next?.note ?? note
    };
    await saveGestaoOsLocalDraft(id, payload);
    try {
      await patchWorkOrder(id, {
        checklistResponses: payload.checklist.length ? payload.checklist : undefined,
        safetyChecklistResponses: payload.safetyChecklist.length
          ? payload.safetyChecklist
          : undefined,
        safetyPhotoUrl: payload.safetyPhotoUrl || undefined,
        startPhotoUrl: payload.startPhotoUrl || undefined,
        endPhotoUrl: payload.endPhotoUrl || undefined,
        parts: payload.parts.length
          ? payload.parts.map((p) => ({
              id: p.id,
              name: p.name,
              supplier: null,
              quantity: p.quantity || 1,
              unitCost: null,
              expectedAt: null,
              notes: null
            }))
          : undefined
      });
      await clearGestaoOsLocalDraft(id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (!/sem rede/i.test(msg)) {
        Alert.alert('Aviso', msg || 'Não foi possível gravar o progresso agora.');
      }
    }
  };

  const takeSafetyPhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão', 'Precisamos da câmera para a foto com os EPIs.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    const asset = result.assets[0];
    setSafetyPhotoUrl(asset.uri);
    setUploadingPhoto(true);
    try {
      const uploaded = await uploadGestaoOsAttachment({
        uri: asset.uri,
        name: asset.fileName || `foto-epis-${Date.now()}.jpg`,
        type: asset.mimeType || 'image/jpeg'
      });
      if (!uploaded?.url) throw new Error('URL da foto não retornada');
      setSafetyPhotoUrl(uploaded.url);
      await persistProgress({ safetyPhotoUrl: uploaded.url });
    } catch (err) {
      setSafetyPhotoUrl(null);
      Alert.alert('Erro', err instanceof Error ? err.message : 'Falha ao enviar a foto');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const capturePhoto = async (
    setUrl: (url: string) => void,
    setBusy: (busy: boolean) => void,
    field: 'startPhotoUrl' | 'endPhotoUrl'
  ) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão', 'Precisamos da câmera para registrar a foto.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    const asset = result.assets[0];
    setUrl(asset.uri);
    setBusy(true);
    try {
      const uploaded = await uploadGestaoOsAttachment({
        uri: asset.uri,
        name: asset.fileName || `foto-${Date.now()}.jpg`,
        type: asset.mimeType || 'image/jpeg'
      });
      if (!uploaded?.url) throw new Error('URL da foto não retornada');
      setUrl(uploaded.url);
      await persistProgress({ [field]: uploaded.url });
    } catch (err) {
      setUrl('');
      Alert.alert('Erro', err instanceof Error ? err.message : 'Falha ao enviar a foto');
    } finally {
      setBusy(false);
    }
  };

  const captureChecklistPhoto = async (index: number, field: 'beforePhotoUrl' | 'afterPhotoUrl') => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão', 'Precisamos da câmera para registrar a foto.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.7
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    const asset = result.assets[0];
    setUploadingPhoto(true);
    try {
      const uploaded = await uploadGestaoOsAttachment({
        uri: asset.uri,
        name: asset.fileName || `foto-${Date.now()}.jpg`,
        type: asset.mimeType || 'image/jpeg'
      });
      if (!uploaded?.url) throw new Error('URL da foto não retornada');
      const next = checklist.map((row, i) => (i === index ? { ...row, [field]: uploaded.url } : row));
      setChecklist(next);
      await persistProgress({ checklist: next });
    } catch (err) {
      Alert.alert('Erro', err instanceof Error ? err.message : 'Falha ao enviar a foto');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const addPart = () => {
    const name = newPartName.trim();
    if (!name) return;
    setParts((prev) => [
      ...prev,
      { id: `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name, quantity: 1 },
    ]);
    setNewPartName('');
  };

  const confirmWaitingParts = () => {
    if (parts.length === 0) {
      Alert.alert('Peças', 'Adicione ao menos uma peça ou material.');
      return;
    }
    mutation.mutate('WAITING_PARTS');
  };

  const wo = query.data;
  const userId = user?.id;
  const canExecuteField = useMemo(() => {
    if (!wo || !userId) return false;
    if (meQuery.data?.isAdmin || meQuery.data?.canAnalisar) return true;
    if (wo.assigneeId === userId) return true;
    const team = Array.isArray(wo.teamUserIds) ? wo.teamUserIds.map(String) : [];
    return team.includes(userId);
  }, [wo, userId, meQuery.data?.isAdmin, meQuery.data?.canAnalisar]);

  const actions = useMemo(
    () => (wo && canExecuteField ? NEXT[wo.status] || [] : []),
    [wo, canExecuteField]
  );
  const safetyReady =
    safetyChecklist.length > 0 &&
    safetyChecklist.every((item) => item.required === false || item.checked) &&
    Boolean(safetyPhotoUrl);
  const executionReady =
    checklist.length === 0 ||
    checklist.every(
      (item) =>
        !!item.checked &&
        !!item.startedAt &&
        !!item.completedAt &&
        !!item.beforePhotoUrl &&
        !!item.afterPhotoUrl
    );

  const tone = statusTone(wo?.status || '', colors.primary);
  const statusLabel = wo ? STATUS_LABEL[wo.status] || wo.status : '';
  const priorityLabel = wo ? PRIORITY_LABEL[wo.priority] || wo.priority : '';

  return (
    <View style={styles.safeArea}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AppHeader
        title="Detalhes do Chamado"
        showBack
        onBack={() => navigation.goBack()}
      />
      {query.isLoading || !wo ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <ScrollView
          style={styles.container}
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <Text style={styles.title}>
              {wo.osNumber != null ? `OS #${wo.osNumber}` : `Chamado #${wo.displayNumber}`}
            </Text>
            <View style={[styles.badge, { backgroundColor: `${tone}18` }]}>
              <Text style={[styles.badgeText, { color: tone }]}>{statusLabel}</Text>
            </View>

            <View style={styles.chipsRow}>
              {priorityLabel ? (
                <View style={styles.chip}>
                  <Text style={styles.chipLabel}>Prioridade</Text>
                  <Text style={styles.chipValue}>{priorityLabel}</Text>
                </View>
              ) : null}
              {wo.category ? (
                <View style={styles.chip}>
                  <Text style={styles.chipLabel}>Categoria</Text>
                  <Text style={styles.chipValue}>{wo.category}</Text>
                </View>
              ) : null}
            </View>

            {wo.description ? <Text style={styles.desc}>{wo.description}</Text> : null}

            {wo.locationLabel ? (
              <Text style={styles.location}>{wo.locationLabel}</Text>
            ) : null}
          </View>

          {Array.isArray(wo.events) && wo.events.length > 0 ? (
            <View style={styles.box}>
              <Text style={styles.boxTitle}>Histórico do atendimento</Text>
              {wo.events.map((event) => (
                <View key={event.id} style={styles.eventRow}>
                  <Text style={styles.eventWhen}>
                    {new Date(event.createdAt).toLocaleString('pt-BR', {
                      day: '2-digit',
                      month: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                  <Text style={styles.eventWhat}>
                    {STATUS_LABEL[event.toStatus || ''] || event.toStatus || 'Atualização'}
                    {event.actor?.name ? ` · ${event.actor.name}` : ''}
                  </Text>
                  {event.note ? <Text style={styles.eventNote}>{event.note}</Text> : null}
                </View>
              ))}
            </View>
          ) : null}

          {canExecuteField && (wo.status === 'APPROVED' || wo.status === 'SAFETY_CHECK') ? (
            <View style={styles.box}>
              <Text style={styles.boxTitle}>Segurança do trabalho</Text>
              <Text style={styles.boxHint}>
                Marque os EPIs e envie uma foto usando os equipamentos antes de iniciar a execução.
              </Text>
              {safetyChecklist.map((item, idx) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.checkRow}
                  onPress={() => {
                    setSafetyChecklist((prev) => {
                      const next = prev.map((row, i) =>
                        i === idx ? { ...row, checked: !row.checked } : row
                      );
                      void persistProgress({ safetyChecklist: next });
                      return next;
                    });
                  }}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.checkbox,
                      item.checked && { backgroundColor: colors.primary, borderColor: colors.primary },
                    ]}
                  >
                    {item.checked ? <Check size={13} color="#fff" strokeWidth={3} /> : null}
                  </View>
                  <Text style={styles.checkLabel}>{item.label}</Text>
                </TouchableOpacity>
              ))}
              {safetyPhotoUrl && mediaUri(safetyPhotoUrl) ? (
                <Image source={{ uri: mediaUri(safetyPhotoUrl) }} style={styles.photo} />
              ) : null}
              <TouchableOpacity
                style={styles.secondaryBtn}
                disabled={uploadingPhoto}
                onPress={() => void takeSafetyPhoto()}
                activeOpacity={0.85}
              >
                <Text style={styles.secondaryBtnText}>
                  {uploadingPhoto
                    ? 'Enviando foto...'
                    : safetyPhotoUrl
                      ? 'Tirar outra foto'
                      : 'Tirar foto com EPIs'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {canExecuteField && checklist.length > 0 ? (
            <View style={styles.box}>
              <Text style={styles.boxTitle}>Checklist</Text>
              <Text style={styles.boxHint}>
                Marque o item, registre o horário e tire foto de antes e depois. Sem rede, o
                progresso fica no aparelho e sincroniza depois.
              </Text>
              {checklist.map((item, idx) => (
                <View key={item.id} style={styles.checklistItem}>
                  <TouchableOpacity
                    style={styles.checkRow}
                    onPress={() => {
                      const now = new Date().toISOString();
                      setChecklist((prev) => {
                        const next = prev.map((row, i) => {
                          if (i !== idx) return row;
                          const checked = !row.checked;
                          if (!checked) return { ...row, checked: false, completedAt: null };
                          return {
                            ...row,
                            checked: true,
                            startedAt: row.startedAt || now,
                            completedAt: now,
                          };
                        });
                        void persistProgress({ checklist: next });
                        return next;
                      });
                    }}
                    activeOpacity={0.7}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        item.checked && {
                          backgroundColor: colors.primary,
                          borderColor: colors.primary,
                        },
                      ]}
                    >
                      {item.checked ? <Check size={13} color="#fff" strokeWidth={3} /> : null}
                    </View>
                    <Text style={styles.checkLabel}>{item.label}</Text>
                  </TouchableOpacity>
                  {item.beforePhotoUrl && mediaUri(item.beforePhotoUrl) ? (
                    <Image source={{ uri: mediaUri(item.beforePhotoUrl) }} style={styles.photo} />
                  ) : null}
                  {item.afterPhotoUrl && mediaUri(item.afterPhotoUrl) ? (
                    <Image source={{ uri: mediaUri(item.afterPhotoUrl) }} style={styles.photo} />
                  ) : null}
                  <View style={styles.photoActions}>
                    <TouchableOpacity
                      style={[styles.secondaryBtn, styles.photoActionBtn]}
                      onPress={() => void captureChecklistPhoto(idx, 'beforePhotoUrl')}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.secondaryBtnText}>Foto antes</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.secondaryBtn, styles.photoActionBtn]}
                      onPress={() => void captureChecklistPhoto(idx, 'afterPhotoUrl')}
                      activeOpacity={0.85}
                    >
                      <Text style={styles.secondaryBtnText}>Foto depois</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {actions.includes('IN_PROGRESS') ? (
            <View style={styles.box}>
              <Text style={styles.boxTitle}>Foto de início</Text>
              <Text style={styles.boxHint}>Registre uma foto antes de iniciar a execução.</Text>
              {startPhotoUrl && mediaUri(startPhotoUrl) ? (
                <Image source={{ uri: mediaUri(startPhotoUrl) }} style={styles.photo} />
              ) : null}
              <TouchableOpacity
                style={styles.secondaryBtn}
                disabled={uploadingStart}
                onPress={() => void capturePhoto(setStartPhotoUrl, setUploadingStart, 'startPhotoUrl')}
                activeOpacity={0.85}
              >
                <Text style={styles.secondaryBtnText}>
                  {uploadingStart
                    ? 'Enviando foto...'
                    : startPhotoUrl
                      ? 'Tirar outra foto'
                      : 'Tirar foto de início'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {actions.includes('COMPLETED') ? (
            <View style={styles.box}>
              <Text style={styles.boxTitle}>Foto de conclusão</Text>
              <Text style={styles.boxHint}>
                {wo.buildingCloseQrRequired
                  ? 'Além da foto, leia o QR em posse do responsável pela localidade para concluir.'
                  : executionReady
                    ? 'Registre uma foto antes de concluir o serviço.'
                    : 'Marque todos os itens do checklist de execução antes de concluir.'}
              </Text>
              {endPhotoUrl && mediaUri(endPhotoUrl) ? (
                <Image source={{ uri: mediaUri(endPhotoUrl) }} style={styles.photo} />
              ) : null}
              <TouchableOpacity
                style={styles.secondaryBtn}
                disabled={uploadingEnd}
                onPress={() => void capturePhoto(setEndPhotoUrl, setUploadingEnd, 'endPhotoUrl')}
                activeOpacity={0.85}
              >
                <Text style={styles.secondaryBtnText}>
                  {uploadingEnd
                    ? 'Enviando foto...'
                    : endPhotoUrl
                      ? 'Tirar outra foto'
                      : 'Tirar foto de conclusão'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {!canExecuteField ? (
            <Text style={styles.notice}>
              Você está acompanhando este chamado. Alterar status (aguardar peça, concluir etc.) é
              exclusivo do técnico responsável ou da equipe atribuída.
            </Text>
          ) : null}

          {canExecuteField ? (
            <>
              <Text style={styles.fieldLabel}>Observação</Text>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Observação / conclusão"
                placeholderTextColor={colors.textSecondary}
                multiline
                style={styles.input}
              />

              {actions.map((status) => {
                const blocked =
                  mutation.isPending ||
                  uploadingPhoto ||
                  uploadingStart ||
                  uploadingEnd ||
                  (status === 'IN_PROGRESS' &&
                    (wo.status === 'APPROVED' || wo.status === 'SAFETY_CHECK') &&
                    !safetyReady) ||
                  (status === 'IN_PROGRESS' && !startPhotoUrl) ||
                  (status === 'COMPLETED' && (!endPhotoUrl || !executionReady));
                return (
                  <TouchableOpacity
                    key={status}
                    style={[styles.primaryBtn, blocked && { opacity: 0.5 }]}
                    disabled={blocked}
                    onPress={() => {
                      if (status === 'WAITING_PARTS') {
                        setPartsModalOpen(true);
                        return;
                      }
                      if (status === 'COMPLETED' && wo.buildingCloseQrRequired) {
                        void (async () => {
                          const existing = await readCloseQrToken();
                          if (existing) {
                            mutation.mutate(status);
                            return;
                          }
                          if (!permission?.granted) {
                            const res = await requestPermission();
                            if (!res.granted) {
                              Alert.alert(
                                'QR da localidade',
                                'É preciso ler o QR em posse do responsável pela localidade para concluir.'
                              );
                              return;
                            }
                          }
                          scanLockRef.current = false;
                          setCloseScannerOpen(true);
                        })();
                        return;
                      }
                      mutation.mutate(status);
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.primaryBtnText}>{ACTION_LABEL[status] || status}</Text>
                  </TouchableOpacity>
                );
              })}
            </>
          ) : null}
        </ScrollView>
      )}

      <Modal
        visible={partsModalOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setPartsModalOpen(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setPartsModalOpen(false)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.modalKeyboard}
          >
            <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
              <Text style={styles.modalTitle}>Peças / materiais</Text>
              <Text style={styles.modalHint}>
                Informe o que está faltando para marcar o chamado como aguardando peça.
              </Text>

              {parts.length === 0 ? (
                <Text style={styles.modalEmpty}>Nenhuma peça adicionada ainda.</Text>
              ) : (
                parts.map((part) => (
                  <View key={part.id} style={styles.partRow}>
                    <Text style={styles.partName}>{part.name}</Text>
                    <TouchableOpacity
                      onPress={() => setParts((prev) => prev.filter((p) => p.id !== part.id))}
                      hitSlop={8}
                    >
                      <Text style={styles.partRemove}>Remover</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}

              <View style={styles.partAddRow}>
                <TextInput
                  value={newPartName}
                  onChangeText={setNewPartName}
                  placeholder="Nome da peça"
                  placeholderTextColor={colors.textSecondary}
                  style={styles.partInput}
                  onSubmitEditing={addPart}
                  autoFocus
                />
                <TouchableOpacity
                  style={[styles.partAddBtn, { backgroundColor: colors.primary }]}
                  onPress={addPart}
                  activeOpacity={0.85}
                >
                  <Text style={styles.primaryBtnText}>Adicionar</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[
                  styles.primaryBtn,
                  styles.modalConfirmBtn,
                  (mutation.isPending || parts.length === 0) && { opacity: 0.5 },
                ]}
                disabled={mutation.isPending || parts.length === 0}
                onPress={confirmWaitingParts}
                activeOpacity={0.85}
              >
                {mutation.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Confirmar aguardando peça</Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.modalCancel}
                onPress={() => setPartsModalOpen(false)}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      <Modal
        visible={closeScannerOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setCloseScannerOpen(false)}
      >
        <View style={styles.scannerContainer}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={(result: BarcodeScanningResult) => {
              if (scanLockRef.current) return;
              const token = extractCloseQrToken(result?.data ?? '');
              if (!token) return;
              scanLockRef.current = true;
              setCloseScannerOpen(false);
              void saveCloseQrToken(token).then(() => mutation.mutate('COMPLETED'));
            }}
          />
          <View style={styles.scannerBar}>
            <TouchableOpacity onPress={() => setCloseScannerOpen(false)}>
              <Text style={styles.scannerClose}>Cancelar</Text>
            </TouchableOpacity>
            <Text style={styles.scannerHint}>QR do responsável pela localidade</Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const getStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.screenRoot },
    container: { flex: 1, backgroundColor: colors.screenRoot },
    loadingWrap: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
    },
    body: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 48 },
    hero: {
      marginBottom: 8,
      alignItems: 'center',
      paddingHorizontal: 8,
    },
    title: {
      fontSize: 22,
      fontWeight: '700',
      letterSpacing: -0.4,
      color: colors.text,
      textAlign: 'center',
    },
    badge: {
      marginTop: 10,
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 999,
    },
    badgeText: {
      fontSize: 12,
      fontWeight: '700',
    },
    chipsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      gap: 8,
      marginTop: 14,
    },
    chip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 12,
      backgroundColor: isDark ? colors.card : colors.surface,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: isDark ? colors.border : 'rgba(15, 23, 42, 0.08)',
      alignItems: 'center',
    },
    chipLabel: {
      fontSize: 10,
      fontWeight: '600',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
      marginBottom: 2,
      textAlign: 'center',
    },
    chipValue: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
    },
    desc: {
      marginTop: 14,
      fontSize: 15,
      lineHeight: 22,
      fontWeight: '500',
      color: colors.text,
      textAlign: 'center',
    },
    location: {
      color: colors.textSecondary,
      marginTop: 12,
      fontSize: 13,
      fontWeight: '500',
      lineHeight: 18,
      textAlign: 'center',
      paddingHorizontal: 4,
    },
    box: {
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderRadius: 16,
      padding: 16,
      marginTop: 16,
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
    notice: {
      color: colors.textSecondary,
      marginTop: 16,
      marginBottom: 4,
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '500',
    },
    eventRow: {
      marginBottom: 12,
      paddingBottom: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.08)',
    },
    eventWhen: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
    eventWhat: { color: colors.text, fontSize: 14, fontWeight: '700', marginTop: 2 },
    eventNote: { color: colors.textSecondary, fontSize: 13, marginTop: 2, lineHeight: 18 },
    scannerContainer: { flex: 1, backgroundColor: '#000' },
    scannerBar: {
      position: 'absolute',
      left: 20,
      right: 20,
      top: 54,
    },
    scannerClose: { color: '#fff', fontWeight: '700', fontSize: 16 },
    scannerHint: { color: '#fff', marginTop: 10, fontSize: 15, fontWeight: '600' },
    checklistItem: { marginBottom: 14 },
    checkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 8 },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: isDark ? colors.border : 'rgba(15, 23, 42, 0.2)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkLabel: {
      flex: 1,
      color: colors.text,
      fontSize: 14,
      fontWeight: '600',
    },
    fieldLabel: {
      marginTop: 18,
      marginBottom: 8,
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
    },
    input: {
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderRadius: 14,
      minHeight: 96,
      padding: 14,
      textAlignVertical: 'top',
      color: colors.text,
      backgroundColor: colors.card,
      borderColor: isDark ? colors.border : 'rgba(15, 23, 42, 0.08)',
      fontSize: 15,
      fontWeight: '500',
    },
    primaryBtn: {
      marginTop: 12,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
      minHeight: 52,
    },
    primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    secondaryBtn: {
      marginTop: 8,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : colors.surface,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: isDark ? colors.border : 'rgba(15, 23, 42, 0.08)',
    },
    secondaryBtnText: {
      color: colors.text,
      fontWeight: '700',
      fontSize: 13,
      textAlign: 'center',
    },
    photoActions: { flexDirection: 'row', gap: 8 },
    photoActionBtn: { flex: 1, marginTop: 4 },
    photo: {
      width: '100%',
      height: 180,
      borderRadius: 12,
      marginTop: 8,
      marginBottom: 4,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.06)',
      resizeMode: 'cover',
    },
    partRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 10,
    },
    partName: { color: colors.text, flex: 1, fontSize: 14, fontWeight: '600' },
    partRemove: { color: '#ef4444', fontWeight: '700', fontSize: 13 },
    partAddRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
    partInput: {
      flex: 1,
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 11,
      color: colors.text,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : colors.surface,
      borderColor: isDark ? colors.border : 'rgba(15, 23, 42, 0.08)',
      fontSize: 14,
      fontWeight: '500',
    },
    partAddBtn: {
      borderRadius: 12,
      paddingHorizontal: 14,
      paddingVertical: 11,
      alignItems: 'center',
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(15, 23, 42, 0.45)',
      justifyContent: 'flex-end',
    },
    modalKeyboard: {
      width: '100%',
    },
    modalSheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 28,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '700',
      letterSpacing: -0.3,
      color: colors.text,
      marginBottom: 6,
    },
    modalHint: {
      fontSize: 13,
      lineHeight: 18,
      fontWeight: '500',
      color: colors.textSecondary,
      marginBottom: 16,
    },
    modalEmpty: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.textSecondary,
      marginBottom: 12,
    },
    modalConfirmBtn: {
      marginTop: 16,
    },
    modalCancel: {
      marginTop: 12,
      alignItems: 'center',
      paddingVertical: 10,
    },
    modalCancelText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
  });
