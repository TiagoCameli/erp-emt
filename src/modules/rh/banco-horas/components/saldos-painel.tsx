"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Scale } from "lucide-react";

import {
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroSelect,
} from "@/components/canonicos";
import { formatarQuantidade } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import type { SaldoColaborador } from "@/modules/rh/banco-horas/queries";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";

export interface SaldosPainelProps {
  saldos: SaldoColaborador[];
}

/**
 * Sinal do saldo: é a pergunta operacional do painel ("quem está devendo
 * horas?"). Faixa de valor não serve aqui, porque saldo é número com sinal.
 */
const OPCOES_SINAL = [
  { valor: "negativo", rotulo: "Negativo" },
  { valor: "positivo", rotulo: "Positivo" },
  { valor: "zerado", rotulo: "Zerado" },
];

/** Saldo formatado com "h"; negativo em vermelho. */
function SaldoHoras({ saldo }: { saldo: number }) {
  return (
    <span
      className={cn(
        "tabular-nums font-medium",
        saldo < 0 ? "text-status-rejeitado" : "text-foreground",
      )}
    >
      {formatarQuantidade(saldo)} h
    </span>
  );
}

/**
 * Painel de saldos do banco de horas: um saldo por colaborador (créditos menos
 * débitos). Saldo negativo aparece em vermelho.
 *
 * Filtros em memória: o painel recebe todos os saldos já agregados (um por
 * colaborador com movimento), sem paginação server-side.
 */
export function SaldosPainel({ saldos }: SaldosPainelProps) {
  const [busca, setBusca] = useFiltroSessao("busca", "");
  const [sinal, setSinal] = useFiltroSessao("sinal", "");

  const dados = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return saldos.filter((item) => {
      if (sinal === "negativo" && item.saldo >= 0) return false;
      if (sinal === "positivo" && item.saldo <= 0) return false;
      if (sinal === "zerado" && item.saldo !== 0) return false;
      if (termo && !item.nome.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [saldos, busca, sinal]);

  const colunas = React.useMemo<ColumnDef<SaldoColaborador, unknown>[]>(
    () => [
      {
        accessorKey: "nome",
        header: "Colaborador",
        cell: ({ row }) => (
          <span className="font-medium">{row.original.nome}</span>
        ),
      },
      {
        accessorKey: "saldo",
        header: "Saldo",
        meta: { alinharDireita: true },
        cell: ({ row }) => <SaldoHoras saldo={row.original.saldo} />,
      },
    ],
    [],
  );

  return (
    <DataTable
      idTabela="rh.banco-horas.saldos"
      columns={colunas}
      data={dados}
      filtros={[
        {
          id: "busca",
          rotulo: "Busca por colaborador",
          // A busca é a porta de entrada do painel: não pode ser escondida.
          fixo: true,
          elemento: (
            <FiltroBusca
              valor={busca}
              onValorChange={setBusca}
              placeholder="Buscar por colaborador"
            />
          ),
        },
        {
          id: "sinal",
          rotulo: "Saldo",
          ocultoPorPadrao: true,
          temValor: sinal !== "",
          onLimpar: () => setSinal(""),
          elemento: (
            <FiltroSelect
              valor={sinal}
              onValorChange={setSinal}
              opcoes={OPCOES_SINAL}
              placeholder="Saldo"
              todosRotulo="Qualquer saldo"
            />
          ),
        },
      ]}
      emptyState={
        <EmptyState
          icone={Scale}
          titulo="Nenhum saldo a exibir"
          descricao="Os saldos aparecem aqui assim que houver movimentos de banco de horas."
        />
      }
    />
  );
}
