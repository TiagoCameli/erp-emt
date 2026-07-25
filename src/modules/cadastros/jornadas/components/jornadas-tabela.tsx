"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Clock4, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import {
  ConfirmDialog,
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
import { resumoHoras } from "@/modules/cadastros/jornadas/formato";
import { removerJornada } from "@/modules/cadastros/jornadas/actions";
import type { JornadaLista } from "@/modules/cadastros/jornadas/queries";

type FiltroStatus = "ativos" | "inativos" | "todos";

/** Opções explícitas do filtro; "todos" é o valor vazio do FiltroSelect. */
const OPCOES_STATUS = [
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "inativos", rotulo: "Inativos" },
];

export interface JornadasTabelaProps {
  jornadas: JornadaLista[];
  podeEditar: boolean;
  podeExcluir: boolean;
  /** Abre o drawer de edição com a jornada da linha. */
  onEditar: (jornada: JornadaLista) => void;
}

/**
 * Listagem de jornadas com busca por nome, filtro de status e ações por
 * linha: editar e excluir (com motivo, via lixeira).
 */
export function JornadasTabela({
  jornadas,
  podeEditar,
  podeExcluir,
  onEditar,
}: JornadasTabelaProps) {
  const [busca, setBusca] = React.useState("");
  const [status, setStatus] = React.useState<FiltroStatus>("ativos");
  const [excluindo, setExcluindo] = React.useState<JornadaLista | null>(null);

  const filtradas = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return jornadas.filter((jornada) => {
      if (status === "ativos" && !jornada.ativo) return false;
      if (status === "inativos" && jornada.ativo) return false;
      if (termo && !jornada.nome.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [jornadas, busca, status]);

  async function aoConfirmarExclusao(motivo?: string) {
    if (!excluindo) return;
    const resultado = await removerJornada(excluindo.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Jornada excluída");
    setExcluindo(null);
  }

  const colunas = React.useMemo<ColumnDef<JornadaLista, unknown>[]>(() => {
    const base: ColumnDef<JornadaLista, unknown>[] = [
      {
        accessorKey: "nome",
        header: "Nome",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.nome}</span>
        ),
      },
      {
        id: "horas",
        header: "Horas",
        cell: ({ row }) => (
          <span className="text-detalhe">{resumoHoras(row.original)}</span>
        ),
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

    if (!podeEditar && !podeExcluir) return base;

    base.push({
      id: "acoes",
      header: "",
      meta: { alinharDireita: true },
      cell: ({ row }) => {
        const jornada = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Ações da jornada"
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {podeEditar ? (
                <DropdownMenuItem onSelect={() => onEditar(jornada)}>
                  Editar
                </DropdownMenuItem>
              ) : null}
              {podeExcluir ? (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setExcluindo(jornada)}
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
            icone={Clock4}
            titulo="Nenhuma jornada encontrada"
            descricao="Ajuste os filtros ou cadastre uma nova jornada"
            className="border-none bg-transparent"
          />
        }
      />

      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setExcluindo(null);
        }}
        titulo="Excluir jornada"
        descricao={
          excluindo
            ? `A jornada ${excluindo.nome} vai para a lixeira. Você pode restaurá-la depois.`
            : ""
        }
        textoConfirmar="Excluir jornada"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={aoConfirmarExclusao}
      />
    </>
  );
}
