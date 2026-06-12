"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Building2 } from "lucide-react";

import { DataTable, EmptyState, StatusBadge } from "@/components/canonicos";
import { formatarQuantidade } from "@/lib/formatadores";
import type { ClienteOpcao, ObraLista } from "@/modules/cadastros/obras/queries";
import { STATUS_OBRA_CONFIG } from "@/modules/cadastros/obras/schemas";
import { ObrasFormDrawer } from "./obras-form-drawer";

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

  // Deriva da prop pra refletir edições depois do revalidatePath.
  const obraSelecionada =
    obras.find((obra) => obra.id === selecionadaId) ?? null;

  function abrirEdicao(obra: ObraLista) {
    if (!podeEditar) return;
    setSelecionadaId(obra.id);
    setAberto(true);
  }

  return (
    <>
      <DataTable
        columns={colunas}
        data={obras}
        searchKey="nome"
        searchPlaceholder="Buscar por nome"
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
    </>
  );
}
