import { Request, Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { cache } from '../lib/cache';
import { normalizeGeofenceLocations } from '../services/LocationService';

function sanitizeGeofenceLocationsPayload(raw: unknown) {
  const locations = normalizeGeofenceLocations(raw).map((loc, index) => ({
    id: loc.id || `loc-${index + 1}`,
    name: loc.name.trim() || `Local ${index + 1}`,
    latitude: loc.latitude,
    longitude: loc.longitude,
    radius: Math.max(10, Math.round(loc.radius) || 1000),
  }));

  for (const loc of locations) {
    if (loc.latitude < -90 || loc.latitude > 90) {
      throw createError(`Latitude inválida em "${loc.name}"`, 400);
    }
    if (loc.longitude < -180 || loc.longitude > 180) {
      throw createError(`Longitude inválida em "${loc.name}"`, 400);
    }
  }

  return locations;
}

export class CompanyController {
  async getCompanySettings(req: Request, res: Response, next: NextFunction) {
    try {
      // OTIMIZAÇÃO: Usar cache para configurações da empresa
      let settings = cache.get<any>('company_settings');
      if (!settings) {
        settings = await prisma.companySettings.findFirst();
        if (settings) {
          // Cache por 1 hora (configurações raramente mudam)
          cache.set('company_settings', settings, 3600);
        }
      }

      // Se não existir configurações, criar com valores padrão
      if (!settings) {
        settings = await prisma.companySettings.create({
          data: {
            name: process.env.COMPANY_NAME || 'Gennesis Engenharia',
            cnpj: process.env.COMPANY_CNPJ || '38.294.339/0001-10',
            address: process.env.COMPANY_ADDRESS || '24, St. de Habitações Individuais Sul QI 11 - Lago Sul, Brasília - DF, 70297-400',
            phone: process.env.COMPANY_PHONE || '(61) 99517-6932',
            email: process.env.COMPANY_EMAIL || 'contato@engenharia.com.br',
            workStartTime: process.env.WORK_START_TIME || '07:00',
            workEndTime: process.env.WORK_END_TIME || '17:00',
            lunchStartTime: process.env.LUNCH_START_TIME || '12:00',
            lunchEndTime: process.env.LUNCH_END_TIME || '13:00',
            toleranceMinutes: parseInt(process.env.TOLERANCE_MINUTES || '10'),
            maxOvertimeHours: parseInt(process.env.MAX_OVERTIME_HOURS || '2'),
            maxDistanceMeters: parseInt(process.env.MAX_DISTANCE_METERS || '1000'),
            defaultLatitude: parseFloat(process.env.DEFAULT_LATITUDE || '-15.835840'),
            defaultLongitude: parseFloat(process.env.DEFAULT_LONGITUDE || '-47.873407'),
            vacationDaysPerYear: 30
          }
        });
      }

      res.json({
        success: true,
        data: settings
      });
    } catch (error) {
      next(error);
    }
  }

  async updateCompanySettings(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const {
        name,
        cnpj,
        address,
        phone,
        email,
        workStartTime,
        workEndTime,
        lunchStartTime,
        lunchEndTime,
        toleranceMinutes,
        maxOvertimeHours,
        maxDistanceMeters,
        defaultLatitude,
        defaultLongitude,
        geofenceEnabled,
        geofenceBlockOutside,
        geofenceRequireLocation,
        geofenceLocations,
        vacationDaysPerYear,
        fuelSuppliesSlaHours,
      } = req.body;

      // Validar CNPJ se fornecido
      if (cnpj && !this.isValidCNPJ(cnpj)) {
        throw createError('CNPJ inválido', 400);
      }

      const parsedGeofenceLocations =
        geofenceLocations !== undefined
          ? sanitizeGeofenceLocationsPayload(geofenceLocations)
          : undefined;

      // Compatibilidade: o 1º local vira a base legada (defaultLatitude/Longitude/raio)
      const syncedFromLocations = parsedGeofenceLocations?.[0];
      const nextDefaultLatitude =
        syncedFromLocations?.latitude ??
        (defaultLatitude !== undefined ? Number(defaultLatitude) : undefined);
      const nextDefaultLongitude =
        syncedFromLocations?.longitude ??
        (defaultLongitude !== undefined ? Number(defaultLongitude) : undefined);
      const nextMaxDistanceMeters =
        syncedFromLocations?.radius ??
        (maxDistanceMeters !== undefined ? Number(maxDistanceMeters) : undefined);

      // Validar coordenadas se fornecidas
      if (
        nextDefaultLatitude !== undefined &&
        (nextDefaultLatitude < -90 || nextDefaultLatitude > 90)
      ) {
        throw createError('Latitude deve estar entre -90 e 90', 400);
      }

      if (
        nextDefaultLongitude !== undefined &&
        (nextDefaultLongitude < -180 || nextDefaultLongitude > 180)
      ) {
        throw createError('Longitude deve estar entre -180 e 180', 400);
      }

      // Validar horários
      if (workStartTime && !this.isValidTime(workStartTime)) {
        throw createError('Horário de início inválido (formato HH:MM)', 400);
      }

      if (workEndTime && !this.isValidTime(workEndTime)) {
        throw createError('Horário de fim inválido (formato HH:MM)', 400);
      }

      if (lunchStartTime && !this.isValidTime(lunchStartTime)) {
        throw createError('Horário de início do almoço inválido (formato HH:MM)', 400);
      }

      if (lunchEndTime && !this.isValidTime(lunchEndTime)) {
        throw createError('Horário de fim do almoço inválido (formato HH:MM)', 400);
      }

      // Verificar se já existe configuração (com cache)
      let settings = cache.get<any>('company_settings');
      if (!settings) {
        settings = await prisma.companySettings.findFirst();
        if (settings) {
          cache.set('company_settings', settings, 3600);
        }
      }

      if (settings) {
        // Atualizar configuração existente
        settings = await prisma.companySettings.update({
          where: { id: settings.id },
          data: {
            ...(name && { name }),
            ...(cnpj && { cnpj }),
            ...(address && { address }),
            ...(phone !== undefined && { phone }),
            ...(email !== undefined && { email }),
            ...(workStartTime && { workStartTime }),
            ...(workEndTime && { workEndTime }),
            ...(lunchStartTime && { lunchStartTime }),
            ...(lunchEndTime && { lunchEndTime }),
            ...(toleranceMinutes !== undefined && { toleranceMinutes }),
            ...(maxOvertimeHours !== undefined && { maxOvertimeHours }),
            ...(nextMaxDistanceMeters !== undefined && {
              maxDistanceMeters: Math.max(10, Number(nextMaxDistanceMeters) || 1000),
            }),
            ...(nextDefaultLatitude !== undefined && { defaultLatitude: nextDefaultLatitude }),
            ...(nextDefaultLongitude !== undefined && { defaultLongitude: nextDefaultLongitude }),
            ...(parsedGeofenceLocations !== undefined && {
              geofenceLocations: parsedGeofenceLocations,
            }),
            ...(geofenceEnabled !== undefined && { geofenceEnabled: !!geofenceEnabled }),
            ...(geofenceBlockOutside !== undefined && {
              geofenceBlockOutside: !!geofenceBlockOutside,
            }),
            ...(geofenceRequireLocation !== undefined && {
              geofenceRequireLocation: !!geofenceRequireLocation,
            }),
            ...(vacationDaysPerYear !== undefined && { vacationDaysPerYear }),
            ...(fuelSuppliesSlaHours !== undefined && {
              fuelSuppliesSlaHours: Math.max(1, Number(fuelSuppliesSlaHours) || 24),
            }),
          }
        });
      } else {
        // Criar nova configuração
        settings = await prisma.companySettings.create({
          data: {
            name: name || 'Empresa de Engenharia',
            cnpj: cnpj || '00.000.000/0001-00',
            address: address || 'Endereço da Empresa',
            phone: phone || null,
            email: email || null,
            workStartTime: workStartTime || '08:00',
            workEndTime: workEndTime || '17:00',
            lunchStartTime: lunchStartTime || '12:00',
            lunchEndTime: lunchEndTime || '13:00',
            toleranceMinutes: toleranceMinutes || 10,
            maxOvertimeHours: maxOvertimeHours || 2,
            maxDistanceMeters: Math.max(
              10,
              Number(nextMaxDistanceMeters ?? maxDistanceMeters) || 1000
            ),
            defaultLatitude: nextDefaultLatitude ?? defaultLatitude ?? -23.5505,
            defaultLongitude: nextDefaultLongitude ?? defaultLongitude ?? -46.6333,
            geofenceLocations: parsedGeofenceLocations ?? [],
            geofenceEnabled: !!geofenceEnabled,
            geofenceBlockOutside: geofenceBlockOutside === undefined ? true : !!geofenceBlockOutside,
            geofenceRequireLocation:
              geofenceRequireLocation === undefined ? true : !!geofenceRequireLocation,
            vacationDaysPerYear: vacationDaysPerYear || 30,
            fuelSuppliesSlaHours: Math.max(1, Number(fuelSuppliesSlaHours) || 24),
          }
        });
      }

      // Sem isto o cache de 1h devolveria a configuração antiga ao ponto e aos relatórios
      cache.set('company_settings', settings, 3600);

      res.json({
        success: true,
        data: settings,
        message: 'Configurações da empresa atualizadas com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Valida CNPJ
   */
  private isValidCNPJ(cnpj: string): boolean {
    // Remove caracteres não numéricos
    cnpj = cnpj.replace(/[^\d]/g, '');

    // Verifica se tem 14 dígitos
    if (cnpj.length !== 14) return false;

    // Verifica se todos os dígitos são iguais
    if (/^(\d)\1+$/.test(cnpj)) return false;

    // Validação do primeiro dígito verificador
    let sum = 0;
    let weight = 5;
    for (let i = 0; i < 12; i++) {
      sum += parseInt(cnpj[i]) * weight;
      weight = weight === 2 ? 9 : weight - 1;
    }
    let digit1 = sum % 11 < 2 ? 0 : 11 - (sum % 11);

    if (parseInt(cnpj[12]) !== digit1) return false;

    // Validação do segundo dígito verificador
    sum = 0;
    weight = 6;
    for (let i = 0; i < 13; i++) {
      sum += parseInt(cnpj[i]) * weight;
      weight = weight === 2 ? 9 : weight - 1;
    }
    let digit2 = sum % 11 < 2 ? 0 : 11 - (sum % 11);

    return parseInt(cnpj[13]) === digit2;
  }

  /**
   * Valida formato de horário (HH:MM)
   */
  private isValidTime(time: string): boolean {
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    return timeRegex.test(time);
  }
}
