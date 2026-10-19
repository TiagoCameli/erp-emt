import { notFound, redirect } from "next/navigation";
import { BarChart3 } from "lucide-react";

import {
  EmptyState,
  GradeKpis,
  ItemGrade,
  KPICard,
  MoneyText,
  PageHeader,
} from "@/components/canonicos";
import { formatarBRL, formatarData, formatarPercentual } from "@/lib/formatadores";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import {
  listarCategorias,
  listarFormasPagamento,
  listarFornecedores,
} from "@/modules/financeiro/lancamentos/queries";
import {
  aVencerEm30Dias,
  cartoesDoDre,
  paraCentavos,
  paraReais,
  rotuloMes,
} from "@/modules/financeiro/relatorios/calculo";
import {
  drillCentroCusto,
  type FiltrosDoRelatorioDeCusto,
  type PeriodoCompetencia,
  type RecorteCustoGrupo,
} from "@/modules/financeiro/relatorios/drill";
import {
  comparacaoPermitida,
  lerFiltrosCustoCc,
  periodoAnterior,
  periodoDoModo,
  type FiltrosCustoCc,
} from "@/modules/financeiro/relatorios/filtros-custo-cc";
import { lerFiltrosCustoGrupo } from "@/modules/financeiro/relatorios/filtros-custo-grupo";
import { lerFiltrosCustoReceita } from "@/modules/financeiro/relatorios/filtros-custo-receita";
import {
  descreverFatia,
  descreverJanela,
  janelaDoFluxo,
  lerFiltrosFluxoCaixa,
  type JanelaFluxo,
} from "@/modules/financeiro/relatorios/filtros-fluxo-caixa";
import {
  descreverPeriodo,
  lerPeriodoDaUrl,
  periodoDoModo as periodoDoModoSimples,
  periodoFechado,
  pontasDaRpc,
  type PeriodoNaUrl,
  type ModoPeriodo,
} from "@/modules/financeiro/relatorios/filtros-periodo";
import {
  cadastroComMovimento,
  centrosEfetivos,
} from "@/modules/_shared/centro-custo/filtro";
import {
  aplicarIndireto,
  ID_NAO_RATEADO,
  rateioPermitidoNoCustoCc,
  type IndiretoDoPeriodo,
  mesDoRateio,
} from "@/modules/financeiro/relatorios/indireto-nos-relatorios";
import {
  conferencia,
  frasesDoResultado,
  JANELAS,
  lucroEPrejuizo,
  mesPorExtenso,
  nomeCurto,
  rotulosDasJanelas,
} from "@/modules/financeiro/relatorios/resultado-por-obra";
import { recorteDoIndireto } from "@/modules/financeiro/relatorios/indireto-por-mes";
import { ResultadoPorObraTabela } from "@/modules/financeiro/relatorios/components/resultado-por-obra-tabela";
import {
  MatrizResultadoObra,
  PonteObrasDreQuadro,
} from "@/modules/financeiro/relatorios/components/resultado-por-obra-quadros";
import { IndiretoMesesTabela } from "@/modules/financeiro/relatorios/components/indireto-meses-tabela";
import { BarraProporcional } from "@/modules/financeiro/relatorios/components/barra-proporcional";
import {
  porCentro,
  porMes,
  totais,
} from "@/modules/financeiro/relatorios/custo-receita";
import { CustoCcSerie } from "@/modules/financeiro/relatorios/components/custo-cc-serie";
import { FiltrosCustoCcBarra } from "@/modules/financeiro/relatorios/components/filtros-custo-cc-barra";
import { FiltrosCustoGrupoBarra } from "@/modules/financeiro/relatorios/components/filtros-custo-grupo-barra";
import { FiltrosDreBarra } from "@/modules/financeiro/relatorios/components/filtros-dre-barra";
import { FiltrosFluxoCaixaBarra } from "@/modules/financeiro/relatorios/components/filtros-fluxo-caixa-barra";
import { FiltrosCustoReceitaBarra } from "@/modules/financeiro/relatorios/components/filtros-custo-receita-barra";
import { CustoReceitaGrafico } from "@/modules/financeiro/relatorios/components/custo-receita-grafico";
import { CustoReceitaTabela } from "@/modules/financeiro/relatorios/components/custo-receita-tabela";
import { AgingGrafico } from "@/modules/financeiro/relatorios/components/aging-grafico";
import { AgingTabela } from "@/modules/financeiro/relatorios/components/aging-tabela";
import { CustoCcGrafico } from "@/modules/financeiro/relatorios/components/custo-cc-grafico";
import { CustoGrupoTabela } from "@/modules/financeiro/relatorios/components/custo-grupo-tabela";
import { CustoGrupoHistoria } from "@/modules/financeiro/relatorios/components/custo-grupo-historia";
import { mesesDoPeriodo } from "@/modules/financeiro/relatorios/custo-grupo-comparacao";
import { CustoCcTabela } from "@/modules/financeiro/relatorios/components/custo-cc-tabela";
import { DreTabela } from "@/modules/financeiro/relatorios/components/dre-tabela";
import { AgingPrazos } from "@/modules/financeiro/relatorios/components/aging-prazos";
import { DrePonte } from "@/modules/financeiro/relatorios/components/dre-ponte";
import {
  Revelar,
  RevelarGrafico,
  ValorAnimado,
} from "@/modules/financeiro/relatorios/components/movimento";
import { ponteDoResultado } from "@/modules/financeiro/relatorios/ponte-do-resultado";
import { ExtratoFornecedorTabela } from "@/modules/financeiro/relatorios/components/extrato-fornecedor-tabela";
import { FiltrosRankingFornecedoresBarra } from "@/modules/financeiro/relatorios/components/filtros-ranking-fornecedores-barra";
import { RankingFornecedores } from "@/modules/financeiro/relatorios/components/ranking-fornecedores";
import { lerPeriodoFornecedores } from "@/modules/financeiro/relatorios/fornecedores-ranking";
import { lerFornecedoresDaUrl } from "@/modules/financeiro/relatorios/extrato-filtros";
import { FluxoCaixaGrafico } from "@/modules/financeiro/relatorios/components/fluxo-caixa-grafico";
import {
  fraseDoFluxo,
  fraseDoSaldo,
  ponteDoCaixa,
  type GrupoNoFluxo,
  type SaldoProjetado,
} from "@/modules/financeiro/relatorios/fluxo-caixa";
import { FluxoCaixaPonte } from "@/modules/financeiro/relatorios/components/fluxo-caixa-ponte";
import { PosicaoBancariaTabela } from "@/modules/financeiro/relatorios/components/posicao-bancaria-tabela";
import { fraseDaPosicao } from "@/modules/financeiro/relatorios/posicao-bancaria";
import { BotaoExportarRelatorio } from "@/modules/financeiro/relatorios/components/botao-exportar-relatorio";
import { SociosLigadasRelatorioTela } from "@/modules/financeiro/relatorios/components/socios-ligadas-relatorio";
import { AquisicoesTabela } from "@/modules/financeiro/relatorios/components/aquisicoes-tabela";
import { CustosIndiretosTabela } from "@/modules/financeiro/relatorios/components/custos-indiretos-tabela";
import { RateioIndiretoTabela } from "@/modules/financeiro/relatorios/components/rateio-indireto-tabela";
import Link from "next/link";
import { FiltrosInvestimentosBarra } from "@/modules/financeiro/relatorios/components/filtros-investimentos-barra";
import {
  AplicacoesTabela,
  InvestimentosPorMesTabela,
  MovimentosInvestimentoTabela,
} from "@/modules/financeiro/relatorios/components/investimentos-tabela";
import {
  lerPeriodoInvestimentos,
  type PeriodoInvestimentos,
} from "@/modules/financeiro/relatorios/investimentos";
import { RelatoriosNav } from "@/modules/financeiro/relatorios/components/relatorios-nav";
import {
  normalizarRelatorio,
  queryDoIdAntigo,
  PERGUNTA_DO_RELATORIO,
  type RelatorioId,
} from "@/modules/financeiro/relatorios/relatorios";
import { SeletorFornecedor } from "@/modules/financeiro/relatorios/components/seletor-fornecedor";
import {
  aging,
  custoPorCentroCusto,
  custoPorGrupo,
  custoPorGrupoMensal,
  custoReceita,
  investimentos,
  rankingFornecedores,
  relatorioSociosLigadas,
  aquisicoes,
  rateioIndiretoDoMes,
  carregarResultadoPorObra,
  carregarIndiretoDoAno,
  indiretoDoPeriodo,
  dreGerencial,
  extratoPorFornecedor,
  fluxoCaixa,
  centrosComMovimentoNoCustoReceita,
  listarCentrosCustoParaFiltro,
  listarFornecedoresComLancamentos,
  mesCorrente,
  mesFechado,
  mesesDeCompetencia,
  posicaoBancaria,
  primeirosMesesDosCentros,
  serieDosCentros,
  type DreGerencial,
} from "@/modules/financeiro/relatorios/queries";

interface RelatoriosPageProps {
  searchParams: Promise<{
    rel?: string | string[];
    mes?: string | string[];
    fornecedor?: string | string[];
    mes_rateio?: string | string[];
    ano_indireto?: string | string[];
    mes_obra?: string | string[];
    visao?: string | string[];
  }>;
}

function primeiro(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

/** A query da página como `URLSearchParams`, repetindo chave de valor múltiplo. */
function paraUrlSearchParams(
  params: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const saida = new URLSearchParams();
  for (const [chave, valor] of Object.entries(params)) {
    for (const v of Array.isArray(valor) ? valor : valor === undefined ? [] : [valor]) {
      saida.append(chave, v);
    }
  }
  return saida;
}

/**
 * As duas visões do Resultado por obra. "Cruzar centros" é o antigo Custo x
 * receita inteiro: o custo de um conjunto de centros contra a receita de outro,
 * pedido do dono, que a visão por obra não substitui.
 */
function VisaoResultadoObra({ cruzar }: { cruzar: boolean }) {
  const classe = (ativo: boolean) =>
    ativo
      ? "rounded-md border border-foreground bg-foreground px-2.5 py-1 text-detalhe text-background"
      : "rounded-md border border-border px-2.5 py-1 text-detalhe text-muted-foreground hover:text-foreground";
  return (
    <nav aria-label="Visão do resultado por obra" className="flex gap-1">
      <Link className={classe(!cruzar)} aria-current={!cruzar ? "page" : undefined} href="/financeiro/relatorios?rel=resultado-obra">
        Por obra
      </Link>
      <Link className={classe(cruzar)} aria-current={cruzar ? "page" : undefined} href="/financeiro/relatorios?rel=resultado-obra&visao=cruzar">
        Cruzar centros
      </Link>
    </nav>
  );
}

/** Faixa de cabeçalho de cada relatório: título e, opcionalmente, controles. */
function SecaoRelatorio({
  relatorio,
  titulo,
  descricao,
  exportar,
  controles,
  children,
}: {
  /** Qual relatório: dá a pergunta que abre a seção. */
  relatorio: RelatorioId;
  titulo: string;
  /** Como a conta é feita. Fica recolhido sob a pergunta. */
  descricao: React.ReactNode;
  /**
   * Qual relatório esta seção mostra. Presente, desenha "Exportar Excel" ao
   * lado do título.
   *
   * O botão nasce AQUI, e não em cada uma das nove seções, porque o gesto é o
   * mesmo em todas e o que muda é só a planilha. Assim o décimo relatório ganha
   * exportação junto com a seção dele, em vez de alguém precisar lembrar — que
   * é exatamente como os nove ficaram sem exportação nenhuma até hoje.
   */
  exportar?: RelatorioId;
  controles?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-secao font-semibold text-foreground">
            {titulo}
          </h2>
          <p className="text-corpo text-foreground">
            {PERGUNTA_DO_RELATORIO[relatorio]}
          </p>
          {/* A regra da conta continua na tela (regime, janela, o que entra e
              o que fica fora), mas recolhida: quem abre o relatório quer a
              resposta primeiro, e a explicação quando duvidar do número. */}
          <details className="group mt-1 max-w-4xl text-detalhe text-muted-foreground">
            <summary className="foco-anel w-fit cursor-pointer rounded-sm select-none hover:text-foreground">
              Como a conta é feita
            </summary>
            <p className="pt-1">{descricao}</p>
          </details>
        </div>
        {exportar || controles ? (
          <div className="flex shrink-0 items-center gap-2">
            {controles}
            {exportar ? <BotaoExportarRelatorio relatorio={exportar} /> : null}
          </div>
        ) : null}
      </div>
      {/* O conteúdo entra subindo de leve, com a chave do relatório: trocar de
          relatório refaz a entrada, e o olho percebe que a tela mudou. */}
      <Revelar chave={relatorio} className="flex flex-col gap-4">
        {children}
      </Revelar>
    </section>
  );
}

/**
 * Gráfico do relatório numa grade personalizável, para a pessoa poder aumentar,
 * diminuir ou esconder. A moldura é coluna flex para o gráfico crescer junto.
 *
 * `depois` são outros cards da MESMA grade, logo abaixo do gráfico (a tabela do
 * relatório, em `ItemGrade`): ficam na ordem de hoje, gráfico e depois tabela,
 * e a pessoa mexe nos dois juntos.
 */
function PainelGrafico({
  id,
  titulo,
  tituloGrade = titulo,
  depois,
  children,
}: {
  id: string;
  titulo: string;
  /** Nome da grade quando ela leva mais que o gráfico. Ausente = `titulo`. */
  tituloGrade?: string;
  depois?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <GradeKpis id={id} titulo={tituloGrade} vao="amplo">
      <ItemGrade titulo={titulo} idCard="grafico" larguraPadrao={12}>
        <div className="flex flex-col rounded-lg border border-border bg-card p-4">
          <RevelarGrafico className="flex flex-1 flex-col">{children}</RevelarGrafico>
        </div>
      </ItemGrade>
      {depois}
    </GradeKpis>
  );
}

/**
 * O saldo DISPONÍVEL no fim da janela, a partir do saldo de hoje das contas
 * correntes e caixa (ver `fluxo-caixa.ts`), com o disponível mais o aplicado no
 * detalhe. Cada motivo de não haver saldo tem a sua frase, e nenhum vira
 * R$ 0,00: zero é um saldo, e um saldo inventado leva a decisão de pagamento
 * errada.
 *
 * `idCard` fixo porque o título leva o mês, e a grade personalizável guarda a
 * posição do cartão pelo id: sem ele, a virada do mês esqueceria onde a pessoa o
 * pôs.
 */
function CartaoSaldoProjetado({
  saldo,
  contasNoSaldo,
}: {
  saldo: SaldoProjetado;
  contasNoSaldo: { contas: number; ocultas: number; aplicadas: number };
}) {
  if (saldo.tipo !== "calculado") {
    const detalhe: Record<typeof saldo.tipo, string> = {
      sem_saldo_visivel:
        "Não há saldo de conta visível para você: sem ele não há de onde projetar",
      com_centro:
        "Indisponível com centro escolhido: a fatia de uma obra não se soma ao saldo da empresa",
      janela_no_passado:
        "A janela termina antes do mês corrente: não há mês futuro para projetar",
    };
    return (
      <KPICard
        idCard="saldo-projetado"
        titulo="Disponível projetado"
        valor={<span className="text-muted-foreground">Sem saldo</span>}
        detalhe={detalhe[saldo.tipo]}
      />
    );
  }
  return (
    <KPICard
      idCard="saldo-projetado"
      titulo={`Disponível projetado em ${rotuloMes(saldo.mes)}`}
      valor={<ValorAnimado valor={saldo.valor} />}
      detalhe={
        <>
          {saldo.valorComAplicado !== null ? (
            <>
              Com o aplicado <MoneyText valor={saldo.valorComAplicado} />
            </>
          ) : (
            "Sem subconta de investimento visível"
          )}
          {contasNoSaldo.ocultas > 0
            ? `; ${contasNoSaldo.ocultas} conta(s) sem saldo visível ficaram fora`
            : ""}
        </>
      }
    />
  );
}

/** "Entrou X, saiu Y" de um grupo, com os nomes que cada grupo usa. */
function DetalheDoGrupo({
  grupo,
  rotulos,
  fatia,
}: {
  grupo: GrupoNoFluxo;
  rotulos: [string, string];
  fatia: string;
}) {
  return (
    <>
      {rotulos[0]} <MoneyText valor={grupo.entrada.total} />, {rotulos[1]}{" "}
      <MoneyText valor={grupo.saida.total} />
      {fatia}
    </>
  );
}

async function ConteudoFluxoCaixa({
  janela,
  centrosCusto,
  centrosReceita,
  podeVerLancamentos,
}: {
  /** A janela de meses da tela. Cortada no servidor, ver `fluxoCaixa`. */
  janela: JanelaFluxo;
  /**
   * Centros JÁ EFETIVOS de cada lado (a etapa substitui a raiz). Vazio = o lado
   * inteiro. Com centro escolhido, a RPC soma a FATIA do rateio daquele centro —
   * é por isso que os cartões dizem "Fatia de N centros" em vez de deixar o
   * número parecer o total da empresa.
   */
  centrosCusto: string[];
  centrosReceita: string[];
  podeVerLancamentos: boolean;
}) {
  const dados = await fluxoCaixa(janela, {
    custo: centrosCusto,
    receita: centrosReceita,
  });
  const janelaDescrita = descreverJanela(janela);
  const temCorteDeCentro = centrosCusto.length > 0 || centrosReceita.length > 0;
  if (dados.meses.length === 0) {
    // Três causas com respostas diferentes: não há parcela nenhuma, a janela não
    // pega nenhum mês, ou os centros escolhidos não têm movimento. Mandar "assim
    // que houver parcelas lançadas" para quem tem cinco anos de parcelas e olhou
    // 2019 — ou para quem acabou de recortar uma obra — é uma resposta errada.
    const temCorteDeJanela = Boolean(janela.de || janela.ate);
    return (
      <EmptyState
        icone={BarChart3}
        titulo={
          temCorteDeCentro
            ? "Sem movimentação nos centros escolhidos"
            : temCorteDeJanela
              ? "Sem movimentação nesta janela"
              : "Sem movimentação de caixa"
        }
        descricao={
          temCorteDeCentro
            ? `Nenhuma parcela rateada nos centros escolhidos cai em ${janelaDescrita.toLowerCase()}. Tire o filtro de centro ou abra a janela.`
            : temCorteDeJanela
              ? `Nenhuma parcela cai em ${janelaDescrita.toLowerCase()}. Abra a janela ou escolha "Tudo".`
              : "Assim que houver parcelas com vencimento lançadas, o fluxo aparece aqui."
        }
      />
    );
  }
  // Os dois lados se escolhem separados, então um grupo pode estar somando a
  // fatia de uma obra numa ponta e o total da empresa na outra. Quem lê precisa
  // saber disso ANTES de decidir pagamento.
  const fatias = [
    centrosReceita.length > 0
      ? `entradas: ${descreverFatia(centrosReceita.length).toLowerCase()}`
      : null,
    centrosCusto.length > 0
      ? `saídas: ${descreverFatia(centrosCusto.length).toLowerCase()}`
      : null,
  ].filter((parte) => parte !== null);
  const fatia = fatias.length > 0 ? ` · ${fatias.join("; ")}` : "";
  const { grupos } = dados;
  const ponte = ponteDoCaixa(dados);
  const frase = fraseDoFluxo(dados, formatarBRL);
  const saldo = fraseDoSaldo(dados, formatarBRL);

  return (
    <>
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
        <FluxoCaixaPonte ponte={ponte} frase={frase} />
        {fatia ? (
          <p className="text-detalhe text-muted-foreground">
            Recorte por centro{fatia}. A ponte soma a fatia de cada lado.
          </p>
        ) : null}
        {saldo ? (
          <div className="flex flex-col gap-2 border-t border-dashed pt-4">
            <p className="text-corpo text-foreground">{saldo.saldo}</p>
            {saldo.aviso ? (
              <p
                role="note"
                className="rounded-md border border-status-pendente/40 bg-status-pendente/10 px-3 py-2 text-detalhe text-foreground"
              >
                {saldo.aviso}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <GradeKpis id="financeiro.relatorios.fluxo-caixa" titulo="Fluxo de caixa">
        <KPICard
          idCard="operacao"
          titulo="Geração operacional"
          valor={<ValorAnimado valor={grupos.operacao.liquido} />}
          detalhe={
            <DetalheDoGrupo
              grupo={grupos.operacao}
              rotulos={["Entrou", "saiu"]}
              fatia={fatia}
            />
          }
        />
        <KPICard
          idCard="investimento"
          titulo="Investimento (CAPEX)"
          valor={<ValorAnimado valor={grupos.investimento.liquido} />}
          detalhe={
            <>
              Pago <MoneyText valor={grupos.investimento.saida.realizado} />,
              previsto <MoneyText valor={grupos.investimento.saida.projetado} />
              {fatia}
            </>
          }
        />
        <KPICard
          idCard="socios"
          titulo="Mútuo com ligadas"
          valor={<ValorAnimado valor={grupos.socios.liquido} />}
          detalhe={
            <DetalheDoGrupo
              grupo={grupos.socios}
              rotulos={["Devolvido", "enviado"]}
              fatia={fatia}
            />
          }
        />
        <KPICard
          idCard="divida"
          titulo="Dívida"
          valor={<ValorAnimado valor={grupos.divida.liquido} />}
          detalhe={
            <DetalheDoGrupo
              grupo={grupos.divida}
              rotulos={["Tomou", "amortizou"]}
              fatia={fatia}
            />
          }
        />
        <KPICard
          idCard="aplicacao"
          titulo="Aplicações"
          valor={<ValorAnimado valor={grupos.aplicacao.liquido} />}
          detalhe={
            <DetalheDoGrupo
              grupo={grupos.aplicacao}
              rotulos={["Resgatou", "aplicou"]}
              fatia={fatia}
            />
          }
        />
        <CartaoSaldoProjetado
          saldo={dados.saldoProjetado}
          contasNoSaldo={dados.contasNoSaldo}
        />
      </GradeKpis>
      <PainelGrafico
        id="financeiro.relatorios.fluxo-caixa.grafico"
        titulo="Gráfico do fluxo de caixa"
      >
        <FluxoCaixaGrafico
          meses={dados.meses}
          mesCorrente={mesCorrente()}
          centrosCusto={centrosCusto}
          centrosReceita={centrosReceita}
          podeVerLancamentos={podeVerLancamentos}
        />
      </PainelGrafico>
    </>
  );
}

/**
 * O mês só está vazio se NENHUM dos quatro blocos do DRE tiver linha. Olhar só o
 * operacional mostraria "sem lançamentos no mês" num mês em que a conta girou
 * milhões em aplicação — o extrato teria movimento e a tela diria que não há.
 */
function temLancamentoNoDre(dre: DreGerencial): boolean {
  return [
    dre.operacional,
    dre.financeiro,
    dre.investimento,
    dre.movimentacao,
  ].some(
    (bloco) => bloco.receitas.length > 0 || bloco.despesas.length > 0,
  );
}

/** Margem sobre a receita líquida, para o cartão do resultado dizer o tamanho dele. */
function margemDoPeriodo(cartoes: {
  receitaOperacional: number;
  resultadoDoPeriodo: number;
}): string {
  if (cartoes.receitaOperacional <= 0) return "";
  const margem = (cartoes.resultadoDoPeriodo / cartoes.receitaOperacional) * 100;
  return ` de ${formatarPercentual(margem, 1)}`;
}

async function ConteudoDre({
  periodo,
  podeVerLancamentos,
}: {
  /**
   * O período do DRE, com as DUAS pontas fechadas (ver `periodoFechado`): a
   * `fn_rel_dre` não tem guarda de nulo, e uma ponta aberta devolveria um DRE
   * vazio como se o período não tivesse lançamento nenhum.
   */
  periodo: PeriodoCompetencia;
  podeVerLancamentos: boolean;
}) {
  const { inicio, fim } = pontasDaRpc(periodo);
  if (inicio === undefined || fim === undefined) {
    return (
      <EmptyState
        icone={BarChart3}
        titulo="Sem lançamentos para apurar"
        descricao="Não há nenhum lançamento com mês de referência, então não existe período para o DRE."
      />
    );
  }

  const dre = await dreGerencial({ inicio, fim });
  const descricao = descreverPeriodo(periodo);
  // Os cartões saem do MESMO agrupamento da tabela, em centavos, e fecham entre
  // si: receita operacional - despesa operacional + resultado financeiro =
  // resultado do período (ver `cartoesDoDre`, com teste).
  const cartoes = cartoesDoDre(dre);
  return (
    <>
      <GradeKpis id="financeiro.relatorios.dre" titulo="DRE">
        {/* Receita e despesa OPERACIONAIS: é o que a obra fez. A aplicação
            financeira da conta não entra, senão o cartão de receita mostraria a
            varredura noturna do banco como faturamento. */}
        <KPICard
          idCard="receita-operacional"
          titulo="Receita operacional"
          valor={<ValorAnimado valor={cartoes.receitaOperacional} />}
          detalhe={
            dre.operacional.retencaoReceitas > 0 ? (
              <>
                Líquida. Retido na fonte{" "}
                <MoneyText valor={dre.operacional.retencaoReceitas} />
              </>
            ) : (
              "Líquida, sem retenção na fonte no período"
            )
          }
        />
        <KPICard
          idCard="despesa-operacional"
          titulo="Despesa operacional"
          valor={<ValorAnimado valor={cartoes.despesaOperacional} />}
          detalhe="Sem investimentos e sem movimentação"
        />
        <KPICard
          idCard="resultado-financeiro"
          titulo="Resultado financeiro"
          valor={<ValorAnimado valor={cartoes.resultadoFinanceiro} />}
          detalhe="Juros e rendimentos menos tarifas e juros pagos"
        />
        <KPICard
          idCard="resultado-periodo"
          titulo="Resultado do período"
          valor={<ValorAnimado valor={cartoes.resultadoDoPeriodo} />}
          detalhe={`${cartoes.resultadoDoPeriodo >= 0 ? "Superávit" : "Déficit"}${margemDoPeriodo(cartoes)} · ${descricao}`}
        />
      </GradeKpis>
      {/* Indicador e não cartão: os quatro de cima fecham entre si, e um quinto
          ao lado deles convidaria a somá-lo no resultado, que é justamente o
          que o CAPEX não é (decisão D3, 03/10/2026). */}
      <p className="text-detalhe text-muted-foreground">
        Investimentos no período, fora do resultado:{" "}
        <MoneyText
          valor={cartoes.investimentosNoPeriodo}
          className="font-medium text-foreground"
        />
      </p>
      {!temLancamentoNoDre(dre) ? (
        <EmptyState
          icone={BarChart3}
          titulo="Sem lançamentos no período"
          descricao="Não há receitas nem despesas com mês de referência neste recorte."
        />
      ) : (
        <GradeKpis id="financeiro.relatorios.dre.tabela" titulo="Tabela do DRE" vao="amplo">
          {/* A mesma conta da tabela, contada em ordem de leitura: da receita
              bruta ao resultado, e depois para onde o resultado foi. */}
          <ItemGrade titulo="Ponte do resultado" idCard="ponte" larguraPadrao={12}>
            <div className="flex flex-col rounded-lg border border-border bg-card p-4">
              <DrePonte ponte={ponteDoResultado(dre)} />
            </div>
          </ItemGrade>
          <ItemGrade titulo="Tabela do DRE" idCard="tabela" larguraPadrao={12}>
            <DreTabela
              dre={dre}
              periodo={periodo}
              podeVerLancamentos={podeVerLancamentos}
            />
          </ItemGrade>
        </GradeKpis>
      )}
    </>
  );
}

async function ConteudoAging({
  podeVerLancamentos,
}: {
  podeVerLancamentos: boolean;
}) {
  const dados = await aging();
  const semDados =
    dados.totalAPagar === 0 && dados.totalAReceber === 0;
  // Centavos, para "vencido + próximos 30 dias" fechar com a tabela.
  const pagar30 = paraReais(
    paraCentavos(dados.vencidoAPagar) + paraCentavos(aVencerEm30Dias(dados.prazosAPagar)),
  );
  const receber30 = paraReais(
    paraCentavos(dados.vencidoAReceber) + paraCentavos(aVencerEm30Dias(dados.prazosAReceber)),
  );
  const longoPrazoAPagar =
    dados.prazosAPagar.find((p) => p.prazo === "acima_60")?.valor ?? 0;
  return (
    <>
      <GradeKpis id="financeiro.relatorios.aging" titulo="Aging">
        {/* O cartão que responde a pergunta do dia vem primeiro: o que sai do
            caixa até o fim do mês que vem, contando o que já venceu. */}
        <KPICard
          idCard="pagar-30-dias"
          titulo="Pagar nos próximos 30 dias"
          valor={<ValorAnimado valor={pagar30} />}
          detalhe={
            dados.vencidoAPagar > 0 ? (
              <>
                Inclui <MoneyText valor={dados.vencidoAPagar} /> já vencido
              </>
            ) : (
              "Nada vencido"
            )
          }
        />
        <KPICard
          idCard="receber-30-dias"
          titulo="Receber nos próximos 30 dias"
          valor={<ValorAnimado valor={receber30} />}
          detalhe={
            dados.totalAReceber === 0
              ? "Nenhuma parcela a receber lançada: medição faturada entra aqui quando vira lançamento"
              : `Inclui ${formatarBRL(dados.vencidoAReceber)} já vencido`
          }
        />
        <KPICard
          idCard="a-pagar"
          titulo="A pagar em aberto"
          valor={<ValorAnimado valor={dados.totalAPagar} />}
          detalhe={
            <>
              <MoneyText valor={longoPrazoAPagar} /> vencem depois de 60 dias
            </>
          }
        />
        <KPICard
          idCard="a-receber"
          titulo="A receber em aberto"
          valor={<ValorAnimado valor={dados.totalAReceber} />}
          detalhe={
            <>
              Vencido <MoneyText valor={dados.vencidoAReceber} />
            </>
          }
        />
      </GradeKpis>
      {!semDados ? (
        <GradeKpis id="financeiro.relatorios.aging.agenda" titulo="Agenda" vao="amplo">
          <ItemGrade titulo="Agenda do que está em aberto" idCard="agenda" larguraPadrao={12}>
            <div className="flex flex-col rounded-lg border border-border bg-card p-4">
              <AgingPrazos
                vencidoAPagar={dados.vencidoAPagar}
                vencidoAReceber={dados.vencidoAReceber}
                prazosAPagar={dados.prazosAPagar}
                prazosAReceber={dados.prazosAReceber}
              />
            </div>
          </ItemGrade>
        </GradeKpis>
      ) : null}
      {semDados ? (
        <EmptyState
          icone={BarChart3}
          titulo="Sem parcelas em aberto"
          descricao="Não há parcelas pendentes ou aprovadas para envelhecer."
        />
      ) : (
        <PainelGrafico
          id="financeiro.relatorios.aging.grafico"
          titulo="Gráfico do aging"
          tituloGrade="Gráfico e tabela do aging"
          depois={
            <ItemGrade titulo="Tabela do aging" idCard="tabela" larguraPadrao={12}>
              <AgingTabela aging={dados} podeVerLancamentos={podeVerLancamentos} />
            </ItemGrade>
          }
        >
          <AgingGrafico
            aPagar={dados.aPagar}
            aReceber={dados.aReceber}
            podeVerLancamentos={podeVerLancamentos}
          />
        </PainelGrafico>
      )}
    </>
  );
}

async function ConteudoPosicaoBancaria({
  podeVerLancamentos,
}: {
  podeVerLancamentos: boolean;
}) {
  const posicao = await posicaoBancaria();
  if (posicao.contas.length === 0) {
    // Lista vazia tem DUAS causas com respostas opostas: não existe conta
    // cadastrada, ou existem e o usuário não pode ver o saldo de nenhuma. Mandar
    // "cadastre uma conta bancária" para quem tem cinco contas na frente e falta
    // de permissão é o tipo de mensagem que faz a pessoa cadastrar uma sexta.
    return posicao.contasOcultas > 0 ? (
      <EmptyState
        icone={BarChart3}
        titulo="Sem permissão de ver saldo"
        descricao={`Existem ${posicao.contasOcultas} conta(s) ativas, mas você não tem permissão de ver o saldo de nenhuma delas. Quem libera é a Administração, na aba Usuários.`}
      />
    ) : (
      <EmptyState
        icone={BarChart3}
        titulo="Sem contas bancárias"
        descricao="Cadastre uma conta bancária para acompanhar a posição de saldo."
      />
    );
  }
  const { resumo } = posicao;
  const atrasadas = resumo.aConferir.filter((c) => c.situacao === "atrasado").length;
  const divergentes = resumo.aConferir.filter((c) => c.situacao === "divergente").length;
  return (
    <>
      <p className="rounded-lg border border-border bg-card p-4 text-corpo text-foreground">
        {fraseDaPosicao(resumo, formatarBRL, formatarData)}
      </p>
      <GradeKpis
        id="financeiro.relatorios.posicao-bancaria"
        titulo="Posição bancária"
      >
        <KPICard
          idCard="disponivel"
          titulo="Disponível"
          valor={<ValorAnimado valor={resumo.disponivel} />}
          detalhe={`${resumo.contasDisponiveis} conta(s) corrente e caixa: o que paga boleto hoje`}
        />
        <KPICard
          idCard="aplicado"
          titulo="Aplicado"
          valor={<ValorAnimado valor={resumo.aplicado} />}
          detalhe={
            <>
              {resumo.contasAplicadas} subconta(s) de investimento; com o
              disponível, <MoneyText valor={resumo.total} />
              {/* "Todas as contas ativas" vira mentira quando alguma ficou
                  fora por permissão, e parece o dinheiro da empresa. */}
              {posicao.contasOcultas > 0
                ? ` nas ${posicao.contas.length} contas que você pode ver`
                : ""}
            </>
          }
        />
        <KPICard
          idCard="extrato"
          titulo="Extrato a conferir"
          valor={
            resumo.aConferir.length === 0 ? (
              <span className="text-muted-foreground">Nenhuma</span>
            ) : (
              `${resumo.aConferir.length} conta(s)`
            )
          }
          detalhe={
            resumo.aConferir.length === 0
              ? "Toda conta com extrato bate com o banco na data dele"
              : [
                  atrasadas > 0 ? `${atrasadas} com lançamento depois do último extrato` : null,
                  divergentes > 0 ? `${divergentes} que não bate(m) na data do extrato` : null,
                  resumo.aConferir.length - atrasadas - divergentes > 0
                    ? `${resumo.aConferir.length - atrasadas - divergentes} sem extrato importado`
                    : null,
                ]
                  .filter((parte) => parte !== null)
                  .join("; ")
          }
        />
      </GradeKpis>
      <GradeKpis
        id="financeiro.relatorios.posicao-bancaria.tabela"
        titulo="Tabela da posição bancária"
        vao="amplo"
      >
        <ItemGrade titulo="Saldo por conta" idCard="tabela" larguraPadrao={12}>
          <PosicaoBancariaTabela
            posicao={posicao}
            podeVerLancamentos={podeVerLancamentos}
          />
        </ItemGrade>
      </GradeKpis>
    </>
  );
}

/**
 * Empresas ligadas: o ano corrente e o acumulado desde o primeiro lançamento.
 * Sem filtro de período de propósito: o acumulado do mútuo é o que a empresa
 * ligada deve hoje, e é a pergunta que a tela responde.
 */
/** yyyy-MM somando meses (negativo volta). */
function somarMeses(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function ConteudoSociosLigadas() {
  const dados = await relatorioSociosLigadas();
  if (dados.ligadas.length === 0) {
    return (
      <EmptyState
        icone={BarChart3}
        titulo="Nenhum centro de empresa ligada"
        descricao="Os centros de tipo Empresa ligada aparecem aqui, em Cadastros > Centros de custo."
      />
    );
  }
  return <SociosLigadasRelatorioTela dados={dados} />;
}

async function ConteudoAquisicoes({ podeVerLancamentos }: { podeVerLancamentos: boolean }) {
  // O estado vazio mora na tabela, junto das duas seções.
  return <AquisicoesTabela linhas={await aquisicoes()} podeVerLancamentos={podeVerLancamentos} />;
}

/** Navegação de mês em mês pela URL, como no rateio. */
function SetasDeMes({
  mes,
  href,
  ultimo,
}: {
  mes: string;
  href: (m: string) => string;
  /** yyyy-MM: depois dele a seta some. */
  ultimo?: string;
}) {
  const proximo = somarMeses(mes, 1);
  return (
    <div className="flex items-center gap-3 text-corpo">
      <Link className="text-primary hover:underline" href={href(somarMeses(mes, -1))}>← mês anterior</Link>
      <span className="font-medium">{mesPorExtenso(mes)}</span>
      {ultimo === undefined || proximo <= ultimo ? (
        <Link className="text-primary hover:underline" href={href(proximo)}>próximo mês →</Link>
      ) : null}
    </div>
  );
}

/**
 * Resultado por obra: o mês escolhido (padrão o último fechado), o ano até ele
 * e desde o início até ele. Nada depois do mês entra, então previsto de mês
 * futuro nunca soma.
 */
async function ConteudoResultadoObra({ mes }: { mes: string }) {
  const { resultado: r, ponte } = await carregarResultadoPorObra(mes);

  if (r.obras.length === 0 && r.foraDoRateio.length === 0) {
    return (
      <EmptyState
        icone={BarChart3}
        titulo="Nenhuma obra com receita ou custo até este mês"
        descricao="O resultado aparece quando um lançamento a pagar ou a receber de uma obra recebe mês de referência."
      />
    );
  }

  const rotulos = rotulosDasJanelas(mes);
  const frases = frasesDoResultado(r, formatarBRL);
  const { prejuizo } = lucroEPrejuizo(r.obras, "ano");
  const diferencas = JANELAS.map((j) => conferencia(r, j)).filter((d) => Math.round(d * 100) !== 0);

  return (
    <>
      <div className="flex max-w-4xl flex-col gap-1 text-corpo text-foreground">
        {frases.map((f) => (
          <p key={f}>{f}</p>
        ))}
      </div>

      <GradeKpis id="financeiro.relatorios.resultado-obra" titulo="Resultado por obra">
        <KPICard
          idCard="ano"
          titulo={`Resultado ${rotulos.ano.toLowerCase().replace(/^\d{4}/, mes.slice(0, 4))}`}
          valor={<ValorAnimado valor={r.totalObras.ano.resultado} />}
          detalhe={
            r.totalObras.ano.margem === null
              ? "Sem receita no ano"
              : `Margem de ${formatarPercentual(r.totalObras.ano.margem, 1)} sobre ${formatarBRL(r.totalObras.ano.receita)} de receita`
          }
        />
        <KPICard
          idCard="mes"
          titulo={`Resultado de ${mesPorExtenso(mes)}`}
          valor={<ValorAnimado valor={r.totalObras.mes.resultado} />}
          detalhe={
            r.totalObras.mes.receita === 0
              ? "Sem medição no mês"
              : `Receita de ${formatarBRL(r.totalObras.mes.receita)}`
          }
        />
        <KPICard
          idCard="inicio"
          titulo="Resultado desde o início"
          valor={<ValorAnimado valor={r.totalObras.inicio.resultado} />}
          detalhe={
            r.totalObras.inicio.margem === null
              ? "Sem receita"
              : `Margem de ${formatarPercentual(r.totalObras.inicio.margem, 1)}`
          }
        />
        <KPICard
          idCard="vermelho"
          titulo="Obras no vermelho no ano"
          valor={String(prejuizo.length)}
          detalhe={prejuizo.length === 0 ? "Todas com resultado positivo" : prejuizo.map((o) => nomeCurto(o.nome)).join(", ")}
        />
      </GradeKpis>

      <ResultadoPorObraTabela obras={r.obras} total={r.totalObras} rotulos={rotulos} />

      <div className="flex flex-col gap-1 text-detalhe text-muted-foreground">
        {r.foraDoRateio.map((o) => (
          <p key={o.centroId}>
            {o.nome} fica fora do rateio (unidade própria): resultado de {formatarBRL(o.ano.resultado)} no ano e{" "}
            {formatarBRL(o.inicio.resultado)} desde o início, sem indireto.
          </p>
        ))}
        {r.naoRateado.inicio > 0 ? (
          <p>
            Indireto sem obra para receber (mês sem obra com custo): {formatarBRL(r.naoRateado.ano)} no ano,{" "}
            {formatarBRL(r.naoRateado.inicio)} desde o início.
          </p>
        ) : null}
        {r.receitaNosIndiretos.inicio !== 0 ? (
          <p>
            Receita lançada direto num centro indireto: {formatarBRL(r.receitaNosIndiretos.inicio)} desde o início.
          </p>
        ) : null}
        {diferencas.length > 0 ? (
          <p className="text-destructive">
            A soma desta tela não fecha com o custo x receita da empresa ({diferencas.map(formatarBRL).join(", ")}):
            o rateio de algum mês não distribuiu exatamente o custo dos indiretos.
          </p>
        ) : (
          <p>
            Obras, fora do rateio e indireto sem obra somam {formatarBRL(r.totalGeral.ano.resultado)} no ano: o
            resultado de todos os centros, sem rateio.
          </p>
        )}
      </div>

      <section className="flex flex-col gap-2">
        <h3 className="text-corpo font-medium text-foreground">Resultado mês a mês ({mes.slice(0, 4)})</h3>
        <p className="text-detalhe text-muted-foreground">
          Com o indireto rateado. A receita chega por medição: o mês de medição sobe, o mês sem ela fica negativo.
        </p>
        <MatrizResultadoObra
          obras={r.obras}
          meses={r.mesesDoAno}
          totalPorMes={r.totalObrasPorMes}
          totalAno={r.totalObras.ano.resultado}
        />
      </section>

      <PonteObrasDreQuadro ponte={ponte} periodo={rotulos.ano.toLowerCase()} />
    </>
  );
}

/**
 * Indireto: uma linha por mês do ano e, no mês aberto, as categorias e o
 * ajuste dos percentuais (o mesmo "Salvar ajuste" e "Confirmar mês" do antigo
 * Rateio do indireto).
 */
async function ConteudoIndireto({
  ano,
  mesAberto,
  podeAjustar,
}: {
  ano: number;
  mesAberto: string;
  podeAjustar: boolean;
}) {
  const [{ meses, categorias }, rateioAberto] = await Promise.all([
    carregarIndiretoDoAno(ano),
    rateioIndiretoDoMes(mesAberto),
  ]);
  const href = (m: string) =>
    `/financeiro/relatorios?rel=indireto&ano_indireto=${m.slice(0, 4)}&mes_rateio=${m}`;
  const hrefAno = (a: number) => `/financeiro/relatorios?rel=indireto&ano_indireto=${a}`;
  const doMes = meses.find((m) => m.mes === mesAberto);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 text-corpo">
        <Link className="text-primary hover:underline" href={hrefAno(ano - 1)}>← ano anterior</Link>
        <span className="font-medium tabular-nums">{ano}</span>
        <Link className="text-primary hover:underline" href={hrefAno(ano + 1)}>próximo ano →</Link>
      </div>

      {meses.length === 0 ? (
        <EmptyState
          icone={BarChart3}
          titulo={`Sem custo indireto em ${ano}`}
          descricao="Escritório Central, Manutenção/Documentação de Equipamentos e 002 Equipamentos Colorado não tiveram custo no ano."
        />
      ) : (
        <IndiretoMesesTabela meses={meses} aberto={mesAberto} href={href} mesCorrente={mesCorrente()} />
      )}

      <section className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <SetasDeMes mes={mesAberto} href={href} />
        {doMes && doMes.categorias.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <h3 className="text-corpo font-medium text-foreground">
              O que compôs o indireto de {mesPorExtenso(mesAberto)}
            </h3>
            <ul className="flex max-w-3xl flex-col gap-1">
              {doMes.categorias.slice(0, 8).map((c, i) => (
                <li key={c.categoriaId ?? c.categoria} className="grid grid-cols-[minmax(0,14rem)_1fr_auto] items-center gap-3 text-detalhe">
                  <span className="truncate" title={c.categoria}>{c.categoria}</span>
                  <BarraProporcional valor={c.total} maximo={doMes.categorias[0].total} ordem={i} />
                  <span className="tabular-nums">
                    <MoneyText valor={c.total} />{" "}
                    <span className="text-muted-foreground">({formatarPercentual(c.pct, 0)})</span>
                  </span>
                </li>
              ))}
            </ul>
            {doMes.categorias.length > 8 ? (
              <p className="text-legenda text-muted-foreground">
                Mais {doMes.categorias.length - 8} categorias na tabela do ano, abaixo.
              </p>
            ) : null}
            {Math.round(doMes.diferencaCategorias * 100) !== 0 ? (
              <p className="text-detalhe text-destructive">
                As categorias somam {formatarBRL(doMes.total - doMes.diferencaCategorias)}, e o rateio distribui{" "}
                {formatarBRL(doMes.total)}.
              </p>
            ) : null}
          </div>
        ) : null}
        <h3 className="text-corpo font-medium text-foreground">Como o indireto de {mesPorExtenso(mesAberto)} foi repartido</h3>
        {rateioAberto.linhas.length === 0 && rateioAberto.custoIndiretoMes === 0 ? (
          <EmptyState
            icone={BarChart3}
            titulo="Sem custo indireto neste mês"
            descricao="Escritório Central, Manutenção/Documentação de Equipamentos e 002 Equipamentos Colorado não tiveram custo no mês."
          />
        ) : (
          <RateioIndiretoTabela
            key={`${mesAberto}-${rateioAberto.status}`}
            rateio={rateioAberto}
            podeAjustar={podeAjustar}
          />
        )}
      </section>

      {categorias.length > 0 ? (
        <details className="group rounded-lg border border-border p-4">
          <summary className="foco-anel w-fit cursor-pointer rounded-sm text-corpo font-medium select-none">
            O ano por centro e por categoria
          </summary>
          <div className="pt-3">
            <CustosIndiretosTabela ano={ano} linhas={categorias} mesCorrente={mesCorrente()} />
          </div>
        </details>
      ) : null}
    </div>
  );
}

async function ConteudoInvestimentos({
  periodo,
}: {
  periodo: PeriodoInvestimentos;
}) {
  const dados = await investimentos(periodo);
  if (dados.subcontas.length === 0 && dados.aplicacoes.length === 0) {
    return (
      <EmptyState
        icone={BarChart3}
        titulo="Nenhuma aplicação ainda"
        descricao="Aplicar é transferir da conta para a subconta · INVESTIMENTOS dela, em Financeiro > Transferências, escolhendo a aplicação (CDB, fundo)."
      />
    );
  }
  const temPeriodo = periodo.de !== "" || periodo.ate !== "";
  return (
    <>
      <GradeKpis id="financeiro.relatorios.investimentos" titulo="Investimentos">
        <KPICard
          titulo="Saldo aplicado"
          valor={<ValorAnimado valor={dados.saldoAplicado} />}
          detalhe={
            dados.subcontasOcultas > 0
              ? `Sem ${dados.subcontasOcultas} subconta(s) que você não pode ver`
              : "Somando as subcontas de investimentos"
          }
        />
        <KPICard
          idCard="aplicado"
          titulo={temPeriodo ? "Aplicado no período" : "Aplicado (total)"}
          valor={<ValorAnimado valor={dados.aplicadoPeriodo} />}
          detalhe="Da conta para a subconta"
        />
        <KPICard
          idCard="resgatado"
          titulo={temPeriodo ? "Resgatado no período" : "Resgatado (total)"}
          valor={<ValorAnimado valor={dados.resgatadoPeriodo} />}
          detalhe="Da subconta de volta para a conta"
        />
        <KPICard
          titulo="Aplicações"
          valor={String(dados.aplicacoes.length)}
          detalhe="Etapas do centro Investimentos"
        />
      </GradeKpis>

      <GradeKpis id="financeiro.relatorios.investimentos.tabela" titulo="Tabelas de investimentos" vao="amplo">
        <ItemGrade titulo="Saldo por aplicação" idCard="aplicacoes" larguraPadrao={12}>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              <h3 className="text-corpo font-medium text-foreground">
                Saldo por aplicação
              </h3>
              <p className="text-legenda text-muted-foreground">
                Saldo aplicado é o saldo real de cada aplicação: a última posição do
                extrato mais o que entrou e saiu depois. O período recorta só as
                colunas do período.
              </p>
            </div>
            <AplicacoesTabela dados={dados} />
          </div>
        </ItemGrade>

        {dados.meses.length > 0 ? (
          <ItemGrade titulo="Mês a mês" idCard="mes-a-mes" larguraPadrao={12}>
            <div className="flex flex-col gap-3">
              <h3 className="text-corpo font-medium text-foreground">Mês a mês</h3>
              <InvestimentosPorMesTabela dados={dados} />
            </div>
          </ItemGrade>
        ) : null}

        {dados.movimentos.length > 0 ? (
          <ItemGrade titulo="Aplicações e resgates" idCard="movimentos" larguraPadrao={12}>
            <div className="flex flex-col gap-3">
              <h3 className="text-corpo font-medium text-foreground">
                Aplicações e resgates
              </h3>
              <MovimentosInvestimentoTabela dados={dados} />
            </div>
          </ItemGrade>
        ) : null}
      </GradeKpis>
    </>
  );
}

async function ConteudoCustoCc({
  filtros,
  centroIds,
  centrosCusto,
  erroDoModo,
  podeVerLancamentos,
}: {
  filtros: FiltrosCustoCc;
  /** O cadastro, para dar nome à obra que recebeu indireto sem ter custo no recorte. */
  centrosCusto: readonly { id: string; nome: string; codigo: string | null }[];
  /**
   * Os centros que vão ao banco, já traduzidos da escada da tela: a raiz, ou as
   * etapas dela quando alguma foi escolhida (ver `centrosEfetivos`). Vem por
   * fora de `filtros` porque `filtros` é o que a BARRA mostra de volta — lá os
   * dois níveis precisam continuar separados para cada campo abrir marcado.
   */
  centroIds: string[];
  erroDoModo?: string;
  podeVerLancamentos: boolean;
}) {
  if (erroDoModo) {
    return (
      <EmptyState
        icone={BarChart3}
        titulo="Escolha um centro de custo"
        descricao={erroDoModo}
      />
    );
  }

  // No modo vida o período NASCE dos centros: primeiro descobre quando cada um
  // começou. A janela cabe a vida mais antiga, e cada linha do gráfico começa na
  // dela (o recorte por centro é feito na RPC da série).
  const primeirosMeses =
    filtros.modo === "vida" && centroIds.length > 0
      ? await primeirosMesesDosCentros(centroIds, filtros.incluirInvestimento)
      : undefined;
  const primeiroMes =
    primeirosMeses && primeirosMeses.size > 0
      ? [...primeirosMeses.values()].sort()[0]
      : undefined;

  if (filtros.modo === "vida" && primeiroMes === undefined) {
    return (
      <EmptyState
        icone={BarChart3}
        titulo={
          centroIds.length > 1
            ? "Estes centros de custo ainda não têm custo"
            : "Este centro de custo ainda não tem custo"
        }
        descricao="Nenhum lançamento a pagar foi rateado neles, então ainda não existe uma vida para mostrar."
      />
    );
  }

  const periodo = periodoDoModo(filtros, primeiroMes);
  const pontas = pontasDaRpc(periodo);

  const filtrosDoDrill: FiltrosDoRelatorioDeCusto = {
    categoriaIds: filtros.categoriaIds,
    fornecedorIds: filtros.fornecedorIds,
    formaIds: filtros.formaIds,
    semForma: filtros.semForma,
    status: filtros.status,
    excluirPrevisto: filtros.excluirPrevisto,
    incluirInvestimento: filtros.incluirInvestimento,
  };

  const filtrosDaRpc = {
    ...pontas,
    // Os centros escolhidos são o que faz a tabela e os cartões falarem só deles.
    // Este parâmetro já existiu e era jogado fora antes de chegar ao banco: a
    // escolha mudava a URL e não mudava número nenhum.
    centroIds,
    categoriaIds: filtros.categoriaIds,
    fornecedorIds: filtros.fornecedorIds,
    formaIds: filtros.formaIds,
    semForma: filtros.semForma,
    status: filtros.status,
    excluirPrevisto: filtros.excluirPrevisto,
    tiposCentro: filtros.tiposCentro,
    incluirInvestimento: filtros.incluirInvestimento,
  };

  const comparar = filtros.comparar && comparacaoPermitida(filtros.modo);
  const anterior = comparar ? periodoAnterior(periodo) : null;

  // "Com indireto rateado": só sem recorte que mude a base do indireto (o banco
  // rateia o mês inteiro). Pedido e barrado vira um aviso, não um número errado.
  const rateioPedido = filtros.comIndireto;
  const rateioVale = rateioPedido && rateioPermitidoNoCustoCc(filtros);
  // O rateio precisa das duas pontas: em "tudo" e na janela aberta elas vêm do
  // primeiro e do último mês com lançamento, como no DRE.
  const pontasDoIndireto = async (p: PeriodoCompetencia) => {
    const fechado =
      p.mes || (p.de && p.ate) ? p : periodoFechado(p, await mesesDeCompetencia());
    const { inicio, fim } = fechado ? pontasDaRpc(fechado) : {};
    return inicio && fim ? indiretoDoPeriodo(inicio, fim) : null;
  };

  const [custo, custoAnterior, series, indireto, indiretoAnterior] = await Promise.all([
    custoPorCentroCusto(filtrosDaRpc),
    anterior
      ? custoPorCentroCusto({ ...filtrosDaRpc, ...pontasDaRpc(anterior) })
      : Promise.resolve(null),
    filtros.modo === "vida" && centroIds.length > 0
      ? serieDosCentros(centroIds, filtrosDaRpc)
      : Promise.resolve(null),
    rateioVale ? pontasDoIndireto(periodo) : Promise.resolve(null),
    rateioVale && anterior ? pontasDoIndireto(anterior) : Promise.resolve(null),
  ]);

  if (custo.centros.length === 0) {
    return (
      <EmptyState
        icone={BarChart3}
        titulo="Sem custo neste período"
        descricao="Nenhum lançamento a pagar cai neste recorte. Troque o período ou afrouxe os filtros."
      />
    );
  }

  const nomes = new Map(centrosCusto.map((c) => [c.id, { nome: c.nome, codigo: c.codigo }]));
  const comIndireto = (base: typeof custo, rateio: IndiretoDoPeriodo | null) =>
    rateio ? aplicarIndireto(base.centros, rateio, nomes) : base;
  // A tela inteira (gráfico, tabela, variação) lê o custo já com o indireto
  // trocado de linha; o cartão "Custo total" continua o do banco, que é o mesmo
  // dinheiro e prova que nada foi somado duas vezes.
  const custoDaTela = comIndireto(custo, indireto);
  const anteriorDaTela = custoAnterior ? comIndireto(custoAnterior, indiretoAnterior) : null;
  const diferencaDoRateio =
    Math.round(custoDaTela.total * 100) - Math.round(custo.total * 100);

  const maior = custoDaTela.centros[0];

  // Variação por centro, em centavos: somar reais em ponto flutuante sobre dezenas
  // de centros acumula resto, e o total da coluna deixaria de bater com as linhas.
  const variacao = anteriorDaTela
    ? new Map(
        custoDaTela.centros.map((centro) => {
          const antes =
            anteriorDaTela.centros.find(
              (outro) => outro.centroCustoId === centro.centroCustoId,
            )?.valor ?? 0;
          const diferenca =
            Math.round(centro.valor * 100 - antes * 100) / 100;
          return [
            centro.centroCustoId,
            {
              valorAnterior: antes,
              diferenca,
              // Percentual sobre zero não existe: "+100%" leria como a obra tendo
              // dobrado de custo, quando ela acabou de começar.
              percentual: antes > 0 ? (diferenca / antes) * 100 : null,
            },
          ];
        }),
      )
    : undefined;

  const destinos = podeVerLancamentos
    ? new Map(
        custoDaTela.centros
          .filter((centro) => centro.centroCustoId && centro.centroCustoId !== ID_NAO_RATEADO)
          .map((centro) => [
            centro.centroCustoId,
            drillCentroCusto({
              centroCustoIds: [centro.centroCustoId],
              periodo,
              filtros: filtrosDoDrill,
            }),
          ]),
      )
    : undefined;

  const descricaoPeriodo = descreverPeriodo(periodo, filtros.modo);

  return (
    <>
      <GradeKpis id="financeiro.relatorios.custo-cc" titulo="Custo por centro">
        <KPICard
          titulo="Custo total"
          valor={<ValorAnimado valor={custo.total} />}
          detalhe={
            filtros.modo === "vida" && primeiroMes
              ? `Desde ${rotuloMes(primeiroMes)}, o primeiro lançamento ${
                  centroIds.length > 1
                    ? "do mais antigo destes centros"
                    : "deste centro"
                }`
              : descricaoPeriodo
          }
        />
        <KPICard
          titulo="Centros de custo"
          valor={custoDaTela.centros.length}
          detalhe={indireto ? "Com o indireto rateado nas obras" : "Com custo no período"}
        />
        {maior ? (
          <KPICard
            titulo="Maior centro de custo"
            valor={<ValorAnimado valor={maior.valor} />}
            detalhe={maior.nome}
          />
        ) : null}
        {custoAnterior ? (
          <KPICard
            titulo="Período anterior"
            valor={<ValorAnimado valor={custoAnterior.total} />}
            detalhe={`Variação de ${formatarBRL(custo.total - custoAnterior.total)}`}
          />
        ) : null}
      </GradeKpis>

      {series && series.length > 0 ? (
        <PainelGrafico
          id="financeiro.relatorios.custo-cc.serie"
          titulo="Custo mês a mês dos centros"
        >
          <CustoCcSerie
            series={series}
            filtros={filtrosDoDrill}
            podeVerLancamentos={podeVerLancamentos}
          />
        </PainelGrafico>
      ) : (
        <PainelGrafico
          id="financeiro.relatorios.custo-cc.grafico"
          titulo="Custo por centro de custo"
        >
          <CustoCcGrafico centros={custoDaTela.centros} destinos={destinos} />
        </PainelGrafico>
      )}

      {/* Grade própria, e não dentro da do gráfico: o gráfico troca de grade
          conforme o modo (série ou barras), e a tabela é a mesma nos dois. */}
      <GradeKpis id="financeiro.relatorios.custo-cc.tabela" titulo="Tabela do custo por centro" vao="amplo">
        <ItemGrade titulo="Tabela do custo por centro" idCard="tabela" larguraPadrao={12}>
          {rateioPedido && !rateioVale ? (
            <p className="mb-2 text-detalhe text-muted-foreground">
              O rateio do indireto só entra sem filtro de categoria, fornecedor, forma, status, centro, tipo de centro, previsto ou investimentos, e fora da vida do centro.
            </p>
          ) : null}
          {indireto && diferencaDoRateio !== 0 ? (
            // Não deveria acontecer (a base do rateio é o mesmo custo): se
            // acontecer, a tela diz em vez de esconder.
            <p className="mb-2 text-detalhe text-status-pendente">
              O indireto rateado não fecha com o custo dos centros indiretos: diferença de {formatarBRL(diferencaDoRateio / 100)}.
            </p>
          ) : null}
          <CustoCcTabela
            custo={custoDaTela}
            periodo={periodo}
            filtros={filtrosDoDrill}
            podeVerLancamentos={podeVerLancamentos}
            variacao={variacao}
          />
        </ItemGrade>
      </GradeKpis>
    </>
  );
}

/**
 * Custo x receita: cartões, gráfico por mês e as duas tabelas.
 *
 * As três leituras somam as MESMAS linhas do grão fino que a RPC devolve (ver
 * `custo-receita.ts`), então não existe caminho para o gráfico discordar do
 * cartão. Foi a terceira vez em dois dias que duas contas do mesmo dinheiro
 * divergiram neste projeto; aqui a divergência é impossível por construção.
 */
async function ConteudoCustoReceita({
  centrosCusto,
  centrosReceita,
  meses,
  incluirInvestimento,
  podeVerLancamentos,
}: {
  /**
   * Os centros que vão ao banco, já traduzidos da escada da tela: a raiz, ou as
   * etapas dela quando alguma foi escolhida (ver `centrosEfetivos`). Chegam
   * prontos, e não como o par raiz+etapa cru, porque duas traduções da mesma
   * escolha divergiriam no primeiro detalhe que alguém acrescentasse de um lado
   * só — e o sintoma seria a tabela somando um conjunto e a barra dizendo outro.
   */
  centrosCusto: string[];
  centrosReceita: string[];
  meses: string[];
  /** CAPEX de volta no lado do custo ("Incluir investimentos"). */
  incluirInvestimento: boolean;
  podeVerLancamentos: boolean;
}) {
  if (meses.length === 0) {
    return (
      <EmptyState
        icone={BarChart3}
        titulo="Nenhum mês de referência no recorte"
        descricao="A janela escolhida não cobre nenhum mês com lançamento. Troque o período ou marque os meses direto."
      />
    );
  }

  // A margem por obra, com o indireto rateado, mora na visão "Por obra" desde
  // 15/10/2026. Esta visão é a de cruzar conjuntos de centros, sem rateio.
  const linhas = await custoReceita({
    meses,
    centrosCusto,
    centrosReceita,
    incluirInvestimento,
  });

  if (linhas.length === 0) {
    return (
      <EmptyState
        icone={BarChart3}
        titulo="Sem custo e sem receita neste recorte"
        descricao="Nenhum lançamento cai nos centros e meses escolhidos. Afrouxe os filtros ou marque outros meses."
      />
    );
  }

  const total = totais(linhas);
  const porMesDoRelatorio = porMes(linhas);
  const custos = porCentro(linhas, "a_pagar");
  const receitas = porCentro(linhas, "a_receber");
  return (
    <>
      <GradeKpis id="financeiro.relatorios.custo-receita" titulo="Custo x receita">
        <KPICard
          titulo="Receita líquida"
          valor={<ValorAnimado valor={total.receitaLiquida} />}
          detalhe={
            total.retencao > 0
              ? `Retido ${formatarBRL(total.retencao)}, somando ${formatarBRL(total.receitaFaturada)}`
              : "Sem retenção na fonte no recorte"
          }
        />
        <KPICard
          titulo="Custo"
          valor={<ValorAnimado valor={total.custo} />}
          detalhe={`${porMesDoRelatorio.length} ${porMesDoRelatorio.length === 1 ? "mês de referência" : "meses de referência"}`}
        />
        <KPICard
          titulo="Resultado"
          valor={<ValorAnimado valor={total.resultado} />}
          detalhe={
            total.resultado >= 0
              ? "Receita líquida menos custo"
              : "Custo acima da receita líquida"
          }
        />
        <KPICard
          titulo="Margem"
          valor={
            total.margem === null ? "—" : formatarPercentual(total.margem)
          }
          detalhe={
            total.margem === null
              ? "Sem receita no recorte: não há margem"
              : "Resultado sobre a receita líquida"
          }
        />
      </GradeKpis>

      {/* SEM faixa de movimentação de dívida aqui, e é decisão, não esquecimento.
          Ela existiu por um dia (26/08/2026) para o empréstimo aparecer sem somar
          na receita. Em 27/08 o Tiago decidiu que a análise inteira do centro de
          Empréstimos vive no relatório de Créditos (hoje o painel de Dívidas, desde
          14/10/2026), e a faixa passou a mostrar só
          resíduo: um pagamento de empréstimo de R$ 37.300,00 parado no Escritório
          Central, que o corte por centro financeiro não pegava. Hoje a RPC só
          devolve categoria operacional, então não há o que mostrar. */}

      {/* As duas tabelas nascem lado a lado (meia linha cada): são de dinheiros
          opostos e se leem em par. */}
      <PainelGrafico
        id="financeiro.relatorios.custo-receita.grafico"
        titulo="Custo e receita por mês"
        tituloGrade="Gráfico e tabelas de custo x receita"
        depois={
          <>
            <ItemGrade titulo="Custo por centro" idCard="tabela-custo" larguraPadrao={6}>
              <CustoReceitaTabela
                linhas={custos}
                lado="custo"
                meses={meses}
                podeVerLancamentos={podeVerLancamentos}
                incluirInvestimento={incluirInvestimento}
              />
            </ItemGrade>
            <ItemGrade titulo="Receita por centro" idCard="tabela-receita" larguraPadrao={6}>
              <CustoReceitaTabela
                linhas={receitas}
                lado="receita"
                meses={meses}
                podeVerLancamentos={podeVerLancamentos}
              />
            </ItemGrade>
          </>
        }
      >
        <CustoReceitaGrafico meses={porMesDoRelatorio} />
      </PainelGrafico>

    </>
  );
}

async function ConteudoCustoGrupo({
  periodo,
  modo,
  recorte,
  podeVerLancamentos,
}: {
  periodo: PeriodoCompetencia;
  modo: ModoPeriodo;
  /**
   * Centro e categoria escolhidos, o centro já traduzido pela escada da tela (a
   * etapa substitui a raiz). Vai à RPC, desce para os três níveis da tabela e
   * viaja no link do drill: é o mesmo recorte nos quatro lugares, ou os números
   * da tela discordam entre si.
   */
  recorte: RecorteCustoGrupo;
  podeVerLancamentos: boolean;
}) {
  // O período anterior de mesmo tamanho e a série mensal contam onde o custo
  // sobe. Período aberto (tudo, "de X em diante") não tem nem um nem outro.
  const anteriorPeriodo = periodoAnterior(periodo);
  const meses = mesesDoPeriodo(periodo);
  const pontas = pontasDaRpc(periodo);
  const [custo, anterior, serie] = await Promise.all([
    custoPorGrupo({ ...pontas, ...recorte }),
    anteriorPeriodo ? custoPorGrupo({ ...pontasDaRpc(anteriorPeriodo), ...recorte }) : null,
    meses.length > 1 && meses.length <= 36 && pontas.inicio && pontas.fim
      ? custoPorGrupoMensal({ ...recorte, inicio: pontas.inicio, fim: pontas.fim })
      : [],
  ]);

  const descricaoPeriodo = descreverPeriodo(periodo, modo);
  const temRecorte =
    recorte.centroCustoId !== undefined || recorte.categoriaId !== undefined;

  if (custo.grupos.length === 0) {
    return (
      <EmptyState
        icone={BarChart3}
        titulo="Sem custo neste recorte"
        descricao={
          temRecorte
            ? "Nenhum lançamento a pagar cai no período com o centro e a categoria escolhidos. Troque o período ou afrouxe os filtros."
            : "Nenhum lançamento a pagar tem mês de referência neste período."
        }
      />
    );
  }

  const maior = [...custo.grupos].sort((a, b) => b.valor - a.valor)[0];

  return (
    <>
      <GradeKpis id="financeiro.relatorios.custo-grupo" titulo="Custo por grupo">
        <KPICard
          titulo="Custo total"
          valor={<ValorAnimado valor={custo.total} />}
          detalhe={descricaoPeriodo}
        />
        {maior ? (
          <KPICard
            titulo="Maior grupo"
            valor={<ValorAnimado valor={maior.valor} />}
            detalhe={maior.nome}
          />
        ) : null}
        <KPICard
          titulo="Grupos com custo"
          valor={custo.grupos.length}
          detalhe="Abra o grupo para ver subcategoria e insumo"
        />
      </GradeKpis>
      <CustoGrupoHistoria
        custo={custo}
        anterior={anterior}
        descricaoPeriodo={descricaoPeriodo}
        descricaoAnterior={anteriorPeriodo ? descreverPeriodo(anteriorPeriodo) : null}
        serie={serie}
      />
      <GradeKpis id="financeiro.relatorios.custo-grupo.tabela" titulo="Tabela do custo por grupo" vao="amplo">
        <ItemGrade titulo="Tabela do custo por grupo" idCard="tabela" larguraPadrao={12}>
          <CustoGrupoTabela
            custo={custo}
            periodo={periodo}
            recorte={recorte}
            podeVerLancamentos={podeVerLancamentos}
          />
        </ItemGrade>
      </GradeKpis>
    </>
  );
}

async function ConteudoExtratoFornecedor({
  fornecedorIds,
  periodoRanking,
  podeVerLancamentos,
}: {
  fornecedorIds: string[];
  /** O período do ranking (lido da URL); não recorta o extrato de um fornecedor. */
  periodoRanking: PeriodoNaUrl;
  podeVerLancamentos: boolean;
}) {
  // Sem fornecedor escolhido, a seção abre no RANKING, agregado no banco: a
  // versão anterior trazia os 6.710 lançamentos a pagar para o navegador e não
  // respondia a quem a EMT deve mais. O extrato vira o clique num fornecedor.
  if (fornecedorIds.length === 0) {
    const periodo = periodoDoModoSimples(periodoRanking);
    const [fornecedores, ranking] = await Promise.all([
      listarFornecedoresComLancamentos(),
      rankingFornecedores(pontasDaRpc(periodo)),
    ]);
    return (
      <SecaoRelatorio
        relatorio="extrato-fornecedor"
        titulo="Fornecedores"
        descricao="Uma linha por fornecedor, somada no banco. Lançado é o valor dos documentos a pagar com mês de referência no período; pago é o que saiu da conta no período (parcelas pagas, pelo líquido, pela data do pagamento). Em aberto, vencido e vence em 30 dias são a posição de hoje, pelas parcelas não pagas nem canceladas, e não mudam com o período. Cancelados ficam de fora. O nome do fornecedor abre o extrato dele."
        exportar="extrato-fornecedor"
        controles={<SeletorFornecedor fornecedores={fornecedores} valores={[]} />}
      >
        <FiltrosRankingFornecedoresBarra filtros={periodoRanking} />
        <RankingFornecedores
          linhas={ranking}
          descricaoPeriodo={descreverPeriodo(periodo, periodoRanking.modo)}
        />
      </SecaoRelatorio>
    );
  }

  const [fornecedores, extrato] = await Promise.all([
    listarFornecedoresComLancamentos(),
    extratoPorFornecedor({ fornecedorIds }),
  ]);

  return (
    <SecaoRelatorio
      relatorio="extrato-fornecedor"
      titulo="Extrato por fornecedor"
      descricao="Lançamentos a pagar dos fornecedores escolhidos, do vencimento mais recente para o mais antigo. A coluna Mês de referência é o mês em que o custo entra. Os cartões somam o que está em aberto nas parcelas e acompanham os filtros da tabela."
      exportar="extrato-fornecedor"
      controles={
        <>
          <a
            href="/financeiro/relatorios?rel=extrato-fornecedor"
            className="foco-anel rounded-sm text-detalhe text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            Ver todos os fornecedores
          </a>
          <SeletorFornecedor
            fornecedores={fornecedores}
            valores={extrato.fornecedorIds}
          />
        </>
      }
    >
      {/* Os cartões moram DENTRO da tabela agora: eles somam as linhas que
          sobraram do filtro, e filtro aqui é client-side. */}
      <ExtratoFornecedorTabela
        lancamentos={extrato.lancamentos}
        podeVerLancamentos={podeVerLancamentos}
        fornecedoresEscolhidos={extrato.fornecedorIds.map(
          (id) =>
            fornecedores.find((fornecedor) => fornecedor.id === id)?.nome ?? id,
        )}
      />
    </SecaoRelatorio>
  );
}

/**
 * `gerarPlanilhaDoRelatorio` roda na função DESTA página. Estava sem teto desde
 * que nasceu: com o padrão da Vercel (10 a 15s) um relatório grande morre no
 * meio e devolve erro no lugar do arquivo. Achado em 01/09/2026 pelo
 * `max-duration-de-quem-exporta.test.ts`, escrito depois de o mesmo esquecimento
 * derrubar a exportação de Pagamentos. Mesma razão do /financeiro/lancamentos.
 */
export const maxDuration = 60;

export default async function RelatoriosPage({
  searchParams,
}: RelatoriosPageProps) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "financeiro.relatorios", "ver")) {
    notFound();
  }

  /**
   * O drill-down leva para `/financeiro/lancamentos`, que exige a própria
   * permissão. Sem ela, o link levaria a um `notFound()` — então ele não aparece,
   * e o relatório continua servindo como leitura.
   */
  const podeVerLancamentos = temPermissao(
    usuario,
    "financeiro.lancamentos",
    "ver",
  );

  const params = await searchParams;

  // Ids que deixaram de existir em 15/10/2026 (Custo x receita, Custos
  // indiretos, Rateio do indireto): o link antigo cai no relatório novo, na
  // mesma rota e com o resto da query. O destino não redireciona de novo, então
  // a query lembrada pela sessão não prende ninguém num laço.
  const queryNova = queryDoIdAntigo(paraUrlSearchParams(params));
  if (queryNova !== null) {
    redirect(`/financeiro/relatorios?${queryNova}`);
  }

  const relatorio: RelatorioId = normalizarRelatorio(primeiro(params.rel));
  const cruzarCentros =
    relatorio === "resultado-obra" && primeiro(params.visao) === "cruzar";
  const recorteIndireto = recorteDoIndireto(
    primeiro(params.ano_indireto),
    primeiro(params.mes_rateio),
    mesFechado(),
  );
  // Abre no último mês fechado; anda até o corrente, nunca para o futuro.
  const mesObra = [mesDoRateio(primeiro(params.mes_obra), mesFechado()), mesCorrente()].sort()[0];

  // O relatório de investimentos virou a aba Financeiro > Aplicações (25/09/2026),
  // que mostra o mesmo movimento mais a posição do extrato e o rendimento. Quem
  // tem a aba vai para ela; quem só tem Relatórios continua vendo o relatório.
  // A barra vai direto para lá; o redirect fica para link antigo e favorito.
  const investimentosEmAplicacoes = temPermissao(usuario, "financeiro.aplicacoes", "ver");
  if (relatorio === "investimentos" && investimentosEmAplicacoes) {
    redirect("/financeiro/aplicacoes");
  }

  // Lista, com uuid validado, deduplicada e no teto do filtro `in`. Regra e teto
  // moram em extrato-filtros.ts, que o seletor também usa para escrever.
  const fornecedorIds = lerFornecedoresDaUrl(params.fornecedor);

  /**
   * A janela do fluxo de caixa. Leitura pura e barata, feita sempre: ela não vai
   * ao banco, e o corte que ela descreve é aplicado dentro de `fluxoCaixa`.
   */
  const filtrosFluxo = lerFiltrosFluxoCaixa(params);
  const janelaFluxo = janelaDoFluxo(filtrosFluxo, mesCorrente());

  // O DRE e o custo por grupo leem o MESMO contrato de período (`modo`, `mes`,
  // `de`, `ate`) do custo por centro de custo: os três recortam o mês de
  // referência do lançamento, então trocar de relatório na barra de cima mantém o
  // recorte em vez de jogá-lo fora.
  const periodoInvestimentos = lerPeriodoInvestimentos(params);

  // DRE, custo por grupo e custo por centro abrem no ÚLTIMO MÊS FECHADO, não
  // no mês corrente: no dia 15 o mês corrente tem metade das notas e nenhuma
  // medição, e o primeiro número da tela parecia uma queda que não houve. Os
  // três usam o mesmo padrão para continuarem fechando entre si, e o Excel
  // (actions.ts) lê o mesmo `mesFechado`.
  const periodoDre = lerPeriodoDaUrl(params, mesFechado());
  const filtrosCustoGrupo = lerFiltrosCustoGrupo(params, mesFechado());

  // O relatório de centro de custo tem contrato de URL próprio (4 modos de
  // período + filtros de análise), lido pelo mesmo padrão do de lançamentos.
  const { filtros: filtrosCustoCc, erroDoModo } = lerFiltrosCustoCc(
    params,
    mesFechado(),
  );

  // As opções dos seletores só são lidas na aba que as usa: as outras cinco não
  // precisam de centro, categoria, fornecedor nem forma de pagamento, e quatro
  // consultas em toda navegação de relatório seriam trabalho jogado fora.
  const opcoesCustoCc =
    relatorio === "custo-cc"
      ? await Promise.all([
          listarCentrosCustoParaFiltro(),
          listarCategorias(),
          listarFornecedores(),
          listarFormasPagamento(),
        ])
      : null;

  // Custo por grupo de insumo: os dois cadastros que a barra dele oferece.
  const opcoesCustoGrupo =
    relatorio === "custo-grupo"
      ? await Promise.all([listarCentrosCustoParaFiltro(), listarCategorias()])
      : null;

  /**
   * Os meses que existem, para o DRE fechar as pontas abertas do período.
   *
   * A `fn_rel_dre` recebe as duas datas sem `default` e sem guarda de nulo, então
   * "tudo" e "de julho em diante" precisam de uma data de verdade dos dois lados.
   * O primeiro e o último mês com lançamento são o "tudo" exato — não uma data
   * inventada com folga, que traria mês vazio para dentro do relatório.
   */
  const mesesParaDre = relatorio === "dre" ? await mesesDeCompetencia() : [];

  /**
   * Custo x receita: os meses que existem e o cadastro de centros.
   *
   * Os meses vêm ANTES da leitura da URL porque é deles que sai o padrão do
   * relatório (todos) e a ponta aberta da janela ("de julho em diante" termina no
   * último mês que existe, não no fim dos tempos).
   */
  const mesesDisponiveis = cruzarCentros ? await mesesDeCompetencia() : [];
  const centrosParaCustoReceita = cruzarCentros
    ? await listarCentrosCustoParaFiltro()
    : null;

  /**
   * Fluxo de caixa: o cadastro de centros, para a escada dos dois lados.
   *
   * Lido só nesta aba, como nas outras: as oito restantes não oferecem centro, e
   * uma consulta em toda navegação de relatório seria trabalho jogado fora.
   */
  const centrosParaFluxo =
    relatorio === "fluxo-caixa" ? await listarCentrosCustoParaFiltro() : null;
  const { filtros: filtrosCustoReceita, mesesEfetivos: mesesCustoReceita } =
    lerFiltrosCustoReceita(params, mesesDisponiveis);

  /**
   * Custo x receita: cada seletor de centro oferece só quem mexe no lado dele.
   * O cadastro inteiro continua indo para `centrosEfetivos`; só as opções da
   * barra encolhem. Ver `cadastroComMovimento`.
   */
  const cadastrosCustoReceita = centrosParaCustoReceita
    ? await centrosComMovimentoNoCustoReceita({
        meses: mesesDisponiveis,
        centros: centrosParaCustoReceita,
        incluirInvestimento: filtrosCustoReceita.incluirInvestimento,
      }).then((movimento) => ({
        custo: cadastroComMovimento(centrosParaCustoReceita, movimento.custo, [
          ...filtrosCustoReceita.centrosCusto,
          ...filtrosCustoReceita.etapasCusto,
        ]),
        receita: cadastroComMovimento(
          centrosParaCustoReceita,
          movimento.receita,
          [
            ...filtrosCustoReceita.centrosReceita,
            ...filtrosCustoReceita.etapasReceita,
          ],
        ),
      }))
    : null;

  return (
    <div className="flex flex-col gap-6">
      {/* A lista dos relatórios saiu do subtítulo de propósito: ela já tinha
          vencido (faltavam "Custo x receita" e "Custo por grupo de insumo") e
          venceria de novo no próximo relatório, porque quem acrescenta um mexe
          em `RELATORIOS` e não neste texto. Quem lista os nove, sempre em dia, é
          a barra logo abaixo. */}
      <PageHeader
        modulo="Financeiro"
        titulo="Relatórios"
        descricao="Como está o caixa e onde entra o custo. Escolha o relatório na barra abaixo."
      />

      <RelatoriosNav
        ativo={relatorio}
        investimentosEmAplicacoes={investimentosEmAplicacoes}
      />

      {relatorio === "fluxo-caixa" ? (
        <SecaoRelatorio
          relatorio="fluxo-caixa"
          exportar={relatorio}
          titulo="Fluxo de caixa"
          descricao="Regime de CAIXA: entradas e saídas pelo mês de pagamento (realizado) e de vencimento (projetado), sem o mês de referência. O dinheiro se separa pela NATUREZA da categoria em cinco grupos: operação (operacional e financeira), investimento (CAPEX), mútuo com as empresas ligadas, dívida (empréstimo tomado e amortização) e aplicações (resgate e aplicação manuais). Distribuição a sócios fica fora do fluxo. Rendimento e ajuste de abertura de aplicação ficam fora: mudam o saldo da subconta, não passam pela conta corrente. A janela padrão é o ano para trás e o ano para frente, porque as prestações dos financiamentos vão até 2031. O disponível projetado parte do saldo de hoje das contas correntes e caixa e soma só o previsto; a segunda linha soma o aplicado de hoje nas subcontas de investimento. Com centro escolhido, cada barra passa a somar a FATIA do rateio daquele centro: um lançamento dividido entre duas obras entra em cada uma pela parte dela."
        >
          <FiltrosFluxoCaixaBarra
            filtros={filtrosFluxo}
            janela={janelaFluxo}
            centrosCusto={centrosParaFluxo ?? []}
          />
          <ConteudoFluxoCaixa
            janela={janelaFluxo}
            /* A escada de dois campos vira a lista que a RPC aceita: a etapa
               escolhida SUBSTITUI a raiz, e o banco filtra pela subárvore do que
               receber. Mesma tradução do Custo x receita. */
            centrosCusto={centrosEfetivos(
              centrosParaFluxo ?? [],
              filtrosFluxo.centrosCusto,
              filtrosFluxo.etapasCusto,
            )}
            centrosReceita={centrosEfetivos(
              centrosParaFluxo ?? [],
              filtrosFluxo.centrosReceita,
              filtrosFluxo.etapasReceita,
            )}
            podeVerLancamentos={podeVerLancamentos}
          />
        </SecaoRelatorio>
      ) : null}

      {relatorio === "dre" ? (
        <SecaoRelatorio
          relatorio="dre"
          exportar={relatorio}
          titulo="DRE gerencial"
          descricao="Regime de COMPETÊNCIA: receitas e despesas por categoria no MÊS DE REFERÊNCIA do lançamento, com o resultado. O período aceita um mês, uma janela (o trimestre, o ano) ou tudo."
        >
          <FiltrosDreBarra filtros={periodoDre} />
          <ConteudoDre
            periodo={
              periodoFechado(periodoDoModoSimples(periodoDre), mesesParaDre) ?? {}
            }
            podeVerLancamentos={podeVerLancamentos}
          />
        </SecaoRelatorio>
      ) : null}

      {relatorio === "custo-grupo" && opcoesCustoGrupo ? (
        <SecaoRelatorio
          relatorio="custo-grupo"
          exportar={relatorio}
          titulo="Custo por grupo de insumo"
          descricao="Regime de COMPETÊNCIA: Material, Mão de obra, Equipamentos e Outros pelo MÊS DE REFERÊNCIA. Abra o grupo para chegar na subcategoria e no insumo; a linha Sem insumo (lançamento sem item de ordem de compra) abre pela categoria financeira do rateio. A comparação é contra o período anterior de mesmo tamanho, com o mesmo centro e categoria; em O que mais subiu entram os grupos com insumo e as categorias do Sem insumo. Com o mesmo período, centro e categoria, o total fecha com o Custo por centro de custo, menos o rateio sem categoria lançado em centro de empresa ligada: aqui o centro de empresa ligada fica fora pela raiz, lá ele entra quando o rateio não tem categoria (em 2026, dois 13º no centro Amazônia, R$ 1.621,00)."
        >
          <FiltrosCustoGrupoBarra
            filtros={filtrosCustoGrupo}
            centrosCusto={opcoesCustoGrupo[0]}
            categorias={opcoesCustoGrupo[1]}
          />
          <ConteudoCustoGrupo
            periodo={periodoDoModoSimples(filtrosCustoGrupo)}
            modo={filtrosCustoGrupo.modo}
            recorte={{
              // A escada vira UM id aqui, que é o que a RPC aceita: a etapa
              // escolhida SUBSTITUI a raiz, e o banco filtra pela subárvore do
              // que receber.
              centroCustoId: centrosEfetivos(
                opcoesCustoGrupo[0],
                filtrosCustoGrupo.centroId ? [filtrosCustoGrupo.centroId] : [],
                filtrosCustoGrupo.etapaId ? [filtrosCustoGrupo.etapaId] : [],
              )[0],
              categoriaId: filtrosCustoGrupo.categoriaId || undefined,
              incluirInvestimento: filtrosCustoGrupo.incluirInvestimento,
            }}
            podeVerLancamentos={podeVerLancamentos}
          />
        </SecaoRelatorio>
      ) : null}

      {relatorio === "aging" ? (
        <SecaoRelatorio
          relatorio="aging"
          exportar={relatorio}
          titulo="Aging de vencimentos"
          descricao="Regime de CAIXA: parcelas em aberto por faixa de vencimento, a pagar e a receber."
        >
          <ConteudoAging podeVerLancamentos={podeVerLancamentos} />
        </SecaoRelatorio>
      ) : null}

      {relatorio === "posicao-bancaria" ? (
        <SecaoRelatorio
          relatorio="posicao-bancaria"
          exportar={relatorio}
          titulo="Posição bancária"
          descricao="Saldo por conta: saldo inicial mais as parcelas pagas e as transferências desde a data de corte. Disponível é o das contas correntes e caixa; aplicado, o das subcontas de investimento. Cada conta é comparada com o último extrato importado, na data dele: o que o sistema registra depois ainda não foi confirmado pelo banco."
        >
          <ConteudoPosicaoBancaria podeVerLancamentos={podeVerLancamentos} />
        </SecaoRelatorio>
      ) : null}

      {relatorio === "socios-ligadas" ? (
        <SecaoRelatorio
          relatorio="socios-ligadas"
          titulo="Empresas ligadas"
          descricao="Regime de competência (o mês de referência do lançamento), por centro raiz de tipo Empresa ligada, contando o rateio cuja categoria é de natureza mútuo. O mútuo fica fora do resultado e do custo das obras. Em aberto é a parte do rateio cujas parcelas ainda não foram pagas. O saldo da ligada é o enviado (a pagar) menos o devolvido (a receber), desde o primeiro lançamento."
          exportar="socios-ligadas"
        >
          <ConteudoSociosLigadas />
        </SecaoRelatorio>
      ) : null}

      {relatorio === "aquisicoes" ? (
        <SecaoRelatorio
          relatorio="aquisicoes"
          titulo="Equipamentos e consórcios"
          descricao="O que foi comprado, por bem (centros de imobilizado e as carretas lançadas como Aquisição de Equipamento), e as cotas de consórcio. O pago vem das parcelas do lançamento, na proporção do rateio: um lançamento dividido entre três carretas paga um terço de cada. A quitação é o vencimento da última parcela em aberto. No consórcio com cota cadastrada em Financeiro › Dívidas, o a pagar e as parcelas que restam vêm do cronograma da cota. Seguro-garantia e caução lançados com a categoria Investimentos não são máquina e ficam fora."
        >
          <ConteudoAquisicoes podeVerLancamentos={podeVerLancamentos} />
        </SecaoRelatorio>
      ) : null}

      {relatorio === "indireto" ? (
        <SecaoRelatorio
          relatorio="indireto"
          exportar={relatorio}
          titulo="Indireto"
          descricao="O custo do Escritório Central, da Manutenção/Documentação de Equipamentos e do 002 Equipamentos Colorado, mês a mês, e como ele foi repartido entre as obras: pelo custo direto de cada uma no mês, salvo quando quem fecha o mês ajusta os percentuais e confirma. Os lançamentos não mudam: o rateio aparece no Resultado por obra e no Custo por centro de custo. A categoria que mais pesou fica na linha do mês porque um salto de imposto ou de parcelamento no Escritório Central vira, pelo rateio, custo das obras."
        >
          <ConteudoIndireto
            ano={recorteIndireto.ano}
            mesAberto={recorteIndireto.mes}
            podeAjustar={temPermissao(usuario, "financeiro.competencias", "aprovar")}
          />
        </SecaoRelatorio>
      ) : null}

      {relatorio === "investimentos" ? (
        <SecaoRelatorio
          relatorio="investimentos"
          exportar={relatorio}
          titulo="Investimentos"
          descricao="Dinheiro aplicado (CDB, fundo) na subconta de investimentos de cada conta. Aplicar não é despesa: o dinheiro só muda de bolso e continua da empresa, por isso fica fora do custo e do DRE; no fluxo de caixa, resgate e aplicação aparecem no grupo Aplicações, separados da operação. Leitura para quem não tem a aba Aplicações: quem tem é levado direto a ela, que é onde se lança."
        >
          <FiltrosInvestimentosBarra periodo={periodoInvestimentos} />
          <ConteudoInvestimentos periodo={periodoInvestimentos} />
        </SecaoRelatorio>
      ) : null}

      {relatorio === "custo-cc" && opcoesCustoCc ? (
        <SecaoRelatorio
          relatorio="custo-cc"
          exportar={relatorio}
          titulo="Custo por centro de custo"
          descricao="Regime de COMPETÊNCIA: custo por centro de custo pelo MÊS DE REFERÊNCIA do lançamento (é o gasto da obra no mês, não o que saiu do caixa). Clique num centro para ver os lançamentos dele, com o mesmo filtro."
        >
          <FiltrosCustoCcBarra
            filtros={filtrosCustoCc}
            centrosCusto={opcoesCustoCc[0]}
            categorias={opcoesCustoCc[1]}
            fornecedores={opcoesCustoCc[2]}
            formasPagamento={opcoesCustoCc[3]}
          />
          <ConteudoCustoCc
            filtros={filtrosCustoCc}
            centroIds={centrosEfetivos(
              opcoesCustoCc[0],
              filtrosCustoCc.centroIds,
              filtrosCustoCc.etapaIds,
            )}
            centrosCusto={opcoesCustoCc[0]}
            erroDoModo={erroDoModo}
            podeVerLancamentos={podeVerLancamentos}
          />
        </SecaoRelatorio>
      ) : null}

      {relatorio === "resultado-obra" ? (
        <SecaoRelatorio
          relatorio="resultado-obra"
          exportar={relatorio}
          titulo="Resultado por obra"
          descricao={
            cruzarCentros
              ? "Regime de COMPETÊNCIA, pelo MÊS DE REFERÊNCIA do lançamento. Os centros do custo e os da receita são escolhidos separadamente: é o custo de um conjunto contra a receita de outro, sem rateio do indireto. Conta só categoria de natureza operacional na receita, e a receita é a líquida (a retenção aparece ao lado)."
              : "Regime de COMPETÊNCIA, pelo MÊS DE REFERÊNCIA do lançamento. Receita líquida (só natureza operacional) menos custo direto da obra (tudo menos movimentação, distribuição, mútuo e investimento) menos o indireto rateado mês a mês pelo custo direto (ou pelo ajuste confirmado no relatório Indireto). As três janelas terminam no mês escolhido, que abre no último mês fechado: mês futuro (previsto) nunca entra. Centros de sócio, empresa ligada, empréstimos, investimento e imobilizado ficam fora; 001 Carretas EMT é unidade própria e aparece à parte, sem indireto."
          }
          controles={<VisaoResultadoObra cruzar={cruzarCentros} />}
        >
          {cruzarCentros && centrosParaCustoReceita ? (
            <>
            <FiltrosCustoReceitaBarra
              filtros={filtrosCustoReceita}
              centrosCusto={cadastrosCustoReceita?.custo ?? centrosParaCustoReceita}
              centrosReceita={
                cadastrosCustoReceita?.receita ?? centrosParaCustoReceita
              }
            />
            <ConteudoCustoReceita
              centrosCusto={centrosEfetivos(
                centrosParaCustoReceita,
                filtrosCustoReceita.centrosCusto,
                filtrosCustoReceita.etapasCusto,
              )}
              centrosReceita={centrosEfetivos(
                centrosParaCustoReceita,
                filtrosCustoReceita.centrosReceita,
                filtrosCustoReceita.etapasReceita,
              )}
              meses={mesesCustoReceita}
              incluirInvestimento={filtrosCustoReceita.incluirInvestimento}
              podeVerLancamentos={podeVerLancamentos}
            />
            </>
          ) : (
            <>
              <SetasDeMes
                mes={mesObra}
                href={(m) => `/financeiro/relatorios?rel=resultado-obra&mes_obra=${m}`}
                ultimo={mesCorrente()}
              />
              <ConteudoResultadoObra
                mes={mesObra}
              />
            </>
          )}
        </SecaoRelatorio>
      ) : null}

      {relatorio === "extrato-fornecedor" ? (
        <ConteudoExtratoFornecedor
          fornecedorIds={fornecedorIds}
          periodoRanking={lerPeriodoFornecedores(params, mesCorrente())}
          podeVerLancamentos={podeVerLancamentos}
        />
      ) : null}
    </div>
  );
}
