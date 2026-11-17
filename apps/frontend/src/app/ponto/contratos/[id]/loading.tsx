import { ContractDetailSkeleton } from '@/components/contract/ContractDetailSkeleton';

/** Desde o clique no contrato já aparece o skeleton do contrato (e não o genérico de /ponto). */
export default function ContractLoading() {
  return <ContractDetailSkeleton />;
}
