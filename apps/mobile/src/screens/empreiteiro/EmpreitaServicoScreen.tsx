import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  AlignLeft,
  Briefcase,
  Building2,
  Camera,
  CalendarDays,
  ChevronRight,
  ClipboardList,
  FileText,
  IdCard,
  MapPin,
  MoreVertical,
  Phone,
  Users,
  Wallet,
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import {
  fetchEmpreiteiro,
  fetchMeasurements,
  formatDateBr,
  formatMoney,
  maskCpf,
  maskPhone,
  saveServiceTeam,
  statusMedicao,
  statusServico,
  type EmpreiteiroMember,
  type DailyMeasurement,
} from '../../services/empreiteiros';
import { ServiceIcon } from './ServiceIcon';
import {
  useCardStyle,
  Avatar,
  Badge,
  EmptyState,
  EmpreiteiroHeader,
  InfoList,
  ListHeading,
  ListToolbar,
  SummaryCard,
  UnderlineTabs,
} from './EmpreiteiroUi';
import MedicaoDetalheModal from './MedicaoDetalheModal';
import MedicaoFormModal from './MedicaoFormModal';
import { resolveMediaUrl } from '../../utils/resolveMediaUrl';
import PessoaModal, { type PessoaForm } from './PessoaModal';
import type { RootStackParamList } from '../../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'EmpreitaServico'>;

type Aba = 'medicoes' | 'equipe' | 'dados';

const PESSOA_VAZIA: PessoaForm = { name: '', role: '', phone: '', document: '', photo: null };

export default function EmpreitaServicoScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const cardBox = useCardStyle();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const empreiteiroId = user?.empreiteiro?.id ?? '';
  const { linkId } = route.params;
  const [aba, setAba] = useState<Aba>('medicoes');
  const [buscaMedicao, setBuscaMedicao] = useState('');
  const [buscaEquipe, setBuscaEquipe] = useState('');
  const [medicaoAberta, setMedicaoAberta] = useState(false);
  const [medicaoDetalhe, setMedicaoDetalhe] = useState<DailyMeasurement | null>(null);
  const [pessoaModal, setPessoaModal] = useState<{ index: number | null } | null>(null);

  const empreiteiroQuery = useQuery({
    queryKey: ['empreiteiro-mobile', empreiteiroId],
    queryFn: () => fetchEmpreiteiro(empreiteiroId),
    enabled: Boolean(empreiteiroId),
  });
  const servico = empreiteiroQuery.data?.contracts?.find((c) => c.id === linkId);

  const medicoesQuery = useQuery({
    queryKey: ['empreiteiro-mobile-medicoes', empreiteiroId],
    queryFn: () => fetchMeasurements(empreiteiroId),
    enabled: Boolean(empreiteiroId),
  });
  const medicoes = useMemo(
    () => (medicoesQuery.data ?? []).filter((m) => m.contractId === linkId),
    [medicoesQuery.data, linkId]
  );

  const equipe: EmpreiteiroMember[] = servico?.team ?? [];
  const norm = (v: unknown) =>
    String(v ?? '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  const medicoesFiltradas = medicoes.filter((m) => {
    const q = norm(buscaMedicao.trim());
    if (!q) return true;
    return norm([m.description, formatDateBr(m.workDate), statusMedicao(m.status).label].join(' ')).includes(q);
  });
  // Mantém o índice original: editar/remover usa a posição na equipe completa.
  const equipeFiltrada = equipe
    .map((m, i) => ({ m, i }))
    .filter(({ m }) => {
      const q = norm(buscaEquipe.trim());
      if (!q) return true;
      return norm([m.name, m.role, m.document, m.phone].join(' ')).includes(q);
    });

  const salvarEquipe = useMutation({
    mutationFn: async (nova: EmpreiteiroMember[]) => {
      await saveServiceTeam(
        empreiteiroId,
        linkId,
        nova.map((m) => ({
          name: m.name.trim(),
          role: m.role.trim(),
          phone: String(m.phone ?? '').replace(/\D/g, ''),
          document: String(m.document ?? '').replace(/\D/g, ''),
          photo: m.photoUrl ?? null,
        }))
      );
    },
    onSuccess: () => {
      setPessoaModal(null);
      void queryClient.invalidateQueries({ queryKey: ['empreiteiro-mobile', empreiteiroId] });
    },
    onError: (error) => {
      Alert.alert('Equipe', error instanceof Error ? error.message : 'Não foi possível salvar a equipe.');
    },
  });

  const aoSalvarPessoa = (pessoa: PessoaForm) => {
    const index = pessoaModal?.index ?? null;
    const atual = equipe[index ?? -1];
    const nova: EmpreiteiroMember = {
      name: pessoa.name,
      role: pessoa.role,
      phone: pessoa.phone,
      document: pessoa.document,
      photoUrl: pessoa.photo ?? null,
    };
    const lista = index === null ? [...equipe, nova] : equipe.map((m, i) => (i === index ? { ...m, ...nova } : m));
    salvarEquipe.mutate(lista);
  };

  const acoesPessoa = (index: number) => {
    Alert.alert(equipe[index]?.name || 'Pessoa', undefined, [
      { text: 'Editar', onPress: () => setPessoaModal({ index }) },
      { text: 'Remover', style: 'destructive', onPress: () => removerPessoa(index) },
      { text: 'Cancelar', style: 'cancel' },
    ]);
  };

  const removerPessoa = (index: number) => {
    Alert.alert('Remover pessoa', 'Remover esta pessoa da equipe do serviço?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Remover',
        style: 'destructive',
        onPress: () => salvarEquipe.mutate(equipe.filter((_, i) => i !== index)),
      },
    ]);
  };

  const carregando = empreiteiroQuery.isLoading;
  const valor = servico?.currentValue ?? servico?.plannedValue ?? 0;
  const executado = servico?.executedAmountTotal ?? 0;
  const pago = (servico?.installments ?? [])
    .filter((p) => String(p.status || '').toUpperCase() === 'PAID')
    .reduce((soma, p) => soma + (Number(p.amount) || 0), 0);
  const pct = valor > 0 ? Math.min(100, Math.round((executado / valor) * 100)) : null;
  const st = statusServico(servico?.status);
  const nomeServico = servico?.contratoNome || servico?.name || 'Contrato de serviço';
  const mesmoTexto = (x?: string | null) => String(x ?? '').trim().toLowerCase();
  // Descrição igual ao nome só repete a informação.
  const descricao =
    servico?.description &&
    mesmoTexto(servico.description) !== mesmoTexto(servico.contratoNome) &&
    mesmoTexto(servico.description) !== mesmoTexto(servico.name)
      ? servico.description
      : null;

  return (
    <View style={styles.root}>
      <EmpreiteiroHeader title="Contrato de Serviço" onBack={() => navigation.goBack()} />
      {carregando ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : !servico ? (
        <View style={styles.center}>
          <Text style={{ color: colors.textSecondary }}>Serviço não encontrado.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={empreiteiroQuery.isRefetching || medicoesQuery.isRefetching}
              onRefresh={() => {
                void empreiteiroQuery.refetch();
                void medicoesQuery.refetch();
              }}
            />
          }
        >
          <View style={styles.topRow}>
            <ServiceIcon name={servico.iconName} color={servico.iconColor} size={56} />
            <View style={styles.topInfo}>
              <View style={styles.nameRow}>
                <Text style={[styles.name, { color: colors.text }]} numberOfLines={2}>
                  {nomeServico}
                </Text>
                <Badge label={st.label} tone={st.tone} />
              </View>
              {descricao ? (
                <Text style={[styles.topMetaText, { color: colors.textSecondary, marginTop: 4 }]} numberOfLines={2}>
                  {descricao}
                </Text>
              ) : null}
            </View>
          </View>
          <View style={[styles.topMeta, { flexDirection: 'row', flexWrap: 'wrap', columnGap: 18, rowGap: 6 }]}>
            {servico.centroCustoNome ? (
              <View style={styles.topMetaItem}>
                <Building2 size={15} color={colors.textSecondary} strokeWidth={1.9} />
                <Text style={[styles.topMetaText, { color: colors.textSecondary }]}>{servico.centroCustoNome}</Text>
              </View>
            ) : null}
            <View style={styles.topMetaItem}>
              <CalendarDays size={15} color={colors.textSecondary} strokeWidth={1.9} />
              <Text style={[styles.topMetaText, { color: colors.textSecondary }]}>
                {formatDateBr(servico.startDate)} à {formatDateBr(servico.endDate)}
              </Text>
            </View>
          </View>

          <SummaryCard
            items={[
              { label: 'Valor', value: formatMoney(valor) },
              { label: 'Pago', value: formatMoney(pago) },
            ]}
            progress={pct}
            progressLabel={pct == null ? '—' : `${pct}%`}
          />

          <UnderlineTabs
            value={aba}
            onChange={setAba}
            tabs={[
              { id: 'medicoes', label: 'Medições' },
              { id: 'equipe', label: 'Equipe' },
              { id: 'dados', label: 'Dados' },
            ]}
          />

          {aba === 'medicoes' ? (
            <View>
              <ListToolbar
                value={buscaMedicao}
                onChange={setBuscaMedicao}
                placeholder="Buscar entrega, status..."
                onAdd={() => setMedicaoAberta(true)}
                addLabel="Nova medição de entrega"
              />
              <ListHeading title="Medições de Entrega" count={medicoesFiltradas.length} />
              {medicoesQuery.isLoading ? (
                <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
              ) : medicoesFiltradas.length === 0 ? (
                <EmptyState
                  icon={ClipboardList}
                  title="Nenhuma entrega"
                  text="Toque no + para registrar a primeira medição de entrega."
                />
              ) : (
                <View style={{ gap: 10 }}>
                  {medicoesFiltradas.map((m) => {
                    const sm = statusMedicao(m.status);
                    const devolvida = String(m.status).toUpperCase() === 'CORRECTION';
                    const capa = resolveMediaUrl(m.teamPhoto?.url ?? m.photos?.[0]?.url);
                    return (
                      <TouchableOpacity
                        key={m.id}
                        activeOpacity={0.8}
                        onPress={() => setMedicaoDetalhe(m)}
                        style={[styles.card, cardBox, { borderWidth: 0, shadowOpacity: 0, shadowRadius: 0, elevation: 0, gap: 12 }]}
                      >
                        <View style={styles.medTopo}>
                          <View style={[styles.medCapa, { backgroundColor: colors.border }]}>
                            {capa ? (
                              // A foto tirada pelo web traz uma faixa de carimbo embaixo: a miniatura mostra só a parte de cima.
                              <Image source={{ uri: capa }} style={styles.medCapaImg} resizeMode="cover" />
                            ) : (
                              <View style={styles.medCapaVazia}>
                                <Camera size={22} color={colors.textSecondary} strokeWidth={1.8} />
                              </View>
                            )}
                          </View>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={[styles.medDataText, { color: colors.text }]}>{formatDateBr(m.workDate)}</Text>
                            <Text
                              style={[styles.medDescricao, { color: colors.textSecondary, marginTop: 4 }]}
                              numberOfLines={2}
                            >
                              {m.description || 'Sem descrição'}
                            </Text>
                          </View>
                          <ChevronRight size={20} color={colors.textSecondary} />
                        </View>
                        {devolvida && m.correctionNote ? (
                          <Text style={styles.medDevolvida} numberOfLines={2}>
                            Devolvida: {m.correctionNote}
                          </Text>
                        ) : null}
                        <View style={[styles.medDivider, { backgroundColor: colors.border }]} />
                        <View style={styles.cardRow}>
                          <View style={styles.medData}>
                            <Camera size={14} color={colors.textSecondary} strokeWidth={1.9} />
                            <Text style={[styles.medRodapeText, { color: colors.textSecondary }]}>
                              {m.photos?.length ?? 0} {(m.photos?.length ?? 0) === 1 ? 'foto' : 'fotos'}
                            </Text>
                          </View>
                          <View style={styles.medData}>
                            <Users size={14} color={colors.textSecondary} strokeWidth={1.9} />
                            <Text style={[styles.medRodapeText, { color: colors.textSecondary }]}>
                              {m.workers?.length ?? 0} {(m.workers?.length ?? 0) === 1 ? 'pessoa' : 'pessoas'}
                            </Text>
                          </View>
                        </View>
                        <View style={styles.cardRow}>
                          <Badge label={sm.label} tone={sm.tone} />
                          {Number(m.executedAmount) > 0 ? (
                            <Text style={[styles.medValor, { color: colors.text }]} numberOfLines={1}>
                              {formatMoney(m.executedAmount)}
                            </Text>
                          ) : null}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          ) : null}

          {aba === 'equipe' ? (
            <View>
              <ListToolbar
                value={buscaEquipe}
                onChange={setBuscaEquipe}
                placeholder="Buscar nome, função, CPF..."
                onAdd={() => setPessoaModal({ index: null })}
                addLabel="Adicionar pessoa"
              />
              <ListHeading title="Equipe do Serviço" count={equipeFiltrada.length} />
              {equipeFiltrada.length === 0 ? (
                <EmptyState
                  icon={Users}
                  title="Nenhuma pessoa"
                  text="Toque no + para cadastrar a primeira pessoa da equipe."
                />
              ) : (
                <View style={{ gap: 10 }}>
                  {equipeFiltrada.map(({ m, i }) => (
                    <View key={m.id ?? `${m.name}-${i}`} style={[styles.pessoa, cardBox, { borderWidth: 0, shadowOpacity: 0, shadowRadius: 0, elevation: 0 }]}>
                      <Avatar uri={m.photoUrl} size={52} />
                      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                        <View style={styles.pessoaTitulo}>
                          <Text style={[styles.pessoaNome, { color: colors.text }]} numberOfLines={1}>
                            {m.name}
                          </Text>
                          {m.role ? (
                            <View style={[styles.pessoaRole, { backgroundColor: colors.iconBackground }]}>
                              <Text style={[styles.pessoaRoleText, { color: colors.primary }]} numberOfLines={1}>
                                {m.role}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        {m.document ? (
                          <View style={styles.pessoaMeta}>
                            <IdCard size={15} color={colors.textSecondary} strokeWidth={1.9} />
                            <Text style={[styles.pessoaMetaText, { color: colors.textSecondary }]}>{maskCpf(m.document)}</Text>
                          </View>
                        ) : null}
                        {m.phone ? (
                          <View style={styles.pessoaMeta}>
                            <Phone size={15} color={colors.textSecondary} strokeWidth={1.9} />
                            <Text style={[styles.pessoaMetaText, { color: colors.textSecondary }]}>{maskPhone(m.phone)}</Text>
                          </View>
                        ) : null}
                      </View>
                      <TouchableOpacity
                        onPress={() => acoesPessoa(i)}
                        hitSlop={10}
                        accessibilityLabel="Ações da pessoa"
                        style={styles.pessoaMenu}
                      >
                        <MoreVertical size={20} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
            </View>
          ) : null}

          {aba === 'dados' ? (
            <InfoList
              rows={[
                { label: 'Serviço', value: servico.contratoNome || servico.name, icon: Briefcase },
                { label: 'Contrato', value: servico.centroCustoNome, icon: FileText },
                { label: 'Local de execução', value: servico.location, icon: MapPin },
                { label: 'Período', value: `${formatDateBr(servico.startDate)} à ${formatDateBr(servico.endDate)}`, icon: CalendarDays },
                { label: 'Valor', value: formatMoney(valor), icon: Wallet },
                { label: 'Descrição', value: servico.description, icon: AlignLeft },
              ]}
            />
          ) : null}
        </ScrollView>
      )}

      <MedicaoDetalheModal
        visible={medicaoDetalhe !== null}
        medicao={medicaoDetalhe}
        onClose={() => setMedicaoDetalhe(null)}
      />

      {servico ? (
        <MedicaoFormModal
          visible={medicaoAberta}
          onClose={() => setMedicaoAberta(false)}
          onSaved={() => {
            setMedicaoAberta(false);
            void queryClient.invalidateQueries({ queryKey: ['empreiteiro-mobile-medicoes', empreiteiroId] });
            void queryClient.invalidateQueries({ queryKey: ['empreiteiro-mobile', empreiteiroId] });
            Alert.alert('Medição', 'Medição enviada para aprovação.');
          }}
          empreiteiroId={empreiteiroId}
          empreiteiroName={empreiteiroQuery.data?.name ?? ''}
          linkId={linkId}
          team={equipe}
        />
      ) : null}

      <PessoaModal
        visible={pessoaModal !== null}
        titulo={pessoaModal?.index == null ? 'Nova Pessoa' : 'Editar Pessoa'}
        saving={salvarEquipe.isPending}
        inicial={
          pessoaModal?.index != null && equipe[pessoaModal.index]
            ? {
                name: equipe[pessoaModal.index].name,
                role: equipe[pessoaModal.index].role,
                phone: maskPhone(equipe[pessoaModal.index].phone),
                document: maskCpf(equipe[pessoaModal.index].document),
                photo: equipe[pessoaModal.index].photoUrl ?? null,
              }
            : PESSOA_VAZIA
        }
        onClose={() => setPessoaModal(null)}
        onSave={aoSalvarPessoa}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { padding: 16, paddingBottom: 40 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  topInfo: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  topMeta: { marginTop: 14, gap: 6 },
  topMetaItem: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topMetaText: { fontSize: 14, fontWeight: '500', flexShrink: 1 },
  name: { flex: 1, fontSize: 20, fontWeight: '800' },
  kpis: { flexDirection: 'row', gap: 10, padding: 12, marginTop: 14 },
  card: { padding: 14 },
  medTopo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  medCapa: { width: 64, height: 64, borderRadius: 14, overflow: 'hidden' },
  medCapaImg: { position: 'absolute', top: 0, left: 0, width: 64, height: 94 },
  medCapaVazia: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  medData: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  medDataText: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  medValor: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  medDescricao: { fontSize: 14, lineHeight: 20 },
  medDevolvida: { color: '#991b1b', fontSize: 12.5, lineHeight: 17 },
  medDivider: { height: StyleSheet.hairlineWidth },
  medRodape: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  medRodapeText: { fontSize: 13, fontWeight: '500' },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  empty: { alignItems: 'center', paddingVertical: 36 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderRadius: 12, paddingVertical: 12 },
  pessoa: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 },
  pessoaTitulo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pessoaNome: { flexShrink: 1, fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  pessoaRole: { flexShrink: 0, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  pessoaRoleText: { fontSize: 12, fontWeight: '700' },
  pessoaMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pessoaMetaText: { fontSize: 13, fontWeight: '500' },
  pessoaMenu: { width: 32, height: 40, alignItems: 'center', justifyContent: 'center' },
  dados: { padding: 16, marginTop: 14 },
});
