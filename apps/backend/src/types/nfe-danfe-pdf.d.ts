declare module 'nfe-danfe-pdf' {
  import type { Readable } from 'node:stream';

  export function gerarPDF(xml: string): Promise<Readable>;
}
