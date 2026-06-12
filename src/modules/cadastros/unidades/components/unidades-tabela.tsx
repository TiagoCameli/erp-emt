"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { MoreHorizontal, Ruler } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { alternarAtivo, excluir } from "@/modules/cadastros/unidades/actions";
import type { UnidadeLista } from "@/modules/cadastros/unidades/queries";
import { ROTULO_TIPO_UNIDADE } from "@/modules/cadastros/unidades/schemas";

type FiltroStatus = "ativos" | "inativos" | "todos";

/** Opções explícitas do filtro; "todos" é o valor vazio do FiltroSelect. */
const OPCOES_STATUS = [
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "inativos", rotulo: "Inativos" },
];

export interface UnidadesTabelaProps {
  unidades: UnidadeLista[];
  podeEditar: boolean;
  podeExcluir: boolean;
  /** Abre o drawer de edição com a unidade da linha. */
  onEditar: (unidade: UnidadeLista) => void;
}

/**
 * Listagem de unidades de medida com busca por nome, filtro de status
 * e ações por linha: editar, ativar/desativar e excluir (com motivo).
 */
export function UnidadesTabela({
  unidades,
  podeEditar,
  podeExcluir,
  onEditar,
}: UnidadesTabelaProps) {
  const [busca, setBusca] = React.useState("");
  const [status, setStatus] = React.useState<FiltroStatus>("ativos");
  const [excluindo, setExcluindo] = React.useState<UnidadeLista | null>(null);

  const filtradas = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return unidades.filter((unidade) => {
      if (status === "ativos" && !unidade.ativo) return false;
      if (status === "inativos" && unidade.ativo) return false;
      if (termo && !unidade.nome.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [unidades, busca, status]);

  async function aoAlternarAtivo(unidade: UnidadeLista) {
    const resultado = await alternarAtivo(unidade.id, !unidade.ativo);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(unidade.ativo ? "Unidade desativada" : "Unidade reativada");
  }

  async function aoConfirmarExclusao(motivo?: string) {
    if (!excluindo) return;
    const resultado = await excluir(excluindo.id, motivo ?? "");
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success("Unidade excluída");
    setExcluindo(null);
  }

  const colunas = React.useMemo<ColumnDef<UnidadeLista, unknown>[]>(() => {
    const base: ColumnDef<UnidadeLista, unknown>[] = [
      {
        accessorKey: "sigla",
        header: "Sigla",
        cell: ({ row }) => (
          <span className="codigo-doc font-medium">{row.original.sigla}</span>
        ),
      },
      {
        accessorKey: "nome",
        header: "Nome",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.nome}</span>
        ),
      },
      {
        accessorKey: "tipo",
        header: "Tipo",
        cell: ({ row }) => (
          <Badge variant="outline">
            {ROTULO_TIPO_UNIDADE[row.original.tipo]}
          </Badge>
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
      meta: { alinharDireita: true },
      cell: ({ row }) => {
        const unidade = row.original;
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label="Ações da unidade"
              >
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {podeEditar ? (
                <>
                  <DropdownMenuItem onSelect={() => onEditar(unidade)}>
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => {
                      void aoAlternarAtivo(unidade);
                    }}
                  >
                    {unidade.ativo ? "Desativar" : "Reativar"}
                  </DropdownMenuItem>
                </>
              ) : null}
              {podeExcluir ? (
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setExcluindo(unidade)}
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
            icone={Ruler}
            titulo="Nenhuma unidade encontrada"
            descricao="Ajuste os filtros ou cadastre uma nova unidade de medida"
            className="border-none bg-transparent"
          />
        }
      />

      <ConfirmDialog
        aberto={excluindo !== null}
        onAbertoChange={(aberto) => {
          if (!aberto) setExcluindo(null);
        }}
        titulo="Excluir unidade de medida"
        descricao={
          excluindo
            ? `A unidade ${excluindo.sigla} vai para a lixeira. Você pode restaurá-la depois.`
            : ""
        }
        textoConfirmar="Excluir unidade"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={aoConfirmarExclusao}
      />
    </>
  );
}
