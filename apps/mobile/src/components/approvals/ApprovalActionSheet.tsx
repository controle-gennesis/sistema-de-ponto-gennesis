import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
  Image,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Sharing from 'expo-sharing';
import { Directory, File as FsFile, Paths } from 'expo-file-system';
import { Download, Paperclip, X as XIcon } from 'lucide-react-native';
import { resolveMediaUrl } from '../../utils/resolveMediaUrl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import SheetModal from '../SheetModal';
import { showAppToast } from '../AppToast';
import { useTheme } from '../../context/ThemeContext';
import { formatDpRequestDetails } from '../../lib/formatDpRequestDetails';
import {
  destinationLabel,
  DP_TYPE_LABELS,
  dpRequestIsSentToAccounting,
  dpStatusLabel,
  fetchPayrollEmployees,
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
  type AditivoApprovalRow,
  type FuelApprovalRow,
  type FdApprovalRow,
  type MedicaoApprovalRow,
  type OcApprovalRow,
} from '../../services/approvals';
import {
  formatApprovalDate,
  formatApprovalMoney,
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

function statusColor(status: DpRequestStatus, colors: any, requestType?: string | null) {
  if (status === 'CONCLUDED' && dpRequestIsSentToAccounting(requestType)) return '#6366f1';
  if (status === 'CONCLUDED') return colors.success;
  if (status === 'CANCELLED') return colors.error;
  if (status === 'WAITING_RETURN') return colors.warning;
  if (status.startsWith('WAITING_')) return '#f97316';
  if (status === 'PENDING_DP') return '#64748b';
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
  tab: tabProp,
  item: itemProp,
  onClose,
  embedded = false,
}: Props) {
  // Ao fechar, quem chama zera o item na hora: guarda o último para a folha descer com o conteúdo.
  const lastRef = useRef({ tab: tabProp, item: itemProp });
  if (itemProp) lastRef.current = { tab: tabProp, item: itemProp };
  const { tab, item } = lastRef.current;
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => getStyles(colors, isDark), [colors, isDark]);
  const queryClient = useQueryClient();
  const [comment, setComment] = useState('');
  const [medicaoAmount, setMedicaoAmount] = useState('');

  const dpRaw = tab === 'dp' && item ? (item.raw as DpRequest) : null;
  const fuelRaw = tab === 'fuel' && item ? (item.raw as FuelApprovalRow) : null;

  const fdRaw = tab === 'fd' && item ? (item.raw as FdApprovalRow) : null;
  const [anexoImagem, setAnexoImagem] = useState<{ href: string; nome: string } | null>(null);
  const [baixandoAnexo, setBaixandoAnexo] = useState<string | null>(null);

  /** Baixa o arquivo para o celular e abre o menu de compartilhar/salvar (Salvar em Arquivos, WhatsApp, etc.). */
  const baixarAnexo = async (href: string, nome: string) => {
    setBaixandoAnexo(href);
    try {
      const limpo = (nome || 'arquivo').replace(/[\\/:*?"<>|]+/g, '-').trim() || 'arquivo';
      const dir = new Directory(Paths.cache, 'anexos-fd');
      if (!dir.exists) dir.create();
      const arquivo = await FsFile.downloadFileAsync(href, new FsFile(dir, limpo), { idempotent: true });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(arquivo.uri, { dialogTitle: limpo });
      } else {
        showAppToast({ type: 'info', text1: 'Arquivo baixado' });
      }
    } catch {
      showAppToast({ type: 'error', text1: 'Não foi possível baixar o anexo' });
    } finally {
      setBaixandoAnexo(null);
    }
  };

  /** Ver o anexo: imagem abre aqui; PDF abre no visualizador do iPhone; os demais vão direto para baixar/abrir. */
  const verAnexo = async (href: string, nome: string) => {
    const alvo = `${nome} ${href}`.toLowerCase().split('?')[0];
    if (/\.(png|jpe?g|gif|webp|heic)$/.test(alvo.trim())) {
      setAnexoImagem({ href, nome });
      return;
    }
    if (Platform.OS === 'ios' && /\.pdf$/.test(alvo.trim())) {
      try {
        await WebBrowser.openBrowserAsync(href);
        return;
      } catch {
        /* cai no download */
      }
    }
    await baixarAnexo(href, nome);
  };

  // Arquivos da FD com link (a referência interna do orçamento não é arquivo).
  const fdAnexos = useMemo(
    () =>
      (fdRaw?.anexos ?? [])
        .filter((a) => a && a.url && a.kind !== 'orcamento-ref')
        .map((a) => {
          const n = String(a.name || '').toUpperCase();
          const tipo =
            a.kind === 'orcamento' ? 'Orçamento'
            : a.kind === 'fd' ? 'Ficha de demanda'
            : a.kind === 'oc' ? 'Ordem de compra'
            : a.kind === 'outro' ? a.descricao?.trim() || 'Anexo'
            : /ORDEM\s*DE\s*COMPRA|ANEXO[_-]?OC/.test(n) ? 'Ordem de compra'
            : /FICHA\s*DE\s*DEMANDA|ANEXO[_-]?FD/.test(n) ? 'Ficha de demanda'
            : /OR[CÇ]AMENTO/.test(n) ? 'Orçamento'
            : 'Anexo';
          return { ...a, tipo };
        }),
    [fdRaw],
  );
  const aditivoRaw = tab === 'aditivo' && item ? (item.raw as AditivoApprovalRow) : null;
  const medicaoRaw = tab === 'medicao' && item ? (item.raw as MedicaoApprovalRow) : null;
  // Fotos da medição e documentos do aditivo (contrato atualizado), abertos com o mesmo leitor da FD.
  const empreitaAnexos = [
    ...(medicaoRaw?.teamPhoto?.url ? [{ url: medicaoRaw.teamPhoto.url, name: 'Foto da equipe.jpg' }] : []),
    ...(medicaoRaw?.photos ?? []),
    ...(aditivoRaw?.files ?? []),
  ].filter((a) => a && a.url);
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
    // Fechando não limpa os campos: eles continuam na tela até a folha sair.
    if (!visible || !item) return;
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

  const showMedicaoActions = !!item && tab === 'medicao' && item.pending;
  const headerTitle = !item
    ? ''
    : dpRaw
      ? `Solicitação #${dpRaw.displayNumber ?? dpRaw.id.slice(0, 8)}`
      : item.title;

  // Mesma folha das outras janelas de detalhes (SheetModal); `embedded` quando já está dentro de outra folha.
  return (
    <SheetModal visible={visible && !!itemProp} onClose={onClose} title={headerTitle} embedded={embedded}>
      {item ? (
        <View>
          {dpRaw ? (
            <>
              <View style={styles.detailGrid}>
                <DetailField
                  styles={styles}
                  label="Status"
                  value={dpStatusLabel(dpRaw.status, dpRaw.requestType)}
                  valueColor={statusColor(dpRaw.status, colors, dpRaw.requestType)}
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

          {medicaoRaw ? (
            <View style={styles.detailGrid}>
              <DetailField styles={styles} label="Contrato" value={medicaoRaw.obraContratoNome?.trim() || '—'} />
              <DetailField styles={styles} label="Serviço" value={medicaoRaw.contratoNome?.trim() || '—'} />
              {medicaoRaw.centroCustoNome?.trim() ? (
                <DetailField styles={styles} label="Centro de custo" value={medicaoRaw.centroCustoNome.trim()} />
              ) : null}
              <DetailField styles={styles} label="Entrega em" value={formatApprovalDate(medicaoRaw.workDate)} />
              <DetailField styles={styles} label="Descrição" value={medicaoRaw.description?.trim() || '—'} />
              {medicaoRaw.serviceFinance ? (
                <>
                  <DetailField
                    styles={styles}
                    label="Valor do contrato (com aditivos)"
                    value={formatApprovalMoney(medicaoRaw.serviceFinance.contractValue)}
                  />
                  <DetailField
                    styles={styles}
                    label="Já executado"
                    value={formatApprovalMoney(medicaoRaw.serviceFinance.executedTotal)}
                  />
                  <DetailField
                    styles={styles}
                    label="Já pago"
                    value={formatApprovalMoney(medicaoRaw.serviceFinance.paidTotal)}
                  />
                  <DetailField
                    styles={styles}
                    label="Saldo a executar"
                    value={formatApprovalMoney(
                      Math.max(0, medicaoRaw.serviceFinance.contractValue - medicaoRaw.serviceFinance.executedTotal),
                    )}
                  />
                  <DetailField
                    styles={styles}
                    label="Parcelas pagas"
                    value={`${medicaoRaw.serviceFinance.installmentsPaid} de ${medicaoRaw.serviceFinance.installmentsCount}`}
                  />
                </>
              ) : null}
              <DetailField styles={styles} label="Confirmado por" value={medicaoRaw.confirmedBy?.trim() || '—'} />
              <DetailField
                styles={styles}
                label="Equipe"
                value={medicaoRaw.workers?.length ? medicaoRaw.workers.map((w) => w.name).join(', ') : '—'}
              />
            </View>
          ) : null}

          {!dpRaw && !fuelRaw && !fdRaw && !aditivoRaw && !medicaoRaw ? (
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

          {aditivoRaw ? (
            <View style={styles.detailGrid}>
              <DetailField styles={styles} label="Aditivo" value={`#${aditivoRaw.number}`} />
              <DetailField
                styles={styles}
                label="Empreiteiro"
                value={aditivoRaw.empreiteiro?.name?.trim() || '—'}
              />
              <DetailField styles={styles} label="Contrato" value={aditivoRaw.obraContratoNome?.trim() || '—'} />
              <DetailField styles={styles} label="Serviço" value={aditivoRaw.serviceName?.trim() || '—'} />
              {aditivoRaw.centroCustoNome?.trim() ? (
                <DetailField styles={styles} label="Centro de custo" value={aditivoRaw.centroCustoNome.trim()} />
              ) : null}
              {aditivoRaw.paymentMode ? (
                <DetailField
                  styles={styles}
                  label="Forma de pagamento"
                  value={
                    aditivoRaw.paymentMode === 'redistribute'
                      ? 'Redistribuído nas parcelas em aberto'
                      : aditivoRaw.installments?.length
                        ? `Parcela(s) nova(s): ${aditivoRaw.installments.map((v) => formatApprovalMoney(v)).join(', ')}`
                        : 'Sem parcela nova (valor reduzido)'
                  }
                />
              ) : null}
              <DetailField
                styles={styles}
                label="Valor do aditivo"
                value={formatApprovalMoney(aditivoRaw.amount)}
              />
              <DetailField
                styles={styles}
                label="Vigência"
                value={aditivoRaw.effectiveDate?.trim() || '—'}
              />
              <DetailField styles={styles} label="Motivo" value={aditivoRaw.reason?.trim() || '—'} />
              {aditivoRaw.servicesAdded?.trim() ? (
                <DetailField styles={styles} label="Serviços incluídos" value={aditivoRaw.servicesAdded.trim()} />
              ) : null}
              {aditivoRaw.servicesRemoved?.trim() ? (
                <DetailField styles={styles} label="Serviços removidos" value={aditivoRaw.servicesRemoved.trim()} />
              ) : null}
              {aditivoRaw.createdByName?.trim() ? (
                <DetailField styles={styles} label="Lançado por" value={aditivoRaw.createdByName.trim()} />
              ) : null}
            </View>
          ) : null}

          {fdRaw ? (
            <View style={styles.detailGrid}>
              <DetailField styles={styles} label="Código da FD" value={fdRaw.codFichaDemanda?.trim() || '—'} />
              <DetailField styles={styles} label="Pedido" value={fdRaw.codigoPedido?.trim() || '—'} />
              <DetailField styles={styles} label="Contrato" value={fdRaw.contratoNome?.trim() || fdRaw.contrato?.name || '—'} />
              <DetailField styles={styles} label="Obra" value={fdRaw.obra?.trim() || '—'} />
              <DetailField
                styles={styles}
                label="Solicitante"
                value={fdRaw.solicitanteNome?.trim() || fdRaw.solicitante?.name || '—'}
              />
              <DetailField styles={styles} label="Polo" value={fdRaw.polo?.trim() || '—'} />
              <DetailField styles={styles} label="Nº Mov RM" value={fdRaw.numMovRm?.trim() || '—'} />
              <DetailField styles={styles} label="ID Mov RM" value={fdRaw.idMovRm?.trim() || '—'} />
              {fdRaw.scNumero?.trim() ? (
                <DetailField styles={styles} label="Nº da SC" value={fdRaw.scNumero.trim()} />
              ) : null}
              {fdRaw.ocId?.trim() ? (
                <DetailField styles={styles} label="ID da OC" value={fdRaw.ocId.trim()} />
              ) : null}
              <DetailField
                styles={styles}
                label="Faturamento estimado"
                value={formatApprovalMoney(Number(fdRaw.faturamentoEstimado))}
              />
              <DetailField
                styles={styles}
                label="Custo estimado"
                value={formatApprovalMoney(Number(fdRaw.custoEstimado))}
              />
              <DetailField styles={styles} label="Data/hora" value={fdRaw.dataHora?.trim() || '—'} />
              <DetailField styles={styles} label="Observação" value={fdRaw.observacao?.trim() || '—'} />
              {fdAnexos.length > 0 ? (
                <View style={styles.detailField}>
                  <Text style={styles.detailLabel}>Anexos</Text>
                  <View style={{ gap: 8, marginTop: 6 }}>
                    {fdAnexos.map((a, i) => (
                      <View key={a.id || `${a.url}-${i}`} style={styles.fdAnexoRow}>
                        <TouchableOpacity
                          style={styles.fdAnexoMain}
                          activeOpacity={0.7}
                          onPress={() => {
                            const href = resolveMediaUrl(a.url);
                            if (href) void verAnexo(href, a.name?.trim() || 'arquivo');
                          }}
                        >
                          <Paperclip size={16} color={colors.textSecondary} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.fdAnexoName} numberOfLines={2}>
                              {a.name?.trim() || 'Arquivo'}
                            </Text>
                            <Text style={styles.fdAnexoKind}>{a.tipo}</Text>
                          </View>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.fdAnexoDownload}
                          activeOpacity={0.7}
                          accessibilityLabel="Baixar anexo"
                          disabled={baixandoAnexo != null}
                          onPress={() => {
                            const href = resolveMediaUrl(a.url);
                            if (href) void baixarAnexo(href, a.name?.trim() || 'arquivo');
                          }}
                        >
                          {baixandoAnexo === resolveMediaUrl(a.url) ? (
                            <ActivityIndicator size="small" color={colors.primary} />
                          ) : (
                            <Download size={18} color={colors.primary} />
                          )}
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                  <Modal
                    visible={anexoImagem != null}
                    transparent
                    animationType="fade"
                    onRequestClose={() => setAnexoImagem(null)}
                  >
                    <View style={styles.fdImgBackdrop}>
                      <View style={styles.fdImgBar}>
                        <Text style={styles.fdImgTitle} numberOfLines={1}>
                          {anexoImagem?.nome}
                        </Text>
                        <TouchableOpacity
                          style={styles.fdImgBtn}
                          accessibilityLabel="Baixar"
                          onPress={() => anexoImagem && void baixarAnexo(anexoImagem.href, anexoImagem.nome)}
                        >
                          {baixandoAnexo != null ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <Download size={20} color="#fff" />
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.fdImgBtn}
                          accessibilityLabel="Fechar"
                          onPress={() => setAnexoImagem(null)}
                        >
                          <XIcon size={22} color="#fff" />
                        </TouchableOpacity>
                      </View>
                      {anexoImagem ? (
                        <Image source={{ uri: anexoImagem.href }} style={styles.fdImg} resizeMode="contain" />
                      ) : null}
                    </View>
                  </Modal>
                </View>
              ) : null}
            </View>
          ) : null}

          {empreitaAnexos.length > 0 ? (
            <View style={{ marginTop: 12, gap: 8 }}>
              <Text style={styles.detailLabel}>{aditivoRaw ? 'Contrato atualizado / anexos' : 'Fotos e anexos'}</Text>
              {empreitaAnexos.map((a, i) => (
                <TouchableOpacity
                  key={`${a.url}-${i}`}
                  style={styles.fdAnexoRow}
                  activeOpacity={0.7}
                  disabled={baixandoAnexo != null}
                  onPress={() => {
                    const href = resolveMediaUrl(a.url);
                    if (href) void verAnexo(href, a.name?.trim() || 'arquivo');
                  }}
                >
                  <View style={styles.fdAnexoMain}>
                    <Paperclip size={16} color={colors.textSecondary} />
                    <Text style={[styles.fdAnexoName, { flex: 1 }]} numberOfLines={2}>
                      {a.name?.trim() || 'Arquivo'}
                    </Text>
                  </View>
                  <View style={styles.fdAnexoDownload}>
                    {baixandoAnexo === resolveMediaUrl(a.url) ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : (
                      <Download size={18} color={colors.primary} />
                    )}
                  </View>
                </TouchableOpacity>
              ))}
              <Modal
                visible={anexoImagem != null}
                transparent
                animationType="fade"
                onRequestClose={() => setAnexoImagem(null)}
              >
                <View style={styles.fdImgBackdrop}>
                  <View style={styles.fdImgBar}>
                    <Text style={styles.fdImgTitle} numberOfLines={1}>
                      {anexoImagem?.nome}
                    </Text>
                    <TouchableOpacity
                      style={styles.fdImgBtn}
                      accessibilityLabel="Fechar"
                      onPress={() => setAnexoImagem(null)}
                    >
                      <XIcon size={22} color="#fff" />
                    </TouchableOpacity>
                  </View>
                  {anexoImagem ? (
                    <Image source={{ uri: anexoImagem.href }} style={styles.fdImg} resizeMode="contain" />
                  ) : null}
                </View>
              </Modal>
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
      ) : null}
    </SheetModal>
  );
}

function getStyles(colors: any, isDark: boolean) {
  return StyleSheet.create({
    detailGrid: { gap: 12 },
    fdAnexoMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingLeft: 12 },
    fdAnexoDownload: { width: 46, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
    fdAnexoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#f8fafc',
    },
    fdImgBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.94)', paddingTop: 54 },
    fdImgBar: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingBottom: 10 },
    fdImgTitle: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '600' },
    fdImgBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    fdImg: { flex: 1, width: '100%' },
    fdAnexoName: { fontSize: 14, fontWeight: '600', color: colors.text },
    fdAnexoKind: { fontSize: 11, color: colors.textSecondary, marginTop: 1 },
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
      paddingTop: 16,
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
