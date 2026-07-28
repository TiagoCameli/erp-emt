"use client";

import * as React from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronsUpDown,
  Circle,
  FolderOpen,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Settings,
  ShoppingCart,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const MAPA_ICONES: Record<string, LucideIcon> = {
  gestao: LayoutDashboard,
  administracao: Settings,
  cadastros: FolderOpen,
  compras: ShoppingCart,
  financeiro: Wallet,
  rh: Users,
};

const COLUNAS_MOBILE: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
};

/**
 * Largura da sidebar recolhida. É a mesma medida da caixa do ícone dentro de
 * cada item, então o ícone não anda um pixel quando a sidebar expande.
 */
const LARGURA_RECOLHIDA = "w-14";
const LARGURA_EXPANDIDA = "w-56";
/** Caixa do ícone: casa com LARGURA_RECOLHIDA. */
const CAIXA_ICONE = "w-14";

/** Atraso antes de expandir: o mouse só de passagem não abre a sidebar. */
const ATRASO_ABRIR_MS = 180;
/** Atraso antes de recolher: sair de raspão não fecha na cara do usuário. */
const ATRASO_FECHAR_MS = 260;

export interface ModuloNavegacao {
  id: string;
  nome: string;
  rota: string;
  icone?: string;
}

export interface AppShellProps {
  usuario: {
    nome: string;
    email: string;
  };
  modulos: ModuloNavegacao[];
  children: ReactNode;
  onSair: () => void;
}

function iconeDoModulo(modulo: ModuloNavegacao): LucideIcon {
  return MAPA_ICONES[modulo.icone ?? modulo.id] ?? Circle;
}

function iniciaisDoNome(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0].charAt(0);
  const ultima = partes.length > 1 ? partes[partes.length - 1].charAt(0) : "";
  return (primeira + ultima).toUpperCase();
}

/**
 * Itens do menu do usuário (Minha conta / Sair). Mesmo conteúdo no rodapé da
 * sidebar (desktop) e no topo (mobile).
 */
function ItensMenuUsuario({
  usuario,
  onSair,
}: {
  usuario: AppShellProps["usuario"];
  onSair: () => void;
}) {
  return (
    <>
      <DropdownMenuLabel>
        <div className="text-detalhe font-medium">{usuario.nome}</div>
        <div className="text-legenda font-normal text-muted-foreground">
          {usuario.email}
        </div>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild>
        <Link href="/conta">
          <KeyRound className="size-4" aria-hidden="true" />
          Minha conta
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={onSair}>
        <LogOut className="size-4" aria-hidden="true" />
        Sair
      </DropdownMenuItem>
    </>
  );
}

/**
 * Controla a expansão da sidebar por hover, com atraso nas duas pontas, e por
 * foco de teclado (Tab expande na hora, sem atraso). O menu do usuário aberto
 * segura a sidebar expandida: o mouse precisa sair dela para alcançar o menu.
 */
function useSidebarExpansivel(menuAberto: boolean) {
  const [hover, setHover] = React.useState(false);
  const [temFoco, setTemFoco] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const limparTimer = React.useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  React.useEffect(() => limparTimer, [limparTimer]);

  const aoEntrarMouse = React.useCallback(() => {
    limparTimer();
    timer.current = setTimeout(() => setHover(true), ATRASO_ABRIR_MS);
  }, [limparTimer]);

  const aoSairMouse = React.useCallback(() => {
    limparTimer();
    timer.current = setTimeout(() => setHover(false), ATRASO_FECHAR_MS);
  }, [limparTimer]);

  const aoFocar = React.useCallback(() => {
    limparTimer();
    setTemFoco(true);
  }, [limparTimer]);

  const aoDesfocar = React.useCallback(
    (evento: React.FocusEvent<HTMLElement>) => {
      // Só recolhe quando o foco sai da sidebar inteira, não ao pular de um
      // item para o vizinho.
      if (evento.currentTarget.contains(evento.relatedTarget as Node | null)) {
        return;
      }
      setTemFoco(false);
    },
    [],
  );

  return {
    expandida: hover || temFoco || menuAberto,
    aoEntrarMouse,
    aoSairMouse,
    aoFocar,
    aoDesfocar,
  };
}

export function AppShell({ usuario, modulos, children, onSair }: AppShellProps) {
  const pathname = usePathname();
  const modulosMobile = modulos.slice(0, 6);
  const [menuUsuarioAberto, setMenuUsuarioAberto] = React.useState(false);
  const { expandida, aoEntrarMouse, aoSairMouse, aoFocar, aoDesfocar } =
    useSidebarExpansivel(menuUsuarioAberto);

  /** Texto que só aparece com a sidebar expandida (some sem mexer no ícone). */
  const classesTexto = cn(
    "min-w-0 truncate pr-3 transition-opacity duration-200 ease-out",
    expandida ? "opacity-100" : "opacity-0",
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {/*
        Espaçador: reserva no fluxo apenas a largura RECOLHIDA. A sidebar em si
        é fixed e expande por cima do conteúdo (overlay), então a área útil da
        página nunca reflui quando o mouse passa.
      */}
      <div
        className={cn("hidden shrink-0 md:block", LARGURA_RECOLHIDA)}
        aria-hidden="true"
      />

      <TooltipProvider delayDuration={300}>
        <aside
          onMouseEnter={aoEntrarMouse}
          onMouseLeave={aoSairMouse}
          onFocusCapture={aoFocar}
          onBlurCapture={aoDesfocar}
          data-expandida={expandida ? "true" : "false"}
          className={cn(
            "fixed inset-y-0 left-0 z-40 hidden flex-col overflow-hidden border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out md:flex",
            expandida ? cn(LARGURA_EXPANDIDA, "shadow-lg") : LARGURA_RECOLHIDA,
          )}
        >
          {/* Marca: símbolo quando recolhida, nome completo quando expandida.
              Leva ao primeiro módulo que ESTE usuário pode ver (a lista já vem
              filtrada por permissão), nunca a uma rota que ele não acessa. */}
          <Link
            href={modulos[0]?.rota ?? "/"}
            className="flex h-12 shrink-0 items-center border-b border-sidebar-border"
            aria-label="ERP EMT, ir para o início"
          >
            <span
              className={cn(
                "flex shrink-0 items-center justify-center",
                CAIXA_ICONE,
              )}
            >
              <span className="flex size-7 items-center justify-center rounded-md bg-primary text-legenda font-semibold text-primary-foreground">
                E
              </span>
            </span>
            <span className={classesTexto}>
              <span className="block text-detalhe font-semibold leading-tight">
                EMT Construtora
              </span>
              <span className="block text-legenda text-muted-foreground">
                ERP
              </span>
            </span>
          </Link>

          <nav className="flex-1 overflow-x-hidden overflow-y-auto py-1" aria-label="Módulos">
            {modulos.map((modulo) => {
              const Icone = iconeDoModulo(modulo);
              const ativo = pathname.startsWith(modulo.rota);
              return (
                <Tooltip key={modulo.id}>
                  <TooltipTrigger asChild>
                    <Link
                      href={modulo.rota}
                      aria-current={ativo ? "page" : undefined}
                      aria-label={modulo.nome}
                      className={cn(
                        "flex h-9 items-center text-detalhe transition-colors",
                        ativo
                          ? "faixa-esquerda bg-sidebar-accent font-medium text-sidebar-foreground"
                          : "text-muted-foreground hover:bg-sidebar-accent",
                      )}
                    >
                      <span
                        className={cn(
                          "flex shrink-0 items-center justify-center",
                          CAIXA_ICONE,
                        )}
                      >
                        <Icone className="size-4" aria-hidden="true" />
                      </span>
                      <span className={classesTexto}>{modulo.nome}</span>
                    </Link>
                  </TooltipTrigger>
                  {/* Recolhida, o nome vive no tooltip; expandida, está na tela. */}
                  {expandida ? null : (
                    <TooltipContent side="right">{modulo.nome}</TooltipContent>
                  )}
                </Tooltip>
              );
            })}
          </nav>

          {/* Perfil no rodapé: avatar recolhido, avatar + nome + email expandido */}
          <div className="shrink-0 border-t border-sidebar-border">
            <DropdownMenu
              open={menuUsuarioAberto}
              onOpenChange={setMenuUsuarioAberto}
            >
              <DropdownMenuTrigger
                className="flex h-14 w-full items-center outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                aria-label={`Menu do usuário: ${usuario.nome}`}
              >
                <span
                  className={cn(
                    "flex shrink-0 items-center justify-center",
                    CAIXA_ICONE,
                  )}
                >
                  <Avatar className="size-8">
                    <AvatarFallback className="bg-accent text-legenda font-medium text-accent-foreground">
                      {iniciaisDoNome(usuario.nome)}
                    </AvatarFallback>
                  </Avatar>
                </span>
                <span className={cn(classesTexto, "flex items-center gap-1")}>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block truncate text-detalhe font-medium">
                      {usuario.nome}
                    </span>
                    <span className="block truncate text-legenda text-muted-foreground">
                      {usuario.email}
                    </span>
                  </span>
                  <ChevronsUpDown
                    className="size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </span>
              </DropdownMenuTrigger>
              {/* Abre pra direita e pra cima, e o Radix desvia da borda da tela. */}
              <DropdownMenuContent
                side="right"
                align="end"
                sideOffset={8}
                collisionPadding={12}
                className="w-56"
              >
                <ItensMenuUsuario usuario={usuario} onSair={onSair} />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </aside>
      </TooltipProvider>

      <div className="flex min-w-0 flex-1 flex-col">
        {/*
          Topo só no mobile: no desktop a marca e o perfil moraram para a
          sidebar, e uma faixa vazia de 48px só roubaria altura do conteúdo.
        */}
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-background px-4 md:hidden">
          <span className="font-semibold">EMT</span>
          <DropdownMenu>
            <DropdownMenuTrigger
              className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Menu do usuário"
            >
              <Avatar className="size-8">
                <AvatarFallback className="bg-accent text-legenda font-medium text-accent-foreground">
                  {iniciaisDoNome(usuario.nome)}
                </AvatarFallback>
              </Avatar>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <ItensMenuUsuario usuario={usuario} onSair={onSair} />
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* Conteúdo */}
        <main className="flex-1 overflow-auto bg-background p-4 pb-16 md:p-6 md:pb-6">
          {children}
        </main>
      </div>

      {/* Menu inferior mobile (inalterado) */}
      <nav
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 grid border-t border-border bg-background md:hidden",
          COLUNAS_MOBILE[modulosMobile.length] ?? "grid-cols-5",
        )}
        aria-label="Módulos"
      >
        {modulosMobile.map((modulo) => {
          const Icone = iconeDoModulo(modulo);
          const ativo = pathname.startsWith(modulo.rota);
          return (
            <Link
              key={modulo.id}
              href={modulo.rota}
              aria-current={ativo ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-0.5 border-t-[3px] py-2",
                ativo
                  ? "border-faixa text-primary"
                  : "border-transparent text-muted-foreground",
              )}
            >
              <Icone className="size-5" aria-hidden="true" />
              <span className="truncate text-legenda">{modulo.nome}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
