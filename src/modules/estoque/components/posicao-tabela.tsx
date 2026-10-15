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
} from "@/components/canonicos";
import { useFiltroSessao } from "@/components/canonicos/use-filtro-sessao";
import { casaBusca, textoPesquisavel } from "@/lib/busca";
import { formatarQuantidade } from "@/lib/formatadores";
import { filtrarFacetado, selecao } from "@/modules/_shared/filtros-facetados";
import type { OrigemPosicao, PosicaoLinha } from "@/modules/estoque/queries";
import { formatarPreco } from "@/modules/manutencao/almoxarifado/calculo";

export const ROTULO_ORIGEM: Record<OrigemPosicao, string> = {
  estoque: "Materiais",
  combustivel: "Combustível",
  pecas: "Peças",
};

/** Onde o material se movimenta: só a origem "estoque" entra e sai por este módulo. */
const ROTULO_LOCAL: Record<PosicaoLinha["localTipo"], string> = {
  deposito: "(depósito)",
  tanque: "(tanque)",
  pilha: "(pilha)",
};

const MOVIMENTA_EM: Record<OrigemPosicao, string> = {
  estoque: "Estoque",
  combustivel: "Combustível",
  pecas: "Manutenção",
};

export interface PosicaoTabelaProps {
  linhas: PosicaoLinha[];
}

/**
 * Posição consolidada: materiais (entradas e saídas deste módulo), combustível por
 * tanque e peças por depósito (só leitura, movimentados nos módulos deles).
 */
export function PosicaoTabela({ linhas }: PosicaoTabelaProps) {
  const [busca, setBusca] = useFiltroSessao("busca", "");
  const [origem, setOrigem] = useFiltroSessao("origem", "");
  const [local, setLocal] = useFiltroSessao("local", "");

  const { linhas: filtradas, opcoes } = React.useMemo(() => {
    return filtrarFacetado(
      linhas,
      {
        origem: { selecionados: selecao(origem), chave: (linha) => linha.origem },
        local: { selecionados: selecao(local), chave: (linha) => linha.localId },
      },
      [
        // Busca universal (src/lib/busca.ts): tudo o que a linha carrega.
        (linha) =>
          casaBusca(
            textoPesquisavel(
              linha.insumoNome,
              linha.localNome,
              linha.localTipo,
              ROTULO_ORIGEM[linha.origem],
              linha.quantidade,
              linha.unidade,
              { valor: linha.valor },
            ),
            busca,
          ),
      ],
    );
  }, [linhas, busca, origem, local]);

  const totais = React.useMemo(() => {
    const porOrigem: Record<OrigemPosicao, number> = { estoque: 0, combustivel: 0, pecas: 0 };
    for (const linha of filtradas) porOrigem[linha.origem] += linha.valor;
    return { ...porOrigem, total: porOrigem.estoque + porOrigem.combustivel + porOrigem.pecas };
  }, [filtradas]);

  const locais = React.useMemo(() => {
    const vistos = new Map<string, string>();
    for (const linha of linhas) vistos.set(linha.localId, linha.localNome);
    return [...vistos].map(([valor, rotulo]) => ({ valor, rotulo })).sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  }, [linhas]);

  const colunas = React.useMemo<ColumnDef<PosicaoLinha, unknown>[]>(
    () => [
      {
        accessorKey: "insumoNome",
        header: "Insumo",
        size: 280,
        meta: { celular: "titulo" },
        cell: ({ row }) => <span className="font-medium">{row.original.insumoNome}</span>,
      },
      {
        accessorKey: "localNome",
        header: "Local",
        size: 200,
        cell: ({ row }) => (
          <span>
            {row.original.localNome}
            <span className="ml-1 text-muted-foreground">
              {ROTULO_LOCAL[row.original.localTipo]}
            </span>
          </span>
        ),
      },
      {
        accessorKey: "origem",
        header: "Tipo",
        size: 130,
        cell: ({ row }) => ROTULO_ORIGEM[row.original.origem],
      },
      {
        accessorKey: "quantidade",
        header: "Saldo",
        size: 140,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) => (
          <span className="tabular-nums">
            {formatarQuantidade(row.original.quantidade)}
            {row.original.unidade ? <span className="ml-1 text-muted-foreground">{row.original.unidade}</span> : null}
          </span>
        ),
      },
      {
        accessorKey: "custoUnitario",
        header: "Custo unitário",
        size: 130,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) => <span className="tabular-nums">{formatarPreco(row.original.custoUnitario)}</span>,
      },
      {
        accessorKey: "valor",
        header: "Valor em estoque",
        size: 150,
        meta: { alinharDireita: true, atomico: true, celular: "valor" },
        cell: ({ row }) => <MoneyText valor={row.original.valor} />,
      },
      {
        id: "movimenta",
        header: "Entrada e saída em",
        size: 150,
        cell: ({ row }) => <span className="text-muted-foreground">{MOVIMENTA_EM[row.original.origem]}</span>,
      },
    ],
    [],
  );

  return (
    <>
      <GradeKpis id="estoque.posicao.resumo" titulo="Resumo" className="mb-4">
        <KPICard idCard="total" titulo="Valor em estoque" valor={<MoneyText valor={totais.total} />} />
        <KPICard idCard="materiais" titulo="Materiais" valor={<MoneyText valor={totais.estoque} />} />
        <KPICard idCard="combustivel" titulo="Combustível" valor={<MoneyText valor={totais.combustivel} />} />
        <KPICard idCard="pecas" titulo="Peças" valor={<MoneyText valor={totais.pecas} />} />
      </GradeKpis>
      <DataTable
        idTabela="estoque.posicao"
        columns={colunas}
        data={filtradas}
        filtros={[
          {
            id: "busca",
            rotulo: "Busca",
            fixo: true,
            temValor: busca !== "",
            onLimpar: () => setBusca(""),
            elemento: <FiltroBusca valor={busca} onValorChange={setBusca} placeholder="Insumo, local, tipo ou valor" />,
          },
          {
            id: "origem",
            rotulo: "Tipo",
            temValor: origem !== "",
            onLimpar: () => setOrigem(""),
            elemento: (
              <FiltroSelect
                valor={origem}
                onValorChange={setOrigem}
                opcoes={opcoes(
                  "origem",
                  (Object.keys(ROTULO_ORIGEM) as OrigemPosicao[]).map((valor) => ({ valor, rotulo: ROTULO_ORIGEM[valor] })),
                )}
                placeholder="Tipo"
                todosRotulo="Todos os tipos"
              />
            ),
          },
          {
            id: "local",
            rotulo: "Local",
            temValor: local !== "",
            onLimpar: () => setLocal(""),
            elemento: (
              <FiltroSelect
                valor={local}
                onValorChange={setLocal}
                opcoes={opcoes("local", locais)}
                placeholder="Local"
                todosRotulo="Todos os locais"
              />
            ),
          },
        ]}
        emptyState={
          <EmptyState
            icone={Boxes}
            titulo={linhas.length === 0 ? "Nada em estoque" : "Nenhum item encontrado"}
            descricao={
              linhas.length === 0
                ? "Registre uma entrada para o material aparecer aqui"
                : "Ajuste a busca, o tipo ou o local"
            }
            className="border-none bg-transparent"
          />
        }
      />
    </>
  );
}
