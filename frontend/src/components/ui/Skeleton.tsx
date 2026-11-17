/** Bloco cinza que brilha no lugar do conteúdo enquanto ele carrega. */
export const Skeleton = ({ className = '' }: { className?: string }) => (
  <div
    aria-hidden="true"
    className={`animate-brilho rounded-lg bg-[linear-gradient(90deg,#ececea_25%,#f6f7f5_37%,#ececea_63%)] bg-[length:400%_100%] ${className}`}
  />
);

/** Esqueleto de uma tabela (cabeçalho + linhas), com texto para leitores de tela. */
export const SkeletonTabela = ({ linhas = 4 }: { linhas?: number }) => (
  <div role="status" className="space-y-2.5 py-2">
    <span className="sr-only">Carregando…</span>
    <Skeleton className="h-4 w-1/3" />
    {Array.from({ length: linhas }, (_, i) => (
      <Skeleton key={i} className="h-9" />
    ))}
  </div>
);
