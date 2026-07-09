import { Response, NextFunction } from 'express';
import multer from 'multer';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { licitacaoService } from '../services/LicitacaoService';
import {
  isLicitacaoArquivadaMotivo,
  type LicitacaoArquivadaMotivo,
} from '../services/licitacaoStore';
import {
  canUserManageLicitacaoChecklist,
  getLicitacaoChecklistTemplate,
  updateLicitacaoChecklistTemplate,
} from '../services/licitacaoChecklistTemplateService';
import {
  fetchLicitacaoRegiaoSheet,
  findLicitacaoRegiaoTab,
  invalidateLicitacaoRegiaoSheetCache,
  listLicitacoesRegiaoTabs,
} from '../services/LicitacoesPlanilhaSheetsService';
import {
  createLicitacaoRegiaoAceites,
  clearProcessoExcluidoForAceites,
  deleteLicitacaoRegiaoAceites,
  getLicitacaoRegiaoAceitesByRowKeys,
  getLicitacaoIdsForAceiteRowKeys,
} from '../services/licitacaoRegiaoAceiteStore';
import {
  removeLicitacoesLinkedToAceites,
  syncAceitesToLicitacoes,
  syncAllPendingAceitesToLicitacoes,
} from '../services/licitacaoRegiaoAceiteLicitacaoSync';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed =
      /\.(pdf|png|jpe?g|webp|gif|txt|xlsx|xls)$/i.test(file.originalname) ||
      [
        'application/pdf',
        'image/png',
        'image/jpeg',
        'image/webp',
        'image/gif',
        'text/plain',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-excel',
      ].includes(file.mimetype);
    if (!allowed) {
      cb(new Error('Formato não suportado. Envie PDF, imagem, TXT ou planilha Excel.'));
      return;
    }
    cb(null, true);
  },
});

export class LicitacaoController {
  uploadMiddleware = upload.single('file');

  async listRegiaoTabs(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      res.json({ success: true, data: listLicitacoesRegiaoTabs() });
    } catch (error) {
      next(error);
    }
  }

  async getRegiaoSheet(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const forceRefresh =
        req.query.refresh === '1' ||
        req.query.refresh === 'true' ||
        typeof req.query.t === 'string';
      const data = await fetchLicitacaoRegiaoSheet(req.params.regiaoKey, forceRefresh);
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.json({ success: true, data });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao consultar planilha';
      const status = message.includes('não encontrada') ? 404 : 502;
      next(createError(message, status));
    }
  }

  async registrarAceiteRegiao(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const regiaoKey = typeof req.body?.regiaoKey === 'string' ? req.body.regiaoKey.trim() : '';
      const spreadsheetId =
        typeof req.body?.spreadsheetId === 'string' ? req.body.spreadsheetId.trim() : '';
      const items = Array.isArray(req.body?.items) ? req.body.items : [];

      if (!regiaoKey || !findLicitacaoRegiaoTab(regiaoKey)) {
        throw createError('Região inválida.', 400);
      }
      if (!spreadsheetId) {
        throw createError('Planilha inválida.', 400);
      }
      if (items.length === 0) {
        throw createError('Selecione ao menos uma licitação.', 400);
      }

      const normalizedItems = items
        .map((item: unknown) => {
          if (!item || typeof item !== 'object') return null;
          const rowKey = typeof (item as { rowKey?: string }).rowKey === 'string'
            ? (item as { rowKey: string }).rowKey.trim()
            : '';
          if (!rowKey) return null;
          const snapshot = (item as { rowSnapshot?: Record<string, string> }).rowSnapshot;
          return {
            rowKey,
            rowSnapshot:
              snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
                ? snapshot
                : null,
          };
        })
        .filter(Boolean) as Array<{ rowKey: string; rowSnapshot?: Record<string, string> | null }>;

      if (normalizedItems.length === 0) {
        throw createError('Selecione ao menos uma licitação válida.', 400);
      }

      const created = await createLicitacaoRegiaoAceites({
        regiaoKey,
        spreadsheetId,
        acceptedBy: req.user!.id,
        items: normalizedItems,
      });

      invalidateLicitacaoRegiaoSheetCache(regiaoKey);

      const rowKeys = normalizedItems.map((item) => item.rowKey);
      const aceites =
        created.length > 0
          ? created
          : await getLicitacaoRegiaoAceitesByRowKeys(regiaoKey, spreadsheetId, rowKeys);

      // Se o processo foi excluído antes mantendo o aceite, reabrir para sync.
      await clearProcessoExcluidoForAceites(aceites.map((a) => a.id));

      await syncAceitesToLicitacoes(aceites);

      res.status(201).json({
        success: true,
        data: aceites.map((aceite) => ({
          rowKey: aceite.rowKey,
          acceptedBy: aceite.acceptedBy,
          acceptedByName: aceite.acceptedByName,
          acceptedAt: aceite.acceptedAt.toISOString(),
        })),
        message:
          created.length > 0
            ? `${created.length} licitação(ões) receberam aceite da diretoria.`
            : 'As licitações selecionadas já possuíam aceite registrado.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao registrar aceite';
      next(error instanceof Error ? createError(message, 400) : error);
    }
  }

  async desfazerAceiteRegiao(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const regiaoKey = typeof req.body?.regiaoKey === 'string' ? req.body.regiaoKey.trim() : '';
      const spreadsheetId =
        typeof req.body?.spreadsheetId === 'string' ? req.body.spreadsheetId.trim() : '';
      const rowKeys = Array.isArray(req.body?.rowKeys) ? req.body.rowKeys : [];

      if (!regiaoKey || !findLicitacaoRegiaoTab(regiaoKey)) {
        throw createError('Região inválida.', 400);
      }
      if (!spreadsheetId) {
        throw createError('Planilha inválida.', 400);
      }

      const normalizedRowKeys = rowKeys
        .map((key: unknown) => (typeof key === 'string' ? key.trim() : ''))
        .filter(Boolean);

      if (normalizedRowKeys.length === 0) {
        throw createError('Selecione ao menos uma licitação com aceite.', 400);
      }

      const licitacaoIds = await getLicitacaoIdsForAceiteRowKeys({
        regiaoKey,
        spreadsheetId,
        rowKeys: normalizedRowKeys,
      });

      const deletedRowKeys = await deleteLicitacaoRegiaoAceites({
        regiaoKey,
        spreadsheetId,
        rowKeys: normalizedRowKeys,
      });

      await removeLicitacoesLinkedToAceites(licitacaoIds);

      invalidateLicitacaoRegiaoSheetCache(regiaoKey);

      res.json({
        success: true,
        data: { rowKeys: deletedRowKeys },
        message:
          deletedRowKeys.length > 0
            ? `${deletedRowKeys.length} aceite(s) desfeito(s).`
            : 'Nenhum aceite encontrado para remover.',
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao desfazer aceite';
      next(error instanceof Error ? createError(message, 400) : error);
    }
  }

  async list(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search : undefined;
      const dataInicio = typeof req.query.dataInicio === 'string' ? req.query.dataInicio : undefined;
      const dataFim = typeof req.query.dataFim === 'string' ? req.query.dataFim : undefined;
      const regiaoKey = typeof req.query.regiaoKey === 'string' ? req.query.regiaoKey : undefined;
      const estado = typeof req.query.estado === 'string' ? req.query.estado : undefined;
      const arquivadaRaw =
        typeof req.query.arquivada === 'string' ? req.query.arquivada.trim().toLowerCase() : '';
      const arquivada =
        arquivadaRaw === 'true' || arquivadaRaw === '1'
          ? true
          : arquivadaRaw === 'all'
            ? ('all' as const)
            : false;
      const arquivadaMotivoRaw =
        typeof req.query.arquivadaMotivo === 'string' ? req.query.arquivadaMotivo.trim().toLowerCase() : '';
      const arquivadaMotivo = isLicitacaoArquivadaMotivo(arquivadaMotivoRaw)
        ? arquivadaMotivoRaw
        : undefined;
      const data = await licitacaoService.list({
        search,
        dataInicio,
        dataFim,
        regiaoKey,
        estado,
        arquivada,
        arquivadaMotivo,
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async getById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await licitacaoService.getById(req.params.id);
      if (!data) throw createError('Licitação não encontrada', 404);
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async create(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { titulo, numeroProcesso, orgao, modalidade } = req.body ?? {};
      const data = await licitacaoService.create(req.user!.id, {
        titulo,
        numeroProcesso,
        orgao,
        modalidade,
      });
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error instanceof Error ? createError(error.message, 400) : error);
    }
  }

  async update(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await licitacaoService.update(req.params.id, req.body ?? {});
      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }

  async updateAnaliseManual(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const body = req.body ?? {};
      const data = await licitacaoService.update(req.params.id, {
        responsavelAnalise: body.responsavelAnalise,
        linkNotebookLm: body.linkNotebookLm,
        analiseUsuario: body.analiseUsuario,
        checklistAnalise: body.checklistAnalise,
        decisaoAnaliseFinal: body.decisaoAnaliseFinal,
        analiseFinalTexto: body.analiseFinalTexto,
      });
      res.json({ success: true, data });
    } catch (error) {
      next(error instanceof Error ? createError(error.message, 400) : error);
    }
  }

  async finalizarAnaliseManual(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await licitacaoService.finalizarAnaliseManual(req.params.id);
      res.json({ success: true, data });
    } catch (error) {
      next(error instanceof Error ? createError(error.message, 400) : error);
    }
  }

  async arquivarAnalise(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const motivoRaw =
        typeof req.body?.motivo === 'string' ? req.body.motivo.trim().toLowerCase() : '';
      if (!isLicitacaoArquivadaMotivo(motivoRaw)) {
        throw createError(
          'Informe o motivo do arquivamento: suspensa, declinada, encerrada, em andamento, vencidas ou aguardando aprovação.',
          400
        );
      }
      const motivo = motivoRaw as LicitacaoArquivadaMotivo;
      const data = await licitacaoService.arquivarAnalise(req.params.id, motivo);
      const messageByMotivo: Record<LicitacaoArquivadaMotivo, string> = {
        suspensa: 'Status definido como suspensa.',
        declinada: 'Status definido como declinada.',
        encerrada: 'Status definido como encerrada.',
        em_andamento: 'Status definido como em andamento.',
        vencidas: 'Status definido como vencida.',
        aguardando_aprovacao: 'Status definido como aguardando aprovação.',
      };
      res.json({ success: true, data, message: messageByMotivo[motivo] });
    } catch (error) {
      next(error instanceof Error ? createError(error.message, 400) : error);
    }
  }

  async desarquivarAnalise(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const data = await licitacaoService.desarquivarAnalise(req.params.id);
      res.json({ success: true, data, message: 'Análise restaurada para a fila.' });
    } catch (error) {
      next(error instanceof Error ? createError(error.message, 400) : error);
    }
  }

  async delete(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await licitacaoService.delete(req.params.id);
      res.json({ success: true });
    } catch (error) {
      next(error instanceof Error ? createError(error.message, 400) : error);
    }
  }

  async uploadDocument(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.file?.buffer) throw createError('Selecione um arquivo', 400);
      const data = await licitacaoService.addDocument(req.params.id, req.file);
      res.status(201).json({ success: true, data });
    } catch (error) {
      next(error instanceof Error ? createError(error.message, 400) : error);
    }
  }

  async removeDocument(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await licitacaoService.removeDocument(req.params.id, req.params.documentoId);
      res.json({ success: true });
    } catch (error) {
      next(error instanceof Error ? createError(error.message, 400) : error);
    }
  }

  async extrair(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const result = await licitacaoService.extrairInformacoes(req.params.id);
      if (result.origem === 'indisponivel') {
        res.json({ success: true, data: result });
        return;
      }
      const licitacao = await licitacaoService.getById(req.params.id);
      res.json({ success: true, data: licitacao, extracao: result });
    } catch (error) {
      next(error instanceof Error ? createError(error.message, 400) : error);
    }
  }

  async getChecklistTemplate(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const template = await getLicitacaoChecklistTemplate();
      res.json({
        success: true,
        data: template,
        canManage: canUserManageLicitacaoChecklist(req.user?.email),
      });
    } catch (error) {
      next(error);
    }
  }

  async updateChecklistTemplate(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const template = await updateLicitacaoChecklistTemplate(
        req.body?.sections,
        req.user?.email
      );
      res.json({
        success: true,
        data: template,
        canManage: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Erro ao atualizar checklist';
      const status = message.includes('Sem permissão') ? 403 : 400;
      next(error instanceof Error ? createError(message, status) : error);
    }
  }

  async perguntar(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const pergunta = typeof req.body?.pergunta === 'string' ? req.body.pergunta : '';
      const data = await licitacaoService.perguntar(req.params.id, pergunta);
      res.json({ success: true, data });
    } catch (error) {
      next(error instanceof Error ? createError(error.message, 400) : error);
    }
  }
}
