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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogoEmt } from "@/components/canonicos/logo-emt";
import { useRestaurarFiltrosDaSessao } from "@/components/canonicos/use-restaurar-filtros";
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

/** Largura da sidebar. Fixa: ela nunca expande. */
const LARGURA_SIDEBAR = "w-14";
/** Atraso pra abrir o submenu: o mouse de passagem não abre nada. */
const ATRASO_ABRIR_MS = 150;
/** Atraso pra fechar: sair de raspão do painel não fecha na cara do usuário. */
const ATRASO_FECHAR_MS = 220;

/** Uma aba de módulo no submenu. */
export interface AbaNavegacao {
  id: string;
  nome: string;
  rota: string;
}

export interface ModuloNavegacao {
  id: string;
  nome: string;
  rota: string;
  icone?: string;
  /** Abas visíveis do módulo, na ordem do catálogo, já filtradas por permissão. */
  abas?: AbaNavegacao[];
}

export interface AppShellProps {
  usuario: {
    nome: string;
    email: string;
    /**
     * URL ASSINADA da foto de perfil, ou null/ausente para cair nas iniciais.
     *
     * Já assinada porque este componente é de cliente e não pode falar com o
     * Storage: quem assina é o layout, com a chave de serviço. Opcional para não
     * quebrar quem monta o AppShell sem foto.
     */
    fotoUrl?: string | null;
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
 * Avatar do usuário: a foto quando existe, as iniciais quando não.
 *
 * Um componente só porque o gatilho do menu aparece em DOIS lugares (a sidebar
 * do desktop e o topo do mobile), e avatar duplicado é a forma clássica de a
 * foto aparecer num e não no outro.
 *
 * As iniciais ficam no `AvatarFallback`, que o Radix mostra sozinho quando a
 * imagem não carrega — e isso não é só para "sem foto": a URL assinada expira, e
 * uma aba aberta há horas volta às iniciais em vez de mostrar um ícone de imagem
 * quebrada.
 */
function AvatarUsuario({
  nome,
  fotoUrl,
}: {
  nome: string;
  fotoUrl?: string | null;
}) {
  return (
    <Avatar className="size-8">
      {fotoUrl ? <AvatarImage src={fotoUrl} alt="" /> : null}
      <AvatarFallback className="bg-accent text-legenda font-medium text-accent-foreground">
        {iniciaisDoNome(nome)}
      </AvatarFallback>
    </Avatar>
  );
}

/**
 * A aba atual é a de rota mais específica que casa com o pathname. Sem isso
 * "/compras" marcaria como ativa qualquer aba do módulo.
 */
function abaAtiva(abas: AbaNavegacao[], pathname: string): string | null {
  let escolhida: AbaNavegacao | null = null;
  for (const aba of abas) {
    if (pathname === aba.rota || pathname.startsWith(`${aba.rota}/`)) {
      if (!escolhida || aba.rota.length > escolhida.rota.length)
        escolhida = aba;
    }
  }
  return escolhida?.id ?? null;
}

/** Itens do menu do usuário. Mesmo conteúdo no rodapé (desktop) e no topo (mobile). */
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
 * Um módulo na sidebar: o ícone e o submenu flutuante com as abas dele.
 *
 * O painel é filho do MESMO contêiner do ícone e começa exatamente na borda
 * direita da sidebar (`left-full`, sem margem), então não existe vão entre os
 * dois: o mouse atravessa do ícone pro painel sem passar por fora, e o
 * fechamento fica preso ao contêiner inteiro. É a "ponte de hover", sem gap e
 * sem flicker.
 */
function ModuloSidebar({
  modulo,
  Icone,
  moduloAtivo,
  idAbaAtiva,
  aberto,
  onAbrir,
  onFechar,
  onFecharAgora,
}: {
  modulo: ModuloNavegacao;
  /** Ícone já resolvido pelo chamador (componente não se cria dentro do render). */
  Icone: LucideIcon;
  moduloAtivo: boolean;
  idAbaAtiva: string | null;
  aberto: boolean;
  onAbrir: () => void;
  onFechar: () => void;
  onFecharAgora: () => void;
}) {
  const abas = modulo.abas ?? [];
  const gatilhoRef = React.useRef<HTMLAnchorElement>(null);
  const painelRef = React.useRef<HTMLDivElement>(null);

  /** Move o foco pro item do painel na posição pedida (com volta ao início/fim). */
  function focarItem(posicao: number) {
    const itens =
      painelRef.current?.querySelectorAll<HTMLAnchorElement>(
        '[role="menuitem"]',
      );
    if (!itens || itens.length === 0) return;
    const indice = (posicao + itens.length) % itens.length;
    itens[indice].focus();
  }

  function aoTeclarNoGatilho(evento: React.KeyboardEvent<HTMLAnchorElement>) {
    if (abas.length === 0) return;
    // Enter e setas abrem o submenu (a primeira aba é a mesma rota padrão do
    // módulo, então nada fica inalcançável pelo teclado).
    if (
      evento.key === "Enter" ||
      evento.key === "ArrowRight" ||
      evento.key === "ArrowDown"
    ) {
      evento.preventDefault();
      onAbrir();
      requestAnimationFrame(() => focarItem(0));
      return;
    }
    if (evento.key === "Escape") onFecharAgora();
  }

  function aoTeclarNoPainel(evento: React.KeyboardEvent<HTMLDivElement>) {
    const itens = Array.from(
      painelRef.current?.querySelectorAll<HTMLAnchorElement>(
        '[role="menuitem"]',
      ) ?? [],
    );
    const atual = itens.indexOf(document.activeElement as HTMLAnchorElement);

    if (evento.key === "ArrowDown") {
      evento.preventDefault();
      focarItem(atual + 1);
      return;
    }
    if (evento.key === "ArrowUp") {
      evento.preventDefault();
      focarItem(atual - 1);
      return;
    }
    if (evento.key === "Home") {
      evento.preventDefault();
      focarItem(0);
      return;
    }
    if (evento.key === "End") {
      evento.preventDefault();
      focarItem(itens.length - 1);
      return;
    }
    if (evento.key === "Escape" || evento.key === "ArrowLeft") {
      evento.preventDefault();
      onFecharAgora();
      gatilhoRef.current?.focus();
    }
  }

  return (
    <div
      className="relative"
      onMouseEnter={onAbrir}
      onMouseLeave={onFechar}
      onBlur={(evento) => {
        // Foco saiu do módulo inteiro (ícone + painel): fecha.
        if (
          !evento.currentTarget.contains(evento.relatedTarget as Node | null)
        ) {
          onFecharAgora();
        }
      }}
    >
      <Link
        ref={gatilhoRef}
        href={modulo.rota}
        aria-current={moduloAtivo ? "page" : undefined}
        aria-label={modulo.nome}
        aria-haspopup={abas.length > 0 ? "menu" : undefined}
        aria-expanded={abas.length > 0 ? aberto : undefined}
        onKeyDown={aoTeclarNoGatilho}
        className={cn(
          "flex h-11 items-center justify-center transition-colors",
          moduloAtivo
            ? "faixa-esquerda bg-sidebar-accent text-primary"
            : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
        )}
      >
        <Icone className="size-5" aria-hidden="true" />
      </Link>

      {aberto && abas.length > 0 ? (
        <div
          ref={painelRef}
          role="menu"
          aria-label={modulo.nome}
          onKeyDown={aoTeclarNoPainel}
          className="absolute top-0 left-full z-50 max-h-[calc(100vh-1rem)] w-60 overflow-y-auto rounded-md border border-border bg-popover py-1 shadow-lg"
        >
          <p className="border-b border-border px-3 pb-1.5 text-legenda font-semibold tracking-wide text-muted-foreground uppercase">
            {modulo.nome}
          </p>
          {abas.map((aba) => {
            const ativa = aba.id === idAbaAtiva;
            return (
              <Link
                key={aba.id}
                role="menuitem"
                href={aba.rota}
                aria-current={ativa ? "page" : undefined}
                onClick={onFecharAgora}
                className={cn(
                  "block px-3 py-1.5 text-detalhe outline-none transition-colors",
                  ativa
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-foreground hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent",
                )}
              >
                {aba.nome}
              </Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function AppShell({
  usuario,
  modulos,
  children,
  onSair,
}: AppShellProps) {
  const pathname = usePathname();
  useRestaurarFiltrosDaSessao(pathname);
  const modulosMobile = modulos.slice(0, 6);
  const [moduloAberto, setModuloAberto] = React.useState<string | null>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const limparTimer = React.useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  React.useEffect(() => limparTimer, [limparTimer]);

  const abrirComAtraso = React.useCallback(
    (id: string) => {
      limparTimer();
      timer.current = setTimeout(() => setModuloAberto(id), ATRASO_ABRIR_MS);
    },
    [limparTimer],
  );

  const fecharComAtraso = React.useCallback(() => {
    limparTimer();
    timer.current = setTimeout(() => setModuloAberto(null), ATRASO_FECHAR_MS);
  }, [limparTimer]);

  const fecharAgora = React.useCallback(() => {
    limparTimer();
    setModuloAberto(null);
  }, [limparTimer]);

  return (
    <div className="flex h-screen overflow-hidden">
      {/*
        Sidebar sempre recolhida: só ícones. O submenu de cada módulo escapa
        pela direita (absolute), então nada aqui pode ter overflow escondido.
        z-40 mantém os painéis acima do conteúdo.
      */}
      <aside
        className={cn(
          "relative z-40 hidden shrink-0 flex-col border-r border-sidebar-border bg-sidebar md:flex",
          LARGURA_SIDEBAR,
        )}
      >
        <Link
          href={modulos[0]?.rota ?? "/"}
          className="flex h-12 shrink-0 items-center justify-center border-b border-sidebar-border"
          aria-label="ERP EMT, ir para o início"
        >
          {/*
            A marca de verdade, não a inicial num quadrado. `simbolo` corta o
            "Construtora Ltda" e deixa EMT sobre a pista, que é o que ainda se lê
            nos 36px que a sidebar recolhida tem de largura útil.
          */}
          <LogoEmt variante="simbolo" className="w-9" />
        </Link>

        <nav className="flex-1 py-1" aria-label="Módulos">
          {modulos.map((modulo) => (
            <ModuloSidebar
              key={modulo.id}
              modulo={modulo}
              Icone={iconeDoModulo(modulo)}
              moduloAtivo={pathname.startsWith(modulo.rota)}
              idAbaAtiva={abaAtiva(modulo.abas ?? [], pathname)}
              aberto={moduloAberto === modulo.id}
              onAbrir={() => abrirComAtraso(modulo.id)}
              onFechar={fecharComAtraso}
              onFecharAgora={fecharAgora}
            />
          ))}
        </nav>

        {/* Perfil fixo no rodapé */}
        <div className="shrink-0 border-t border-sidebar-border">
          <DropdownMenu>
            <DropdownMenuTrigger
              className="flex h-14 w-full items-center justify-center outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              aria-label={`Menu do usuário: ${usuario.nome}`}
            >
              <AvatarUsuario nome={usuario.nome} fotoUrl={usuario.fotoUrl} />
              <ChevronsUpDown className="sr-only" aria-hidden="true" />
            </DropdownMenuTrigger>
            {/* Pra direita e pra cima, com desvio da borda da tela. */}
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

      <div className="flex min-w-0 flex-1 flex-col">
        {/*
          Topo só no mobile: no desktop a marca e o perfil moraram para a
          sidebar, e uma faixa vazia de 48px só roubaria altura do conteúdo.
        */}
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-background px-4 md:hidden">
          <LogoEmt
            variante="simbolo"
            titulo="EMT Construtora"
            className="w-10"
          />
          <DropdownMenu>
            <DropdownMenuTrigger
              className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Menu do usuário"
            >
              <AvatarUsuario nome={usuario.nome} fotoUrl={usuario.fotoUrl} />
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
