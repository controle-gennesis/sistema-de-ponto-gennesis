import { pathToModuleKey } from '@sistema-ponto/permission-modules';

export const OC_APPROVE_COMPRAS_MODULE_KEY = pathToModuleKey('/ponto/controle/aprovar-oc-compras');
export const OC_APPROVE_GESTOR_MODULE_KEY = pathToModuleKey('/ponto/controle/aprovar-oc-gestor');
export const OC_APPROVE_DIRETORIA_MODULE_KEY = pathToModuleKey('/ponto/controle/aprovar-oc-diretoria');

export type OcApprovalPhase = 'compras' | 'gestor' | 'diretoria';
