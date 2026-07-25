"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Briefcase, MoreHorizontal } from "lucide-react";
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
import { removerFuncao } from "@/modules/cadastros/funcoes/actions";
import type { FuncaoLista } from "@/modules/cadastros/funcoes/queries";

type FiltroStatus = "ativos" | "inativos" | "todos";

/** Opções explícitas do filtro; "todos" é o valor vazio do FiltroSelect. */
const OPCOES_STATUS = [
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "inativos", rotulo: "Inativos" },
];

export interface FuncoesTabelaProps {
  funcoes: FuncaoLista[];
  podeEditar: boolean;
  podeExcluir: boolean;
  /** Abre o drawer de edição com a função da linha. */
  onEditar: (funcao: FuncaoLista) => void;
}

/**
 * Listagem de funções com busca por nome, filtro de status e ações por
 * linha: editar e excluir (com motivo, via lixeira).
 */
export function FuncoesTabela({
  funcoes,
  podeEditar,
  podeExcluir,
  onEditar,
}: FuncoesTabelaProps) {
  const [busca, setBusca] = React.useState("");
  const [status, setStatus] = React.useState<FiltroStatus>("ativos");
  const [excluindo, setExcluindo] = React.useState<FuncaoLista | null>(null);

  const filtradas = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return funcoes.filter((funcao) => {
      if (status === "ativos" && !funcao.ativo) return false;
      if (status === "inativos" && funcao.ativo) return false;
      if (termo && !funcao.nome.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [funcoes, busca, status]);

  async function aoConfirmarExclusao(motivo?: string) {
    if (!excluindo) return;
    const resultado = await removerFuncao(excluindo.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Função excluída");
    setExcluindo(null);
  }

  const colunas = React.useMemo<ColumnDef<FuncaoLista, unknown>[]>(() => {
    const base: ColumnDef<FuncaoLista, unknown>[] = [
      {
        accessorKey: "nome",
        header: "Nome",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.nome}</span>
        ),
      },
      {
        accessorKey: "salarioBase",
        header: "Salário base",
        meta: { alinharDireita: true },
        cell: ({ row }) =>
          row.original.salarioBase !== null ? (
            <MoneyText valor={row.original.salarioBase} />
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        accessorKey: "cbo",
        header: "CBO",
        cell: ({ row }) => row.original.cbo ?? "-",
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

    if (!podeEditar && !podeExcluir) return base;

    base.push({
      id: "acoes",
      header: "",
      meta: { alinharDireita: true },
      cell: ({ row }) => {
        const funcao = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Ações da função"
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {podeEditar ? (
                <DropdownMenuItem onSelect={() => onEditar(funcao)}>
                  Editar
                </DropdownMenuItem>
              ) : null}
              {podeExcluir ? (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setExcluindo(funcao)}
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
  }, [podeEditar, podeExcluir, onEditar]);

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
      </FilterBar>

      <DataTable
        columns={colunas}
        data={filtradas}
        emptyState={
          <EmptyState
            icone={Briefcase}
            titulo="Nenhuma função encontrada"
            descricao="Ajuste os filtros ou cadastre uma nova função"
            className="border-none bg-transparent"
          />
        }
      />

      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setExcluindo(null);
        }}
        titulo="Excluir função"
        descricao={
          excluindo
            ? `A função ${excluindo.nome} vai para a lixeira. Você pode restaurá-la depois.`
            : ""
        }
        textoConfirmar="Excluir função"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={aoConfirmarExclusao}
      />
    </>
  );
}
