import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton padrão de carregamento de página: cabeçalho + tabela, sem layout
 * pulando. Usado nos `loading.tsx` das rotas para a troca de módulo/aba mostrar
 * feedback na hora (Suspense boundary), em vez de segurar a tela congelada até
 * o servidor terminar de buscar os dados.
 */
export function SkeletonPagina() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-8 w-full" />
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}
