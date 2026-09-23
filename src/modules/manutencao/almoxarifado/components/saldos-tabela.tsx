"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Boxes } from "lucide-react";

import {
  DataTable,
  EmptyState,
  FiltroBusca,
  FiltroSelect,
  GradeKpis,
  KPICard,
  MoneyText,
  StatusBadge,
  CelulaVazia,
} from "@/components/canonicos";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";
import { formatarQuantidade } from "@/lib/formatadores";
import {
  abaixoDoMinimo,
  formatarPreco,
  resumirSaldos,
  valorEmEstoque,
} from "@/modules/manutencao/almoxarifado/calculo";
import type { Opcao, SaldoLinha } from "@/modules/manutencao/almoxarifado/queries";

type FiltroSituacao = "todos" | "com_saldo" | "zerados" | "abaixo";

const SITUACOES: readonly FiltroSituacao[] = ["todos", "com_saldo", "zerados", "abaixo"];

const OPCOES_SITUACAO = [
  { valor: "com_saldo", rotulo: "Só com saldo" },
  { valor: "zerados", rotulo: "Zerados" },
  { valor: "abaixo", rotulo: "Abaixo do mínimo" },
];

interface LinhaTabela extends SaldoLinha {
  valorEmEstoque: number;
  abaixo: boolean;
}

export interface SaldosTabelaProps {
  saldos: SaldoLinha[];
  depositos: Opcao[];
}

/**
 * Saldo por depósito × peça. O saldo e o custo médio vêm do gatilho do banco
 * (`almoxarifado_saldos`); aqui só se multiplica para o valor em estoque e se
 * compara com o mínimo da peça.
 *
 * Os cartões do topo seguem o depósito e a busca, mas NÃO o filtro de situação:
 * com "Só com saldo" ligado, "Zerados" continuaria dizendo quantos existem, em
 * vez de cair para zero e parecer que não há nenhum.
 */
export function SaldosTabela({ saldos, depositos }: SaldosTabelaProps) {
  const [busca, setBusca] = useFiltroSessao("busca", "");
  const [deposito, setDeposito] = useFiltroSessao("deposito", "");
  const [situacao, setSituacao] = useFiltroSessao<FiltroSituacao>(
    "situacao",
    "todos",
    SITUACOES,
  );

  const linhas = React.useMemo<LinhaTabela[]>(
    () =>
      saldos.map((linha) => ({
        ...linha,
        valorEmEstoque: valorEmEstoque(linha.saldo, linha.custoMedio),
        abaixo: abaixoDoMinimo(linha.saldo, linha.estoqueMinimo),
      })),
    [saldos],
  );

  const doRecorte = React.useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return linhas.filter((linha) => {
      if (deposito && linha.depositoId !== deposito) return false;
      if (termo && !linha.insumoNome.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [linhas, busca, deposito]);

  const filtradas = React.useMemo(
    () =>
      doRecorte.filter((linha) => {
        if (situacao === "com_saldo") return linha.saldo > 0;
        if (situacao === "zerados") return linha.saldo <= 0;
        if (situacao === "abaixo") return linha.abaixo;
        return true;
      }),
    [doRecorte, situacao],
  );

  const resumo = React.useMemo(() => resumirSaldos(doRecorte), [doRecorte]);

  const colunas = React.useMemo<ColumnDef<LinhaTabela, unknown>[]>(
    () => [
      {
        accessorKey: "insumoNome",
        header: "Peça",
        size: 360,
        cell: ({ row }) => (
          <span className="font-medium">
            {row.original.insumoNome}
            {row.original.unidade ? (
              <span className="ml-1 text-muted-foreground">({row.original.unidade})</span>
            ) : null}
          </span>
        ),
      },
      {
        accessorKey: "depositoNome",
        header: "Depósito",
        size: 200,
      },
      {
        accessorKey: "saldo",
        header: "Saldo",
        size: 120,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) => (
          <span className="tabular-nums">{formatarQuantidade(row.original.saldo)}</span>
        ),
      },
      {
        accessorKey: "custoMedio",
        header: "Custo médio",
        size: 140,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) => (
          <span className="tabular-nums">{formatarPreco(row.original.custoMedio)}</span>
        ),
      },
      {
        accessorKey: "valorEmEstoque",
        header: "Valor em estoque",
        size: 150,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) => <MoneyText valor={row.original.valorEmEstoque} />,
      },
      {
        accessorKey: "estoqueMinimo",
        header: "Estoque mínimo",
        size: 130,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) =>
          row.original.estoqueMinimo === null ? (
            <CelulaVazia />
          ) : (
            <span className="tabular-nums">
              {formatarQuantidade(row.original.estoqueMinimo)}
            </span>
          ),
      },
      {
        id: "situacao",
        header: "Situação",
        size: 150,
        accessorFn: (linha) => (linha.abaixo ? 0 : linha.saldo > 0 ? 2 : 1),
        cell: ({ row }) => {
          if (row.original.abaixo) {
            return <StatusBadge status="rejeitado" rotulo="Abaixo do mínimo" />;
          }
          if (row.original.saldo <= 0) {
            return <StatusBadge status="rascunho" rotulo="Zerado" />;
          }
          // Sem selo verde: o verde de status é "aprovado", e saldo não passa por aprovação.
          return <span className="text-detalhe text-muted-foreground">Em estoque</span>;
        },
      },
    ],
    [],
  );

  return (
    <div className="flex flex-col gap-4">
      <GradeKpis>
        <KPICard titulo="Itens com saldo" valor={resumo.comSaldo} />
        <KPICard titulo="Zerados" valor={resumo.zerados} />
        <KPICard
          titulo="Abaixo do mínimo"
          valor={resumo.abaixoDoMinimo}
          detalhe="Saldo menor que o estoque mínimo da peça"
        />
        <KPICard titulo="Valor em estoque" valor={<MoneyText valor={resumo.valorEmEstoque} />} />
      </GradeKpis>

      <DataTable
        idTabela="manutencao.almoxarifado.saldos"
        columns={colunas}
        data={filtradas}
        filtros={[
          {
            id: "busca",
            rotulo: "Busca",
            fixo: true,
            temValor: busca !== "",
            onLimpar: () => setBusca(""),
            elemento: (
              <FiltroBusca
                valor={busca}
                onValorChange={setBusca}
                placeholder="Buscar peça pelo nome"
              />
            ),
          },
          {
            id: "deposito",
            rotulo: "Depósito",
            temValor: deposito !== "",
            onLimpar: () => setDeposito(""),
            elemento: (
              <FiltroSelect
                valor={deposito}
                onValorChange={setDeposito}
                opcoes={depositos.map((d) => ({ valor: d.id, rotulo: d.nome }))}
                placeholder="Depósito"
                todosRotulo="Todos os depósitos"
              />
            ),
          },
          {
            id: "situacao",
            rotulo: "Saldo",
            temValor: situacao !== "todos",
            onLimpar: () => setSituacao("todos"),
            elemento: (
              <FiltroSelect
                valor={situacao === "todos" ? "" : situacao}
                onValorChange={(valor) =>
                  setSituacao(valor === "" ? "todos" : (valor as FiltroSituacao))
                }
                opcoes={OPCOES_SITUACAO}
                placeholder="Saldo"
                todosRotulo="Com e sem saldo"
              />
            ),
          },
        ]}
        emptyState={
          <EmptyState
            icone={Boxes}
            titulo={saldos.length === 0 ? "Nenhuma peça no almoxarifado" : "Nenhum saldo encontrado"}
            descricao={
              saldos.length === 0
                ? "O saldo aparece aqui depois da primeira entrada por nota fiscal"
                : "Ajuste os filtros para ver outras peças"
            }
            className="border-none bg-transparent"
          />
        }
      />
    </div>
  );
}
