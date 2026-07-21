"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Building2, MoreHorizontal } from "lucide-react";
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
import { formatarQuantidade } from "@/lib/formatadores";
import { alternarAtivo } from "@/modules/cadastros/obras/actions";
import type { ClienteOpcao, ObraLista } from "@/modules/cadastros/obras/queries";
import { STATUS_OBRA_CONFIG } from "@/modules/cadastros/obras/schemas";
import { ObrasFormDrawer } from "./obras-form-drawer";

const OPCOES_STATUS = [
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "inativos", rotulo: "Inativos" },
];

/** Texto "Rodovia / Lote" quando há os dois, senão o que existir. */
function rodoviaLote(obra: ObraLista): string {
  const partes = [obra.rodovia, obra.lote ? `Lote ${obra.lote}` : null].filter(
    Boolean,
  );
  return partes.length > 0 ? partes.join(" • ") : "-";
}

const colunas: ColumnDef<ObraLista, unknown>[] = [
  {
    accessorKey: "nome",
    header: "Nome",
    cell: ({ row }) => <span className="font-medium">{row.original.nome}</span>,
  },
  {
    accessorKey: "numeroContrato",
    header: "Contrato",
    cell: ({ row }) =>
      row.original.numeroContrato ? (
        <span className="codigo-doc">{row.original.numeroContrato}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },
  {
    id: "rodoviaLote",
    header: "Rodovia / Lote",
    cell: ({ row }) => rodoviaLote(row.original),
  },
  {
    id: "extensao",
    header: "Extensão",
    meta: { alinharDireita: true },
    cell: ({ row }) =>
      row.original.extensaoKm !== null ? (
        <span className="tabular-nums">
          {formatarQuantidade(row.original.extensaoKm)} km
        </span>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const config = STATUS_OBRA_CONFIG[row.original.status];
      return (
        <StatusBadge
          status={row.original.status}
          rotulo={config.rotulo}
          className={config.classes}
        />
      );
    },
  },
  {
    accessorKey: "ativo",
    header: "Ativo",
    cell: ({ row }) =>
      row.original.ativo ? (
        <StatusBadge status="aprovado" rotulo="Ativo" />
      ) : (
        <StatusBadge status="rascunho" rotulo="Inativo" />
      ),
  },
];

export interface ObrasTabelaProps {
  obras: ObraLista[];
  clientes: ClienteOpcao[];
  podeEditar: boolean;
}

/**
 * Listagem de obras. Clicar numa linha abre o drawer de edição
 * quando o usuário tem permissão de editar.
 */
export function ObrasTabela({ obras, clientes, podeEditar }: ObrasTabelaProps) {
  const [selecionadaId, setSelecionadaId] = React.useState<string | null>(null);
  const [aberto, setAberto] = React.useState(false);
  const [busca, setBusca] = React.useState("");
  const [status, setStatus] = React.useState("ativos");

  // Deriva da prop pra refletir edições depois do revalidatePath.
  const obraSelecionada =
    obras.find((obra) => obra.id === selecionadaId) ?? null;

  const dados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return obras.filter((obra) => {
      if (status === "ativos" && !obra.ativo) return false;
      if (status === "inativos" && obra.ativo) return false;
      if (termo && !obra.nome.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [obras, busca, status]);

  const abrirEdicao = React.useCallback(
    (obra: ObraLista) => {
      if (!podeEditar) return;
      setSelecionadaId(obra.id);
      setAberto(true);
    },
    [podeEditar],
  );

  const alternar = React.useCallback(async (obra: ObraLista) => {
    const resultado = await alternarAtivo(obra.id, !obra.ativo);
    if ("erro" in resultado) {
      toast.error(resultado.erro);
      return;
    }
    toast.success(obra.ativo ? "Obra desativada" : "Obra reativada");
  }, []);

  // Coluna de ações (menu ⋮) só quando o usuário pode editar. Reaproveita as
  // colunas base e acrescenta Editar + Desativar/Reativar, no padrão dos
  // outros cadastros. O clique na linha continua abrindo a edição.
  const colunasComAcoes = React.useMemo<ColumnDef<ObraLista, unknown>[]>(() => {
    if (!podeEditar) return colunas;
    return [
      ...colunas,
      {
        id: "acoes",
        header: "",
        meta: { alinharDireita: true },
        cell: ({ row }) => {
          const obra = row.original;
          return (
            <div
              className="flex justify-end"
              onClick={(evento) => evento.stopPropagation()}
            >
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Ações da obra"
                  >
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => abrirEdicao(obra)}>
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void alternar(obra)}>
                    {obra.ativo ? "Desativar" : "Reativar"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ];
  }, [podeEditar, abrirEdicao, alternar]);

  return (
    <div className="flex flex-col gap-2">
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
        columns={colunasComAcoes}
        data={dados}
        onRowClick={podeEditar ? abrirEdicao : undefined}
        emptyState={
          <EmptyState
            icone={Building2}
            titulo="Nenhuma obra cadastrada"
            descricao="Cadastre a primeira obra para começar"
            className="border-none bg-transparent"
          />
        }
      />

      <ObrasFormDrawer
        key={obraSelecionada?.id ?? "nenhuma"}
        aberto={aberto}
        onAbertoChange={setAberto}
        obra={obraSelecionada}
        clientes={clientes}
      />
    </div>
  );
}
