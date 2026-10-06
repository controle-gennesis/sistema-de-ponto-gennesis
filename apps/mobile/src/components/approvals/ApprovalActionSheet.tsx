import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react-native';
import { showAppToast } from '../AppToast';
import { useTheme } from '../../context/ThemeContext';
import { formatDpRequestDetails } from '../../lib/formatDpRequestDetails';
import {
  destinationLabel,
  DP_TYPE_LABELS,
  fetchPayrollEmployees,
  STATUS_LABELS,
  URGENCY_LABELS,
  type DpRequest,
  type DpRequestStatus,
} from '../../services/dpRequests';
import {
  approveFdRequest,
  approveFuelRequest,
  approveMedicao,
  approveOcRequest,
  approveRmRequest,
  nextOcApproveStatus,
  rejectFdRequest,
  rejectFuelRequest,
  rejectOcRequest,
  rejectRmRequest,
  returnMedicao,
  type FuelApprovalRow,
  type MedicaoApprovalRow,
  type OcApprovalRow,
} from '../../services/approvals';
import {
  parseApprovalMoneyInput,
  type ApprovalListItem,
  type ApprovalTabId,
} from '../../lib/approvalsHome';

type Props = {
  visible: boolean;
  tab: ApprovalTabId | null;
  item: ApprovalListItem | null;
  onClose: () => void;
  /** Quando true, renderiza overlay (sem Modal) — evita ficar atrás de outro Modal. */
  embedded?: boolean;
};

function statusColor(status: DpRequestStatus, colors: any) {
  if (status === 'CONCLUDED') return colors.success;
  if (status === 'CANCELLED') return colors.error;
  if (status === 'WAITING_RETURN') return colors.warning;
  if (status.startsWith('WAITING_')) return '#f97316';
  if (status === 'IN_FINANCEIRO') return '#6366f1';
  return colors.warning;
}

function DetailField({
  label,
  value,
  valueColor,
  styles,
}: {
  label: string;
  value: string;
  valueColor?: string;
  styles: ReturnType<typeof getStyles>;
}) {
  return (
    <View style={styles.detailField}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

export default function ApprovalActionSheet({
  visible,
  tab,
  item,
  onClose,
  embedded = false,
}: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const queryClient = useQueryClient();
  const [comment, setComment] = useState('');
  const [medicaoAmount, setMedicaoAmount] = useState('');

  const dpRaw = tab === 'dp' && item ? (item.raw as DpRequest) : null;
  const fuelRaw = tab === 'fuel' && item ? (item.raw as FuelApprovalRow) : null;

  const employeesQuery = useQuery({
    queryKey: ['payroll-employees'],
    queryFn: fetchPayrollEmployees,
    enabled: visible && !!dpRaw,
    staleTime: 60_000,
  });

  const employeeNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const emp of employeesQuery.data || []) {
      if (emp.id) map.set(emp.id, emp.name || emp.id);
    }
    return map;
  }, [employeesQuery.data]);

  const detailPreview = useMemo(() => {
    if (!dpRaw) return null;
    return formatDpRequestDetails(
      dpRaw.requestType,
      dpRaw.details ?? null,
      employeeNameById,
    );
  }, [dpRaw, employeeNameById]);

  useEffect(() => {
    if (!visible || !item) {
      setComment('');
      setMedicaoAmount('');
      return;
    }
    setComment('');
    if (tab === 'medicao') {
      const raw = item.raw as MedicaoApprovalRow;
      setMedicaoAmount(
        raw.executedAmount != null ? String(raw.executedAmount).replace('.', ',') : '',
      );
    } else {
      setMedicaoAmount('');
    }
  }, [visible, item, tab]);

  const actionMutation = useMutation({
    mutationFn: async (opts: { action: 'approve' | 'reject' }) => {
      if (!item || !tab) throw new Error('Item inválido');
      const { action } = opts;

      if (tab === 'fuel') {
        if (action === 'approve') await approveFuelRequest(item.id, comment);
        else await rejectFuelRequest(item.id, comment.trim() || 'Recusado pelo gestor');
        return;
      }
      if (tab === 'fd') {
        if (action === 'approve') await approveFdRequest(item.id, comment);
        else await rejectFdRequest(item.id, comment.trim() || 'Recusado pelo gestor');
        return;
      }
      if (tab === 'rm') {
        if (action === 'approve') await approveRmRequest(item.id);
        else await rejectRmRequest(item.id, comment.trim() || 'Cancelado pelo gestor');
        return;
      }
      if (tab === 'oc') {
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
      if (tab === 'medicao') {
        const row = item.raw as MedicaoApprovalRow;
        const empreiteiroId = row.empreiteiroId || row.empreiteiro?.id;
        if (!empreiteiroId) throw new Error('Empreiteiro não encontrado');
        if (action === 'approve') {
          const amount = parseApprovalMoneyInput(medicaoAmount) ?? Number(row.executedAmount);
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
      onClose();
      await queryClient.invalidateQueries({ queryKey: ['approvals'] });
    },
    onError: (err: Error) => {
      showAppToast({
        type: 'error',
        text1: err.message || 'Não foi possível concluir a ação',
      });
    },
  });

  const confirmAction = (action: 'approve' | 'reject') => {
    if (!item || !tab) return;
    if (action === 'reject' && tab === 'medicao' && !comment.trim()) {
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
          onPress: () => actionMutation.mutate({ action }),
        },
      ],
    );
  };

  if (!visible || !item) return null;

  const showMedicaoActions = tab === 'medicao' && item.pending;
  const headerTitle = dpRaw
    ? `Solicitação #${dpRaw.displayNumber ?? dpRaw.id.slice(0, 8)}`
    : item.title;
  const headerSubtitle = dpRaw
    ? STATUS_LABELS[dpRaw.status] || dpRaw.status
    : item.subtitle;

  const sheet = (
    <View style={[styles.detailSheet, { backgroundColor: colors.card }]}>
      <View style={styles.detailSheetHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.detailSheetTitle} numberOfLines={2}>
            {headerTitle}
          </Text>
          <Text style={styles.detailSheetSubtitle} numberOfLines={2}>
            {headerSubtitle}
          </Text>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={6}>
          <X size={18} color={colors.text} strokeWidth={2.2} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        bounces={false}
        keyboardShouldPersistTaps="handled"
      >
        {dpRaw ? (
          <>
            <View style={styles.detailGrid}>
              <DetailField
                styles={styles}
                label="Status"
                value={STATUS_LABELS[dpRaw.status] || dpRaw.status}
                valueColor={statusColor(dpRaw.status, colors)}
              />
              <DetailField
                styles={styles}
                label="Tipo"
                value={DP_TYPE_LABELS[dpRaw.requestType] || dpRaw.requestType}
              />
              <DetailField
                styles={styles}
                label="Destino"
                value={destinationLabel(dpRaw.requestType)}
              />
              <DetailField
                styles={styles}
                label="Urgência"
                value={URGENCY_LABELS[dpRaw.urgency] || dpRaw.urgency}
              />
              <DetailField
                styles={styles}
                label="Solicitante"
                value={dpRaw.employee?.user?.name || '—'}
              />
              <DetailField
                styles={styles}
                label="Contrato"
                value={dpRaw.costCenter?.name || dpRaw.contract?.name || '—'}
              />
              <DetailField styles={styles} label="Empresa" value={dpRaw.company || '—'} />
              <DetailField styles={styles} label="Polo" value={dpRaw.polo || '—'} />
              {dpRaw.dpFeedback ? (
                <DetailField styles={styles} label="Feedback" value={dpRaw.dpFeedback} />
              ) : null}
              {dpRaw.requesterReturnComment ? (
                <DetailField
                  styles={styles}
                  label="Resposta do solicitante"
                  value={dpRaw.requesterReturnComment}
                />
              ) : null}
            </View>

            {detailPreview && detailPreview.items.length > 0 ? (
              <View style={styles.detailsSection}>
                <Text style={styles.detailsSectionTitle}>{detailPreview.sectionTitle}</Text>
                {detailPreview.items.map((row, index) => (
                  <View
                    key={`${row.title}-${index}`}
                    style={[
                      styles.detailsItem,
                      {
                        borderLeftColor: isDark
                          ? 'rgba(255,255,255,0.18)'
                          : 'rgba(15,23,42,0.12)',
                      },
                    ]}
                  >
                    <Text style={styles.detailsItemTitle}>{row.title}</Text>
                    <Text style={styles.detailsItemSubtitle}>{row.subtitle}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        ) : null}

        {fuelRaw ? (
          <View style={styles.detailGrid}>
            <DetailField styles={styles} label="Motorista" value={fuelRaw.driverName || '—'} />
            <DetailField styles={styles} label="Rota" value={fuelRaw.route || '—'} />
            <DetailField
              styles={styles}
              label="Solicitante"
              value={fuelRaw.requester?.name || '—'}
            />
            <DetailField
              styles={styles}
              label="Observações"
              value={fuelRaw.observations || '—'}
            />
            {item.meta ? (
              <DetailField styles={styles} label="Info" value={item.meta} />
            ) : null}
          </View>
        ) : null}

        {!dpRaw && !fuelRaw ? (
          <View style={styles.detailGrid}>
            {item.subtitle ? (
              <DetailField styles={styles} label="Detalhe" value={item.subtitle} />
            ) : null}
            {item.meta ? <DetailField styles={styles} label="Info" value={item.meta} /> : null}
            {item.statusLabel ? (
              <DetailField styles={styles} label="Status" value={item.statusLabel} />
            ) : null}
          </View>
        ) : null}

        {showMedicaoActions ? (
          <>
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
            <View style={styles.fieldBlock}>
              <Text style={styles.fieldLabel}>Motivo da devolução</Text>
              <TextInput
                value={comment}
                onChangeText={setComment}
                placeholder="Obrigatório ao devolver"
                placeholderTextColor={colors.textSecondary}
                style={[styles.input, styles.inputMultiline]}
                multiline
                textAlignVertical="top"
              />
            </View>
          </>
        ) : null}
      </ScrollView>

      {showMedicaoActions ? (
        <View style={styles.sheetActions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.rejectBtn]}
            disabled={actionMutation.isPending}
            onPress={() => confirmAction('reject')}
            activeOpacity={0.8}
          >
            <Text style={styles.actionBtnText}>Devolver</Text>
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
              <Text style={styles.actionBtnText}>Aprovar</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );

  if (embedded) {
    return (
      <View style={layout.embeddedRoot}>
        <TouchableOpacity style={layout.modalBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={layout.embeddedSheetWrap} pointerEvents="box-none">
          {sheet}
        </View>
      </View>
    );
  }

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={layout.detailOverlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={onClose} />
        {sheet}
      </KeyboardAvoidingView>
    </Modal>
  );
}

// Layout fora do useMemo: o Fast Refresh preserva o memo e deixaria chaves novas undefined.
const layout = StyleSheet.create({
  detailOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
    padding: 16,
    paddingBottom: 28,
  },
  embeddedRoot: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1100,
    elevation: 1100,
  },
  embeddedSheetWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    padding: 16,
    paddingBottom: 28,
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
});

function getStyles(colors: any, isDark: boolean) {
  return StyleSheet.create({
    detailSheet: {
      borderRadius: 20,
      padding: 18,
      gap: 12,
      maxHeight: '88%',
    },
    detailSheetHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      marginBottom: 4,
    },
    detailSheetTitle: {
      fontSize: 17,
      fontWeight: '700',
      letterSpacing: -0.3,
      color: colors.text,
    },
    detailSheetSubtitle: {
      fontSize: 13,
      fontWeight: '500',
      marginTop: 2,
      color: colors.textSecondary,
    },
    closeBtn: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scroll: { maxHeight: 520 },
    detailGrid: { gap: 12 },
    detailField: { gap: 2 },
    detailLabel: {
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.3,
      color: colors.textSecondary,
    },
    detailValue: {
      fontSize: 14,
      fontWeight: '600',
      lineHeight: 20,
      color: colors.text,
    },
    detailsSection: {
      marginTop: 14,
      borderRadius: 14,
      padding: 12,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.03)',
      gap: 10,
    },
    detailsSectionTitle: {
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: -0.2,
      color: colors.text,
    },
    detailsItem: {
      borderLeftWidth: 2,
      paddingLeft: 10,
      paddingVertical: 2,
      gap: 2,
    },
    detailsItemTitle: {
      fontSize: 14,
      fontWeight: '700',
      letterSpacing: -0.2,
      color: colors.text,
    },
    detailsItemSubtitle: {
      fontSize: 13,
      fontWeight: '500',
      lineHeight: 18,
      color: colors.textSecondary,
    },
    fieldBlock: { gap: 6, marginTop: 12 },
    fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.text },
    input: {
      borderWidth: StyleSheet.hairlineWidth * 1.5,
      borderColor: isDark ? 'transparent' : 'rgba(15, 23, 42, 0.08)',
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: Platform.OS === 'ios' ? 12 : 8,
      fontSize: 15,
      color: colors.text,
      backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : colors.surface,
    },
    inputMultiline: { minHeight: 88 },
    sheetActions: {
      flexDirection: 'row',
      gap: 10,
      paddingTop: 4,
    },
    actionBtn: {
      flex: 1,
      height: 48,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rejectBtn: { backgroundColor: isDark ? '#b91c1c' : '#dc2626' },
    approveBtn: { backgroundColor: isDark ? '#15803d' : '#16a34a' },
    actionBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  });
}
