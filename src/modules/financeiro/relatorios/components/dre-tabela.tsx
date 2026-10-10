import Link from "next/link";

import { MoneyText } from "@/components/canonicos";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

function SecaoDre({
  titulo,
  linhas,
  total,
  rotuloTotal,
  tipo,
  periodo,
  podeVerLancamentos,
  natureza,
  retencao,
}: {
  titulo: string;
  linhas: DreLinha[];
  total: number;
  rotuloTotal: string;
  /** Receita ou despesa: decide o `tipo` do lançamento no destino do clique. */
  tipo: "a_pagar" | "a_receber";
  periodo: PeriodoCompetencia;
  podeVerLancamentos: boolean;
  /** A natureza do bloco, para o clique cortar a lista pela mesma régua. */
  natureza: Natureza;
  /**
   * Retenção na fonte das receitas da seção. Presente, a seção fecha em três
   * linhas (Receita bruta, (-) Retenções na fonte, Receita líquida) em vez do
   * total simples: as linhas de categoria somam o LÍQUIDO, e sem a bruta ao
   * lado quem compara com a nota fiscal acha que falta dinheiro.
   */
  retencao?: number;
}) {
  return (
    <>
      <TableRow className="bg-surface hover:bg-surface">
        <TableCell
          colSpan={2}
          className="py-2 text-center text-detalhe font-semibold text-foreground uppercase tracking-wide"
        >
          {titulo}
        </TableCell>
      </TableRow>
      {linhas.length > 0 ? (
        linhas.map((linha) => (
          <TableRow key={`${titulo}-${linha.categoriaId ?? "sem"}`}>
            <TableCell className="py-2 text-center text-detalhe text-foreground">
              {/* Linha "sem categoria" não vira link: não há categoria para
                  filtrar, e um link que abrisse a lista inteira mentiria sobre o
                  que ele mostra. */}
              {linha.categoriaId && podeVerLancamentos ? (
                <LinkDrill
                  href={drillCategoriaCompetencia({
                    categoriaId: linha.categoriaId,
                    periodo,
                    tipo,
                    natureza,
                  })}
                  titulo={`Ver os lançamentos de ${linha.categoria} neste período`}
                >
                  {linha.categoria}
                </LinkDrill>
              ) : (
                linha.categoria
              )}
            </TableCell>
            <TableCell className="py-2 text-right">
              <MoneyText valor={linha.valor} className="text-detalhe" />
            </TableCell>
          </TableRow>
        ))
      ) : (
        <TableRow>
          <TableCell
            colSpan={2}
            className="py-2 text-center text-detalhe text-muted-foreground"
          >
            Sem lançamentos no período
          </TableCell>
        </TableRow>
      )}
      {retencao !== undefined ? (
        <>
          <TableRow className="border-t hover:bg-transparent">
            <TableCell className="py-2 text-center text-detalhe text-foreground">
              Receita bruta
            </TableCell>
            <TableCell className="py-2 text-right">
              <MoneyText valor={total + retencao} className="text-detalhe" />
            </TableCell>
          </TableRow>
          <TableRow className="hover:bg-transparent">
            <TableCell className="py-2 text-center text-detalhe text-muted-foreground">
              (-) Retenções na fonte
            </TableCell>
            <TableCell className="py-2 text-right">
              <MoneyText
                valor={-retencao}
                className="text-detalhe text-muted-foreground"
              />
            </TableCell>
          </TableRow>
        </>
      ) : null}
      <TableRow
        className={cn(
          "hover:bg-transparent",
          retencao === undefined && "border-t",
        )}
      >
        <TableCell className="py-2 text-center text-detalhe font-medium text-foreground">
          {retencao !== undefined ? "Receita líquida" : rotuloTotal}
        </TableCell>
        <TableCell className="py-2 text-right">
          <MoneyText valor={total} className="text-detalhe font-medium" />
        </TableCell>
      </TableRow>
    </>
  );
}

/** Linha de subtotal de um bloco (resultado operacional, resultado financeiro). */
function SubtotalDre({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <TableRow className="border-t bg-surface/60 hover:bg-surface/60">
      <TableCell className="py-2 text-center text-detalhe font-semibold text-foreground">
        {rotulo}
      </TableCell>
      <TableCell className="py-2 text-right">
        <MoneyText
          valor={valor}
          className={cn(
            "text-detalhe font-semibold",
            classeDoSinal(sinalDoResultado(valor)),
          )}
        />
      </TableCell>
    </TableRow>
  );
}

/** Um bloco vazio não vira três linhas dizendo "sem lançamentos" três vezes. */
function blocoTemLinha(bloco: BlocoDre): boolean {
  return bloco.receitas.length > 0 || bloco.despesas.length > 0;
}

/** Aviso de linha inteira, antes de um bloco que fica FORA do resultado. */
function AvisoForaDoResultado({ children }: { children: React.ReactNode }) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell
        colSpan={2}
        className="pt-4 pb-1 text-center text-detalhe text-muted-foreground"
      >
        {children}
      </TableCell>
    </TableRow>
  );
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
 * Sem interatividade, renderiza no servidor.
 */
export function DreTabela({ dre, periodo, podeVerLancamentos }: DreTabelaProps) {
  const temFinanceiro = blocoTemLinha(dre.financeiro);
  const temInvestimento = blocoTemLinha(dre.investimento);
  const temMovimentacao = blocoTemLinha(dre.movimentacao);
  const temDistribuicao = blocoTemLinha(dre.distribuicao);
  const temMutuo = blocoTemLinha(dre.mutuo);
  const comum = { periodo, podeVerLancamentos };

  /** Retenção só vira linha fora do operacional quando existe. */
  const retencaoSeHouver = (bloco: BlocoDre) =>
    bloco.retencaoReceitas > 0 ? bloco.retencaoReceitas : undefined;

  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {/* Centralizado é o padrão de tabela do app (ver DataTable); só
                  dinheiro, quantidade, total, percentual e horas vão à direita. */}
              <TableHead className="h-9 px-3 text-center text-detalhe font-medium text-muted-foreground">
                Categoria
              </TableHead>
              <TableHead className="h-9 px-3 text-right text-detalhe font-medium text-muted-foreground">
                Valor
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="[&_td]:px-3">
            <SecaoDre
              titulo="Receitas"
              linhas={dre.operacional.receitas}
              total={dre.operacional.totalReceitas}
              rotuloTotal="Total de receitas"
              tipo="a_receber"
              natureza="operacional"
              // Sempre, mesmo zerada: é a linha que diz que a receita é líquida.
              retencao={dre.operacional.retencaoReceitas}
              {...comum}
            />
            <SecaoDre
              titulo="Despesas"
              linhas={dre.operacional.despesas}
              total={dre.operacional.totalDespesas}
              rotuloTotal="Total de despesas"
              tipo="a_pagar"
              natureza="operacional"
              {...comum}
            />
            {/* O subtotal operacional só faz sentido se houver um segundo bloco
                somando com ele. Sozinho, ele repetiria o resultado do período. */}
            {temFinanceiro ? (
              <SubtotalDre
                rotulo="Resultado operacional"
                valor={dre.operacional.resultado}
              />
            ) : null}

            {temFinanceiro ? (
              <>
                <SecaoDre
                  titulo="Receitas financeiras"
                  linhas={dre.financeiro.receitas}
                  total={dre.financeiro.totalReceitas}
                  rotuloTotal="Total de receitas financeiras"
                  tipo="a_receber"
                  natureza="financeira"
                  retencao={retencaoSeHouver(dre.financeiro)}
                  {...comum}
                />
                <SecaoDre
                  titulo="Despesas financeiras"
                  linhas={dre.financeiro.despesas}
                  total={dre.financeiro.totalDespesas}
                  rotuloTotal="Total de despesas financeiras"
                  tipo="a_pagar"
                  natureza="financeira"
                  {...comum}
                />
                <SubtotalDre
                  rotulo="Resultado financeiro"
                  valor={dre.financeiro.resultado}
                />
              </>
            ) : null}

            <TableRow className="border-t-2 bg-surface hover:bg-surface">
              <TableCell className="py-2.5 text-center text-corpo font-semibold text-foreground">
                Resultado do período
              </TableCell>
              <TableCell className="py-2.5 text-right">
                <MoneyText
                  valor={dre.resultado}
                  className={cn(
                    "text-corpo font-semibold",
                    classeDoSinal(sinalDoResultado(dre.resultado)),
                  )}
                />
              </TableCell>
            </TableRow>

            {temInvestimento ? (
              <>
                <AvisoForaDoResultado>
                  Abaixo, investimentos: máquina, equipamento e terreno
                  comprados. Saíram do caixa e viraram patrimônio, então{" "}
                  <strong className="font-medium text-foreground">
                    não entram no resultado
                  </strong>{" "}
                  do período acima.
                </AvisoForaDoResultado>
                {dre.investimento.receitas.length > 0 ? (
                  <SecaoDre
                    titulo="Entradas de investimentos"
                    linhas={dre.investimento.receitas}
                    total={dre.investimento.totalReceitas}
                    rotuloTotal="Total de entradas"
                    tipo="a_receber"
                    natureza="investimento"
                    retencao={retencaoSeHouver(dre.investimento)}
                    {...comum}
                  />
                ) : null}
                <SecaoDre
                  titulo="Investimentos"
                  linhas={dre.investimento.despesas}
                  total={dre.investimento.totalDespesas}
                  rotuloTotal="Total de investimentos"
                  tipo="a_pagar"
                  natureza="investimento"
                  {...comum}
                />
              </>
            ) : null}

            {temMovimentacao ? (
              <>
                <AvisoForaDoResultado>
                  Abaixo, dinheiro que passou pela conta e{" "}
                  <strong className="font-medium text-foreground">
                    não é resultado
                  </strong>
                  : principal de aplicação, resgate e empréstimo. Não entra no
                  resultado do período acima.
                </AvisoForaDoResultado>
                <SecaoDre
                  titulo="Entradas de movimentação"
                  linhas={dre.movimentacao.receitas}
                  total={dre.movimentacao.totalReceitas}
                  rotuloTotal="Total de entradas"
                  tipo="a_receber"
                  natureza="movimentacao"
                  retencao={retencaoSeHouver(dre.movimentacao)}
                  {...comum}
                />
                <SecaoDre
                  titulo="Saídas de movimentação"
                  linhas={dre.movimentacao.despesas}
                  total={dre.movimentacao.totalDespesas}
                  rotuloTotal="Total de saídas"
                  tipo="a_pagar"
                  natureza="movimentacao"
                  {...comum}
                />
              </>
            ) : null}

            {temDistribuicao ? (
              <>
                <AvisoForaDoResultado>
                  Abaixo, distribuições a sócios: o que foi para James e Tiago
                  e as despesas pessoais da família pagas pela EMT. É retirada,{" "}
                  <strong className="font-medium text-foreground">
                    não é custo
                  </strong>{" "}
                  e fica fora do resultado do período acima.
                </AvisoForaDoResultado>
                <SecaoDre
                  titulo="Distribuições a sócios"
                  linhas={dre.distribuicao.despesas}
                  total={dre.distribuicao.totalDespesas}
                  rotuloTotal="Total distribuído"
                  tipo="a_pagar"
                  natureza="distribuicao"
                  {...comum}
                />
                {dre.distribuicao.receitas.length > 0 ? (
                  <SecaoDre
                    titulo="Devolvido por sócios"
                    linhas={dre.distribuicao.receitas}
                    total={dre.distribuicao.totalReceitas}
                    rotuloTotal="Total devolvido"
                    tipo="a_receber"
                    natureza="distribuicao"
                    {...comum}
                  />
                ) : null}
              </>
            ) : null}

            {temMutuo ? (
              <>
                <AvisoForaDoResultado>
                  Abaixo, mútuo com empresas ligadas (Amazônia, Juruá FM): o
                  que a EMT pagou por elas é{" "}
                  <strong className="font-medium text-foreground">
                    empréstimo a receber
                  </strong>
                  , e o que voltou abate. Fora do resultado.
                </AvisoForaDoResultado>
                <SecaoDre
                  titulo="Mútuo concedido"
                  linhas={dre.mutuo.despesas}
                  total={dre.mutuo.totalDespesas}
                  rotuloTotal="Total enviado"
                  tipo="a_pagar"
                  natureza="mutuo"
                  {...comum}
                />
                <SecaoDre
                  titulo="Mútuo devolvido"
                  linhas={dre.mutuo.receitas}
                  total={dre.mutuo.totalReceitas}
                  rotuloTotal="Total devolvido"
                  tipo="a_receber"
                  natureza="mutuo"
                  {...comum}
                />
              </>
            ) : null}
          </TableBody>
        </Table>
      </div>
      {/* Nota FIXA, e não condicional ao período ter prestação: a ausência dos
          juros embutidos é regra do DRE (decisão D2, 03/10/2026), não um
          acidente do mês. Quem lê o resultado precisa saber, toda vez, onde
          está o custo do dinheiro emprestado. */}
      <p className="text-legenda text-muted-foreground">
        Prestações de empréstimo (principal e juros) não entram no resultado;
        veja{" "}
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
