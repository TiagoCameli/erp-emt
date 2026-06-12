"use client";

import * as React from "react";
import {
  ChevronDown,
  ChevronRight,
  FolderTree,
  ListTree,
  Lock,
  MoreHorizontal,
  Plus,
} from "lucide-react";
import { toast } from "sonner";

import {
  ConfirmDialog,
  EmptyState,
  FilterBar,
  FiltroBusca,
  MoneyText,
  StatusBadge,
} from "@/components/canonicos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { alternarAtivo } from "@/modules/cadastros/centros-custo/actions";
import type { NoCentroCusto } from "@/modules/cadastros/centros-custo/queries";
import {
  ROTULO_TIPO_CENTRO,
  type TipoCentro,
} from "@/modules/cadastros/centros-custo/schemas";
import { NoFormDrawer, type ModoNo } from "./no-form-drawer";

export interface ArvoreCentrosCustoProps {
  nos: NoCentroCusto[];
  podeCriar: boolean;
  podeEditar: boolean;
}

/** Nó já com a lista de filhos resolvida, para renderização recursiva. */
interface NoArvore extends NoCentroCusto {
  filhos: NoArvore[];
}

/** True quando o nó é gerido pelo sistema (de sistema ou gerado por equipamento). */
function ehGerido(no: NoCentroCusto): boolean {
  return no.sistema || no.equipamento_id !== null;
}

/**
 * Monta a hierarquia a partir da lista plana, indexando por pai_id. A query
 * devolve plano (3 níveis, volume pequeno) e a árvore é montada aqui, dona do
 * estado de expansão.
 */
function montarArvore(nos: NoCentroCusto[]): NoArvore[] {
  const porId = new Map<string, NoArvore>();
  for (const no of nos) {
    porId.set(no.id, { ...no, filhos: [] });
  }

  const raizes: NoArvore[] = [];
  for (const no of porId.values()) {
    if (no.pai_id && porId.has(no.pai_id)) {
      porId.get(no.pai_id)!.filhos.push(no);
    } else {
      raizes.push(no);
    }
  }

  return raizes;
}

/** Filtra a árvore por termo de busca, mantendo o ramo de quem casa. */
function filtrarArvore(nos: NoArvore[], termo: string): NoArvore[] {
  if (termo === "") return nos;
  const resultado: NoArvore[] = [];
  for (const no of nos) {
    const filhos = filtrarArvore(no.filhos, termo);
    const casa =
      no.nome.toLowerCase().includes(termo) ||
      (no.codigo?.toLowerCase().includes(termo) ?? false);
    if (casa || filhos.length > 0) {
      resultado.push({ ...no, filhos });
    }
  }
  return resultado;
}

const INDENTACAO_PX = 24;

export function ArvoreCentrosCusto({
  nos,
  podeCriar,
  podeEditar,
}: ArvoreCentrosCustoProps) {
  const [busca, setBusca] = React.useState("");
  const [expandidos, setExpandidos] = React.useState<Set<string>>(() => {
    // Centros (nível 1) começam expandidos para mostrar a estrutura.
    return new Set(nos.filter((no) => no.nivel === 1).map((no) => no.id));
  });

  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [modo, setModo] = React.useState<ModoNo | null>(null);
  const [aDesativar, setADesativar] = React.useState<NoCentroCusto | null>(null);

  const termo = busca.trim().toLowerCase();

  const arvore = React.useMemo(() => {
    const completa = montarArvore(nos);
    return filtrarArvore(completa, termo);
  }, [nos, termo]);

  // Durante a busca, expande tudo para revelar os resultados.
  const buscando = termo !== "";

  function alternarExpandido(id: string) {
    setExpandidos((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  function abrirCriarEtapa(pai: NoCentroCusto) {
    setModo({ tipo: "criar-etapa", pai });
    setDrawerAberto(true);
  }

  function abrirCriarItem(pai: NoCentroCusto) {
    setModo({ tipo: "criar-item", pai });
    setDrawerAberto(true);
  }

  function abrirEditar(no: NoCentroCusto) {
    setModo({ tipo: "editar", no });
    setDrawerAberto(true);
  }

  async function aoDesativar() {
    if (!aDesativar) return;
    const resultado = await alternarAtivo(aDesativar.id, !aDesativar.ativo);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(aDesativar.ativo ? "Nó desativado" : "Nó ativado");
    setADesativar(null);
  }

  async function aoReativar(no: NoCentroCusto) {
    const resultado = await alternarAtivo(no.id, true);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Nó ativado");
  }

  function renderNo(no: NoArvore, profundidade: number): React.ReactNode {
    const temFilhos = no.filhos.length > 0;
    const aberto = buscando || expandidos.has(no.id);
    const gerido = ehGerido(no);
    const tipoCentro = no.nivel === 1 ? (no.tipo as TipoCentro | null) : null;

    // Quem pode receber filho: centro recebe etapa, etapa recebe item.
    const podeAdicionarEtapa = podeCriar && no.nivel === 1;
    const podeAdicionarItem = podeCriar && no.nivel === 2;
    // Editar: nó manual edita tudo; nó gerido só orçamento (ainda abre o drawer).
    const podeAbrirEditar = podeEditar;
    // Desativar: só nó manual de nível 2 ou 3.
    const podeDesativar = podeEditar && no.nivel !== 1 && !gerido;
    const temAcoes =
      podeAdicionarEtapa ||
      podeAdicionarItem ||
      podeAbrirEditar ||
      podeDesativar;

    return (
      <React.Fragment key={no.id}>
        <div
          className={cn(
            "group flex items-center gap-2 rounded-md py-1.5 pr-2 transition-colors hover:bg-surface",
            !no.ativo && "opacity-50",
          )}
          style={{ paddingLeft: profundidade * INDENTACAO_PX + 4 }}
        >
          {temFilhos ? (
            <button
              type="button"
              onClick={() => alternarExpandido(no.id)}
              className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
              aria-label={aberto ? `Recolher ${no.nome}` : `Expandir ${no.nome}`}
              aria-expanded={aberto}
            >
              {aberto ? (
                <ChevronDown className="size-4" />
              ) : (
                <ChevronRight className="size-4" />
              )}
            </button>
          ) : (
            <span className="size-5 shrink-0" aria-hidden />
          )}

          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span
              className={cn(
                "truncate",
                no.nivel === 1 ? "font-semibold" : "font-medium",
              )}
            >
              {no.nome}
            </span>

            {no.codigo ? (
              <span className="shrink-0 font-mono text-legenda text-muted-foreground">
                {no.codigo}
              </span>
            ) : null}

            {tipoCentro ? (
              <Badge
                variant="secondary"
                className="shrink-0 border-transparent bg-accent/15 text-accent-foreground"
              >
                {ROTULO_TIPO_CENTRO[tipoCentro]}
              </Badge>
            ) : null}

            {gerido ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="flex size-5 shrink-0 items-center justify-center text-muted-foreground"
                      aria-label="Gerido pelo sistema"
                    >
                      <Lock className="size-3.5" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    Gerido pelo sistema, só o orçamento pode mudar
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : null}

            {!no.ativo ? (
              <StatusBadge
                status="rascunho"
                rotulo="Inativo"
                className="shrink-0"
              />
            ) : null}
          </div>

          {no.orcamento !== null ? (
            <MoneyText valor={no.orcamento} className="shrink-0" />
          ) : null}

          {temAcoes ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="shrink-0 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
                  aria-label={`Ações de ${no.nome}`}
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {podeAdicionarEtapa ? (
                  <DropdownMenuItem onSelect={() => abrirCriarEtapa(no)}>
                    <Plus />
                    Adicionar etapa
                  </DropdownMenuItem>
                ) : null}
                {podeAdicionarItem ? (
                  <DropdownMenuItem onSelect={() => abrirCriarItem(no)}>
                    <Plus />
                    Adicionar item
                  </DropdownMenuItem>
                ) : null}
                {podeAbrirEditar ? (
                  <DropdownMenuItem onSelect={() => abrirEditar(no)}>
                    {gerido ? "Editar orçamento" : "Editar"}
                  </DropdownMenuItem>
                ) : null}
                {podeDesativar ? (
                  <>
                    <DropdownMenuSeparator />
                    {no.ativo ? (
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => setADesativar(no)}
                      >
                        Desativar
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem onSelect={() => aoReativar(no)}>
                        Ativar
                      </DropdownMenuItem>
                    )}
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <span className="size-8 shrink-0" aria-hidden />
          )}
        </div>

        {aberto && temFilhos
          ? no.filhos.map((filho) => renderNo(filho, profundidade + 1))
          : null}
      </React.Fragment>
    );
  }

  return (
    <>
      <FilterBar>
        <FiltroBusca
          valor={busca}
          onValorChange={setBusca}
          placeholder="Buscar por nome ou código"
        />
      </FilterBar>

      {arvore.length === 0 ? (
        <EmptyState
          icone={buscando ? ListTree : FolderTree}
          titulo={
            buscando
              ? "Nenhum centro de custo encontrado"
              : "Nenhum centro de custo ainda"
          }
          descricao={
            buscando
              ? "Tente outro termo de busca."
              : "Centros nascem das obras e dos centros de sistema. Cadastre uma obra para ver a estrutura aqui."
          }
        />
      ) : (
        <div className="rounded-lg border border-border bg-background py-1 text-corpo">
          {arvore.map((no) => renderNo(no, 0))}
        </div>
      )}

      {podeCriar || podeEditar ? (
        <NoFormDrawer
          aberto={drawerAberto}
          onAbertoChange={setDrawerAberto}
          modo={modo}
        />
      ) : null}

      {podeEditar ? (
        <ConfirmDialog
          aberto={aDesativar !== null}
          onAbertoChange={(aberto) => {
            if (!aberto) setADesativar(null);
          }}
          titulo="Desativar nó"
          descricao={
            aDesativar
              ? `O nó ${aDesativar.nome} fica inativo e some das listas de seleção, mas continua no histórico.`
              : ""
          }
          textoConfirmar="Desativar nó"
          variante="destrutivo"
          onConfirmar={aoDesativar}
        />
      ) : null}
    </>
  );
}
