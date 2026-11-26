/** Capa colorida do cartão (como no Trello): cores da paleta e tamanhos. */

export type KanbanCoverSize = 'NORMAL' | 'FULL';

export const KANBAN_COVER_COLORS = [
  { key: 'green', label: 'Verde', hex: '#22a06b' },
  { key: 'yellow', label: 'Amarelo', hex: '#cf9f02' },
  { key: 'orange', label: 'Laranja', hex: '#e2740f' },
  { key: 'red', label: 'Vermelho', hex: '#d84a3d' },
  { key: 'purple', label: 'Roxo', hex: '#8a56c4' },
  { key: 'blue', label: 'Azul', hex: '#2f6fd0' },
  { key: 'sky', label: 'Azul-petróleo', hex: '#2a8fa6' },
  { key: 'lime', label: 'Verde-limão', hex: '#6c9b1d' },
  { key: 'pink', label: 'Rosa', hex: '#c8508f' },
  { key: 'black', label: 'Cinza', hex: '#5a6472' },
] as const;

/** Cor em CSS (#rrggbb) da capa, ou null quando o cartão não tem capa. */
export function coverHex(key?: string | null): string | null {
  if (!key) return null;
  return KANBAN_COVER_COLORS.find((c) => c.key === key)?.hex ?? null;
}

export function normalizeCoverSize(size?: string | null): KanbanCoverSize {
  return size === 'FULL' ? 'FULL' : 'NORMAL';
}

/** Reduz a imagem no navegador (JPEG): a grande abre no cartão e a miniatura vai para o quadro. */
export async function prepareCoverImages(source: Blob): Promise<{ image: Blob; thumb: Blob }> {
  const bitmap = await createImageBitmap(source);
  const resize = (maxSide: number, quality: number) =>
    new Promise<Blob>((resolve, reject) => {
      const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('canvas indisponível'));
      // JPEG não tem transparência: sem o fundo, PNG transparente viraria preto.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('falha ao gerar a imagem'))),
        'image/jpeg',
        quality,
      );
    });
  try {
    const [image, thumb] = await Promise.all([resize(1600, 0.85), resize(600, 0.78)]);
    return { image, thumb };
  } finally {
    bitmap.close();
  }
}
