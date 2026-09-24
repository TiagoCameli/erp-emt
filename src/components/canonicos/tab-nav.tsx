import Link from "next/link";

import type { RecursoDef } from "@/config/recursos";
import { cn } from "@/lib/utils";

interface TabNavProps {
  /** Recursos do módulo JÁ filtrados pela permissão de ver (quem filtra é o layout). */
  recursos: readonly RecursoDef[];
  /** Pathname atual, vindo do layout (server) ou de TabNavAtivo (client). */
  pathname: string;
}

/**
 * A aba ativa é a de rota mais específica que casa com o pathname. Só com
 * `startsWith`, a aba cuja rota é a raiz do módulo (o Painel do Frete, "/frete")
 * ficaria acesa em todas as outras.
 */
function idAbaAtiva(recursos: readonly RecursoDef[], pathname: string): string | null {
  let escolhida: RecursoDef | null = null;
  for (const recurso of recursos) {
    if (pathname === recurso.rota || pathname.startsWith(`${recurso.rota}/`)) {
      if (!escolhida || recurso.rota.length > escolhida.rota.length) escolhida = recurso;
    }
  }
  return escolhida?.id ?? null;
}

/** Régua de abas do módulo. Aba ativa recebe a Faixa âmbar embaixo. */
export function TabNav({ recursos, pathname }: TabNavProps) {
  const ativaId = idAbaAtiva(recursos, pathname);
  return (
    <nav
      aria-label="Abas do módulo"
      className="barra-scroll-x flex items-center overflow-x-auto border-b border-border"
    >
      {recursos.map((recurso) => {
        const ativa = recurso.id === ativaId;
        return (
          <Link
            key={recurso.id}
            href={recurso.rota}
            aria-current={ativa ? "page" : undefined}
            className={cn(
              "inline-flex h-10 shrink-0 items-center px-3 text-detalhe transition-colors",
              ativa
                ? "faixa-baixo font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {recurso.nome}
          </Link>
        );
      })}
    </nav>
  );
}
