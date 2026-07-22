"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { CalendarClock, MoreHorizontal, Plus } from "lucide-react";
import { toast } from "sonner";

import {
  DataTable,
  EmptyState,
  FilterBar,
  FiltroBusca,
  FiltroSelect,
  StatusBadge,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { desativarCondicao } from "@/modules/cadastros/condicoes-pagamento/actions";
import type { CondicaoLista } from "@/modules/cadastros/condicoes-pagamento/queries";
import { CondicaoFormDrawer } from "./condicao-form-drawer";

type FiltroStatus = "ativos" | "inativos" | "todos";

const OPCOES_STATUS = [
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "inativos", rotulo: "Inativos" },
];

export interface CondicoesTabelaProps {
  condicoes: CondicaoLista[];
  podeCriar: boolean;
  podeEditar: boolean;
}

/**
 * Listagem de condições de pagamento: busca por descrição, filtro de status
 * e ações por linha (editar, desativar). "Desativar" é reversível: some das
 * opções de novos lançamentos, mas a condição continua no histórico e pode
 * voltar a ficar ativa editando o registro.
 */
export function CondicoesTabela({
  condicoes,
  podeCriar,
  podeEditar,
}: CondicoesTabelaProps) {
  const [busca, setBusca] = React.useState("");
  const [status, setStatus] = React.useState<FiltroStatus>("ativos");

  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [emEdicao, setEmEdicao] = React.useState<CondicaoLista | null>(null);

  function abrirNova() {
    setEmEdicao(null);
    setDrawerAberto(true);
  }

  function abrirEdicao(condicao: CondicaoLista) {
    setEmEdicao(condicao);
    setDrawerAberto(true);
  }

  async function aoDesativar(condicao: CondicaoLista) {
    const resultado = await desativarCondicao(condicao.id);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Condição de pagamento desativada");
  }

  const filtradas = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return condicoes.filter((condicao) => {
      if (status === "ativos" && !condicao.ativo) return false;
      if (status === "inativos" && condicao.ativo) return false;
      if (termo && !condicao.descricao.toLowerCase().includes(termo)) {
        return false;
      }
      return true;
    });
  }, [condicoes, busca, status]);

  const colunas = React.useMemo<ColumnDef<CondicaoLista, unknown>[]>(() => {
    const base: ColumnDef<CondicaoLista, unknown>[] = [
      {
        accessorKey: "descricao",
        header: "Descrição",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.descricao}</span>
        ),
      },
      {
        accessorKey: "resumoParcelas",
        header: "Parcelas",
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.resumoParcelas}</span>
        ),
      },
      {
        accessorKey: "qtdParcelas",
        header: "Nº parcelas",
        meta: { alinharDireita: true },
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.qtdParcelas}</span>
        ),
      },
      {
        accessorKey: "ativo",
        header: "Status",
        cell: ({ row }) =>
          row.original.ativo ? (
            <StatusBadge status="aprovado" rotulo="Ativo" />
          ) : (
            <StatusBadge status="rascunho" rotulo="Inativo" />
          ),
      },
    ];

    if (!podeEditar) return base;

    base.push({
      id: "acoes",
      header: "",
      meta: { alinharDireita: true },
      cell: ({ row }) => {
        const condicao = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Ações da condição de pagamento"
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => abrirEdicao(condicao)}>
                Editar
              </DropdownMenuItem>
              {condicao.ativo ? (
                <DropdownMenuItem
                  onSelect={() => {
                    void aoDesativar(condicao);
                  }}
                >
                  Desativar
                </DropdownMenuItem>
              ) : null}
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
          placeholder="Buscar por descrição"
        />
        <FiltroSelect
          valor={status === "todos" ? "" : status}
          onValorChange={(valor) =>
            setStatus(valor === "" ? "todos" : (valor as FiltroStatus))
          }
          opcoes={OPCOES_STATUS}
          placeholder="Status"
          todosRotulo="Todos"
        />
        {podeCriar ? (
          <Button type="button" size="sm" className="ml-auto" onClick={abrirNova}>
            <Plus />
            Nova condição
          </Button>
        ) : null}
      </FilterBar>

      <DataTable
        columns={colunas}
        data={filtradas}
        emptyState={
          <EmptyState
            icone={CalendarClock}
            titulo="Nenhuma condição de pagamento encontrada"
            descricao="Ajuste os filtros ou cadastre uma nova condição de pagamento"
            className="border-none bg-transparent"
            acao={
              podeCriar ? (
                <Button type="button" size="sm" onClick={abrirNova}>
                  <Plus />
                  Nova condição
                </Button>
              ) : undefined
            }
          />
        }
      />

      {podeCriar || podeEditar ? (
        <CondicaoFormDrawer
          key={emEdicao?.id ?? "nova"}
          aberto={drawerAberto}
          onAbertoChange={setDrawerAberto}
          condicao={emEdicao}
        />
      ) : null}
    </>
  );
}
