import { Request, Response } from 'express';
import { FluigService } from '../services/FluigService';

export const fluigService = new FluigService();

type FluigHttpError = {
  response?: { data?: unknown; status?: number };
  message?: string;
};

function fluigErrorResponse(error: unknown, fallbackMessage: string) {
  const err = (error ?? {}) as FluigHttpError;
  const status = err.response?.status || 500;
  const message =
    (err.response?.data as { message?: string } | undefined)?.message ||
    err.message ||
    fallbackMessage;
  return { status, message };
}

export async function getAvailableDatasets(req: Request, res: Response) {
  try {
    const datasets = await fluigService.getAvailableDatasets();
    return res.json({ success: true, data: datasets });
  } catch (error: unknown) {
    console.error('Fluig getAvailableDatasets error:', error);
    const { status, message } = fluigErrorResponse(error, 'Erro ao buscar datasets');
    return res.status(status).json({ success: false, message });
  }
}

export async function getDatasetStructure(req: Request, res: Response) {
  try {
    const { datasetId } = req.params;
    if (!datasetId) {
      return res.status(400).json({ success: false, message: 'datasetId é obrigatório' });
    }
    const structure = await fluigService.getDatasetStructure(datasetId);
    return res.json({ success: true, data: structure });
  } catch (error: unknown) {
    console.error('Fluig getDatasetStructure error:', error);
    const { status, message } = fluigErrorResponse(error, 'Erro ao buscar estrutura');
    return res.status(status).json({ success: false, message });
  }
}

export async function getDatasetData(req: Request, res: Response) {
  try {
    const { datasetId } = req.params;
    if (!datasetId) {
      return res.status(400).json({ success: false, message: 'datasetId é obrigatório' });
    }
    const { fields, constraints, order } = req.body || {};
    const startedAt = Date.now();
    const data = await fluigService.getDatasetData(datasetId, {
      fields: Array.isArray(fields) ? fields : undefined,
      constraints: Array.isArray(constraints) ? constraints : undefined,
      order: Array.isArray(order) ? order : undefined,
    });
    const elapsed = Date.now() - startedAt;
    res.setHeader('X-Fluig-Cache', elapsed < 200 ? 'HIT' : 'MISS');
    res.setHeader('X-Fluig-Elapsed-Ms', String(elapsed));
    return res.json({ success: true, data });
  } catch (error: unknown) {
    console.error('Fluig getDatasetData error:', error);
    const { status, message } = fluigErrorResponse(error, 'Erro ao buscar dados');
    return res.status(status).json({ success: false, message });
  }
}

export async function searchDataset(req: Request, res: Response) {
  try {
    const { datasetId } = req.params;
    if (!datasetId) {
      return res.status(400).json({ success: false, message: 'datasetId é obrigatório' });
    }
    const body = req.body || {};
    const data = await fluigService.searchDataset(datasetId, {
      searchField: body.searchField,
      searchValue: body.searchValue,
      filterFields: body.filterFields,
      resultFields: body.resultFields,
      likeField: body.likeField,
      likeValue: body.likeValue,
      limit: body.limit,
      orderBy: body.orderBy,
    });
    return res.json({ success: true, data });
  } catch (error: unknown) {
    console.error('Fluig searchDataset error:', error);
    const { status, message } = fluigErrorResponse(error, 'Erro na busca');
    return res.status(status).json({ success: false, message });
  }
}

function guessContentTypeFromFilename(filename: string): string | null {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.txt')) return 'text/plain; charset=utf-8';
  if (lower.endsWith('.csv')) return 'text/csv; charset=utf-8';
  if (lower.endsWith('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  if (lower.endsWith('.xls')) return 'application/vnd.ms-excel';
  if (lower.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (lower.endsWith('.doc')) return 'application/msword';
  return null;
}

function sanitizeDownloadFilename(raw: string, fallbackId: string): string {
  const cleaned = String(raw || '')
    .replace(/[\r\n\0]/g, '')
    .replace(/[\\/:*?"<>|]+/g, '_')
    .trim();
  return cleaned || `anexo-fluig-${fallbackId}`;
}

/** Metadados de anexos (nome real no GED) — corrige lista nomes/ids desalinhada do dataset. */
export async function getDocumentsMeta(req: Request, res: Response) {
  try {
    const raw = Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]) : [];
    const ids: string[] = Array.from(
      new Set(
        raw
          .map((v) => String(v ?? '').trim())
          .filter((v): v is string => /^\d+$/.test(v))
      )
    ).slice(0, 40);
    if (ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Informe ids numéricos de documento' });
    }
    const items = await Promise.all(ids.map((id) => fluigService.getDocumentFileMeta(id)));
    return res.json({ success: true, data: items });
  } catch (error: unknown) {
    console.error('Fluig getDocumentsMeta error:', error);
    const { status, message } = fluigErrorResponse(error, 'Erro ao buscar metadados dos anexos');
    return res.status(status).json({ success: false, message });
  }
}

/** Proxy autenticado: visualizar/baixar anexo do Fluig sem abrir o portal. */
export async function downloadDocument(req: Request, res: Response) {
  try {
    const documentId = String(req.params.documentId || '').trim();
    if (!/^\d+$/.test(documentId)) {
      return res.status(400).json({ success: false, message: 'documentId inválido' });
    }

    const dispositionRaw = String(req.query.disposition || 'attachment').toLowerCase();
    const disposition = dispositionRaw === 'inline' ? 'inline' : 'attachment';
    const filename = sanitizeDownloadFilename(
      String(req.query.filename || ''),
      documentId
    );

    const file = await fluigService.downloadDocumentFile(documentId);
    const contentType =
      guessContentTypeFromFilename(filename) ||
      file.contentType ||
      'application/octet-stream';

    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename*=UTF-8''${encodeURIComponent(filename)}`
    );
    res.setHeader('Cache-Control', 'private, max-age=120');
    res.setHeader('Content-Length', String(file.buffer.length));
    return res.status(200).send(file.buffer);
  } catch (error: unknown) {
    console.error('Fluig downloadDocument error:', error);
    const status =
      typeof (error as { status?: number })?.status === 'number'
        ? (error as { status: number }).status
        : fluigErrorResponse(error, 'Erro ao baixar documento').status;
    const message =
      (error as { message?: string })?.message ||
      fluigErrorResponse(error, 'Erro ao baixar documento').message;
    return res.status(status || 500).json({ success: false, message });
  }
}
