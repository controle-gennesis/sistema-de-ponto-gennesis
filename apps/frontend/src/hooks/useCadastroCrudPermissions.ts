'use client';

import {
  pathToModuleKey,
  PERMISSION_MODULE_CRUD_ACTIONS,
  isGranularCrudModuleKey,
  RELATORIOS_CONTRATO_MODULE_KEY,
} from '@sistema-ponto/permission-modules';
import { usePermissions } from '@/hooks/usePermissions';

export type CadastroCrudAction = (typeof PERMISSION_MODULE_CRUD_ACTIONS)[number];

/**
 * CRUD da matriz Ver/Criar/Editar/Excluir.
 * Cadastros legado: só `acesso` → libera tudo.
 * Relatórios de Contrato: só `acesso`/`ver` → visualizar; preencher exige Criar ou Editar.
 */
export function useCadastroCrudPermissions(routeHref: string) {
  const { can, canAction, isElevatedUser, isLoading } = usePermissions();
  const moduleKey = pathToModuleKey(routeHref);

  if (!isGranularCrudModuleKey(moduleKey)) {
    const access = can(moduleKey);
    return {
      moduleKey,
      canView: access,
      canCreate: access,
      canEdit: access,
      canDelete: access,
      isLoading,
    };
  }

  if (isElevatedUser) {
    return {
      moduleKey,
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: true,
      isLoading,
    };
  }

  const hasAcesso = can(moduleKey);
  const hasGranular = PERMISSION_MODULE_CRUD_ACTIONS.some((a) => canAction(moduleKey, a));
  const isRelatoriosContrato = moduleKey === RELATORIOS_CONTRATO_MODULE_KEY;

  if (!hasGranular) {
    return {
      moduleKey,
      canView: hasAcesso,
      canCreate: isRelatoriosContrato ? false : hasAcesso,
      canEdit: isRelatoriosContrato ? false : hasAcesso,
      canDelete: isRelatoriosContrato ? false : hasAcesso,
      isLoading,
    };
  }

  const canView = PERMISSION_MODULE_CRUD_ACTIONS.some((a) => canAction(moduleKey, a)) || hasAcesso;
  return {
    moduleKey,
    canView,
    canCreate: canAction(moduleKey, 'criar'),
    canEdit: canAction(moduleKey, 'editar'),
    canDelete: canAction(moduleKey, 'excluir'),
    isLoading,
  };
}
