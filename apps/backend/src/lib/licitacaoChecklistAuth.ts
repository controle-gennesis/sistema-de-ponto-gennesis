export const LICITACAO_CHECKLIST_ADMIN_EMAILS = new Set([
  'controle@gennesisengenharia.com.br',
]);

export function canManageLicitacaoChecklist(email: string | null | undefined): boolean {
  const normalized = String(email ?? '')
    .trim()
    .toLowerCase();
  return LICITACAO_CHECKLIST_ADMIN_EMAILS.has(normalized);
}
