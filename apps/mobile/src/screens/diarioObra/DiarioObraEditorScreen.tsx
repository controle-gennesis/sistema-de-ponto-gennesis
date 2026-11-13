import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  Camera,
  ChevronLeft,
  ChevronRight,
  CloudRain,
  CloudSun,
  ListChecks,
  Package,
  Pencil,
  Plus,
  RotateCcw,
  StickyNote,
  Sun,
  Sunrise,
  Sunset,
  Trash2,
  TriangleAlert,
  User,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react-native';
import AppHeader from '../../components/AppHeader';
import { showAppToast } from '../../components/AppToast';
import RdoFieldsSheet from '../../components/diarioObra/RdoFieldsSheet';
import RdoNoActivitySheet from '../../components/diarioObra/RdoNoActivitySheet';
import { useTheme } from '../../context/ThemeContext';
import { resolveMediaUrl } from '../../utils/resolveMediaUrl';
import api from '../../services/api';
import {
  SECTIONS,
  SEVERITY_LABEL,
  fmtNum,
  SECTION_ORDER,
  MONTH_SHORT,
  brDate,
  deleteRdo,
  deleteRdoPhoto,
  emptyRdo,
  finalizeRdo,
  fromApi,
  newId,
  parseIso,
  reopenRdo,
  saveRdo,
  shiftIso,
  splitReasons,
  todayIso,
  uploadRdoPhoto,
  fetchRdo,
  type Period,
  type Photo,
  type Rdo,
  type Row,
  type SectionKey,
  type Sky,
} from '../../services/diarioObra';
import type { RootStackParamList } from '../../../App';

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const SECTION_ICON: Record<SectionKey, LucideIcon> = {
  activities: ListChecks,
  laborDirect: Users,
  laborIndirect: User,
  equipment: Wrench,
  materials: Package,
  occurrences: TriangleAlert,
  notes: StickyNote,
};

const SKY_OPTIONS: Array<{ value: Exclude<Sky, null>; icon: LucideIcon; label: string }> = [
  { value: 'SUN', icon: Sun, label: 'Ensolarado' },
  { value: 'PARTLY', icon: CloudSun, label: 'Nublado' },
  { value: 'RAIN', icon: CloudRain, label: 'Chuvoso' },
];

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
/** Vermelho dos ícones dos cartões (o mesmo do cartão "Sem atividade"). */
const ICON_RED = '#ef4444';
const ICON_RED_BG = 'rgba(239, 68, 68, 0.12)';

export default function DiarioObraEditorScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, 'DiarioObraEditor'>>();
  const queryClient = useQueryClient();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);

  const { obraId } = route.params;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(route.params.date) ? route.params.date : todayIso();
  const today = todayIso();

  const [rdo, setRdo] = useState<Rdo>(emptyRdo);
  const [loadedKey, setLoadedKey] = useState('');
  const [loadError, setLoadError] = useState(false);
  const [finalizedAt, setFinalizedAt] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [sheet, setSheet] = useState<{ section: SectionKey; row: Row | null } | null>(null);
  const [noActivityOpen, setNoActivityOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [viewer, setViewer] = useState<{ row: Row; photo: Photo } | null>(null);

  const dirtyRef = useRef(false);
  const rdoRef = useRef(rdo);
  rdoRef.current = rdo;
  const keyRef = useRef({ obraId, date });
  keyRef.current = { obraId, date };

  const locked = !!finalizedAt;
  const currentKey = `${obraId}|${date}`;

  // Nome da obra: vem da lista quando abre por ela; senão busca.
  const { data: obraData } = useQuery({
    queryKey: ['diario-obra-obra', obraId],
    enabled: !route.params.obraName,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const res = await api.get(`/api/obras/${obraId}`);
      const json = await res.json().catch(() => ({}));
      return (json?.data ?? null) as { name?: string; contratoNome?: string; contrato?: { name?: string } } | null;
    },
  });
  const obraName = route.params.obraName || obraData?.name || 'Obra';
  const contratoName = route.params.contratoName || obraData?.contratoNome || obraData?.contrato?.name || '';

  // ── Carregar o RDO do dia ────────────────────────────────────────────────────
  const load = useCallback(() => {
    let cancelled = false;
    dirtyRef.current = false;
    setLoadedKey('');
    setLoadError(false);
    setSaveState('idle');
    fetchRdo(obraId, date)
      .then((row) => {
        if (cancelled) return;
        setRdo(fromApi(row));
        setFinalizedAt(row?.finalizedAt ?? null);
        setLoadedKey(`${obraId}|${date}`);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [obraId, date]);

  useEffect(() => load(), [load]);

  // ── Salvar sozinho, um instante depois da última alteração ───────────────────
  useEffect(() => {
    if (!dirtyRef.current || loadedKey !== currentKey) return;
    setSaveState('saving');
    const key = currentKey;
    const timer = setTimeout(() => {
      saveRdo(obraId, date, rdo)
        .then(() => {
          if (key !== `${keyRef.current.obraId}|${keyRef.current.date}`) return;
          dirtyRef.current = false;
          setSaveState('saved');
        })
        .catch(() => setSaveState('error'));
    }, 900);
    return () => clearTimeout(timer);
  }, [rdo, loadedKey, currentKey, obraId, date]);

  /** Grava na hora o que ainda estiver pendente (ao trocar de dia, sair da tela ou ir para o segundo plano). */
  const flush = useCallback(async () => {
    if (!dirtyRef.current) return true;
    const { obraId: o, date: d } = keyRef.current;
    try {
      await saveRdo(o, d, rdoRef.current);
      dirtyRef.current = false;
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') void flush();
    });
    return () => {
      sub.remove();
      // Saindo da tela com alteração pendente: grava antes de ir embora.
      if (dirtyRef.current) {
        void saveRdo(keyRef.current.obraId, keyRef.current.date, rdoRef.current).catch(() => undefined);
        void queryClient.invalidateQueries({ queryKey: ['diario-obra-list'] });
      }
    };
  }, [flush, queryClient]);

  const update = useCallback(
    (fn: (r: Rdo) => Rdo) => {
      if (locked) return;
      dirtyRef.current = true;
      setRdo(fn);
    },
    [locked],
  );

  const refreshList = () => void queryClient.invalidateQueries({ queryKey: ['diario-obra-list'] });

  const goToDate = async (iso: string) => {
    if (iso === date) return;
    const ok = await flush();
    if (!ok) {
      showAppToast({ type: 'error', text1: 'Erro', text2: 'Não foi possível salvar antes de trocar de dia.' });
      return;
    }
    navigation.setParams({ date: iso });
  };

  // ── Lançamentos ──────────────────────────────────────────────────────────────
  const saveRow = (section: SectionKey, row: Row | null, values: Record<string, string>) => {
    const numeric = new Set(['quantity', 'hours']);
    const clean: Record<string, string | number | null> = {};
    for (const [k, v] of Object.entries(values)) {
      clean[k] = numeric.has(k) ? (v.trim() === '' ? null : Number(v.replace(',', '.'))) : v.trim();
    }
    update((r) => ({
      ...r,
      [section]: row
        ? r[section].map((x) => (x.id === row.id ? { ...x, ...clean } : x))
        : [...r[section], { id: newId(), ...clean }],
    }));
    setSheet(null);
  };

  const removeRow = (section: SectionKey, row: Row) => {
    // Atividade removida: apaga também os arquivos das fotos dela (sem travar se algum falhar).
    if (section === 'activities' && Array.isArray(row.photos)) {
      for (const ph of row.photos as Photo[]) {
        if (ph.key) void deleteRdoPhoto(obraId, date, ph.key).catch(() => undefined);
      }
    }
    update((r) => ({ ...r, [section]: r[section].filter((x) => x.id !== row.id) }));
    setSheet(null);
  };

  const confirmRemoveRow = (section: SectionKey, row: Row) =>
    Alert.alert('Excluir lançamento', 'Deseja excluir este lançamento?', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Excluir', style: 'destructive', onPress: () => removeRow(section, row) },
    ]);

  // ── Fotos ────────────────────────────────────────────────────────────────────
  const addPhotos = async (row: Row, assets: ImagePicker.ImagePickerAsset[]) => {
    if (locked || assets.length === 0) return;
    setUploadingId(row.id);
    const added: Photo[] = [];
    for (const asset of assets) {
      if (asset.fileSize && asset.fileSize > MAX_PHOTO_BYTES) {
        showAppToast({ type: 'error', text1: 'Erro', text2: 'Uma foto passa de 5 MB e foi ignorada.' });
        continue;
      }
      try {
        const type = asset.mimeType || 'image/jpeg';
        const name = asset.fileName || `foto-${Date.now()}.${type.split('/')[1] || 'jpg'}`;
        added.push(await uploadRdoPhoto(obraId, date, { uri: asset.uri, name, type }));
      } catch (e: any) {
        showAppToast({ type: 'error', text1: 'Erro', text2: e?.message || 'Não foi possível enviar a foto.' });
      }
    }
    setUploadingId(null);
    if (added.length > 0) {
      update((r) => ({
        ...r,
        activities: r.activities.map((a) =>
          a.id === row.id ? { ...a, photos: [...((Array.isArray(a.photos) ? a.photos : []) as Photo[]), ...added] } : a,
        ),
      }));
    }
  };

  const pickFromCamera = async (row: Row) => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão', 'Precisamos da câmera para tirar a foto.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (!result.canceled) await addPhotos(row, result.assets);
  };

  const pickFromLibrary = async (row: Row) => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permissão', 'Precisamos da galeria para escolher as fotos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 0.7,
    });
    if (!result.canceled) await addPhotos(row, result.assets);
  };

  const openPhotoMenu = (row: Row) => {
    if (uploadingId) return;
    Alert.alert('Adicionar foto', 'De onde vem a foto?', [
      { text: 'Câmera', onPress: () => void pickFromCamera(row) },
      { text: 'Galeria', onPress: () => void pickFromLibrary(row) },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const removePhoto = (row: Row, photo: Photo) => {
    if (photo.key) void deleteRdoPhoto(obraId, date, photo.key).catch(() => undefined);
    update((r) => ({
      ...r,
      activities: r.activities.map((a) =>
        a.id === row.id
          ? { ...a, photos: ((Array.isArray(a.photos) ? a.photos : []) as Photo[]).filter((p) => p.url !== photo.url) }
          : a,
      ),
    }));
    setViewer(null);
  };

  // ── Finalizar / reabrir / excluir ────────────────────────────────────────────
  const finalize = () =>
    Alert.alert(
      'Finalizar RDO',
      'Depois de finalizado, o diário não poderá ser editado até ser reaberto. Deseja finalizar?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Finalizar',
          onPress: async () => {
            setBusy(true);
            try {
              await saveRdo(obraId, date, rdoRef.current);
              dirtyRef.current = false;
              setFinalizedAt(await finalizeRdo(obraId, date));
              setSaveState('saved');
              showAppToast({ type: 'success', text1: 'RDO finalizado' });
              refreshList();
            } catch (e: any) {
              showAppToast({ type: 'error', text1: 'Erro', text2: e?.message || 'Não foi possível finalizar o RDO.' });
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );

  const reopen = async () => {
    setBusy(true);
    try {
      await reopenRdo(obraId, date);
      setFinalizedAt(null);
      showAppToast({ type: 'success', text1: 'RDO reaberto para edição' });
      refreshList();
    } catch (e: any) {
      showAppToast({ type: 'error', text1: 'Erro', text2: e?.message || 'Não foi possível reabrir o RDO.' });
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = () =>
    Alert.alert('Excluir diário', `Excluir o diário de ${brDate(date)}? Esta ação não pode ser desfeita.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            dirtyRef.current = false;
            await deleteRdo(obraId, date);
            refreshList();
            showAppToast({ type: 'success', text1: 'Diário excluído' });
            navigation.goBack();
          } catch (e: any) {
            setBusy(false);
            showAppToast({ type: 'error', text1: 'Erro', text2: e?.message || 'Não foi possível excluir o diário.' });
          }
        },
      },
    ]);

  const setNoActivity = (reason: string, note: string) => {
    update((r) => ({ ...r, noActivity: true, noActivityReason: reason, noActivityNote: note }));
    setNoActivityOpen(false);
  };

  const clearNoActivity = () =>
    update((r) => ({ ...r, noActivity: false, noActivityReason: '', noActivityNote: '' }));

  const setPeriod = (which: 'morning' | 'afternoon', p: Period) =>
    update((r) => ({ ...r, weather: { ...r.weather, [which]: p } }));

  // ── Interface ────────────────────────────────────────────────────────────────
  const d = parseIso(date);
  const loading = loadedKey !== currentKey && !loadError;

  const saveLabel =
    saveState === 'saving' ? 'Salvando…' : saveState === 'saved' ? 'Salvo' : saveState === 'error' ? 'Erro ao salvar' : '';

  // Um cartão para a manhã e outro para a tarde, como no site.
  const weatherCards = (
    [
      ['morning', 'Clima da Manhã', 'Condições pela manhã', Sunrise],
      ['afternoon', 'Clima da Tarde', 'Condições à tarde', Sunset],
    ] as const
  ).map(([which, title, subtitle, icon]) => (
    <View key={which} style={styles.card}>
      <CardHeader icon={icon} title={title} subtitle={subtitle} styles={styles} colors={colors} />
      <View style={styles.weatherCol}>
        <Segmented
          styles={styles}
          colors={colors}
          disabled={locked}
          value={rdo.weather[which].sky ?? ''}
          options={SKY_OPTIONS.map((o) => ({ value: o.value, icon: o.icon, a11y: o.label }))}
          onChange={(v) =>
            setPeriod(which, { ...rdo.weather[which], sky: v === rdo.weather[which].sky ? null : (v as Sky) })
          }
        />
        <Segmented
          styles={styles}
          colors={colors}
          disabled={locked}
          value={rdo.weather[which].practicable === null ? '' : rdo.weather[which].practicable ? 'yes' : 'no'}
          options={[
            { value: 'yes', label: 'Praticável' },
            { value: 'no', label: 'Impraticável' },
          ]}
          onChange={(v) => {
            const cur = rdo.weather[which].practicable;
            const next = v === 'yes';
            setPeriod(which, { ...rdo.weather[which], practicable: cur === next ? null : next });
          }}
        />
      </View>
    </View>
  ));

  /** Como cada lançamento aparece na lista: nome e detalhes à esquerda; quantidade (ou severidade) em destaque à direita. */
  const rowInfo = (key: SectionKey, r: Row) => {
    const join = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' · ');
    const hours = r.hours ? `${fmtNum(r.hours)} h` : '';
    const notes = String(r.notes ?? '');
    const qty = fmtNum(r.quantity) || '1';
    const base = { right: '', rightColor: colors.text as string, titleExtra: '', detail2: '' };
    if (key === 'laborDirect' || key === 'laborIndirect') {
      return { ...base, right: `× ${qty}`, title: String(r.role ?? ''), titleExtra: hours, detail: notes };
    }
    if (key === 'equipment') {
      return { ...base, right: `× ${qty}`, title: String(r.name ?? ''), titleExtra: hours, detail: notes };
    }
    if (key === 'materials') {
      return { ...base, right: `${qty} ${String(r.unit ?? '')}`.trim(), title: String(r.name ?? ''), detail: notes };
    }
    if (key === 'occurrences') {
      const sev = String(r.severity ?? 'LOW');
      const col = sev === 'HIGH' ? '#ef4444' : sev === 'MEDIUM' ? '#f97316' : '#d97706';
      const interval = r.start || r.end ? `${r.start || '--:--'} às ${r.end || '--:--'}` : '';
      // 2ª linha: ações tomadas; 3ª linha: horário.
      return {
        titleExtra: '',
        right: SEVERITY_LABEL[sev] ?? 'Baixa',
        rightColor: col,
        title: String(r.description ?? ''),
        detail: String(r.actions ?? ''),
        detail2: interval,
      };
    }
    return { ...base, title: String(r.text ?? ''), detail: '' };
  };

  /** Subtítulo do bloco: o total lançado (pessoas, equipamentos...) ou, se ainda não há nada, a descrição do bloco. */
  const sectionSubtitle = (key: SectionKey, rows: Row[], fallback: string) => {
    if (rows.length === 0) return fallback;
    const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
    const sumQty = () => rows.reduce((t, r) => t + (Number(r.quantity) > 0 ? Number(r.quantity) : 1), 0);
    switch (key) {
      case 'laborDirect':
      case 'laborIndirect':
        return plural(sumQty(), 'pessoa', 'pessoas');
      case 'equipment':
        return plural(sumQty(), 'equipamento', 'equipamentos');
      case 'activities':
        return plural(rows.length, 'atividade', 'atividades');
      case 'materials':
        return plural(rows.length, 'recebimento', 'recebimentos');
      case 'occurrences':
        return plural(rows.length, 'ocorrência', 'ocorrências');
      default:
        return plural(rows.length, 'observação', 'observações');
    }
  };

  const renderSection = (key: SectionKey) => {
    const cfg = SECTIONS[key];
    const rows = rdo[key];
    return (
      <View key={key} style={styles.card}>
        <CardHeader
          icon={SECTION_ICON[key]}
          title={cfg.title}
          subtitle={sectionSubtitle(key, rows, cfg.subtitle)}
          onAdd={locked ? undefined : () => setSheet({ section: key, row: null })}
          addLabel={cfg.addLabel}
          styles={styles}
          colors={colors}
        />

        {rows.length === 0 ? (
          <Text style={styles.empty}>{cfg.emptyLabel}</Text>
        ) : key === 'activities' ? (
          <View style={styles.activityList}>
            {rows.map((r, i) => {
              const photos = (Array.isArray(r.photos) ? r.photos : []) as Photo[];
              const start = String(r.start ?? '');
              const end = String(r.end ?? '');
              const description = String(r.description ?? '');
              return (
                <View key={r.id} style={styles.activity}>
                  <TouchableOpacity
                    style={styles.activityTop}
                    activeOpacity={locked ? 1 : 0.7}
                    disabled={locked}
                    onPress={() => setSheet({ section: key, row: r })}
                  >
                    <View style={styles.activityNumber}>
                      <Text style={styles.activityNumberText}>{i + 1}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.activityTitle}>{String(r.title ?? '') || '—'}</Text>
                      {start || end ? (
                        <Text style={styles.activityTime}>
                          {start || '--:--'} às {end || '--:--'}
                        </Text>
                      ) : null}
                    </View>
                    {locked ? null : <Pencil size={16} color={colors.textSecondary} strokeWidth={2.2} />}
                  </TouchableOpacity>

                  {description ? <Text style={styles.activityDescription}>{description}</Text> : null}

                  {photos.length > 0 || !locked ? (
                    <PhotoGrid styles={styles}>
                      {[
                        ...photos.map((ph) => (
                          <TouchableOpacity
                            key={ph.key || ph.url}
                            style={styles.photoFill}
                            activeOpacity={0.85}
                            onPress={() => setViewer({ row: r, photo: ph })}
                            accessibilityLabel="Abrir foto"
                          >
                            <Image source={{ uri: resolveMediaUrl(ph.url) }} style={styles.photo} />
                          </TouchableOpacity>
                        )),
                        ...(locked
                          ? []
                          : [
                              <TouchableOpacity
                                key="add"
                                style={[styles.photoFill, styles.photoAdd]}
                                activeOpacity={0.75}
                                onPress={() => openPhotoMenu(r)}
                                disabled={uploadingId === r.id}
                                accessibilityLabel="Adicionar foto"
                              >
                                {uploadingId === r.id ? (
                                  <ActivityIndicator color={colors.primary} />
                                ) : (
                                  <>
                                    <Camera size={20} color={colors.primary} strokeWidth={2.2} />
                                    <Text style={styles.photoAddText}>Foto</Text>
                                  </>
                                )}
                              </TouchableOpacity>,
                            ]),
                      ]}
                    </PhotoGrid>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : (
          <View>
            {rows.map((r, i) => {
              const info = rowInfo(key, r);
              return (
                <TouchableOpacity
                  key={r.id}
                  style={[styles.row, i > 0 && styles.rowDivider]}
                  activeOpacity={locked ? 1 : 0.6}
                  disabled={locked}
                  onPress={() => setSheet({ section: key, row: r })}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.rowTitle} numberOfLines={2}>
                      {info.title || '—'}
                      {info.titleExtra ? <Text style={styles.rowTitleExtra}> · {info.titleExtra}</Text> : null}
                    </Text>
                    {info.detail ? (
                      <Text style={styles.rowDetail} numberOfLines={2}>
                        {info.detail}
                      </Text>
                    ) : null}
                    {info.detail2 ? <Text style={styles.rowDetail}>{info.detail2}</Text> : null}
                  </View>
                  {info.right ? (
                    <Text style={[styles.rowRight, { color: info.rightColor }]} numberOfLines={1}>
                      {info.right}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>
    );
  };

  const reasons = splitReasons(rdo.noActivityReason);

  // Situação do dia: a cor da data segue a situação (vermelho = sem atividade, verde = finalizado, amarelo = em preenchimento).
  const dayStatus: 'NONE' | 'FINAL' | 'DRAFT' = rdo.noActivity ? 'NONE' : locked ? 'FINAL' : 'DRAFT';
  const statusColor = dayStatus === 'NONE' ? '#ef4444' : dayStatus === 'FINAL' ? '#22c55e' : '#f59e0b';
  const statusTextColor =
    dayStatus === 'NONE'
      ? isDark ? '#f87171' : '#b91c1c'
      : dayStatus === 'FINAL'
        ? isDark ? '#4ade80' : '#15803d'
        : isDark ? '#fbbf24' : '#b45309';
  const headBg = { backgroundColor: `${statusColor}29` };
  const headFg = { color: statusTextColor };

  return (
    <View style={styles.safeArea}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AppHeader showBack title="Diário de Obra" onBack={() => navigation.goBack()} />

      {loadError ? (
        <TouchableOpacity style={styles.center} activeOpacity={0.7} onPress={load}>
          <Text style={styles.centerTitle}>Não foi possível carregar o RDO</Text>
          <Text style={styles.centerText}>Toque para tentar de novo.</Text>
        </TouchableOpacity>
      ) : loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Obra e dia */}
          <View style={styles.card}>
            <View style={styles.headTop}>
              <View style={[styles.dateBlock, headBg]}>
                <Text style={[styles.dateDay, headFg]}>{String(d.getDate()).padStart(2, '0')}</Text>
                <Text style={[styles.dateMonth, headFg]}>{MONTH_SHORT[d.getMonth()]}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.obraName} numberOfLines={2}>
                  {obraName}
                </Text>
                {contratoName ? (
                  <Text style={styles.obraSub} numberOfLines={1}>
                    {contratoName}
                  </Text>
                ) : null}
              </View>
            </View>

            <View style={styles.headDivider} />

            <View style={styles.headNav}>
              <TouchableOpacity
                style={styles.navBtn}
                onPress={() => void goToDate(shiftIso(date, -1))}
                hitSlop={6}
                accessibilityLabel="Dia anterior"
              >
                <ChevronLeft size={20} color={colors.text} strokeWidth={2.4} />
              </TouchableOpacity>

              <View style={styles.navCenter}>
                <Text style={styles.navDate}>{brDate(date)}</Text>
                {saveLabel ? (
                  <TouchableOpacity
                    disabled={saveState !== 'error'}
                    onPress={() => {
                      dirtyRef.current = true;
                      setRdo((r) => ({ ...r }));
                    }}
                  >
                    <Text style={[styles.saveText, saveState === 'error' && { color: '#dc2626' }]}>
                      {saveLabel}
                      {saveState === 'error' ? ' · tocar para tentar' : ''}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              <TouchableOpacity
                style={[styles.navBtn, date >= today && { opacity: 0.35 }]}
                onPress={() => void goToDate(shiftIso(date, 1))}
                disabled={date >= today}
                hitSlop={6}
                accessibilityLabel="Próximo dia"
              >
                <ChevronRight size={20} color={colors.text} strokeWidth={2.4} />
              </TouchableOpacity>
            </View>
          </View>

          {!locked || rdo.noActivity ? (
            <View style={styles.card}>
              <View style={styles.noActivitySwitchCard}>
                <View style={styles.noActivityIcon}>
                  <Ban size={20} color={ICON_RED} strokeWidth={2.2} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.cardTitle}>Sem atividade</Text>
                  <Text style={styles.cardSubtitle} numberOfLines={1}>
                    Dia sem serviço
                  </Text>
                </View>
                {locked ? null : (
                  <Switch
                    value={rdo.noActivity}
                    style={{ alignSelf: 'center' }}
                    onValueChange={(on) => (on ? setNoActivityOpen(true) : clearNoActivity())}
                    trackColor={{ false: isDark ? '#374151' : '#d1d5db', true: '#fca5a5' }}
                    thumbColor={rdo.noActivity ? '#ef4444' : '#f4f4f5'}
                    accessibilityLabel="Marcar o dia como sem atividade"
                  />
                )}
              </View>

              {rdo.noActivity ? (
                <View style={styles.noActivityBody}>
                  <View style={styles.reasonChips}>
                    {reasons.map((r) => (
                      <View key={r} style={styles.reasonChip}>
                        <Text style={styles.reasonChipText}>{r}</Text>
                      </View>
                    ))}
                  </View>
                  {rdo.noActivityNote ? <Text style={styles.noActivityNote}>{rdo.noActivityNote}</Text> : null}
                  {locked ? null : (
                    <TouchableOpacity style={styles.outlineBtn} activeOpacity={0.75} onPress={() => setNoActivityOpen(true)}>
                      <Text style={styles.outlineBtnText}>Editar motivo</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : null}
            </View>
          ) : null}

          {!rdo.noActivity ? (
            <>
              {weatherCards}
              {SECTION_ORDER.map(renderSection)}
            </>
          ) : null}

          {/* Ações do diário */}
          <View style={styles.actions}>
            {locked ? (
              <TouchableOpacity style={styles.outlineWide} activeOpacity={0.8} onPress={() => void reopen()} disabled={busy}>
                {busy ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <>
                    <RotateCcw size={18} color={colors.primary} strokeWidth={2.2} />
                    <Text style={styles.outlineWideText}>Reabrir RDO para editar</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : rdo.noActivity ? null : (
              // Dia sem atividade não tem o que finalizar: o botão só aparece para diários preenchidos.
              <TouchableOpacity style={styles.primaryBtn} activeOpacity={0.85} onPress={finalize} disabled={busy}>
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Finalizar</Text>}
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.deleteBtn} activeOpacity={0.7} onPress={confirmDelete} disabled={busy}>
              <Text style={styles.deleteText}>Excluir</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {sheet ? (
        <RdoFieldsSheet
          visible
          config={SECTIONS[sheet.section]}
          initial={sheet.row}
          onClose={() => setSheet(null)}
          onSave={(values) => saveRow(sheet.section, sheet.row, values)}
          onDelete={sheet.row ? () => confirmRemoveRow(sheet.section, sheet.row as Row) : undefined}
        />
      ) : null}

      <RdoNoActivitySheet
        visible={noActivityOpen}
        dateLabel={brDate(date)}
        initialReason={rdo.noActivityReason}
        initialNote={rdo.noActivityNote}
        onClose={() => setNoActivityOpen(false)}
        onConfirm={setNoActivity}
      />

      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <View style={styles.viewer}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setViewer(null)} />
          {viewer ? (
            <Image source={{ uri: resolveMediaUrl(viewer.photo.url) }} style={styles.viewerImage} resizeMode="contain" />
          ) : null}
          <View style={styles.viewerBar}>
            <TouchableOpacity style={styles.viewerBtn} onPress={() => setViewer(null)} accessibilityLabel="Fechar">
              <X size={22} color="#fff" strokeWidth={2.4} />
            </TouchableOpacity>
            {viewer && !locked ? (
              <TouchableOpacity
                style={styles.viewerBtn}
                accessibilityLabel="Remover foto"
                onPress={() =>
                  Alert.alert('Remover foto', 'Deseja remover esta foto?', [
                    { text: 'Cancelar', style: 'cancel' },
                    { text: 'Remover', style: 'destructive', onPress: () => removePhoto(viewer.row, viewer.photo) },
                  ])
                }
              >
                <Trash2 size={20} color="#fff" strokeWidth={2.2} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Peças de interface ─────────────────────────────────────────────────────────

const PHOTO_GAP = 8;

/** Fotos da atividade: 3 quadrados por linha, ocupando toda a largura (sem sobra do lado direito). */
function PhotoGrid({ children, styles }: { children: React.ReactNode[]; styles: ReturnType<typeof getStyles> }) {
  const [width, setWidth] = useState(0);
  const size = width > 0 ? (width - PHOTO_GAP * 2) / 3 : 0;
  return (
    <View style={styles.photoGrid} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {size > 0
        ? React.Children.map(children, (child) => <View style={{ width: size, height: size }}>{child}</View>)
        : null}
    </View>
  );
}

function CardHeader({
  icon: Icon,
  title,
  subtitle,
  count,
  onAdd,
  addLabel,
  styles,
  colors,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  count?: number;
  onAdd?: () => void;
  addLabel?: string;
  styles: ReturnType<typeof getStyles>;
  colors: any;
}) {
  return (
    <View style={styles.cardHeader}>
      <View style={styles.cardIcon}>
        <Icon size={20} color={ICON_RED} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.cardTitleRow}>
          <Text style={styles.cardTitle}>{title}</Text>
          {count ? (
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{count}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.cardSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      {onAdd ? (
        <TouchableOpacity
          style={styles.addBtn}
          activeOpacity={0.8}
          onPress={onAdd}
          accessibilityRole="button"
          accessibilityLabel={addLabel}
        >
          <Plus size={20} color={ICON_RED} strokeWidth={2.6} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

type SegOption = { value: string; icon?: LucideIcon; label?: string; a11y?: string };

/** Seletor em pílula: a opção marcada fica "levantada"; tocar de novo na marcada desmarca. */
function Segmented({
  options,
  value,
  onChange,
  disabled,
  styles,
  colors,
}: {
  options: SegOption[];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  styles: ReturnType<typeof getStyles>;
  colors: any;
}) {
  return (
    <View style={[styles.segmented, disabled && { opacity: 0.55 }]}>
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <TouchableOpacity
            key={o.value}
            style={[styles.segment, active && styles.segmentActive]}
            activeOpacity={0.8}
            disabled={disabled}
            onPress={() => onChange(o.value)}
            accessibilityRole="button"
            accessibilityLabel={o.a11y ?? o.label}
            accessibilityState={{ selected: active }}
          >
            {Icon ? (
              <Icon size={18} color={active ? colors.primary : colors.textSecondary} strokeWidth={2.2} />
            ) : (
              <Text style={[styles.segmentText, active && styles.segmentTextActive]} numberOfLines={1}>
                {o.label}
              </Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Estilos ────────────────────────────────────────────────────────────────────

function getStyles(colors: any, isDark: boolean) {
  const line = isDark ? colors.border : 'rgba(15, 23, 42, 0.08)';
  const trackBg = isDark ? '#1f2937' : '#f1f2f4';
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.screenRoot },
    scroll: { flex: 1 },
    content: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 48, gap: 14 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    centerTitle: { fontSize: 17, fontWeight: '700', color: colors.text, letterSpacing: -0.3 },
    centerText: { marginTop: 6, fontSize: 14, fontWeight: '500', color: colors.textSecondary },

    card: {
      backgroundColor: colors.surface,
      borderRadius: 18,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      padding: 16,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
    cardIcon: {
      width: 42,
      height: 42,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ICON_RED_BG,
    },
    cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cardTitle: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3, color: colors.text },
    cardSubtitle: { marginTop: 2, fontSize: 13, fontWeight: '500', color: colors.textSecondary },
    countBadge: {
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      paddingHorizontal: 6,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `${colors.primary}1A`,
    },
    countText: { fontSize: 12, fontWeight: '800', color: colors.primary },
    addBtn: {
      width: 38,
      height: 38,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ICON_RED_BG,
    },
    empty: { fontSize: 14, fontWeight: '500', lineHeight: 20, color: colors.textSecondary },

    headTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    dateBlock: {
      width: 58,
      height: 66,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dateDay: { fontSize: 24, fontWeight: '800', letterSpacing: -0.5, lineHeight: 28 },
    dateMonth: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
    obraName: { fontSize: 18, fontWeight: '700', letterSpacing: -0.4, color: colors.text },
    obraSub: { marginTop: 2, fontSize: 13, fontWeight: '500', color: colors.textSecondary },
    headDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginTop: 16 },
    headNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 14, gap: 10 },
    navBtn: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: trackBg,
    },
    navCenter: { flex: 1, alignItems: 'center', gap: 3 },
    navDate: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4, color: colors.text, fontVariant: ['tabular-nums'] },
    saveText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },

    weatherCol: { gap: 10 },
    segmented: { flexDirection: 'row', padding: 4, borderRadius: 12, backgroundColor: trackBg, gap: 2 },
    segment: { flex: 1, height: 36, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
    segmentActive: {
      backgroundColor: isDark ? '#374151' : '#ffffff',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: line,
    },
    segmentText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
    segmentTextActive: { color: colors.primary, fontWeight: '700' },

    activityList: { gap: 12 },
    activity: { padding: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: line, gap: 10 },
    activityTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    activityNumber: {
      width: 34,
      height: 34,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `${colors.primary}14`,
    },
    activityNumberText: { fontSize: 15, fontWeight: '800', color: colors.primary },
    activityTitle: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2, color: colors.text },
    activityTime: { marginTop: 2, fontSize: 12, fontWeight: '600', color: colors.textSecondary, fontVariant: ['tabular-nums'] },
    activityDescription: { fontSize: 14, fontWeight: '500', lineHeight: 20, color: colors.textSecondary },
    photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: PHOTO_GAP, paddingTop: 2 },
    photoFill: { width: '100%', height: '100%' },
    photo: { width: '100%', height: '100%', borderRadius: 12, backgroundColor: trackBg },
    photoAdd: {
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: `${colors.primary}66`,
      backgroundColor: `${colors.primary}0A`,
    },
    photoAddText: { fontSize: 12, fontWeight: '700', color: colors.primary },

    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
    rowDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
    rowTitle: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2, color: colors.text },
    rowTitleExtra: { fontSize: 15, fontWeight: '500', color: colors.textSecondary },
    rowDetail: { marginTop: 2, fontSize: 13, fontWeight: '500', lineHeight: 18, color: colors.textSecondary },
    rowRight: { fontSize: 15, fontWeight: '800', letterSpacing: -0.2, fontVariant: ['tabular-nums'] },

    noActivityBody: { marginTop: 14, gap: 12 },
    reasonChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    reasonChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: trackBg },
    reasonChipText: { fontSize: 13, fontWeight: '600', color: colors.text },
    noActivityNote: { fontSize: 14, fontWeight: '500', lineHeight: 20, color: colors.textSecondary },
    outlineBtn: {
      flex: 1,
      height: 44,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    outlineBtnText: { fontSize: 14, fontWeight: '700', color: colors.text },
    noActivitySwitchCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    noActivityIcon: {
      width: 42,
      height: 42,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: ICON_RED_BG,
    },

    actions: { marginTop: 6, gap: 10 },
    primaryBtn: {
      height: 54,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', letterSpacing: 0.2 },
    outlineWide: {
      height: 54,
      borderRadius: 999,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      borderWidth: 1.5,
      borderColor: colors.primary,
    },
    outlineWideText: { fontSize: 16, fontWeight: '700', color: colors.primary },
    deleteBtn: {
      height: 54,
      borderRadius: 999,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderWidth: 1.5,
      borderColor: '#dc2626',
      backgroundColor: 'transparent',
    },
    deleteText: { fontSize: 14, fontWeight: '700', color: '#dc2626' },

    viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', justifyContent: 'center' },
    viewerImage: { width: '100%', height: '78%' },
    viewerBar: {
      position: 'absolute',
      top: 54,
      left: 16,
      right: 16,
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    viewerBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.16)',
    },
  });
}
