/**
 * Serviço para enviar mensagens via WhatsApp Cloud API (Meta)
 * Documentação: https://developers.facebook.com/docs/whatsapp/cloud-api
 */
import axios from 'axios';

const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

export class MetaWhatsAppService {
  private phoneNumberId: string;
  private accessToken: string;

  constructor() {
    this.phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
    this.accessToken = process.env.WHATSAPP_ACCESS_TOKEN || '';
  }

  isConfigured(): boolean {
    return !!this.phoneNumberId && !!this.accessToken;
  }

  /**
   * Normaliza o número para o formato esperado pela API (apenas dígitos, com DDI).
   */
  private normalizePhone(phone: string): string {
    let number = String(phone)
      .replace(/@s\.whatsapp\.net$/i, '')
      .replace(/@c\.us$/i, '')
      .replace(/\D/g, '');
    if (!number.startsWith('55') && number.length <= 11) {
      number = '55' + number;
    }
    return number;
  }

  /**
   * Envia mensagem de texto via WhatsApp Cloud API.
   */
  async sendText(phone: string, text: string): Promise<boolean> {
    if (!this.isConfigured()) {
      console.warn(
        '[MetaWhatsApp] Não configurado. Configure WHATSAPP_PHONE_NUMBER_ID e WHATSAPP_ACCESS_TOKEN.'
      );
      return false;
    }

    const to = this.normalizePhone(phone);
    const url = `${GRAPH_API_BASE}/${this.phoneNumberId}/messages`;

    try {
      const response = await axios.post(
        url,
        {
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: text }
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.accessToken}`
          },
          timeout: 15000
        }
      );

      return response.status >= 200 && response.status < 300;
    } catch (err: unknown) {
      const ax = err as {
        response?: { status?: number; data?: unknown };
        message?: string;
      };
      const msg = ax?.message || String(err);
      const status = ax?.response?.status;
      const data = ax?.response?.data;
      console.error(
        '[MetaWhatsApp] Erro ao enviar:',
        msg,
        status ? `status=${status}` : '',
        data ? JSON.stringify(data).slice(0, 300) : ''
      );
      return false;
    }
  }
}

export const metaWhatsApp = new MetaWhatsAppService();
