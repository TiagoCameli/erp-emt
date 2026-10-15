"use client";

import * as React from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { BarChart3 } from "lucide-react";

import { DataTable, EmptyState, MoneyText } from "@/components/canonicos";
import { formatarBRL, formatarData, formatarMesAno } from "@/lib/formatadores";
import { cn } from "@/lib/utils";
import {
  agruparEquipamentos,
  consorciosDe,
  divergenciaDaCota,
  resumirQuitacao,
  rotuloParcelas,
  somarAquisicoes,
  type AquisicaoLinha,
  type TotaisAquisicao,
} from "@/modules/financeiro/relatorios/aquisicoes";
import { BarraProporcional } from "@/modules/financeiro/relatorios/components/barra-proporcional";
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

/** Mês da última parcela em aberto; "quitado" quando não sobra nada. */
function Quitacao({ linha }: { linha: AquisicaoLinha }) {
  if (Math.round(linha.aPagar * 100) <= 0) {
    return <span className="text-muted-foreground">quitado</span>;
  }
  return (
    <span className="tabular-nums" title={linha.proximoVencimento ? `Próxima parcela em ${formatarData(linha.proximoVencimento)}` : undefined}>
      {formatarMesAno(linha.ultimoVencimento)}
    </span>
  );
}

/**
 * O topo do relatório: quanto falta pagar das máquinas e dos consórcios, até
 * quando, e o que ainda não está em Financeiro > Dívidas.
 */
function ResumoQuitacao({ linhas }: { linhas: AquisicaoLinha[] }) {
  const r = React.useMemo(() => resumirQuitacao(linhas), [linhas]);
  const total = r.equipamentos.aPagar + r.consorcios.aPagar;
  if (r.maiores.length === 0) {
    return <p className="text-corpo text-foreground">Nenhuma máquina nem cota de consórcio com saldo a pagar.</p>;
  }
  const maximo = r.maiores[0]?.aPagar ?? 0;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex max-w-4xl flex-col gap-1">
        <p className="text-corpo text-foreground">
          Faltam <strong className="font-semibold tabular-nums">{formatarBRL(total)}</strong> para quitar máquinas e
          consórcios:{" "}
          {r.equipamentos.bens > 0 ? (
            <>
              <span className="tabular-nums">{formatarBRL(r.equipamentos.aPagar)}</span> em {r.equipamentos.bens}{" "}
              {r.equipamentos.bens === 1 ? "bem" : "bens"}
              {r.equipamentos.quitacao ? <> até {formatarMesAno(r.equipamentos.quitacao)}</> : null}
            </>
          ) : null}
          {r.equipamentos.bens > 0 && r.consorcios.cotas > 0 ? " e " : null}
          {r.consorcios.cotas > 0 ? (
            <>
              <span className="tabular-nums">{formatarBRL(r.consorcios.aPagar)}</span> em {r.consorcios.cotas}{" "}
              {r.consorcios.cotas === 1 ? "cota" : "cotas"} de consórcio
              {r.consorcios.quitacao ? <> até {formatarMesAno(r.consorcios.quitacao)}</> : null}
            </>
          ) : null}
          .
        </p>
        {r.foraDeDividas.nomes.length > 0 ? (
          <p className="text-detalhe text-muted-foreground">
            <span className="tabular-nums">{formatarBRL(r.foraDeDividas.aPagar)}</span> são de{" "}
            {r.foraDeDividas.nomes.length} {r.foraDeDividas.nomes.length === 1 ? "bem financiado" : "bens financiados"} que
            ainda não {r.foraDeDividas.nomes.length === 1 ? "está" : "estão"} em Financeiro › Dívidas: o saldo vem das
            parcelas do lançamento, sem o contrato para conferir juros e saldo devedor.
          </p>
        ) : null}
      </div>
      <ul className="flex flex-col gap-2">
        {r.maiores.map((l, i) => (
          <li
            key={l.tipo === "consorcio" ? `cota:${l.lancamentoId}` : `bem:${l.centroId}`}
            className="grid grid-cols-[minmax(0,1fr)_8.5rem] items-center gap-x-3 gap-y-1 md:grid-cols-[minmax(12rem,20rem)_minmax(0,1fr)_8.5rem_7rem]"
          >
            <span className="min-w-0 truncate text-detalhe text-foreground" title={l.descricao ?? l.centro}>
              {l.tipo === "consorcio" ? (l.descricao ?? l.numero ?? "Cota de consórcio") : l.centro}
            </span>
            <BarraProporcional
              valor={l.aPagar}
              maximo={maximo}
              ordem={i}
              cor={l.tipo === "consorcio" ? "bg-chart-3" : "bg-chart-2"}
              className="col-span-2 row-start-2 md:col-span-1 md:col-start-2 md:row-start-1"
            />
            <MoneyText valor={l.aPagar} className="text-right text-detalhe font-medium text-foreground" />
            <span
              className={cn(
                "hidden text-right text-detalhe md:block",
                l.divida === null ? "text-chart-2" : "text-muted-foreground",
              )}
              title={l.divida === null ? "Não está em Financeiro › Dívidas" : undefined}
            >
              até {formatarMesAno(l.ultimoVencimento)}
            </span>
          </li>
        ))}
      </ul>
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
      {
        id: "quitacao",
        header: "Quitação",
        size: 120,
        enableSorting: false,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) =>
          row.original.tipo === "bem" ? <Quitacao linha={row.original.linha} /> : null,
      },
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
      {
        id: "restam",
        header: "Restam",
        size: 90,
        enableSorting: false,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) => (
          <span className="tabular-nums">{row.original.parcelasAbertas || ""}</span>
        ),
      },
      {
        id: "quitacao",
        header: "Quitação",
        size: 120,
        enableSorting: false,
        meta: { alinharDireita: true, atomico: true },
        cell: ({ row }) => <Quitacao linha={row.original} />,
      },
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
  const divergentes = consorciosDe(linhas).filter((l) => divergenciaDaCota(l) !== 0);
  return (
    <div className="flex flex-col gap-6">
      <ResumoQuitacao linhas={linhas} />
      {temEquipamento ? (
        <Secao titulo="Equipamentos adquiridos">
          <TabelaEquipamentos linhas={linhas} podeVerLancamentos={podeVerLancamentos} />
        </Secao>
      ) : null}
      {temConsorcio ? (
        <Secao
          titulo="Consórcios"
          nota={`Cotas ainda a contemplar ficam em Aquisição de Equipamentos › Consórcios a contemplar; contemplada, a cota vai para a etapa do bem. O a pagar e as parcelas que restam vêm do cronograma da cota em Financeiro › Dívidas.${
            divergentes.length > 0
              ? ` Em ${divergentes.length} cota(s) o cronograma difere do lançamento (${divergentes
                  .map((l) => `${l.numero ?? "cota"}: ${formatarBRL(Math.abs(divergenciaDaCota(l)))}`)
                  .join("; ")}).`
              : ""
          }`}
        >
          <TabelaConsorcios linhas={linhas} podeVerLancamentos={podeVerLancamentos} />
        </Secao>
      ) : null}
    </div>
  );
}
