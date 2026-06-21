"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { FileSpreadsheet, MoreHorizontal } from "lucide-react";

import {
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
import type { ObraOpcao } from "@/modules/medicao/_shared/queries";
import type { PlanilhaLista } from "@/modules/medicao/planilha-contratual/queries";
import { PlanilhaFormDrawer } from "./planilha-form-drawer";

const OPCOES_STATUS = [
  { valor: "ativos", rotulo: "Ativas" },
  { valor: "inativos", rotulo: "Inativas" },
];

export interface PlanilhasTabelaProps {
  planilhas: PlanilhaLista[];
  obras: ObraOpcao[];
  podeCriar: boolean;
  podeEditar: boolean;
}

/** Monta o rótulo da obra com o lote, quando houver. */
function rotuloObra(nome: string, lote: string | null): string {
  return lote ? `${nome} (Lote ${lote})` : nome;
}

/**
 * Lista de planilhas contratuais, uma por obra. Abrir uma navega para a
 * tela dos itens via ?planilha=id. Edição do cabeçalho parte do menu da linha.
 */
export function PlanilhasTabela({
  planilhas,
  obras,
  podeCriar,
  podeEditar,
}: PlanilhasTabelaProps) {
  const router = useRouter();

  const [busca, setBusca] = React.useState("");
  const [status, setStatus] = React.useState("ativos");

  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [emEdicao, setEmEdicao] = React.useState<PlanilhaLista | null>(null);

  function abrir(planilha: PlanilhaLista) {
    router.push(`/medicao/planilha-contratual?planilha=${planilha.id}`);
  }

  function abrirEdicao(planilha: PlanilhaLista) {
    setEmEdicao(planilha);
    setDrawerAberto(true);
  }

  const filtradas = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return planilhas.filter((planilha) => {
      if (status === "ativos" && !planilha.ativo) return false;
      if (status === "inativos" && planilha.ativo) return false;
      if (!termo) return true;
      return (
        planilha.nome.toLowerCase().includes(termo) ||
        planilha.obraNome.toLowerCase().includes(termo)
      );
    });
  }, [planilhas, busca, status]);

  const colunas = React.useMemo<ColumnDef<PlanilhaLista, unknown>[]>(() => {
    const base: ColumnDef<PlanilhaLista, unknown>[] = [
      {
        accessorKey: "nome",
        header: "Planilha",
        cell: ({ row }) => (
          <button
            type="button"
            className="font-medium text-primary hover:underline"
            onClick={() => abrir(row.original)}
          >
            {row.original.nome}
          </button>
        ),
      },
      {
        accessorKey: "obraNome",
        header: "Obra",
        cell: ({ row }) =>
          rotuloObra(row.original.obraNome, row.original.obraLote),
      },
      {
        accessorKey: "totalItens",
        header: "Itens",
        meta: { alinharDireita: true },
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.totalItens}</span>
        ),
      },
      {
        accessorKey: "valorContratual",
        header: "Valor contratual",
        meta: { alinharDireita: true },
        cell: ({ row }) => <MoneyText valor={row.original.valorContratual} />,
      },
      {
        accessorKey: "ativo",
        header: "Status",
        cell: ({ row }) =>
          row.original.ativo ? (
            <StatusBadge status="aprovado" rotulo="Ativa" />
          ) : (
            <StatusBadge status="rascunho" rotulo="Inativa" />
          ),
      },
    ];

    base.push({
      id: "acoes",
      header: "",
      meta: { alinharDireita: true },
      cell: ({ row }) => {
        const planilha = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Ações de ${planilha.nome}`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => abrir(planilha)}>
                Abrir itens
              </DropdownMenuItem>
              {podeEditar ? (
                <DropdownMenuItem onSelect={() => abrirEdicao(planilha)}>
                  Editar planilha
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
          placeholder="Buscar por planilha ou obra"
        />
        <FiltroSelect
          valor={status === "todos" ? "" : status}
          onValorChange={(valor) => setStatus(valor === "" ? "todos" : valor)}
          opcoes={OPCOES_STATUS}
          placeholder="Status"
          todosRotulo="Todas"
        />
      </FilterBar>

      <DataTable
        columns={colunas}
        data={filtradas}
        emptyState={
          <EmptyState
            icone={FileSpreadsheet}
            titulo="Nenhuma planilha contratual"
            descricao={
              podeCriar
                ? "Crie a planilha contratual de uma obra para lançar os itens contratados."
                : "Nenhuma planilha para mostrar com os filtros atuais."
            }
            className="border-none bg-transparent"
          />
        }
      />

      {podeEditar ? (
        <PlanilhaFormDrawer
          aberto={drawerAberto}
          onAbertoChange={setDrawerAberto}
          planilha={
            emEdicao
              ? {
                  id: emEdicao.id,
                  nome: emEdicao.nome,
                  observacao: emEdicao.observacao,
                  ativo: emEdicao.ativo,
                  obraId: emEdicao.obraId,
                  obraNome: emEdicao.obraNome,
                  obraLote: emEdicao.obraLote,
                }
              : null
          }
          obras={obras}
        />
      ) : null}
    </>
  );
}
