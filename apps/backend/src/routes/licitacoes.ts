import { Router, Response, NextFunction } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { LicitacaoController } from '../controllers/LicitacaoController';
import {
  createLicitacaoHabilitacaoPendente,
  deleteLicitacaoHabilitacaoPendente,
  listLicitacaoHabilitacoesPendentes,
  readHabilitacaoQuantidade,
  readHabilitacaoUnidade,
  updateLicitacaoHabilitacaoPendente,
  type HabilitacaoPendenteStatus,
} from '../services/licitacaoHabilitacaoPendenteStore';

const router = Router();
const ctrl = new LicitacaoController();

router.use(authenticate);

router.get('/checklist-template', (req, res, next) => ctrl.getChecklistTemplate(req, res, next));
router.put('/checklist-template', (req, res, next) => ctrl.updateChecklistTemplate(req, res, next));

router.get('/planilha-regioes', (req, res, next) => ctrl.listRegiaoTabs(req, res, next));
router.get('/planilha-regioes/:regiaoKey', (req, res, next) => ctrl.getRegiaoSheet(req, res, next));
router.post('/planilha-regioes/aceites', (req, res, next) => ctrl.registrarAceiteRegiao(req, res, next));
router.delete('/planilha-regioes/aceites', (req, res, next) => ctrl.desfazerAceiteRegiao(req, res, next));
router.post('/planilha-regioes/rejeites', (req, res, next) => ctrl.registrarRejeiteRegiao(req, res, next));
router.delete('/planilha-regioes/rejeites', (req, res, next) => ctrl.desfazerRejeiteRegiao(req, res, next));
router.post('/planilha-regioes/manuais', (req, res, next) => ctrl.createManualRegiao(req, res, next));
router.patch('/planilha-regioes/manuais', (req, res, next) => ctrl.updateManualRegiao(req, res, next));
router.delete('/planilha-regioes/manuais', (req, res, next) => ctrl.deleteManualRegiao(req, res, next));
router.get('/banco-cats', (req, res, next) => ctrl.getBancoCatsSheet(req, res, next));
router.post('/banco-cats', (req, res, next) => ctrl.createBancoCatsServico(req, res, next));
router.delete('/banco-cats', (req, res, next) => ctrl.deleteBancoCatsServico(req, res, next));
router.get('/orcamento-line-template', (req, res, next) =>
  ctrl.getOrcamentoLineTemplate(req, res, next)
);
router.put('/orcamento-line-template', (req, res, next) =>
  ctrl.updateOrcamentoLineTemplate(req, res, next)
);

function requireUserId(req: AuthRequest): string {
  const userId = req.user?.id;
  if (!userId) throw createError('Não autenticado', 401);
  return userId;
}

function readHabilitacaoText(value: unknown, label: string, max: number): string {
  const text =
    typeof value === 'string'
      ? value.trim().replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n')
      : '';
  if (text.length < 2) throw createError(`Informe ${label}.`, 400);
  if (text.length > max) throw createError(`${label} deve ter no máximo ${max} caracteres.`, 400);
  return text;
}

router.get('/habilitacoes-pendentes', async (req, res, next) => {
  try {
    const data = await listLicitacaoHabilitacoesPendentes();
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.post('/habilitacoes-pendentes', async (req: AuthRequest, res, next) => {
  try {
    const titulo = readHabilitacaoText(req.body?.titulo, 'a descrição', 300);
    const acaoSugerida = readHabilitacaoText(req.body?.acaoSugerida, 'a ação sugerida', 2000);
    const quantidade = readHabilitacaoQuantidade(req.body?.quantidade);
    const unidadeMedida = readHabilitacaoUnidade(req.body?.unidadeMedida);
    const data = await createLicitacaoHabilitacaoPendente({
      titulo,
      acaoSugerida,
      quantidade,
      unidadeMedida,
      createdBy: requireUserId(req),
    });
    res.status(201).json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.patch('/habilitacoes-pendentes/:id', async (req: AuthRequest, res, next) => {
  try {
    const body = req.body ?? {};
    const hasTitulo = Object.prototype.hasOwnProperty.call(body, 'titulo');
    const hasAcao = Object.prototype.hasOwnProperty.call(body, 'acaoSugerida');
    const hasQuantidade = Object.prototype.hasOwnProperty.call(body, 'quantidade');
    const hasUnidade = Object.prototype.hasOwnProperty.call(body, 'unidadeMedida');
    const hasStatus = Object.prototype.hasOwnProperty.call(body, 'status');
    if (!hasTitulo && !hasAcao && !hasQuantidade && !hasUnidade && !hasStatus) {
      throw createError('Nenhuma alteração informada.', 400);
    }
    const status = hasStatus ? body.status : undefined;
    if (status != null && status !== 'PENDENTE' && status !== 'ADQUIRIDA') {
      throw createError('Status inválido.', 400);
    }
    const data = await updateLicitacaoHabilitacaoPendente({
      id: req.params.id,
      titulo: hasTitulo ? readHabilitacaoText(body.titulo, 'a descrição', 300) : undefined,
      acaoSugerida: hasAcao
        ? readHabilitacaoText(body.acaoSugerida, 'a ação sugerida', 2000)
        : undefined,
      quantidade: hasQuantidade ? readHabilitacaoQuantidade(body.quantidade) : undefined,
      unidadeMedida: hasUnidade ? readHabilitacaoUnidade(body.unidadeMedida) : undefined,
      status: status as HabilitacaoPendenteStatus | undefined,
      updatedBy: requireUserId(req),
    });
    if (!data) throw createError('Habilitação não encontrada.', 404);
    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

router.delete('/habilitacoes-pendentes/:id', async (req, res, next) => {
  try {
    const removed = await deleteLicitacaoHabilitacaoPendente(req.params.id);
    if (!removed) throw createError('Habilitação não encontrada.', 404);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

router.get('/', (req, res, next) => ctrl.list(req, res, next));
router.post('/', (req, res, next) => ctrl.create(req, res, next));
router.get('/:id', (req, res, next) => ctrl.getById(req, res, next));
router.patch('/:id/analise-manual', (req, res, next) => ctrl.updateAnaliseManual(req, res, next));
router.patch('/:id/assumir-analise', (req, res, next) => ctrl.assumirAnaliseManual(req, res, next));
router.patch('/:id/liberar-analise', (req, res, next) => ctrl.liberarAnaliseManual(req, res, next));
router.patch('/:id/finalizar-analise', (req, res, next) => ctrl.finalizarAnaliseManual(req, res, next));
router.patch('/:id/arquivar', (req, res, next) => ctrl.arquivarAnalise(req, res, next));
router.patch('/:id/desarquivar', (req, res, next) => ctrl.desarquivarAnalise(req, res, next));
router.patch('/:id/analise-etapa', (req, res, next) => ctrl.setAnaliseEtapa(req, res, next));
router.get('/:id/orcamento', (req, res, next) => ctrl.getOrcamento(req, res, next));
router.put('/:id/orcamento', (req, res, next) => ctrl.saveOrcamento(req, res, next));
router.post('/:id/orcamento/anexo', (req: AuthRequest, res: Response, next: NextFunction) => {
  ctrl.uploadMiddleware(req, res, (err: unknown) => {
    if (err) {
      const msg = err instanceof Error ? err.message : 'Erro no upload';
      res.status(400).json({ success: false, message: msg });
      return;
    }
    void ctrl.uploadOrcamentoAnexo(req, res, next);
  });
});
router.delete('/:id/orcamento/anexo/:anexoId', (req, res, next) =>
  ctrl.removeOrcamentoAnexo(req, res, next)
);
router.patch('/:id', (req, res, next) => ctrl.update(req, res, next));
router.delete('/:id', (req, res, next) => ctrl.delete(req, res, next));

router.post('/:id/documentos', (req: AuthRequest, res: Response, next: NextFunction) => {
  ctrl.uploadMiddleware(req, res, (err: unknown) => {
    if (err) {
      const msg = err instanceof Error ? err.message : 'Erro no upload';
      res.status(400).json({ success: false, message: msg });
      return;
    }
    void ctrl.uploadDocument(req, res, next);
  });
});

router.delete('/:id/documentos/:documentoId', (req, res, next) => ctrl.removeDocument(req, res, next));
router.post('/:id/extrair', (req, res, next) => ctrl.extrair(req, res, next));
router.post('/:id/perguntar', (req, res, next) => ctrl.perguntar(req, res, next));

export default router;
