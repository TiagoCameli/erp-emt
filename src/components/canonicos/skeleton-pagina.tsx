import { Skeleton } from "@/components/ui/skeleton";

/** Linhas fantasma da tabela. */
const LINHAS = 8;

/**
 * Skeleton padrão de carregamento de página: cabeçalho, barra de filtros e
 * tabela, na mesma silhueta da tela pronta (sem layout pulando). Usado nos
 * `loading.tsx` das rotas para a troca de módulo/aba mostrar feedback na hora
 * (Suspense boundary), em vez de segurar a tela congelada até o servidor
 * terminar de buscar os dados.
 */
export function SkeletonPagina() {
  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-40" />
        <Skeleton className="ml-auto h-8 w-24" />
      </div>

      <div className="overflow-hidden rounded-md border border-border">
        <div className="flex h-9 items-center gap-4 border-b border-border bg-surface px-3">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3.5 w-40" />
          <Skeleton className="ml-auto h-3.5 w-20" />
        </div>
        {Array.from({ length: LINHAS }).map((_, indice) => (
          <div
            key={indice}
            className="flex h-9 items-center gap-4 border-b border-border px-3 last:border-b-0"
          >
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-56" />
            <Skeleton className="ml-auto h-4 w-20" />
          </div>
        ))}
      </div>
    </div>
  );
}
