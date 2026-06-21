"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { HandCoins, MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  FilterBar,
  FiltroBusca,
  FiltroSelect,
  MoneyText,
  StatusBadge,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatarData } from "@/lib/formatadores";
import { removerAdiantamento } from "@/modules/rh/adiantamentos/actions";
import type { AdiantamentoLista } from "@/modules/rh/adiantamentos/queries";
import type { ColaboradorOpcao } from "@/modules/rh/_shared/queries";
import { AdiantamentoFormDrawer } from "./adiantamento-form-drawer";

export interface AdiantamentosTabelaProps {
  adiantamentos: AdiantamentoLista[];
  colaboradores: ColaboradorOpcao[];
  podeCriar: boolean;
  podeEditar: boolean;
  podeExcluir: boolean;
}

/** Competência (yyyy-MM-01) como MM/AAAA. */
function formatarCompetencia(competencia: string): string {
  const [ano, mes] = competencia.split("-");
  return `${mes}/${ano}`;
}

/** Opções do filtro de competência: cada mês presente na listagem. */
function opcoesCompetencia(adiantamentos: AdiantamentoLista[]) {
  const vistos = new Map<string, string>();
  for (const item of adiantamentos) {
    if (!vistos.has(item.competencia)) {
      vistos.set(item.competencia, formatarCompetencia(item.competencia));
    }
  }
  return [...vistos.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([valor, rotulo]) => ({ valor, rotulo }));
}

/**
 * Listagem de adiantamentos: busca por colaborador, filtro por competência,
 * criação, edição e exclusão no drawer. Editar e excluir só aparecem para
 * adiantamentos em aberto (fora de folha) e com permissão.
 */
export function AdiantamentosTabela({
  adiantamentos,
  colaboradores,
  podeCriar,
  podeEditar,
  podeExcluir,
}: AdiantamentosTabelaProps) {
  const [busca, setBusca] = React.useState("");
  const [competencia, setCompetencia] = React.useState("");

  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [emEdicao, setEmEdicao] = React.useState<AdiantamentoLista | null>(
    null,
  );

  const [confirmarAberto, setConfirmarAberto] = React.useState(false);
  const [aExcluir, setAExcluir] = React.useState<AdiantamentoLista | null>(
    null,
  );

  function abrirNovo() {
    setEmEdicao(null);
    setDrawerAberto(true);
  }

  function abrirEdicao(adiantamento: AdiantamentoLista) {
    setEmEdicao(adiantamento);
    setDrawerAberto(true);
  }

  function pedirExclusao(adiantamento: AdiantamentoLista) {
    setAExcluir(adiantamento);
    setConfirmarAberto(true);
  }

  async function confirmarExclusao() {
    if (!aExcluir) return;
    const resultado = await removerAdiantamento(aExcluir.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Adiantamento excluído");
  }

  const opcoesMes = React.useMemo(
    () => opcoesCompetencia(adiantamentos),
    [adiantamentos],
  );

  const dados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return adiantamentos.filter((item) => {
      if (competencia && item.competencia !== competencia) return false;
      if (termo && !item.colaboradorNome.toLowerCase().includes(termo)) {
        return false;
      }
      return true;
    });
  }, [adiantamentos, busca, competencia]);

  const podeAgir = podeEditar || podeExcluir;

  const colunas = React.useMemo<ColumnDef<AdiantamentoLista, unknown>[]>(() => {
    const base: ColumnDef<AdiantamentoLista, unknown>[] = [
      {
        accessorKey: "colaboradorNome",
        header: "Colaborador",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.colaboradorNome}</span>
        ),
      },
      {
        accessorKey: "competencia",
        header: "Competência",
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatarCompetencia(row.original.competencia)}
          </span>
        ),
      },
      {
        accessorKey: "valor",
        header: "Valor",
        meta: { alinharDireita: true },
        cell: ({ row }) => <MoneyText valor={row.original.valor} />,
      },
      {
        accessorKey: "data",
        header: "Data",
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatarData(row.original.data)}
          </span>
        ),
      },
      {
        accessorKey: "naFolha",
        header: "Situação",
        cell: ({ row }) =>
          row.original.naFolha ? (
            <StatusBadge status="aprovado" rotulo="Na folha" />
          ) : (
            <StatusBadge status="rascunho" rotulo="Em aberto" />
          ),
      },
    ];

    if (!podeAgir) return base;

    base.push({
      id: "acoes",
      header: "",
      meta: { alinharDireita: true },
      cell: ({ row }) => {
        const adiantamento = row.original;
        // Travado na folha: sem ações de editar/excluir.
        if (adiantamento.naFolha) return null;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Ações de ${adiantamento.colaboradorNome}`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {podeEditar ? (
                <DropdownMenuItem onSelect={() => abrirEdicao(adiantamento)}>
                  Editar
                </DropdownMenuItem>
              ) : null}
              {podeExcluir ? (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => pedirExclusao(adiantamento)}
                >
                  Excluir
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    });

    return base;
  }, [podeAgir, podeEditar, podeExcluir]);

  return (
    <>
      <FilterBar>
        <FiltroBusca
          valor={busca}
          onValorChange={setBusca}
          placeholder="Buscar por colaborador"
        />
        <FiltroSelect
          valor={competencia}
          onValorChange={setCompetencia}
          opcoes={opcoesMes}
          placeholder="Competência"
          todosRotulo="Todas as competências"
        />
      </FilterBar>

      <DataTable
        columns={colunas}
        data={dados}
        emptyState={
          <EmptyState
            icone={HandCoins}
            titulo="Nenhum adiantamento encontrado"
            descricao="Registre adiantamentos por colaborador e competência. Eles são descontados na folha gerencial."
            acao={
              podeCriar ? (
                <Button type="button" size="sm" onClick={abrirNovo}>
                  <Plus />
                  Novo adiantamento
                </Button>
              ) : undefined
            }
          />
        }
      />

      {podeEditar || podeCriar ? (
        <AdiantamentoFormDrawer
          aberto={drawerAberto}
          onAbertoChange={setDrawerAberto}
          colaboradores={colaboradores}
          adiantamento={emEdicao}
        />
      ) : null}

      {podeExcluir ? (
        <ConfirmDialog
          aberto={confirmarAberto}
          onAbertoChange={setConfirmarAberto}
          titulo="Excluir adiantamento"
          descricao={
            aExcluir
              ? `Excluir o adiantamento de ${aExcluir.colaboradorNome}? Essa ação não pode ser desfeita.`
              : ""
          }
          textoConfirmar="Excluir"
          variante="destrutivo"
          onConfirmar={confirmarExclusao}
        />
      ) : null}
    </>
  );
}
