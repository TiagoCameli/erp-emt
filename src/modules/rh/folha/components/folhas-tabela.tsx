"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { ColumnDef } from "@tanstack/react-table";
import { Calculator, Plus } from "lucide-react";

import {
  DataTable,
  EmptyState,
  MoneyText,
  StatusBadge,
} from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { formatarQuantidade } from "@/lib/formatadores";
import { STATUS_FOLHA } from "@/modules/rh/_shared/formato";
import type { FolhaLista } from "@/modules/rh/folha/queries";
import { GerarFolhaFormDrawer } from "./gerar-folha-form-drawer";

/** Competência (yyyy-MM-01) como MM/AAAA. */
function formatarCompetencia(competencia: string): string {
  const [ano, mes] = competencia.split("-");
  return `${mes}/${ano}`;
}

const colunas: ColumnDef<FolhaLista, unknown>[] = [
  {
    accessorKey: "competencia",
    header: "Competência",
    cell: ({ row }) => (
      <span className="font-medium tabular-nums">
        {formatarCompetencia(row.original.competencia)}
      </span>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => {
      const info = STATUS_FOLHA[row.original.status];
      return <StatusBadge status={info.badge} rotulo={info.rotulo} />;
    },
  },
  {
    accessorKey: "encargosPercentual",
    header: "Encargos %",
    meta: { alinharDireita: true },
    cell: ({ row }) => (
      <span className="tabular-nums">
        {formatarQuantidade(row.original.encargosPercentual)}%
      </span>
    ),
  },
  {
    accessorKey: "custoTotal",
    header: "Custo total",
    meta: { alinharDireita: true },
    cell: ({ row }) => <MoneyText valor={row.original.custoTotal} />,
  },
  {
    accessorKey: "valorLiquido",
    header: "Líquido",
    meta: { alinharDireita: true },
    cell: ({ row }) => <MoneyText valor={row.original.valorLiquido} />,
  },
];

export interface FolhasTabelaProps {
  folhas: FolhaLista[];
  podeCriar: boolean;
}

/**
 * Listagem das folhas gerenciais: clique na linha abre o detalhe da folha. O
 * estado vazio oferece gerar a primeira folha (se houver permissão), abrindo o
 * mesmo drawer da ação primária do cabeçalho.
 */
export function FolhasTabela({ folhas, podeCriar }: FolhasTabelaProps) {
  const router = useRouter();
  const [drawerAberto, setDrawerAberto] = React.useState(false);

  return (
    <>
      <DataTable
        columns={colunas}
        data={folhas}
        onRowClick={(folha) => router.push(`/rh/folha/${folha.id}`)}
        emptyState={
          <EmptyState
            icone={Calculator}
            titulo="Nenhuma folha gerada"
            descricao="Gere a folha gerencial de uma competência para consolidar ponto, adiantamentos e encargos por colaborador."
            acao={
              podeCriar ? (
                <Button
                  type="button"
                  size="sm"
                  onClick={() => setDrawerAberto(true)}
                >
                  <Plus />
                  Gerar folha
                </Button>
              ) : undefined
            }
          />
        }
      />

      {podeCriar ? (
        <GerarFolhaFormDrawer
          aberto={drawerAberto}
          onAbertoChange={setDrawerAberto}
          onGerada={(id) => router.push(`/rh/folha/${id}`)}
        />
      ) : null}
    </>
  );
}
