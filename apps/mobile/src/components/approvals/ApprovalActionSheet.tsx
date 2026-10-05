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
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, X, XCircle } from 'lucide-react-native';
import { showAppToast } from '../AppToast';
import { useTheme } from '../../context/ThemeContext';
import type { DpRequest } from '../../services/dpRequests';
import {
  approveDpRequest,
  approveFdRequest,
  approveFuelRequest,
  approveMedicao,
  approveOcRequest,
  approveRmRequest,
  nextOcApproveStatus,
  rejectDpRequest,
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
};

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

export default function ApprovalActionSheet({ visible, tab, item, onClose }: Props) {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const queryClient = useQueryClient();
  const [comment, setComment] = useState('');
  const [medicaoAmount, setMedicaoAmount] = useState('');

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

      if (tab === 'dp') {
        if (action === 'approve') await approveDpRequest(item.id, comment);
        else await rejectDpRequest(item.id, comment.trim() || 'Recusado pelo gestor');
        return;
      }
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

  const dpRaw = tab === 'dp' && item ? (item.raw as DpRequest) : null;
  const fuelRaw = tab === 'fuel' && item ? (item.raw as FuelApprovalRow) : null;

  return (
    <Modal visible={visible && !!item} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.modalRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle} numberOfLines={2}>
              {item?.title}
            </Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <X size={20} color={colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
            <Text style={styles.sheetSubtitle}>{item?.subtitle}</Text>
            <Text style={styles.sheetMeta}>{item?.meta}</Text>

            {dpRaw ? (
              <View style={styles.detailBlock}>
                <DetailLine
                  styles={styles}
                  label="Solicitante"
                  value={dpRaw.employee?.user?.name || '—'}
                />
                <DetailLine styles={styles} label="Contrato" value={dpRaw.contract?.name || '—'} />
                <DetailLine
                  styles={styles}
                  label="Centro de custo"
                  value={dpRaw.costCenter?.name || '—'}
                />
                <DetailLine styles={styles} label="Empresa" value={dpRaw.company || '—'} />
              </View>
            ) : null}

            {fuelRaw ? (
              <View style={styles.detailBlock}>
                <DetailLine styles={styles} label="Motorista" value={fuelRaw.driverName || '—'} />
                <DetailLine styles={styles} label="Placa" value={fuelRaw.vehiclePlate || '—'} />
                <DetailLine styles={styles} label="Rota" value={fuelRaw.route || '—'} />
                <DetailLine
                  styles={styles}
                  label="Solicitante"
                  value={fuelRaw.requester?.name || '—'}
                />
                <DetailLine
                  styles={styles}
                  label="Observações"
                  value={fuelRaw.observations || '—'}
                />
              </View>
            ) : null}

            {tab === 'medicao' && item?.pending ? (
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

            {item?.pending ? (
              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>
                  {tab === 'medicao' ? 'Motivo da devolução' : 'Comentário (opcional)'}
                </Text>
                <TextInput
                  value={comment}
                  onChangeText={setComment}
                  placeholder={
                    tab === 'medicao'
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

          {item?.pending ? (
            <View style={styles.sheetActions}>
              <TouchableOpacity
                style={[styles.actionBtn, styles.rejectBtn]}
                disabled={actionMutation.isPending}
                onPress={() => confirmAction('reject')}
                activeOpacity={0.8}
              >
                <XCircle size={18} color="#fff" />
                <Text style={styles.actionBtnText}>
                  {tab === 'medicao' ? 'Devolver' : 'Recusar'}
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
  );
}

function getStyles(colors: any, isDark: boolean) {
  return StyleSheet.create({
    modalRoot: { flex: 1, justifyContent: 'flex-end' },
    modalBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    sheet: {
      maxHeight: '82%',
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      backgroundColor: isDark ? colors.card : '#fff',
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
      paddingHorizontal: 20,
      paddingBottom: 8,
    },
    sheetTitle: {
      flex: 1,
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
    },
    sheetBody: {
      paddingHorizontal: 20,
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
      paddingHorizontal: 20,
      paddingTop: 8,
    },
    actionBtn: {
      flex: 1,
      height: 48,
      borderRadius: 14,
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
