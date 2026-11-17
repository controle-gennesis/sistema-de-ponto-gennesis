import { Router } from 'express';
import multer from 'multer';
import {
  deleteDpRequestAttachment,
  getDpRequestAttachments,
  getDpRequestMessages,
  getDpRequestUnreadMessages,
  postDpRequestAttachment,
  postDpRequestMessage,
} from '../lib/dpRequestMessages';
import { authenticate, requireAdministrator } from '../middleware/auth';
import { requireAnyModuleAccess, requireDpApproverAccess, requireModuleAccess } from '../middleware/permissionAuth';
import { pathToModuleKey } from '@sistema-ponto/permission-modules';
import { DpRequestController } from '../controllers/DpRequestController';
import { DpContabilidadeController } from '../controllers/DpContabilidadeController';
import { requireDpContabilidadeAccess } from '../lib/dpContabilidadeAccess';

const router = Router();
const uploadAnexo = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });
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
router.post(
  '/:id/contabilidade-concluiu',
  requireDpContabilidadeAccess,
  contabilidadeController.concludeFromAccounting.bind(contabilidadeController)
);
router.get('/:id/anexos', getDpRequestAttachments);
router.post('/:id/anexos', uploadAnexo.single('file'), postDpRequestAttachment);
router.delete('/:id/anexos/:attachmentId', deleteDpRequestAttachment);
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
router.get(
  '/contabilidade/para-encerrar-count',
  requireModuleAccess(accountingModule),
  controller.getAccountingToCloseCount.bind(controller)
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
// O DP encerra o pedido ligado na Contabilidade (a partir de Solicitações Contábeis; Gerenciar do DP também vale)
router.post(
  '/:id/concluir-contabilidade',
  requireAnyModuleAccess([manageModule, accountingModule]),
  contabilidadeController.concludeFromDp.bind(contabilidadeController)
);
// O solicitante cancela uma solicitação contábil enviada errada (antes da Contabilidade concluir)
router.post(
  '/:id/cancelar-contabilidade',
  requireModuleAccess(myModule),
  contabilidadeController.cancelFromRequester.bind(contabilidadeController)
);
// A Contabilidade devolve o pedido para o solicitante ajustar; ele corrige e reenvia
router.post(
  '/:id/devolver-contabilidade',
  requireDpContabilidadeAccess,
  contabilidadeController.returnForAdjustment.bind(contabilidadeController)
);
router.put(
  '/:id/ajustar-contabilidade',
  requireModuleAccess(myModule),
  contabilidadeController.resubmitAfterAdjustment.bind(contabilidadeController)
);
router.post('/:id/reenviar-contabilidade', controller.resendToAccounting.bind(controller));

export default router;

