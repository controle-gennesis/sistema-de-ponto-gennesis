'use client';

import { useParams } from 'next/navigation';
import { DiarioObraEditor } from '@/app/ponto/diario-obra/DiarioObraEditor';

/** RDO aberto a partir da obra: o breadcrumb mostra Contratos › Contrato › Obra › RDO. */
export default function DiarioDaObraPage() {
  const params = useParams<{ id: string; obraId: string; date: string }>();
  return (
    <DiarioObraEditor
      contractId={String(params?.id ?? '')}
      obraId={String(params?.obraId ?? '')}
      date={String(params?.date ?? '')}
    />
  );
}
