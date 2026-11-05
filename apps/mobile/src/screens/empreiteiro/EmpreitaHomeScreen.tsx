import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Briefcase,
  Building2,
  CalendarDays,
  ChevronRight,
  CreditCard,
  FileText,
  Hash,
  Landmark,
  Mail,
  MapPin,
  Phone,
  User,
  Users,
  Wallet,
} from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import {
  fetchEmpreiteiro,
  formatDateBr,
  formatMoney,
  maskCnpj,
  maskCpf,
  maskPhone,
  statusServico,
} from '../../services/empreiteiros';
import { useCardStyle, Avatar, Badge, EmpreiteiroHeader, InfoList, KpiRow, UnderlineTabs } from './EmpreiteiroUi';
import { ServiceIcon } from './ServiceIcon';
import type { RootStackParamList } from '../../../App';

type Props = NativeStackScreenProps<RootStackParamList, 'EmpreitaHome'>;

type Aba = 'servicos' | 'dados';

export default function EmpreitaHomeScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const cardBox = useCardStyle();
  const { user } = useAuth();
  const empreiteiroId = user?.empreiteiro?.id ?? '';
  const [aba, setAba] = useState<Aba>('servicos');

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['empreiteiro-mobile', empreiteiroId],
    queryFn: () => fetchEmpreiteiro(empreiteiroId),
    enabled: Boolean(empreiteiroId),
  });

  const servicos = data?.contracts ?? [];
  const contratado = servicos.reduce((s, c) => s + (c.currentValue ?? c.plannedValue ?? 0), 0);
  const executado = servicos.reduce((s, c) => s + (c.executedAmountTotal ?? 0), 0);

  return (
    <View style={styles.root}>
      <EmpreiteiroHeader title="Empreitas" />
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : isError || !data ? (
        <View style={styles.center}>
          <Text style={{ color: colors.textSecondary }}>Não foi possível carregar a empreita.</Text>
          <TouchableOpacity onPress={() => void refetch()} style={{ marginTop: 12 }}>
            <Text style={{ color: colors.primary, fontWeight: '700' }}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />}
        >
          <View style={styles.top}>
            <Avatar uri={data.photoUrl} size={76} />
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={3}>
              {data.name}
            </Text>
            <Text style={[styles.centerText, { color: colors.textSecondary }]} numberOfLines={1}>
              {maskCnpj(data.cnpj || data.document)}
            </Text>
            {data.specialty ? (
              <Text style={[styles.centerText, { color: colors.textSecondary }]} numberOfLines={1}>
                {data.specialty}
              </Text>
            ) : null}
            <View style={{ marginTop: 8 }}>
              <Badge label={data.isActive === false ? 'Inativo' : 'Ativo'} tone={data.isActive === false ? 'neutral' : 'ok'} />
            </View>
          </View>

          <KpiRow
            items={[
              { label: 'Contratado', value: formatMoney(contratado) },
              { label: 'Executado', value: formatMoney(executado) },
            ]}
          />

          <UnderlineTabs
            value={aba}
            onChange={setAba}
            tabs={[
              { id: 'servicos', label: 'Contratos de Serviço' },
              { id: 'dados', label: 'Dados' },
            ]}
          />

          {aba === 'servicos' ? (
            <View style={{ marginTop: 14, gap: 10 }}>
              {servicos.length === 0 ? (
                <View style={styles.empty}>
                  <FileText size={40} color={colors.textSecondary} />
                  <Text style={{ color: colors.text, marginTop: 10 }}>Nenhum contrato de serviço encontrado</Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 4, textAlign: 'center' }}>
                    A Gennesis ainda não cadastrou serviços para esta empreita.
                  </Text>
                </View>
              ) : (
                servicos.map((s) => {
                  const st = statusServico(s.status);
                  const n = s.teamCount ?? s.team?.length ?? 0;
                  return (
                    <TouchableOpacity
                      key={s.id}
                      activeOpacity={0.8}
                      onPress={() => navigation.navigate('EmpreitaServico', { linkId: s.id })}
                      style={[styles.card, cardBox, { borderWidth: 0, shadowOpacity: 0, shadowRadius: 0, elevation: 0 }]}
                    >
                      <View style={styles.cardTop}>
                        <ServiceIcon name={s.iconName} color={s.iconColor} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>
                            {s.contratoNome || s.name || 'Contrato de serviço'}
                          </Text>
                          {s.centroCustoNome ? (
                            <Text style={{ color: colors.textSecondary, fontSize: 13 }} numberOfLines={1}>
                              {s.centroCustoNome}
                            </Text>
                          ) : null}
                        </View>
                        <ChevronRight size={20} color={colors.textSecondary} />
                      </View>

                      <View style={[styles.cardDivider, { backgroundColor: colors.border }]} />

                      <View style={styles.cardRow}>
                        <View style={styles.cardMeta}>
                          <CalendarDays size={14} color={colors.textSecondary} />
                          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                            {formatDateBr(s.startDate)} à {formatDateBr(s.endDate)}
                          </Text>
                        </View>
                        <View style={styles.cardMeta}>
                          <Users size={14} color={colors.textSecondary} strokeWidth={1.9} />
                          <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '500' }}>
                            {n > 0 ? `${n} ${n === 1 ? 'pessoa' : 'pessoas'}` : 'Sem equipe'}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.cardRow}>
                        <Badge label={st.label} tone={st.tone} />
                        <Text style={[styles.cardValue, { color: colors.text }]}>
                          {formatMoney(s.currentValue ?? s.plannedValue)}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>
          ) : (
            <InfoList
              rows={[
                { label: 'CPF', value: data.cpf ? maskCpf(data.cpf) : null, icon: User },
                { label: 'CNPJ', value: maskCnpj(data.cnpj || data.document), icon: Building2 },
                { label: 'Especialidade', value: data.specialty, icon: Briefcase },
                { label: 'Responsável', value: data.contactName, icon: User },
                { label: 'Telefone / WhatsApp', value: maskPhone(data.phone), icon: Phone },
                { label: 'E-mail', value: data.email, icon: Mail },
                { label: 'Cidade / UF', value: [data.city, data.state].filter(Boolean).join(' / '), icon: MapPin },
                { label: 'PIX', value: data.pixKey, icon: Wallet },
                { label: 'Banco', value: data.bank, icon: Landmark },
                { label: 'Agência', value: data.agency, icon: Hash },
                { label: 'Conta', value: data.account, icon: CreditCard },
              ]}
            />
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { padding: 16, paddingBottom: 40 },
  top: { alignItems: 'center', paddingTop: 4, paddingHorizontal: 8 },
  name: { fontSize: 18, fontWeight: '800', textAlign: 'center', marginTop: 10, letterSpacing: -0.3 },
  centerText: { fontSize: 13, textAlign: 'center', marginTop: 3 },
  kpis: { flexDirection: 'row', gap: 10, padding: 12, marginTop: 14 },
  card: { padding: 16, gap: 12 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  cardTitle: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  cardDivider: { height: StyleSheet.hairlineWidth },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardValue: { fontSize: 16, fontWeight: '800', letterSpacing: -0.3 },
  empty: { alignItems: 'center', paddingVertical: 36 },
  dados: { padding: 16, marginTop: 14 },
});
