import { redirect } from 'next/navigation';

/** A lista de relatórios fotográficos agora fica em /ponto/relatorios-fotograficos. */
export default function ContratoRelatoriosRedirect() {
  redirect('/ponto/relatorios-fotograficos');
}
