"use client";

import * as React from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";

import { DataTable, MoneyText } from "@/components/canonicos";
import { cn } from "@/lib/utils";
import type { Natureza } from "@/modules/financeiro/relatorios/calculo";
import {
  drillCategoriaCompetencia,
  type PeriodoCompetencia,
} from "@/modules/financeiro/relatorios/drill";
import {
  classeDoSinal,
  sinalDoResultado,
} from "@/modules/financeiro/relatorios/relatorios";
import { LinkDrill } from "@/modules/financeiro/relatorios/components/link-drill";
import type { BlocoDre, DreGerencial, DreLinha } from "../queries";

/** A tela de Créditos, para onde a nota do rodapé manda quem procura os juros. */
const ROTA_CREDITOS = "/financeiro/relatorios?rel=creditos";

/**
 * Categorias que o `fn_rel_dre` soma também pelo CRONOGRAMA dos contratos e
 * das cotas (PR 5, 12/10/2026), no mês do vencimento. Essa parte não é
 * lançamento: o clique abre só o que foi lançado nela, e sem a nota a lista
 * parece não fechar com a linha.
 */
export const CATEGORIAS_DO_CRONOGRAMA = new Set([
  "Juros de empréstimos",
  "Taxa de administração de consórcio",
]);
export const NOTA_CRONOGRAMA = "Parte vem do cronograma dos contratos e consórcios (Financeiro > Dívidas)";

interface DreTabelaProps {
  dre: DreGerencial;
  /**
   * O período do DRE, para o clique abrir a MESMA competência.
   *
   * Não é mais um mês: desde 29/08/2026 a tela apura trimestre e ano, e um drill
   * preso no mês abriria um terço do que a linha somou.
   */
  periodo: PeriodoCompetencia;
  /** Sem permissão de ver lançamentos, a categoria não vira link (daria 404). */
  podeVerLancamentos: boolean;
}

/**
 * Uma linha da tabela do DRE. A tabela é uma lista só (o DataTable não tem
 * seção), então título de seção, aviso, categoria, total e subtotal viram
 * linhas com o tipo que decide como cada uma é pintada.
 */
type LinhaDre =
  | { tipo: "titulo"; id: string; titulo: string }
  | { tipo: "vazia"; id: string }
  | { tipo: "aviso"; id: string; conteudo: React.ReactNode }
  | {
      tipo: "categoria";
      id: string;
      linha: DreLinha;
      /** Receita ou despesa: decide o `tipo` do lançamento no destino do clique. */
      tipoLancamento: "a_pagar" | "a_receber";
      /** A natureza do bloco, para o clique cortar a lista pela mesma régua. */
      natureza: Natureza;
    }
  | { tipo: "bruta" | "retencao"; id: string; rotulo: string; valor: number }
  | {
      tipo: "total";
      id: string;
      rotulo: string;
      valor: number;
      /** Fechamento em três linhas: a borda de cima fica na Receita bruta. */
      comRetencao: boolean;
    }
  | { tipo: "subtotal" | "resultado"; id: string; rotulo: string; valor: number };

interface SecaoDre {
  titulo: string;
  linhas: DreLinha[];
  total: number;
  rotuloTotal: string;
  tipo: "a_pagar" | "a_receber";
  natureza: Natureza;
  /**
   * Retenção na fonte das receitas da seção. Presente, a seção fecha em três
   * linhas (Receita bruta, (-) Retenções na fonte, Receita líquida) em vez do
   * total simples: as linhas de categoria somam o LÍQUIDO, e sem a bruta ao
   * lado quem compara com a nota fiscal acha que falta dinheiro.
   */
  retencao?: number;
}

function linhasDaSecao({
  titulo,
  linhas,
  total,
  rotuloTotal,
  tipo,
  natureza,
  retencao,
}: SecaoDre): LinhaDre[] {
  const saida: LinhaDre[] = [{ tipo: "titulo", id: `${titulo}-titulo`, titulo }];
  if (linhas.length > 0) {
    for (const linha of linhas) {
      saida.push({
        tipo: "categoria",
        id: `${titulo}-${linha.categoriaId ?? "sem"}`,
        linha,
        tipoLancamento: tipo,
        natureza,
      });
    }
  } else {
    saida.push({ tipo: "vazia", id: `${titulo}-vazia` });
  }
  if (retencao !== undefined) {
    saida.push(
      { tipo: "bruta", id: `${titulo}-bruta`, rotulo: "Receita bruta", valor: total + retencao },
      {
        tipo: "retencao",
        id: `${titulo}-retencao`,
        rotulo: "(-) Retenções na fonte",
        valor: -retencao,
      },
    );
  }
  saida.push({
    tipo: "total",
    id: `${titulo}-total`,
    rotulo: retencao !== undefined ? "Receita líquida" : rotuloTotal,
    valor: total,
    comRetencao: retencao !== undefined,
  });
  return saida;
}

/** Um bloco vazio não vira três linhas dizendo "sem lançamentos" três vezes. */
function blocoTemLinha(bloco: BlocoDre): boolean {
  return bloco.receitas.length > 0 || bloco.despesas.length > 0;
}

/** Retenção só vira linha fora do operacional quando existe. */
function retencaoSeHouver(bloco: BlocoDre): number | undefined {
  return bloco.retencaoReceitas > 0 ? bloco.retencaoReceitas : undefined;
}

function montarLinhas(dre: DreGerencial): LinhaDre[] {
  const temFinanceiro = blocoTemLinha(dre.financeiro);
  const linhas: LinhaDre[] = [
    ...linhasDaSecao({
      titulo: "Receitas",
      linhas: dre.operacional.receitas,
      total: dre.operacional.totalReceitas,
      rotuloTotal: "Total de receitas",
      tipo: "a_receber",
      natureza: "operacional",
      // Sempre, mesmo zerada: é a linha que diz que a receita é líquida.
      retencao: dre.operacional.retencaoReceitas,
    }),
    ...linhasDaSecao({
      titulo: "Despesas",
      linhas: dre.operacional.despesas,
      total: dre.operacional.totalDespesas,
      rotuloTotal: "Total de despesas",
      tipo: "a_pagar",
      natureza: "operacional",
    }),
  ];

  // O subtotal operacional só faz sentido se houver um segundo bloco somando com
  // ele. Sozinho, ele repetiria o resultado do período.
  if (temFinanceiro) {
    linhas.push(
      {
        tipo: "subtotal",
        id: "resultado-operacional",
        rotulo: "Resultado operacional",
        valor: dre.operacional.resultado,
      },
      ...linhasDaSecao({
        titulo: "Receitas financeiras",
        linhas: dre.financeiro.receitas,
        total: dre.financeiro.totalReceitas,
        rotuloTotal: "Total de receitas financeiras",
        tipo: "a_receber",
        natureza: "financeira",
        retencao: retencaoSeHouver(dre.financeiro),
      }),
      ...linhasDaSecao({
        titulo: "Despesas financeiras",
        linhas: dre.financeiro.despesas,
        total: dre.financeiro.totalDespesas,
        rotuloTotal: "Total de despesas financeiras",
        tipo: "a_pagar",
        natureza: "financeira",
      }),
      {
        tipo: "subtotal",
        id: "resultado-financeiro",
        rotulo: "Resultado financeiro",
        valor: dre.financeiro.resultado,
      },
    );
  }

  linhas.push({
    tipo: "resultado",
    id: "resultado-periodo",
    rotulo: "Resultado do período",
    valor: dre.resultado,
  });

  if (blocoTemLinha(dre.investimento)) {
    linhas.push({
      tipo: "aviso",
      id: "aviso-investimento",
      conteudo: (
        <>
          Abaixo, investimentos: máquina, equipamento e terreno comprados.
          Saíram do caixa e viraram patrimônio, então{" "}
          <strong className="font-medium text-foreground">
            não entram no resultado
          </strong>{" "}
          do período acima.
        </>
      ),
    });
    if (dre.investimento.receitas.length > 0) {
      linhas.push(
        ...linhasDaSecao({
          titulo: "Entradas de investimentos",
          linhas: dre.investimento.receitas,
          total: dre.investimento.totalReceitas,
          rotuloTotal: "Total de entradas",
          tipo: "a_receber",
          natureza: "investimento",
          retencao: retencaoSeHouver(dre.investimento),
        }),
      );
    }
    linhas.push(
      ...linhasDaSecao({
        titulo: "Investimentos",
        linhas: dre.investimento.despesas,
        total: dre.investimento.totalDespesas,
        rotuloTotal: "Total de investimentos",
        tipo: "a_pagar",
        natureza: "investimento",
      }),
    );
  }

  if (blocoTemLinha(dre.movimentacao)) {
    linhas.push(
      {
        tipo: "aviso",
        id: "aviso-movimentacao",
        conteudo: (
          <>
            Abaixo, dinheiro que passou pela conta e{" "}
            <strong className="font-medium text-foreground">
              não é resultado
            </strong>
            : principal de aplicação, resgate e empréstimo. Não entra no
            resultado do período acima.
          </>
        ),
      },
      ...linhasDaSecao({
        titulo: "Entradas de movimentação",
        linhas: dre.movimentacao.receitas,
        total: dre.movimentacao.totalReceitas,
        rotuloTotal: "Total de entradas",
        tipo: "a_receber",
        natureza: "movimentacao",
        retencao: retencaoSeHouver(dre.movimentacao),
      }),
      ...linhasDaSecao({
        titulo: "Saídas de movimentação",
        linhas: dre.movimentacao.despesas,
        total: dre.movimentacao.totalDespesas,
        rotuloTotal: "Total de saídas",
        tipo: "a_pagar",
        natureza: "movimentacao",
      }),
    );
  }

  if (blocoTemLinha(dre.distribuicao)) {
    linhas.push(
      {
        tipo: "aviso",
        id: "aviso-distribuicao",
        conteudo: (
          <>
            Abaixo, distribuições a sócios: o que foi para James e Tiago e as
            despesas pessoais da família pagas pela EMT. É retirada,{" "}
            <strong className="font-medium text-foreground">
              não é custo
            </strong>{" "}
            e fica fora do resultado do período acima.
          </>
        ),
      },
      ...linhasDaSecao({
        titulo: "Distribuições a sócios",
        linhas: dre.distribuicao.despesas,
        total: dre.distribuicao.totalDespesas,
        rotuloTotal: "Total distribuído",
        tipo: "a_pagar",
        natureza: "distribuicao",
      }),
    );
    if (dre.distribuicao.receitas.length > 0) {
      linhas.push(
        ...linhasDaSecao({
          titulo: "Devolvido por sócios",
          linhas: dre.distribuicao.receitas,
          total: dre.distribuicao.totalReceitas,
          rotuloTotal: "Total devolvido",
          tipo: "a_receber",
          natureza: "distribuicao",
        }),
      );
    }
  }

  if (blocoTemLinha(dre.mutuo)) {
    linhas.push(
      {
        tipo: "aviso",
        id: "aviso-mutuo",
        conteudo: (
          <>
            Abaixo, mútuo com empresas ligadas (Amazônia, Juruá FM): o que a EMT
            pagou por elas é{" "}
            <strong className="font-medium text-foreground">
              empréstimo a receber
            </strong>
            , e o que voltou abate. Fora do resultado.
          </>
        ),
      },
      ...linhasDaSecao({
        titulo: "Mútuo concedido",
        linhas: dre.mutuo.despesas,
        total: dre.mutuo.totalDespesas,
        rotuloTotal: "Total enviado",
        tipo: "a_pagar",
        natureza: "mutuo",
      }),
      ...linhasDaSecao({
        titulo: "Mútuo devolvido",
        linhas: dre.mutuo.receitas,
        total: dre.mutuo.totalReceitas,
        rotuloTotal: "Total devolvido",
        tipo: "a_receber",
        natureza: "mutuo",
      }),
    );
  }

  return linhas;
}

/** Título de seção, aviso e "sem lançamentos" ocupam a largura toda. */
function linhaInteira(registro: LinhaDre): React.ReactNode {
  switch (registro.tipo) {
    case "titulo":
      return (
        <span className="font-semibold text-foreground uppercase tracking-wide">
          {registro.titulo}
        </span>
      );
    case "vazia":
      return (
        <span className="text-muted-foreground">Sem lançamentos no período</span>
      );
    case "aviso":
      // Aviso de linha inteira, antes de um bloco que fica FORA do resultado.
      return (
        <span className="block pt-2 text-muted-foreground">
          {registro.conteudo}
        </span>
      );
    default:
      return null;
  }
}

function classeDaLinha(registro: LinhaDre): string | undefined {
  switch (registro.tipo) {
    case "titulo":
      return "bg-surface hover:bg-surface";
    case "bruta":
      return "border-t hover:bg-transparent";
    case "retencao":
      return "hover:bg-transparent";
    case "total":
      return cn("hover:bg-transparent", !registro.comRetencao && "border-t");
    case "subtotal":
      // Subtotal de um bloco (resultado operacional, resultado financeiro).
      return "border-t bg-surface/60 hover:bg-surface/60";
    case "resultado":
      return "border-t-2 bg-surface hover:bg-surface";
    default:
      return undefined;
  }
}

/**
 * DRE gerencial do período em tabela, em quatro blocos: operacional (a obra),
 * financeiro (juros e tarifa), investimentos (CAPEX) e movimentação
 * patrimonial.
 *
 * Investimentos e movimentação aparecem DEPOIS do resultado do período e fora da
 * soma dele de propósito. Aplicar R$ 1 milhão do saldo à noite e resgatar na
 * manhã seguinte movimenta R$ 2 milhões na conta e não gera um centavo de
 * resultado — era o que fazia a varredura automática do banco responder por
 * 31,7% da "receita" de 2026. E comprar uma escavadeira troca dinheiro por
 * máquina (decisão D3, 03/10/2026). Os dois continuam na tela porque é dinheiro
 * que passou pela conta, e o extrato vai mostrá-lo de todo jeito.
 *
 * A receita operacional fecha em bruta, retenções e líquida: as linhas de
 * categoria somam o líquido (o que o cliente pagou), e a bruta é a da nota.
 *
 * As colunas não ordenam: ordenar embaralharia seções, totais e subtotais.
 */
export function DreTabela({ dre, periodo, podeVerLancamentos }: DreTabelaProps) {
  const linhas = React.useMemo(() => montarLinhas(dre), [dre]);

  const colunas = React.useMemo<ColumnDef<LinhaDre, unknown>[]>(
    () => [
      {
        id: "categoria",
        header: "Categoria",
        size: 420,
        enableSorting: false,
        meta: { rotulo: "Categoria", fixa: true, celular: "titulo" },
        cell: ({ row }) => {
          const registro = row.original;
          switch (registro.tipo) {
            case "categoria": {
              const { linha } = registro;
              return (
                <span className="text-foreground">
                  {/* Linha "sem categoria" não vira link: não há categoria para
                      filtrar, e um link que abrisse a lista inteira mentiria sobre
                      o que ele mostra. */}
                  {linha.categoriaId && podeVerLancamentos ? (
                    <LinkDrill
                      href={drillCategoriaCompetencia({
                        categoriaId: linha.categoriaId,
                        periodo,
                        tipo: registro.tipoLancamento,
                        natureza: registro.natureza,
                      })}
                      titulo={`Ver os lançamentos de ${linha.categoria} neste período`}
                    >
                      {linha.categoria}
                    </LinkDrill>
                  ) : (
                    linha.categoria
                  )}
                  {CATEGORIAS_DO_CRONOGRAMA.has(linha.categoria) ? (
                    <span className="block text-legenda text-muted-foreground">
                      {NOTA_CRONOGRAMA}
                    </span>
                  ) : null}
                </span>
              );
            }
            case "bruta":
              return <span className="text-foreground">{registro.rotulo}</span>;
            case "retencao":
              return (
                <span className="text-muted-foreground">{registro.rotulo}</span>
              );
            case "total":
              return (
                <span className="font-medium text-foreground">
                  {registro.rotulo}
                </span>
              );
            case "subtotal":
              return (
                <span className="font-semibold text-foreground">
                  {registro.rotulo}
                </span>
              );
            case "resultado":
              return (
                <span className="text-corpo font-semibold text-foreground">
                  {registro.rotulo}
                </span>
              );
            default:
              return null;
          }
        },
      },
      {
        id: "valor",
        header: "Valor",
        size: 180,
        enableSorting: false,
        meta: { rotulo: "Valor", alinharDireita: true, atomico: true, celular: "valor" },
        cell: ({ row }) => {
          const registro = row.original;
          switch (registro.tipo) {
            case "categoria":
              return (
                <MoneyText valor={registro.linha.valor} className="text-detalhe" />
              );
            case "bruta":
              return <MoneyText valor={registro.valor} className="text-detalhe" />;
            case "retencao":
              return (
                <MoneyText
                  valor={registro.valor}
                  className="text-detalhe text-muted-foreground"
                />
              );
            case "total":
              return (
                <MoneyText
                  valor={registro.valor}
                  className="text-detalhe font-medium"
                />
              );
            case "subtotal":
              return (
                <MoneyText
                  valor={registro.valor}
                  className={cn(
                    "text-detalhe font-semibold",
                    classeDoSinal(sinalDoResultado(registro.valor)),
                  )}
                />
              );
            case "resultado":
              return (
                <MoneyText
                  valor={registro.valor}
                  className={cn(
                    "text-corpo font-semibold",
                    classeDoSinal(sinalDoResultado(registro.valor)),
                  )}
                />
              );
            default:
              return null;
          }
        },
      },
    ],
    [periodo, podeVerLancamentos],
  );

  return (
    <div className="flex flex-col gap-2">
      <DataTable
        idTabela="financeiro.relatorios.dre"
        columns={colunas}
        data={linhas}
        idDaLinha={(registro) => registro.id}
        semPaginacao
        linhaInteira={linhaInteira}
        classeDaLinha={classeDaLinha}
      />
      {/* Nota FIXA, e não condicional ao período ter prestação: a prestação
          inteira fora do resultado é regra do DRE (decisão D2, 03/10/2026), não
          um acidente do mês. Desde o PR 5 (12/10/2026) os juros dos contratos
          com cronograma voltam ao resultado pelo vencimento; quem lê precisa
          saber, toda vez, onde está o resto do custo do dinheiro emprestado. */}
      <p className="text-legenda text-muted-foreground">
        Prestações de empréstimo não entram no resultado; os juros dos contratos
        ligados ao lançamento das prestações em Financeiro &gt; Dívidas entram em
        Juros de empréstimos no mês do vencimento (e saem de Pagamento de
        Empréstimo, que pode ficar negativo no mês). Saldo devedor e CET em{" "}
        <Link
          href={ROTA_CREDITOS}
          className="foco-anel rounded-sm font-medium text-foreground underline underline-offset-2"
        >
          Créditos
        </Link>
        .
      </p>
    </div>
  );
}
