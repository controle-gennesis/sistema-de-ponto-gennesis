import React, { useEffect, useState } from 'react';
import {
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AlertTriangle, Maximize2, X } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { formatMoney, statusMedicao, type DailyMeasurement } from '../../services/empreiteiros';
import { resolveMediaUrl } from '../../utils/resolveMediaUrl';
import { Badge } from './EmpreiteiroUi';
import { useFormStyles } from './FormUi';

type Props = {
  visible: boolean;
  medicao: DailyMeasurement | null;
  onClose: () => void;
};

type FotoInfo = { url: string; name?: string; capturedAt?: string | null; address?: string | null };

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const DIAS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const p2 = (n: number) => String(n).padStart(2, '0');

/** "2026-11-05" (ou ISO) → data local sem deslocar o dia por fuso. */
function paraData(valor?: string | null): Date | null {
  if (!valor) return null;
  const solta = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
  const d = solta ? new Date(Number(solta[1]), Number(solta[2]) - 1, Number(solta[3]), 12) : new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dataExtensa(valor?: string | null): { titulo: string; dia: string } {
  const d = paraData(valor);
  if (!d) return { titulo: '—', dia: '' };
  return { titulo: `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`, dia: DIAS[d.getDay()] };
}

function dataHora(valor?: string | null): string {
  if (!valor) return '';
  const d = new Date(valor);
  if (Number.isNaN(d.getTime())) return '';
  return `${p2(d.getDate())}/${p2(d.getMonth() + 1)}/${d.getFullYear()} às ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase();
}

/** Detalhe de uma medição de entrega: foto de capa, resumo, entrega, equipe, fotos e histórico. */
export default function MedicaoDetalheModal({ visible, medicao, onClose }: Props) {
  const { colors, isDark } = useTheme();
  const styles = useFormStyles();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [larguraFotos, setLarguraFotos] = useState(0);
  const [fotoAberta, setFotoAberta] = useState<{ uri: string; legenda: string } | null>(null);

  useEffect(() => {
    if (!visible) setFotoAberta(null);
  }, [visible]);

  const m = medicao;
  const sm = statusMedicao(m?.status);
  const devolvida = String(m?.status).toUpperCase() === 'CORRECTION';
  const aprovada = Boolean(m?.approvedAt) || String(m?.status).toUpperCase() === 'APPROVED';
  const valorAprovado = m?.executedAmount != null && Number(m.executedAmount) > 0 ? Number(m.executedAmount) : null;
  const equipeFoto = (m?.teamPhoto ?? null) as FotoInfo | null;
  const fotos = (m?.photos ?? []) as FotoInfo[];
  const pessoas = m?.workers ?? [];
  const uri = (f: FotoInfo) => resolveMediaUrl(f.url) ?? f.url;
  const lado = larguraFotos > 0 ? Math.floor((larguraFotos - 20) / 3) : 92;
  const caixa = isDark ? colors.card : colors.surface;
  const linha = isDark ? colors.border : 'rgba(15,23,42,0.08)';
  const { titulo, dia } = dataExtensa(m?.workDate);

  const registro = (f: FotoInfo) => [dataHora(f.capturedAt), f.address].filter(Boolean).join('  ·  ');
  const abrirFoto = (f: FotoInfo, rotulo: string) =>
    setFotoAberta({ uri: uri(f), legenda: [rotulo, registro(f)].filter(Boolean).join('\n') });

  const historico: Array<{ texto: string; quando: string; cor: string }> = [];
  if (dataHora(m?.createdAt)) historico.push({ texto: 'Enviada para aprovação', quando: dataHora(m?.createdAt), cor: colors.textSecondary });
  if (aprovada && dataHora(m?.approvedAt)) historico.push({ texto: 'Aprovada', quando: dataHora(m?.approvedAt), cor: '#16a34a' });
  if (devolvida) historico.push({ texto: 'Devolvida para correção', quando: '', cor: '#dc2626' });

  const Titulo = ({ children, extra }: { children: string; extra?: string }) => (
    <View style={s.secaoTopo}>
      <Text style={[s.secao, { color: colors.textSecondary }]}>{children}</Text>
      {extra ? <Text style={[s.secaoExtra, { color: colors.textSecondary }]}>{extra}</Text> : null}
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: insets.top, width, height }}>
        <View style={styles.formHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.formTitle}>Medição</Text>
            <Text style={styles.formSubtitle}>Detalhes e registros da entrega</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.formCloseBtn} hitSlop={6} accessibilityLabel="Fechar">
            <X size={20} color={colors.text} strokeWidth={2.2} />
          </TouchableOpacity>
        </View>

        {m ? (
          <ScrollView
            contentContainerStyle={[styles.formScroll, { paddingBottom: Math.max(insets.bottom, 20) + 24 }]}
            showsVerticalScrollIndicator={false}
          >
            {/* Capa: foto da equipe com status e carimbo */}
            {equipeFoto?.url ? (
              <TouchableOpacity activeOpacity={0.92} onPress={() => abrirFoto(equipeFoto, 'Foto da equipe')} style={s.capa}>
                <Image source={{ uri: uri(equipeFoto) }} style={s.capaImg} />
                <View style={s.capaStatus}>
                  <Badge label={sm.label} tone={sm.tone} />
                </View>
                <View style={s.capaAmpliar}>
                  <Maximize2 size={15} color="#fff" strokeWidth={2.2} />
                </View>
                <View style={s.capaLegenda}>
                  <Text style={s.capaLegendaTexto} numberOfLines={1}>
                    Foto da equipe{equipeFoto.capturedAt ? `  ·  ${dataHora(equipeFoto.capturedAt)}` : ''}
                  </Text>
                </View>
              </TouchableOpacity>
            ) : null}

            {/* Título */}
            <View style={s.tituloBloco}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[s.tituloData, { color: colors.text }]}>{titulo}</Text>
                {dia ? <Text style={[s.tituloDia, { color: colors.textSecondary }]}>{dia}</Text> : null}
              </View>
              {!equipeFoto?.url ? <Badge label={sm.label} tone={sm.tone} /> : null}
            </View>

            {/* Devolução */}
            {devolvida && m.correctionNote ? (
              <View style={[s.aviso, { backgroundColor: isDark ? 'rgba(239,68,68,0.14)' : '#fef2f2' }]}>
                <AlertTriangle size={18} color="#dc2626" strokeWidth={2} />
                <View style={{ flex: 1 }}>
                  <Text style={s.avisoTitulo}>Devolvida para correção</Text>
                  <Text style={s.avisoTexto}>{m.correctionNote}</Text>
                </View>
              </View>
            ) : null}

            {/* Entrega */}
            <Titulo>ENTREGA</Titulo>
            <View style={[s.cartao, { backgroundColor: caixa }]}>
              {valorAprovado != null ? (
                <>
                  <View style={s.valorLinha}>
                    <Text style={[s.valorRotulo, { color: colors.textSecondary }]}>Valor aprovado</Text>
                    <Text style={[s.valorNumero, { color: colors.text }]}>{formatMoney(valorAprovado)}</Text>
                  </View>
                  <View style={[s.valorDivisor, { backgroundColor: linha }]} />
                </>
              ) : null}
              <Text style={[s.descricao, { color: colors.text }]}>{m.description?.trim() || 'Sem descrição.'}</Text>
            </View>

            {/* Equipe */}
            <Titulo extra={String(pessoas.length)}>EQUIPE</Titulo>
            {pessoas.length > 0 ? (
              <View style={[s.cartao, { backgroundColor: caixa, paddingVertical: 4 }]}>
                {pessoas.map((w, i) => (
                  <View
                    key={w.id}
                    style={[s.pessoa, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: linha }]}
                  >
                    <View style={[s.avatar, { backgroundColor: isDark ? 'rgba(239,68,68,0.16)' : colors.iconBackground }]}>
                      <Text style={[s.avatarTexto, { color: colors.primary }]}>{iniciais(w.name)}</Text>
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={[s.pessoaNome, { color: colors.text }]} numberOfLines={1}>
                        {w.name}
                      </Text>
                      {w.role ? <Text style={[s.pessoaFuncao, { color: colors.textSecondary }]}>{w.role}</Text> : null}
                    </View>
                  </View>
                ))}
              </View>
            ) : (
              <View style={[s.cartao, { backgroundColor: caixa }]}>
                <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Ninguém foi marcado nesta medição.</Text>
              </View>
            )}

            {/* Fotos do serviço */}
            <Titulo extra={String(fotos.length)}>FOTOS DO SERVIÇO</Titulo>
            {fotos.length > 0 ? (
              <>
                <View style={styles.thumbs} onLayout={(e) => setLarguraFotos(e.nativeEvent.layout.width)}>
                  {fotos.map((f, i) => (
                    <TouchableOpacity key={`${f.url}-${i}`} activeOpacity={0.9} onPress={() => abrirFoto(f, `Foto ${i + 1} de ${fotos.length}`)}>
                      <Image source={{ uri: uri(f) }} style={[styles.thumb, { width: lado, height: lado }]} />
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : (
              <View style={[s.cartao, { backgroundColor: caixa }]}>
                <Text style={{ color: colors.textSecondary, fontSize: 14 }}>Sem fotos do serviço.</Text>
              </View>
            )}

            {/* Histórico */}
            {historico.length > 0 ? (
              <>
                <Titulo>HISTÓRICO</Titulo>
                <View style={[s.cartao, { backgroundColor: caixa, paddingVertical: 6 }]}>
                  {historico.map((h, i) => (
                    <View key={`${h.texto}-${i}`} style={s.hist}>
                      <View style={s.histTrilha}>
                        <View style={[s.histLinha, { backgroundColor: i > 0 ? linha : 'transparent' }]} />
                        <View style={[s.histPonto, { backgroundColor: h.cor }]} />
                        <View
                          style={[s.histLinha, { backgroundColor: i < historico.length - 1 ? linha : 'transparent' }]}
                        />
                      </View>
                      <View style={s.histConteudo}>
                        <Text style={[s.histTexto, { color: colors.text }]}>{h.texto}</Text>
                        {h.quando ? <Text style={[s.histQuando, { color: colors.textSecondary }]}>{h.quando}</Text> : null}
                      </View>
                    </View>
                  ))}
                </View>
              </>
            ) : null}
          </ScrollView>
        ) : null}

        {fotoAberta ? (
          <View style={s.visualizador}>
            <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setFotoAberta(null)} />
            <Image source={{ uri: fotoAberta.uri }} style={s.visualizadorImg} resizeMode="contain" />
            {fotoAberta.legenda ? (
              <View style={[s.visualizadorLegenda, { bottom: Math.max(insets.bottom, 16) + 12 }]} pointerEvents="none">
                <Text style={s.visualizadorLegendaTexto}>{fotoAberta.legenda}</Text>
              </View>
            ) : null}
            <TouchableOpacity
              style={[s.fechar, { top: Math.max(insets.top, 12) + 8 }]}
              onPress={() => setFotoAberta(null)}
              hitSlop={8}
              accessibilityLabel="Fechar foto"
            >
              <X size={22} color="#fff" strokeWidth={2.4} />
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  capa: { borderRadius: 22, overflow: 'hidden', marginTop: 4 },
  capaImg: { width: '100%', height: 220, backgroundColor: '#d1d5db' },
  capaStatus: { position: 'absolute', top: 12, left: 12 },
  capaAmpliar: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  capaLegenda: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    maxWidth: '85%',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  capaLegendaTexto: { color: '#fff', fontSize: 12, fontWeight: '600' },
  tituloBloco: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 18 },
  tituloData: { fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  tituloDia: { fontSize: 14, fontWeight: '500', marginTop: 2 },
  aviso: { flexDirection: 'row', gap: 10, borderRadius: 16, padding: 14, marginTop: 16 },
  avisoTitulo: { color: '#991b1b', fontSize: 13, fontWeight: '700', marginBottom: 2 },
  avisoTexto: { color: '#991b1b', fontSize: 14, lineHeight: 20 },
  secaoTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 26, marginBottom: 10, paddingHorizontal: 2 },
  secao: { fontSize: 12, fontWeight: '700', letterSpacing: 0.8 },
  secaoExtra: { fontSize: 12, fontWeight: '700' },
  cartao: { borderRadius: 18, paddingHorizontal: 16, paddingVertical: 14 },
  descricao: { fontSize: 15, lineHeight: 23 },
  valorLinha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  valorRotulo: { fontSize: 13, fontWeight: '600' },
  valorNumero: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  valorDivisor: { height: StyleSheet.hairlineWidth, marginVertical: 12 },
  pessoa: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  avatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  avatarTexto: { fontSize: 13, fontWeight: '800' },
  pessoaNome: { fontSize: 15, fontWeight: '600', letterSpacing: -0.2 },
  pessoaFuncao: { fontSize: 13, fontWeight: '500', marginTop: 1 },
  visualizadorLegenda: {
    position: 'absolute',
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  visualizadorLegendaTexto: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 19,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
    overflow: 'hidden',
  },
  hist: { flexDirection: 'row', gap: 12 },
  histTrilha: { alignItems: 'center', alignSelf: 'stretch', width: 12 },
  histPonto: { width: 10, height: 10, borderRadius: 5 },
  histLinha: { flex: 1, width: 2 },
  histConteudo: { flex: 1, paddingVertical: 10 },
  histTexto: { fontSize: 14.5, fontWeight: '600' },
  histQuando: { fontSize: 12.5, marginTop: 2 },
  visualizador: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.94)',
    justifyContent: 'center',
    zIndex: 99999,
    elevation: 99999,
  },
  visualizadorImg: { width: '100%', height: '80%' },
  fechar: {
    position: 'absolute',
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
