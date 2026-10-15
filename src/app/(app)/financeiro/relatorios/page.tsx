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
import { formatarBRL, formatarMesAno, formatarPercentual } from "@/lib/formatadores";
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
  type ModoPeriodo,
} from "@/modules/financeiro/relatorios/filtros-periodo";
import {
  cadastroComMovimento,
  centrosEfetivos,
} from "@/modules/_shared/centro-custo/filtro";
import {
  aplicarIndireto,
  ID_NAO_RATEADO,
  margemPorObra,
  rateioPermitidoNoCustoCc,
  type IndiretoDoPeriodo,
  margemPorObraPermitida,
  mesDoRateio,
} from "@/modules/financeiro/relatorios/indireto-nos-relatorios";
import { MargemPorObraTabela } from "@/modules/financeiro/relatorios/components/margem-por-obra-tabela";
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
import { CustoCcTabela } from "@/modules/financeiro/relatorios/components/custo-cc-tabela";
import { DreTabela } from "@/modules/financeiro/relatorios/components/dre-tabela";
import { AgingPrazos } from "@/modules/financeiro/relatorios/components/aging-prazos";
import { DrePonte } from "@/modules/financeiro/relatorios/components/dre-ponte";
import { ponteDoResultado } from "@/modules/financeiro/relatorios/ponte-do-resultado";
import { ExtratoFornecedorTabela } from "@/modules/financeiro/relatorios/components/extrato-fornecedor-tabela";
import { lerFornecedoresDaUrl } from "@/modules/financeiro/relatorios/extrato-filtros";
import { FluxoCaixaGrafico } from "@/modules/financeiro/relatorios/components/fluxo-caixa-grafico";
import type { SaldoProjetado } from "@/modules/financeiro/relatorios/fluxo-caixa";
import { PosicaoBancariaTabela } from "@/modules/financeiro/relatorios/components/posicao-bancaria-tabela";
import { BotaoExportarRelatorio } from "@/modules/financeiro/relatorios/components/botao-exportar-relatorio";
import { SociosLigadasRelatorioTela } from "@/modules/financeiro/relatorios/components/socios-ligadas-relatorio";
import { AquisicoesTabela } from "@/modules/financeiro/relatorios/components/aquisicoes-tabela";
import { CustosIndiretosTabela } from "@/modules/financeiro/relatorios/components/custos-indiretos-tabela";
import { anoDoIndireto } from "@/modules/financeiro/relatorios/custos-indiretos";
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
  PERGUNTA_DO_RELATORIO,
  type RelatorioId,
} from "@/modules/financeiro/relatorios/relatorios";
import { SeletorFornecedor } from "@/modules/financeiro/relatorios/components/seletor-fornecedor";
import {
  aging,
  custoPorCentroCusto,
  custoPorGrupo,
  custoReceita,
  investimentos,
  relatorioSociosLigadas,
  aquisicoes,
  custosIndiretos,
  rateioIndiretoDoMes,
  indiretoDoPeriodo,
  indiretoDosMeses,
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
  }>;
}

function primeiro(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
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
      {children}
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
          {children}
        </div>
      </ItemGrade>
      {depois}
    </GradeKpis>
  );
}

/**
 * O saldo no fim da janela, a partir do saldo de hoje das contas correntes e
 * caixa (ver `fluxo-caixa.ts`). Cada motivo de não haver saldo tem a sua frase,
 * e nenhum vira R$ 0,00: zero é um saldo, e um saldo inventado leva a decisão de
 * pagamento errada.
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
  contasNoSaldo: { contas: number; ocultas: number };
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
        titulo="Saldo projetado"
        valor={<span className="text-muted-foreground">Sem saldo</span>}
        detalhe={detalhe[saldo.tipo]}
      />
    );
  }
  const plural = contasNoSaldo.contas === 1 ? "conta" : "contas";
  return (
    <KPICard
      idCard="saldo-projetado"
      titulo={`Saldo projetado em ${rotuloMes(saldo.mes)}`}
      valor={<MoneyText valor={saldo.valor} />}
      detalhe={
        <>
          Saldo de hoje <MoneyText valor={saldo.saldoInicial} /> em{" "}
          {contasNoSaldo.contas} {plural} corrente e caixa, mais o previsto
          {contasNoSaldo.ocultas > 0
            ? `; ${contasNoSaldo.ocultas} sem saldo visível ficaram fora`
            : ""}
        </>
      }
    />
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
  const fatiaCusto = descreverFatia(centrosCusto.length);
  const fatiaReceita = descreverFatia(centrosReceita.length);
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
  return (
    <>
      <GradeKpis id="financeiro.relatorios.fluxo-caixa" titulo="Fluxo de caixa">
        <KPICard
          titulo="Entradas operacionais"
          valor={<MoneyText valor={dados.series.a_receber.total} />}
          detalhe={
            <>
              Realizado <MoneyText valor={dados.series.a_receber.realizado} />
              {fatiaReceita ? ` · ${fatiaReceita.toLowerCase()}` : ""}
            </>
          }
        />
        <KPICard
          titulo="Saídas operacionais"
          valor={<MoneyText valor={dados.series.a_pagar.total} />}
          detalhe={
            <>
              Realizado <MoneyText valor={dados.series.a_pagar.realizado} />
              {fatiaCusto ? ` · ${fatiaCusto.toLowerCase()}` : ""}
            </>
          }
        />
        <KPICard
          titulo="Empréstimos tomados"
          valor={<MoneyText valor={dados.series.emprestimo_tomado.total} />}
          detalhe={
            <>
              Realizado{" "}
              <MoneyText valor={dados.series.emprestimo_tomado.realizado} />
              {fatiaReceita ? ` · ${fatiaReceita.toLowerCase()}` : ""}
            </>
          }
        />
        <KPICard
          titulo="Amortizações"
          valor={<MoneyText valor={dados.series.amortizacao.total} />}
          detalhe={
            <>
              Realizado <MoneyText valor={dados.series.amortizacao.realizado} />
              {fatiaCusto ? ` · ${fatiaCusto.toLowerCase()}` : ""}
            </>
          }
        />
        <KPICard
          titulo="Líquido da janela"
          valor={<MoneyText valor={dados.liquidoJanela} />}
          detalhe={
            <>
              Entradas <MoneyText valor={dados.totalEntradas} /> menos saídas{" "}
              <MoneyText valor={dados.totalSaidas} />, as quatro séries
              {/*
                Os dois lados se escolhem separados, então o líquido pode estar
                somando a fatia de uma obra com o total da empresa. Quem lê o
                número precisa saber disso ANTES de decidir pagamento.
              */}
              {(centrosCusto.length > 0) !== (centrosReceita.length > 0)
                ? "; um dos lados está recortado por centro"
                : ""}
            </>
          }
        />
        <CartaoSaldoProjetado
          saldo={dados.saldoProjetado}
          contasNoSaldo={dados.contasNoSaldo}
        />
        <KPICard
          titulo="Meses com movimento"
          valor={dados.meses.length}
          detalhe={janelaDescrita}
        />
      </GradeKpis>
      <PainelGrafico
        id="financeiro.relatorios.fluxo-caixa.grafico"
        titulo="Gráfico do fluxo de caixa"
      >
        <FluxoCaixaGrafico
          meses={dados.meses}
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
          valor={<MoneyText valor={cartoes.receitaOperacional} />}
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
          valor={<MoneyText valor={cartoes.despesaOperacional} />}
          detalhe="Sem investimentos e sem movimentação"
        />
        <KPICard
          idCard="resultado-financeiro"
          titulo="Resultado financeiro"
          valor={<MoneyText valor={cartoes.resultadoFinanceiro} />}
          detalhe="Juros e rendimentos menos tarifas e juros pagos"
        />
        <KPICard
          idCard="resultado-periodo"
          titulo="Resultado do período"
          valor={<MoneyText valor={cartoes.resultadoDoPeriodo} />}
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
          valor={<MoneyText valor={pagar30} />}
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
          valor={<MoneyText valor={receber30} />}
          detalhe={
            dados.totalAReceber === 0
              ? "Nenhuma parcela a receber lançada: medição faturada entra aqui quando vira lançamento"
              : `Inclui ${formatarBRL(dados.vencidoAReceber)} já vencido`
          }
        />
        <KPICard
          idCard="a-pagar"
          titulo="A pagar em aberto"
          valor={<MoneyText valor={dados.totalAPagar} />}
          detalhe={
            <>
              <MoneyText valor={longoPrazoAPagar} /> vencem depois de 60 dias
            </>
          }
        />
        <KPICard
          idCard="a-receber"
          titulo="A receber em aberto"
          valor={<MoneyText valor={dados.totalAReceber} />}
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
  return (
    <>
      <GradeKpis
        id="financeiro.relatorios.posicao-bancaria"
        titulo="Posição bancária"
      >
        {posicao.contas.map((conta) => (
          <KPICard
            key={conta.contaId}
            idCard={conta.contaId}
            titulo={conta.nome}
            valor={<MoneyText valor={conta.saldoAtual} />}
            detalhe={
              <>
                Inicial <MoneyText valor={conta.saldoInicial} />
              </>
            }
          />
        ))}
        <KPICard
          titulo="Saldo total"
          valor={<MoneyText valor={posicao.totalSaldoAtual} />}
          // "Todas as contas ativas" passa a ser mentira quando alguma ficou
          // fora por permissão, e é uma mentira que parece o dinheiro da empresa.
          detalhe={
            posicao.contasOcultas > 0
              ? `Somando as ${posicao.contas.length} contas que você pode ver`
              : "Somando todas as contas ativas"
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
 * Sócios e ligadas: o ano corrente e o acumulado desde o primeiro lançamento.
 * Sem filtro de período de propósito: o acumulado do mútuo é o que a empresa
 * ligada deve hoje, e é a pergunta que a tela responde.
 */
/** yyyy-MM somando meses (negativo volta). */
function somarMeses(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Rateio do indireto de um mês. Abre no mês anterior ao corrente, que é o que
 * se fecha; as setas andam de mês em mês pela URL (`mes_rateio`).
 */
async function ConteudoRateioIndireto({ mes, podeAjustar }: { mes: string; podeAjustar: boolean }) {
  const rateio = await rateioIndiretoDoMes(mes);
  const href = (m: string) => `/financeiro/relatorios?rel=rateio-indireto&mes_rateio=${m}`;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 text-corpo">
        <Link className="text-primary hover:underline" href={href(somarMeses(mes, -1))}>← mês anterior</Link>
        <span className="font-medium">{formatarMesAno(`${mes}-01`)}</span>
        <Link className="text-primary hover:underline" href={href(somarMeses(mes, 1))}>próximo mês →</Link>
      </div>
      {rateio.linhas.length === 0 && rateio.custoIndiretoMes === 0 ? (
        <EmptyState icone={BarChart3} titulo="Sem custo indireto neste mês" descricao="Escritório Central, Manutenção/Documentação de Equipamentos e 002 Equipamentos Colorado não tiveram custo no mês." />
      ) : (
        <RateioIndiretoTabela key={`${mes}-${rateio.status}`} rateio={rateio} podeAjustar={podeAjustar} />
      )}
    </div>
  );
}

async function ConteudoSociosLigadas() {
  const dados = await relatorioSociosLigadas();
  if (dados.socios.length === 0 && dados.ligadas.length === 0) {
    return (
      <EmptyState
        icone={BarChart3}
        titulo="Nenhum centro de sócio ou de empresa ligada"
        descricao="Os centros de tipo Sócio e Empresa ligada aparecem aqui, em Cadastros > Centros de custo."
      />
    );
  }
  return <SociosLigadasRelatorioTela dados={dados} />;
}

async function ConteudoAquisicoes({ podeVerLancamentos }: { podeVerLancamentos: boolean }) {
  // O estado vazio mora na tabela, junto das duas seções.
  return <AquisicoesTabela linhas={await aquisicoes()} podeVerLancamentos={podeVerLancamentos} />;
}

/**
 * Custos indiretos de um ano. Abre no ano corrente; as setas andam de ano em
 * ano pela URL (`ano_indireto`).
 */
async function ConteudoCustosIndiretos({ ano }: { ano: number }) {
  const linhas = await custosIndiretos(ano);
  const href = (a: number) => `/financeiro/relatorios?rel=custos-indiretos&ano_indireto=${a}`;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 text-corpo">
        <Link className="text-primary hover:underline" href={href(ano - 1)}>← ano anterior</Link>
        <span className="font-medium tabular-nums">{ano}</span>
        <Link className="text-primary hover:underline" href={href(ano + 1)}>próximo ano →</Link>
      </div>
      <CustosIndiretosTabela ano={ano} linhas={linhas} mesCorrente={mesCorrente()} />
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
          valor={<MoneyText valor={dados.saldoAplicado} />}
          detalhe={
            dados.subcontasOcultas > 0
              ? `Sem ${dados.subcontasOcultas} subconta(s) que você não pode ver`
              : "Somando as subcontas de investimentos"
          }
        />
        <KPICard
          idCard="aplicado"
          titulo={temPeriodo ? "Aplicado no período" : "Aplicado (total)"}
          valor={<MoneyText valor={dados.aplicadoPeriodo} />}
          detalhe="Da conta para a subconta"
        />
        <KPICard
          idCard="resgatado"
          titulo={temPeriodo ? "Resgatado no período" : "Resgatado (total)"}
          valor={<MoneyText valor={dados.resgatadoPeriodo} />}
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
          valor={<MoneyText valor={custo.total} />}
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
            valor={<MoneyText valor={maior.valor} />}
            detalhe={maior.nome}
          />
        ) : null}
        {custoAnterior ? (
          <KPICard
            titulo="Período anterior"
            valor={<MoneyText valor={custoAnterior.total} />}
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

  // Margem por obra só sem corte de centro: com corte, custo e receita são de
  // conjuntos diferentes e "a margem da obra" deixa de ser uma pergunta.
  const semCorteDeCentro = centrosCusto.length === 0 && centrosReceita.length === 0;
  const [linhas, indireto] = await Promise.all([
    custoReceita({
      meses,
      centrosCusto,
      centrosReceita,
      incluirInvestimento,
    }),
    margemPorObraPermitida({ semCorteDeCentro, incluirInvestimento }) ? indiretoDosMeses(meses) : Promise.resolve(null),
  ]);

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
  const margens = indireto
    ? margemPorObra(
        new Map(receitas.map((r) => [r.centroCustoId, { nome: r.nome, receita: r.total }])),
        new Map(custos.map((c) => [c.centroCustoId, c.total])),
        indireto.porObra,
        new Set([...indireto.indiretos, ...(indireto.fora ?? [])]),
        new Map(custos.map((c) => [c.centroCustoId, c.nome])),
      )
    : [];

  return (
    <>
      <GradeKpis id="financeiro.relatorios.custo-receita" titulo="Custo x receita">
        <KPICard
          titulo="Receita líquida"
          valor={<MoneyText valor={total.receitaLiquida} />}
          detalhe={
            total.retencao > 0
              ? `Retido ${formatarBRL(total.retencao)}, somando ${formatarBRL(total.receitaFaturada)}`
              : "Sem retenção na fonte no recorte"
          }
        />
        <KPICard
          titulo="Custo"
          valor={<MoneyText valor={total.custo} />}
          detalhe={`${porMesDoRelatorio.length} ${porMesDoRelatorio.length === 1 ? "mês de referência" : "meses de referência"}`}
        />
        <KPICard
          titulo="Resultado"
          valor={<MoneyText valor={total.resultado} />}
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

      {margens.length > 0 ? (
        <GradeKpis id="financeiro.relatorios.custo-receita.margem" titulo="Margem por obra" vao="amplo">
          <ItemGrade titulo="Margem por obra" idCard="margem-por-obra" larguraPadrao={12}>
            <div className="flex flex-col gap-3">
              <h3 className="text-corpo font-medium text-foreground">Margem por obra</h3>
              <p className="text-detalhe text-muted-foreground">
                O custo do Escritório Central, da Manutenção/Documentação de Equipamentos e do 002 Equipamentos Colorado rateado nas obras pelo custo direto de cada uma, mês a mês.
                {indireto && indireto.naoRateado > 0
                  ? ` ${formatarBRL(indireto.naoRateado)} de indireto ficaram sem obra para receber (mês sem obra com custo).`
                  : ""}
              </p>
              <MargemPorObraTabela linhas={margens} />
            </div>
          </ItemGrade>
        </GradeKpis>
      ) : null}
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
  const custo = await custoPorGrupo({ ...pontasDaRpc(periodo), ...recorte });

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
          valor={<MoneyText valor={custo.total} />}
          detalhe={descricaoPeriodo}
        />
        {maior ? (
          <KPICard
            titulo="Maior grupo"
            valor={<MoneyText valor={maior.valor} />}
            detalhe={maior.nome}
          />
        ) : null}
        <KPICard
          titulo="Grupos com custo"
          valor={custo.grupos.length}
          detalhe="Abra o grupo para ver subcategoria e insumo"
        />
      </GradeKpis>
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
  podeVerLancamentos,
}: {
  fornecedorIds: string[];
  podeVerLancamentos: boolean;
}) {
  const [fornecedores, extrato] = await Promise.all([
    listarFornecedoresComLancamentos(),
    extratoPorFornecedor({ fornecedorIds }),
  ]);

  if (fornecedores.length === 0) {
    return (
      <EmptyState
        icone={BarChart3}
        titulo="Sem fornecedores com lançamentos"
        descricao="Quando houver lançamentos a pagar de fornecedores, o extrato aparece aqui."
      />
    );
  }

  return (
    <SecaoRelatorio
          relatorio="extrato-fornecedor"
      titulo="Extrato por fornecedor"
      descricao="Lançamentos a pagar dos fornecedores escolhidos, do vencimento mais recente para o mais antigo. A coluna Mês de referência é o mês em que o custo entra. Os cartões somam o que está em aberto nas parcelas e acompanham os filtros da tabela."
      exportar="extrato-fornecedor"
      controles={
        <SeletorFornecedor
          fornecedores={fornecedores}
          valores={extrato.fornecedorIds}
        />
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
  const relatorio: RelatorioId = normalizarRelatorio(primeiro(params.rel));

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
  const mesesDisponiveis =
    relatorio === "custo-receita" ? await mesesDeCompetencia() : [];
  const centrosParaCustoReceita =
    relatorio === "custo-receita" ? await listarCentrosCustoParaFiltro() : null;

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
          descricao="Regime de CAIXA: entradas e saídas pelo mês de pagamento (realizado) e de vencimento (projetado), sem o mês de referência. Empréstimos tomados e amortizações entram em série própria, separados do operacional. A janela padrão é o ano para trás e o ano para frente, porque as prestações dos financiamentos vão até 2031. O saldo projetado parte do saldo de hoje das contas correntes e caixa e soma só o previsto. Com centro escolhido, cada barra passa a somar a FATIA do rateio daquele centro: um lançamento dividido entre duas obras entra em cada uma pela parte dela."
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
          descricao="Regime de COMPETÊNCIA: Material, Mão de obra, Equipamentos e Outros pelo MÊS DE REFERÊNCIA. Abra o grupo para chegar na subcategoria e no insumo. Com o mesmo período, centro e categoria, o total fecha com o Custo por centro de custo."
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
          descricao="Saldo por conta: saldo inicial mais o efeito das parcelas pagas."
        >
          <ConteudoPosicaoBancaria podeVerLancamentos={podeVerLancamentos} />
        </SecaoRelatorio>
      ) : null}

      {relatorio === "rateio-indireto" ? (
        <SecaoRelatorio
          relatorio="rateio-indireto"
          titulo="Rateio do custo indireto"
          descricao="O custo do Escritório Central, da Manutenção/Documentação de Equipamentos e do 002 Equipamentos Colorado distribuído nas obras pelo custo direto de cada uma no mês. Quem fecha o mês ajusta os percentuais e confirma. Os lançamentos não mudam: o rateio aparece nos relatórios de custo."
        >
          <ConteudoRateioIndireto
            mes={mesDoRateio(primeiro(params.mes_rateio), somarMeses(mesCorrente(), -1))}
            podeAjustar={temPermissao(usuario, "financeiro.competencias", "aprovar")}
          />
        </SecaoRelatorio>
      ) : null}

      {relatorio === "socios-ligadas" ? (
        <SecaoRelatorio
          relatorio="socios-ligadas"
          titulo="Sócios e ligadas"
          descricao="Regime de competência (o mês de referência do lançamento), por centro raiz de tipo Sócio e Empresa ligada, contando o rateio cuja categoria é de natureza distribuição (sócio) ou mútuo (ligada). Distribuição e mútuo ficam fora do resultado e do custo das obras; o total retirado fecha com o bloco de distribuição do DRE. Em aberto é a parte do rateio cujas parcelas ainda não foram pagas. O saldo da ligada é o enviado (a pagar) menos o devolvido (a receber), desde o primeiro lançamento."
          exportar="socios-ligadas"
        >
          <ConteudoSociosLigadas />
        </SecaoRelatorio>
      ) : null}

      {relatorio === "aquisicoes" ? (
        <SecaoRelatorio
          relatorio="aquisicoes"
          titulo="Equipamentos e consórcios"
          descricao="O que foi comprado, por bem (centros de imobilizado e as carretas lançadas como Aquisição de Equipamento), e as cotas de consórcio. O pago vem das parcelas do lançamento, na proporção do rateio: um lançamento dividido entre três carretas paga um terço de cada."
        >
          <ConteudoAquisicoes podeVerLancamentos={podeVerLancamentos} />
        </SecaoRelatorio>
      ) : null}

      {relatorio === "custos-indiretos" ? (
        <SecaoRelatorio
          relatorio="custos-indiretos"
          titulo="Custos indiretos"
          descricao={
            <>
              O que compõe o custo indireto (Escritório Central, Manutenção/Documentação de Equipamentos e 002 - Equipamentos Colorado). É o mesmo valor que o{" "}
              <Link className="text-primary hover:underline" href="/financeiro/relatorios?rel=rateio-indireto">
                Rateio do indireto
              </Link>{" "}
              distribui entre as obras.
            </>
          }
        >
          <ConteudoCustosIndiretos
            ano={anoDoIndireto(primeiro(params.ano_indireto), Number(mesCorrente().slice(0, 4)))}
          />
        </SecaoRelatorio>
      ) : null}

      {relatorio === "investimentos" ? (
        <SecaoRelatorio
          relatorio="investimentos"
          exportar={relatorio}
          titulo="Investimentos"
          descricao="Dinheiro aplicado (CDB, fundo) na subconta de investimentos de cada conta. Aplicar não é despesa: o dinheiro só muda de bolso e continua da empresa, por isso fica fora do custo, do DRE e do fluxo de caixa."
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

      {relatorio === "custo-receita" && centrosParaCustoReceita ? (
        <SecaoRelatorio
          relatorio="custo-receita"
          exportar={relatorio}
          titulo="Custo x receita por centro de custo"
          descricao="Regime de COMPETÊNCIA, pelo MÊS DE REFERÊNCIA do lançamento. Os centros do custo e os da receita são escolhidos separadamente: é o custo de um conjunto contra a receita de outro. Conta só categoria de natureza operacional, e a receita é a líquida (a retenção aparece ao lado)."
        >
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
        </SecaoRelatorio>
      ) : null}

      {relatorio === "extrato-fornecedor" ? (
        <ConteudoExtratoFornecedor
          fornecedorIds={fornecedorIds}
          podeVerLancamentos={podeVerLancamentos}
        />
      ) : null}
    </div>
  );
}
