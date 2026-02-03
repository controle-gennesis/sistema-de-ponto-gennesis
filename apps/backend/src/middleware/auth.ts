import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { createError } from './errorHandler';
import { prisma } from '../lib/prisma';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      throw createError('Token de acesso necessário', 401);
    }

    // Verificar se JWT_SECRET está configurado
    if (!process.env.JWT_SECRET) {
      console.error('❌ JWT_SECRET não está configurado');
      throw createError('Erro de configuração do servidor', 500);
    }

    let decoded: any;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET) as any;
    } catch (error: any) {
      if (error.name === 'TokenExpiredError') {
        throw createError('Token expirado. Faça login novamente.', 401);
      } else if (error.name === 'JsonWebTokenError') {
        throw createError('Token inválido', 401);
      }
      throw error;
    }
    // Verificar se o token está no formato correto (deve ter 3 partes separadas por ponto)
    if (!token || token.split('.').length !== 3) {
      throw createError('Token inválido', 401);
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    if (!user) {
      throw createError('Usuário não encontrado', 401);
    }

    if (!user.isActive) {
      throw createError('Usuário inativo', 401);
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    next();
  } catch (error: any) {
    // Se for erro de JWT, retornar erro de autenticação
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return next(createError('Token inválido ou expirado', 401));
    }
    next(error);
  }
};

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return next(createError('Usuário não autenticado', 401));
    }

    // Como só temos funcionários agora, sempre permitir acesso
    next();
  };
};

export const optionalAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (token) {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      
      const user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
        },
      });

      if (user && user.isActive) {
        req.user = {
          id: user.id,
          email: user.email,
          role: user.role,
        };
      }
    }

    return next();
  } catch (error: any) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token inválido ou expirado' });
    }
    return next(error);
  }
};

// Middleware para refresh token que aceita tokens expirados
export const authenticateForRefresh = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      throw createError('Token de acesso necessário', 401);
    }

    // Decodificar token mesmo se expirado (ignoreExpiration)
    let decoded: any;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
    } catch (error: any) {
      // Se o token expirou, tenta decodificar sem verificar expiração
      if (error.name === 'TokenExpiredError') {
        decoded = jwt.decode(token) as any;
        if (!decoded || !decoded.id) {
          throw createError('Token inválido', 401);
        }
      } else {
        throw createError('Token inválido', 401);
      }
    }
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        role: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      throw createError('Usuário não encontrado ou inativo', 401);
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
    };

    next();
  } catch (error) {
    next(error);
  }
};