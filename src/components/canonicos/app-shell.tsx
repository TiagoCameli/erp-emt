"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Circle,
  FolderOpen,
  LayoutDashboard,
  LogOut,
  Search,
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
import { Input } from "@/components/ui/input";
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

export function AppShell({ usuario, modulos, children, onSair }: AppShellProps) {
  const pathname = usePathname();
  const modulosMobile = modulos.slice(0, 6);

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar desktop */}
      <aside className="hidden w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex">
        <div className="px-4 py-4">
          <div className="font-semibold">EMT</div>
          <div className="text-detalhe text-muted-foreground">ERP EMT</div>
        </div>
        <nav className="flex-1 overflow-y-auto py-1" aria-label="Módulos">
          {modulos.map((modulo) => {
            const Icone = iconeDoModulo(modulo);
            const ativo = pathname.startsWith(modulo.rota);
            return (
              <Link
                key={modulo.id}
                href={modulo.rota}
                aria-current={ativo ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2 px-4 py-2 text-detalhe transition-colors",
                  ativo
                    ? "faixa-esquerda bg-sidebar-accent font-medium text-sidebar-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent"
                )}
              >
                <Icone className="size-4 shrink-0" aria-hidden="true" />
                <span className="truncate">{modulo.nome}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topo */}
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-background px-4">
          <div className="relative hidden md:block">
            <Search
              className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              disabled
              placeholder="Buscar (em breve)"
              className="h-8 w-64 pl-8"
              aria-label="Busca global"
            />
          </div>
          <div className="md:hidden">
            <span className="font-semibold">EMT</span>
          </div>
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
              <DropdownMenuLabel>
                <div className="text-detalhe font-medium">{usuario.nome}</div>
                <div className="text-legenda font-normal text-muted-foreground">
                  {usuario.email}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onSair}>
                <LogOut className="size-4" aria-hidden="true" />
                Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>

        {/* Conteúdo */}
        <main className="flex-1 overflow-auto bg-background p-4 pb-16 md:p-6 md:pb-6">
          {children}
        </main>
      </div>

      {/* Menu inferior mobile */}
      <nav
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 grid border-t border-border bg-background md:hidden",
          COLUNAS_MOBILE[modulosMobile.length] ?? "grid-cols-5"
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
                  : "border-transparent text-muted-foreground"
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
