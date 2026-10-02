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
import { filtrarFacetado, selecao } from "@/modules/_shared/filtros-facetados";
import type { SaldoColaborador } from "@/modules/rh/banco-horas/queries";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";

export interface SaldosPainelProps {
  saldos: SaldoColaborador[];
}

/**
 * Sinal do saldo: é a pergunta operacional do painel ("quem está devendo
 * horas?"). Faixa de valor não serve aqui, porque saldo é número com sinal.
 */
type FiltroSinal = "" | "negativo" | "positivo" | "zerado";
const SINAIS: readonly FiltroSinal[] = ["", "negativo", "positivo", "zerado"];

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
  // Com a lista de válidos: valor velho da sessão que não é sinal nenhum cai no
  // inicial, em vez de esconder todas as linhas.
  const [sinal, setSinal] = useFiltroSessao<FiltroSinal>("sinal", "", SINAIS);

  // Facetado: o sinal só oferece o que existe na lista filtrada pela busca
  // (ver `_shared/filtros-facetados`).
  const { linhas: dados, opcoes } = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return filtrarFacetado(
      saldos,
      {
        sinal: {
          selecionados: selecao(sinal),
          casa: (item, valor) =>
            (valor === "negativo" && item.saldo < 0) ||
            (valor === "positivo" && item.saldo > 0) ||
            (valor === "zerado" && item.saldo === 0),
        },
      },
      [(item) => !termo || item.nome.toLowerCase().includes(termo)],
    );
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
          // Entra no "Limpar filtros": sem isto o botão limpa os seletores e
          // deixa o texto da busca filtrando a lista.
          temValor: busca !== "",
          onLimpar: () => setBusca(""),
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
              onValorChange={(valor) => setSinal(valor as FiltroSinal)}
              opcoes={opcoes("sinal", OPCOES_SINAL)}
              placeholder="Saldo"
              todosRotulo="Qualquer saldo"
            />
          ),
        },
      ]}
      emptyState={
        <EmptyState
          className="border-none bg-transparent"
          icone={Scale}
          titulo="Nenhum saldo a exibir"
          descricao="Os saldos aparecem aqui assim que houver movimentos de banco de horas."
        />
      }
    />
  );
}
