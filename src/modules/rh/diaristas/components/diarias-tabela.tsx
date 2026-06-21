"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarClock, MoreHorizontal, Plus } from "lucide-react";
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
import { removerDiaria } from "@/modules/rh/diaristas/actions";
import type { DiariaLista } from "@/modules/rh/diaristas/queries";
import { formatarCompetencia } from "@/modules/rh/diaristas/schemas";
import type {
  DiaristaOpcao,
  ObraOpcao,
} from "@/modules/rh/_shared/queries";
import { DiariaFormDrawer } from "./diaria-form-drawer";

export interface DiariasTabelaProps {
  diarias: DiariaLista[];
  diaristas: DiaristaOpcao[];
  obras: ObraOpcao[];
  podeCriar: boolean;
  podeEditar: boolean;
}

/** Opções do filtro de competência: cada mês presente na listagem. */
function opcoesCompetencia(diarias: DiariaLista[]) {
  const vistos = new Map<string, string>();
  for (const item of diarias) {
    if (!vistos.has(item.competencia)) {
      vistos.set(item.competencia, formatarCompetencia(item.competencia));
    }
  }
  return [...vistos.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([valor, rotulo]) => ({ valor, rotulo }));
}

/**
 * Listagem de diárias: busca por diarista, filtro por competência, registro,
 * edição e exclusão no drawer. Editar e excluir só aparecem para diárias em
 * aberto (não fechadas) e com permissão de editar.
 */
export function DiariasTabela({
  diarias,
  diaristas,
  obras,
  podeCriar,
  podeEditar,
}: DiariasTabelaProps) {
  const [busca, setBusca] = React.useState("");
  const [competencia, setCompetencia] = React.useState("");

  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [emEdicao, setEmEdicao] = React.useState<DiariaLista | null>(null);

  const [confirmarAberto, setConfirmarAberto] = React.useState(false);
  const [aExcluir, setAExcluir] = React.useState<DiariaLista | null>(null);

  function abrirNovo() {
    setEmEdicao(null);
    setDrawerAberto(true);
  }

  function abrirEdicao(diaria: DiariaLista) {
    setEmEdicao(diaria);
    setDrawerAberto(true);
  }

  function pedirExclusao(diaria: DiariaLista) {
    setAExcluir(diaria);
    setConfirmarAberto(true);
  }

  async function confirmarExclusao() {
    if (!aExcluir) return;
    const resultado = await removerDiaria(aExcluir.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Diária excluída");
  }

  const opcoesMes = React.useMemo(
    () => opcoesCompetencia(diarias),
    [diarias],
  );

  const dados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return diarias.filter((item) => {
      if (competencia && item.competencia !== competencia) return false;
      if (termo && !item.colaboradorNome.toLowerCase().includes(termo)) {
        return false;
      }
      return true;
    });
  }, [diarias, busca, competencia]);

  const colunas = React.useMemo<ColumnDef<DiariaLista, unknown>[]>(() => {
    const base: ColumnDef<DiariaLista, unknown>[] = [
      {
        accessorKey: "colaboradorNome",
        header: "Colaborador",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.colaboradorNome}</span>
        ),
      },
      {
        accessorKey: "obraNome",
        header: "Obra",
        cell: ({ row }) => {
          const { obraNome, obraLote } = row.original;
          if (!obraNome) {
            return <span className="text-muted-foreground">Sem obra</span>;
          }
          return (
            <span>
              {obraNome}
              {obraLote ? ` - Lote ${obraLote}` : ""}
            </span>
          );
        },
      },
      {
        accessorKey: "data",
        header: "Data",
        cell: ({ row }) => (
          <span className="tabular-nums">{formatarData(row.original.data)}</span>
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
        accessorKey: "fechada",
        header: "Situação",
        cell: ({ row }) =>
          row.original.fechada ? (
            <StatusBadge status="pago" rotulo="Paga" />
          ) : (
            <StatusBadge status="rascunho" rotulo="Em aberto" />
          ),
      },
    ];

    if (!podeEditar) return base;

    base.push({
      id: "acoes",
      header: "",
      meta: { alinharDireita: true },
      cell: ({ row }) => {
        const diaria = row.original;
        // Travada quando fechada/paga: sem ações de editar/excluir.
        if (diaria.fechada) return null;

        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Ações de ${diaria.colaboradorNome}`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => abrirEdicao(diaria)}>
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => pedirExclusao(diaria)}
              >
                Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    });

    return base;
  }, [podeEditar]);

  return (
    <>
      <FilterBar>
        <FiltroBusca
          valor={busca}
          onValorChange={setBusca}
          placeholder="Buscar por diarista"
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
            icone={CalendarClock}
            titulo="Nenhuma diária encontrada"
            descricao="Registre as diárias por diarista. No fechamento da competência elas viram um lançamento a pagar."
            acao={
              podeCriar ? (
                <Button type="button" size="sm" onClick={abrirNovo}>
                  <Plus />
                  Nova diária
                </Button>
              ) : undefined
            }
          />
        }
      />

      {podeEditar || podeCriar ? (
        <DiariaFormDrawer
          aberto={drawerAberto}
          onAbertoChange={setDrawerAberto}
          diaristas={diaristas}
          obras={obras}
          diaria={emEdicao}
        />
      ) : null}

      {podeEditar ? (
        <ConfirmDialog
          aberto={confirmarAberto}
          onAbertoChange={setConfirmarAberto}
          titulo="Excluir diária"
          descricao={
            aExcluir
              ? `Excluir a diária de ${aExcluir.colaboradorNome} de ${formatarData(
                  aExcluir.data,
                )}? Essa ação não pode ser desfeita.`
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
