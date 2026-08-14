import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BarChart3, CalendarClock, Layers, Receipt, Wallet } from "lucide-react";

import {
  EmptyState,
  GradeKpis,
  KPICard,
  MoneyText,
  PageHeader,
} from "@/components/canonicos";
import { formatarBRL, formatarPercentual } from "@/lib/formatadores";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { formatarCompetencia } from "@/modules/rh/_shared/formato";
import { rotuloMesCurto } from "@/modules/gestao/calculo";
import { ComposicaoGrupos } from "@/modules/gestao/components/composicao-grupos";
import {
  CustoCentroGrafico,
  CustoMesGrafico,
  VencimentosGrafico,
} from "@/modules/gestao/components/graficos";
import { MaioresCustosTabela } from "@/modules/gestao/components/maiores-custos-tabela";
import { Painel, PainelComFalha } from "@/modules/gestao/components/painel";
import {
  aPagarPorVencimento,
  comprasResumo,
  custoPorCentroCusto,
  custoPorGrupo,
  custoPorMes,
  financeiroResumo,
  maioresCustos,
  opcoesDoPainel,
  rhResumo,
} from "@/modules/gestao/queries";
import { lerFiltrosPainel } from "@/modules/gestao/filtros";
import { PainelFiltros } from "@/modules/gestao/components/painel-filtros";

export const metadata = {
  title: "Gestão",
};

/**
 * Lê o valor de um bloco que pode ter falhado. O painel carrega tudo em
 * paralelo e cada bloco vive por conta própria: um erro no RH não pode apagar
 * o custo da obra da tela.
 */
function ler<T>(
  resultado: PromiseSettledResult<T>,
  conteudo: (dados: T) => ReactNode,
): ReactNode {
  return resultado.status === "fulfilled" ? conteudo(resultado.value) : "—";
}

/** Registra a falha uma vez, para o erro não sumir silenciosamente. */
function registrarFalhas(blocos: Record<string, PromiseSettledResult<unknown>>) {
  for (const [nome, resultado] of Object.entries(blocos)) {
    if (resultado.status === "rejected") {
      console.error(`[gestao] falha ao carregar ${nome}:`, resultado.reason);
    }
  }
}

/**
 * "+12% vs jul/26". O percentual só aparece quando os dois meses têm custo:
 * comparar com zero dá "+100%" e o mês corrente zerado dá "-100%", que no dia
 * 1 do mês assusta sem informar. Nesses casos mostramos o número do mês
 * anterior, que é a informação de verdade.
 */
function textoVariacao(
  variacao: number | null,
  atual: number,
  anterior: number,
  mesAnterior: string,
): string {
  const rotulo = rotuloMesCurto(mesAnterior);
  if (anterior === 0) return `Sem custo em ${rotulo}`;
  if (atual === 0) return `Nada lançado ainda. ${rotulo}: ${formatarBRL(anterior)}`;
  if (variacao === null) return `Mês anterior ${formatarBRL(anterior)}`;
  const sinal = variacao > 0 ? "+" : "";
  return `${sinal}${formatarPercentual(variacao, 0)} vs ${rotulo}`;
}

export default async function GestaoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!temPermissao(usuario, "gestao.painel", "ver")) {
    notFound();
  }

  // A leitura da URL mora em `gestao/filtros.ts`, e a janela sai de lá: sem
  // filtro ela é a mesma dos últimos seis meses que a tela sempre usou.
  const { filtros, valores, temRecorte } = lerFiltrosPainel(await searchParams);
  const { janela } = filtros;
  const periodo = `${rotuloMesCurto(janela.meses[0])} a ${rotuloMesCurto(
    janela.meses[janela.meses.length - 1],
  )}`;

  const [
    compras,
    custo,
    centros,
    grupos,
    vencimentos,
    maiores,
    financeiro,
    rh,
    opcoes,
  ] = await Promise.allSettled([
    comprasResumo(),
    custoPorMes(filtros),
    custoPorCentroCusto(filtros),
    custoPorGrupo(filtros),
    aPagarPorVencimento(),
    maioresCustos(filtros),
    financeiroResumo(),
    rhResumo(),
    opcoesDoPainel(),
  ]);

  registrarFalhas({
    compras,
    custo,
    "custo por centro de custo": centros,
    "custo por grupo": grupos,
    vencimentos,
    "maiores custos": maiores,
    financeiro,
    RH: rh,
    "opções dos filtros": opcoes,
  });

  /**
   * Marca o bloco que NÃO obedece ao recorte por obra e categoria.
   *
   * Estes números são foto do momento (o que está em aberto, o que espera
   * aprovação, quantos colaboradores existem) ou contagem de documento sem obra,
   * então filtrar por obra não faz sentido neles. O que não pode acontecer é o
   * número ficar parado enquanto o resto da tela muda e ninguém entender por quê:
   * é o mesmo defeito silencioso do resto do dia. O período de propósito não
   * dispara o aviso: "hoje" não muda com o período escolhido.
   */
  function semRecorte(detalhe: ReactNode): ReactNode {
    if (!temRecorte) return detalhe;
    return (
      <>
        {detalhe}
        <span className="block text-legenda text-muted-foreground">
          Total da empresa, não filtrado
        </span>
      </>
    );
  }

  /** Mesma marca, para a `descricao` de seção (que é texto). */
  const avisoSecao = temRecorte
    ? " Não obedece ao filtro de obra e categoria."
    : "";

  return (
    <div className="space-y-4">
      <PageHeader
        modulo="Gestão"
        titulo="Painel"
        descricao={`Custo, caixa e pendências da EMT. Custo por mês de referência, ${periodo}.`}
      />

      {/* A barra fica logo abaixo do cabeçalho, antes dos números, porque é ela
          que define de que conjunto os números falam. Se as opções falharem, o
          painel continua funcionando sem filtro em vez de sumir da tela. */}
      {opcoes.status === "fulfilled" ? (
        <PainelFiltros
          valores={valores}
          centros={opcoes.value.centros}
          categorias={opcoes.value.categorias}
        />
      ) : null}

      {/* Os números que decidem o dia: o que a obra custou, o que o caixa tem
          pela frente, o que está parado esperando alguém e o que já saiu. */}
      <GradeKpis>
        <KPICard
          titulo="Custo do mês"
          valor={ler(custo, (d) => <MoneyText valor={d.mesAtual.valor} />)}
          detalhe={ler(custo, (d) =>
            textoVariacao(
              d.variacao,
              d.mesAtual.valor,
              d.mesAnterior.valor,
              d.mesAnterior.mes,
            ),
          )}
          href="/financeiro/relatorios?rel=custo-cc"
        />
        <KPICard
          titulo="A pagar em aberto"
          valor={ler(vencimentos, (d) => <MoneyText valor={d.total} />)}
          detalhe={semRecorte(
            ler(vencimentos, (d) =>
              d.vencido > 0 ? (
                <>
                  Vencido <MoneyText valor={d.vencido} />
                </>
              ) : (
                "Nada vencido"
              ),
            ),
          )}
          href="/financeiro/pagamentos"
        />
        <KPICard
          titulo="Vence em até 7 dias"
          valor={ler(financeiro, (d) => <MoneyText valor={d.aPagar.valor} />)}
          detalhe={semRecorte(
            ler(
              financeiro,
              (d) =>
                `${d.aPagar.contagem} parcela(s) aprovada(s), ${d.aPagar.vencidas} vencida(s)`,
            ),
          )}
          href="/financeiro/pagamentos"
        />
        <KPICard
          titulo="Pagamentos a aprovar"
          valor={ler(financeiro, (d) => d.aAprovar.contagem)}
          detalhe={semRecorte(
            ler(financeiro, (d) => <MoneyText valor={d.aAprovar.valor} />),
          )}
          href="/financeiro/aprovacao-pagamentos"
        />
        <KPICard
          titulo="Pago no mês"
          valor={ler(financeiro, (d) => <MoneyText valor={d.pagoNoMes.valor} />)}
          detalhe={semRecorte(
            ler(
              financeiro,
              (d) => `${d.pagoNoMes.contagem} pagamento(s) no caixa`,
            ),
          )}
          href="/financeiro/pagamentos"
        />
      </GradeKpis>

      <div className="grid gap-4 lg:grid-cols-2">
        <Painel
          titulo="Custo por mês de referência"
          descricao={`Regime de competência, ${periodo}. O mês corrente ainda está em curso.`}
          destaque={ler(custo, (d) => <MoneyText valor={d.total} />)}
          rotuloDestaque="Total do período"
          link={{
            href: "/financeiro/relatorios?rel=custo-cc",
            rotulo: "Abrir relatório",
          }}
        >
          {custo.status === "rejected" ? (
            <PainelComFalha titulo="o custo por mês" />
          ) : custo.value.total === 0 ? (
            <EmptyState
              icone={BarChart3}
              titulo="Sem custo nos últimos meses"
              descricao="O custo aparece aqui quando um lançamento a pagar recebe mês de referência. Aprovar uma ordem de compra já gera esse lançamento."
              acao={
                <Link
                  href="/financeiro/lancamentos"
                  className="text-detalhe text-muted-foreground hover:text-foreground hover:underline"
                >
                  Abrir lançamentos
                </Link>
              }
            />
          ) : (
            <CustoMesGrafico meses={custo.value.meses} />
          )}
        </Painel>

        <Painel
          titulo="A pagar por prazo de vencimento"
          descricao={`Parcelas em aberto pelo prazo até o vencimento. É o que o caixa precisa suportar.${avisoSecao}`}
          destaque={ler(vencimentos, (d) => <MoneyText valor={d.total} />)}
          rotuloDestaque="Em aberto"
          link={{ href: "/financeiro/pagamentos", rotulo: "Abrir pagamentos" }}
        >
          {vencimentos.status === "rejected" ? (
            <PainelComFalha titulo="os vencimentos" />
          ) : vencimentos.value.total === 0 ? (
            <EmptyState
              icone={CalendarClock}
              titulo="Nenhuma parcela em aberto"
              descricao="As parcelas entram aqui quando um lançamento a pagar é criado com vencimento e ainda não foi pago."
              acao={
                <Link
                  href="/financeiro/lancamentos"
                  className="text-detalhe text-muted-foreground hover:text-foreground hover:underline"
                >
                  Abrir lançamentos
                </Link>
              }
            />
          ) : (
            <VencimentosGrafico faixas={vencimentos.value.faixas} />
          )}
        </Painel>

        <Painel
          titulo="Custo por centro de custo"
          descricao={`Onde o dinheiro está indo, ${periodo}. Maiores primeiro.`}
          destaque={ler(centros, (d) => `${d.quantidade}`)}
          rotuloDestaque="Centros com gasto"
          link={{
            href: "/financeiro/relatorios?rel=custo-cc",
            rotulo: "Abrir relatório",
          }}
        >
          {centros.status === "rejected" ? (
            <PainelComFalha titulo="o custo por centro de custo" />
          ) : centros.value.centros.length === 0 ? (
            <EmptyState
              icone={Wallet}
              titulo="Nenhum centro de custo com gasto"
              descricao="Todo lançamento a pagar é rateado em centro de custo. Sem lançamento no período, não há o que ratear."
              acao={
                <Link
                  href="/cadastros/centros-custo"
                  className="text-detalhe text-muted-foreground hover:text-foreground hover:underline"
                >
                  Ver centros de custo
                </Link>
              }
            />
          ) : (
            <CustoCentroGrafico centros={centros.value.centros} />
          )}
        </Painel>

        <Painel
          titulo="Custo por grupo de insumo"
          descricao={`Quanto foi material, mão de obra, equipamento e serviço, ${periodo}.`}
          destaque={ler(grupos, (d) => <MoneyText valor={d.total} />)}
          rotuloDestaque="Total do período"
          link={{
            href: "/financeiro/relatorios?rel=custo-grupo",
            rotulo: "Abrir relatório",
          }}
        >
          {grupos.status === "rejected" ? (
            <PainelComFalha titulo="o custo por grupo" />
          ) : grupos.value.grupos.length === 0 ? (
            <EmptyState
              icone={Layers}
              titulo="Sem custo por grupo no período"
              descricao="O grupo vem do insumo dos itens da ordem de compra. Lançamento avulso, sem insumo, aparece na linha própria assim que existir."
              acao={
                <Link
                  href="/compras/ordens"
                  className="text-detalhe text-muted-foreground hover:text-foreground hover:underline"
                >
                  Abrir ordens de compra
                </Link>
              }
            />
          ) : (
            <ComposicaoGrupos grupos={grupos.value.grupos} />
          )}
        </Painel>
      </div>

      <Painel
        titulo="Maiores custos do período"
        descricao={`${valores.centro === "" ? "Os lançamentos a pagar de maior valor" : "Maiores custos nesta obra, pelo valor rateado nela"}, ${periodo}.`}
        link={{
          href: "/financeiro/lancamentos",
          rotulo: "Abrir lançamentos",
        }}
      >
        {maiores.status === "rejected" ? (
          <PainelComFalha titulo="os maiores custos" />
        ) : maiores.value.length === 0 ? (
          <EmptyState
            icone={Receipt}
            titulo="Nenhum lançamento no período"
            descricao="Assim que houver lançamento a pagar com mês de referência no período, os maiores aparecem aqui."
          />
        ) : (
          <MaioresCustosTabela custos={maiores.value} />
        )}
      </Painel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Painel
          titulo="Compras"
          descricao={`O que está parado esperando decisão.${avisoSecao}`}
          link={{ href: "/compras/ordens", rotulo: "Abrir compras" }}
        >
          {compras.status === "rejected" ? (
            <PainelComFalha titulo="o resumo de Compras" />
          ) : (
            <GradeKpis>
              <KPICard
                titulo="OCs a aprovar"
                valor={compras.value.ocsAprovar.contagem}
                detalhe={<MoneyText valor={compras.value.ocsAprovar.valor} />}
                href="/compras/ordens"
              />
              <KPICard
                titulo="OCs aprovadas"
                valor={<MoneyText valor={compras.value.ocsAbertas.valor} />}
                detalhe={`${compras.value.ocsAbertas.contagem} ordem(ns)`}
                href="/compras/ordens"
              />
              <KPICard
                titulo="Cotações em aberto"
                valor={compras.value.cotacoesAbertas}
                href="/compras/cotacoes"
              />
            </GradeKpis>
          )}
        </Painel>

        <Painel
          titulo="RH"
          descricao={`Equipe e folha do mês.${avisoSecao}`}
          link={{ href: "/rh/folha", rotulo: "Abrir RH" }}
        >
          {rh.status === "rejected" ? (
            <PainelComFalha titulo="o resumo do RH" />
          ) : (
            <GradeKpis>
              <KPICard
                titulo="Colaboradores ativos"
                valor={rh.value.colaboradoresAtivos}
                href="/cadastros/colaboradores"
              />
              <KPICard
                titulo="Custo da folha"
                valor={<MoneyText valor={rh.value.folha.custoTotal} />}
                detalhe={
                  rh.value.folha.competencia
                    ? formatarCompetencia(rh.value.folha.competencia)
                    : "Sem folha lançada"
                }
                href="/rh/folha"
              />
              <KPICard
                titulo="Apontamentos em aberto"
                valor={rh.value.apontamentosAbertos}
                href="/rh/apontamentos"
              />
            </GradeKpis>
          )}
        </Painel>
      </div>
    </div>
  );
}
