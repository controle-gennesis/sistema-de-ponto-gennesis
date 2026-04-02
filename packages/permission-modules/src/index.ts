/**
 * Registro central de módulos do sistema para permissões.
 * Cada item corresponde a um submenu (rota) — uma entrada = um checkbox na tela de permissões.
 * Ação persistida no banco: sempre `acesso` (acesso total àquele submenu).
 */

export type PermissionModuleDef = {
  /** Identificador estável: derivado do href (ver pathToModuleKey). */
  key: string;
  name: string;
  href: string;
};

/** Única ação gravada em user_permissions para marcar acesso ao módulo. */
export const PERMISSION_ACCESS_ACTION = 'acesso' as const;

/** Converte uma rota do app em chave de módulo (ex.: `/ponto/folha-pagamento` → `ponto_folha-pagamento`). */
export function pathToModuleKey(href: string): string {
  const trimmed = href.replace(/\/$/, '') || '/';
  if (trimmed === '/' || trimmed === '') return 'root';
  return trimmed.replace(/^\//, '').replace(/\//g, '_');
}

/**
 * Lista alinhada aos submenus do Sidebar (cada linha = um módulo).
 * Ordem: categorias como no menu lateral.
 */
export const PERMISSION_MODULES: readonly PermissionModuleDef[] = [
  // Principal
  { key: pathToModuleKey('/ponto/dashboard'), name: 'Dashboard', href: '/ponto/dashboard' },
  { key: pathToModuleKey('/ponto/chatgpt'), name: 'Assistente Virtual', href: '/ponto/chatgpt' },
  { key: pathToModuleKey('/ponto/bi'), name: 'Solicitações Fluig', href: '/ponto/bi' },
  { key: pathToModuleKey('/ponto/conversas-whatsapp'), name: 'Conversas WhatsApp', href: '/ponto/conversas-whatsapp' },
  // Painel de Controle
  { key: pathToModuleKey('/ponto/permissoes'), name: 'Permissões', href: '/ponto/permissoes' },
  // Departamento Pessoal
  { key: pathToModuleKey('/ponto/funcionarios'), name: 'Gerenciar Funcionários', href: '/ponto/funcionarios' },
  { key: pathToModuleKey('/ponto/folha-pagamento'), name: 'Folha de Pagamento', href: '/ponto/folha-pagamento' },
  { key: pathToModuleKey('/ponto/atestados'), name: 'Ausências', href: '/ponto/atestados' },
  { key: pathToModuleKey('/ponto/gerenciar-atestados'), name: 'Gerenciar Ausências', href: '/ponto/gerenciar-atestados' },
  { key: pathToModuleKey('/ponto/solicitacoes'), name: 'Solicitações', href: '/ponto/solicitacoes' },
  { key: pathToModuleKey('/ponto/gerenciar-solicitacoes'), name: 'Gerenciar Solicitações', href: '/ponto/gerenciar-solicitacoes' },
  { key: pathToModuleKey('/ponto/ferias'), name: 'Férias', href: '/ponto/ferias' },
  { key: pathToModuleKey('/ponto/gerenciar-ferias'), name: 'Gerenciar Férias', href: '/ponto/gerenciar-ferias' },
  { key: pathToModuleKey('/ponto/gerenciar-feriados'), name: 'Gerenciar Feriados', href: '/ponto/gerenciar-feriados' },
  { key: pathToModuleKey('/ponto/banco-horas'), name: 'Banco de Horas', href: '/ponto/banco-horas' },
  { key: pathToModuleKey('/relatorios/alocacao'), name: 'Alocação', href: '/relatorios/alocacao' },
  { key: pathToModuleKey('/ponto/aniversariantes'), name: 'Aniversariantes', href: '/ponto/aniversariantes' },
  // Financeiro
  { key: pathToModuleKey('/ponto/financeiro'), name: 'Financeiro', href: '/ponto/financeiro' },
  { key: pathToModuleKey('/ponto/financeiro/analise'), name: 'Análise Financeira', href: '/ponto/financeiro/analise' },
  { key: pathToModuleKey('/ponto/financeiro/analise-extrato'), name: 'Análise de Extrato', href: '/ponto/financeiro/analise-extrato' },
  // Engenharia
  { key: pathToModuleKey('/ponto/orcamento'), name: 'Orçamento', href: '/ponto/orcamento' },
  { key: pathToModuleKey('/ponto/contratos'), name: 'Contratos', href: '/ponto/contratos' },
  { key: pathToModuleKey('/ponto/contratos/controle-geral'), name: 'Controle Geral de Contratos', href: '/ponto/contratos/controle-geral' },
  { key: pathToModuleKey('/ponto/andamento-da-os'), name: 'Ordem de Serviço', href: '/ponto/andamento-da-os' },
  { key: pathToModuleKey('/ponto/pleitos-gerados'), name: 'Pleitos Gerados', href: '/ponto/pleitos-gerados' },
  // Suprimentos
  { key: pathToModuleKey('/ponto/solicitar-materiais'), name: 'Solicitar Materiais', href: '/ponto/solicitar-materiais' },
  { key: pathToModuleKey('/ponto/gerenciar-materiais'), name: 'Requisições de Materiais', href: '/ponto/gerenciar-materiais' },
  { key: pathToModuleKey('/ponto/mapa-cotacao'), name: 'Mapa de Cotação', href: '/ponto/mapa-cotacao' },
  { key: pathToModuleKey('/ponto/ordem-de-compra'), name: 'Ordens de Compra', href: '/ponto/ordem-de-compra' },
  // Cadastros
  { key: pathToModuleKey('/ponto/centros-custo'), name: 'Centros de Custo', href: '/ponto/centros-custo' },
  { key: pathToModuleKey('/ponto/materiais-construcao'), name: 'Materiais de Construção', href: '/ponto/materiais-construcao' },
  { key: pathToModuleKey('/ponto/fornecedores'), name: 'Fornecedores', href: '/ponto/fornecedores' },
  { key: pathToModuleKey('/ponto/natureza-orcamentaria'), name: 'Natureza Orçamentária', href: '/ponto/natureza-orcamentaria' },
  // Registros de Ponto
  { key: pathToModuleKey('/ponto'), name: 'Registros de Ponto', href: '/ponto' },
] as const;

const keySet = new Set(PERMISSION_MODULES.map((m) => m.key));

export function getPermissionModuleKeys(): string[] {
  return PERMISSION_MODULES.map((m) => m.key);
}

export function isValidPermissionModuleKey(module: string): boolean {
  return keySet.has(module);
}

/** Payload da API: apenas módulos válidos; ação é sempre `acesso`. */
export function isValidPermissionAccessAction(action: string): boolean {
  return action === PERMISSION_ACCESS_ACTION;
}
