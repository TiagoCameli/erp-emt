import Link from "next/link";

import type { RecursoDef } from "@/config/recursos";
import { cn } from "@/lib/utils";

interface TabNavProps {
  /** Recursos do módulo JÁ filtrados pela permissão de ver (quem filtra é o layout). */
  recursos: readonly RecursoDef[];
  /** Pathname atual, vindo do layout (server) ou de TabNavAtivo (client). */
  pathname: string;
}

/** Régua de abas do módulo. Aba ativa recebe a Faixa âmbar embaixo. */
export function TabNav({ recursos, pathname }: TabNavProps) {
  return (
    <nav
      aria-label="Abas do módulo"
      className="flex items-center overflow-x-auto border-b border-border"
    >
      {recursos.map((recurso) => {
        const ativa = pathname.startsWith(recurso.rota);
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
