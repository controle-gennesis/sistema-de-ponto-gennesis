-- Novo status "Pendente": solicitacoes chegam ao DP como Pendente e viram "Em Analise" quando o atendimento comeca.
ALTER TYPE "DpRequestStatus" ADD VALUE IF NOT EXISTS 'PENDING_DP';
