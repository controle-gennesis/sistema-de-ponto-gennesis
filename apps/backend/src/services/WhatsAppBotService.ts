import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { metaWhatsApp } from './MetaWhatsAppService';

type FlowStatus =
  | 'MENU'
  | 'FAQ_TOPIC_SELECT'
  | 'FAQ_QUESTION_SELECT'
  | 'ATESTADO_ASK_REQUESTER_NAME'
  | 'ATESTADO_ASK_FOR_WHOM'
  | 'ATESTADO_ASK_REQUESTER_SECTOR'
  | 'ATESTADO_ASK_PERSON_NAME'
  | 'ATESTADO_ASK_COST_CENTER'
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
  '4': 'MEDICAL', // "Acompanhamento" mapeado para MEDICAL (sem enum específico)
  '5': 'ACCIDENT', // "Acidente de trabalho"
  '6': 'ACCIDENT', // "Doença ocupacional" mapeado para ACCIDENT
  '7': 'OTHER', // "Declaração de comparecimento" mapeado para OTHER
  '8': 'OTHER' // "Outros"
};

const ATESTADO_LABELS: Record<string, string> = {
  '1': 'Atestado médico',
  '2': 'Atestado odontológico',
  '3': 'Exame médico / preventivo',
  '4': 'Acompanhamento',
  '5': 'Acidente de trabalho',
  '6': 'Doença ocupacional',
  '7': 'Declaração de comparecimento',
  '8': 'Outros'
};

const REQUESTER_SECTORS: Record<string, string> = {
  ENGENHARIA: 'Engenharia',
  CONTRATOS_LICITACOES: 'Contratos e Licitações',
  JURIDICO: 'Jurídico',
  PROJETOS: 'Projetos',
  TST_ADM: 'TST/ADM',
  SUPRIMENTOS: 'Suprimentos'
};

type FaqItem = { id: string; question: string; answer: string };
type FaqTopic = { id: string; title: string; items: FaqItem[] };

const FAQ_TOPICS: FaqTopic[] = [
  {
    id: 'PONTO_JORNADA',
    title: 'Dúvidas sobre ponto e jornada',
    items: [
      {
        id: 'COMO_REGISTRAR',
        question: 'Como registrar meu ponto?',
        answer:
          'Você deve registrar seu ponto diariamente com as quatro batidas obrigatórias (entrada, saída para almoço, retorno do almoço e saída final) pelo aplicativo Quark.\n\nLogin: CPF (sem pontos e traços) + @eng.com.br\nSenha padrão: Gennesis123*.'
      },
      {
        id: 'ESQUECI_BATER',
        question: 'Esqueci de bater o ponto, o que fazer?',
        answer:
          'Informe imediatamente seu gestor e solicite a regularização junto ao Departamento Pessoal (DP), para que o ajuste seja realizado corretamente no sistema.'
      },
      {
        id: 'FORA_HORARIO',
        question: 'Posso bater ponto fora do horário?',
        answer:
          'O registro fora do horário padrão só deve ser realizado mediante autorização prévia do gestor, alinhado com a jornada e as atividades do dia.'
      },
      {
        id: 'HORA_EXTRA',
        question: 'Posso fazer horas extras?',
        answer: 'A realização de horas extras só é permitida com autorização do Gestor e Diretoria.'
      }
    ]
  },
  {
    id: 'SALARIO_PAGAMENTOS',
    title: 'Dúvidas sobre salário e pagamentos',
    items: [
      {
        id: 'DATA_PAGAMENTO',
        question: 'Qual a data de pagamento?',
        answer: 'Até o 5º dia útil de cada mês.'
      },
      {
        id: 'CONTRACHEQUE',
        question: 'Onde vejo meu contracheque?',
        answer: 'Disponível no sistema/app Quark.'
      },
      {
        id: 'DESCONTO_SALARIO',
        question: 'Tive desconto no salário, por quê?',
        answer: 'Pode ser por faltas, atrasos ou benefícios.'
      },
      {
        id: 'SALARIO_NAO_CAIU',
        question: 'O salário do meu colega já caiu e o meu ainda não, o que aconteceu?',
        answer: 'Aguarde até o fim do dia, pois o financeiro ainda está realizando os pagamentos.'
      }
    ]
  },
  {
    id: 'FERIAS',
    title: 'Dúvidas sobre férias',
    items: [
      {
        id: 'QUANDO_TIRAR',
        question: 'Quando posso tirar férias?',
        answer: 'Após 12 meses de trabalho (período aquisitivo).'
      },
      {
        id: 'QUANTOS_DIAS',
        question: 'Quantos dias posso tirar?',
        answer: 'Até 30 dias corridos (pode variar por faltas injustificadas).'
      },
      {
        id: 'DIVIDIR',
        question: 'Posso dividir minhas férias?',
        answer: 'Sim. Em até 3 períodos: um com no mínimo 14 dias e os demais com pelo menos 5 dias cada.'
      },
      {
        id: 'QUEM_DEFINE',
        question: 'Quem define o período?',
        answer: 'A empresa define, alinhando sempre que possível com o colaborador.'
      },
      {
        id: 'VENDER',
        question: 'Posso vender parte das férias?',
        answer: 'Sim. Até 10 dias podem ser convertidos em abono.'
      },
      {
        id: 'QUANDO_RECEBE',
        question: 'Quando recebo?',
        answer: 'Até 2 dias antes do início das férias.'
      },
      {
        id: 'O_QUE_RECEBE',
        question: 'O que recebo no pagamento?',
        answer: 'Salário + adicional de 1/3.'
      },
      {
        id: 'INICIO_QUALQUER_DIA',
        question: 'Posso começar férias em qualquer dia?',
        answer: 'Não. Não podem iniciar nos dois dias que antecedem feriado ou DSR.'
      }
    ]
  },
  {
    id: 'ATESTADOS',
    title: 'Dúvidas sobre atestados',
    items: [
      {
        id: 'COMO_ENTREGAR',
        question: 'Como entregar atestado?',
        answer:
          'O atestado médico deve ser enviado ao responsável pelas alocações do seu contrato em até 48 horas após a emissão.\n\nAlém disso, o colaborador deve homologar o atestado na clínica Ambrac em até 24 horas após o término do afastamento.'
      },
      {
        id: 'QUANDO_INSS',
        question: 'Quando vai para o INSS?',
        answer:
          'Quando o afastamento por saúde ultrapassa 15 dias consecutivos, o colaborador deve ser encaminhado ao INSS. A partir do 16º dia, acompanhamento e pagamento passam a ser responsabilidade do INSS.'
      },
      {
        id: 'QUEM_PAGA',
        question: 'Quem paga?',
        answer:
          'Nos primeiros 15 dias de afastamento, o pagamento do salário é da empresa. A partir do 16º dia, o pagamento passa a ser realizado pelo INSS, caso o benefício seja aprovado.'
      },
      {
        id: 'JA_DEI_ENTRADA_INSS',
        question: 'Já dei entrada no INSS, o que fazer agora?',
        answer: 'Enviar ao DP o protocolo de agendamento e aguardar o resultado da perícia.'
      },
      {
        id: 'ATESTADO_ACABOU',
        question: 'O atestado acabou, o que devo fazer agora?',
        answer: 'Se permanecer inapto, retorne ao médico e solicite novo atestado médico.'
      }
    ]
  },
  {
    id: 'BENEFICIOS',
    title: 'Dúvidas sobre benefícios',
    items: [
      {
        id: 'VT_PAGAMENTO',
        question: 'Quando é pago o vale-transporte?',
        answer: 'É pago juntamente com a folha de pagamento, até o 5º dia útil do mês.'
      },
      {
        id: 'VA_PAGAMENTO',
        question: 'Quando é pago o vale-alimentação?',
        answer: 'O benefício é pago até o último dia do mês.'
      },
      {
        id: 'DESCONTO_VT',
        question: 'Quanto é o desconto do vale-transporte?',
        answer: 'Não há desconto no DF. No GO, o desconto é de 6% sobre o salário.'
      },
      {
        id: 'DESCONTO_VA',
        question: 'Quanto é o desconto do vale-alimentação?',
        answer: 'No DF, o desconto é de 9% sobre o saldo. No GO, não há desconto.'
      },
      {
        id: 'PERDI_CARTAO',
        question: 'Perdi o meu cartão Beevale, o que fazer?',
        answer: 'No próprio aplicativo existe a opção de emitir a segunda via.'
      },
      {
        id: 'PRAZO_CARTAO',
        question: 'Qual o prazo para entrega do cartão Beevale?',
        answer: 'De 7 a 15 dias.'
      }
    ]
  },
  {
    id: 'RESCISAO',
    title: 'Dúvidas sobre rescisão',
    items: [
      {
        id: 'PRAZO_PAGAMENTO',
        question: 'Qual o prazo de pagamento da rescisão?',
        answer: 'Até 10 dias.'
      }
    ]
  }
];

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
      sections: Array<{ title: string; rows: Array<{ id: string; title: string }> }>;
    };

export type MediaInfo = { mediaId: string; mimeType?: string; filename?: string };

export class WhatsAppBotService {
  async processMessage(
    phone: string,
    text: string,
    hasMedia = false,
    mediaInfo?: MediaInfo
  ): Promise<void> {
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

    const isFaqStart = () =>
      content === '2' ||
      content.includes('duvida') ||
      content.includes('dúvida') ||
      content.includes('duvidas') ||
      content.includes('dúvidas');

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

    // Baixar e salvar mídia (S3 ou local)
    let savedMedia: { fileUrl: string; fileName: string; fileKey?: string } | null = null;
    if (hasMedia && mediaInfo?.mediaId) {
      const result = await metaWhatsApp.downloadAndSaveMedia(
        mediaInfo.mediaId,
        conversation.id,
        mediaInfo.mimeType,
        mediaInfo.filename
      );
      if (result) {
        savedMedia = {
          fileUrl: result.fileUrl || '',
          fileName: result.fileName,
          fileKey: result.fileKey
        };
      }
    }

    // Salvar mensagem do usuário
    await prisma.whatsAppMessage.create({
      data: {
        conversationId: conversation.id,
        role: 'user',
        content: hasMedia ? '[Arquivo enviado]' : (text || '[sem texto]'),
        mediaUrl: savedMedia?.fileUrl || undefined,
        mediaKey: savedMedia?.fileKey,
        fileName: savedMedia?.fileName
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
        'Olá! 😊 Eu sou a Luna, assistente virtual da Gennesis.\nEstou por aqui pra te ajudar — como posso te atender hoje?',
        'Oi! Tudo bem? 😊\nSou a Luna, da Gennesis. Me conta como posso te ajudar!',
        'Olá! Seja bem-vindo(a) à Gennesis.\nEu sou a Luna, assistente virtual, e estou à disposição para ajudar no que precisar.'
      ]),
      buttons: [
        { id: 'ATESTADO', title: 'Enviar atestado' },
        { id: 'DUVIDAS', title: 'Dúvidas' },
        { id: 'END', title: 'Encerrar' }
      ]
    });

    const faqTopicList = (): SendAction => ({
      type: 'list',
      body: 'Selecione o tema da sua dúvida:',
      buttonText: 'Escolher tema',
      sections: [
        {
          title: 'Tópicos',
          rows: FAQ_TOPICS.map((topic) => ({
            id: `FAQ_TOPIC_${topic.id}`,
            title: topic.title.slice(0, 24)
          }))
        }
      ]
    });

    const faqQuestionList = (topicId: string): SendAction => {
      const topic = FAQ_TOPICS.find((t) => t.id === topicId);
      if (!topic) return faqTopicList();

      return {
        type: 'list',
        body: `Tema: ${topic.title}\n\nEscolha uma pergunta:`,
        buttonText: 'Ver perguntas',
        sections: [
          {
            title: 'Perguntas',
            rows: topic.items.map((item) => ({
              id: `FAQ_Q_${topic.id}_${item.id}`,
              title: item.question.slice(0, 24)
            }))
          }
        ]
      };
    };

    const faqTopicNotFound = (): SendAction => ({
      type: 'buttons',
      body: 'Não encontrei esse tópico. Quer tentar novamente?',
      buttons: [
        { id: 'DUVIDAS', title: 'Ver tópicos' },
        { id: 'MENU', title: 'Menu principal' },
        { id: 'END', title: 'Encerrar' }
      ]
    });

    const faqQuestionNotFound = (): SendAction => ({
      type: 'buttons',
      body: 'Não encontrei essa pergunta. Quer ver a lista novamente?',
      buttons: [
        { id: 'FAQ_PERGUNTAS', title: 'Ver perguntas' },
        { id: 'DUVIDAS', title: 'Trocar tópico' },
        { id: 'MENU', title: 'Menu' }
      ]
    });

    const askRequesterName = (): SendAction => ({
      type: 'buttons',
      body: 'Pode me informar seu nome completo?',
      buttons: [
        { id: 'MENU', title: 'Voltar' },
        { id: 'END', title: 'Encerrar' }
      ]
    });

    const askForWhom = (): SendAction => ({
      type: 'buttons',
      body: 'Este atestado é para você ou para outra pessoa?',
      buttons: [
        { id: 'SELF', title: 'Para mim' },
        { id: 'OTHER', title: 'Outra pessoa' },
        { id: 'END', title: 'Encerrar' }
      ]
    });

    const requesterSectorList = (): SendAction => ({
      type: 'list',
      body: 'Você pode me informar o seu setor?',
      buttonText: 'Escolher',
      sections: [
        {
          title: 'Setores',
          rows: [
            ...Object.entries(REQUESTER_SECTORS).map(([k, v]) => ({ id: k, title: v })),
            { id: 'END', title: 'Encerrar atendimento' },
            { id: 'MENU', title: 'Voltar' }
          ]
        }
      ]
    });

    const tipoAtestado = (): SendAction => ({
      type: 'list',
      body: 'Qual o tipo de atestado?',
      buttonText: 'Escolher',
      sections: [
        {
          title: 'Opções',
          rows: [
            ...Object.entries(ATESTADO_LABELS).map(([k, v]) => ({ id: `TYPE_${k}`, title: v })),
            { id: 'MENU', title: 'Voltar' },
            { id: 'END', title: 'Encerrar atendimento' }
          ]
        }
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

    /** Pede para digitar a data do atestado (formato DD/MM/AAAA ou início - fim) */
    const askDateByTyping = (): SendAction => ({
      type: 'buttons',
      body:
        'Digite o período do atestado.\n\n' +
        '• Uma data só: *01/03/2026*\n' +
        '• Intervalo: *01/03/2026 - 05/03/2026*',
      buttons: [
        { id: 'MENU', title: 'Voltar' },
        { id: 'END', title: 'Encerrar' }
      ]
    });

    /** Monta lista de centros de custo. API WhatsApp: máx 10 linhas no total (todas as seções somadas) */
    const costCenterList = async (): Promise<SendAction> => {
      const costCenters = await prisma.costCenter.findMany({
        where: { isActive: true },
        orderBy: { code: 'asc' },
        select: { id: true, code: true, name: true }
      });

      const MAX_TOTAL_ROWS = 10;
      const ACTION_ROWS = 2; // Encerrar + Voltar
      const MAX_CC_ROWS = MAX_TOTAL_ROWS - ACTION_ROWS; // 8 centros de custo na lista

      const ccRows = costCenters
        .slice(0, MAX_CC_ROWS)
        .map((cc) => ({ id: cc.code, title: `${cc.code} - ${cc.name}`.slice(0, 24) }));

      const sections: Array<{ title: string; rows: Array<{ id: string; title: string }> }> = [
        {
          title: ccRows.length === costCenters.length ? 'Centros de custo' : `Centros (1 a ${ccRows.length})`,
          rows: ccRows
        },
        {
          title: 'Ações',
          rows: [
            { id: 'END', title: 'Encerrar atendimento' },
            { id: 'MENU', title: 'Voltar' }
          ]
        }
      ];

      return {
        type: 'list',
        body:
          costCenters.length > MAX_CC_ROWS
            ? `Selecione o centro de custo (mostrando ${MAX_CC_ROWS} de ${costCenters.length}). Ou envie o código por texto:`
            : 'Selecione o centro de custo/contrato no qual o atestado deve ser vinculado:',
        buttonText: 'Escolher',
        sections
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
        text: 'Atendimento encerrado 😊\nSempre que precisar, é só me chamar por aqui!'
      };
    };

    const finalizeConversation = (): SendAction => {
      // Finalizar a solicitação após o envio do arquivo.
      // Importante: não deve cancelar a submissão já concluída.
      clearPayload();
      newStatus = 'MENU';
      newConversationStatus = 'COMPLETED';
      return {
        type: 'text',
        text: 'Solicitação finalizada 😊\nSe precisar de algo mais, é só me chamar por aqui!'
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
          newStatus = 'ATESTADO_ASK_REQUESTER_NAME';
          newPayload.flow = 'ATESTADO';
          sendAction = askRequesterName();
        } else if (isFaqStart() || content === 'duvidas') {
          newStatus = 'FAQ_TOPIC_SELECT';
          newPayload.flow = 'FAQ';
          sendAction = faqTopicList();
        } else {
          sendAction = menu();
        }
        break;
      }

      case 'FAQ_TOPIC_SELECT': {
        if (isEndRequest()) {
          sendAction = endConversation();
          break;
        }
        if (isMenuRequest()) {
          sendAction = resetToMenu();
          break;
        }

        if (content === 'duvidas') {
          sendAction = faqTopicList();
          break;
        }

        const selectedTopicId = content.startsWith('faq_topic_')
          ? content.replace('faq_topic_', '').trim().toUpperCase()
          : undefined;

        const topicExists = selectedTopicId && FAQ_TOPICS.some((topic) => topic.id === selectedTopicId);
        if (!selectedTopicId || !topicExists) {
          sendAction = faqTopicNotFound();
          break;
        }

        newPayload.faqTopicId = selectedTopicId;
        newStatus = 'FAQ_QUESTION_SELECT';
        sendAction = faqQuestionList(selectedTopicId);
        break;
      }

      case 'FAQ_QUESTION_SELECT': {
        if (isEndRequest()) {
          sendAction = endConversation();
          break;
        }
        if (isMenuRequest()) {
          sendAction = resetToMenu();
          break;
        }
        if (content === 'duvidas') {
          newStatus = 'FAQ_TOPIC_SELECT';
          sendAction = faqTopicList();
          break;
        }
        if (content === 'faq_perguntas') {
          const currentTopicId = String(newPayload.faqTopicId || '').toUpperCase();
          if (!currentTopicId) {
            newStatus = 'FAQ_TOPIC_SELECT';
            sendAction = faqTopicList();
          } else {
            sendAction = faqQuestionList(currentTopicId);
          }
          break;
        }

        const currentTopicId = String(newPayload.faqTopicId || '').toUpperCase();
        const topic = FAQ_TOPICS.find((t) => t.id === currentTopicId);
        if (!topic) {
          newStatus = 'FAQ_TOPIC_SELECT';
          sendAction = faqTopicList();
          break;
        }

        const questionIdPrefix = `faq_q_${currentTopicId.toLowerCase()}_`;
        const selectedQuestionId = content.startsWith(questionIdPrefix)
          ? content.replace(questionIdPrefix, '').trim().toUpperCase()
          : undefined;

        const selectedQuestion = topic.items.find((item) => item.id === selectedQuestionId);
        if (!selectedQuestion) {
          sendAction = faqQuestionNotFound();
          break;
        }

        sendAction = {
          type: 'buttons',
          body: `*${selectedQuestion.question}*\n\n${selectedQuestion.answer}`,
          buttons: [
            { id: 'FAQ_PERGUNTAS', title: 'Mais perguntas' },
            { id: 'DUVIDAS', title: 'Trocar tópico' },
            { id: 'END', title: 'Encerrar' },
            { id: 'MENU', title: 'Menu principal' }
          ]
        };
        break;
      }

      case 'ATESTADO_ASK_REQUESTER_NAME': {
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
            body: 'Não recebi o nome. Qual é o nome completo da pessoa que está solicitando?',
            buttons: [
              { id: 'MENU', title: 'Voltar' },
              { id: 'END', title: 'Encerrar' }
            ]
          };
          break;
        }

        newPayload.requesterName = textRaw;
        newStatus = 'ATESTADO_ASK_REQUESTER_SECTOR';
        sendAction = requesterSectorList();
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
          newPayload.name = newPayload.requesterName;
          newStatus = 'ATESTADO_ASK_COST_CENTER';
          sendAction = await costCenterList();
        } else if (content === 'other') {
          newPayload.forWhom = 'OTHER';
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
          sendAction = await costCenterList();
        } else {
          // Caminho SELF (caso chegue aqui): seguimos para centro de custo/contrato.
          newStatus = 'ATESTADO_ASK_COST_CENTER';
          sendAction = await costCenterList();
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
            sections: [
              {
                title: 'Setores',
                rows: [
                  ...Object.entries(REQUESTER_SECTORS).map(([k, v]) => ({ id: k, title: v })),
                  { id: 'END', title: 'Encerrar atendimento' },
                  { id: 'MENU', title: 'Voltar' }
                ]
              }
            ]
          };
          break;
        }

        newPayload.requesterSector = REQUESTER_SECTORS[sectorKey];

        newStatus = 'ATESTADO_ASK_FOR_WHOM';
        sendAction = askForWhom();
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

        // O WhatsApp pode retornar o "id" (que é o code) ou o "title" (que vem truncado).
        // Então fazemos um matching tolerante, ignorando espaços e caracteres não-alfa-numéricos.
        const normalizeText = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
        const contentNormalized = normalizeText(content.trim());

        let matchByCode =
          costCenters.find((cc) => cc.code.toLowerCase() === content) ??
          // se for "CC-2026-001 - Nome", pegamos a parte antes de " - "
          (() => {
            const beforeDash = content.split(' - ')[0]?.trim();
            if (!beforeDash) return undefined;
            return costCenters.find((cc) => cc.code.toLowerCase() === beforeDash.toLowerCase());
          })() ??
          costCenters.find((cc) => normalizeText(cc.code) === contentNormalized) ??
          // por inclusão normalizada (quando vier truncado pelo WhatsApp) escolhe o "melhor" (maior)
          (() => {
            const matches = costCenters
              .map((cc) => ({ cc, codeNorm: normalizeText(cc.code) }))
              .filter((m) => m.codeNorm && contentNormalized.includes(m.codeNorm));

            if (matches.length === 0) return undefined;
            matches.sort((a, b) => b.codeNorm.length - a.codeNorm.length);
            return matches[0]?.cc;
          })();

        // Se a UI mostrou só o "nome" (title), o WhatsApp pode enviar apenas o title truncado.
        // Neste caso, tentamos também casar por "name".
        if (!matchByCode) {
          const matches = costCenters
            .map((cc) => ({ cc, nameNorm: normalizeText(cc.name) }))
            .filter((m) => m.nameNorm && (m.nameNorm === contentNormalized || contentNormalized.includes(m.nameNorm)));

          if (matches.length > 0) {
            matches.sort((a, b) => b.nameNorm.length - a.nameNorm.length);
            matchByCode = matches[0]?.cc;
          }
        }

        if (!matchByCode) {
          const listAction = await costCenterList();
          if (listAction.type === 'list') {
            sendAction = {
              ...listAction,
              body: 'Não encontrei esse centro de custo. Selecione novamente pela lista (ou envie o código):'
            };
          } else {
            sendAction = listAction;
          }
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

        // Apenas quando o usuário escolhe "Outros" (id=8) pedimos o tipo específico.
        if (keyFromContent === '8') {
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
          sendAction = askDateByTyping();
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
        sendAction = askDateByTyping();
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

        // Intervalo: "01/03/2026 - 05/03/2026"
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

        // Data única: "01/03/2026" (início e fim iguais)
        const singleParsed = parseDateInput(textRaw);
        if (singleParsed) {
          newPayload.dataInicio = singleParsed.normalized;
          newPayload.dataFim = singleParsed.normalized;
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

        sendAction = {
          type: 'buttons',
          body:
            'Formato inválido. Digite a data no formato DD/MM/AAAA.\n' +
            'Ex.: *01/03/2026* ou *01/03/2026 - 05/03/2026* para intervalo.',
          buttons: [
            { id: 'MENU', title: 'Voltar' },
            { id: 'END', title: 'Encerrar' }
          ]
        };
        break;
      }

      case 'ATESTADO_ASK_END_DATE': {
        if (isEndRequest()) {
          sendAction = endConversation();
          break;
        }
        if (isMenuRequest()) {
          sendAction = resetToMenu();
          break;
        }

        newStatus = 'ATESTADO_ASK_START_DATE';
        sendAction = askDateByTyping();
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
          // Recebeu arquivo (imagem/documento) - criamos o submission com link para o arquivo
          newPayload.fileReceived = true;
          newPayload.fileNote = 'Arquivo enviado pelo usuário';

          await prisma.whatsAppSubmission.create({
            data: {
              conversationId: conversation.id,
              type: 'MEDICAL_CERTIFICATE',
              payload: newPayload as Prisma.InputJsonValue,
              status: 'PENDING',
              fileUrl: savedMedia?.fileUrl || undefined,
              fileKey: savedMedia?.fileKey,
              fileName: savedMedia?.fileName ?? 'atestado_enviado'
            }
          });

          newStatus = 'ATESTADO_COMPLETE';
          newConversationStatus = 'COMPLETED';
          sendAction = {
            type: 'buttons',
            body: '✅ Atestado recebido! Já registramos suas informações. O DP vai analisar e te dar retorno.',
            buttons: [
              { id: 'ATESTADO', title: 'Enviar outro' },
              { id: 'FINALIZE', title: 'Finalizar' }
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
        if (content === 'finalize' || content === 'finalizar') {
          sendAction = finalizeConversation();
          break;
        }
        if (isEndRequest()) {
          sendAction = endConversation();
          break;
        }
        if (isMenuRequest()) {
          sendAction = resetToMenu();
          break;
        }

        if (content.includes('atestado') || content === '1' || content === 'atestados' || content === 'atestato') {
          newStatus = 'ATESTADO_ASK_REQUESTER_NAME';
          newPayload.flow = 'ATESTADO';
          sendAction = askRequesterName();
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
        sendAction.sections
      );
    }
  }
}

export const whatsAppBot = new WhatsAppBotService();
