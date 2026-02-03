import { ChatStatus } from '@prisma/client';
import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { prisma } from '../lib/prisma';

export interface CreateChatData {
  initiatorId: string;
  recipientDepartment: string;
  initialMessage: string;
  attachments?: Array<{
    fileName: string;
    fileUrl: string;
    fileKey: string;
    fileSize: number;
    mimeType: string;
  }>;
}

export interface SendMessageData {
  chatId: string;
  senderId: string;
  content: string;
  attachments?: Array<{
    fileName: string;
    fileUrl: string;
    fileKey: string;
    fileSize: number;
    mimeType: string;
  }>;
}

export class ChatService {
  private s3: AWS.S3 | null;
  private bucketName: string;
  private useLocal: boolean;

  // Função auxiliar para normalizar departamentos (remove acentos e converte para uppercase)
  private normalizeDepartment(dept: string | null | undefined): string {
    if (!dept) return '';
    return dept.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }

  constructor() {
    this.useLocal = (process.env.STORAGE_PROVIDER || '').toLowerCase() === 'local'
      || !process.env.AWS_ACCESS_KEY_ID
      || !process.env.AWS_SECRET_ACCESS_KEY;

    this.s3 = this.useLocal ? null : new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION || 'us-east-1'
    });

    this.bucketName = process.env.AWS_S3_BUCKET || 'sistema-ponto-fotos';
  }

  /**
   * Cria um novo chat (conversa pendente)
   */
  async createChat(data: CreateChatData) {
    const { initiatorId, recipientDepartment, initialMessage, attachments = [] } = data;

    // Validar setor destinatário (normalizado)
    const validDepartments = [
      'PROJETOS',
      'CONTRATOS E LICITACOES',
      'SUPRIMENTOS',
      'JURIDICO',
      'DEPARTAMENTO PESSOAL',
      'ENGENHARIA',
      'ADMINISTRATIVO',
      'FINANCEIRO'
    ];

    const normalizedDepartment = this.normalizeDepartment(recipientDepartment);
    if (!validDepartments.includes(normalizedDepartment)) {
      throw new Error('Setor destinatário inválido');
    }

    // Criar chat e primeira mensagem
    const chat = await prisma.chat.create({
      data: {
        initiatorId,
        recipientDepartment: normalizedDepartment,
        status: ChatStatus.PENDING,
        lastMessageAt: new Date(),
        messages: {
          create: {
            senderId: initiatorId,
            content: initialMessage,
            isRead: false,
            attachments: {
              create: attachments.map(att => ({
                fileName: att.fileName,
                fileUrl: att.fileUrl,
                fileKey: att.fileKey,
                fileSize: att.fileSize,
                mimeType: att.mimeType
              }))
            }
          }
        }
      },
      include: {
        initiator: {
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
        },
        messages: {
          include: {
            sender: {
              select: {
                id: true,
                name: true,
                email: true
              }
            },
            attachments: true
          },
          orderBy: {
            createdAt: 'asc'
          }
        }
      }
    });

    return chat;
  }

  /**
   * Aceita uma conversa pendente
   */
  async acceptChat(chatId: string, userId: string) {
    const chat = await prisma.chat.findUnique({
      where: { id: chatId }
    });

    if (!chat) {
      throw new Error('Chat não encontrado');
    }

    if (chat.status !== ChatStatus.PENDING) {
      throw new Error('Chat não está pendente de aceitação');
    }

    // Verificar se o usuário pertence ao setor destinatário
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { employee: true }
    });

    if (!user?.employee) {
      throw new Error('Usuário não possui departamento associado');
    }

    // Normalizar ambos os departamentos para comparação
    const userDepartment = this.normalizeDepartment(user.employee.department);
    const chatDepartment = this.normalizeDepartment(chat.recipientDepartment);

    if (userDepartment !== chatDepartment) {
      throw new Error('Usuário não tem permissão para aceitar este chat');
    }

    const updated = await prisma.chat.update({
      where: { id: chatId },
      data: {
        status: ChatStatus.ACCEPTED,
        acceptedBy: userId,
        acceptedAt: new Date()
      },
      include: {
        initiator: {
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
        },
        accepter: {
          select: {
            id: true,
            name: true,
            email: true
          }
        },
        messages: {
          include: {
            sender: {
              select: {
                id: true,
                name: true,
                email: true
              }
            },
            attachments: true
          },
          orderBy: {
            createdAt: 'asc'
          }
        }
      }
    });

    return updated;
  }

  /**
   * Rejeita uma conversa (deleta)
   */
  async rejectChat(chatId: string, userId: string) {
    const chat = await prisma.chat.findUnique({
      where: { id: chatId }
    });

    if (!chat) {
      throw new Error('Chat não encontrado');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { employee: true }
    });

    if (!user?.employee) {
      throw new Error('Usuário não possui departamento');
    }

    const userDepartment = this.normalizeDepartment(user.employee.department);
    const chatDepartment = this.normalizeDepartment(chat.recipientDepartment);

    if (userDepartment !== chatDepartment) {
      throw new Error('Usuário não tem permissão para rejeitar este chat');
    }

    await prisma.chat.delete({
      where: { id: chatId }
    });

    return { success: true };
  }

  /**
   * Deleta uma conversa (permite iniciador ou destinatário)
   */
  async deleteChat(chatId: string, userId: string) {
    const chat = await prisma.chat.findUnique({
      where: { id: chatId }
    });

    if (!chat) {
      throw new Error('Chat não encontrado');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { employee: true }
    });

    if (!user?.employee) {
      throw new Error('Usuário não possui departamento');
    }

    const userDepartment = this.normalizeDepartment(user.employee.department);
    const isInitiator = chat.initiatorId === userId;
    const isRecipient = userDepartment === this.normalizeDepartment(chat.recipientDepartment);

    if (!isInitiator && !isRecipient) {
      throw new Error('Usuário não tem permissão para deletar este chat');
    }

    await prisma.chat.delete({
      where: { id: chatId }
    });

    return { success: true };
  }

  /**
   * Envia mensagem em um chat
   */
  async sendMessage(data: SendMessageData) {
    const { chatId, senderId, content, attachments = [] } = data;

    const chat = await prisma.chat.findUnique({
      where: { id: chatId }
    });

    if (!chat) {
      throw new Error('Chat não encontrado');
    }

    if (chat.status === ChatStatus.CLOSED) {
      throw new Error('Chat está encerrado');
    }

    // Verificar se o usuário pode enviar mensagem neste chat
    const user = await prisma.user.findUnique({
      where: { id: senderId },
      include: { employee: true }
    });

    if (!user) {
      throw new Error('Usuário não encontrado');
    }

    const canSend = 
      chat.initiatorId === senderId || 
      (user.employee && this.normalizeDepartment(user.employee.department) === this.normalizeDepartment(chat.recipientDepartment));

    if (!canSend) {
      throw new Error('Usuário não tem permissão para enviar mensagem neste chat');
    }

    // Se o chat estava pendente e o remetente é do setor destinatário, aceitar automaticamente
    if (chat.status === ChatStatus.PENDING && user.employee && 
        this.normalizeDepartment(user.employee.department) === this.normalizeDepartment(chat.recipientDepartment)) {
      await prisma.chat.update({
        where: { id: chatId },
        data: {
          status: ChatStatus.ACCEPTED,
          acceptedBy: senderId,
          acceptedAt: new Date()
        }
      });
    }

    const message = await prisma.message.create({
      data: {
        chatId,
        senderId,
        content,
        isRead: false,
        attachments: {
          create: attachments.map(att => ({
            fileName: att.fileName,
            fileUrl: att.fileUrl,
            fileKey: att.fileKey,
            fileSize: att.fileSize,
            mimeType: att.mimeType
          }))
        }
      },
      include: {
        sender: {
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
        },
        attachments: true
      }
    });

    // Atualizar lastMessageAt do chat
    await prisma.chat.update({
      where: { id: chatId },
      data: {
        lastMessageAt: new Date()
      }
    });

    return message;
  }

  /**
   * Lista chats pendentes de um setor
   */
  async getPendingChats(department: string) {
    const normalizedDepartment = this.normalizeDepartment(department);
    const chats = await prisma.chat.findMany({
      where: {
        recipientDepartment: normalizedDepartment,
        status: ChatStatus.PENDING
      },
      include: {
        initiator: {
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
        },
        messages: {
          take: 1,
          orderBy: {
            createdAt: 'desc'
          },
          include: {
            sender: {
              select: {
                name: true
              }
            }
          }
        }
      },
      orderBy: {
        lastMessageAt: 'desc'
      }
    });

    return chats;
  }

  /**
   * Lista chats ativos de um usuário
   */
  async getActiveChats(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { employee: true }
    });

    if (!user?.employee) {
      return [];
    }

    const department = this.normalizeDepartment(user.employee.department);

    const chats = await prisma.chat.findMany({
      where: {
        OR: [
          // Chats criados pelo usuário (mostrar PENDING e ACCEPTED)
          { 
            initiatorId: userId, 
            status: { in: [ChatStatus.PENDING, ChatStatus.ACCEPTED] }
          },
          // Chats aceitos do setor do usuário
          { recipientDepartment: department, status: ChatStatus.ACCEPTED }
        ]
      },
      include: {
        initiator: {
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
        },
        accepter: {
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
        },
        messages: {
          take: 1,
          orderBy: {
            createdAt: 'desc'
          },
          include: {
            sender: {
              select: {
                name: true
              }
            }
          }
        }
      },
      orderBy: {
        lastMessageAt: 'desc'
      }
    });

    return chats;
  }

  /**
   * Lista chats encerrados de um usuário
   */
  async getClosedChats(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { employee: true }
    });

    if (!user?.employee) {
      return [];
    }

    const department = this.normalizeDepartment(user.employee.department);

    const chats = await prisma.chat.findMany({
      where: {
        status: ChatStatus.CLOSED,
        OR: [
          // Chats criados pelo usuário
          { initiatorId: userId },
          // Chats do setor do usuário que foram fechados
          { recipientDepartment: department }
        ]
      },
      include: {
        initiator: {
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
        },
        accepter: {
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
        },
        messages: {
          take: 1,
          orderBy: {
            createdAt: 'desc'
          },
          include: {
            sender: {
              select: {
                name: true
              }
            }
          }
        }
      },
      orderBy: {
        closedAt: 'desc'
      }
    });

    return chats;
  }

  /**
   * Obtém um chat específico com todas as mensagens
   */
  async getChatById(chatId: string, userId: string) {
    try {
      if (!chatId || !userId) {
        throw new Error('ID do chat e ID do usuário são obrigatórios');
      }

      const chat = await prisma.chat.findUnique({
        where: { id: chatId },
        include: {
          initiator: {
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
          },
          accepter: {
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
          },
          messages: {
            include: {
              sender: {
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
              },
              attachments: {
                select: {
                  id: true,
                  fileName: true,
                  fileUrl: true,
                  fileSize: true,
                  mimeType: true
                }
              }
            },
            orderBy: {
              createdAt: 'asc'
            }
          }
        }
      });

      if (!chat) {
        throw new Error('Chat não encontrado');
      }

      // Verificar permissão
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { employee: true }
      });

      if (!user) {
        throw new Error('Usuário não encontrado');
      }

      // Verificar permissão: iniciador ou membro do setor destinatário
      const isInitiator = chat.initiatorId === userId;
      let isRecipient = false;

      // Se for o iniciador, já tem permissão
      if (isInitiator) {
        return chat;
      }

      // Verificar se é do setor destinatário
      if (user.employee && user.employee.department && chat.recipientDepartment) {
        try {
          const userDepartment = this.normalizeDepartment(user.employee.department);
          const chatDepartment = this.normalizeDepartment(chat.recipientDepartment);
          isRecipient = userDepartment === chatDepartment && userDepartment !== '';
        } catch (normalizeError) {
          console.error('Erro ao normalizar departamentos:', normalizeError);
          // Se houver erro na normalização, não conceder permissão
          isRecipient = false;
        }
      }

      if (!isRecipient) {
        throw new Error('Usuário não tem permissão para ver este chat');
      }

      return chat;
    } catch (error: any) {
      console.error('Erro em getChatById:', {
        chatId,
        userId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Marca mensagens como lidas
   */
  async markMessagesAsRead(chatId: string, userId: string) {
    const chat = await prisma.chat.findUnique({
      where: { id: chatId }
    });

    if (!chat) {
      throw new Error('Chat não encontrado');
    }

    // Marcar todas as mensagens não lidas do outro usuário como lidas
    await prisma.message.updateMany({
      where: {
        chatId,
        senderId: { not: userId },
        isRead: false
      },
      data: {
        isRead: true,
        readAt: new Date()
      }
    });

    return { success: true };
  }

  /**
   * Encerra um chat
   */
  async closeChat(chatId: string, userId: string) {
    const chat = await prisma.chat.findUnique({
      where: { id: chatId }
    });

    if (!chat) {
      throw new Error('Chat não encontrado');
    }

    if (chat.status === ChatStatus.CLOSED) {
      throw new Error('Chat já está encerrado');
    }

    // Verificar permissão (qualquer participante pode encerrar)
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { employee: true }
    });

    if (!user) {
      throw new Error('Usuário não encontrado');
    }

    const hasPermission = 
      chat.initiatorId === userId || 
      (user.employee && this.normalizeDepartment(user.employee.department) === this.normalizeDepartment(chat.recipientDepartment));

    if (!hasPermission) {
      throw new Error('Usuário não tem permissão para encerrar este chat');
    }

    const updated = await prisma.chat.update({
      where: { id: chatId },
      data: {
        status: ChatStatus.CLOSED,
        closedBy: userId,
        closedAt: new Date()
      }
    });

    return updated;
  }

  /**
   * Conta chats pendentes de um setor
   */
  async getPendingChatsCount(department: string) {
    const normalizedDepartment = this.normalizeDepartment(department);
    const count = await prisma.chat.count({
      where: {
        recipientDepartment: normalizedDepartment,
        status: ChatStatus.PENDING
      }
    });

    return count;
  }

  /**
   * Conta mensagens não lidas de um usuário
   */
  async getUnreadMessagesCount(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { employee: true }
    });

    if (!user?.employee) {
      return 0;
    }

    const department = this.normalizeDepartment(user.employee.department);

    // Contar mensagens não lidas em chats ativos onde o usuário não é o remetente
    const count = await prisma.message.count({
      where: {
        chat: {
          OR: [
            { initiatorId: userId },
            { recipientDepartment: department, status: ChatStatus.ACCEPTED }
          ],
          status: ChatStatus.ACCEPTED
        },
        senderId: { not: userId },
        isRead: false
      }
    });

    return count;
  }

  /**
   * Faz upload de arquivo
   */
  async uploadFile(file: any, userId: string): Promise<{
    url: string;
    key: string;
    size: number;
    mimeType: string;
  }> {
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new Error('Arquivo muito grande. Tamanho máximo: 10MB');
    }

    if (this.useLocal || !this.s3) {
      const uploadsDir = path.join(process.cwd(), 'apps', 'backend', 'uploads', 'messages');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      const fileExtension = path.extname(file.originalname);
      const fileName = `${uuidv4()}${fileExtension}`;
      const filePath = path.join(uploadsDir, fileName);

      fs.writeFileSync(filePath, file.buffer);

      return {
        url: `/uploads/messages/${fileName}`,
        key: `messages/${fileName}`,
        size: file.size,
        mimeType: file.mimetype || 'application/octet-stream'
      };
    }

    const fileExtension = path.extname(file.originalname);
    const fileName = `messages/${userId}/${uuidv4()}${fileExtension}`;

    const uploadParams = {
      Bucket: this.bucketName,
      Key: fileName,
      Body: file.buffer,
      ContentType: file.mimetype || 'application/octet-stream',
      ACL: 'private'
    } as AWS.S3.PutObjectRequest;

    const result = await this.s3.upload(uploadParams).promise();

    return {
      url: result.Location,
      key: fileName,
      size: file.size,
      mimeType: file.mimetype || 'application/octet-stream'
    };
  }
}

