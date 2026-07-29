"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Plus, Wallet } from "lucide-react";

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
import {
  CAMINHO_DO_PAGAMENTO,
  ROTULO_TIPO_FORMA,
} from "@/modules/_shared/forma-pagamento";
import type { FormaLista } from "@/modules/cadastros/formas-pagamento/queries";
import { FormaFormDrawer } from "./forma-form-drawer";

type FiltroStatus = "ativos" | "inativos" | "todos";

const OPCOES_STATUS = [
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "inativos", rotulo: "Inativos" },
];

export interface FormasTabelaProps {
  formas: FormaLista[];
  podeCriar: boolean;
  podeEditar: boolean;
}

/**
 * Listagem das formas de pagamento com o TIPO em destaque, porque é o tipo que
 * decide o caminho do pagamento: bancário e cheque passam pela aprovação,
 * dinheiro vai direto para Pagamentos e cartão de crédito nasce quitado.
 *
 * Não tem excluir: forma usada em OC ou lançamento fica no histórico. O que
 * existe é desativar, que só a tira das opções de novos documentos.
 */
export function FormasTabela({
  formas,
  podeCriar,
  podeEditar,
}: FormasTabelaProps) {
  const [busca, setBusca] = React.useState("");
  const [status, setStatus] = React.useState<FiltroStatus>("ativos");

  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [emEdicao, setEmEdicao] = React.useState<FormaLista | null>(null);

  function abrirNova() {
    setEmEdicao(null);
    setDrawerAberto(true);
  }

  function abrirEdicao(forma: FormaLista) {
    setEmEdicao(forma);
    setDrawerAberto(true);
  }

  const filtradas = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return formas.filter((forma) => {
      if (status === "ativos" && !forma.ativo) return false;
      if (status === "inativos" && forma.ativo) return false;
      if (termo && !forma.nome.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [formas, busca, status]);

  const colunas = React.useMemo<ColumnDef<FormaLista, unknown>[]>(() => {
    const base: ColumnDef<FormaLista, unknown>[] = [
      {
        accessorKey: "nome",
        header: "Forma",
        size: 220,
        cell: ({ row }) => (
          <span className="font-medium">{row.original.nome}</span>
        ),
      },
      {
        accessorKey: "tipo",
        header: "Tipo",
        size: 170,
        meta: { naoTruncar: true },
        cell: ({ row }) => (
          <span>{ROTULO_TIPO_FORMA[row.original.tipo]}</span>
        ),
      },
      {
        id: "caminho",
        header: "O que acontece no pagamento",
        size: 380,
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {CAMINHO_DO_PAGAMENTO[row.original.tipo]}
          </span>
        ),
      },
      {
        accessorKey: "usoEmOrdens",
        header: "Em ordens",
        size: 110,
        meta: { alinharDireita: true },
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.usoEmOrdens}</span>
        ),
      },
      {
        accessorKey: "ativo",
        header: "Status",
        size: 110,
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
      size: 60,
      meta: { alinharDireita: true },
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Ações da forma de pagamento"
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => abrirEdicao(row.original)}>
              Editar
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    });

    return base;
  }, [podeEditar]);

  return (
    <>
      <FilterBar>
        <FiltroBusca
          valor={busca}
          onValorChange={setBusca}
          placeholder="Buscar por nome"
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
          <Button
            type="button"
            size="sm"
            className="ml-auto"
            onClick={abrirNova}
          >
            <Plus />
            Nova forma
          </Button>
        ) : null}
      </FilterBar>

      <DataTable
        columns={colunas}
        data={filtradas}
        emptyState={
          <EmptyState
            icone={Wallet}
            titulo="Nenhuma forma de pagamento encontrada"
            descricao="Ajuste os filtros ou cadastre uma nova forma de pagamento"
            className="border-none bg-transparent"
            acao={
              podeCriar ? (
                <Button type="button" size="sm" onClick={abrirNova}>
                  <Plus />
                  Nova forma
                </Button>
              ) : undefined
            }
          />
        }
      />

      {podeCriar || podeEditar ? (
        <FormaFormDrawer
          key={emEdicao?.id ?? "nova"}
          aberto={drawerAberto}
          onAbertoChange={setDrawerAberto}
          forma={emEdicao}
        />
      ) : null}
    </>
  );
}
