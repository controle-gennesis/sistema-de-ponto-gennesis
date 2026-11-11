'use client';

import { useParams } from 'next/navigation';
import { DiarioObraEditor } from '../../DiarioObraEditor';

export default function DiarioObraPage() {
  const params = useParams<{ obraId: string; date: string }>();
  return <DiarioObraEditor obraId={String(params?.obraId ?? '')} date={String(params?.date ?? '')} />;
}
