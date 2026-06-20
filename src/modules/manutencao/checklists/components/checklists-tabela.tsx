"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ClipboardList, MoreHorizontal, Plus } from "lucide-react";
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
import { alternarAtivoChecklist } from "@/modules/manutencao/checklists/actions";
import type { ChecklistModelo } from "@/modules/manutencao/checklists/queries";
import { ChecklistFormDrawer } from "./checklist-form-drawer";

const OPCOES_STATUS = [
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "inativos", rotulo: "Inativos" },
];

export interface ChecklistsTabelaProps {
  modelos: ChecklistModelo[];
  podeEditar: boolean;
}

/**
 * Listagem dos modelos de checklist: busca por nome, filtro por status,
 * criação e edição no drawer e ativar/desativar. Sem permissão de editar, a
 * tabela é só leitura (sem coluna de ações nem botão de criar).
 */
export function ChecklistsTabela({
  modelos,
  podeEditar,
}: ChecklistsTabelaProps) {
  const [busca, setBusca] = React.useState("");
  const [status, setStatus] = React.useState("ativos");

  const [drawerAberto, setDrawerAberto] = React.useState(false);
  const [emEdicao, setEmEdicao] = React.useState<ChecklistModelo | null>(null);

  function abrirNovo() {
    setEmEdicao(null);
    setDrawerAberto(true);
  }

  function abrirEdicao(modelo: ChecklistModelo) {
    setEmEdicao(modelo);
    setDrawerAberto(true);
  }

  async function aoAlternarAtivo(modelo: ChecklistModelo) {
    const resultado = await alternarAtivoChecklist(modelo.id, !modelo.ativo);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(modelo.ativo ? "Checklist desativado" : "Checklist ativado");
  }

  const dados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return modelos.filter((modelo) => {
      if (status === "ativos" && !modelo.ativo) return false;
      if (status === "inativos" && modelo.ativo) return false;
      if (termo && !modelo.nome.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [modelos, busca, status]);

  const colunas = React.useMemo<ColumnDef<ChecklistModelo, unknown>[]>(() => {
    const base: ColumnDef<ChecklistModelo, unknown>[] = [
      {
        accessorKey: "nome",
        header: "Nome",
        cell: ({ row }) => (
          <div className="min-w-0">
            <span className="font-medium">{row.original.nome}</span>
            {row.original.descricao ? (
              <p className="text-legenda text-muted-foreground truncate">
                {row.original.descricao}
              </p>
            ) : null}
          </div>
        ),
      },
      {
        accessorKey: "perguntas",
        header: "Perguntas",
        meta: { alinharDireita: true },
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.perguntas.length}</span>
        ),
      },
      {
        accessorKey: "execucoes",
        header: "Execuções",
        meta: { alinharDireita: true },
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.execucoes}</span>
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
        const modelo = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Ações de ${modelo.nome}`}
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => abrirEdicao(modelo)}>
                Editar
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => aoAlternarAtivo(modelo)}>
                {modelo.ativo ? "Desativar" : "Ativar"}
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
          placeholder="Buscar por nome"
        />
        <FiltroSelect
          valor={status === "todos" ? "" : status}
          onValorChange={(valor) => setStatus(valor === "" ? "todos" : valor)}
          opcoes={OPCOES_STATUS}
          placeholder="Status"
          todosRotulo="Todos"
        />
      </FilterBar>

      <DataTable
        columns={colunas}
        data={dados}
        emptyState={
          <EmptyState
            icone={ClipboardList}
            titulo="Nenhum checklist"
            descricao="Crie um modelo de checklist para inspecionar os equipamentos antes do uso."
            acao={
              podeEditar ? (
                <Button type="button" size="sm" onClick={abrirNovo}>
                  <Plus />
                  Novo checklist
                </Button>
              ) : undefined
            }
          />
        }
      />

      {podeEditar ? (
        <ChecklistFormDrawer
          aberto={drawerAberto}
          onAbertoChange={setDrawerAberto}
          modelo={emEdicao}
        />
      ) : null}
    </>
  );
}
