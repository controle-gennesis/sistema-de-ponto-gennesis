import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File as FsFile, Paths } from 'expo-file-system';

/** Gera a imagem grande e a miniatura (JPEG) a partir de um arquivo do aparelho. */
export async function prepareCoverImages(localUri: string): Promise<{ imageUri: string; thumbUri: string }> {
  const original = await ImageManipulator.manipulate(localUri).renderAsync();
  const resize = async (maxSide: number, compress: number) => {
    const context = ImageManipulator.manipulate(localUri);
    if (Math.max(original.width, original.height) > maxSide) {
      context.resize(original.width >= original.height ? { width: maxSide } : { height: maxSide });
    }
    const rendered = await context.renderAsync();
    const saved = await rendered.saveAsync({ compress, format: SaveFormat.JPEG });
    return saved.uri;
  };
  const imageUri = await resize(1600, 0.85);
  const thumbUri = await resize(600, 0.78);
  return { imageUri, thumbUri };
}

/** Baixa um anexo para o aparelho, para poder ser reduzido. */
export async function downloadCoverSource(url: string): Promise<string> {
  const destination = new FsFile(Paths.cache, `capa-origem-${Date.now()}.img`);
  const file = await FsFile.downloadFileAsync(url, destination);
  return file.uri;
}
