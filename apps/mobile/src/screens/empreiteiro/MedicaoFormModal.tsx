import React, { useEffect, useState } from 'react';
import { Image, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Camera, ImagePlus, X } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import DateField, { formatDateValue } from '../../components/DateField';
import { showFormValidationToast } from '../../components/AppToast';
import {
  createMeasurement,
  type EmpreiteiroMember,
  type GeoPhoto,
} from '../../services/empreiteiros';
import { FormLabel, FormModal, SectionTitle, useFormStyles } from './FormUi';
import { capturarFotoComLocal } from './fotosGeo';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  empreiteiroId: string;
  empreiteiroName: string;
  linkId: string;
  team: EmpreiteiroMember[];
};

export default function MedicaoFormModal({
  visible,
  onClose,
  onSaved,
  empreiteiroId,
  empreiteiroName,
  linkId,
  team,
}: Props) {
  const { colors } = useTheme();
  const styles = useFormStyles();
  const [workDate, setWorkDate] = useState(formatDateValue(new Date()));
  const [description, setDescription] = useState('');
  const [workerIds, setWorkerIds] = useState<string[]>([]);
  const [teamPhoto, setTeamPhoto] = useState<GeoPhoto | null>(null);
  const [photos, setPhotos] = useState<GeoPhoto[]>([]);
  const [saving, setSaving] = useState(false);

  const membrosComId = team.filter((m) => m.id);

  useEffect(() => {
    if (!visible) return;
    setWorkDate(formatDateValue(new Date()));
    setDescription('');
    setWorkerIds([]);
    setTeamPhoto(null);
    setPhotos([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const alternar = (id: string) =>
    setWorkerIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const adicionarFoto = async (alvo: 'equipe' | 'servico', fonte: 'camera' | 'galeria') => {
    const foto = await capturarFotoComLocal(fonte);
    if (!foto) return;
    if (alvo === 'equipe') setTeamPhoto(foto);
    else setPhotos((prev) => [...prev, foto]);
  };

  const enviar = async () => {
    if (!workDate) {
      showFormValidationToast('Informe a data da entrega.');
      return;
    }
    if (!description.trim()) {
      showFormValidationToast('Descreva o que foi entregue.');
      return;
    }
    if (!teamPhoto) {
      showFormValidationToast('Adicione a foto da equipe.');
      return;
    }
    if (photos.length === 0) {
      showFormValidationToast('Adicione ao menos uma foto do serviço.');
      return;
    }
    setSaving(true);
    try {
      await createMeasurement(empreiteiroId, {
        workDate,
        empreiteiroContractId: linkId,
        contractId: linkId,
        description: description.trim(),
        confirmedBy: empreiteiroName.trim() || null,
        workerIds,
        photos,
        teamPhoto,
      });
      onSaved();
    } catch (error) {
      showFormValidationToast(error instanceof Error ? error.message : 'Não foi possível salvar a medição.');
    } finally {
      setSaving(false);
    }
  };

  const botoesFoto = (alvo: 'equipe' | 'servico') => (
    <View style={styles.photoActions}>
      <TouchableOpacity style={styles.secondaryBtn} onPress={() => void adicionarFoto(alvo, 'camera')} activeOpacity={0.75}>
        <Camera size={16} color={colors.primary} strokeWidth={2.2} />
        <Text style={styles.secondaryBtnText}>Câmera</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.secondaryBtn} onPress={() => void adicionarFoto(alvo, 'galeria')} activeOpacity={0.75}>
        <ImagePlus size={16} color={colors.primary} strokeWidth={2.2} />
        <Text style={styles.secondaryBtnText}>Galeria</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <FormModal
      visible={visible}
      title="Nova medição"
      subtitle="Medição de entrega do serviço"
      onClose={onClose}
      submitLabel="Enviar para aprovação"
      submitting={saving}
      onSubmit={() => void enviar()}
    >
      <SectionTitle>Detalhes</SectionTitle>
      <DateField label="Data da entrega" value={workDate} onChange={setWorkDate} />

      <FormLabel label="O que foi entregue" required />
      <TextInput
        style={[styles.input, styles.inputMultiline]}
        value={description}
        onChangeText={setDescription}
        placeholder="Ex.: chapisco da fachada e alvenaria do 2º pavimento"
        placeholderTextColor={colors.textSecondary}
        multiline
      />

      <FormLabel label="Quem trabalhou" />
      {membrosComId.length === 0 ? (
        <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 14 }}>
          Cadastre a equipe do serviço (aba Equipe) para marcar quem trabalhou.
        </Text>
      ) : (
        <View style={styles.chips}>
          {membrosComId.map((m) => {
            const ativo = workerIds.includes(m.id as string);
            return (
              <TouchableOpacity
                key={m.id}
                onPress={() => alternar(m.id as string)}
                activeOpacity={0.8}
                style={[
                  styles.chip,
                  {
                    borderColor: ativo ? colors.primary : colors.border,
                    backgroundColor: ativo ? colors.primary : colors.surface,
                  },
                ]}
              >
                <Text style={{ color: ativo ? '#fff' : colors.text, fontSize: 13, fontWeight: '600' }}>{m.name}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      <SectionTitle>Fotos</SectionTitle>
      <FormLabel label="Foto da equipe" required />
      {teamPhoto ? (
        <View style={styles.photoWrap}>
          <Image source={{ uri: teamPhoto.url }} style={styles.photoPreview} />
          <TouchableOpacity style={styles.photoClear} onPress={() => setTeamPhoto(null)} accessibilityLabel="Remover foto">
            <X size={16} color="#fff" strokeWidth={2.4} />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.photoEmpty}>
          <View style={[styles.photoEmptyIcon, { backgroundColor: colors.background }]}>
            <ImagePlus size={22} color={colors.textSecondary} strokeWidth={2} />
          </View>
          <Text style={styles.photoEmptyTitle}>Adicione a foto da equipe</Text>
          <Text style={styles.photoEmptyText}>Tire uma foto ou escolha da galeria</Text>
        </View>
      )}
      {botoesFoto('equipe')}

      <FormLabel label="Fotos do serviço" required />
      {photos.length > 0 ? (
        <View style={styles.thumbs}>
          {photos.map((p, i) => (
            <View key={`${p.name}-${i}`} style={styles.photoWrap}>
              <Image source={{ uri: p.url }} style={styles.thumb} />
              <TouchableOpacity
                style={[styles.photoClear, { top: 6, right: 6, width: 24, height: 24, borderRadius: 12 }]}
                onPress={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                accessibilityLabel="Remover foto"
              >
                <X size={13} color="#fff" strokeWidth={2.4} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.photoEmpty}>
          <View style={[styles.photoEmptyIcon, { backgroundColor: colors.background }]}>
            <ImagePlus size={22} color={colors.textSecondary} strokeWidth={2} />
          </View>
          <Text style={styles.photoEmptyTitle}>Adicione fotos do serviço</Text>
          <Text style={styles.photoEmptyText}>Cada foto registra data, hora e local</Text>
        </View>
      )}
      {botoesFoto('servico')}
    </FormModal>
  );
}
