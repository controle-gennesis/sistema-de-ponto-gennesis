/**
 * Serviço para enviar mensagens via Evolution API
 */
import axios from 'axios';

export class EvolutionApiService {
  private baseUrl: string;
  private instanceName: string;
  private apiKey: string;

  constructor() {
    this.baseUrl = (process.env.EVOLUTION_API_URL || '').replace(/\/$/, '');
    this.instanceName = process.env.EVOLUTION_INSTANCE || 'gennesisattendance';
    this.apiKey = process.env.EVOLUTION_API_KEY || '';
  }

  isConfigured(): boolean {
    return !!this.baseUrl && !!this.apiKey;
  }

  /**
   * Envia mensagem de texto para um número
   * Evolution API v2: POST /message/sendText/{instance}
   */
  async sendText(phone: string, text: string): Promise<boolean> {
    if (!this.isConfigured()) {
      console.warn('[EvolutionApi] Não configurado. Configure EVOLUTION_API_URL e EVOLUTION_API_KEY.');
      return false;
    }

    // Normaliza o número
    let number = String(phone).replace(/@s\.whatsapp\.net$/, '').replace(/\D/g, '');
    if (!number.startsWith('55') && number.length <= 11) {
      number = '55' + number;
    }

    const url = `${this.baseUrl}/message/sendText/${this.instanceName}`;

    try {
      const response = await axios.post(
        url,
        { number, text },
        {
          headers: {
            'Content-Type': 'application/json',
            apikey: this.apiKey
          },
          timeout: 15000
        }
      );

      return response.status >= 200 && response.status < 300;
    } catch (err: unknown) {
      const ax = err as { response?: { status?: number; data?: unknown }; message?: string };
      const msg = ax?.message || String(err);
      const status = ax?.response?.status;
      const data = ax?.response?.data;
      console.error('[EvolutionApi] Erro ao enviar:', msg, status ? `status=${status}` : '', data ? JSON.stringify(data).slice(0, 200) : '');
      return false;
    }
  }
}

export const evolutionApi = new EvolutionApiService();
