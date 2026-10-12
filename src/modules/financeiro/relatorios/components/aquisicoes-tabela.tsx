"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { BarChart3 } from "lucide-react";

import { DataTable, EmptyState, MoneyText } from "@/components/canonicos";
import { formatarMesAno } from "@/lib/formatadores";
import {
  agruparEquipamentos,
  consorciosDe,
  rotuloParcelas,
  somarAquisicoes,
  type AquisicaoLinha,
  type TotaisAquisicao,
} from "@/modules/financeiro/relatorios/aquisicoes";
import { LinkDrill } from "@/modules/financeiro/relatorios/components/link-drill";
import { detalheLancamento, drillAquisicao } from "@/modules/financeiro/relatorios/drill";

interface AquisicoesTabelaProps {
  linhas: AquisicaoLinha[];
  /** Sem permissão de ver lançamentos, os nomes ficam sem link. */
  podeVerLancamentos: boolean;
}

/**
 * As três colunas de dinheiro, iguais nas duas tabelas. O peso vai na célula:
 * o subtotal do grupo é `font-medium` e o resto, normal.
 */
function colunasDinheiro<T>(
  totais: (registro: T) => TotaisAquisicao,
  peso: (registro: T) => string | undefined = () => undefined,
): ColumnDef<T, unknown>[] {
  const coluna = (
    id: keyof TotaisAquisicao,
    header: string,
  ): ColumnDef<T, unknown> => ({
    id,
    accessorFn: (registro) => totais(registro)[id],
    header,
    size: 150,
    enableSorting: false,
    meta: { alinharDireita: true, atomico: true },
    cell: ({ row }) => (
      <MoneyText valor={totais(row.original)[id]} className={peso(row.original)} />
    ),
  });
  return [coluna("valor", "Valor"), coluna("pago", "Pago"), coluna("aPagar", "A pagar")];
}

/** Pé de Total das duas tabelas, preso aos ids das colunas. */
function rodapeTotal(idRotulo: string, totais: TotaisAquisicao): Record<string, React.ReactNode> {
  return {
    [idRotulo]: <span className="font-semibold">Total</span>,
    valor: <MoneyText valor={totais.valor} className="font-semibold" />,
    pago: <MoneyText valor={totais.pago} className="font-semibold" />,
    aPagar: <MoneyText valor={totais.aPagar} className="font-semibold" />,
  };
}

function Secao({ titulo, nota, children }: { titulo: string; nota?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div>
        <h3 className="text-corpo font-semibold text-foreground">{titulo}</h3>
        {nota ? <p className="text-detalhe text-muted-foreground">{nota}</p> : null}
      </div>
      {children}
    </div>
  );
}

/** Linha da tabela de equipamentos: o subtotal do grupo ou um bem dele. */
type LinhaEquipamento =
  | { tipo: "grupo"; id: string; grupo: string; totais: TotaisAquisicao }
  | { tipo: "bem"; id: string; linha: AquisicaoLinha };

const totaisDaLinhaEquipamento = (registro: LinhaEquipamento): TotaisAquisicao =>
  registro.tipo === "grupo" ? registro.totais : registro.linha;

function TabelaEquipamentos({ linhas, podeVerLancamentos }: AquisicoesTabelaProps) {
  const grupos = React.useMemo(() => agruparEquipamentos(linhas), [linhas]);
  const total = React.useMemo(() => somarAquisicoes(grupos.flatMap((g) => g.linhas)), [grupos]);
  const dados = React.useMemo<LinhaEquipamento[]>(
    () =>
      grupos.flatMap((g) => [
        { tipo: "grupo" as const, id: `grupo:${g.grupo}`, grupo: g.grupo, totais: g.totais },
        ...g.linhas.map((l) => ({ tipo: "bem" as const, id: `bem:${l.centroId}`, linha: l })),
      ]),
    [grupos],
  );

  // Seções com subtotal: ordenar por coluna misturaria bem de um grupo com o
  // subtotal de outro, então nenhuma coluna ordena.
  const colunas = React.useMemo<ColumnDef<LinhaEquipamento, unknown>[]>(
    () => [
      {
        id: "equipamento",
        header: "Equipamento",
        size: 240,
        enableSorting: false,
        meta: { celular: "titulo" },
        cell: ({ row }) => {
          const r = row.original;
          if (r.tipo === "grupo") return <span className="font-medium">{r.grupo}</span>;
          const l = r.linha;
          return podeVerLancamentos ? (
            <LinkDrill href={drillAquisicao({ centroId: l.centroId })} titulo={`Lançamentos de ${l.centro}`}>
              {l.centro}
            </LinkDrill>
          ) : (
            l.centro
          );
        },
      },
      {
        id: "fornecedor",
        header: "Fornecedor",
        size: 180,
        enableSorting: false,
        cell: ({ row }) =>
          row.original.tipo === "bem" ? (
            <span className="text-muted-foreground">{row.original.linha.fornecedor ?? ""}</span>
          ) : null,
      },
      {
        id: "compra",
        header: "Compra",
        size: 110,
        enableSorting: false,
        meta: { atomico: true },
        cell: ({ row }) =>
          row.original.tipo === "bem" ? (
            <span className="tabular-nums">{formatarMesAno(row.original.linha.primeiraCompetencia)}</span>
          ) : null,
      },
      {
        id: "lancamentos",
        header: "Lançamentos",
        size: 120,
        enableSorting: false,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) =>
          row.original.tipo === "bem" ? (
            <span className="tabular-nums">{row.original.linha.lancamentos}</span>
          ) : null,
      },
      ...colunasDinheiro<LinhaEquipamento>(totaisDaLinhaEquipamento, (r) =>
        r.tipo === "grupo" ? "font-medium" : undefined,
      ),
    ],
    [podeVerLancamentos],
  );

  return (
    <DataTable
      idTabela="financeiro.relatorios.aquisicoes.equipamentos"
      columns={colunas}
      data={dados}
      idDaLinha={(r) => r.id}
      semPaginacao
      classeDaLinha={(r) => (r.tipo === "grupo" ? "bg-surface/40 hover:bg-surface/40" : undefined)}
      rodape={rodapeTotal("equipamento", total)}
    />
  );
}

/** Uma linha por rateio da cota: o mesmo lançamento pode repetir. */
type LinhaConsorcio = AquisicaoLinha & { id: string };

function TabelaConsorcios({ linhas, podeVerLancamentos }: AquisicoesTabelaProps) {
  const cotas = React.useMemo<LinhaConsorcio[]>(
    () => consorciosDe(linhas).map((l, i) => ({ ...l, id: `${l.lancamentoId}-${l.centroId}-${i}` })),
    [linhas],
  );
  const total = React.useMemo(() => somarAquisicoes(cotas), [cotas]);

  const colunas = React.useMemo<ColumnDef<LinhaConsorcio, unknown>[]>(
    () => [
      {
        id: "lancamento",
        header: "Lançamento",
        size: 140,
        enableSorting: false,
        meta: { atomico: true, celular: "titulo" },
        cell: ({ row }) => {
          const l = row.original;
          return (
            <span className="tabular-nums">
              {podeVerLancamentos && l.lancamentoId ? (
                <LinkDrill href={detalheLancamento(l.lancamentoId)} titulo={`Lançamento ${l.numero ?? ""}`}>
                  {l.numero ?? "—"}
                </LinkDrill>
              ) : (
                (l.numero ?? "—")
              )}
            </span>
          );
        },
      },
      {
        id: "descricao",
        header: "Descrição",
        size: 240,
        enableSorting: false,
        cell: ({ row }) => row.original.descricao ?? "",
      },
      {
        id: "administradora",
        header: "Administradora",
        size: 180,
        enableSorting: false,
        cell: ({ row }) => (
          <span className="text-muted-foreground">{row.original.fornecedor ?? ""}</span>
        ),
      },
      {
        id: "parcelas",
        header: "Parcelas",
        size: 110,
        enableSorting: false,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) => <span className="tabular-nums">{rotuloParcelas(row.original)}</span>,
      },
      ...colunasDinheiro<LinhaConsorcio>((l) => l),
    ],
    [podeVerLancamentos],
  );

  return (
    <DataTable
      idTabela="financeiro.relatorios.aquisicoes.consorcios"
      columns={colunas}
      data={cotas}
      idDaLinha={(l) => l.id}
      semPaginacao
      rodape={rodapeTotal("lancamento", total)}
    />
  );
}

/**
 * Duas tabelas: os bens comprados, agrupados pelo centro raiz, e as cotas de
 * consórcio ainda a contemplar, uma por lançamento.
 */
export function AquisicoesTabela({ linhas, podeVerLancamentos }: AquisicoesTabelaProps) {
  const temEquipamento = linhas.some((l) => l.tipo === "equipamento");
  const temConsorcio = linhas.some((l) => l.tipo === "consorcio");
  if (!temEquipamento && !temConsorcio) {
    return (
      <EmptyState
        icone={BarChart3}
        titulo="Nenhuma aquisição lançada"
        descricao="Entram aqui os lançamentos a pagar em centros de imobilizado ou com a categoria Aquisição de Equipamento ou Consórcio a contemplar."
      />
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {temEquipamento ? (
        <Secao titulo="Equipamentos adquiridos">
          <TabelaEquipamentos linhas={linhas} podeVerLancamentos={podeVerLancamentos} />
        </Secao>
      ) : null}
      {temConsorcio ? (
        <Secao
          titulo="Consórcios"
          nota="Cotas ainda a contemplar ficam em Aquisição de Equipamentos › Consórcios a contemplar; contemplada, a cota vai para a etapa do bem."
        >
          <TabelaConsorcios linhas={linhas} podeVerLancamentos={podeVerLancamentos} />
        </Secao>
      ) : null}
    </div>
  );
}
