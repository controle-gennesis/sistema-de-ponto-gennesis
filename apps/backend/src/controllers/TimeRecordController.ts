import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { TimeRecordService } from '../services/TimeRecordService';
import { LocationService } from '../services/LocationService';
import { PhotoService } from '../services/PhotoService';
import { uploadPhoto, handleUploadError } from '../middleware/upload';
import moment from 'moment-timezone';

const prisma = new PrismaClient();
const timeRecordService = new TimeRecordService();
const locationService = new LocationService();
const photoService = new PhotoService();

export class TimeRecordController {
  async punchInOut(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { type, latitude, longitude, observation, clientTimestamp } = req.body;
      const photo = req.file; // Arquivo enviado via multer



      // Normalizar latitude/longitude para número
      const latNum = latitude !== undefined && latitude !== null && latitude !== '' ? Number(latitude) : null;
      const lonNum = longitude !== undefined && longitude !== null && longitude !== '' ? Number(longitude) : null;

      // Buscar dados do funcionário
      const employee = await prisma.employee.findUnique({
        where: { userId },
        select: {
          id: true,
          userId: true,
          employeeId: true,
          department: true,
          position: true,
          hireDate: true,
          salary: true,
          workSchedule: true,
          isRemote: true,
          allowedLocations: true,
          costCenter: true,
          client: true,
          dailyFoodVoucher: true,
          dailyTransportVoucher: true,
          user: {
            select: { name: true, email: true }
          }
        }
      });

      if (!employee) {
        throw createError('Dados de funcionário não encontrados', 404);
      }

      // Validar tipo de registro
      if (!Object.values(['ENTRY', 'EXIT', 'LUNCH_START', 'LUNCH_END', 'BREAK_START', 'BREAK_END', 'ABSENCE_JUSTIFIED']).includes(type)) {
        throw createError('Tipo de registro inválido', 400);
      }

      // Sempre permitir bater ponto de qualquer lugar, mas salvar a localização
      let isValidLocation = true;
      let locationReason = '';

      // Se a localização foi fornecida, validar e salvar
      if (latNum !== null && lonNum !== null && !Number.isNaN(latNum) && !Number.isNaN(lonNum)) {
        // Verificar se as coordenadas são válidas
        if (locationService.isValidCoordinates(latNum, lonNum)) {
          locationReason = `Localização registrada: ${locationService.formatLocation(latNum, lonNum)}`;
        } else {
          locationReason = 'Coordenadas inválidas fornecidas';
        }
      } else {
        locationReason = 'Localização não fornecida';
      }

      // Upload da foto se fornecida
      let photoUrl = '';
      let photoKey = '';

      if (photo) {
        const photoResult = await photoService.uploadPhoto(photo, userId);
        photoUrl = photoResult.url;
        photoKey = photoResult.key;
      }

      // Verificar se já existe registro no mesmo dia para o mesmo tipo
      // Usar timezone de Brasília
      const today = moment().tz('America/Sao_Paulo').startOf('day').toDate();
      const tomorrow = moment().tz('America/Sao_Paulo').add(1, 'day').startOf('day').toDate();

      const existingRecord = await prisma.timeRecord.findFirst({
        where: {
          userId,
          type,
          timestamp: {
            gte: today,
            lt: tomorrow
          }
        }
      });

      if (existingRecord) {
        throw createError(`Já existe um registro de ${type.toLowerCase()} para hoje`, 400);
      }

      // Validar sequência obrigatória de batidas

      const todayRecords = await prisma.timeRecord.findMany({
        where: {
          userId,
          timestamp: {
            gte: today,
            lt: tomorrow
          }
        },
        orderBy: { timestamp: 'asc' }
      });

      // Verificar sequência obrigatória
      const hasEntry = todayRecords.some((r: any) => r.type === 'ENTRY');
      const hasLunchStart = todayRecords.some((r: any) => r.type === 'LUNCH_START');
      const hasLunchEnd = todayRecords.some((r: any) => r.type === 'LUNCH_END');
      const hasExit = todayRecords.some((r: any) => r.type === 'EXIT');

      // Verificar se todos os 4 pontos já foram batidos
      const allPointsCompleted = hasEntry && hasLunchStart && hasLunchEnd && hasExit;
      
      if (allPointsCompleted) {
        throw createError('Todos os pontos obrigatórios já foram batidos hoje. Você poderá bater ponto novamente amanhã.', 400);
      }

      // Validações de sequência
      if (type === 'LUNCH_START' && !hasEntry) {
        throw createError('Você precisa bater o ponto de entrada antes de bater o ponto do almoço', 400);
      }
      
      if (type === 'LUNCH_END' && !hasLunchStart) {
        throw createError('Você precisa bater o ponto do almoço antes de bater o ponto do retorno', 400);
      }
      
      if (type === 'EXIT' && !hasLunchEnd) {
        throw createError('Você precisa bater o ponto do retorno antes de bater o ponto de saída', 400);
      }


      // Cliente envia timestamp no horário local (ex: "2025-01-15T09:19:00")
      // Salvar EXATAMENTE esse valor sem conversão
      let timestamp: Date;
      if (clientTimestamp) {
        // Parse manual para criar Date no horário local
        const parts = clientTimestamp.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
        if (parts) {
          const year = parseInt(parts[1]);
          const month = parseInt(parts[2]) - 1;
          const day = parseInt(parts[3]);
          const hours = parseInt(parts[4]);
          const minutes = parseInt(parts[5]);
          const seconds = parseInt(parts[6]);
          // Criar timestamp simulando que é UTC mas sem timezone
          // Assim salva no banco o horário literal exato
          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
          timestamp = new Date(dateStr + 'Z'); // Adicionar Z para forçar UTC
        } else {
          timestamp = new Date(clientTimestamp);
        }
      } else {
        timestamp = moment.tz('America/Sao_Paulo').toDate();
      }
      
      // Calcular VA e VT baseado no tipo de registro
      // VA e VT são adicionados apenas em registros de ENTRY (primeira batida do dia)
      let foodVoucherAmount = 0;
      let transportVoucherAmount = 0;
      
      if (type === 'ENTRY') {
        // Verificar se já existe registro de ENTRY hoje
        const existingEntry = await prisma.timeRecord.findFirst({
          where: {
            userId,
            type: 'ENTRY',
            timestamp: {
              gte: today,
              lt: tomorrow
            }
          }
        });
        
        // Se não existe ENTRY hoje, adicionar VA e VT
        if (!existingEntry) {
          foodVoucherAmount = employee.dailyFoodVoucher || 0;
          transportVoucherAmount = employee.dailyTransportVoucher || 0;
        }
      }

      const timeRecord = await prisma.timeRecord.create({
        data: {
          userId,
          employeeId: employee.id,
          type,
          timestamp: timestamp, // Usar timestamp exatamente como veio do mobile
          latitude: latNum !== null && !Number.isNaN(latNum) ? latNum : null,
          longitude: lonNum !== null && !Number.isNaN(lonNum) ? lonNum : null,
          photoUrl: photoUrl || null,
          photoKey: photoKey || null,
          isValid: true, // Sempre válido - permitir bater ponto de qualquer lugar
          reason: locationReason, // Sempre incluir informações da localização
          observation: observation && observation.trim() ? observation.trim() : null, // Observação do funcionário
          foodVoucherAmount,
          transportVoucherAmount,
          costCenter: employee.costCenter // Incluir centro de custo automaticamente
        },
        include: {
          user: {
            select: { name: true, email: true }
          },
          employee: {
            select: { 
              employeeId: true, 
              department: true, 
              position: true,
              dailyFoodVoucher: true,
              dailyTransportVoucher: true
            }
          }
        }
      });

      // Calcular horas trabalhadas se for saída
      let workHours = null;
      if (type === 'EXIT') {
        workHours = await timeRecordService.calculateWorkHours(userId, new Date());
      }

      res.status(201).json({
        success: true,
        data: {
          timeRecord,
          workHours,
          locationValid: true, // Sempre válido - permitir bater ponto de qualquer lugar
          locationReason: locationReason
        },
        message: 'Ponto registrado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  async getMyRecords(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { page = 1, limit = 20, startDate, endDate, type } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = { userId };

      if (startDate || endDate) {
        where.timestamp = {};
        if (startDate) where.timestamp.gte = new Date(startDate as string);
        if (endDate) where.timestamp.lte = new Date(endDate as string);
      }

      if (type) {
        where.type = type;
      }

      const [records, total] = await Promise.all([
        prisma.timeRecord.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { timestamp: 'desc' },
          include: {
            employee: {
              select: { employeeId: true, department: true }
            }
          }
        }),
        prisma.timeRecord.count({ where })
      ]);

      res.json({
        success: true,
        data: records,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async getTodayRecords(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      // Usar timezone de Brasília
      const today = moment().tz('America/Sao_Paulo').startOf('day').toDate();
      const tomorrow = moment().tz('America/Sao_Paulo').add(1, 'day').startOf('day').toDate();

      const records = await prisma.timeRecord.findMany({
        where: {
          userId,
          timestamp: {
            gte: today,
            lt: tomorrow
          }
        },
        orderBy: { timestamp: 'asc' }
      });

      // Buscar detalhes do atestado médico para registros de ausência justificada
      const recordsWithDetails = await Promise.all(records.map(async (record: any) => {
        if (record.type === 'ABSENCE_JUSTIFIED') {
          const recordDate = moment(record.timestamp).startOf('day').toDate();

          const medicalCertificate = await prisma.medicalCertificate.findFirst({
            where: {
              userId: record.userId,
              status: 'APPROVED',
              startDate: {
                lte: recordDate,
              },
              endDate: {
                gte: recordDate,
              },
            },
            select: {
              startDate: true,
              endDate: true,
              days: true,
              submittedAt: true,
              description: true,
              type: true,
            },
          });

          return {
            ...record,
            medicalCertificateDetails: medicalCertificate,
          };
        }
        return record;
      }));

      // Calcular resumo do dia
      const summary = await timeRecordService.calculateDaySummary(userId, today);

      res.json({
        success: true,
        data: {
          records: recordsWithDetails,
          summary
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async getRecordsByPeriod(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { startDate, endDate } = req.query;

      if (!startDate || !endDate) {
        throw createError('Data inicial e final são obrigatórias', 400);
      }

      const start = new Date(startDate as string);
      const end = new Date(endDate as string);

      const records = await prisma.timeRecord.findMany({
        where: {
          userId,
          timestamp: {
            gte: start,
            lte: end
          }
        },
        orderBy: { timestamp: 'asc' },
        include: {
          employee: {
            select: { employeeId: true, department: true }
          }
        }
      });

      // Buscar detalhes do atestado médico para registros de ausência justificada
      const recordsWithDetails = await Promise.all(records.map(async (record: any) => {
        if (record.type === 'ABSENCE_JUSTIFIED') {
          const recordDate = moment(record.timestamp).startOf('day').toDate();

          const medicalCertificate = await prisma.medicalCertificate.findFirst({
            where: {
              userId: record.userId,
              status: 'APPROVED',
              startDate: {
                lte: recordDate,
              },
              endDate: {
                gte: recordDate,
              },
            },
            select: {
              startDate: true,
              endDate: true,
              days: true,
              submittedAt: true,
              description: true,
              type: true,
            },
          });

          return {
            ...record,
            medicalCertificateDetails: medicalCertificate,
          };
        }
        return record;
      }));

      // Calcular resumo do período
      const summary = await timeRecordService.calculatePeriodSummary(userId, start, end);

      res.json({
        success: true,
        data: {
          records: recordsWithDetails,
          summary,
          period: { startDate: start, endDate: end }
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async getBankHours(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { startDate, endDate, detailed } = req.query as any;

      const now = new Date();
      let start: Date;
      
      if (startDate) {
        start = new Date(startDate as string);
      } else {
        // Se não há startDate, usar a data de admissão do funcionário
        const employee = await prisma.employee.findFirst({ where: { userId } });
        start = employee ? employee.hireDate : new Date(now.getFullYear(), now.getMonth(), 1);
      }
      
      // Sempre limitar até hoje, mesmo quando endDate não é especificada
      const end = endDate ? new Date(endDate as string) : now;

      const result = detailed === 'true'
        ? await timeRecordService.calculateBankHoursDetailed(userId, start, end)
        : await timeRecordService.calculateBankHours(userId, start, end);

      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async getAllRecords(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { page = 1, limit = 20, userId, employeeId, startDate, endDate, type, isValid } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const where: any = {};

      if (userId) where.userId = userId;
      if (employeeId) where.employeeId = employeeId;
      if (type) where.type = type;
      if (isValid !== undefined) where.isValid = isValid === 'true';

      if (startDate || endDate) {
        where.timestamp = {};
        if (startDate) where.timestamp.gte = new Date(startDate as string);
        if (endDate) where.timestamp.lte = new Date(endDate as string);
      }

      const [records, total] = await Promise.all([
        prisma.timeRecord.findMany({
          where,
          skip,
          take: Number(limit),
          orderBy: { timestamp: 'desc' },
          include: {
            user: {
              select: { name: true, email: true }
            },
            employee: {
              select: { employeeId: true, department: true, position: true }
            }
          }
        }),
        prisma.timeRecord.count({ where })
      ]);

      // Buscar detalhes do atestado médico para registros de ausência justificada
      const recordsWithDetails = await Promise.all(records.map(async (record: any) => {
        if (record.type === 'ABSENCE_JUSTIFIED') {
          const recordDate = moment(record.timestamp).startOf('day').toDate();

          const medicalCertificate = await prisma.medicalCertificate.findFirst({
            where: {
              userId: record.userId,
              status: 'APPROVED',
              startDate: {
                lte: recordDate,
              },
              endDate: {
                gte: recordDate,
              },
            },
            select: {
              startDate: true,
              endDate: true,
              days: true,
              submittedAt: true,
              description: true,
              type: true,
            },
          });

          return {
            ...record,
            medicalCertificateDetails: medicalCertificate,
          };
        }
        return record;
      }));

      res.json({
        success: true,
        data: recordsWithDetails,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error) {
      next(error);
    }
  }

  async getRecordById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const record = await prisma.timeRecord.findUnique({
        where: { id },
        include: {
          user: {
            select: { name: true, email: true }
          },
          employee: {
            select: { 
              employeeId: true, 
              department: true, 
              position: true,
              dailyFoodVoucher: true,
              dailyTransportVoucher: true
            }
          }
        }
      });

      if (!record) {
        throw createError('Registro não encontrado', 404);
      }

      res.json({
        success: true,
        data: record
      });
    } catch (error) {
      next(error);
    }
  }

  async updateRecord(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { type, timestamp, reason, observation } = req.body;

      // Verificar se o registro existe
      const existingRecord = await prisma.timeRecord.findUnique({
        where: { id },
        include: {
          user: {
            select: { name: true, email: true }
          }
        }
      });

      if (!existingRecord) {
        throw createError('Registro não encontrado', 404);
      }

      // Validar tipo se fornecido
      if (type && !Object.values(['ENTRY', 'EXIT', 'LUNCH_START', 'LUNCH_END', 'BREAK_START', 'BREAK_END', 'ABSENCE_JUSTIFIED']).includes(type)) {
        throw createError('Tipo de registro inválido', 400);
      }

      // Validar timestamp se fornecido
      let newTimestamp = existingRecord.timestamp;
      if (timestamp) {
        // Converter timestamp para horário local (Brasília) sem conversão de timezone
        const date = new Date(timestamp);
        const brazilTime = new Date(date.getTime() - (3 * 60 * 60 * 1000)); // Subtrair 3 horas para converter UTC para horário de Brasília
        newTimestamp = brazilTime;
        if (isNaN(newTimestamp.getTime())) {
          throw createError('Data/hora inválida', 400);
        }
      }

      // Atualizar registro
      const updatedRecord = await prisma.timeRecord.update({
        where: { id },
        data: {
          ...(type && { type }),
          ...(timestamp && { timestamp: newTimestamp }),
          ...(reason !== undefined && { reason }),
          ...(observation !== undefined && { observation: observation?.trim() || null }),
          updatedAt: new Date()
        },
        include: {
          user: {
            select: { name: true, email: true }
          },
          employee: {
            select: { 
              employeeId: true, 
              department: true, 
              position: true,
              dailyFoodVoucher: true,
              dailyTransportVoucher: true
            }
          }
        }
      });

      res.json({
        success: true,
        data: updatedRecord,
        message: 'Registro atualizado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  async validateRecord(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const approverId = req.user!.id;

      const record = await prisma.timeRecord.findUnique({
        where: { id }
      });

      if (!record) {
        throw createError('Registro não encontrado', 404);
      }

      const updatedRecord = await prisma.timeRecord.update({
        where: { id },
        data: {
          isValid: true,
          reason: null,
          approvedBy: approverId,
          approvedAt: new Date()
        },
        include: {
          user: {
            select: { name: true, email: true }
          },
          employee: {
            select: { employeeId: true, department: true }
          }
        }
      });

      res.json({
        success: true,
        data: updatedRecord,
        message: 'Registro validado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  async invalidateRecord(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { reason } = req.body;
      const approverId = req.user!.id;

      if (!reason) {
        throw createError('Motivo é obrigatório para invalidar registro', 400);
      }

      const record = await prisma.timeRecord.findUnique({
        where: { id }
      });

      if (!record) {
        throw createError('Registro não encontrado', 404);
      }

      const updatedRecord = await prisma.timeRecord.update({
        where: { id },
        data: {
          isValid: false,
          reason,
          approvedBy: approverId,
          approvedAt: new Date()
        },
        include: {
          user: {
            select: { name: true, email: true }
          },
          employee: {
            select: { employeeId: true, department: true }
          }
        }
      });

      res.json({
        success: true,
        data: updatedRecord,
        message: 'Registro invalidado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  async getAttendanceReport(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, department, userId } = req.query;

      if (!startDate || !endDate) {
        throw createError('Data inicial e final são obrigatórias', 400);
      }

      const start = new Date(startDate as string);
      const end = new Date(endDate as string);

      const report = await timeRecordService.generateAttendanceReport({
        startDate: start,
        endDate: end,
        department: department as string,
        userId: userId as string
      });

      res.json({
        success: true,
        data: report
      });
    } catch (error) {
      next(error);
    }
  }

  async getLateArrivalsReport(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { startDate, endDate, department } = req.query;

      if (!startDate || !endDate) {
        throw createError('Data inicial e final são obrigatórias', 400);
      }

      const start = new Date(startDate as string);
      const end = new Date(endDate as string);

      const report = await timeRecordService.generateLateArrivalsReport({
        startDate: start,
        endDate: end,
        department: department as string
      });

      res.json({
        success: true,
        data: report
      });
    } catch (error) {
      next(error);
    }
  }

  async getEmployeeCostCenter(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { employeeId } = req.params;
      const { month, year } = req.query;

      if (!month || !year) {
        throw createError('Mês e ano são obrigatórios', 400);
      }

      const monthNum = parseInt(month as string);
      const yearNum = parseInt(year as string);

      // Verificar se o funcionário existe
      const employee = await prisma.employee.findUnique({
        where: { id: employeeId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              cpf: true
            }
          }
        }
      });

      if (!employee) {
        throw createError('Funcionário não encontrado', 404);
      }

      // Calcular início e fim do mês
      const startDate = new Date(yearNum, monthNum - 1, 1);
      const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59);

      // Buscar todos os registros do funcionário no mês
      const timeRecords = await prisma.timeRecord.findMany({
        where: {
          employeeId: employeeId,
          timestamp: {
            gte: startDate,
            lte: endDate
          }
        },
        orderBy: {
          timestamp: 'asc'
        }
      });

      // Buscar férias aprovadas no período
      const vacations = await prisma.vacation.findMany({
        where: {
          userId: employee.userId,
          status: 'APPROVED',
          OR: [
            {
              AND: [
                { startDate: { lte: endDate } },
                { endDate: { gte: startDate } }
              ]
            }
          ]
        }
      });

      // Buscar atestados médicos aprovados no período
      const medicalCertificates = await prisma.medicalCertificate.findMany({
        where: {
          userId: employee.userId,
          status: 'APPROVED',
          OR: [
            {
              AND: [
                { startDate: { lte: endDate } },
                { endDate: { gte: startDate } }
              ]
            }
          ]
        }
      });

      // Agrupar registros por dia
      const daysMap = new Map<string, any[]>();
      
      timeRecords.forEach(record => {
        const dateKey = moment(record.timestamp).format('YYYY-MM-DD');
        if (!daysMap.has(dateKey)) {
          daysMap.set(dateKey, []);
        }
        daysMap.get(dateKey)!.push({
          id: record.id,
          type: record.type,
          timestamp: record.timestamp,
          costCenter: record.costCenter || 'SEDE',
          isValid: record.isValid
        });
      });

      // Criar array de dias do mês
      const daysInMonth = [];
      const daysCount = endDate.getDate();
      
      for (let day = 1; day <= daysCount; day++) {
        const date = new Date(yearNum, monthNum - 1, day);
        const dateKey = moment(date).format('YYYY-MM-DD');
        const dayRecords = daysMap.get(dateKey) || [];
        
        // Verificar se está em férias
        const isOnVacation = vacations.some(vacation => {
          const vacationStart = moment(vacation.startDate).format('YYYY-MM-DD');
          const vacationEnd = moment(vacation.endDate).format('YYYY-MM-DD');
          return dateKey >= vacationStart && dateKey <= vacationEnd;
        });

        // Verificar se está com atestado médico
        const hasMedicalCertificate = medicalCertificates.some(cert => {
          const certStart = moment(cert.startDate).format('YYYY-MM-DD');
          const certEnd = moment(cert.endDate).format('YYYY-MM-DD');
          return dateKey >= certStart && dateKey <= certEnd;
        });
        
        daysInMonth.push({
          date: dateKey,
          day: day,
          points: dayRecords,
          costCenter: dayRecords.length > 0 ? dayRecords[0].costCenter : null,
          isOnVacation,
          hasMedicalCertificate
        });
      }

      res.json({
        success: true,
        data: {
          employee: {
            id: employee.id,
            name: employee.user.name,
            cpf: employee.user.cpf,
            admissionDate: employee.hireDate,
            hireDate: employee.hireDate // Debug: adicionar também como hireDate
          },
          month: monthNum,
          year: yearNum,
          days: daysInMonth
        }
      });
    } catch (error) {
      next(error);
    }
  }
}
