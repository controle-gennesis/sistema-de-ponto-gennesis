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
    const today = new Date();
    // Usar UTC para comparar com timestamps salvos em UTC
    const dayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 0, 0, 0));
    const dayEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 23, 59, 59));

    // Construir filtros para funcionários (excluindo administradores)
    const employeeWhere: any = {};

    if (department && department !== 'all') {
      employeeWhere.department = { contains: department as string, mode: 'insensitive' };
    }
    if (position && position !== 'all') {
      // Se há filtro de position, combinar com exclusão de administrador
      employeeWhere.position = { 
        AND: [
          { contains: position as string, mode: 'insensitive' },
          { not: 'Administrador' }
        ]
      };
    } else {
      // Se não há filtro de position, apenas excluir administrador
      employeeWhere.position = { not: 'Administrador' };
    }
    if (costCenter && costCenter !== 'all') {
      employeeWhere.costCenter = { contains: costCenter as string, mode: 'insensitive' };
    }
    if (client && client !== 'all') {
      employeeWhere.client = { contains: client as string, mode: 'insensitive' };
    }

    // Buscar IDs dos usuários que atendem aos filtros (excluindo administradores)
    let userIds: string[] = [];
    if (department !== 'all' || position !== 'all' || costCenter !== 'all' || client !== 'all') {
      const usersInFilter = await prisma.user.findMany({
        where: {
          role: 'EMPLOYEE',
          isActive: true,
          employee: {
            is: employeeWhere
          }
        },
        select: { id: true }
      });
      userIds = usersInFilter.map((u: any) => u.id);
    }

    const [totalEmployees, presentUsers, allTodayRecords, employeesWithoutTimeClock, absentUsers] = await Promise.all([
      prisma.user.count({ 
        where: userIds.length > 0 ? {
          role: 'EMPLOYEE', 
          isActive: true,
          id: { in: userIds },
          AND: [
            { employee: { isNot: null } },
            { employee: { position: { not: 'Administrador' } } }
          ]
        } : {
          role: 'EMPLOYEE', 
          isActive: true,
          AND: [
            { employee: { isNot: null } },
            { employee: { position: { not: 'Administrador' } } }
          ]
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
            AND: [
              { employee: { isNot: null } },
              { employee: { position: { not: 'Administrador' } } }
            ]
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
            AND: [
              { employee: { isNot: null } },
              { employee: { position: { not: 'Administrador' } } }
            ]
          }
        },
        select: { userId: true, type: true },
      }),
      // Buscar funcionários que não precisam bater ponto (excluindo administradores)
      prisma.user.findMany({
        where: userIds.length > 0 ? {
          role: 'EMPLOYEE',
          isActive: true,
          id: { in: userIds },
          AND: [
            { employee: { isNot: null } },
            { employee: { position: { not: 'Administrador' } } },
            { employee: { requiresTimeClock: false } }
          ]
        } : {
          role: 'EMPLOYEE',
          isActive: true,
          AND: [
            { employee: { isNot: null } },
            { employee: { position: { not: 'Administrador' } } },
            { employee: { requiresTimeClock: false } }
          ]
        },
        select: { id: true }
      }),
      // Buscar funcionários com faltas registradas hoje
      // Buscar TODAS as faltas ABSENCE_JUSTIFIED com approvedBy (registradas manualmente)
      // Depois vamos filtrar para excluir as que são de atestados médicos
      prisma.timeRecord.findMany({
        where: {
          timestamp: { 
            gte: dayStart, 
            lt: new Date(dayEnd.getTime() + 1) // Adicionar 1ms para incluir até o final do dia
          },
          type: 'ABSENCE_JUSTIFIED',
          approvedBy: { not: null },
          userId: userIds.length > 0 ? { in: userIds } : undefined,
          user: userIds.length > 0 ? undefined : {
            role: 'EMPLOYEE',
            isActive: true,
            AND: [
              { employee: { isNot: null } },
              { employee: { position: { not: 'Administrador' } } }
            ]
          }
        },
        select: { 
          userId: true,
          timestamp: true,
          reason: true
        }
      })
    ]);

    // Filtrar faltas: excluir as que são de atestados médicos
    // Atestados médicos criam registros ABSENCE_JUSTIFIED quando aprovados
    // Faltas registradas manualmente têm approvedBy mas não têm atestado médico no mesmo dia
    const absentUserIdsSet = new Set<string>();
    
    if (absentUsers && Array.isArray(absentUsers)) {
      // Agrupar por userId para evitar queries duplicadas
      const userIdsToCheck = new Set(absentUsers.map((r: any) => r.userId));
      
      // Buscar todos os atestados médicos aprovados hoje de uma vez
      const medicalCerts = await prisma.medicalCertificate.findMany({
        where: {
          userId: { in: Array.from(userIdsToCheck) },
          status: 'APPROVED',
          startDate: { lte: dayEnd },
          endDate: { gte: dayStart }
        },
        select: {
          userId: true,
          startDate: true,
          endDate: true
        }
      });
      
      // Criar um Set de userIds que têm atestado médico hoje
      const usersWithMedicalCert = new Set<string>();
      for (const cert of medicalCerts) {
        const certStart = new Date(cert.startDate);
        const certEnd = new Date(cert.endDate);
        // Verificar se o atestado cobre o dia de hoje
        if (certStart <= dayEnd && certEnd >= dayStart) {
          usersWithMedicalCert.add(cert.userId);
        }
      }
      
      // Adicionar apenas faltas que NÃO são de atestados médicos
      for (const absence of absentUsers) {
        // Se não tem atestado médico, é uma falta registrada manualmente
        if (!usersWithMedicalCert.has(absence.userId)) {
          absentUserIdsSet.add(absence.userId);
        }
        // Se tem atestado médico mas o motivo contém "Falta registrada", também é manual
        else if (absence.reason && (absence.reason.includes('Falta registrada') || absence.reason.includes('registrada manualmente'))) {
          absentUserIdsSet.add(absence.userId);
        }
      }
    }
    
    const absentUserIds = absentUserIdsSet;

    // Funcionários que não precisam bater ponto são automaticamente considerados presentes
    // EXCETO se tiverem falta registrada
    const employeesWithoutTimeClockIds = employeesWithoutTimeClock
      .map((u: any) => u.id)
      .filter((id: string) => !absentUserIds.has(id));
    
    const presentUserIds = new Set([
      ...presentUsers.map((u: any) => u.userId).filter((id: string) => !absentUserIds.has(id)),
      ...employeesWithoutTimeClockIds
    ]);
    const presentToday = presentUserIds.size;
    
    // Buscar dados dos funcionários presentes (excluindo administradores)
    const presentEmployeesData = await prisma.user.findMany({
      where: {
        id: { in: Array.from(presentUserIds) },
        role: 'EMPLOYEE',
        isActive: true,
        AND: [
          { employee: { isNot: null } },
          { employee: { position: { not: 'Administrador' } } }
        ]
      },
      select: {
        id: true,
        name: true,
        email: true,
        employee: {
          select: {
            department: true,
            position: true,
            requiresTimeClock: true
          }
        }
      }
    });

    // Buscar todos os funcionários ativos (excluindo administradores)
    const allEmployees = await prisma.user.findMany({
      where: userIds.length > 0 ? {
        role: 'EMPLOYEE',
        isActive: true,
        id: { in: userIds },
        AND: [
          { employee: { isNot: null } },
          { employee: { position: { not: 'Administrador' } } }
        ]
      } : {
        role: 'EMPLOYEE',
        isActive: true,
        AND: [
          { employee: { isNot: null } },
          { employee: { position: { not: 'Administrador' } } }
        ]
      },
      select: {
        id: true,
        name: true,
        email: true,
        employee: {
          select: {
            department: true,
            position: true,
            requiresTimeClock: true
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
      // Ignorar funcionários que não precisam bater ponto
      if (employeesWithoutTimeClockIds.includes(userId)) {
        return;
      }
      
      const hasEntry = userRecords.has('ENTRY');
      const hasLunchStart = userRecords.has('LUNCH_START');
      const hasLunchEnd = userRecords.has('LUNCH_END');
      const hasExit = userRecords.has('EXIT');
      
      // Se não tem todos os 4 pontos, está pendente
      if (!(hasEntry && hasLunchStart && hasLunchEnd && hasExit)) {
        pendingUserIds.push(userId);
      }
    });

    // Buscar dados dos funcionários pendentes (excluindo administradores e os que não precisam bater ponto)
    const pendingEmployeesData = await prisma.user.findMany({
      where: {
        id: { in: pendingUserIds },
        role: 'EMPLOYEE',
        isActive: true,
        AND: [
          { employee: { isNot: null } },
          { employee: { position: { not: 'Administrador' } } },
          { employee: { requiresTimeClock: true } } // Apenas os que precisam bater ponto podem estar pendentes
        ]
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
    const today = new Date();
    // Usar UTC para comparar com timestamps salvos em UTC
    const dayStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 0, 0, 0));
    const dayEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate(), 23, 59, 59));

    // Construir filtros para funcionários (excluindo administradores)
    const employeeWhere: any = {};

    if (department && department !== 'all') {
      employeeWhere.department = { contains: department as string, mode: 'insensitive' };
    }
    if (position && position !== 'all') {
      // Se há filtro de position, combinar com exclusão de administrador
      employeeWhere.position = { 
        AND: [
          { contains: position as string, mode: 'insensitive' },
          { not: 'Administrador' }
        ]
      };
    } else {
      // Se não há filtro de position, apenas excluir administrador
      employeeWhere.position = { not: 'Administrador' };
    }
    if (costCenter && costCenter !== 'all') {
      employeeWhere.costCenter = { contains: costCenter as string, mode: 'insensitive' };
    }
    if (client && client !== 'all') {
      employeeWhere.client = { contains: client as string, mode: 'insensitive' };
    }

    // Buscar IDs dos usuários que atendem aos filtros (excluindo administradores)
    let userIds: string[] = [];
    if (department !== 'all' || position !== 'all' || costCenter !== 'all' || client !== 'all') {
      const usersInFilter = await prisma.user.findMany({
        where: {
          role: 'EMPLOYEE',
          isActive: true,
          employee: {
            is: employeeWhere
          }
        },
        select: { id: true }
      });
      userIds = usersInFilter.map((u: any) => u.id);
    }

    const [totalEmployees, presentUsers, allTodayRecords, employeesWithoutTimeClock, absentUsers] = await Promise.all([
      prisma.user.count({ 
        where: userIds.length > 0 ? {
          role: 'EMPLOYEE', 
          isActive: true,
          id: { in: userIds },
          AND: [
            { employee: { isNot: null } },
            { employee: { position: { not: 'Administrador' } } }
          ]
        } : {
          role: 'EMPLOYEE', 
          isActive: true,
          AND: [
            { employee: { isNot: null } },
            { employee: { position: { not: 'Administrador' } } }
          ]
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
            AND: [
              { employee: { isNot: null } },
              { employee: { position: { not: 'Administrador' } } }
            ]
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
            AND: [
              { employee: { isNot: null } },
              { employee: { position: { not: 'Administrador' } } }
            ]
          }
        },
        select: { userId: true, type: true },
      }),
      // Buscar funcionários que não precisam bater ponto (excluindo administradores)
      prisma.user.findMany({
        where: userIds.length > 0 ? {
          role: 'EMPLOYEE',
          isActive: true,
          id: { in: userIds },
          AND: [
            { employee: { isNot: null } },
            { employee: { position: { not: 'Administrador' } } },
            { employee: { requiresTimeClock: false } }
          ]
        } : {
          role: 'EMPLOYEE',
          isActive: true,
          AND: [
            { employee: { isNot: null } },
            { employee: { position: { not: 'Administrador' } } },
            { employee: { requiresTimeClock: false } }
          ]
        },
        select: { id: true }
      }),
      // Buscar funcionários com faltas registradas hoje
      // Buscar TODAS as faltas ABSENCE_JUSTIFIED com approvedBy (registradas manualmente)
      // Depois vamos filtrar para excluir as que são de atestados médicos
      prisma.timeRecord.findMany({
        where: {
          timestamp: { 
            gte: dayStart, 
            lt: new Date(dayEnd.getTime() + 1) // Adicionar 1ms para incluir até o final do dia
          },
          type: 'ABSENCE_JUSTIFIED',
          approvedBy: { not: null },
          userId: userIds.length > 0 ? { in: userIds } : undefined,
          user: userIds.length > 0 ? undefined : {
            role: 'EMPLOYEE',
            isActive: true,
            AND: [
              { employee: { isNot: null } },
              { employee: { position: { not: 'Administrador' } } }
            ]
          }
        },
        select: { 
          userId: true,
          timestamp: true,
          reason: true
        }
      })
    ]);

    // Filtrar faltas: excluir as que são de atestados médicos
    // Atestados médicos criam registros ABSENCE_JUSTIFIED quando aprovados
    // Faltas registradas manualmente têm approvedBy mas não têm atestado médico no mesmo dia
    const absentUserIdsSet = new Set<string>();
    
    if (absentUsers && Array.isArray(absentUsers)) {
      // Agrupar por userId para evitar queries duplicadas
      const userIdsToCheck = new Set(absentUsers.map((r: any) => r.userId));
      
      // Buscar todos os atestados médicos aprovados hoje de uma vez
      const medicalCerts = await prisma.medicalCertificate.findMany({
        where: {
          userId: { in: Array.from(userIdsToCheck) },
          status: 'APPROVED',
          startDate: { lte: dayEnd },
          endDate: { gte: dayStart }
        },
        select: {
          userId: true,
          startDate: true,
          endDate: true
        }
      });
      
      // Criar um Set de userIds que têm atestado médico hoje
      const usersWithMedicalCert = new Set<string>();
      for (const cert of medicalCerts) {
        const certStart = new Date(cert.startDate);
        const certEnd = new Date(cert.endDate);
        // Verificar se o atestado cobre o dia de hoje
        if (certStart <= dayEnd && certEnd >= dayStart) {
          usersWithMedicalCert.add(cert.userId);
        }
      }
      
      // Adicionar apenas faltas que NÃO são de atestados médicos
      for (const absence of absentUsers) {
        // Se não tem atestado médico, é uma falta registrada manualmente
        if (!usersWithMedicalCert.has(absence.userId)) {
          absentUserIdsSet.add(absence.userId);
        }
        // Se tem atestado médico mas o motivo contém "Falta registrada", também é manual
        else if (absence.reason && (absence.reason.includes('Falta registrada') || absence.reason.includes('registrada manualmente'))) {
          absentUserIdsSet.add(absence.userId);
        }
      }
    }
    
    const absentUserIds = absentUserIdsSet;

    // Funcionários que não precisam bater ponto são automaticamente considerados presentes
    // EXCETO se tiverem falta registrada
    const employeesWithoutTimeClockIds = employeesWithoutTimeClock
      .map((u: any) => u.id)
      .filter((id: string) => !absentUserIds.has(id));
    
    const presentUserIds = new Set([
      ...presentUsers.map((u: any) => u.userId).filter((id: string) => !absentUserIds.has(id)),
      ...employeesWithoutTimeClockIds
    ]);
    const presentToday = presentUserIds.size;
    
    // Buscar dados dos funcionários presentes (excluindo administradores)
    const presentEmployeesData = await prisma.user.findMany({
      where: {
        id: { in: Array.from(presentUserIds) },
        role: 'EMPLOYEE',
        isActive: true,
        AND: [
          { employee: { isNot: null } },
          { employee: { position: { not: 'Administrador' } } }
        ]
      },
      select: {
        id: true,
        name: true,
        email: true,
        employee: {
          select: {
            department: true,
            position: true,
            requiresTimeClock: true
          }
        }
      }
    });

    // Buscar todos os funcionários ativos (excluindo administradores)
    const allEmployees = await prisma.user.findMany({
      where: userIds.length > 0 ? {
        role: 'EMPLOYEE',
        isActive: true,
        id: { in: userIds },
        AND: [
          { employee: { isNot: null } },
          { employee: { position: { not: 'Administrador' } } }
        ]
      } : {
        role: 'EMPLOYEE',
        isActive: true,
        AND: [
          { employee: { isNot: null } },
          { employee: { position: { not: 'Administrador' } } }
        ]
      },
      select: {
        id: true,
        name: true,
        email: true,
        employee: {
          select: {
            department: true,
            position: true,
            requiresTimeClock: true
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
      // Ignorar funcionários que não precisam bater ponto
      if (employeesWithoutTimeClockIds.includes(userId)) {
        return;
      }
      
      const hasEntry = userRecords.has('ENTRY');
      const hasLunchStart = userRecords.has('LUNCH_START');
      const hasLunchEnd = userRecords.has('LUNCH_END');
      const hasExit = userRecords.has('EXIT');
      
      // Se não tem todos os 4 pontos, está pendente
      if (!(hasEntry && hasLunchStart && hasLunchEnd && hasExit)) {
        pendingUserIds.push(userId);
      }
    });

    // Buscar dados dos funcionários pendentes (excluindo administradores e os que não precisam bater ponto)
    const pendingEmployeesData = await prisma.user.findMany({
      where: {
        id: { in: pendingUserIds },
        role: 'EMPLOYEE',
        isActive: true,
        AND: [
          { employee: { isNot: null } },
          { employee: { position: { not: 'Administrador' } } },
          { employee: { requiresTimeClock: true } } // Apenas os que precisam bater ponto podem estar pendentes
        ]
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
