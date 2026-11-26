import { File } from 'expo-file-system';

/**
 * Arquivo do aparelho para pôr num FormData. O fetch do Expo não aceita o formato antigo do React Native
 * (`{ uri, name, type }`) e falha com "Unsupported FormDataPart implementation": ele precisa dos bytes.
 */
export function formDataFile({ uri, name, type }: { uri: string; name: string; type: string }): Blob {
  return { name, type, bytes: () => new File(uri).bytes() } as unknown as Blob;
}
