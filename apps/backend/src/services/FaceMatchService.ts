import { RekognitionClient, CompareFacesCommand } from '@aws-sdk/client-rekognition';
import { PhotoService } from './PhotoService';

export type FaceMatchStatus =
  | 'matched'
  | 'mismatch'
  | 'no_profile_photo'
  | 'no_punch_photo'
  | 'pending_review'
  | 'unavailable';

export type FaceMatchResult = {
  status: FaceMatchStatus;
  similarity: number | null;
  reason: string;
};

const DEFAULT_THRESHOLD = Number(process.env.FACE_MATCH_THRESHOLD || '80') || 80;

function rekognitionReady(): boolean {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY &&
      (process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION)
  );
}

export class FaceMatchService {
  private photoService = new PhotoService();
  private rekognition: RekognitionClient | null = null;

  private client(): RekognitionClient | null {
    if (!rekognitionReady()) return null;
    if (!this.rekognition) {
      this.rekognition = new RekognitionClient({
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
        region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1',
      });
    }
    return this.rekognition;
  }

  async comparePunchToProfile(params: {
    facePhotoUrl?: string | null;
    facePhotoKey?: string | null;
    punchPhotoUrl?: string | null;
    punchPhotoKey?: string | null;
    /** Bytes da selfie (ex.: preview ao vivo) — evita gravar frame no S3 */
    punchPhotoBytes?: Buffer | null;
    requireMatch: boolean;
  }): Promise<FaceMatchResult> {
    const facePhotoUrl = params.facePhotoUrl;
    const facePhotoKey = params.facePhotoKey;
    if (!facePhotoUrl && !facePhotoKey) {
      return {
        status: 'no_profile_photo',
        similarity: null,
        reason:
          'Não há foto de ponto cadastrada para confrontar o rosto. No painel, abra a ficha do colaborador e use os três pontos → Definir foto do ponto.',
      };
    }
    if (!params.punchPhotoBytes && !params.punchPhotoUrl && !params.punchPhotoKey) {
      return {
        status: 'no_punch_photo',
        similarity: null,
        reason: 'É necessário capturar a foto no momento do ponto para o confronto facial.',
      };
    }

    const [source, targetFromStore] = await Promise.all([
      this.photoService.getImageBytes(facePhotoUrl, facePhotoKey),
      params.punchPhotoBytes
        ? Promise.resolve(null)
        : this.photoService.getImageBytes(params.punchPhotoUrl, params.punchPhotoKey),
    ]);
    const target = params.punchPhotoBytes || targetFromStore;

    if (!source || source.length < 100) {
      return {
        status: 'no_profile_photo',
        similarity: null,
        reason: 'Não foi possível ler a foto de ponto cadastrada para o confronto facial.',
      };
    }
    if (!target || target.length < 100) {
      return {
        status: 'no_punch_photo',
        similarity: null,
        reason: 'Não foi possível ler a foto capturada no ponto.',
      };
    }

    const client = this.client();
    if (!client) {
      return {
        status: params.requireMatch ? 'pending_review' : 'pending_review',
        similarity: null,
        reason:
          'Foto do ponto e foto da batida foram registradas. O confronto automático (Rekognition) não está configurado neste ambiente; o registro segue para conferência.',
      };
    }

    try {
      const result = await client.send(
        new CompareFacesCommand({
          SourceImage: { Bytes: source },
          TargetImage: { Bytes: target },
          SimilarityThreshold: Math.max(1, Math.min(99, DEFAULT_THRESHOLD)),
        })
      );

      const match = (result.FaceMatches || []).sort(
        (a, b) => Number(b.Similarity || 0) - Number(a.Similarity || 0)
      )[0];
      const similarity = match ? Number(match.Similarity) : 0;

      if (match && similarity >= DEFAULT_THRESHOLD) {
        return {
          status: 'matched',
          similarity,
          reason: `Biometria facial conferida com a foto de ponto (${similarity.toFixed(1)}%).`,
        };
      }

      if ((result.UnmatchedFaces || []).length > 0 || !match) {
        return {
          status: 'mismatch',
          similarity: match ? similarity : null,
          reason: match
            ? `A selfie da batida não corresponde à foto de ponto cadastrada (${similarity.toFixed(1)}%).`
            : 'Nenhum rosto correspondente foi encontrado entre a selfie da batida e a foto de ponto.',
        };
      }

      return {
        status: 'mismatch',
        similarity,
        reason: 'A selfie da batida não corresponde à foto de ponto cadastrada.',
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha no confronto facial';
      console.error('[FaceMatch] Rekognition error', message);
      return {
        status: 'unavailable',
        similarity: null,
        reason: `Não foi possível concluir o confronto facial agora (${message}).`,
      };
    }
  }
}

export const faceMatchService = new FaceMatchService();
