import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BarChart3,
  CalendarClock,
  Layers,
  Receipt,
  Truck,
  Wallet,
} from "lucide-react";

import {
  EmptyState,
  GradeKpis,
  KPICard,
  MoneyText,
  PageHeader,
} from "@/components/canonicos";
import {
  dataHojeISO,
  formatarBRL,
  formatarPercentual,
} from "@/lib/formatadores";
import { linksDosCards } from "@/modules/gestao/links-cards";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { formatarCompetencia } from "@/modules/rh/_shared/formato";
import {
  resultadoDoPeriodo,
  rotuloMesCurto,
  type ResultadoDoPeriodo,
} from "@/modules/gestao/calculo";
import { ComposicaoGrupos } from "@/modules/gestao/components/composicao-grupos";
import {
  BarrasHorizontais,
  type LinhaBarra,
  type SerieDaLegenda,
} from "@/modules/gestao/components/barras-horizontais";
import {
  ReceitaDespesaGrafico,
  ResultadoMesGrafico,
} from "@/modules/gestao/components/graficos";
import { MaioresCustosTabela } from "@/modules/gestao/components/maiores-custos-tabela";
import { ResumoPeriodoTabela } from "@/modules/gestao/components/resumo-periodo-tabela";
import { Painel, PainelComFalha } from "@/modules/gestao/components/painel";
import {
  aPagarPorVencimento,
  comprasResumo,
  custoPorCentroCusto,
  custoPorGrupo,
  custoPorMes,
  filtrosDoBanco,
  financeiroResumo,
  maioresCustos,
  maioresFornecedores,
  opcoesDoPainel,
  receitaPorMes,
  rhResumo,
} from "@/modules/gestao/queries";
import { lerFiltrosPainel } from "@/modules/gestao/filtros";
import { PainelFiltros } from "@/modules/gestao/components/painel-filtros";

export const metadata = {
  title: "Gestão",
};

/** Âmbar: despesa, e o que ainda vai sair do caixa. */
const COR_DESPESA = "var(--color-chart-2)";
/** Asfalto: o que já saiu do caixa. */
const COR_PAGO = "var(--color-chart-3)";
/** Vermelho: só ESTADO (o que venceu), nunca uma série ao lado do verde. */
const COR_VENCIDO = "var(--color-chart-5)";

/**
 * As duas séries do bloco de fornecedores, para a legenda.
 *
 * Asfalto para o que já saiu e âmbar para o que ainda vai sair: são as duas
 * cores de maior separação do sistema (ΔE 30,6 em daltonismo, medido em
 * 01/09/2026), e a ordem da pilha é cronológica — o passado à esquerda.
 */
const SERIES_FORNECEDOR: SerieDaLegenda[] = [
  { rotulo: "Pago", cor: COR_PAGO },
  { rotulo: "Em aberto", cor: COR_DESPESA },
];

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

/**
 * A frase de rodapé do bloco de resultado: quantos meses fecharam de cada lado
 * e qual foi o pior.
 *
 * Vale mais que o gráfico sozinho porque responde a pergunta que a pessoa faz
 * depois de olhar as colunas ("foi um mês ruim ou é sempre assim?"), e porque o
 * pior mês é o que se investiga primeiro.
 */
function frasesDoResultado(resultado: ResultadoDoPeriodo): string {
  const { positivos, negativos, pior } = resultado;
  if (positivos + negativos === 0) {
    return "Nenhum mês do período teve lançamento.";
  }
  const contagem = `${positivos} ${positivos === 1 ? "mês positivo" : "meses positivos"}, ${negativos} ${negativos === 1 ? "negativo" : "negativos"}.`;
  if (pior === null || pior.resultado >= 0) return contagem;
  return `${contagem} O pior é ${pior.rotulo}: ${formatarBRL(pior.resultado)}.`;
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

  // As opções vêm ANTES do resto, e sozinhas: é o cadastro de centros que diz de
  // que raiz cada etapa é, e sem essa tradução as consultas não sabem o que
  // mandar em `p_centros`. É uma leitura de ~110 linhas, e ela já acontecia em
  // toda abertura desta tela; o que mudou é a ordem.
  //
  // Falha aqui NÃO derruba o painel: sem o cadastro a barra de filtros some e as
  // consultas usam as raízes cruas da URL, que é o recorte mais próximo do que
  // foi pedido. Melhor um painel sem barra que um painel em branco.
  const opcoes = await opcoesDoPainel().catch((erro: unknown) => {
    console.error("[gestao] falha ao carregar as opções dos filtros:", erro);
    return null;
  });

  const doBanco = filtrosDoBanco(filtros, opcoes?.centros ?? []);

  // Cada cartão leva para a tela que mostra o MESMO número, já filtrada. A
  // montagem mora em gestao/links-cards.ts, com teste: link que erra o filtro
  // manda o operador para uma lista com outro total, e aí ele deixa de confiar
  // nos dois números.
  const links = linksDosCards({
    hoje: dataHojeISO(),
    mesDoCusto: janela.meses[janela.meses.length - 1].slice(0, 7),
    centroIds: filtros.centroIds,
    etapaIds: filtros.etapaIds,
    categoriaIds: filtros.categoriaIds,
  });

  const periodo = `${rotuloMesCurto(janela.meses[0])} a ${rotuloMesCurto(
    janela.meses[janela.meses.length - 1],
  )}`;

  const [
    compras,
    custo,
    receita,
    centros,
    grupos,
    vencimentos,
    maiores,
    fornecedores,
    financeiro,
    rh,
  ] = await Promise.allSettled([
    comprasResumo(),
    custoPorMes(doBanco),
    receitaPorMes(doBanco),
    custoPorCentroCusto(doBanco),
    custoPorGrupo(doBanco),
    aPagarPorVencimento(),
    maioresCustos(doBanco),
    maioresFornecedores(doBanco),
    financeiroResumo(),
    rhResumo(),
  ]);

  registrarFalhas({
    compras,
    custo,
    receita,
    "custo por centro de custo": centros,
    "custo por grupo": grupos,
    vencimentos,
    "maiores custos": maiores,
    "maiores fornecedores": fornecedores,
    financeiro,
    RH: rh,
  });

  /**
   * O resultado do período: junta as duas séries que já vieram.
   *
   * A despesa é a MESMA `custoPorMes` do cartão "Custo do mês" — o gráfico não
   * tem uma segunda fonte para o mesmo número. Se qualquer um dos dois lados
   * falhar, o bloco inteiro mostra a falha em vez de desenhar um resultado
   * calculado contra zero, que seria a margem mais bonita e mais falsa da tela.
   */
  const resultado: ResultadoDoPeriodo | null =
    custo.status === "fulfilled" && receita.status === "fulfilled"
      ? resultadoDoPeriodo(
          janela.meses,
          receita.value,
          new Map(custo.value.meses.map((m) => [m.mes, m.valor])),
        )
      : null;

  /**
   * Marca o bloco que NÃO obedece ao recorte por centro de custo e categoria.
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
    ? " Não obedece ao filtro de centro de custo e categoria."
    : "";

  return (
    <div className="space-y-4">
      <PageHeader
        modulo="Gestão"
        titulo="Painel"
        descricao={`Receita, custo, caixa e pendências da EMT. Regime de competência, ${periodo}.`}
      />

      {/* A barra fica logo abaixo do cabeçalho, antes dos números, porque é ela
          que define de que conjunto os números falam. Se as opções falharem, o
          painel continua funcionando sem filtro em vez de sumir da tela. */}
      {opcoes !== null ? (
        <PainelFiltros
          valores={valores}
          centros={opcoes.centros}
          categorias={opcoes.categorias}
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
          href={links.custoDoMes}
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
          href={links.aPagarEmAberto}
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
          href={links.venceEmSeteDias}
        />
        <KPICard
          titulo="Pagamentos a aprovar"
          valor={ler(financeiro, (d) => d.aAprovar.contagem)}
          detalhe={semRecorte(
            ler(financeiro, (d) => <MoneyText valor={d.aAprovar.valor} />),
          )}
          href={links.pagamentosAAprovar}
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
          href={links.pagoNoMes}
        />
      </GradeKpis>

      <div className="grid gap-4 lg:grid-cols-2">
        <Painel
          titulo="Receita e despesa mês a mês"
          descricao={`O que entrou e o que saiu por mês de referência, ${periodo}.`}
          destaque={
            resultado === null ? undefined : (
              <MoneyText valor={resultado.receita} />
            )
          }
          rotuloDestaque="Receita do período"
          link={{
            href: "/financeiro/relatorios?rel=custo-receita",
            rotulo: "Abrir relatório",
          }}
          nota="Regime de competência. Empréstimo e movimentação entre contas próprias ficam fora dos dois lados: entram e saem do caixa sem virar resultado."
        >
          {resultado === null ? (
            <PainelComFalha titulo="a receita e a despesa" />
          ) : resultado.receita === 0 && resultado.despesa === 0 ? (
            <EmptyState
              icone={BarChart3}
              titulo="Sem movimento nos meses escolhidos"
              descricao="O período aparece aqui quando um lançamento a pagar ou a receber recebe mês de referência. Aprovar uma ordem de compra já gera esse lançamento."
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
            <ReceitaDespesaGrafico meses={resultado.meses} />
          )}
        </Painel>

        <Painel
          titulo="Resultado do mês"
          descricao={`Receita menos despesa, mês a mês, ${periodo}.`}
          destaque={
            resultado === null ? undefined : (
              <MoneyText valor={resultado.resultado} />
            )
          }
          rotuloDestaque={
            resultado?.margem === null || resultado === null
              ? "No período"
              : `Margem de ${formatarPercentual(resultado.margem, 1)}`
          }
          link={{
            href: "/financeiro/relatorios?rel=custo-receita",
            rotulo: "Abrir relatório",
          }}
          nota={resultado === null ? undefined : frasesDoResultado(resultado)}
        >
          {resultado === null ? (
            <PainelComFalha titulo="o resultado do período" />
          ) : (
            <ResultadoMesGrafico meses={resultado.meses} />
          )}
        </Painel>
      </div>

      <Painel
        titulo="Resumo do período, mês a mês"
        descricao="Os mesmos números do gráfico acima, exatos."
        rotuloDestaque="Resultado do período"
        destaque={
          resultado === null ? undefined : (
            <MoneyText valor={resultado.resultado} />
          )
        }
      >
        {resultado === null ? (
          <PainelComFalha titulo="o resumo do período" />
        ) : (
          <ResumoPeriodoTabela resultado={resultado} />
        )}
      </Painel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Painel
          titulo="Custo por centro de custo"
          descricao={`Onde o dinheiro está indo, ${periodo}. Maiores primeiro.`}
          destaque={ler(centros, (d) => `${d.quantidade}`)}
          rotuloDestaque="Centros com gasto"
          link={{
            href: "/financeiro/relatorios?rel=custo-cc",
            rotulo: "Abrir relatório",
          }}
          nota="Escolher um centro traz a subárvore dele: a obra vem com as etapas, a manutenção vem com os equipamentos."
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
            <BarrasHorizontais
              linhas={centros.value.centros.map<LinhaBarra>((centro) => ({
                id: centro.nome,
                rotulo: centro.nome,
                detalhe: `${formatarPercentual(centro.participacao, 0)} do período`,
                segmentos: [
                  { rotulo: "Custo", valor: centro.valor, cor: COR_DESPESA },
                ],
              }))}
            />
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
          nota="O grupo vem do insumo dos itens da ordem de compra; lançamento avulso entra em “Sem insumo”, e é isso que faz a soma fechar com o custo do período."
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
        titulo="Maiores fornecedores"
        descricao={`Com quem a empresa gastou, ${periodo}. Maiores primeiro.`}
        destaque={ler(fornecedores, (d) => <MoneyText valor={d.aberto} />)}
        rotuloDestaque="Ainda em aberto"
        link={{
          href: "/financeiro/relatorios?rel=extrato-fornecedor",
          rotulo: "Abrir extrato",
        }}
        nota="Pago e em aberto saem das parcelas de cada documento, não do status do lançamento. Soma o rateio, então o total fecha com o custo do período — e com centro de custo escolhido cada barra é a fatia que caiu nele."
      >
        {fornecedores.status === "rejected" ? (
          <PainelComFalha titulo="os maiores fornecedores" />
        ) : fornecedores.value.linhas.length === 0 ? (
          <EmptyState
            icone={Truck}
            titulo="Nenhum gasto no período"
            descricao="Os fornecedores aparecem aqui assim que houver lançamento a pagar com mês de referência dentro do período."
          />
        ) : (
          <BarrasHorizontais
            series={SERIES_FORNECEDOR}
            linhas={fornecedores.value.linhas.map<LinhaBarra>((linha) => ({
              id: linha.id ?? linha.tipo,
              rotulo: linha.nome,
              emblema:
                linha.lancamentos === 1
                  ? "1 lançamento"
                  : `${linha.lancamentos} lançamentos`,
              segmentos: [
                { rotulo: "Pago", valor: linha.pago, cor: COR_PAGO },
                { rotulo: "Em aberto", valor: linha.aberto, cor: COR_DESPESA },
              ],
            }))}
          />
        )}
      </Painel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Painel
          titulo="A pagar por prazo de vencimento"
          descricao={`Parcelas em aberto pelo prazo até o vencimento. É o que o caixa precisa suportar.${avisoSecao}`}
          destaque={ler(vencimentos, (d) => <MoneyText valor={d.total} />)}
          rotuloDestaque="Em aberto"
          link={{ href: "/financeiro/pagamentos", rotulo: "Abrir pagamentos" }}
          nota="Posição de hoje, e não do período escolhido: a pergunta aqui é o que o caixa tem pela frente."
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
            <BarrasHorizontais
              linhas={vencimentos.value.faixas.map<LinhaBarra>((faixa) => ({
                id: faixa.faixa,
                rotulo: faixa.rotulo,
                segmentos: [
                  {
                    rotulo: "A pagar",
                    valor: faixa.valor,
                    // A única barra vermelha da tela é a do que JÁ venceu, e o
                    // rótulo ao lado já diz "Vencido": a cor reforça, não informa
                    // sozinha.
                    cor:
                      faixa.faixa === "vencido" ? COR_VENCIDO : COR_DESPESA,
                  },
                ],
              }))}
            />
          )}
        </Painel>

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
      </div>

      <Painel
        titulo="Maiores custos do período"
        descricao={`${valores.centro.length === 0 ? "Os lançamentos a pagar de maior valor" : "Maiores custos nos centros escolhidos, pelo valor rateado neles"}, ${periodo}.`}
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
  );
}
