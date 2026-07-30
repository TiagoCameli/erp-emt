"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Percent, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import {
  ConfirmDialog,
  DataTable,
  EmptyState,
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
import { formatarPercentual } from "@/lib/formatadores";
import { removerEncargo } from "@/modules/rh/encargos/actions";
import type { EncargoLista } from "@/modules/rh/encargos/queries";

type FiltroStatus = "ativos" | "inativos" | "todos";

/** Opções explícitas do filtro; "todos" é o valor vazio do FiltroSelect. */
const OPCOES_STATUS = [
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "inativos", rotulo: "Inativos" },
];

export interface EncargosTabelaProps {
  encargos: EncargoLista[];
  podeEditar: boolean;
  podeExcluir: boolean;
  /** Abre o drawer de edição com o encargo da linha. */
  onEditar: (encargo: EncargoLista) => void;
}

/**
 * Listagem de encargos da folha com busca por nome, filtro de status e ações
 * por linha: editar e excluir (com motivo, via lixeira).
 */
export function EncargosTabela({
  encargos,
  podeEditar,
  podeExcluir,
  onEditar,
}: EncargosTabelaProps) {
  const [busca, setBusca] = React.useState("");
  const [status, setStatus] = React.useState<FiltroStatus>("ativos");
  const [excluindo, setExcluindo] = React.useState<EncargoLista | null>(null);

  const filtrados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return encargos.filter((encargo) => {
      if (status === "ativos" && !encargo.ativo) return false;
      if (status === "inativos" && encargo.ativo) return false;
      if (termo && !encargo.nome.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [encargos, busca, status]);

  async function aoConfirmarExclusao(motivo?: string) {
    if (!excluindo) return;
    const resultado = await removerEncargo(excluindo.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Encargo excluído");
    setExcluindo(null);
  }

  const colunas = React.useMemo<ColumnDef<EncargoLista, unknown>[]>(() => {
    const base: ColumnDef<EncargoLista, unknown>[] = [
      {
        accessorKey: "nome",
        header: "Nome",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.nome}</span>
        ),
      },
      {
        accessorKey: "percentual",
        header: "Percentual",
        meta: { alinharDireita: true },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatarPercentual(row.original.percentual, 3)}
          </span>
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

    if (!podeEditar && !podeExcluir) return base;

    base.push({
      id: "acoes",
      header: "",
      meta: { alinharDireita: true, fixa: true, rotulo: "Ações" },
      cell: ({ row }) => {
        const encargo = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Ações do encargo"
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {podeEditar ? (
                <DropdownMenuItem onSelect={() => onEditar(encargo)}>
                  Editar
                </DropdownMenuItem>
              ) : null}
              {podeExcluir ? (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setExcluindo(encargo)}
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
      <DataTable
        idTabela="rh.encargos"
        columns={colunas}
        data={filtrados}
        filtros={[
          {
            id: "busca",
            rotulo: "Busca por nome",
            fixo: true,
            elemento: (
              <FiltroBusca
                valor={busca}
                onValorChange={setBusca}
                placeholder="Buscar por nome"
              />
            ),
          },
          {
            id: "status",
            rotulo: "Status",
            temValor: status !== "ativos",
            onLimpar: () => setStatus("ativos"),
            elemento: (
              <FiltroSelect
                valor={status === "todos" ? "" : status}
                onValorChange={(valor) =>
                  setStatus(valor === "" ? "todos" : (valor as FiltroStatus))
                }
                opcoes={OPCOES_STATUS}
                placeholder="Status"
                todosRotulo="Todos"
              />
            ),
          },
        ]}
        emptyState={
          <EmptyState
            icone={Percent}
            titulo="Nenhum encargo encontrado"
            descricao="Ajuste os filtros ou cadastre um novo encargo"
            className="border-none bg-transparent"
          />
        }
      />

      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setExcluindo(null);
        }}
        titulo="Excluir encargo"
        descricao={
          excluindo
            ? `O encargo ${excluindo.nome} vai para a lixeira. Você pode restaurá-lo depois.`
            : ""
        }
        textoConfirmar="Excluir encargo"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={aoConfirmarExclusao}
      />
    </>
  );
}
