import React, { useEffect, useState } from 'react';
import { Image, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Camera, ImagePlus, X } from 'lucide-react-native';
import { useTheme } from '../../context/ThemeContext';
import { showFormValidationToast } from '../../components/AppToast';
import { EMPREITEIRO_TEAM_ROLES, maskCpf, maskPhone } from '../../services/empreiteiros';
import { resolveMediaUrl } from '../../utils/resolveMediaUrl';
import { FormLabel, FormModal, OptionSheet, SectionTitle, SelectField, useFormStyles } from './FormUi';
import { capturarFotoPessoa } from './fotosGeo';

export type PessoaForm = { name: string; role: string; phone: string; document: string; photo: string | null };

type Props = {
  visible: boolean;
  titulo: string;
  inicial: PessoaForm;
  saving: boolean;
  onClose: () => void;
  onSave: (pessoa: PessoaForm) => void;
};

export default function PessoaModal({ visible, titulo, inicial, saving, onClose, onSave }: Props) {
  const { colors } = useTheme();
  const styles = useFormStyles();
  const [form, setForm] = useState<PessoaForm>(inicial);
  const [roleAberto, setRoleAberto] = useState(false);

  useEffect(() => {
    if (visible) {
      setForm(inicial);
      setRoleAberto(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const escolherFoto = async (fonte: 'camera' | 'galeria') => {
    const foto = await capturarFotoPessoa(fonte);
    if (foto) setForm((p) => ({ ...p, photo: foto }));
  };

  const salvar = () => {
    if (!form.name.trim()) {
      showFormValidationToast('Informe o nome da pessoa.');
      return;
    }
    if (!form.role.trim()) {
      showFormValidationToast('Selecione a função.');
      return;
    }
    const cpf = form.document.replace(/\D/g, '');
    if (cpf && cpf.length !== 11) {
      showFormValidationToast('O CPF deve ter 11 dígitos.');
      return;
    }
    const tel = form.phone.replace(/\D/g, '');
    if (tel && tel.length < 10) {
      showFormValidationToast('O telefone está incompleto.');
      return;
    }
    onSave(form);
  };

  const fotoUri = resolveMediaUrl(form.photo);

  return (
    <FormModal
      visible={visible}
      title={titulo}
      subtitle="Dados da pessoa da equipe"
      onClose={onClose}
      submitLabel="Salvar"
      submitting={saving}
      onSubmit={salvar}
      overlay={
        roleAberto ? (
          <OptionSheet
            title="Função"
            options={EMPREITEIRO_TEAM_ROLES.map((r) => ({ value: r, label: r }))}
            onSelect={(role) => {
              setForm((p) => ({ ...p, role }));
              setRoleAberto(false);
            }}
            onClose={() => setRoleAberto(false)}
          />
        ) : null
      }
    >
      <SectionTitle>Foto</SectionTitle>
      {fotoUri ? (
        <View style={styles.photoWrap}>
          <Image source={{ uri: fotoUri }} style={styles.photoPreview} />
          <TouchableOpacity
            style={styles.photoClear}
            onPress={() => setForm((p) => ({ ...p, photo: null }))}
            accessibilityLabel="Remover foto"
          >
            <X size={16} color="#fff" strokeWidth={2.4} />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.photoEmpty}>
          <View style={[styles.photoEmptyIcon, { backgroundColor: colors.background }]}>
            <ImagePlus size={22} color={colors.textSecondary} strokeWidth={2} />
          </View>
          <Text style={styles.photoEmptyTitle}>Adicione a foto da pessoa</Text>
          <Text style={styles.photoEmptyText}>Tire uma foto ou escolha da galeria</Text>
        </View>
      )}
      <View style={styles.photoActions}>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => void escolherFoto('camera')} activeOpacity={0.75}>
          <Camera size={16} color={colors.primary} strokeWidth={2.2} />
          <Text style={styles.secondaryBtnText}>Câmera</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryBtn} onPress={() => void escolherFoto('galeria')} activeOpacity={0.75}>
          <ImagePlus size={16} color={colors.primary} strokeWidth={2.2} />
          <Text style={styles.secondaryBtnText}>Galeria</Text>
        </TouchableOpacity>
      </View>

      <SectionTitle>Dados</SectionTitle>
      <FormLabel label="Nome" required />
      <TextInput
        style={styles.input}
        value={form.name}
        onChangeText={(v) => setForm((p) => ({ ...p, name: v }))}
        placeholder="Nome completo"
        placeholderTextColor={colors.textSecondary}
      />

      <SelectField
        label="Função"
        required
        valueLabel={form.role}
        placeholder="Selecione a função"
        onPress={() => setRoleAberto(true)}
      />

      <FormLabel label="Telefone" />
      <TextInput
        style={styles.input}
        value={form.phone}
        onChangeText={(v) => setForm((p) => ({ ...p, phone: maskPhone(v) }))}
        placeholder="(00) 90000-0000"
        placeholderTextColor={colors.textSecondary}
        keyboardType="phone-pad"
      />

      <FormLabel label="CPF" />
      <TextInput
        style={styles.input}
        value={form.document}
        onChangeText={(v) => setForm((p) => ({ ...p, document: maskCpf(v) }))}
        placeholder="000.000.000-00"
        placeholderTextColor={colors.textSecondary}
        keyboardType="number-pad"
      />
    </FormModal>
  );
}
