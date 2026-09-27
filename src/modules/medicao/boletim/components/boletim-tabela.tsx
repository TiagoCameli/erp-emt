"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { FileSpreadsheet, TriangleAlert } from "lucide-react";

import { CelulaArvore, CelulaVazia, DataTable, EmptyState, MoneyText } from "@/components/canonicos";
import { cn } from "@/lib/utils";
import { montarArvoreBoletim, type NoBoletim } from "@/modules/medicao/boletim/arvore";
import { percentualExibicao } from "@/modules/medicao/boletim/formato";
import type { Boletim } from "@/modules/medicao/boletim/tipos";
import { numeroExibicao } from "@/modules/medicao/planilha/formato";

/**
 * Dinheiro do boletim: o texto que a RPC mandou, só formatado. Nulo = contrato sem regra de
 * arredondamento (a página avisa acima), então a célula fica marcada como vazia, nunca "R$ 0,00".
 */
function Dinheiro({ valor, negrito }: { valor: string | null; negrito?: boolean }) {
  if (valor === null) return <CelulaVazia />;
  return <MoneyText valor={valor} className={cn(negrito && "font-semibold")} />;
}

function Numero({ texto, negrito }: { texto: string; negrito?: boolean }) {
  return <span className={cn("tabular-nums", negrito && "font-semibold")}>{texto}</span>;
}

function ehTitulo(n: NoBoletim): boolean {
  return n.tipo === "titulo";
}

/** Colunas do boletim "até a Nª": uma coluna de quantidade por medição 1..N. */
function montarColunas(ate: number | null): ColumnDef<NoBoletim, unknown>[] {
  const medicoes = Array.from({ length: ate ?? 0 }, (_, i) => i + 1);
  const rotuloN = ate === null ? "Valor na medição" : `Valor na ${ate}ª`;
  return [
    {
      id: "item",
      header: "Item",
      // Recuo de 1rem por nível + chevron de 2rem + código de até 11 caracteres (02.07.05.01).
      size: 230,
      meta: { fixa: true, naoTruncar: true },
      cell: ({ row }) => (
        <CelulaArvore linha={row}>
          <span className={cn("font-mono", ehTitulo(row.original) && "font-semibold")}>{row.original.codigo}</span>
        </CelulaArvore>
      ),
    },
    {
      id: "descricao",
      header: "Discriminação",
      size: 360,
      cell: ({ row }) => <span className={cn(ehTitulo(row.original) && "font-semibold")}>{row.original.descricao}</span>,
    },
    {
      id: "unidade",
      header: "Unid.",
      size: 70,
      cell: ({ row }) => row.original.unidade ?? "",
    },
    {
      id: "preco",
      header: "Preço Unitário",
      // Preço com a casa escondida inteira, ex.: 21.154,6358333333 (17 caracteres).
      size: 180,
      meta: { alinharDireita: true, atomico: true },
      cell: ({ row }) => <Numero texto={numeroExibicao(row.original.preco_unitario)} />,
    },
    {
      id: "qtd_prevista",
      header: "Qtd Prevista Total",
      size: 130,
      meta: { alinharDireita: true, atomico: true },
      cell: ({ row }) => <Numero texto={numeroExibicao(row.original.quantidade_prevista)} />,
    },
    {
      id: "previsto",
      header: "Valor Previsto Total",
      size: 160,
      meta: { alinharDireita: true, atomico: true },
      cell: ({ row }) => <Dinheiro valor={row.original.previsto} negrito={ehTitulo(row.original)} />,
    },
    ...medicoes.map<ColumnDef<NoBoletim, unknown>>((n) => ({
      id: `m${n}`,
      header: `${n}ª`,
      size: 110,
      meta: { alinharDireita: true, atomico: true, rotulo: `Quantidade da ${n}ª` },
      cell: ({ row }) => <Numero texto={numeroExibicao(row.original.qtds[String(n)] ?? null)} />,
    })),
    {
      id: "valor_medicao",
      header: rotuloN,
      size: 150,
      meta: { alinharDireita: true, atomico: true },
      cell: ({ row }) => <Dinheiro valor={row.original.valor_medicao} negrito={ehTitulo(row.original)} />,
    },
    {
      id: "acumulado",
      header: "Acumulado",
      size: 160,
      meta: { alinharDireita: true, atomico: true },
      cell: ({ row }) => <Dinheiro valor={row.original.acumulado} negrito={ehTitulo(row.original)} />,
    },
    {
      id: "pct_executado",
      header: "% Executada",
      size: 110,
      meta: { alinharDireita: true, atomico: true },
      cell: ({ row }) => <Numero texto={percentualExibicao(row.original.pct_executado)} negrito={ehTitulo(row.original)} />,
    },
    {
      id: "saldo",
      header: "Saldo a Medir",
      size: 160,
      meta: { alinharDireita: true, atomico: true },
      cell: ({ row }) => <Dinheiro valor={row.original.saldo} negrito={ehTitulo(row.original)} />,
    },
    {
      id: "pct_a_medir",
      header: "% a Medir",
      size: 110,
      meta: { alinharDireita: true, atomico: true },
      cell: ({ row }) => <Numero texto={percentualExibicao(row.original.pct_a_medir)} negrito={ehTitulo(row.original)} />,
    },
    {
      // A busca da DataTable olha UMA coluna: esta junta código e descrição. Fica escondida e
      // fora do menu "Colunas" (`fixa`), porque mostrá-la seria repetir as duas primeiras.
      id: "busca",
      accessorFn: (n) => `${n.codigo} ${n.descricao}`,
      header: "Busca",
      meta: { fixa: true, ocultaPorPadrao: true },
    },
  ];
}

function subLinhas(n: NoBoletim): NoBoletim[] | undefined {
  return n.filhos.length ? n.filhos : undefined;
}

function idDaLinha(n: NoBoletim): string {
  return n.id;
}

/** Aviso dos itens medidos que saíram da versão exibida: eles entram no acumulado do total. */
function AvisoForaDaVersao({ boletim }: { boletim: Boletim }) {
  const itens = boletim.fora_da_versao;
  if (itens.length === 0) return null;
  const versao = boletim.versao ? ` (v${boletim.versao.numero})` : "";
  const cabeca =
    itens.length === 1
      ? `1 item medido fora da versão vigente${versao}`
      : `${itens.length} itens medidos fora da versão vigente${versao}`;
  return (
    <div role="note" className="mb-3 flex items-start gap-2 rounded-md border border-border bg-surface p-3 text-detalhe">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-pendente" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-medium">{cabeca}</p>
        <p className="text-muted-foreground">Não estão na planilha abaixo, mas entram no acumulado e no valor da medição do total.</p>
        <ul className="mt-1 flex flex-col gap-0.5">
          {itens.map((item) => (
            <li key={item.item_id} className="flex flex-wrap gap-x-2">
              <span className="font-mono">{item.codigo}</span>
              <span>{item.descricao}</span>
              <span className="text-muted-foreground">
                acumulado{" "}
                {item.acumulado === null ? "sem regra de arredondamento" : <MoneyText valor={item.acumulado} />}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export interface BoletimTabelaProps {
  boletim: Boletim;
  /** Id da linha raiz escolhida no filtro "Grupo"; vazio (ou id que não existe) = todas. */
  grupoId: string;
}

/**
 * A planilha do contrato em árvore, com as quantidades de cada medição e o dinheiro do boletim.
 * Todo número vem pronto da RPC; o filtro por grupo e a busca só escolhem o que MOSTRAR, e o
 * rodapé continua sendo o total do contrato.
 */
export function BoletimTabela({ boletim, grupoId }: BoletimTabelaProps) {
  const arvore = React.useMemo(() => montarArvoreBoletim(boletim.linhas), [boletim.linhas]);
  const dados = React.useMemo(() => {
    const doGrupo = arvore.filter((n) => n.id === grupoId);
    return doGrupo.length > 0 ? doGrupo : arvore;
  }, [arvore, grupoId]);
  const colunas = React.useMemo(() => montarColunas(boletim.ate), [boletim.ate]);
  const t = boletim.total;

  return (
    <>
      <AvisoForaDaVersao boletim={boletim} />
      <DataTable
        // A quantidade de colunas muda com o N: a chave remonta a tabela para a ordem e as
        // larguras guardadas acompanharem as colunas novas.
        key={`ate-${boletim.ate ?? 0}`}
        idTabela="medicao.boletim.linhas"
        columns={colunas}
        data={dados}
        subLinhas={subLinhas}
        idDaLinha={idDaLinha}
        searchKey="busca"
        searchPlaceholder="Buscar por código ou descrição"
        cabecalhoFixo
        rodape={{
          item: <span className="font-semibold">Total do contrato</span>,
          previsto: <Dinheiro valor={t.previsto} negrito />,
          valor_medicao: <Dinheiro valor={t.valor_medicao} negrito />,
          acumulado: <Dinheiro valor={t.acumulado} negrito />,
          pct_executado: <Numero texto={percentualExibicao(t.pct_executado)} negrito />,
          saldo: <Dinheiro valor={t.saldo} negrito />,
          pct_a_medir: <Numero texto={percentualExibicao(t.pct_a_medir)} negrito />,
        }}
        emptyState={
          <EmptyState
            icone={FileSpreadsheet}
            titulo="Nenhuma linha na planilha"
            descricao={boletim.versao ? "A versão vigente não tem linhas" : "O contrato ainda não tem versão vigente da planilha"}
            className="border-none bg-transparent"
          />
        }
      />
    </>
  );
}
