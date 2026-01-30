import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { emailService } from '../services/EmailService';

const prisma = new PrismaClient();

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
      const hashedPassword = await bcrypt.hash(password, 12);

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

      // Gerar token
      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        process.env.JWT_SECRET as string,
        { expiresIn: '7d' }
      );

      return res.status(201).json({
        success: true,
        data: {
          user,
          token,
        },
        message: 'Usuário criado com sucesso'
      });
    } catch (error) {
      return next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const { email, password } = req.body;

      // Buscar usuário
      const user = await prisma.user.findUnique({
        where: { email },
        include: {
          employee: true,
        }
      });

      if (!user || !user.isActive) {
        throw createError('Credenciais inválidas', 401);
      }

      // Verificar senha
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        throw createError('Credenciais inválidas', 401);
      }

      // Gerar token
      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        process.env.JWT_SECRET as string,
        { expiresIn: '7d' }
      );

      // Remover senha da resposta
      const { password: _, ...userWithoutPassword } = user;

      return res.json({
        success: true,
        data: {
          user: userWithoutPassword,
          token,
          isFirstLogin: user.isFirstLogin,
        },
        message: 'Login realizado com sucesso'
      });
    } catch (error) {
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
        include: {
          employee: true,
        },
      });

      if (!user) {
        throw createError('Usuário não encontrado', 404);
      }

      return res.json({
        success: true,
        data: user,
      });
    } catch (error: any) {
      console.error('Erro ao buscar perfil do usuário:', error);
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
      // Em uma implementação completa, poderíamos invalidar o token (blacklist)
      return res.json({
        success: true,
        message: 'Logout realizado com sucesso'
      });
    } catch (error) {
      return next(error);
    }
  }

  async forgotPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { email } = req.body;

      if (!email) {
        throw createError('Email é obrigatório', 400);
      }

      const user = await prisma.user.findUnique({
        where: { email }
      });

      if (!user) {
        // Por segurança, não revelar se o email existe ou não
        return res.json({
          success: true,
          message: 'Se o email existir, você receberá instruções para redefinir sua senha'
        });
      }

      // Invalidar tokens anteriores não utilizados
      await prisma.passwordResetToken.updateMany({
        where: {
          userId: user.id,
          used: false,
          expiresAt: { gt: new Date() }
        },
        data: {
          used: true
        }
      });

      // Gerar novo token de reset
      const token = uuidv4();
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1); // Token válido por 1 hora

      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token,
          expiresAt
        }
      });

      // Construir URL de reset
      const frontendUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || 'http://localhost:3000';
      const resetUrl = `${frontendUrl}/auth/reset-password?token=${token}`;

      // Enviar email
      try {
        await emailService.sendPasswordResetEmail(user.email, user.name, token, resetUrl);
        console.log(`✅ Email de recuperação de senha enviado para: ${user.email}`);
      } catch (emailError: any) {
        console.error('❌ Erro ao enviar email de reset:', emailError);
        console.error('Detalhes do erro:', {
          message: emailError?.message,
          code: emailError?.code,
          stack: emailError?.stack
        });
        
        // Se for erro de configuração SMTP, logar aviso mais claro
        if (emailError?.message?.includes('Transporter') || !process.env.SMTP_HOST) {
          console.error('⚠️ ATENÇÃO: Configurações SMTP não encontradas ou inválidas!');
          console.error('Variáveis necessárias: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS');
          console.error('Verifique as variáveis de ambiente em produção.');
        }
        
        // Não falhar a requisição se o email falhar, apenas logar o erro
        // Mas em produção, isso deve ser monitorado
      }

      return res.json({
        success: true,
        message: 'Se o email existir, você receberá instruções para redefinir sua senha'
      });
    } catch (error) {
      return next(error);
    }
  }

  async resetPassword(req: Request, res: Response, next: NextFunction) {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        throw createError('Token e nova senha são obrigatórios', 400);
      }

      if (newPassword.length < 6) {
        throw createError('A senha deve ter no mínimo 6 caracteres', 400);
      }

      // Buscar token de reset
      const resetToken = await prisma.passwordResetToken.findUnique({
        where: { token },
        include: { user: true }
      });

      if (!resetToken) {
        throw createError('Token inválido ou expirado', 400);
      }

      if (resetToken.used) {
        throw createError('Este token já foi utilizado', 400);
      }

      if (resetToken.expiresAt < new Date()) {
        throw createError('Token expirado', 400);
      }

      // Hash da nova senha
      const hashedPassword = await bcrypt.hash(newPassword, 12);

      // Atualizar senha do usuário
      await prisma.user.update({
        where: { id: resetToken.userId },
        data: {
          password: hashedPassword,
          isFirstLogin: false // Marcar que não é mais primeiro login
        }
      });

      // Marcar token como usado
      await prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used: true }
      });

      return res.json({
        success: true,
        message: 'Senha redefinida com sucesso'
      });
    } catch (error) {
      return next(error);
    }
  }

  async refreshToken(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
        }
      });

      if (!user || !user.isActive) {
        throw createError('Usuário não encontrado ou inativo', 401);
      }

      // Gerar novo token
      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        process.env.JWT_SECRET as string,
        { expiresIn: '7d' }
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

  // Método público para refresh que aceita tokens expirados
  async publicRefreshToken(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      // O middleware authenticateForRefresh já validou e populou req.user
      const userId = req.user!.id;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          email: true,
          role: true,
          isActive: true,
        }
      });

      if (!user || !user.isActive) {
        throw createError('Usuário não encontrado ou inativo', 401);
      }

      // Gerar novo token
      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        process.env.JWT_SECRET as string,
        { expiresIn: '7d' }
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
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isCurrentPasswordValid) {
        throw createError('Senha atual incorreta', 400);
      }

      // Criptografar nova senha
      const hashedNewPassword = await bcrypt.hash(newPassword, 12);

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
}
