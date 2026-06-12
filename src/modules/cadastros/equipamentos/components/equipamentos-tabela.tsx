"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Truck } from "lucide-react";

import { DataTable, EmptyState, StatusBadge } from "@/components/canonicos";
import type {
  EquipamentoDocumento,
  EquipamentoLista,
} from "@/modules/cadastros/equipamentos/queries";
import { EquipamentosFormDrawer } from "./equipamentos-form-drawer";

const colunas: ColumnDef<EquipamentoLista, unknown>[] = [
  {
    accessorKey: "codigo",
    header: "Código",
    cell: ({ row }) =>
      row.original.codigo ? (
        <span className="codigo-doc">{row.original.codigo}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },
  {
    accessorKey: "descricao",
    header: "Descrição",
    cell: ({ row }) => (
      <span className="font-medium">{row.original.descricao}</span>
    ),
  },
  {
    accessorKey: "tipo",
    header: "Tipo",
    cell: ({ row }) =>
      row.original.tipo ? (
        <span>{row.original.tipo}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },
  {
    accessorKey: "placa",
    header: "Placa",
    cell: ({ row }) =>
      row.original.placa ? (
        <span className="codigo-doc">{row.original.placa}</span>
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
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

export interface EquipamentosTabelaProps {
  equipamentos: EquipamentoLista[];
  documentosPorEquipamento: Record<string, EquipamentoDocumento[]>;
  podeEditar: boolean;
}

/**
 * Listagem de equipamentos. Clicar numa linha abre o drawer de edição
 * (com a seção de documentos) quando o usuário tem permissão de editar.
 */
export function EquipamentosTabela({
  equipamentos,
  documentosPorEquipamento,
  podeEditar,
}: EquipamentosTabelaProps) {
  const [selecionadoId, setSelecionadoId] = React.useState<string | null>(null);
  const [aberto, setAberto] = React.useState(false);

  // Deriva da prop pra refletir edições depois do revalidatePath.
  const equipamentoSelecionado =
    equipamentos.find((equipamento) => equipamento.id === selecionadoId) ?? null;
  const documentos = selecionadoId
    ? (documentosPorEquipamento[selecionadoId] ?? [])
    : [];

  function abrirEdicao(equipamento: EquipamentoLista) {
    if (!podeEditar) return;
    setSelecionadoId(equipamento.id);
    setAberto(true);
  }

  return (
    <>
      <DataTable
        columns={colunas}
        data={equipamentos}
        searchKey="descricao"
        searchPlaceholder="Buscar por descrição"
        onRowClick={podeEditar ? abrirEdicao : undefined}
        emptyState={
          <EmptyState
            icone={Truck}
            titulo="Nenhum equipamento cadastrado"
            descricao="Cadastre o primeiro equipamento para começar"
            className="border-none bg-transparent"
          />
        }
      />

      <EquipamentosFormDrawer
        key={equipamentoSelecionado?.id ?? "nenhum"}
        aberto={aberto}
        onAbertoChange={setAberto}
        equipamento={equipamentoSelecionado}
        documentos={documentos}
        podeEditar={podeEditar}
      />
    </>
  );
}
