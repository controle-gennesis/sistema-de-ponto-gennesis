import { redirect } from 'next/navigation';

/** O editor do relatório agora fica em /ponto/relatorios-fotograficos/:contrato/:relatorio. */
export default async function ContratoRelatorioEditorRedirect({
  params,
}: {
  params: Promise<{ id: string; relatorioId: string }>;
}) {
  const { id, relatorioId } = await params;
  redirect(`/ponto/relatorios-fotograficos/${encodeURIComponent(id)}/${encodeURIComponent(relatorioId)}`);
}
