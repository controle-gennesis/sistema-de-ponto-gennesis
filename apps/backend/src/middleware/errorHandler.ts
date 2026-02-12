import { Request, Response, NextFunction } from 'express';

export interface AppError extends Error {
  statusCode?: number;
  isOperational?: boolean;
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let error = { ...err };
  error.message = err.message;

  // Log detalhado no servidor (importante para debug)
  // Não logar erros 401 esperados (como "Token de acesso necessário") como erros críticos
  const isExpected401 = (err.statusCode === 401 && (
    err.message?.includes('Token de acesso necessário') ||
    err.message?.includes('Token inválido') ||
    err.message?.includes('Token expirado') ||
    err.message?.includes('Token inválido ou expirado')
  )) || err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError';

  if (isExpected401) {
    // Log apenas em modo debug para erros 401 esperados
    if (process.env.NODE_ENV === 'development') {
      console.log('🔐 Requisição sem autenticação:', {
        path: req.path,
        method: req.method,
        message: err.message,
      });
    }
  } else {
    // Log normal para outros erros
    console.error('❌ Erro capturado:', {
      name: err.name,
      message: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
  }

  // 🔸 Erros do Prisma
  if (err.name === 'PrismaClientValidationError') {
    error = { message: 'Dados inválidos fornecidos', statusCode: 400 } as AppError;
  }

  if (err.name === 'PrismaClientKnownRequestError') {
    // P2002 é erro de chave única
    const message =
      (err as any).code === 'P2002'
        ? 'Recurso já existe (violação de chave única)'
        : 'Erro ao processar a solicitação do banco de dados';
    error = { message, statusCode: 409 } as AppError;
  }

  // 🔸 Registro não encontrado
  if (err.name === 'NotFoundError') {
    error = { message: 'Recurso não encontrado', statusCode: 404 } as AppError;
  }

  // 🔸 Erros JWT
  if (err.name === 'JsonWebTokenError') {
    error = { message: 'Token inválido', statusCode: 401 } as AppError;
  }

  if (err.name === 'TokenExpiredError') {
    error = { message: 'Token expirado', statusCode: 401 } as AppError;
  }

  // 🔸 Erros de validação de dados
  if (err.name === 'ValidationError') {
    const message = Object.values((err as any).errors)
      .map((val: any) => val.message)
      .join(', ');
    error = { message, statusCode: 400 } as AppError;
  }

  // 🔸 Erros de formato de ID
  if (err.name === 'CastError') {
    error = { message: 'Formato de ID inválido', statusCode: 400 } as AppError;
  }

  // 🔸 Fallback — Erro genérico
  const statusCode = error.statusCode || 500;
  const message = error.message || 'Erro interno do servidor';

  // 🔸 Garantir que headers CORS sejam enviados mesmo em caso de erro
  const origin = req.headers.origin;
  if (origin && (origin.includes('railway.app') || origin.includes('localhost'))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  // 🔸 Retorno padronizado
  res.status(statusCode).json({
    success: false,
    error: message,
    message: message, // Incluir também em 'message' para compatibilidade
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

// 🔹 Função auxiliar para criar erros customizados
export const createError = (message: string, statusCode: number = 500): AppError => {
  const error: AppError = new Error(message);
  error.statusCode = statusCode;
  error.isOperational = true;
  return error;
};
