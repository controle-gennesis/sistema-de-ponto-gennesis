'use client';

import {
  pathToModuleKey,
  PERMISSION_MODULE_CRUD_ACTIONS,
  isCadastroCrudModuleKey,
} from '@sistema-ponto/permission-modules';
import { usePermissions } from '@/hooks/usePermissions';

export type CadastroCrudAction = (typeof PERMISSION_MODULE_CRUD_ACTIONS)[number];

/**
 * CRUD da matriz de Cadastros (Ver/Criar/Editar/Excluir).
 * Legado: só `acesso` no módulo → libera tudo.
 * Com qualquer linha granular (`ver`/`criar`/…) → só as ações marcadas.
 */
export function useCadastroCrudPermissions(routeHref: string) {
  const { can, canAction, isElevatedUser, isLoading } = usePermissions();
  const moduleKey = pathToModuleKey(routeHref);

  if (!isCadastroCrudModuleKey(moduleKey)) {
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

  if (!hasGranular) {
    return {
      moduleKey,
      canView: hasAcesso,
      canCreate: hasAcesso,
      canEdit: hasAcesso,
      canDelete: hasAcesso,
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
