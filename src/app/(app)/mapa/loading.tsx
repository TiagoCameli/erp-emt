import { Skeleton } from "@/components/ui/skeleton";

/** Mesma silhueta da tela pronta: cabeçalho baixo, mapa à esquerda, painel à direita. */
export default function Loading() {
  return (
    <div className="flex h-full min-h-[480px] flex-col">
      <div className="mb-2 flex items-center gap-3">
        <Skeleton className="h-4 w-12" />
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-72 max-sm:hidden" />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row">
        <Skeleton className="h-[48dvh] shrink-0 rounded-lg md:h-auto md:flex-1" />
        <div className="flex min-h-[16rem] flex-1 flex-col gap-3 md:w-80 md:flex-none">
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="min-h-0 flex-1" />
        </div>
      </div>
    </div>
  );
}
