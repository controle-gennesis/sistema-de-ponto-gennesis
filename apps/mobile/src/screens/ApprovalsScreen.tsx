import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useNavigation } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  ClipboardList,
  Fuel,
  FileText,
  Package,
  ShoppingCart,
  Ruler,
  Search,
  X,
  XCircle,
} from 'lucide-react-native';
import AppHeader from '../components/AppHeader';
import { showAppToast } from '../components/AppToast';
import { useTheme } from '../context/ThemeContext';
import { usePermissions } from '../hooks/usePermissions';
import { DP_TYPE_LABELS, type DpRequest } from '../services/dpRequests';
import {
  approveDpRequest,
  approveFdRequest,
  approveFuelRequest,
  approveMedicao,
  approveOcRequest,
  approveRmRequest,
  fetchApprovalNotificationCounts,
  fetchDpApprovals,
  fetchFdApprovals,
  fetchFuelApprovals,
  fetchMedicaoApprovals,
  fetchOcApprovals,
  fetchRmApprovals,
  nextOcApproveStatus,
  ocPendingStatusesForUser,
  rejectDpRequest,
  rejectFdRequest,
  rejectFuelRequest,
  rejectOcRequest,
  rejectRmRequest,
  returnMedicao,
  type ApprovalPhase,
  type FdApprovalRow,
  type FuelApprovalRow,
  type MedicaoApprovalRow,
  type OcApprovalRow,
  type RmApprovalRow,
} from '../services/approvals';

type TabId = 'dp' | 'fuel' | 'fd' | 'rm' | 'oc' | 'medicao';

type ListItem = {
  id: string;
  title: string;
  subtitle: string;
  meta: string;
  statusLabel: string;
  pending: boolean;
  raw: unknown;
};

const PHASES: { id: ApprovalPhase; label: string }[] = [
  { id: 'PENDING', label: 'Pendentes' },
  { id: 'APPROVED', label: 'Aprovadas' },
  { id: 'REJECTED', label: 'Recusadas' },
  { id: 'ALL', label: 'Todas' },
];

function formatDate(value?: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('pt-BR');
}

function formatMoney(value?: number | null): string {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function parseMoneyInput(raw: string): number | null {
  const t = raw.trim().replace(/\s/g, '');
  if (!t) return null;
  const normalized = t.includes(',')
    ? t.replace(/\./g, '').replace(',', '.')
    : t;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function isPendingStatus(kind: TabId, status: string): boolean {
  if (kind === 'dp' || kind === 'fuel' || kind === 'fd') {
    return status === 'WAITING_MANAGER' || status === 'PENDING_MANAGER';
  }
  if (kind === 'rm') return status === 'PENDING';
  if (kind === 'oc') {
    return ['PENDING', 'PENDING_COMPRAS', 'DRAFT', 'PENDING_DIRETORIA'].includes(status);
  }
  if (kind === 'medicao') return status !== 'APPROVED' && status !== 'CORRECTION';
  return false;
}

export default function ApprovalsScreen() {
  const navigation = useNavigation();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const queryClient = useQueryClient();
  const {
    canSeeAprovacoes,
    canAccessDpApproverPages,
    canApproveFuel,
    canApproveFd,
    canApproveMaterialRequests,
    canApproveOc,
    canApproveOcCompras,
    canApproveOcDiretoria,
    canApproveOcGestor,
    canApproveEmpreiteiroDaily,
    isLoading: permissionsLoading,
  } = usePermissions();

  const tabs = useMemo(() => {
    const list: { id: TabId; label: string; icon: typeof ClipboardList; countKey?: 'dp' | 'fuel' | 'fd' | 'rm' | 'oc' }[] = [];
    if (canAccessDpApproverPages) {
      list.push({ id: 'dp', label: 'Internas', icon: ClipboardList, countKey: 'dp' });
    }
    if (canApproveFuel) {
      list.push({ id: 'fuel', label: 'Combustível', icon: Fuel, countKey: 'fuel' });
    }
    if (canApproveFd) {
      list.push({ id: 'fd', label: 'FD', icon: FileText, countKey: 'fd' });
    }
    if (canApproveMaterialRequests) {
      list.push({ id: 'rm', label: 'RM', icon: Package, countKey: 'rm' });
    }
    if (canApproveOc) {
      list.push({ id: 'oc', label: 'OC', icon: ShoppingCart, countKey: 'oc' });
    }
    if (canApproveEmpreiteiroDaily) {
      list.push({ id: 'medicao', label: 'Medições', icon: Ruler });
    }
    return list;
  }, [
    canAccessDpApproverPages,
    canApproveFuel,
    canApproveFd,
    canApproveMaterialRequests,
    canApproveOc,
    canApproveEmpreiteiroDaily,
  ]);

  const countsFallback = { dp: 0, fuel: 0, fd: 0, rm: 0, oc: 0, total: 0 };

  const [tab, setTab] = useState<TabId | null>(null);
  const activeTab = tab && tabs.some((t) => t.id === tab) ? tab : tabs[0]?.id ?? null;
  const [phase, setPhase] = useState<ApprovalPhase>('PENDING');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ListItem | null>(null);
  const [comment, setComment] = useState('');
  const [medicaoAmount, setMedicaoAmount] = useState('');

  const countsQuery = useQuery({
    queryKey: ['approvals', 'notification-counts'],
    enabled: canSeeAprovacoes,
    queryFn: fetchApprovalNotificationCounts,
    refetchInterval: 60_000,
  });

  const listQuery = useQuery({
    queryKey: ['approvals', 'list', activeTab, phase],
    enabled: !!activeTab && canSeeAprovacoes,
    queryFn: async (): Promise<ListItem[]> => {
      if (activeTab === 'dp') {
        const rows = await fetchDpApprovals(phase);
        return rows.map((row) => ({
          id: row.id,
          title: DP_TYPE_LABELS[row.requestType] || row.requestType,
          subtitle:
            row.contract?.name ||
            row.costCenter?.name ||
            row.employee?.user?.name ||
            '—',
          meta: `#${row.displayNumber ?? '—'} · ${formatDate(row.createdAt)}`,
          statusLabel: row.status === 'WAITING_MANAGER' ? 'Pendente' : row.status,
          pending: isPendingStatus('dp', row.status),
          raw: row,
        }));
      }
      if (activeTab === 'fuel') {
        const rows = await fetchFuelApprovals(phase);
        return rows.map((row: FuelApprovalRow) => ({
          id: row.id,
          title: `${row.vehiclePlate || 'Veículo'} · ${row.driverName || '—'}`,
          subtitle: row.contract?.name || row.costCenter || row.route || '—',
          meta: `#${row.displayNumber ?? '—'} · ${formatDate(row.refuelDate || row.requestedAt)}`,
          statusLabel:
            row.status === 'PENDING_MANAGER' || row.status === 'WAITING_MANAGER'
              ? 'Pendente'
              : row.status,
          pending: isPendingStatus('fuel', row.status),
          raw: row,
        }));
      }
      if (activeTab === 'fd') {
        const rows = await fetchFdApprovals(phase);
        return rows.map((row: FdApprovalRow) => ({
          id: row.id,
          title: row.title?.trim() || `Ficha #${row.displayNumber ?? '—'}`,
          subtitle: row.contract?.name || row.costCenter?.name || row.requester?.name || '—',
          meta: `#${row.displayNumber ?? '—'} · ${formatDate(row.createdAt)}`,
          statusLabel: row.status === 'WAITING_MANAGER' ? 'Pendente' : row.status,
          pending: isPendingStatus('fd', row.status),
          raw: row,
        }));
      }
      if (activeTab === 'rm') {
        const status =
          phase === 'PENDING'
            ? 'PENDING'
            : phase === 'APPROVED'
              ? 'APPROVED'
              : phase === 'REJECTED'
                ? 'CANCELLED'
                : 'all';
        const rows = await fetchRmApprovals(status);
        return rows.map((row: RmApprovalRow) => ({
          id: row.id,
          title: `RM #${row.displayNumber ?? '—'}`,
          subtitle: row.costCenter?.name || row.contract?.name || row.requester?.name || '—',
          meta: formatDate(row.createdAt),
          statusLabel: row.status === 'PENDING' ? 'Pendente' : row.status,
          pending: isPendingStatus('rm', row.status),
          raw: row,
        }));
      }
      if (activeTab === 'oc') {
        const pendingStatuses = new Set(
          ocPendingStatusesForUser({
            canCompras: canApproveOcCompras,
            canGestor: canApproveOcGestor,
            canDiretoria: canApproveOcDiretoria,
          }),
        );
        const rows = await fetchOcApprovals();
        return rows
          .filter((row: OcApprovalRow) => {
            if (phase === 'PENDING') return pendingStatuses.has(row.status);
            if (phase === 'APPROVED') return row.status === 'APPROVED';
            if (phase === 'REJECTED') return row.status === 'CANCELLED';
            return pendingStatuses.has(row.status) || ['APPROVED', 'CANCELLED'].includes(row.status);
          })
          .map((row: OcApprovalRow) => ({
            id: row.id,
            title: `OC #${row.displayNumber ?? '—'}`,
            subtitle:
              row.supplierName ||
              row.materialRequest?.costCenter?.name ||
              row.materialRequest?.requester?.name ||
              '—',
            meta: `${formatMoney(row.totalValue)} · ${formatDate(row.createdAt)}`,
            statusLabel: pendingStatuses.has(row.status) ? 'Pendente' : row.status,
            pending: pendingStatuses.has(row.status),
            raw: row,
          }));
      }
      if (activeTab === 'medicao') {
        const rows = await fetchMedicaoApprovals();
        return rows
          .filter((row: MedicaoApprovalRow) => {
            const pending = isPendingStatus('medicao', row.status);
            if (phase === 'PENDING') return pending;
            if (phase === 'APPROVED') return row.status === 'APPROVED';
            if (phase === 'REJECTED') return row.status === 'CORRECTION';
            return true;
          })
          .map((row: MedicaoApprovalRow) => ({
            id: row.id,
            title: row.empreiteiro?.name || 'Medição',
            subtitle:
              row.contratoNome ||
              row.empreiteiro?.contratoNome ||
              formatMoney(row.executedAmount),
            meta: formatDate(row.measurementDate),
            statusLabel: isPendingStatus('medicao', row.status) ? 'Pendente' : row.status,
            pending: isPendingStatus('medicao', row.status),
            raw: row,
          }));
      }
      return [];
    },
  });

  const items = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = listQuery.data || [];
    if (!term) return rows;
    return rows.filter((row) =>
      `${row.title} ${row.subtitle} ${row.meta} ${row.statusLabel}`.toLowerCase().includes(term),
    );
  }, [listQuery.data, search]);

  const invalidate = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['approvals'] }),
    ]);
  }, [queryClient]);

  const actionMutation = useMutation({
    mutationFn: async (opts: { action: 'approve' | 'reject'; item: ListItem }) => {
      const { action, item } = opts;
      if (activeTab === 'dp') {
        if (action === 'approve') await approveDpRequest(item.id, comment);
        else await rejectDpRequest(item.id, comment.trim() || 'Recusado pelo gestor');
        return;
      }
      if (activeTab === 'fuel') {
        if (action === 'approve') await approveFuelRequest(item.id, comment);
        else await rejectFuelRequest(item.id, comment.trim() || 'Recusado pelo gestor');
        return;
      }
      if (activeTab === 'fd') {
        if (action === 'approve') await approveFdRequest(item.id, comment);
        else await rejectFdRequest(item.id, comment.trim() || 'Recusado pelo gestor');
        return;
      }
      if (activeTab === 'rm') {
        if (action === 'approve') await approveRmRequest(item.id);
        else await rejectRmRequest(item.id, comment.trim() || 'Cancelado pelo gestor');
        return;
      }
      if (activeTab === 'oc') {
        const row = item.raw as OcApprovalRow;
        if (action === 'approve') {
          const next = nextOcApproveStatus(row.status);
          if (!next) throw new Error('Esta OC não pode ser aprovada nesta etapa');
          await approveOcRequest(item.id, next);
        } else {
          await rejectOcRequest(item.id, comment.trim() || 'Cancelado pelo gestor');
        }
        return;
      }
      if (activeTab === 'medicao') {
        const row = item.raw as MedicaoApprovalRow;
        const empreiteiroId = row.empreiteiroId || row.empreiteiro?.id;
        if (!empreiteiroId) throw new Error('Empreiteiro não encontrado');
        if (action === 'approve') {
          const amount = parseMoneyInput(medicaoAmount) ?? Number(row.executedAmount);
          if (!(amount > 0)) throw new Error('Informe o valor aprovado');
          await approveMedicao(empreiteiroId, item.id, amount);
        } else {
          const note = comment.trim();
          if (!note) throw new Error('Informe o motivo da devolução');
          await returnMedicao(empreiteiroId, item.id, note);
        }
      }
    },
    onSuccess: async (_data, vars) => {
      showAppToast({
        type: 'success',
        text1: vars.action === 'approve' ? 'Aprovado com sucesso' : 'Recusado com sucesso',
      });
      setSelected(null);
      setComment('');
      setMedicaoAmount('');
      await invalidate();
    },
    onError: (err: Error) => {
      showAppToast({
        type: 'error',
        text1: err.message || 'Não foi possível concluir a ação',
      });
    },
  });

  const confirmAction = (action: 'approve' | 'reject') => {
    if (!selected) return;
    if (action === 'reject' && activeTab === 'medicao' && !comment.trim()) {
      showAppToast({ type: 'error', text1: 'Informe o motivo da devolução' });
      return;
    }
    Alert.alert(
      action === 'approve' ? 'Aprovar' : 'Recusar',
      action === 'approve'
        ? 'Confirma a aprovação deste item?'
        : 'Confirma a recusa deste item?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: action === 'approve' ? 'Aprovar' : 'Recusar',
          style: action === 'approve' ? 'default' : 'destructive',
          onPress: () => actionMutation.mutate({ action, item: selected }),
        },
      ],
    );
  };

  if (permissionsLoading) {
    return (
      <View style={styles.root}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <AppHeader showBack title="Aprovações" onBack={() => navigation.goBack()} />
        <View style={styles.centered}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </View>
    );
  }

  if (!canSeeAprovacoes || tabs.length === 0) {
    return (
      <View style={styles.root}>
        <StatusBar style={isDark ? 'light' : 'dark'} />
        <AppHeader showBack title="Aprovações" onBack={() => navigation.goBack()} />
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Sem permissão</Text>
          <Text style={styles.emptyText}>
            Você não tem acesso às filas de aprovação neste momento.
          </Text>
        </View>
      </View>
    );
  }

  const counts = countsQuery.data || countsFallback;

  return (
    <View style={styles.root}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <AppHeader showBack title="Aprovações" onBack={() => navigation.goBack()} />

      <View style={styles.body}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabsRow}
        >
          {tabs.map((t) => {
            const active = t.id === activeTab;
            const Icon = t.icon;
            const badge = t.countKey ? Number(counts[t.countKey] || 0) : 0;
            return (
              <TouchableOpacity
                key={t.id}
                style={[styles.tabChip, active && styles.tabChipActive]}
                onPress={() => {
                  setTab(t.id);
                  setSelected(null);
                }}
                activeOpacity={0.75}
              >
                <Icon size={16} color={active ? '#fff' : colors.text} strokeWidth={2.2} />
                <Text style={[styles.tabChipText, active && styles.tabChipTextActive]}>
                  {t.label}
                </Text>
                {badge > 0 ? (
                  <View style={[styles.badge, active && styles.badgeActive]}>
                    <Text style={[styles.badgeText, active && styles.badgeTextActive]}>
                      {badge > 99 ? '99+' : String(badge)}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={styles.phaseRow}>
          {PHASES.map((p) => {
            const active = p.id === phase;
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.phaseChip, active && styles.phaseChipActive]}
                onPress={() => setPhase(p.id)}
                activeOpacity={0.75}
              >
                <Text style={[styles.phaseText, active && styles.phaseTextActive]}>{p.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.searchBox}>
          <Search size={16} color={colors.textSecondary} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Buscar..."
            placeholderTextColor={colors.textSecondary}
            style={styles.searchInput}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
              <X size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>

        {listQuery.isLoading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl
                refreshing={listQuery.isFetching && !listQuery.isLoading}
                onRefresh={() => {
                  void listQuery.refetch();
                  void countsQuery.refetch();
                }}
                tintColor={colors.primary}
              />
            }
            ListEmptyComponent={
              <View style={styles.centered}>
                <Text style={styles.emptyTitle}>Nada por aqui</Text>
                <Text style={styles.emptyText}>
                  Nenhuma solicitação nesta fila com o filtro atual.
                </Text>
              </View>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.card}
                activeOpacity={0.75}
                onPress={() => {
                  setSelected(item);
                  setComment('');
                  if (activeTab === 'medicao') {
                    const raw = item.raw as MedicaoApprovalRow;
                    setMedicaoAmount(
                      raw.executedAmount != null ? String(raw.executedAmount).replace('.', ',') : '',
                    );
                  }
                }}
              >
                <View style={styles.cardTop}>
                  <Text style={styles.cardTitle} numberOfLines={2}>
                    {item.title}
                  </Text>
                  <View style={[styles.statusPill, item.pending ? styles.statusPending : styles.statusDone]}>
                    <Text
                      style={[
                        styles.statusPillText,
                        item.pending ? styles.statusPendingText : styles.statusDoneText,
                      ]}
                    >
                      {item.statusLabel}
                    </Text>
                  </View>
                </View>
                <Text style={styles.cardSubtitle} numberOfLines={2}>
                  {item.subtitle}
                </Text>
                <Text style={styles.cardMeta}>{item.meta}</Text>
              </TouchableOpacity>
            )}
          />
        )}
      </View>

      <Modal
        visible={!!selected}
        transparent
        animationType="slide"
        onRequestClose={() => setSelected(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setSelected(null)}
          />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle} numberOfLines={2}>
                {selected?.title}
              </Text>
              <TouchableOpacity onPress={() => setSelected(null)} hitSlop={8}>
                <X size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.sheetBody}>
              <Text style={styles.sheetSubtitle}>{selected?.subtitle}</Text>
              <Text style={styles.sheetMeta}>{selected?.meta}</Text>

              {activeTab === 'dp' && selected ? (
                <DpDetails raw={selected.raw as DpRequest} styles={styles} />
              ) : null}
              {activeTab === 'fuel' && selected ? (
                <FuelDetails raw={selected.raw as FuelApprovalRow} styles={styles} />
              ) : null}
              {activeTab === 'medicao' && selected?.pending ? (
                <View style={styles.fieldBlock}>
                  <Text style={styles.fieldLabel}>Valor aprovado</Text>
                  <TextInput
                    value={medicaoAmount}
                    onChangeText={setMedicaoAmount}
                    keyboardType="decimal-pad"
                    placeholder="0,00"
                    placeholderTextColor={colors.textSecondary}
                    style={styles.input}
                  />
                </View>
              ) : null}

              {selected?.pending ? (
                <View style={styles.fieldBlock}>
                  <Text style={styles.fieldLabel}>
                    {activeTab === 'medicao' ? 'Motivo da devolução' : 'Comentário (opcional)'}
                  </Text>
                  <TextInput
                    value={comment}
                    onChangeText={setComment}
                    placeholder={
                      activeTab === 'medicao'
                        ? 'Obrigatório ao devolver'
                        : 'Observação para o solicitante'
                    }
                    placeholderTextColor={colors.textSecondary}
                    style={[styles.input, styles.inputMultiline]}
                    multiline
                    textAlignVertical="top"
                  />
                </View>
              ) : null}
            </ScrollView>

            {selected?.pending ? (
              <View style={styles.sheetActions}>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.rejectBtn]}
                  disabled={actionMutation.isPending}
                  onPress={() => confirmAction('reject')}
                  activeOpacity={0.8}
                >
                  <XCircle size={18} color="#fff" />
                  <Text style={styles.actionBtnText}>
                    {activeTab === 'medicao' ? 'Devolver' : 'Recusar'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionBtn, styles.approveBtn]}
                  disabled={actionMutation.isPending}
                  onPress={() => confirmAction('approve')}
                  activeOpacity={0.8}
                >
                  {actionMutation.isPending ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <CheckCircle2 size={18} color="#fff" />
                      <Text style={styles.actionBtnText}>Aprovar</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function DpDetails({
  raw,
  styles,
}: {
  raw: DpRequest;
  styles: ReturnType<typeof getStyles>;
}) {
  return (
    <View style={styles.detailBlock}>
      <DetailLine styles={styles} label="Solicitante" value={raw.employee?.user?.name || '—'} />
      <DetailLine styles={styles} label="Contrato" value={raw.contract?.name || '—'} />
      <DetailLine styles={styles} label="Centro de custo" value={raw.costCenter?.name || '—'} />
      <DetailLine styles={styles} label="Empresa" value={raw.company || '—'} />
    </View>
  );
}

function FuelDetails({
  raw,
  styles,
}: {
  raw: FuelApprovalRow;
  styles: ReturnType<typeof getStyles>;
}) {
  return (
    <View style={styles.detailBlock}>
      <DetailLine styles={styles} label="Motorista" value={raw.driverName || '—'} />
      <DetailLine styles={styles} label="Placa" value={raw.vehiclePlate || '—'} />
      <DetailLine styles={styles} label="Rota" value={raw.route || '—'} />
      <DetailLine styles={styles} label="Solicitante" value={raw.requester?.name || '—'} />
      <DetailLine styles={styles} label="Observações" value={raw.observations || '—'} />
    </View>
  );
}

function DetailLine({
  label,
  value,
  styles,
}: {
  label: string;
  value: string;
  styles: ReturnType<typeof getStyles>;
}) {
  return (
    <View style={styles.detailLine}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

function getStyles(colors: any, isDark: boolean) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: 'transparent' },
    body: { flex: 1, paddingTop: 8 },
    centered: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 28,
      paddingVertical: 40,
      gap: 8,
    },
    emptyTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
    },
    emptyText: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
    },
    tabsRow: {
      paddingHorizontal: 16,
      paddingBottom: 10,
      gap: 8,
    },
    tabChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
    },
    tabChipActive: {
      backgroundColor: colors.primary,
    },
    tabChipText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
    },
    tabChipTextActive: { color: '#fff' },
    badge: {
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      paddingHorizontal: 5,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primary,
    },
    badgeActive: { backgroundColor: 'rgba(255,255,255,0.25)' },
    badgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
    badgeTextActive: { color: '#fff' },
    phaseRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      paddingHorizontal: 16,
      marginBottom: 10,
    },
    phaseChip: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    phaseChipActive: {
      backgroundColor: isDark ? 'rgba(206,55,54,0.2)' : 'rgba(206,55,54,0.1)',
      borderColor: colors.primary,
    },
    phaseText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
    phaseTextActive: { color: colors.primary },
    searchBox: {
      marginHorizontal: 16,
      marginBottom: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: Platform.OS === 'ios' ? 10 : 6,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      color: colors.text,
      paddingVertical: 4,
    },
    listContent: {
      paddingHorizontal: 16,
      paddingBottom: 32,
      gap: 10,
      flexGrow: 1,
    },
    card: {
      borderRadius: 14,
      padding: 14,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#fff',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      gap: 6,
    },
    cardTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 10,
    },
    cardTitle: {
      flex: 1,
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
    },
    cardSubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    cardMeta: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 2,
    },
    statusPill: {
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    statusPending: {
      backgroundColor: isDark ? 'rgba(234,179,8,0.2)' : 'rgba(234,179,8,0.15)',
    },
    statusDone: {
      backgroundColor: isDark ? 'rgba(34,197,94,0.2)' : 'rgba(34,197,94,0.12)',
    },
    statusPillText: { fontSize: 11, fontWeight: '700' },
    statusPendingText: { color: isDark ? '#fde68a' : '#a16207' },
    statusDoneText: { color: isDark ? '#86efac' : '#15803d' },
    modalRoot: { flex: 1, justifyContent: 'flex-end' },
    modalBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    sheet: {
      maxHeight: '82%',
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      backgroundColor: isDark ? '#1f2937' : '#fff',
      paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    },
    sheetHandle: {
      alignSelf: 'center',
      width: 40,
      height: 4,
      borderRadius: 2,
      backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
      marginTop: 10,
      marginBottom: 8,
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingHorizontal: 18,
      paddingBottom: 8,
    },
    sheetTitle: {
      flex: 1,
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
    },
    sheetBody: {
      paddingHorizontal: 18,
      paddingBottom: 16,
      gap: 10,
    },
    sheetSubtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    sheetMeta: {
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: 4,
    },
    detailBlock: { gap: 8, marginTop: 4 },
    detailLine: { gap: 2 },
    detailLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    detailValue: { fontSize: 14, color: colors.text, lineHeight: 20 },
    fieldBlock: { gap: 6, marginTop: 8 },
    fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.text },
    input: {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: Platform.OS === 'ios' ? 12 : 8,
      fontSize: 15,
      color: colors.text,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)',
    },
    inputMultiline: { minHeight: 88 },
    sheetActions: {
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: 18,
      paddingTop: 8,
    },
    actionBtn: {
      flex: 1,
      height: 48,
      borderRadius: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    rejectBtn: { backgroundColor: '#6b7280' },
    approveBtn: { backgroundColor: colors.primary },
    actionBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  });
}
