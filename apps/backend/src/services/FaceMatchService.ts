import AWS from 'aws-sdk';
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
  private rekognition: AWS.Rekognition | null = null;

  private client(): AWS.Rekognition | null {
    if (!rekognitionReady()) return null;
    if (!this.rekognition) {
      this.rekognition = new AWS.Rekognition({
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1',
      });
    }
    return this.rekognition;
  }

  async comparePunchToProfile(params: {
    profilePhotoUrl?: string | null;
    profilePhotoKey?: string | null;
    punchPhotoUrl?: string | null;
    punchPhotoKey?: string | null;
    requireMatch: boolean;
  }): Promise<FaceMatchResult> {
    if (!params.profilePhotoUrl && !params.profilePhotoKey) {
      return {
        status: 'no_profile_photo',
        similarity: null,
        reason:
          'Não há foto cadastrada no painel para confrontar a biometria facial. Atualize a foto do colaborador.',
      };
    }
    if (!params.punchPhotoUrl && !params.punchPhotoKey) {
      return {
        status: 'no_punch_photo',
        similarity: null,
        reason: 'É necessário capturar a foto no momento do ponto para o confronto facial.',
      };
    }

    const [source, target] = await Promise.all([
      this.photoService.getImageBytes(params.profilePhotoUrl, params.profilePhotoKey),
      this.photoService.getImageBytes(params.punchPhotoUrl, params.punchPhotoKey),
    ]);

    if (!source || source.length < 100) {
      return {
        status: 'no_profile_photo',
        similarity: null,
        reason: 'Não foi possível ler a foto cadastrada no painel para o confronto facial.',
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
          'Foto do ponto e foto do painel foram registradas. O confronto automático (Rekognition) não está configurado neste ambiente; o registro segue para conferência.',
      };
    }

    try {
      const result = await client
        .compareFaces({
          SourceImage: { Bytes: source },
          TargetImage: { Bytes: target },
          SimilarityThreshold: Math.max(1, Math.min(99, DEFAULT_THRESHOLD)),
        })
        .promise();

      const match = (result.FaceMatches || []).sort(
        (a, b) => Number(b.Similarity || 0) - Number(a.Similarity || 0)
      )[0];
      const similarity = match ? Number(match.Similarity) : 0;

      if (match && similarity >= DEFAULT_THRESHOLD) {
        return {
          status: 'matched',
          similarity,
          reason: `Biometria facial conferida com a foto do painel (${similarity.toFixed(1)}%).`,
        };
      }

      if ((result.UnmatchedFaces || []).length > 0 || !match) {
        return {
          status: 'mismatch',
          similarity: match ? similarity : null,
          reason: match
            ? `A foto do ponto não corresponde à foto cadastrada no painel (${similarity.toFixed(1)}%).`
            : 'Nenhum rosto correspondente foi encontrado entre a foto do ponto e a foto do painel.',
        };
      }

      return {
        status: 'mismatch',
        similarity,
        reason: 'A foto do ponto não corresponde à foto cadastrada no painel.',
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
