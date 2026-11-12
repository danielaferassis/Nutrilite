import { vi } from 'vitest';

/** Captura os arquivos que a tela manda baixar (nome e conteúdo), sem navegar. */
export function capturarDownloads() {
  const arquivos: { nome: string; blob: Blob }[] = [];
  let ultimo: Blob | null = null;
  // Subclasse: o resto do código (e a API falsa) continua usando `new URL(...)`
  class URLFalsa extends URL {
    static createObjectURL = (b: Blob) => ((ultimo = b), 'blob:teste');
    static revokeObjectURL = () => {};
  }
  vi.stubGlobal('URL', URLFalsa);
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    arquivos.push({ nome: this.download, blob: ultimo! });
  });
  return arquivos;
}

/** Linhas do CSV baixado (o blob.text() já descarta o BOM). */
export const linhasCsv = async (blob: Blob) => (await blob.text()).split('\r\n');
