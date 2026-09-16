import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import type { SignOptions } from 'jsonwebtoken';
import jwt from 'jsonwebtoken';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { comparePassword, hashPassword } from '../lib/passwordHash';
import { ChatService } from '../services/ChatService';
import { emailService } from '../services/EmailService';
import { findUserByLoginIdentifier, normalizeLoginIdentifier } from '../lib/loginIdentifier';
import { recordSuccessfulLogin, recordSuccessfulLogout } from './UserActivityController';
import { recordAuditEvent } from '../lib/auditLog';
import { getRequestContext } from '../lib/requestContext';
import { encodeImpersonationSource } from '../lib/impersonationLoginEvents';

const chatUploadService = new ChatService();

const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

/** O token só trafega por e-mail; no banco guardamos apenas o hash. */
function hashResetToken(rawToken: string) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function resolveFrontendBaseUrl() {
  const configured =
    process.env.FRONTEND_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    'http://localhost:3000';
  return configured.replace(/\/$/, '');
}

async function findValidResetToken(rawToken: string) {
  const token = rawToken.trim();
  if (!token) return null;

  const record = await prisma.passwordResetToken.findUnique({
    where: { token: hashResetToken(token) },
    include: { user: { select: { id: true, name: true, email: true, isActive: true } } },
  });

  if (!record || record.used || record.expiresAt <= new Date() || !record.user.isActive) {
    return null;
  }
  return record;
}

function maskEmail(email: string | null) {
  if (!email) return null;
  const [local, domain] = email.split('@');
  if (!domain) return null;
  const visible = local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(local.length - 2, 1))}@${domain}`;
}

const userMeSelect = {
  id: true,
  email: true,
  name: true,
  cpf: true,
  role: true,
  isActive: true,
  isFirstLogin: true,
  profilePhotoUrl: true,
  profilePhotoKey: true,
  lastLoginAt: true,
  lastSeenAt: true,
  lastActivityPath: true,
  lastActivityLabel: true,
  createdAt: true,
  updatedAt: true,
  employee: true,
} as const;

type SignSessionUser = {
  id: string;
  email: string;
  role: string;
};

function signSessionToken(
  user: SignSessionUser,
  opts?: { impersonating?: boolean; originalAdminId?: string; expiresIn?: SignOptions['expiresIn'] }
) {
  const payload: Record<string, unknown> = {
    id: user.id,
    email: user.email,
    role: user.role,
  };
  if (opts?.impersonating && opts.originalAdminId) {
    payload.impersonating = true;
    payload.originalAdminId = opts.originalAdminId;
  }
  return jwt.sign(payload, process.env.JWT_SECRET as string, {
    expiresIn: opts?.expiresIn ?? '7d',
  });
}

async function recordImpersonationLoginEvent(
  req: Request,
  opts: {
    userId: string;
    type: 'impersonate' | 'stop_impersonate' | 'impersonated_by';
    targetUserId?: string;
    targetName?: string;
    adminUserId?: string;
    adminName?: string;
  }
) {
  const ctx = getRequestContext();
  const forwarded = req.headers['x-forwarded-for'];
  const ipAddress =
    ctx?.ipAddress ||
    (typeof forwarded === 'string' && forwarded.split(',')[0]?.trim()) ||
    req.ip ||
    null;
  const userAgent =
    ctx?.userAgent ||
    (typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : null);

  await prisma.userLoginEvent.create({
    data: {
      userId: opts.userId,
      type: opts.type,
      success: true,
      source: encodeImpersonationSource({
        channel: 'web',
        targetUserId: opts.targetUserId,
        targetName: opts.targetName,
        adminUserId: opts.adminUserId,
        adminName: opts.adminName,
      }),
      ipAddress,
      userAgent,
    },
  });
}

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password, name, cpf, role = 'EMPLOYEE' } = req.body;

      // Verificar se usuário já existe
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { email },
            { cpf }
          ]
        }
      });

      if (existingUser) {
        throw createError('Usuário já existe com este email ou CPF', 400);
      }

      // Criptografar senha
      const hashedPassword = await hashPassword(password);

      // Criar usuário
      const user = await prisma.user.create({
        data: {
          email,
          password: hashedPassword,
          name,
          cpf,
          role,
        },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true,
        }
      });

      // Não emite token de sessão: registro é administrativo (ver rota protegida)
      return res.status(201).json({
        success: true,
        data: {
          user,
        },
        message: 'Usuário criado com sucesso'
      });
    } catch (error) {
      return next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const identifier = normalizeLoginIdentifier(req.body?.identifier ?? req.body?.email);
      const { password } = req.body;

      if (!identifier || !password) {
        throw createError('E-mail/CPF e senha são obrigatórios', 400);
      }

      // Verificar se JWT_SECRET está configurado
      if (!process.env.JWT_SECRET) {
        console.error('❌ JWT_SECRET não está configurado');
        throw createError('Erro de configuração do servidor', 500);
      }

      const user = await findUserByLoginIdentifier(identifier);

      if (!user) {
        throw createError('Credenciais inválidas', 401);
      }

      if (!user.isActive) {
        throw createError('Usuário inativo. Entre em contato com o administrador.', 401);
      }

      // Verificar senha
      if (!user.password) {
        throw createError('Credenciais inválidas', 401);
      }

      const isPasswordValid = await comparePassword(password, user.password);
      if (!isPasswordValid) {
        throw createError('Credenciais inválidas', 401);
      }

      // Gerar token
      const token = signSessionToken({
        id: user.id,
        email: user.email,
        role: user.role,
      });

      try {
        await recordSuccessfulLogin(req, user.id, req.body?.source);
      } catch (trackErr) {
        console.error('[Auth] Falha ao registrar histórico de login:', trackErr);
      }

      // Remover senha da resposta
      const { password: _, ...userWithoutPassword } = user;

      return res.json({
        success: true,
        data: {
          user: {
            ...userWithoutPassword,
            lastLoginAt: new Date(),
            lastSeenAt: new Date(),
          },
          token,
          isFirstLogin: user.isFirstLogin,
        },
        message: 'Login realizado com sucesso'
      });
    } catch (error: any) {
      // Log do erro para debug
      console.error('Erro no login:', error);
      return next(error);
    }
  }

  async getProfile(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!req.user || !req.user.id) {
        throw createError('Token inválido ou expirado', 401);
      }

      const user = await prisma.user.findUnique({
        where: { id: req.user.id },
        select: userMeSelect,
      });

      if (!user) {
        throw createError('Usuário não encontrado', 404);
      }

      // Evita 304 no browser/Axios (tratado como erro no cliente)
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');

      return res.json({
        success: true,
        data: {
          ...user,
          impersonation: req.user?.impersonating
            ? {
                active: true,
                originalAdminId: req.user.originalAdminId || null,
              }
            : null,
        },
      });
    } catch (error: any) {
      console.error('Erro ao buscar perfil do usuário:', error);
      return next(error);
    }
  }

  /** Administrador entra na sessão de outro usuário (sem senha dele). */
  async startImpersonation(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!process.env.JWT_SECRET) {
        throw createError('Erro de configuração do servidor', 500);
      }
      if (!req.user?.isAdmin) {
        throw createError('Acesso permitido apenas para Administrador', 403);
      }
      if (req.user.impersonating) {
        throw createError('Encerre a sessão atual antes de entrar como outro usuário', 400);
      }

      const targetUserId = String(req.params.userId || '').trim();
      if (!targetUserId) {
        throw createError('Usuário alvo é obrigatório', 400);
      }
      if (targetUserId === req.user.id) {
        throw createError('Você já está na sua própria conta', 400);
      }

      const target = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: userMeSelect,
      });

      if (!target) {
        throw createError('Usuário não encontrado', 404);
      }
      if (!target.isActive) {
        throw createError('Não é possível entrar como um usuário inativo', 400);
      }

      const targetIsAdmin =
        (target.employee?.position || '').toLowerCase() === 'administrador';
      if (targetIsAdmin) {
        throw createError('Não é permitido entrar como outro Administrador', 403);
      }

      const token = signSessionToken(
        { id: target.id, email: target.email, role: target.role },
        {
          impersonating: true,
          originalAdminId: req.user.id,
          expiresIn: '2h',
        }
      );

      try {
        const adminName =
          (
            await prisma.user.findUnique({
              where: { id: req.user.id },
              select: { name: true },
            })
          )?.name?.trim() || req.user.email;

        await recordImpersonationLoginEvent(req, {
          userId: req.user.id,
          type: 'impersonate',
          targetUserId: target.id,
          targetName: target.name,
          adminUserId: req.user.id,
          adminName,
        });
        await recordImpersonationLoginEvent(req, {
          userId: target.id,
          type: 'impersonated_by',
          targetUserId: target.id,
          targetName: target.name,
          adminUserId: req.user.id,
          adminName,
        });
        recordAuditEvent({
          action: 'CREATE',
          entity: 'User',
          entityId: target.id,
          userId: req.user.id,
          summary: `Impersonação iniciada: ${adminName} → ${target.name} (${target.email})`,
          newData: {
            type: 'impersonate',
            adminUserId: req.user.id,
            adminName,
            targetUserId: target.id,
            targetName: target.name,
          },
        });
      } catch (trackErr) {
        console.error('[Auth] Falha ao registrar impersonação:', trackErr);
      }

      return res.json({
        success: true,
        data: {
          user: target,
          token,
          impersonation: {
            active: true,
            originalAdminId: req.user.id,
            targetUserId: target.id,
            targetName: target.name,
          },
        },
        message: `Sessão iniciada como ${target.name}`,
      });
    } catch (error) {
      return next(error);
    }
  }

  /** Volta da impersonação para a conta do administrador. */
  async stopImpersonation(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (!process.env.JWT_SECRET) {
        throw createError('Erro de configuração do servidor', 500);
      }
      if (!req.user?.impersonating || !req.user.originalAdminId) {
        throw createError('Nenhuma sessão de impersonação ativa', 400);
      }

      const admin = await prisma.user.findUnique({
        where: { id: req.user.originalAdminId },
        select: userMeSelect,
      });

      if (!admin || !admin.isActive) {
        throw createError('Administrador original não encontrado ou inativo. Faça login novamente.', 401);
      }

      const adminIsAdmin =
        (admin.employee?.position || '').toLowerCase() === 'administrador';
      if (!adminIsAdmin) {
        throw createError('Conta original não é mais Administrador. Faça login novamente.', 403);
      }

      const token = signSessionToken({
        id: admin.id,
        email: admin.email,
        role: admin.role,
      });

      try {
        const targetName =
          (
            await prisma.user.findUnique({
              where: { id: req.user.id },
              select: { name: true },
            })
          )?.name?.trim() || req.user.email;

        await recordImpersonationLoginEvent(req, {
          userId: admin.id,
          type: 'stop_impersonate',
          targetUserId: req.user.id,
          targetName,
          adminUserId: admin.id,
          adminName: admin.name,
        });
        recordAuditEvent({
          action: 'CREATE',
          entity: 'User',
          entityId: req.user.id,
          userId: admin.id,
          summary: `Impersonação encerrada: ${admin.name} voltou de ${targetName}`,
          newData: {
            type: 'stop_impersonate',
            adminUserId: admin.id,
            adminName: admin.name,
            targetUserId: req.user.id,
            targetName,
          },
        });
      } catch (trackErr) {
        console.error('[Auth] Falha ao registrar fim da impersonação:', trackErr);
      }

      return res.json({
        success: true,
        data: {
          user: admin,
          token,
          impersonation: null,
        },
        message: 'Sessão de administrador restaurada',
      });
    } catch (error) {
      return next(error);
    }
  }

  async updateProfile(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { name, email } = req.body;
      const userId = req.user!.id;

      // Verificar se email já existe em outro usuário
      if (email) {
        const existingUser = await prisma.user.findFirst({
          where: {
            email,
            id: { not: userId }
          }
        });

        if (existingUser) {
          throw createError('Email já está em uso', 400);
        }
      }

      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          ...(name && { name }),
          ...(email && { email }),
        },
        select: {
          id: true,
          email: true,
          name: true,
          cpf: true,
          role: true,
          isActive: true,
          updatedAt: true,
        }
      });

      return res.json({
        success: true,
        data: user,
        message: 'Perfil atualizado com sucesso'
      });
    } catch (error) {
      return next(error);
    }
  }

  async logout(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (req.user?.id) {
        try {
          await recordSuccessfulLogout(req, req.user.id, req.body?.source);
        } catch (trackError) {
          console.error('Falha ao registrar logout:', trackError);
        }
      }
      return res.json({
        success: true,
        message: 'Logout realizado com sucesso'
      });
    } catch (error) {
      return next(error);
    }
  }

  async refreshToken(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      // authenticate já validou usuário ativo em req.user
      const { id, email, role, impersonating, originalAdminId } = req.user!;

      const token = signSessionToken(
        { id, email, role },
        impersonating && originalAdminId
          ? { impersonating: true, originalAdminId, expiresIn: '2h' }
          : { expiresIn: '7d' }
      );

      return res.json({
        success: true,
        data: { token },
        message: 'Token renovado com sucesso'
      });
    } catch (error) {
      return next(error);
    }
  }

  // Refresh via authenticateForRefresh (já validou usuário ativo)
  async publicRefreshToken(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id, email, role, impersonating, originalAdminId } = req.user!;

      const token = signSessionToken(
        { id, email, role },
        impersonating && originalAdminId
          ? { impersonating: true, originalAdminId, expiresIn: '2h' }
          : { expiresIn: '7d' }
      );

      return res.json({
        success: true,
        data: { token },
        message: 'Token renovado com sucesso'
      });
    } catch (error) {
      return next(error);
    }
  }

  async changePassword(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      if (req.user?.impersonating) {
        throw createError(
          'Não é possível alterar senha durante impersonação. Volte à sua conta de administrador.',
          403
        );
      }
      const { currentPassword, newPassword } = req.body;
      const userId = req.user!.id;

      // Buscar usuário
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        throw createError('Usuário não encontrado', 404);
      }

      // Verificar senha atual
      const isCurrentPasswordValid = await comparePassword(currentPassword, user.password);
      if (!isCurrentPasswordValid) {
        throw createError('Senha atual incorreta', 400);
      }

      // Criptografar nova senha
      const hashedNewPassword = await hashPassword(newPassword);

      // Atualizar senha e marcar como não é mais primeiro login
      await prisma.user.update({
        where: { id: userId },
        data: {
          password: hashedNewPassword,
          isFirstLogin: false,
        }
      });

      return res.json({
        success: true,
        message: 'Senha alterada com sucesso'
      });
    } catch (error) {
      return next(error);
    }
  }

  /**
   * Dispara o e-mail de redefinição. Se a conta não existir, responde com
   * mensagem genérica; se enviar com sucesso, devolve o e-mail de destino.
   */
  async forgotPassword(req: Request, res: Response, next: NextFunction) {
    const genericMessage =
      'Se houver uma conta com esse e-mail, enviaremos as instruções de redefinição em instantes.';
    try {
      const identifier = normalizeLoginIdentifier(String(req.body?.identifier ?? ''));
      if (!identifier) {
        throw createError('Informe o e-mail ou CPF cadastrado', 400);
      }

      const user = await findUserByLoginIdentifier(identifier);
      if (!user || !user.isActive || !user.email) {
        return res.json({ success: true, message: genericMessage });
      }

      await prisma.passwordResetToken.updateMany({
        where: { userId: user.id, used: false, expiresAt: { gt: new Date() } },
        data: { used: true },
      });

      const rawToken = crypto.randomBytes(32).toString('hex');
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token: hashResetToken(rawToken),
          expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
        },
      });

      const resetUrl = `${resolveFrontendBaseUrl()}/auth/redefinir-senha?token=${rawToken}`;

      try {
        await emailService.sendPasswordResetEmail(user.email, user.name, rawToken, resetUrl);
      } catch (emailError) {
        console.error('Falha ao enviar e-mail de redefinicao de senha:', emailError);
        throw createError(
          'Não foi possível enviar o e-mail de redefinição. Procure o administrador do sistema.',
          503
        );
      }

      recordAuditEvent({
        action: 'CREATE',
        entity: 'PasswordResetToken',
        entityId: user.id,
        summary: 'Solicitou redefinição de senha por e-mail',
        userId: user.id,
      });

      return res.json({
        success: true,
        message: `Enviamos o link de redefinição para ${user.email}.`,
        email: user.email,
      });
    } catch (error) {
      return next(error);
    }
  }

  /** Checa se o link ainda é válido antes de exibir o formulário. */
  async validateResetToken(req: Request, res: Response, next: NextFunction) {
    try {
      const record = await findValidResetToken(String(req.query?.token ?? ''));
      return res.json({
        success: true,
        data: {
          valid: !!record,
          name: record?.user.name ?? null,
          email: record ? maskEmail(record.user.email) : null,
        },
      });
    } catch (error) {
      return next(error);
    }
  }

  /** Conclui a redefinição consumindo o token enviado por e-mail. */
  async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const token = String(req.body?.token ?? '');
      const newPassword = String(req.body?.newPassword ?? '');

      if (newPassword.length < 8) {
        throw createError('A nova senha deve ter ao menos 8 caracteres', 400);
      }

      const record = await findValidResetToken(token);
      if (!record) {
        throw createError('Link de redefinição inválido ou expirado. Solicite um novo.', 400);
      }

      const hashedPassword = await hashPassword(newPassword);

      await prisma.$transaction([
        prisma.user.update({
          where: { id: record.userId },
          data: { password: hashedPassword, isFirstLogin: false },
        }),
        prisma.passwordResetToken.update({
          where: { id: record.id },
          data: { used: true },
        }),
        prisma.passwordResetToken.updateMany({
          where: { userId: record.userId, used: false },
          data: { used: true },
        }),
      ]);

      recordAuditEvent({
        action: 'CREATE',
        entity: 'PasswordResetToken',
        entityId: record.id,
        summary: 'Redefiniu a senha pelo link enviado por e-mail',
        userId: record.userId,
      });

      return res.json({
        success: true,
        message: 'Senha redefinida com sucesso. Faça login com a nova senha.',
      });
    } catch (error) {
      return next(error);
    }
  }

  /** Upload foto de perfil (mesmo armazenamento que anexos de chat). */
  async uploadProfilePhoto(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const file = (req as unknown as Express.Request & { file?: Express.Multer.File }).file;
      if (!file?.buffer) throw createError('Nenhuma imagem enviada', 400);
      const uploadResult = await chatUploadService.uploadFile(file, userId);
      const updated = await prisma.user.update({
        where: { id: userId },
        data: {
          profilePhotoUrl: uploadResult.url,
          profilePhotoKey: uploadResult.key,
        },
        select: userMeSelect,
      });
      return res.json({
        success: true,
        data: updated,
        message: 'Foto de perfil atualizada',
      });
    } catch (error) {
      return next(error);
    }
  }

  async removeProfilePhoto(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const updated = await prisma.user.update({
        where: { id: userId },
        data: { profilePhotoUrl: null, profilePhotoKey: null },
        select: userMeSelect,
      });
      return res.json({
        success: true,
        data: updated,
        message: 'Foto de perfil removida',
      });
    } catch (error) {
      return next(error);
    }
  }

  /** Foto de confronto do ponto — o próprio usuário pode cadastrar (não altera o avatar). */
  async uploadMyFacePhoto(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const file = (req as unknown as Express.Request & { file?: Express.Multer.File }).file;
      if (!file?.buffer) throw createError('Nenhuma imagem enviada', 400);

      const mime = String(file.mimetype || '').toLowerCase();
      const name = String(file.originalname || '').toLowerCase();
      const imageOk =
        mime.startsWith('image/') ||
        ['.jpg', '.jpeg', '.png', '.webp'].some((ext) => name.endsWith(ext));
      if (!imageOk) throw createError('Envie uma imagem (JPG, PNG ou WEBP)', 400);

      const uploadResult = await chatUploadService.uploadFile(file, userId);
      const updated = await prisma.user.update({
        where: { id: userId },
        data: {
          facePhotoUrl: uploadResult.url,
          facePhotoKey: uploadResult.key,
        },
        select: {
          id: true,
          facePhotoUrl: true,
          facePhotoKey: true,
        },
      });

      return res.json({
        success: true,
        data: updated,
        message: 'Foto do ponto atualizada',
      });
    } catch (error) {
      return next(error);
    }
  }
}
