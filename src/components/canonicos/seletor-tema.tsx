"use client";

import * as React from "react";
import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useTheme } from "next-themes";
import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/** Os valores são os do next-themes; o rótulo é o que a pessoa lê. */
export type ValorTema = "system" | "light" | "dark";

export const OPCOES_TEMA: ReadonlyArray<{
  valor: ValorTema;
  rotulo: string;
  /** Nome acessível do botão no seletor compacto, que só mostra o ícone. */
  rotuloAcessivel: string;
  Icone: LucideIcon;
}> = [
  { valor: "system", rotulo: "Sistema", rotuloAcessivel: "Tema do sistema", Icone: Monitor },
  { valor: "light", rotulo: "Claro", rotuloAcessivel: "Tema claro", Icone: Sun },
  { valor: "dark", rotulo: "Escuro", rotuloAcessivel: "Tema escuro", Icone: Moon },
];

const nadaParaAssinar = () => () => {};

/**
 * `true` só depois da hidratação. O servidor não sabe o tema (ele mora no
 * localStorage e no `prefers-color-scheme`), então até montar nenhuma opção
 * aparece marcada: marcar "Sistema" no HTML do servidor e trocar para "Escuro"
 * um quadro depois é exatamente o pisca de ícone errado que isto evita.
 *
 * `useSyncExternalStore` em vez de `useEffect` + `useState`: o snapshot do
 * servidor é `false` e o do cliente é `true`, sem render extra e sem setState
 * dentro de effect.
 */
function useMontado(): boolean {
  return React.useSyncExternalStore(
    nadaParaAssinar,
    () => true,
    () => false,
  );
}

/**
 * Tema dentro do menu do usuário (AppShell), como grupo de rádio do próprio
 * DropdownMenu: seta para navegar, Enter para escolher, igual aos outros itens.
 */
export function ItensMenuTema() {
  const { theme, setTheme } = useTheme();
  const montado = useMontado();
  return (
    <>
      <DropdownMenuLabel className="text-legenda font-normal text-muted-foreground">
        Tema
      </DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={montado ? (theme ?? "system") : ""}
        onValueChange={setTheme}
      >
        {OPCOES_TEMA.map(({ valor, rotulo, Icone }) => (
          <DropdownMenuRadioItem key={valor} value={valor}>
            <Icone className="size-4" aria-hidden="true" />
            {rotulo}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  );
}

/**
 * Tema em três botões de ícone, para onde não há menu (o rodapé das telas de
 * campo `/m/`). É um grupo de rádio de verdade para o leitor de tela: anuncia
 * "Tema escuro, marcado", e não três botões soltos.
 */
export function SeletorTema({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const montado = useMontado();
  const atual = montado ? (theme ?? "system") : null;
  return (
    <div
      role="radiogroup"
      aria-label="Tema"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md border border-border bg-surface p-0.5",
        className,
      )}
    >
      {OPCOES_TEMA.map(({ valor, rotuloAcessivel, Icone }) => {
        const marcado = atual === valor;
        return (
          <button
            key={valor}
            type="button"
            role="radio"
            aria-checked={marcado}
            aria-label={rotuloAcessivel}
            title={rotuloAcessivel}
            onClick={() => setTheme(valor)}
            className={cn(
              "inline-flex size-10 items-center justify-center rounded-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
              marcado
                ? "bg-background text-foreground shadow-xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icone className="size-4" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

/**
 * Botão de um toque: claro vira escuro, escuro vira claro. Fica à vista no
 * AppShell (rodapé da sidebar e topo do mobile), porque trocar o tema pelo
 * menu do usuário pedia três cliques. Quem quer "Sistema" de volta escolhe no
 * menu do usuário.
 *
 * Lê o tema EFETIVO (`resolvedTheme`): com "Sistema" num computador escuro, o
 * botão mostra o sol e leva para o claro, que é o que a pessoa está vendo.
 * O ícone é o do destino (lua = ir para o escuro), com o nome acessível
 * dizendo a ação. Antes de montar, nenhum ícone: o servidor não sabe o tema.
 */
export function BotaoTema({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const montado = useMontado();
  const escuro = montado && resolvedTheme === "dark";
  const rotulo = !montado
    ? "Alternar tema"
    : escuro
      ? "Ativar tema claro"
      : "Ativar tema escuro";
  const Icone = escuro ? Sun : Moon;
  return (
    <button
      type="button"
      aria-label={rotulo}
      title={rotulo}
      onClick={() => setTheme(escuro ? "light" : "dark")}
      className={cn(
        "inline-flex items-center justify-center text-muted-foreground transition-colors hover:text-foreground",
        className,
      )}
    >
      {montado ? <Icone className="size-5" aria-hidden="true" /> : <span className="size-5" />}
    </button>
  );
}
