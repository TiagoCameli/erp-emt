"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog, KPICard, StatusBadge } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatarBRL,
  formatarPercentual,
  formatarQuantidade,
} from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import { excluirItem } from "@/modules/cadastros/orcamentos/actions";
import type {
  OrcamentoCabecalho,
  OrcamentoItem,
} from "@/modules/cadastros/orcamentos/queries";
import {
  STATUS_ORCAMENTO_CONFIG,
  type TipoItemOrcamento,
} from "@/modules/cadastros/orcamentos/schemas";
import {
  OrcamentoItemForm,
  type ModoItem,
} from "./orcamento-item-form";

export interface OrcamentoArvoreProps {
  cabecalho: OrcamentoCabecalho;
  itens: OrcamentoItem[];
  podeCriar: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
}

/** Nó com filhos resolvidos, pra render recursivo. */
interface NoArvore extends OrcamentoItem {
  filhos: NoArvore[];
}

const FONTE_POR_TIPO: Record<TipoItemOrcamento, string> = {
  etapa: "font-semibold",
  subetapa: "font-medium",
  item: "font-normal",
};

const FUNDO_POR_TIPO: Record<TipoItemOrcamento, string> = {
  etapa: "bg-muted/50",
  subetapa: "bg-muted/20",
  item: "",
};

const INDENTACAO_PX = 20;

/** Monta a hierarquia a partir da lista plana, ordenando irmãos por `ordem`. */
function montarArvore(itens: OrcamentoItem[]): NoArvore[] {
  const porId = new Map<string, NoArvore>();
  for (const item of itens) porId.set(item.id, { ...item, filhos: [] });

  const raizes: NoArvore[] = [];
  for (const no of porId.values()) {
    if (no.parentId && porId.has(no.parentId)) {
      porId.get(no.parentId)!.filhos.push(no);
    } else {
      raizes.push(no);
    }
  }

  const ordenar = (lista: NoArvore[]) => {
    lista.sort((a, b) => a.ordem - b.ordem);
    for (const no of lista) ordenar(no.filhos);
  };
  ordenar(raizes);
  return raizes;
}

/**
 * Detalhe de um orçamento: cabeçalho com totais e a árvore de itens
 * (etapa > subetapa > item). Quem tem permissão edita aqui: adiciona etapas,
 * subetapas e itens, edita e exclui. Os totais (custo e preço) são calculados
 * pelo banco — item folha = qtd × unitário; grupo = soma dos filhos.
 */
export function OrcamentoArvore({
  cabecalho,
  itens,
  podeCriar,
  podeEditar,
  podeExcluir,
}: OrcamentoArvoreProps) {
  const router = useRouter();
  const config = STATUS_ORCAMENTO_CONFIG[cabecalho.status];

  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [modo, setModo] = React.useState<ModoItem | null>(null);
  const [aExcluir, setAExcluir] = React.useState<NoArvore | null>(null);

  const arvore = React.useMemo(() => montarArvore(itens), [itens]);

  function abrir(novoModo: ModoItem) {
    setModo(novoModo);
    setDrawerAberto(true);
  }

  async function aoExcluir() {
    if (!aExcluir) return;
    const r = await excluirItem(aExcluir.id);
    if ("erro" in r) {
      toast.error(r.erro);
      return;
    }
    toast.success("Item excluído");
    setAExcluir(null);
  }

  const colSpan = podeEditar || podeCriar || podeExcluir ? 8 : 7;

  function renderNo(no: NoArvore, profundidade: number): React.ReactNode {
    const ehGrupo = no.tipo !== "item";
    const podeAddSub = podeCriar && ehGrupo;
    const temAcoes = podeAddSub || podeEditar || podeExcluir;

    return (
      <React.Fragment key={no.id}>
        <TableRow
          className={cn("group h-9 hover:bg-surface", FUNDO_POR_TIPO[no.tipo])}
        >
          <TableCell
            className={cn(
              "px-3 text-detalhe tabular-nums",
              FONTE_POR_TIPO[no.tipo],
            )}
          >
            {no.indice ?? <span className="text-muted-foreground">-</span>}
          </TableCell>
          <TableCell
            className={cn("px-3 text-detalhe", FONTE_POR_TIPO[no.tipo])}
            style={{ paddingLeft: profundidade * INDENTACAO_PX + 12 }}
          >
            {no.descricao}
          </TableCell>
          <TableCell className="px-3 text-detalhe">
            {no.unidade ?? <span className="text-muted-foreground">-</span>}
          </TableCell>
          <TableCell className="px-3 text-right text-detalhe tabular-nums">
            {ehGrupo ? (
              <span className="text-muted-foreground">soma</span>
            ) : no.quantidade !== null ? (
              formatarQuantidade(no.quantidade)
            ) : (
              <span className="text-muted-foreground">-</span>
            )}
          </TableCell>
          <TableCell className="px-3 text-right text-detalhe tabular-nums">
            {!ehGrupo && no.custoUnitario !== null ? (
              formatarBRL(no.custoUnitario)
            ) : (
              <span className="text-muted-foreground">-</span>
            )}
          </TableCell>
          <TableCell className="px-3 text-right text-detalhe tabular-nums">
            {no.custoTotal !== null ? (
              formatarBRL(no.custoTotal)
            ) : (
              <span className="text-muted-foreground">-</span>
            )}
          </TableCell>
          <TableCell className="px-3 text-right text-detalhe tabular-nums">
            {no.precoTotal !== null ? (
              formatarBRL(no.precoTotal)
            ) : (
              <span className="text-muted-foreground">-</span>
            )}
          </TableCell>
          {colSpan === 8 ? (
            <TableCell className="px-2 text-right">
              {temAcoes ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
                      aria-label={`Ações de ${no.descricao}`}
                    >
                      <MoreHorizontal />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {podeAddSub ? (
                      <>
                        <DropdownMenuItem
                          onSelect={() =>
                            abrir({
                              tipo: "criar-subetapa",
                              orcamentoId: cabecalho.id,
                              pai: no,
                            })
                          }
                        >
                          <Plus />
                          Adicionar subetapa
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() =>
                            abrir({
                              tipo: "criar-item",
                              orcamentoId: cabecalho.id,
                              pai: no,
                            })
                          }
                        >
                          <Plus />
                          Adicionar item
                        </DropdownMenuItem>
                      </>
                    ) : null}
                    {podeEditar ? (
                      <DropdownMenuItem
                        onSelect={() =>
                          abrir({
                            tipo: "editar",
                            orcamentoId: cabecalho.id,
                            item: no,
                          })
                        }
                      >
                        Editar
                      </DropdownMenuItem>
                    ) : null}
                    {podeExcluir ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => setAExcluir(no)}
                        >
                          Excluir
                        </DropdownMenuItem>
                      </>
                    ) : null}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </TableCell>
          ) : null}
        </TableRow>
        {no.filhos.map((filho) => renderNo(filho, profundidade + 1))}
      </React.Fragment>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Voltar para a lista de orçamentos"
            onClick={() => router.push("/cadastros/orcamentos")}
          >
            <ArrowLeft />
          </Button>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h1 className="text-titulo font-semibold">
                {cabecalho.numero ?? "Orçamento"}
              </h1>
              <StatusBadge
                status={cabecalho.status}
                rotulo={config.rotulo}
                className={config.classes}
              />
            </div>
            {cabecalho.descricao ? (
              <p className="text-detalhe text-muted-foreground">
                {cabecalho.descricao}
              </p>
            ) : null}
          </div>
        </div>

        {podeCriar ? (
          <Button
            type="button"
            onClick={() =>
              abrir({ tipo: "criar-etapa", orcamentoId: cabecalho.id })
            }
          >
            <Plus />
            Adicionar etapa
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KPICard titulo="Obra" valor={cabecalho.obraNome ?? "-"} />
        <KPICard titulo="Custo total" valor={formatarBRL(cabecalho.custoTotal)} />
        <KPICard
          titulo="BDI"
          valor={
            cabecalho.bdi !== null ? formatarPercentual(cabecalho.bdi) : "-"
          }
        />
        <KPICard titulo="Preço total" valor={formatarBRL(cabecalho.precoTotal)} />
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-secao font-semibold">Itens</h2>
        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 px-3 text-detalhe font-medium text-muted-foreground">
                  Índice
                </TableHead>
                <TableHead className="h-9 px-3 text-detalhe font-medium text-muted-foreground">
                  Descrição
                </TableHead>
                <TableHead className="h-9 px-3 text-detalhe font-medium text-muted-foreground">
                  Un.
                </TableHead>
                <TableHead className="h-9 px-3 text-right text-detalhe font-medium text-muted-foreground">
                  Qtd
                </TableHead>
                <TableHead className="h-9 px-3 text-right text-detalhe font-medium text-muted-foreground">
                  Custo unit.
                </TableHead>
                <TableHead className="h-9 px-3 text-right text-detalhe font-medium text-muted-foreground">
                  Custo total
                </TableHead>
                <TableHead className="h-9 px-3 text-right text-detalhe font-medium text-muted-foreground">
                  Preço total
                </TableHead>
                {colSpan === 8 ? (
                  <TableHead className="h-9 w-10 px-2" aria-label="Ações" />
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {arvore.length > 0 ? (
                arvore.map((no) => renderNo(no, 0))
              ) : (
                <TableRow className="hover:bg-transparent">
                  <TableCell
                    colSpan={colSpan}
                    className="h-32 text-center text-detalhe text-muted-foreground"
                  >
                    {podeCriar
                      ? 'Orçamento vazio. Use "Adicionar etapa" para começar.'
                      : "Este orçamento ainda não tem itens"}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      {podeCriar || podeEditar ? (
        <OrcamentoItemForm
          aberto={drawerAberto}
          onAbertoChange={setDrawerAberto}
          modo={modo}
        />
      ) : null}

      {podeExcluir ? (
        <ConfirmDialog
          aberto={aExcluir !== null}
          onAbertoChange={(aberto) => {
            if (!aberto) setAExcluir(null);
          }}
          titulo="Excluir item"
          descricao={
            aExcluir
              ? aExcluir.tipo !== "item" && aExcluir.filhos.length > 0
                ? `"${aExcluir.descricao}" e todos os ${aExcluir.filhos.length} subitens serão excluídos. Não dá pra desfazer.`
                : `"${aExcluir.descricao}" será excluído. Não dá pra desfazer.`
              : ""
          }
          textoConfirmar="Excluir"
          variante="destrutivo"
          onConfirmar={aoExcluir}
        />
      ) : null}
    </div>
  );
}
