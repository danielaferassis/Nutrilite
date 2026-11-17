import { FileSpreadsheet, UploadCloud, X } from 'lucide-react';
import { DragEvent, useId, useState } from 'react';

interface AreaArquivoProps {
  /** Nome do campo (também o rótulo para leitores de tela). */
  rotulo: string;
  /** Extensões aceitas, ex.: ".csv,.xlsx". */
  aceita: string;
  arquivo: File | null;
  aoEscolher: (arquivo: File | null) => void;
  desabilitado?: boolean;
}

const tamanho = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

/** Caixa para arrastar o arquivo ou clicar e escolher. */
export const AreaArquivo = ({ rotulo, aceita, arquivo, aoEscolher, desabilitado = false }: AreaArquivoProps) => {
  const id = useId();
  const [arrastando, setArrastando] = useState(false);
  const extensoes = aceita.split(',').map((e) => e.trim().toLowerCase());

  const soltar = (e: DragEvent) => {
    e.preventDefault();
    setArrastando(false);
    if (desabilitado) return;
    const solto = e.dataTransfer.files?.[0];
    // Só aceita as extensões pedidas; o backend confere de novo
    if (solto && extensoes.some((ext) => solto.name.toLowerCase().endsWith(ext))) aoEscolher(solto);
  };

  if (arquivo) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-verde-100 bg-verde-50 p-3 animate-entra">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white text-verde-700 shadow-suave">
          <FileSpreadsheet aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-tinta">{arquivo.name}</p>
          <p className="text-xs text-suave">{tamanho(arquivo.size)} · pronto para enviar</p>
        </div>
        <button
          type="button"
          aria-label="Remover arquivo"
          title="Remover arquivo"
          disabled={desabilitado}
          onClick={() => aoEscolher(null)}
          className="rounded-md p-1.5 text-suave transition-colors hover:bg-white hover:text-red-600 disabled:opacity-50"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>
    );
  }

  return (
    <label
      htmlFor={id}
      onDragOver={(e) => {
        e.preventDefault();
        if (!desabilitado) setArrastando(true);
      }}
      onDragLeave={() => setArrastando(false)}
      onDrop={soltar}
      className={`group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-7 text-center transition-all duration-200 ease-suave ${
        arrastando
          ? 'scale-[1.01] border-verde-700 bg-verde-50'
          : 'border-borda bg-fundo hover:border-verde-600 hover:bg-verde-50'
      } ${desabilitado ? 'pointer-events-none opacity-60' : ''}`}
    >
      <span
        className={`flex size-11 items-center justify-center rounded-full bg-white text-verde-700 shadow-suave transition-transform duration-200 ease-suave ${
          arrastando ? '-translate-y-1' : 'group-hover:-translate-y-0.5'
        }`}
      >
        <UploadCloud aria-hidden="true" className="size-5" />
      </span>
      <span className="text-sm font-semibold text-tinta">
        {arrastando ? 'Solte o arquivo aqui' : 'Arraste o arquivo aqui'}
      </span>
      <span className="text-xs text-suave">
        ou <span className="font-semibold text-verde-700 underline-offset-2 group-hover:underline">clique para escolher</span>
        {' · '}
        {extensoes.join(', ')}
      </span>
      <input
        id={id}
        type="file"
        accept={aceita}
        aria-label={rotulo}
        disabled={desabilitado}
        className="sr-only"
        onChange={(e) => {
          aoEscolher(e.target.files?.[0] ?? null);
          // Permite escolher o mesmo arquivo de novo depois de remover
          e.target.value = '';
        }}
      />
    </label>
  );
};
