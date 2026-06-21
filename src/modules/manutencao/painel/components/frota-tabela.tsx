"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Truck } from "lucide-react";

import {
  DataTable,
  EmptyState,
  FilterBar,
  FiltroBusca,
  FiltroSelect,
  MoneyText,
  StatusBadge,
} from "@/components/canonicos";
import { formatarQuantidade } from "@/lib/formatadores";
import {
  STATUS_FROTA,
  type StatusFrota,
} from "@/modules/manutencao/_shared/formato";
import type { FrotaLinha } from "@/modules/manutencao/painel/queries";

export interface FrotaTabelaProps {
  frota: FrotaLinha[];
}

const OPCOES_STATUS: { valor: StatusFrota; rotulo: string }[] = [
  { valor: "operando", rotulo: STATUS_FROTA.operando.rotulo },
  { valor: "em_manutencao", rotulo: STATUS_FROTA.em_manutencao.rotulo },
];

/** Texto da última leitura: horímetro em horas e/ou km; "-" se nenhum. */
function UltimaLeitura({ linha }: { linha: FrotaLinha }) {
  const partes: string[] = [];
  if (linha.ultimoHorimetro !== null) {
    partes.push(`${formatarQuantidade(linha.ultimoHorimetro)} h`);
  }
  if (linha.ultimoKm !== null) {
    partes.push(`${formatarQuantidade(linha.ultimoKm)} km`);
  }
  if (partes.length === 0) {
    return <span className="text-muted-foreground">-</span>;
  }
  return <span className="tabular-nums">{partes.join(" / ")}</span>;
}

const COLUNAS: ColumnDef<FrotaLinha, unknown>[] = [
  {
    accessorKey: "descricao",
    header: "Equipamento",
    cell: ({ row }) => {
      const legenda = row.original.placa ?? row.original.codigo;
      return (
        <div className="min-w-0">
          <span className="font-medium">{row.original.descricao}</span>
          {legenda ? (
            <span className="ml-1.5 text-legenda text-muted-foreground codigo-doc">
              {legenda}
            </span>
          ) : null}
        </div>
      );
    },
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <StatusBadge
        status={STATUS_FROTA[row.original.status].badge}
        rotulo={STATUS_FROTA[row.original.status].rotulo}
      />
    ),
  },
  {
    id: "ultimaLeitura",
    header: "Última leitura",
    meta: { alinharDireita: true },
    enableSorting: false,
    cell: ({ row }) => <UltimaLeitura linha={row.original} />,
  },
  {
    accessorKey: "custoManutencao",
    header: "Manutenção",
    meta: { alinharDireita: true },
    cell: ({ row }) => <MoneyText valor={row.original.custoManutencao} />,
  },
  {
    accessorKey: "custoCombustivel",
    header: "Combustível",
    meta: { alinharDireita: true },
    cell: ({ row }) => <MoneyText valor={row.original.custoCombustivel} />,
  },
  {
    accessorKey: "custoTotal",
    header: "Total",
    meta: { alinharDireita: true },
    cell: ({ row }) => <MoneyText valor={row.original.custoTotal} />,
  },
  {
    accessorKey: "custoPorHora",
    header: "R$/hora",
    meta: { alinharDireita: true },
    cell: ({ row }) =>
      row.original.custoPorHora !== null ? (
        <MoneyText valor={row.original.custoPorHora} />
      ) : (
        <span className="text-muted-foreground">-</span>
      ),
  },
];

/**
 * Painel de frota (somente leitura): busca por descrição ou placa e filtro por
 * status, ambos client-side. A tabela pagina sozinha (sem props de paginação
 * server-side), já que a frota chega inteira do servidor.
 */
export function FrotaTabela({ frota }: FrotaTabelaProps) {
  const [busca, setBusca] = React.useState("");
  const [status, setStatus] = React.useState("");

  const dados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return frota.filter((linha) => {
      if (status && linha.status !== status) return false;
      if (termo) {
        const descricao = linha.descricao.toLowerCase();
        const placa = linha.placa?.toLowerCase() ?? "";
        if (!descricao.includes(termo) && !placa.includes(termo)) return false;
      }
      return true;
    });
  }, [frota, busca, status]);

  return (
    <div className="flex flex-col gap-2">
      <FilterBar>
        <FiltroBusca
          valor={busca}
          onValorChange={setBusca}
          placeholder="Buscar por equipamento ou placa"
        />
        <FiltroSelect
          valor={status}
          onValorChange={setStatus}
          opcoes={OPCOES_STATUS}
          placeholder="Status"
          todosRotulo="Todos os status"
        />
      </FilterBar>

      <DataTable
        columns={COLUNAS}
        data={dados}
        emptyState={
          <EmptyState
            icone={Truck}
            titulo="Sem equipamentos na frota"
            descricao="Quando houver equipamentos ativos, o painel de cada um aparece aqui."
            className="border-none bg-transparent"
          />
        }
      />
    </div>
  );
}
