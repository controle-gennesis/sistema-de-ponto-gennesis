import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { prisma } from '../lib/prisma';

export const checkAdminOrPessoal = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, message: 'Não autenticado' });
      return;
    }

    const employee = await prisma.employee.findUnique({
      where: { userId: req.user.id },
      select: { position: true, department: true }
    });

    const isAdministrator = employee?.position === 'Administrador';
    const isDepartmentPessoal = employee?.department?.toLowerCase().includes('pessoal');

    if (!isAdministrator && !isDepartmentPessoal) {
      res.status(403).json({ 
        success: false, 
        message: 'Apenas administradores ou departamento pessoal podem realizar esta ação' 
      });
      return;
    }

    next();
  } catch (error) {
    next(error);
  }
};
