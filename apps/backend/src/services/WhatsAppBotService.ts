import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { metaWhatsApp } from './MetaWhatsAppService';

type FlowStatus =
  | 'MENU'
  | 'ATESTADO_ASK_FOR_WHOM'
  | 'ATESTADO_ASK_PERSON_NAME'
  | 'ATESTADO_ASK_COST_CENTER'
  | 'ATESTADO_ASK_REQUESTER_SECTOR'
  | 'ATESTADO_ASK_TYPE'
  | 'ATESTADO_ASK_OTHER_TYPE'
  | 'ATESTADO_ASK_START_DATE'
  | 'ATESTADO_ASK_END_DATE'
  | 'ATESTADO_ASK_FILE'
  | 'ATESTADO_COMPLETE';

const ATESTADO_TYPES: Record<string, string> = {
  '1': 'MEDICAL',
  '2': 'DENTAL',
  '3': 'PREVENTIVE',
  '4': 'ACCIDENT',
  '5': 'COVID',
  '6': 'OTHER'
};

const ATESTADO_LABELS: Record<string, string> = {
  '1': 'Atestado médico',
  '2': 'Atestado odontológico',
  '3': 'Exame preventivo',
  '4': 'Acidente de trabalho',
  '5': 'COVID-19',
  '6': 'Outros'
};

const REQUESTER_SECTORS: Record<string, string> = {
  ENGENHARIA: 'Engenharia',
  CONTRATOS_LICITACOES: 'Contratos e Licitações',
  JURIDICO: 'Jurídico',
  PROJETOS: 'Projetos',
  TST_ADM: 'TST/ADM',
  SUPRIMENTOS: 'Suprimentos'
};

/** Delay curto (API oficial) — rápido sem parecer “instantâneo” */
const delayNatural = () =>
  new Promise((r) => setTimeout(r, 600 + Math.random() * 700));

/** Escolhe uma opção aleatória de um array */
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

type SendAction =
  | { type: 'text'; text: string }
  | { type: 'buttons'; body: string; buttons: Array<{ id: string; title: string }> }
  | {
      type: 'list';
      body: string;
      buttonText: string;
      sectionTitle: string;
      rows: Array<{ id: string; title: string }>;
    };

export class WhatsAppBotService {
  async processMessage(phone: string, text: string, hasMedia = false): Promise<void> {
    let conversation = await prisma.whatsAppConversation.findFirst({
      where: { phone },
      orderBy: { updatedAt: 'desc' }
    });

    if (!conversation) {
      conversation = await prisma.whatsAppConversation.create({
        data: {
          phone,
          flowStatus: 'MENU',
          payload: {}
        }
      });
    }

    const textRaw = (text || '').trim();
    const content = textRaw.toLowerCase();
    const flowStatusBefore = (conversation.flowStatus || 'MENU') as FlowStatus;

    const isAtestadoStart = () =>
      content === '1' ||
      content.includes('atestado') ||
      content.includes('atestato') ||
      content.includes('atestados') ||
      content.includes('atest');

    // Regra: cada nova "iniciação" de atestado vira uma nova conversa (admin separa em blocos).
    let shouldStartNewConversation = false;

    if (flowStatusBefore === 'ATESTADO_COMPLETE' && isAtestadoStart()) {
      shouldStartNewConversation = true;
    }

    if (flowStatusBefore === 'MENU' && isAtestadoStart()) {
      const [messageCount, submissionCount] = await Promise.all([
        prisma.whatsAppMessage.count({ where: { conversationId: conversation.id } }),
        prisma.whatsAppSubmission.count({ where: { conversationId: conversation.id } })
      ]);

      // Se já existe histórico nesta conversa, uma nova iniciação deve criar outro bloco.
      if (messageCount > 0 || submissionCount > 0) {
        shouldStartNewConversation = true;
      }
    }

    if (shouldStartNewConversation) {
      conversation = await prisma.whatsAppConversation.create({
        data: {
          phone,
          flowStatus: 'MENU',
          payload: {}
        }
      });
    }

    const payload = (conversation.payload as Record<string, unknown>) || {};
    const flowStatus = (conversation.flowStatus || 'MENU') as FlowStatus;

    // Salvar mensagem do usuário
    await prisma.whatsAppMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: hasMedia ? '[Arquivo enviado]' : (text || '[sem texto]')
      }
    });

    let sendAction: SendAction = { type: 'text', text: '' };
    let newStatus = flowStatus;
    type ConversationStatus = 'PENDING' | 'COMPLETED' | 'CANCELLED';
    let newConversationStatus: ConversationStatus = ((conversation as any).status as ConversationStatus) || 'PENDING';
    const newPayload = { ...payload };

    const isEndRequest = () =>
      ['end', 'encerrar', 'sair', 'cancelar', 'parar', 'fim'].includes(content);

    const isMenuRequest = () => ['menu', 'voltar', 'inicio'].includes(content);

    const menu = (): SendAction => ({
      type: 'buttons',
      body: pick([
        'Olá! Sou o assistente da Gennesis. Como posso ajudar?',
        'Oi! Posso te ajudar com atestados médicos.'
      ]),
      buttons: [
        { id: 'ATESTADO', title: 'Enviar atestado' },
        { id: 'END', title: 'Encerrar' }
      ]
    });

    const tipoAtestado = (): SendAction => ({
      type: 'list',
      body: 'Qual o tipo de atestado?',
      buttonText: 'Escolher',
      sectionTitle: 'Opções',
      rows: [
        ...Object.entries(ATESTADO_LABELS).map(([k, v]) => ({ id: `TYPE_${k}`, title: v })),
        { id: 'MENU', title: 'Voltar' },
        { id: 'END', title: 'Encerrar atendimento' }
      ]
    });

    const parseDateInput = (
      value: string
    ): { date: Date; normalized: string } | null => {
      const v = (value || '').trim();
      if (!v) return null;

      // Formatos aceitos (local):
      // - dd/MM/yyyy ou dd-MM-yyyy
      // - yyyy-MM-dd ou yyyy-MM-ddTHH:mm:ss...
      const dmY = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (dmY) {
        const day = Number(dmY[1]);
        const month = Number(dmY[2]);
        const year = Number(dmY[3]);
        if (!Number.isFinite(day) || !Number.isFinite(month) || !Number.isFinite(year)) return null;
        const date = new Date(year, month - 1, day, 0, 0, 0, 0);
        // Validação real (evita 31/02 virar mar/03)
        if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
        const normalized = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
        return { date, normalized };
      }

      const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/);
      if (iso) {
        const year = Number(iso[1]);
        const month = Number(iso[2]);
        const day = Number(iso[3]);
        const date = new Date(year, month - 1, day, 0, 0, 0, 0);
        if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
        const normalized = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
        return { date, normalized };
      }

      return null;
    };

    const extractDateRange = (value: string): { start: string; end: string } | null => {
      const v = (value || '').trim();
      if (!v) return null;

      // Procura 2 datas em sequência no texto (ex.: "01/03/2026 - 05/03/2026")
      const matches = [...v.matchAll(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}|\d{4}-\d{2}-\d{2})/g)].map((m) => m[0]);
      if (matches.length < 2) return null;
      const startParsed = parseDateInput(matches[0]);
      const endParsed = parseDateInput(matches[1]);
      if (!startParsed || !endParsed) return null;
      return { start: startParsed.normalized, end: endParsed.normalized };
    };

    const startOfLocalDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
    const addLocalDays = (d: Date, days: number) =>
      new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, 0, 0, 0, 0);
    const formatDMY = (d: Date) =>
      `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    const formatDM = (d: Date) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

    const getDatePresetRange = (presetId: string): { start: Date; end: Date } | null => {
      const today = startOfLocalDay(new Date());
      const presets: Record<string, { startOffset: number; endOffset: number }> = {
        preset_today: { startOffset: 0, endOffset: 0 },
        preset_yesterday: { startOffset: -1, endOffset: -1 },
        preset_last_3: { startOffset: -2, endOffset: 0 },
        preset_last_5: { startOffset: -4, endOffset: 0 },
        preset_last_7: { startOffset: -6, endOffset: 0 },
        preset_last_10: { startOffset: -9, endOffset: 0 }
      };
      const p = presets[presetId];
      if (!p) return null;
      return {
        start: addLocalDays(today, p.startOffset),
        end: addLocalDays(today, p.endOffset)
      };
    };

    const datePresetList = (): SendAction => {
      const today = startOfLocalDay(new Date());
      const presets: Array<{
        id: string;
        title: string;
        startOffset: number;
        endOffset: number;
      }> = [
        { id: 'preset_today', title: 'Hoje', startOffset: 0, endOffset: 0 },
        { id: 'preset_yesterday', title: 'Ontem', startOffset: -1, endOffset: -1 },
        { id: 'preset_last_3', title: 'Últimos 3 dias', startOffset: -2, endOffset: 0 },
        { id: 'preset_last_5', title: 'Últimos 5 dias', startOffset: -4, endOffset: 0 },
        { id: 'preset_last_7', title: 'Última semana (7 dias)', startOffset: -6, endOffset: 0 },
        { id: 'preset_last_10', title: 'Últimos 10 dias', startOffset: -9, endOffset: 0 }
      ];

      const rows = presets.map((p) => {
        const start = addLocalDays(today, p.startOffset);
        const end = addLocalDays(today, p.endOffset);
        const datePart = p.startOffset === p.endOffset ? `${formatDM(start)}` : `${formatDM(start)}-${formatDM(end)}`;
        return { id: p.id, title: `${datePart} (${p.title})` };
      });

      return {
        type: 'list',
        body: 'Selecione o período do atestado (sem precisar digitar datas).',
        buttonText: 'Escolher',
        sectionTitle: 'Período',
        rows: [
          ...rows,
          { id: 'MENU', title: 'Voltar' },
          { id: 'END', title: 'Encerrar atendimento' }
        ]
      };
    };

    const clearPayload = () => {
      Object.keys(newPayload).forEach((k) => delete (newPayload as any)[k]);
    };

    const endConversation = (): SendAction => {
      clearPayload();
      newStatus = 'MENU';
      newConversationStatus = 'CANCELLED';
      return {
        type: 'text',
        text: 'Atendimento encerrado. Se precisar de novo, é só enviar uma mensagem.'
      };
    };

    const resetToMenu = (): SendAction => {
      clearPayload();
      newStatus = 'MENU';
      if (newConversationStatus !== 'COMPLETED') newConversationStatus = 'PENDING';
      return menu();
    };

    switch (flowStatus) {
      case 'MENU': {
        if (isEndRequest()) {
          sendAction = endConversation();
          break;
        }

        if (
          content === '1' ||
          content.includes('atestado') ||
          content.includes('atestato') ||
          content.includes('atestados') ||
          content.includes('atest')
        ) {
          newStatus = 'ATESTADO_ASK_FOR_WHOM';
          newPayload.flow = 'ATESTADO';
          sendAction = {
            type: 'buttons',
            body: 'Este atestado é para você ou para outra pessoa?',
            buttons: [
              { id: 'SELF', title: 'Para mim' },
              { id: 'OTHER', title: 'Outra pessoa' },
              { id: 'END', title: 'Encerrar' }
            ]
          };
        } else {
          sendAction = menu();
        }
        break;
      }

      case 'ATESTADO_ASK_FOR_WHOM': {
        if (isEndRequest()) {
          sendAction = endConversation();
          break;
        }
        if (isMenuRequest()) {
          sendAction = resetToMenu();
          break;
        }

        if (content === 'self') {
          newPayload.forWhom = 'SELF';
          delete (newPayload as any).requesterSector;
          newStatus = 'ATESTADO_ASK_PERSON_NAME';
          sendAction = {
            type: 'buttons',
            body: 'Perfeito. Qual é o seu nome completo (para o atestado)?',
            buttons: [
              { id: 'MENU', title: 'Voltar' },
              { id: 'END', title: 'Encerrar' }
            ]
          };
        } else if (content === 'other') {
          newPayload.forWhom = 'OTHER';
          delete (newPayload as any).requesterSector;
          newStatus = 'ATESTADO_ASK_PERSON_NAME';
          sendAction = {
            type: 'buttons',
            body: 'Certo. Qual é o nome completo da pessoa para quem você quer enviar o atestado?',
            buttons: [
              { id: 'MENU', title: 'Voltar' },
              { id: 'END', title: 'Encerrar' }
            ]
          };
        } else {
          sendAction = {
            type: 'buttons',
            body: 'Me confirme: este atestado é para você ou para outra pessoa?',
            buttons: [
              { id: 'SELF', title: 'Para mim' },
              { id: 'OTHER', title: 'Outra pessoa' },
              { id: 'END', title: 'Encerrar' }
            ]
          };
        }
        break;
      }

      case 'ATESTADO_ASK_PERSON_NAME': {
        if (isEndRequest()) {
          sendAction = endConversation();
          break;
        }
        if (isMenuRequest()) {
          sendAction = resetToMenu();
          break;
        }

        if (!textRaw) {
          sendAction = {
            type: 'buttons',
            body: 'Não recebi o nome. Qual é o nome completo da pessoa?',
            buttons: [
              { id: 'MENU', title: 'Voltar' },
              { id: 'END', title: 'Encerrar' }
            ]
          };
          break;
        }

        newPayload.name = textRaw;

        if (newPayload.forWhom === 'OTHER') {
          // Para outra pessoa, não pedimos CPF: já seguimos para centro de custo/contrato.
          newStatus = 'ATESTADO_ASK_COST_CENTER';

          const costCenters = await prisma.costCenter.findMany({
            where: { isActive: true },
            orderBy: { code: 'asc' },
            select: { id: true, code: true, name: true }
          });

          const MAX_LIST_ROWS = 10;
          const includeMenuRow = costCenters.length <= MAX_LIST_ROWS - 2;
          const maxCostCentersInList = MAX_LIST_ROWS - 1 - (includeMenuRow ? 1 : 0);
          const sliced = costCenters.slice(0, maxCostCentersInList);

          sendAction = {
            type: 'list',
            body: 'Selecione o centro de custo/contrato no qual o atestado deve ser vinculado:',
            buttonText: 'Escolher',
            sectionTitle: 'Centros de custo',
            rows: [
              ...sliced.map((cc) => ({
                id: cc.code,
                title: `${cc.code} - ${cc.name}`
              })),
              { id: 'END', title: 'Encerrar atendimento' },
              ...(includeMenuRow ? [{ id: 'MENU', title: 'Voltar' }] : [])
            ]
          };
        } else {
          // Para "para mim", pedimos o setor do solicitante (quem está enviando a solicitação no WhatsApp).
          newStatus = 'ATESTADO_ASK_REQUESTER_SECTOR';
          sendAction = {
            type: 'list',
            body: 'Selecione o setor da pessoa que está solicitando o atestado:',
            buttonText: 'Escolher',
            sectionTitle: 'Setores',
            rows: [
              ...Object.entries(REQUESTER_SECTORS).map(([k, v]) => ({
                id: k,
                title: v
              })),
              { id: 'END', title: 'Encerrar atendimento' },
              { id: 'MENU', title: 'Voltar' }
            ]
          };
        }
        break;
      }

      case 'ATESTADO_ASK_REQUESTER_SECTOR': {
        if (isEndRequest()) {
          sendAction = endConversation();
          break;
        }
        if (isMenuRequest()) {
          sendAction = resetToMenu();
          break;
        }

        const sectorKey =
          Object.keys(REQUESTER_SECTORS).find((k) => k.toLowerCase() === content) ??
          Object.entries(REQUESTER_SECTORS).find(([_, v]) => v.toLowerCase() === textRaw.toLowerCase())?.[0];

        if (!sectorKey || !REQUESTER_SECTORS[sectorKey]) {
          sendAction = {
            type: 'list',
            body: 'Não entendi qual setor foi selecionado. Selecione novamente:',
            buttonText: 'Escolher',
            sectionTitle: 'Setores',
            rows: [
              ...Object.entries(REQUESTER_SECTORS).map(([k, v]) => ({
                id: k,
                title: v
              })),
              { id: 'END', title: 'Encerrar atendimento' },
              { id: 'MENU', title: 'Voltar' }
            ]
          };
          break;
        }

        newPayload.requesterSector = REQUESTER_SECTORS[sectorKey];

        newStatus = 'ATESTADO_ASK_COST_CENTER';
        const costCenters = await prisma.costCenter.findMany({
          where: { isActive: true },
          orderBy: { code: 'asc' },
          select: { id: true, code: true, name: true }
        });

        const MAX_LIST_ROWS = 10;
        const includeMenuRow = costCenters.length <= MAX_LIST_ROWS - 2;
        const maxCostCentersInList = MAX_LIST_ROWS - 1 - (includeMenuRow ? 1 : 0);
        const sliced = costCenters.slice(0, maxCostCentersInList);

        sendAction = {
          type: 'list',
          body: 'Selecione o centro de custo/contrato no qual o atestado deve ser vinculado:',
          buttonText: 'Escolher',
          sectionTitle: 'Centros de custo',
          rows: [
            ...sliced.map((cc) => ({
              id: cc.code,
              title: `${cc.code} - ${cc.name}`
            })),
            { id: 'END', title: 'Encerrar atendimento' },
            ...(includeMenuRow ? [{ id: 'MENU', title: 'Voltar' }] : [])
          ]
        };
        break;
      }

      case 'ATESTADO_ASK_COST_CENTER': {
        if (isEndRequest()) {
          sendAction = endConversation();
          break;
        }
        if (isMenuRequest()) {
          sendAction = resetToMenu();
          break;
        }

        const costCenters = await prisma.costCenter.findMany({
          where: { isActive: true },
          orderBy: { code: 'asc' },
          select: { id: true, code: true, name: true }
        });

        const matchByCode =
          costCenters.find((cc) => cc.code.toLowerCase() === content) ||
          // fallback: se a pessoa colar "CC-2026-001 - Nome", pegamos o começo
          (() => {
            const codeMatch = content.match(/[a-z]{2,}-\d{4}-\d+/i)?.[0];
            if (!codeMatch) return undefined;
            return costCenters.find((cc) => cc.code.toLowerCase() === codeMatch.toLowerCase());
          })();

        if (!matchByCode) {
          // Reexibe a lista para facilitar
          const MAX_LIST_ROWS = 10;
          const includeMenuRow = costCenters.length <= MAX_LIST_ROWS - 2;
          const maxCostCentersInList = MAX_LIST_ROWS - 1 - (includeMenuRow ? 1 : 0);
          const sliced = costCenters.slice(0, maxCostCentersInList);

          sendAction = {
            type: 'list',
            body: 'Não encontrei esse centro de custo. Selecione novamente pela lista (ou envie o código):',
            buttonText: 'Escolher',
            sectionTitle: 'Centros de custo',
            rows: [
              ...sliced.map((cc) => ({ id: cc.code, title: `${cc.code} - ${cc.name}` })),
              { id: 'END', title: 'Encerrar atendimento' },
              ...(includeMenuRow ? [{ id: 'MENU', title: 'Voltar' }] : [])
            ]
          };
          break;
        }

        newPayload.costCenterId = matchByCode.id;
        newPayload.costCenterCode = matchByCode.code;
        newPayload.costCenterName = matchByCode.name;

        newStatus = 'ATESTADO_ASK_TYPE';
        sendAction = tipoAtestado();
        break;
      }

      case 'ATESTADO_ASK_TYPE': {
        if (isEndRequest()) {
          sendAction = endConversation();
          break;
        }
        if (isMenuRequest()) {
          sendAction = resetToMenu();
          break;
        }

        const keyFromContent = (() => {
          if (content.startsWith('type_')) return content.replace('type_', '').trim();
          return content.trim();
        })();

        if (!ATESTADO_TYPES[keyFromContent]) {
          sendAction = tipoAtestado();
          break;
        }

        newPayload.atestadoType = ATESTADO_TYPES[keyFromContent];
        newPayload.atestadoTypeLabel = ATESTADO_LABELS[keyFromContent];

        if (newPayload.atestadoType === 'OTHER') {
          newStatus = 'ATESTADO_ASK_OTHER_TYPE';
          sendAction = {
            type: 'buttons',
            body: 'Você escolheu "Outros". Qual é o tipo específico do atestado? (ex.: afastamento, particular etc.)',
            buttons: [
              { id: 'MENU', title: 'Voltar' },
              { id: 'END', title: 'Encerrar' }
            ]
          };
        } else {
          newStatus = 'ATESTADO_ASK_START_DATE';
          sendAction = datePresetList();
        }
        break;
      }

      case 'ATESTADO_ASK_OTHER_TYPE': {
        if (isEndRequest()) {
          sendAction = endConversation();
          break;
        }
        if (isMenuRequest()) {
          sendAction = resetToMenu();
          break;
        }

        if (!textRaw) {
          sendAction = {
            type: 'buttons',
            body: 'Não recebi o tipo específico. Qual é o tipo do atestado?',
            buttons: [
              { id: 'MENU', title: 'Voltar' },
              { id: 'END', title: 'Encerrar' }
            ]
          };
          break;
        }

        newPayload.atestadoOtherType = textRaw;
        newStatus = 'ATESTADO_ASK_START_DATE';
        sendAction = datePresetList();
        break;
      }

      case 'ATESTADO_ASK_START_DATE': {
        if (isEndRequest()) {
          sendAction = endConversation();
          break;
        }
        if (isMenuRequest()) {
          sendAction = resetToMenu();
          break;
        }

        const presetRange = getDatePresetRange(content);
        if (presetRange) {
          newPayload.dataInicio = formatDMY(presetRange.start);
          newPayload.dataFim = formatDMY(presetRange.end);
          newStatus = 'ATESTADO_ASK_FILE';
          sendAction = {
            type: 'buttons',
            body: 'Perfeito. Agora envie a foto ou PDF do atestado. 📎',
            buttons: [
              { id: 'MENU', title: 'Voltar' },
              { id: 'END', title: 'Encerrar' }
            ]
          };
          break;
        }

        // Fallback: ainda aceitamos digitar intervalo no texto (caso a pessoa não use as opções)
        const range = extractDateRange(textRaw);
        if (range) {
          const startParsed = parseDateInput(range.start);
          const endParsed = parseDateInput(range.end);
          if (startParsed && endParsed && startParsed.date <= endParsed.date) {
            newPayload.dataInicio = startParsed.normalized;
            newPayload.dataFim = endParsed.normalized;
            newStatus = 'ATESTADO_ASK_FILE';
            sendAction = {
              type: 'buttons',
              body: 'Perfeito. Agora envie a foto ou PDF do atestado. 📎',
              buttons: [
                { id: 'MENU', title: 'Voltar' },
                { id: 'END', title: 'Encerrar' }
              ]
            };
            break;
          }
        }

        // Se chegou aqui, não reconheceu: reenviar lista (sem precisar digitar)
        sendAction = datePresetList();
        break;
      }

      case 'ATESTADO_ASK_END_DATE': {
        // Para conversas antigas que ficaram neste estado: reenviar a seleção do período completo.
        if (isEndRequest()) {
          sendAction = endConversation();
          break;
        }
        if (isMenuRequest()) {
          sendAction = resetToMenu();
          break;
        }

        newStatus = 'ATESTADO_ASK_START_DATE';
        sendAction = datePresetList();
        break;
      }

      case 'ATESTADO_ASK_FILE': {
        if (isEndRequest()) {
          sendAction = endConversation();
          break;
        }
        if (isMenuRequest()) {
          sendAction = resetToMenu();
          break;
        }

        if (hasMedia) {
          // Recebeu arquivo (imagem/documento) - criamos o submission
          newPayload.fileReceived = true;
          newPayload.fileNote = 'Arquivo enviado pelo usuário (visualizar na conversa)';

          await prisma.whatsAppSubmission.create({
            data: {
              conversationId: conversation.id,
              type: 'MEDICAL_CERTIFICATE',
              payload: newPayload as Prisma.InputJsonValue,
              status: 'PENDING',
              fileName: 'arquivo_enviado_whatsapp'
            }
          });

          newStatus = 'ATESTADO_COMPLETE';
          newConversationStatus = 'COMPLETED';
          sendAction = {
            type: 'buttons',
            body: '✅ Recebido! Seus dados foram registrados e o DP vai analisar.',
            buttons: [
              { id: 'ATESTADO', title: 'Enviar outro' },
              { id: 'END', title: 'Encerrar' }
            ]
          };
          clearPayload();
        } else {
          sendAction = {
            type: 'buttons',
            body: 'Envie a foto ou PDF do atestado.',
            buttons: [
              { id: 'MENU', title: 'Voltar' },
              { id: 'END', title: 'Encerrar' }
            ]
          };
        }
        break;
      }

      case 'ATESTADO_COMPLETE': {
        if (isEndRequest()) {
          sendAction = endConversation();
          break;
        }
        if (isMenuRequest()) {
          sendAction = resetToMenu();
          break;
        }

        if (content.includes('atestado') || content === '1' || content === 'atestados' || content === 'atestato') {
          newStatus = 'ATESTADO_ASK_FOR_WHOM';
          newPayload.flow = 'ATESTADO';
          sendAction = {
            type: 'buttons',
            body: 'Este atestado é para você ou para outra pessoa?',
            buttons: [
              { id: 'SELF', title: 'Para mim' },
              { id: 'OTHER', title: 'Outra pessoa' },
              { id: 'END', title: 'Encerrar' }
            ]
          };
          break;
        }

        sendAction = menu();
        break;
      }

      default:
        sendAction = resetToMenu();
    }

    await prisma.whatsAppConversation.update({
      where: { id: conversation.id },
      data: {
        flowStatus: newStatus,
        currentStep: newStatus,
        payload: newPayload as Prisma.InputJsonValue,
        status: newConversationStatus,
        updatedAt: new Date()
      } as any
    });

    await prisma.whatsAppMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'assistant',
        content: sendAction.type === 'text' ? sendAction.text : sendAction.body
      }
    });

    await delayNatural();
    if (sendAction.type === 'text') {
      await metaWhatsApp.sendText(phone, sendAction.text);
    } else if (sendAction.type === 'buttons') {
      await metaWhatsApp.sendButtons(phone, sendAction.body, sendAction.buttons);
    } else {
      await metaWhatsApp.sendList(
        phone,
        sendAction.body,
        sendAction.buttonText,
        sendAction.sectionTitle,
        sendAction.rows
      );
    }
  }
}

export const whatsAppBot = new WhatsAppBotService();
