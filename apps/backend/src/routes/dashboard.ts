import express from 'express';
import { authenticate, authorize, AuthRequest } from '../middleware/auth';
import { PrismaClient } from '@prisma/client';

const router = express.Router();
const prisma = new PrismaClient();

router.use(authenticate);

// Endpoint para métricas administrativas - agora disponível para todos os funcionários
router.get('/admin', authorize('EMPLOYEE'), async (req: AuthRequest, res, next) => {
  try {
    const { department, position, costCenter, client } = req.query;
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    // Construir filtros para funcionários
    const employeeWhere: any = {
      isNot: null
    };

    if (department && department !== 'all') {
      employeeWhere.department = { contains: department as string, mode: 'insensitive' };
    }
    if (position && position !== 'all') {
      employeeWhere.position = { contains: position as string, mode: 'insensitive' };
    }
    if (costCenter && costCenter !== 'all') {
      employeeWhere.costCenter = { contains: costCenter as string, mode: 'insensitive' };
    }
    if (client && client !== 'all') {
      employeeWhere.client = { contains: client as string, mode: 'insensitive' };
    }

    // Buscar IDs dos usuários que atendem aos filtros
    let userIds: string[] = [];
    if (department !== 'all' || position !== 'all' || costCenter !== 'all' || client !== 'all') {
      const usersInFilter = await prisma.user.findMany({
        where: {
          role: 'EMPLOYEE',
          isActive: true,
          employee: employeeWhere
        },
        select: { id: true }
      });
      userIds = usersInFilter.map((u: any) => u.id);
    }

    const [totalEmployees, presentUsers, allTodayRecords] = await Promise.all([
      prisma.user.count({ 
        where: userIds.length > 0 ? {
          role: 'EMPLOYEE', 
          isActive: true,
          id: { in: userIds }
        } : {
          role: 'EMPLOYEE', 
          isActive: true,
          employee: {
            isNot: null
          }
        }
      }),
      prisma.timeRecord.findMany({
        where: {
          timestamp: { gte: dayStart, lt: dayEnd },
          type: { in: ['ENTRY', 'LUNCH_END'] },
          isValid: true,
          userId: userIds.length > 0 ? { in: userIds } : undefined,
          user: userIds.length > 0 ? undefined : {
            role: 'EMPLOYEE',
            isActive: true,
            employee: { isNot: null }
          }
        },
        select: { userId: true },
        distinct: ['userId'],
      }),
      prisma.timeRecord.findMany({
        where: {
          timestamp: { gte: dayStart, lt: dayEnd },
          isValid: true,
          userId: userIds.length > 0 ? { in: userIds } : undefined,
          user: userIds.length > 0 ? undefined : {
            role: 'EMPLOYEE',
            isActive: true,
            employee: { isNot: null }
          }
        },
        select: { userId: true, type: true },
      }),
    ]);

    const presentToday = presentUsers.length;
    const presentUserIds = new Set(presentUsers.map((u: any) => u.userId));
    
    // Buscar dados dos funcionários presentes
    const presentEmployeesData = await prisma.user.findMany({
      where: {
        id: { in: Array.from(presentUserIds) },
        role: 'EMPLOYEE',
        isActive: true
      },
      select: {
        id: true,
        name: true,
        email: true,
        employee: {
          select: {
            department: true,
            position: true
          }
        }
      }
    });

    // Buscar todos os funcionários ativos
    const allEmployees = await prisma.user.findMany({
      where: userIds.length > 0 ? {
        role: 'EMPLOYEE',
        isActive: true,
        id: { in: userIds }
      } : {
        role: 'EMPLOYEE',
        isActive: true,
        employee: {
          isNot: null
        }
      },
      select: {
        id: true,
        name: true,
        email: true,
        employee: {
          select: {
            department: true,
            position: true
          }
        }
      }
    });

    // Funcionários ausentes (todos menos os presentes)
    const absentEmployeesData = allEmployees.filter(emp => !presentUserIds.has(emp.id));

    const absentToday = Math.max(totalEmployees - presentToday, 0);
    const attendanceRate = totalEmployees > 0 ? Math.min(100, Math.max(0, Math.round((presentToday / totalEmployees) * 100))) : 0;

    // Calcular funcionários pendentes (que não bateram os 4 pontos)
    const recordsByUser = new Map<string, Set<string>>();
    allTodayRecords.forEach((record: any) => {
      if (!recordsByUser.has(record.userId)) {
        recordsByUser.set(record.userId, new Set());
      }
      recordsByUser.get(record.userId)!.add(record.type);
    });

    const pendingUserIds: string[] = [];
    recordsByUser.forEach((userRecords, userId) => {
      const hasEntry = userRecords.has('ENTRY');
      const hasLunchStart = userRecords.has('LUNCH_START');
      const hasLunchEnd = userRecords.has('LUNCH_END');
      const hasExit = userRecords.has('EXIT');
      
      // Se não tem todos os 4 pontos, está pendente
      if (!(hasEntry && hasLunchStart && hasLunchEnd && hasExit)) {
        pendingUserIds.push(userId);
      }
    });

    // Buscar dados dos funcionários pendentes
    const pendingEmployeesData = await prisma.user.findMany({
      where: {
        id: { in: pendingUserIds },
        role: 'EMPLOYEE',
        isActive: true
      },
      select: {
        id: true,
        name: true,
        email: true,
        employee: {
          select: {
            department: true,
            position: true
          }
        }
      }
    });

    const pendingToday = pendingUserIds.length;

    res.json({
      success: true,
      data: {
        totalEmployees,
        presentToday,
        absentToday,
        pendingToday,
        pendingVacations: 0,
        pendingOvertime: 0,
        averageAttendance: attendanceRate,
        attendanceRate,
        presentEmployees: presentEmployeesData.map(emp => ({
          id: emp.id,
          name: emp.name,
          email: emp.email,
          department: emp.employee?.department || '',
          position: emp.employee?.position || ''
        })),
        absentEmployees: absentEmployeesData.map(emp => ({
          id: emp.id,
          name: emp.name,
          email: emp.email,
          department: emp.employee?.department || '',
          position: emp.employee?.position || ''
        })),
        pendingEmployees: pendingEmployeesData.map(emp => ({
          id: emp.id,
          name: emp.name,
          email: emp.email,
          department: emp.employee?.department || '',
          position: emp.employee?.position || ''
        }))
      },
    });
  } catch (error) {
    next(error);
  }
});

// Endpoint geral - retorna dados básicos para todos os funcionários
router.get('/', async (req: AuthRequest, res, next) => {
  try {
    // Todos os funcionários veem métricas administrativas agora
    const { department, position, costCenter, client } = req.query;
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    // Construir filtros para funcionários
    const employeeWhere: any = {
      isNot: null
    };

    if (department && department !== 'all') {
      employeeWhere.department = { contains: department as string, mode: 'insensitive' };
    }
    if (position && position !== 'all') {
      employeeWhere.position = { contains: position as string, mode: 'insensitive' };
    }
    if (costCenter && costCenter !== 'all') {
      employeeWhere.costCenter = { contains: costCenter as string, mode: 'insensitive' };
    }
    if (client && client !== 'all') {
      employeeWhere.client = { contains: client as string, mode: 'insensitive' };
    }

    // Buscar IDs dos usuários que atendem aos filtros
    let userIds: string[] = [];
    if (department !== 'all' || position !== 'all' || costCenter !== 'all' || client !== 'all') {
      const usersInFilter = await prisma.user.findMany({
        where: {
          role: 'EMPLOYEE',
          isActive: true,
          employee: employeeWhere
        },
        select: { id: true }
      });
      userIds = usersInFilter.map((u: any) => u.id);
    }

    const [totalEmployees, presentUsers, allTodayRecords] = await Promise.all([
      prisma.user.count({ 
        where: userIds.length > 0 ? {
          role: 'EMPLOYEE', 
          isActive: true,
          id: { in: userIds }
        } : {
          role: 'EMPLOYEE', 
          isActive: true,
          employee: {
            isNot: null
          }
        }
      }),
      prisma.timeRecord.findMany({
        where: {
          timestamp: { gte: dayStart, lt: dayEnd },
          type: { in: ['ENTRY', 'LUNCH_END'] },
          isValid: true,
          userId: userIds.length > 0 ? { in: userIds } : undefined,
          user: userIds.length > 0 ? undefined : {
            role: 'EMPLOYEE',
            isActive: true,
            employee: { isNot: null }
          }
        },
        select: { userId: true },
        distinct: ['userId'],
      }),
      prisma.timeRecord.findMany({
        where: {
          timestamp: { gte: dayStart, lt: dayEnd },
          isValid: true,
          userId: userIds.length > 0 ? { in: userIds } : undefined,
          user: userIds.length > 0 ? undefined : {
            role: 'EMPLOYEE',
            isActive: true,
            employee: { isNot: null }
          }
        },
        select: { userId: true, type: true },
      }),
    ]);

    const presentToday = presentUsers.length;
    const presentUserIds = new Set(presentUsers.map((u: any) => u.userId));
    
    // Buscar dados dos funcionários presentes
    const presentEmployeesData = await prisma.user.findMany({
      where: {
        id: { in: Array.from(presentUserIds) },
        role: 'EMPLOYEE',
        isActive: true
      },
      select: {
        id: true,
        name: true,
        email: true,
        employee: {
          select: {
            department: true,
            position: true
          }
        }
      }
    });

    // Buscar todos os funcionários ativos
    const allEmployees = await prisma.user.findMany({
      where: userIds.length > 0 ? {
        role: 'EMPLOYEE',
        isActive: true,
        id: { in: userIds }
      } : {
        role: 'EMPLOYEE',
        isActive: true,
        employee: {
          isNot: null
        }
      },
      select: {
        id: true,
        name: true,
        email: true,
        employee: {
          select: {
            department: true,
            position: true
          }
        }
      }
    });

    // Funcionários ausentes (todos menos os presentes)
    const absentEmployeesData = allEmployees.filter(emp => !presentUserIds.has(emp.id));

    const absentToday = Math.max(totalEmployees - presentToday, 0);
    const attendanceRate = totalEmployees > 0 ? Math.min(100, Math.max(0, Math.round((presentToday / totalEmployees) * 100))) : 0;

    // Calcular funcionários pendentes (que não bateram os 4 pontos)
    const recordsByUser = new Map<string, Set<string>>();
    allTodayRecords.forEach((record: any) => {
      if (!recordsByUser.has(record.userId)) {
        recordsByUser.set(record.userId, new Set());
      }
      recordsByUser.get(record.userId)!.add(record.type);
    });

    const pendingUserIds: string[] = [];
    recordsByUser.forEach((userRecords, userId) => {
      const hasEntry = userRecords.has('ENTRY');
      const hasLunchStart = userRecords.has('LUNCH_START');
      const hasLunchEnd = userRecords.has('LUNCH_END');
      const hasExit = userRecords.has('EXIT');
      
      // Se não tem todos os 4 pontos, está pendente
      if (!(hasEntry && hasLunchStart && hasLunchEnd && hasExit)) {
        pendingUserIds.push(userId);
      }
    });

    // Buscar dados dos funcionários pendentes
    const pendingEmployeesData = await prisma.user.findMany({
      where: {
        id: { in: pendingUserIds },
        role: 'EMPLOYEE',
        isActive: true
      },
      select: {
        id: true,
        name: true,
        email: true,
        employee: {
          select: {
            department: true,
            position: true
          }
        }
      }
    });

    const pendingToday = pendingUserIds.length;

    res.json({
      success: true,
      data: {
        totalEmployees,
        presentToday,
        absentToday,
        pendingToday,
        pendingVacations: 0,
        pendingOvertime: 0,
        averageAttendance: attendanceRate,
        attendanceRate,
        presentEmployees: presentEmployeesData.map(emp => ({
          id: emp.id,
          name: emp.name,
          email: emp.email,
          department: emp.employee?.department || '',
          position: emp.employee?.position || ''
        })),
        absentEmployees: absentEmployeesData.map(emp => ({
          id: emp.id,
          name: emp.name,
          email: emp.email,
          department: emp.employee?.department || '',
          position: emp.employee?.position || ''
        })),
        pendingEmployees: pendingEmployeesData.map(emp => ({
          id: emp.id,
          name: emp.name,
          email: emp.email,
          department: emp.employee?.department || '',
          position: emp.employee?.position || ''
        }))
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
