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
  /** Agrupamento na UI de permissões (ex.: mesmo bloco do menu lateral). */
  category: string;
};

/** Ação padrão de acesso a módulo (submenu). */
export const PERMISSION_ACCESS_ACTION = 'acesso' as const;
/** Ações extras usadas no módulo de contratos para granularidade operacional. */
export const PERMISSION_CONTRACT_ACTIONS = ['ver', 'editar', 'excluir'] as const;
export type PermissionContractAction = (typeof PERMISSION_CONTRACT_ACTIONS)[number];
export const PERMISSION_ACTIONS = [PERMISSION_ACCESS_ACTION, ...PERMISSION_CONTRACT_ACTIONS] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];

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
  { key: pathToModuleKey('/ponto/dashboard'), name: 'Dashboard', href: '/ponto/dashboard', category: 'Principal' },
  { key: pathToModuleKey('/ponto/chatgpt'), name: 'Assistente Virtual', href: '/ponto/chatgpt', category: 'Principal' },
  { key: pathToModuleKey('/ponto/bi'), name: 'Solicitações Fluig', href: '/ponto/bi', category: 'Principal' },
  { key: pathToModuleKey('/ponto/conversas-whatsapp'), name: 'Conversas WhatsApp', href: '/ponto/conversas-whatsapp', category: 'Principal' },
  // Painel de Controle
  { key: pathToModuleKey('/ponto/permissoes'), name: 'Permissões', href: '/ponto/permissoes', category: 'Painel de Controle' },
  // Departamento Pessoal
  { key: pathToModuleKey('/ponto/funcionarios'), name: 'Funcionários', href: '/ponto/funcionarios', category: 'Departamento Pessoal' },
  { key: pathToModuleKey('/ponto/folha-pagamento'), name: 'Folha de Pagamento', href: '/ponto/folha-pagamento', category: 'Departamento Pessoal' },
  { key: pathToModuleKey('/ponto/atestados'), name: 'Ausências', href: '/ponto/atestados', category: 'Departamento Pessoal' },
  { key: pathToModuleKey('/ponto/gerenciar-atestados'), name: 'Gerenciar Ausências', href: '/ponto/gerenciar-atestados', category: 'Departamento Pessoal' },
  { key: pathToModuleKey('/ponto/solicitacoes'), name: 'Solicitações', href: '/ponto/solicitacoes', category: 'Departamento Pessoal' },
  { key: pathToModuleKey('/ponto/gerenciar-solicitacoes'), name: 'Gerenciar Solicitações', href: '/ponto/gerenciar-solicitacoes', category: 'Departamento Pessoal' },
  { key: pathToModuleKey('/ponto/ferias'), name: 'Férias', href: '/ponto/ferias', category: 'Departamento Pessoal' },
  { key: pathToModuleKey('/ponto/gerenciar-ferias'), name: 'Gerenciar Férias', href: '/ponto/gerenciar-ferias', category: 'Departamento Pessoal' },
  { key: pathToModuleKey('/ponto/gerenciar-feriados'), name: 'Gerenciar Feriados', href: '/ponto/gerenciar-feriados', category: 'Departamento Pessoal' },
  { key: pathToModuleKey('/ponto/banco-horas'), name: 'Banco de Horas', href: '/ponto/banco-horas', category: 'Departamento Pessoal' },
  { key: pathToModuleKey('/relatorios/alocacao'), name: 'Alocação', href: '/relatorios/alocacao', category: 'Departamento Pessoal' },
  { key: pathToModuleKey('/ponto/aniversariantes'), name: 'Aniversariantes', href: '/ponto/aniversariantes', category: 'Departamento Pessoal' },
  // Financeiro
  { key: pathToModuleKey('/ponto/financeiro'), name: 'Financeiro', href: '/ponto/financeiro', category: 'Financeiro' },
  { key: pathToModuleKey('/ponto/financeiro/analise'), name: 'Análise Financeira', href: '/ponto/financeiro/analise', category: 'Financeiro' },
  { key: pathToModuleKey('/ponto/financeiro/analise-extrato'), name: 'Análise de Extrato', href: '/ponto/financeiro/analise-extrato', category: 'Financeiro' },
  // Engenharia
  { key: pathToModuleKey('/ponto/orcamento'), name: 'Orçamento', href: '/ponto/orcamento', category: 'Engenharia' },
  { key: pathToModuleKey('/ponto/contratos'), name: 'Contratos', href: '/ponto/contratos', category: 'Engenharia' },
  { key: pathToModuleKey('/ponto/contratos/controle-geral'), name: 'Controle Geral de Contratos', href: '/ponto/contratos/controle-geral', category: 'Engenharia' },
  { key: pathToModuleKey('/ponto/andamento-da-os'), name: 'Ordem de Serviço', href: '/ponto/andamento-da-os', category: 'Engenharia' },
  { key: pathToModuleKey('/ponto/pleitos-gerados'), name: 'Pleitos Gerados', href: '/ponto/pleitos-gerados', category: 'Engenharia' },
  // Suprimentos
  { key: pathToModuleKey('/ponto/solicitar-materiais'), name: 'Solicitar Materiais', href: '/ponto/solicitar-materiais', category: 'Suprimentos' },
  { key: pathToModuleKey('/ponto/gerenciar-materiais'), name: 'Requisições de Materiais', href: '/ponto/gerenciar-materiais', category: 'Suprimentos' },
  { key: pathToModuleKey('/ponto/mapa-cotacao'), name: 'Mapa de Cotação', href: '/ponto/mapa-cotacao', category: 'Suprimentos' },
  { key: pathToModuleKey('/ponto/ordem-de-compra'), name: 'Ordens de Compra', href: '/ponto/ordem-de-compra', category: 'Suprimentos' },
  // Cadastros
  { key: pathToModuleKey('/ponto/centros-custo'), name: 'Centros de Custo', href: '/ponto/centros-custo', category: 'Cadastros' },
  { key: pathToModuleKey('/ponto/materiais-construcao'), name: 'Materiais de Construção', href: '/ponto/materiais-construcao', category: 'Cadastros' },
  { key: pathToModuleKey('/ponto/fornecedores'), name: 'Fornecedores', href: '/ponto/fornecedores', category: 'Cadastros' },
  { key: pathToModuleKey('/ponto/condicoes-pagamento'), name: 'Condições de Pagamento', href: '/ponto/condicoes-pagamento', category: 'Cadastros' },
  { key: pathToModuleKey('/ponto/natureza-orcamentaria'), name: 'Natureza Orçamentária', href: '/ponto/natureza-orcamentaria', category: 'Cadastros' },
  // Registros de Ponto
  { key: pathToModuleKey('/ponto'), name: 'Registros de Ponto', href: '/ponto', category: 'Registros de Ponto' },
  /**
   * Controle — permissões administrativas que não correspondem a uma página do menu lateral
   * (chaves estáveis para checagem em `can()` / API).
   */
  {
    key: pathToModuleKey('/ponto/controle/alterar-permissoes'),
    name: 'Alterar permissões de funcionários',
    href: '/ponto/controle/alterar-permissoes',
    category: 'Controle',
  },
  {
    key: pathToModuleKey('/ponto/controle/auditoria-permissoes'),
    name: 'Auditoria de permissões e acessos',
    href: '/ponto/controle/auditoria-permissoes',
    category: 'Controle',
  },
  {
    key: pathToModuleKey('/ponto/controle/exportacoes-administrativas'),
    name: 'Exportações e relatórios administrativos',
    href: '/ponto/controle/exportacoes-administrativas',
    category: 'Controle',
  },
] as const;

const keySet = new Set(PERMISSION_MODULES.map((m) => m.key));

export function getPermissionModuleKeys(): string[] {
  return PERMISSION_MODULES.map((m) => m.key);
}

export function isValidPermissionModuleKey(module: string): boolean {
  return keySet.has(module);
}

/** Payload da API: ação precisa existir no conjunto permitido. */
export function isValidPermissionAction(action: string): boolean {
  return (PERMISSION_ACTIONS as readonly string[]).includes(action);
}

/** Categoria reservada para o registro acima (aba Controle no editor de permissões). */
export const PERMISSION_CONTROLE_CATEGORY = 'Controle' as const;
