import { Router } from 'express';
import {
  getDpRequestMessages,
  getDpRequestUnreadMessages,
  postDpRequestMessage,
} from '../lib/dpRequestMessages';
import { authenticate, requireAdministrator } from '../middleware/auth';
import { requireDpApproverAccess, requireModuleAccess } from '../middleware/permissionAuth';
import { pathToModuleKey } from '@sistema-ponto/permission-modules';
import { DpRequestController } from '../controllers/DpRequestController';
import { DpContabilidadeController } from '../controllers/DpContabilidadeController';

const router = Router();
const controller = new DpRequestController();
const contabilidadeController = new DpContabilidadeController();

const myModule = pathToModuleKey('/ponto/solicitacoes-dp');
const accountingModule = pathToModuleKey('/ponto/solicitacoes-contabilidade');
const manageModule = pathToModuleKey('/ponto/gerenciar-solicitacoes-dp');
const admTstManageModule = pathToModuleKey('/ponto/gerenciar-solicitacoes-adm-tst');

router.use(authenticate);

// Conversa entre DP, Administração e Contabilidade (permissão checada dentro de cada rota)
router.get('/mensagens/nao-lidas', getDpRequestUnreadMessages);
router.get('/:id/mensagens', getDpRequestMessages);
router.post('/:id/mensagens', postDpRequestMessage);
router.get('/contratos-elegiveis', requireModuleAccess(myModule), controller.getEligibleContracts.bind(controller));
router.get(
  '/centros-custo-elegiveis',
  requireModuleAccess(myModule),
  controller.getEligibleCostCenters.bind(controller)
);

// Minhas solicitações (EMPLOYEE / DP usuário)
router.get('/minhas', requireModuleAccess(myModule), controller.getMyRequests.bind(controller));
router.get(
  '/minhas/pendencias-count',
  requireModuleAccess(myModule),
  controller.getMyReturnPendingCount.bind(controller)
);
router.get(
  '/contabilidade',
  requireModuleAccess(accountingModule),
  controller.getAccountingRequests.bind(controller)
);
router.post('/', requireModuleAccess(myModule), controller.createRequest.bind(controller));
router.put('/:id/requester-return', requireModuleAccess(myModule), controller.requesterReturn.bind(controller));

// Aprovações (gestor/aprovador)
router.get('/aprovacoes', requireDpApproverAccess, controller.getWaitingManagerApprovals.bind(controller));
router.put('/:id/manager-approve', requireDpApproverAccess, controller.approveManager.bind(controller));
router.put('/:id/manager-reject', requireDpApproverAccess, controller.rejectManager.bind(controller));
/** Admin: cancelar solicitação mesmo após aprovação do gestor. */
router.put(
  '/:id/admin-cancel',
  requireAdministrator,
  controller.adminCancel.bind(controller)
);

// Fila DP (feedback/conclusão) — somente tipos do Departamento Pessoal
router.get('/gerenciar', requireModuleAccess(manageModule), controller.getForApproval.bind(controller));
router.get(
  '/gerenciar-adm-tst',
  requireModuleAccess(admTstManageModule),
  controller.getForAdmTstManagement.bind(controller)
);
router.get(
  '/gerenciar/:id/detalhes',
  requireModuleAccess(manageModule),
  controller.getManageDetailsDp.bind(controller)
);
router.get(
  '/gerenciar-adm-tst/:id/detalhes',
  requireModuleAccess(admTstManageModule),
  controller.getManageDetailsAdmTst.bind(controller)
);
router.put('/:id/dp-feedback', controller.dpFeedback.bind(controller));
// O DP encerra o pedido ligado na Contabilidade (permissão de Gerenciar Solicitações do DP)
router.post(
  '/:id/concluir-contabilidade',
  requireModuleAccess(manageModule),
  contabilidadeController.concludeFromDp.bind(contabilidadeController)
);
router.post('/:id/reenviar-contabilidade', controller.resendToAccounting.bind(controller));

export default router;

