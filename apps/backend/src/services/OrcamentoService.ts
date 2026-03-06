import AWS from 'aws-sdk';
import fs from 'fs';
import path from 'path';

export interface OrcamentoData {
  servicos: unknown[];
  composicoes: unknown[];
  imports: unknown[];
}

export class OrcamentoService {
  private s3: AWS.S3 | null;
  private bucketName: string;
  private useLocal: boolean;
  private localBasePath: string;

  constructor() {
    this.useLocal =
      (process.env.STORAGE_PROVIDER || '').toLowerCase() === 'local' ||
      !process.env.AWS_ACCESS_KEY_ID ||
      !process.env.AWS_SECRET_ACCESS_KEY;

    this.s3 = this.useLocal
      ? null
      : new AWS.S3({
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
          region: process.env.AWS_REGION || 'us-east-1'
        });

    this.bucketName = process.env.AWS_S3_BUCKET || 'sistema-ponto-fotos';
    this.localBasePath = path.join(process.cwd(), 'uploads', 'orcamentos');
  }

  private getKey(centroCustoId: string): string {
    return 'orcamentos/' + centroCustoId + '/data.json';
  }

  private getComposicoesGeralKey(): string {
    return 'orcamentos/composicoes-geral/data.json';
  }

  async getComposicoesGeral(): Promise<unknown[] | null> {
    try {
      if (this.useLocal || !this.s3) {
        const filePath = path.join(this.localBasePath, 'composicoes-geral', 'data.json');
        if (!fs.existsSync(filePath)) return null;
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw) as unknown[];
      }
      const result = await this.s3.getObject({
        Bucket: this.bucketName,
        Key: this.getComposicoesGeralKey()
      }).promise();
      if (!result.Body) return null;
      const body = typeof result.Body === 'string' ? result.Body : result.Body.toString('utf-8');
      return JSON.parse(body) as unknown[];
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e?.code === 'NoSuchKey') return null;
      if (this.useLocal) return null;
      throw err;
    }
  }

  async saveComposicoesGeral(items: unknown[]): Promise<void> {
    const body = JSON.stringify(items);
    if (this.useLocal || !this.s3) {
      const dir = path.join(this.localBasePath, 'composicoes-geral');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'data.json'), body, 'utf-8');
      return;
    }
    await this.s3.putObject({
      Bucket: this.bucketName,
      Key: this.getComposicoesGeralKey(),
      Body: body,
      ContentType: 'application/json'
    }).promise();
  }

  async save(centroCustoId: string, data: OrcamentoData): Promise<void> {
    const body = JSON.stringify(data);

    if (this.useLocal || !this.s3) {
      const dir = path.join(this.localBasePath, centroCustoId);
      if (!fs.existsSync(path.dirname(dir))) {
        fs.mkdirSync(path.dirname(dir), { recursive: true });
      }
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(path.join(dir, 'data.json'), body, 'utf-8');
      return;
    }

    await this.s3.putObject({
      Bucket: this.bucketName,
      Key: this.getKey(centroCustoId),
      Body: body,
      ContentType: 'application/json'
    }).promise();
  }

  async get(centroCustoId: string): Promise<OrcamentoData | null> {
    try {
      if (this.useLocal || !this.s3) {
        const filePath = path.join(this.localBasePath, centroCustoId, 'data.json');
        if (!fs.existsSync(filePath)) return null;
        const raw = fs.readFileSync(filePath, 'utf-8');
        return JSON.parse(raw) as OrcamentoData;
      }

      const result = await this.s3.getObject({
        Bucket: this.bucketName,
        Key: this.getKey(centroCustoId)
      }).promise();

      if (!result.Body) return null;
      const body = typeof result.Body === 'string' ? result.Body : result.Body.toString('utf-8');
      return JSON.parse(body) as OrcamentoData;
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e?.code === 'NoSuchKey') return null;
      if (this.useLocal) return null;
      throw err;
    }
  }
}
