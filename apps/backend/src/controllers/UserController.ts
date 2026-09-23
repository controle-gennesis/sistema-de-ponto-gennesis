import { Response, NextFunction } from 'express';
import { createError } from '../middleware/errorHandler';
import { AuthRequest } from '../middleware/auth';
import { prisma } from '../lib/prisma';
import { hashPassword } from '../lib/passwordHash';
import { gennecyBotUserWhereExclude } from '../lib/gennecyBotUser';
import { releaseUserIdentity, buildReleasedIdentity } from '../lib/userIdentityRelease';
import { ensureDefaultEmployeeAccessPermissions } from '../lib/permissionRegistrySync';
import { findUserIdsMatchingSearch } from '../lib/normalizeSearchText';
import { ChatService } from '../services/ChatService';
import { pathToModuleKey, PERMISSION_ACCESS_ACTION } from '@sistema-ponto/permission-modules';

const chatUploadService = new ChatService();
const facePhotoSelect = {
  id: true,
  facePhotoUrl: true,
  facePhotoKey: true,
} as const;

export class UserController {
  async updateUserPassword(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { newPassword } = req.body as { newPassword?: string };

      if (!newPassword || typeof newPassword !== 'string') {
        throw createError('A nova senha é obrigatória', 400);
      }

      const password = newPassword.trim();
      if (password.length < 6) {
        throw createError('A nova senha deve ter pelo menos 6 caracteres', 400);
      }

      const existingUser = await prisma.user.findUnique({
        where: { id },
        select: { id: true }
      });

      if (!existingUser) {
        throw createError('Usuário não encontrado', 404);
      }

      const hashedPassword = await hashPassword(password);

      await prisma.user.update({
        where: { id },
        data: {
          password: hashedPassword,
          isFirstLogin: false,
          // Revoga sessões já abertas do usuário — quem trocou a senha decide, não a sessão antiga
          tokenVersion: { increment: 1 },
        }
      });

      res.json({
        success: true,
        message: 'Senha alterada com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  async getAllUsers(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const {
        page = 1,
        limit = 10,
        search,
        role,
        department,
        position,
        status,
        light,
        excludeAdmin,
      } = req.query;
      // Limitar o máximo de registros por página para evitar sobrecarga
      const limitNum = Math.min(Number(limit), 1000); // Máximo de 1000 registros por página
      const skip = (Number(page) - 1) * limitNum;
      const isLight = light === '1' || light === 'true';
      const shouldExcludeAdmin = excludeAdmin === '1' || excludeAdmin === 'true';

      const where: any = {
        ...gennecyBotUserWhereExclude(),
      };

      // Filtro de status (ativo/inativo)
      if (status === 'inactive') {
        where.isActive = false;
      } else if (status === 'all') {
        // Mostrar todos (ativos e inativos)
        // Não adiciona filtro de isActive
      } else {
        // Padrão: apenas ativos
        where.isActive = true;
      }

      // Se não especificar role, mostrar apenas funcionários por padrão
      if (!role) {
        where.role = 'EMPLOYEE';
      } else {
        where.role = role;
      }

      // Construir condições de busca (usuário + campos do vínculo employee)
      // Sem acento: "antonio" encontra "Antônio"
      if (search) {
        const matchedIds = await findUserIdsMatchingSearch(String(search));
        if (matchedIds.length === 0) {
          where.id = { in: [] };
        } else {
          where.id = { in: matchedIds };
        }
      }

      const employeeFilters: Record<string, unknown> = {};
      if (department) {
        employeeFilters.department = { contains: department as string, mode: 'insensitive' };
      }
      if (position) {
        employeeFilters.position = { contains: position as string, mode: 'insensitive' };
      }
      if (shouldExcludeAdmin) {
        employeeFilters.NOT = {
          position: { equals: 'Administrador', mode: 'insensitive' },
        };
      }

      const hasEmployeeFieldFilters = Boolean(department || position);
      if (hasEmployeeFieldFilters) {
        where.employee = employeeFilters;
      } else if (shouldExcludeAdmin) {
        // Inclui logins de empreiteiro (sem ficha de funcionário), mesmo se o cadastro
        // da página de empreiteiros já tiver sido excluído.
        where.OR = [
          { employee: employeeFilters },
          { employee: { is: null } },
        ];
      }

      const empreiteiroSelect = {
        id: true,
        name: true,
        tradeName: true,
        specialty: true,
        phone: true,
        document: true,
      } as const;

      const employeeSelectLight = {
        id: true,
        employeeId: true,
        department: true,
        position: true,
        phone: true,
        hireDate: true,
        birthDate: true,
        isRemote: true,
        costCenter: true,
        client: true,
        company: true,
        polo: true,
        categoriaFinanceira: true,
        modality: true,
        requiresTimeClock: true,
      } as const;

      const employeeSelectFull = {
        ...employeeSelectLight,
        salary: true,
        workSchedule: true,
        bank: true,
        accountType: true,
        agency: true,
        operation: true,
        account: true,
        digit: true,
        pixKeyType: true,
        pixKey: true,
        dailyFoodVoucher: true,
        dailyTransportVoucher: true,
        familySalary: true,
        dangerPay: true,
        unhealthyPay: true,
      } as const;

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where,
          skip,
          take: limitNum,
          include: {
            employee: {
              select: isLight ? employeeSelectLight : employeeSelectFull,
            },
            empreiteiro: { select: empreiteiroSelect },
          },
          orderBy: { name: 'asc' },
        }),
        prisma.user.count({ where }),
      ]);

      res.json({
        success: true,
        data: users,
        pagination: {
          page: Number(page),
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error: any) {
      console.error('Erro ao buscar usuários:', error);
      console.error('Stack trace:', error?.stack);
      return next(createError(error?.message || 'Erro ao buscar usuários', 500));
    }
  }

  async getUserById(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const user = await prisma.user.findUnique({
        where: { id },
        include: {
          employee: true,
          empreiteiro: {
            select: {
              id: true,
              name: true,
              tradeName: true,
              specialty: true,
              phone: true,
              document: true,
              cpf: true,
              email: true,
            },
          },
          timeRecords: {
            take: 10,
            orderBy: { createdAt: 'desc' }
          },
          vacations: {
            take: 5,
            orderBy: { createdAt: 'desc' }
          },
          overtime: {
            take: 5,
            orderBy: { createdAt: 'desc' }
          }
        }
      });

      if (!user) {
        throw createError('Usuário não encontrado', 404);
      }

      res.json({
        success: true,
        data: user
      });
    } catch (error) {
      next(error);
    }
  }

  async createUser(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { email, password, name, cpf, role, employeeData, kind, empreiteiroData } = req.body;
      const isEmpreiteiro = String(kind || '').toUpperCase() === 'EMPREITEIRO' || Boolean(empreiteiroData);

      // Verificar se usuário já existe
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [{ email }, { cpf }]
        }
      });

      if (existingUser) {
        throw createError('Usuário já existe com este email ou CPF', 400);
      }

      if (isEmpreiteiro) {
        const companyName = typeof empreiteiroData?.name === 'string' ? empreiteiroData.name.trim() : '';
        const cnpj = String(empreiteiroData?.cnpj || '').replace(/\D/g, '');
        const phone = String(empreiteiroData?.phone || req.body?.phone || '').replace(/\D/g, '');
        const specialty = typeof empreiteiroData?.specialty === 'string' ? empreiteiroData.specialty.trim() : '';
        const contractId = typeof empreiteiroData?.contractId === 'string' ? empreiteiroData.contractId.trim() : '';
        const cpfDigits = String(cpf || '').replace(/\D/g, '');
        const emailNorm = String(email || '').trim().toLowerCase();

        if (!name?.trim()) throw createError('Nome é obrigatório', 400);
        if (!emailNorm || !emailNorm.includes('@')) throw createError('E-mail inválido', 400);
        if (cpfDigits.length !== 11) throw createError('CPF é obrigatório e deve ter 11 dígitos', 400);
        if (!password || String(password).length < 6) throw createError('Senha deve ter pelo menos 6 caracteres', 400);
        if (!companyName) throw createError('Nome / razão social é obrigatório', 400);
        if (cnpj.length !== 14) throw createError('CNPJ é obrigatório e deve ter 14 dígitos', 400);
        if (phone.length < 10) throw createError('Telefone é obrigatório', 400);
        if (!specialty) throw createError('Especialidade é obrigatória', 400);
        if (!contractId) throw createError('Contrato é obrigatório', 400);

        const contrato = await prisma.contract.findUnique({ where: { id: contractId } });
        if (!contrato) throw createError('Contrato não encontrado', 404);

        const duplicateDoc = await prisma.empreiteiro.findFirst({
          where: { OR: [{ document: cnpj }, { cpf: cpfDigits }] },
        });
        if (duplicateDoc) throw createError('Já existe uma empreita com este CPF ou CNPJ', 400);

        const hashedPassword = await hashPassword(password);
        const created = await prisma.$transaction(async (tx: any) => {
          const user = await tx.user.create({
            data: {
              email: emailNorm,
              password: hashedPassword,
              name: String(name).trim(),
              cpf: cpfDigits,
              role: 'EMPLOYEE',
            },
          });
          const empreiteiro = await tx.empreiteiro.create({
            data: {
              name: companyName,
              tradeName: empreiteiroData?.tradeName?.trim() || null,
              documentKind: 'CNPJ',
              document: cnpj,
              cpf: cpfDigits,
              phone,
              specialty,
              contractId,
              contactName: String(name).trim(),
              email: emailNorm,
              city: empreiteiroData?.city?.trim() || null,
              state: empreiteiroData?.state?.trim()?.toUpperCase() || null,
              pixKey: empreiteiroData?.pixKey?.trim() || null,
              bank: empreiteiroData?.bank?.trim() || null,
              agency: empreiteiroData?.agency?.trim() || null,
              account: empreiteiroData?.account?.trim() || null,
              userId: user.id,
            },
          });
          await tx.userPermission.create({
            data: {
              userId: user.id,
              module: pathToModuleKey('/ponto/empreiteiros'),
              action: PERMISSION_ACCESS_ACTION,
              allowed: true,
            },
          });
          return { user, empreiteiro };
        });

        res.status(201).json({
          success: true,
          data: {
            id: created.user.id,
            email: created.user.email,
            name: created.user.name,
            cpf: created.user.cpf,
            empreiteiroId: created.empreiteiro.id,
          },
          message: 'Empreita criada com acesso ao sistema',
        });
        return;
      }

      // Criptografar senha
      const hashedPassword = await hashPassword(password);

      // Criar usuário e funcionário em transação
      const result = await prisma.$transaction(async (tx: any) => {
        const user = await tx.user.create({
          data: {
            email,
            password: hashedPassword,
            name,
            cpf,
            role: role || 'EMPLOYEE',
          }
        });

        if (employeeData) {
          // Validar se a data de contratação é válida
          // Se a data já vem com horário, usar diretamente, senão adicionar timezone
          let hireDate;
          if (employeeData.hireDate.includes('T')) {
            hireDate = new Date(employeeData.hireDate);
          } else {
            hireDate = new Date(employeeData.hireDate + 'T04:00:00');
          }
          
          if (isNaN(hireDate.getTime())) {
            throw new Error('Data de contratação inválida');
          }

          const employee = await tx.employee.create({
            data: {
              userId: user.id,
              employeeId: employeeData.employeeId,
              department: employeeData.department,
              position: employeeData.position,
              hireDate: hireDate,
              birthDate: employeeData.birthDate ? new Date(employeeData.birthDate + 'T04:00:00') : null,
              salary: employeeData.salary,
              workSchedule: employeeData.workSchedule || {
                startTime: '08:00',
                endTime: '17:00',
                lunchStartTime: '12:00',
                lunchEndTime: '13:00',
                workDays: [1, 2, 3, 4, 5],
                toleranceMinutes: 10
              },
              isRemote: employeeData.isRemote || false,
              phone: employeeData.phone || null,
              allowedLocations: employeeData.allowedLocations || [],
              costCenter: employeeData.costCenter || null,
              client: employeeData.client || null,
              dailyFoodVoucher: employeeData.dailyFoodVoucher || 33.40,
              dailyTransportVoucher: employeeData.dailyTransportVoucher || 11.00,
              // Novos campos
              company: employeeData.company || null,
              bank: employeeData.bank || null,
              accountType: employeeData.accountType || null,
              agency: employeeData.agency || null,
              operation: employeeData.operation && employeeData.operation !== 'N/A' ? employeeData.operation : null,
              account: employeeData.account || null,
              digit: employeeData.digit || null,
              pixKeyType: employeeData.pixKeyType || null,
              pixKey: employeeData.pixKey || null,
              // Novos campos - Modalidade e Adicionais
              modality: employeeData.modality || null,
              familySalary: employeeData.familySalary !== undefined ? employeeData.familySalary : null,
              dangerPay: employeeData.dangerPay !== undefined ? employeeData.dangerPay : null,
              unhealthyPay: employeeData.unhealthyPay !== undefined ? employeeData.unhealthyPay : null,
              // Novos campos - Polo e Categoria Financeira
              polo: employeeData.polo || null,
              categoriaFinanceira: employeeData.categoriaFinanceira || null,
              // Campo para controlar se precisa bater ponto
              requiresTimeClock: employeeData.requiresTimeClock !== undefined ? employeeData.requiresTimeClock : true
            }
          });

          // Criar acréscimo fixo se o valor for maior que zero
          if (employeeData.fixedAdjustments && parseFloat(employeeData.fixedAdjustments) > 0) {
            await tx.salaryAdjustment.create({
              data: {
                employeeId: employee.id,
                type: 'OTHER',
                description: 'Acréscimo fixo mensal',
                amount: parseFloat(employeeData.fixedAdjustments),
                isFixed: true,
                createdBy: user.id
              }
            });
          }
        }

        return user;
      });

      await ensureDefaultEmployeeAccessPermissions([result.id]);

      const newUser = await prisma.user.findUnique({
        where: { id: result.id },
        select: {
          id: true,
          email: true,
          name: true,
          cpf: true,
          role: true,
          isActive: true,
          createdAt: true,
          employee: true
        }
      });

      res.status(201).json({
        success: true,
        data: newUser,
        message: 'Usuário criado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  async updateUser(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const { name, email, cpf, role, isActive, employeeData } = req.body;

      // Verificar se usuário existe
      const existingUser = await prisma.user.findUnique({
        where: { id },
        include: { employee: true }
      });

      if (!existingUser) {
        throw createError('Usuário não encontrado', 404);
      }

      // Verificar se email já existe em outro usuário
      if (email && email !== existingUser.email) {
        const emailExists = await prisma.user.findFirst({
          where: {
            email,
            id: { not: id }
          }
        });

        if (emailExists) {
          throw createError('Email já está em uso', 400);
        }
      }

      // Verificar se CPF já existe em outro usuário
      if (cpf && cpf !== existingUser.cpf) {
        const cpfExists = await prisma.user.findFirst({
          where: {
            cpf,
            id: { not: id }
          }
        });

        if (cpfExists) {
          throw createError('CPF já está em uso', 400);
        }
      }

      const result = await prisma.$transaction(async (tx: any) => {
        const deactivating =
          isActive === false && existingUser.isActive !== false;

        // Atualizar usuário
        const user = deactivating
          ? await tx.user.update({
              where: { id },
              data: {
                isActive: false,
                ...(() => {
                  const identity = buildReleasedIdentity(id);
                  return { email: identity.email, cpf: identity.cpf };
                })(),
                ...(name && { name }),
                ...(role && { role }),
              },
            })
          : await tx.user.update({
              where: { id },
              data: {
                ...(name && { name }),
                ...(email && { email }),
                ...(cpf && { cpf }),
                ...(role && { role }),
                ...(isActive !== undefined && { isActive }),
              },
            });

        // Atualizar dados do funcionário se fornecidos
        if (employeeData && existingUser.employee) {
          await tx.employee.update({
            where: { userId: id },
            data: {
              ...(employeeData.department && { department: employeeData.department }),
              ...(employeeData.position && { position: employeeData.position }),
              ...(employeeData.hireDate && { hireDate: new Date(employeeData.hireDate + 'T04:00:00') }),
              ...(employeeData.salary && { salary: employeeData.salary }),
              ...(employeeData.workSchedule && { workSchedule: employeeData.workSchedule }),
              ...(employeeData.isRemote !== undefined && { isRemote: employeeData.isRemote }),
              ...(employeeData.phone !== undefined && { phone: employeeData.phone || null }),
              ...(employeeData.allowedLocations && { allowedLocations: employeeData.allowedLocations }),
              ...(employeeData.costCenter !== undefined && { costCenter: employeeData.costCenter }),
              ...(employeeData.client !== undefined && { client: employeeData.client }),
              ...(employeeData.birthDate && { birthDate: new Date(employeeData.birthDate + 'T04:00:00') }),
              ...(employeeData.company !== undefined && { company: employeeData.company }),
              ...(employeeData.bank !== undefined && { bank: employeeData.bank }),
              ...(employeeData.accountType !== undefined && { accountType: employeeData.accountType }),
              ...(employeeData.agency !== undefined && { agency: employeeData.agency }),
              ...(employeeData.operation !== undefined && { operation: employeeData.operation && employeeData.operation !== 'N/A' ? employeeData.operation : null }),
              ...(employeeData.account !== undefined && { account: employeeData.account }),
              ...(employeeData.digit !== undefined && { digit: employeeData.digit }),
              ...(employeeData.pixKeyType !== undefined && { pixKeyType: employeeData.pixKeyType }),
              ...(employeeData.pixKey !== undefined && { pixKey: employeeData.pixKey }),
              ...(employeeData.modality !== undefined && { modality: employeeData.modality }),
              ...(employeeData.familySalary !== undefined && { familySalary: employeeData.familySalary }),
              ...(employeeData.dangerPay !== undefined && { dangerPay: employeeData.dangerPay }),
              ...(employeeData.unhealthyPay !== undefined && { unhealthyPay: employeeData.unhealthyPay }),
              ...(employeeData.dailyFoodVoucher !== undefined && { dailyFoodVoucher: employeeData.dailyFoodVoucher }),
              ...(employeeData.dailyTransportVoucher !== undefined && { dailyTransportVoucher: employeeData.dailyTransportVoucher }),
              // Novos campos - Polo e Categoria Financeira
              ...(employeeData.polo !== undefined && { polo: employeeData.polo }),
              ...(employeeData.categoriaFinanceira !== undefined && { categoriaFinanceira: employeeData.categoriaFinanceira }),
              // Campo para controlar se precisa bater ponto - sempre incluir, mesmo se for false
              requiresTimeClock: employeeData.requiresTimeClock !== undefined ? employeeData.requiresTimeClock : true
            }
          });
        }

        return user;
      });

      const updatedUser = await prisma.user.findUnique({
        where: { id },
        select: {
          id: true,
          email: true,
          name: true,
          cpf: true,
          role: true,
          isActive: true,
          updatedAt: true,
          employee: true
        }
      });

      res.json({
        success: true,
        data: updatedUser,
        message: 'Usuário atualizado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  async deleteUser(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;

      const user = await prisma.user.findUnique({
        where: { id }
      });

      if (!user) {
        throw createError('Usuário não encontrado', 404);
      }

      // Desliga e libera CPF/e-mail para permitir novo cadastro com os mesmos dados
      await releaseUserIdentity(id);

      res.json({
        success: true,
        message: 'Usuário desativado com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  async getMyEmployeeData(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;

      const employee = await prisma.employee.findUnique({
        where: { userId },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              cpf: true,
              role: true
            }
          }
        }
      });

      if (!employee) {
        throw createError('Dados de funcionário não encontrados', 404);
      }

      res.json({
        success: true,
        data: employee
      });
    } catch (error) {
      next(error);
    }
  }

  async updateMyEmployeeData(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { department, position, workSchedule, allowedLocations } = req.body;

      const employee = await prisma.employee.findUnique({
        where: { userId }
      });

      if (!employee) {
        throw createError('Dados de funcionário não encontrados', 404);
      }

      const updatedEmployee = await prisma.employee.update({
        where: { userId },
        data: {
          ...(department && { department }),
          ...(position && { position }),
          ...(workSchedule && { workSchedule }),
          ...(allowedLocations && { allowedLocations })
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              cpf: true,
              role: true
            }
          }
        }
      });

      res.json({
        success: true,
        data: updatedEmployee,
        message: 'Dados atualizados com sucesso'
      });
    } catch (error) {
      next(error);
    }
  }

  async getUsersByDepartment(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { department } = req.params;
      const { page = 1, limit = 10 } = req.query;
      const skip = (Number(page) - 1) * Number(limit);

      const [users, total] = await Promise.all([
        prisma.user.findMany({
          where: {
            ...gennecyBotUserWhereExclude(),
            isActive: true,
            employee: {
              department: { contains: department, mode: 'insensitive' }
            }
          },
          skip,
          take: Number(limit),
          include: {
            employee: {
              select: {
                employeeId: true,
                department: true,
                position: true,
                hireDate: true
              }
            }
          },
          orderBy: { name: 'asc' }
        }),
        prisma.user.count({
          where: {
            ...gennecyBotUserWhereExclude(),
            isActive: true,
            employee: {
              department: { contains: department, mode: 'insensitive' }
            }
          }
        })
      ]);

      res.json({
        success: true,
        data: users,
        pagination: {
          page: Number(page),
          limit: Number(limit),
          total,
          totalPages: Math.ceil(total / Number(limit))
        }
      });
    } catch (error) {
        console.error(error); // Adicione esta linha
      next(error);
    }
  }

  async checkCpfExists(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { cpf } = req.query;

      if (!cpf || typeof cpf !== 'string') {
        return res.json({
          success: true,
          exists: false
        });
      }

      // Remover formatação do CPF recebido
      const cpfNumbers = cpf.replace(/\D/g, '');

      if (cpfNumbers.length !== 11) {
        return res.json({
          success: true,
          exists: false
        });
      }

      // Buscar CPF no banco - pode estar com ou sem formatação
      // Buscamos tanto o CPF formatado quanto sem formatação
      const cpfFormatted = `${cpfNumbers.slice(0, 3)}.${cpfNumbers.slice(3, 6)}.${cpfNumbers.slice(6, 9)}-${cpfNumbers.slice(9, 11)}`;
      
      const existingUser = await prisma.user.findFirst({
        where: {
          isActive: true,
          OR: [
            { cpf: cpfNumbers },
            { cpf: cpfFormatted }
          ]
        },
        select: { id: true, name: true }
      });

      // Se não encontrou, fazer uma busca mais ampla normalizando CPFs (só ativos)
      if (!existingUser) {
        const allUsers = await prisma.user.findMany({
          where: { isActive: true },
          select: { id: true, name: true, cpf: true }
        });

        const foundUser = allUsers.find(user => {
          const userCpfNumbers = user.cpf.replace(/\D/g, '');
          return userCpfNumbers === cpfNumbers;
        });

        return res.json({
          success: true,
          exists: !!foundUser,
          user: foundUser ? { id: foundUser.id, name: foundUser.name } : null
        });
      }

      return res.json({
        success: true,
        exists: true,
        user: { id: existingUser.id, name: existingUser.name }
      });
    } catch (error) {
      return next(error);
    }
  }

  async checkEmailExists(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { email } = req.query;

      if (!email || typeof email !== 'string') {
        return res.json({
          success: true,
          exists: false
        });
      }

      // Validar formato básico de email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.json({
          success: true,
          exists: false
        });
      }

      // Buscar email no banco (case-insensitive) — só ativos
      const existingUser = await prisma.user.findFirst({
        where: {
          isActive: true,
          email: {
            equals: email,
            mode: 'insensitive'
          }
        },
        select: { id: true, name: true }
      });

      return res.json({
        success: true,
        exists: !!existingUser,
        user: existingUser ? { id: existingUser.id, name: existingUser.name } : null
      });
    } catch (error) {
      return next(error);
    }
  }

  /** Foto séria usada só no confronto facial do ponto — não altera o avatar. */
  async uploadFacePhoto(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const file = (req as unknown as Express.Request & { file?: Express.Multer.File }).file;
      if (!file?.buffer) throw createError('Nenhuma imagem enviada', 400);

      const mime = String(file.mimetype || '').toLowerCase();
      const name = String(file.originalname || '').toLowerCase();
      const imageOk =
        mime.startsWith('image/') ||
        ['.jpg', '.jpeg', '.png', '.webp'].some((ext) => name.endsWith(ext));
      if (!imageOk) throw createError('Envie uma imagem (JPG, PNG ou WEBP)', 400);

      const existing = await prisma.user.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!existing) throw createError('Usuário não encontrado', 404);

      const uploadResult = await chatUploadService.uploadFile(file, id);
      const updated = await prisma.user.update({
        where: { id },
        data: {
          facePhotoUrl: uploadResult.url,
          facePhotoKey: uploadResult.key,
        },
        select: facePhotoSelect,
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

  async removeFacePhoto(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const existing = await prisma.user.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!existing) throw createError('Usuário não encontrado', 404);

      const updated = await prisma.user.update({
        where: { id },
        data: { facePhotoUrl: null, facePhotoKey: null },
        select: facePhotoSelect,
      });

      return res.json({
        success: true,
        data: updated,
        message: 'Foto do ponto removida',
      });
    } catch (error) {
      return next(error);
    }
  }
}
