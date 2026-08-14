import { ExternalLink } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * O link que abre os lançamentos de uma célula do relatório, em aba nova.
 *
 * Existe como componente porque são seis relatórios usando o mesmo gesto, e o
 * `rel="noopener"` é o tipo de detalhe que falta em um dos seis se cada um
 * escrever a própria âncora (`target="_blank"` sem ele dá à aba nova acesso ao
 * `window.opener`).
 *
 * É âncora de VERDADE, e não um `onClick` com `router.push`, e isso é escolha: o
 * meio-clique, o "abrir em nova aba" do sistema operacional e o copiar-link
 * passam a funcionar de graça, e a URL fica compartilhável com o financeiro —
 * que é metade do valor de um drill-down.
 *
 * O ícone aparece só no hover: seis relatórios com um ícone fixo em cada linha
 * viram uma parede de ícones, e a tabela é densa de propósito.
 */
export function LinkDrill({
  href,
  titulo,
  className,
  children,
}: {
  href: string;
  /** O que a pessoa vai ver do outro lado, para o title do link. */
  titulo: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      title={titulo}
      className={cn(
        "group inline-flex items-center gap-1 text-foreground underline-offset-2",
        "hover:text-primario hover:underline focus-visible:text-primario",
        "focus-visible:underline focus-visible:outline-none",
        className,
      )}
    >
      {children}
      <ExternalLink
        aria-hidden
        className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60 group-focus-visible:opacity-60"
      />
    </a>
  );
}
