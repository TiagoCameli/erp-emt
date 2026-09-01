import { notFound } from "next/navigation";
import { BarChart3 } from "lucide-react";

import {
  EmptyState,
  GradeKpis,
  KPICard,
  MoneyText,
  PageHeader,
} from "@/components/canonicos";
import { formatarBRL, formatarPercentual } from "@/lib/formatadores";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import {
  listarCategorias,
  listarFormasPagamento,
  listarFornecedores,
} from "@/modules/financeiro/lancamentos/queries";
import { rotuloMes } from "@/modules/financeiro/relatorios/calculo";
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
import {
  lerFiltrosCreditos,
  recortarCreditosPorSituacao,
  type FiltrosCreditos,
} from "@/modules/financeiro/relatorios/filtros-creditos";
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
import { centrosEfetivos } from "@/modules/_shared/centro-custo/filtro";
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
import { ExtratoFornecedorTabela } from "@/modules/financeiro/relatorios/components/extrato-fornecedor-tabela";
import { lerFornecedoresDaUrl } from "@/modules/financeiro/relatorios/extrato-filtros";
import { FluxoCaixaGrafico } from "@/modules/financeiro/relatorios/components/fluxo-caixa-grafico";
import { CreditosGrafico } from "@/modules/financeiro/relatorios/components/creditos-grafico";
import {
  ContratosEmprestimoTabela,
  CreditosPorMesTabela,
  CreditosTabela,
} from "@/modules/financeiro/relatorios/components/creditos-tabela";
import { PosicaoBancariaTabela } from "@/modules/financeiro/relatorios/components/posicao-bancaria-tabela";
import { BotaoExportarRelatorio } from "@/modules/financeiro/relatorios/components/botao-exportar-relatorio";
import { FiltrosCreditosBarra } from "@/modules/financeiro/relatorios/components/filtros-creditos-barra";
import { RelatoriosNav } from "@/modules/financeiro/relatorios/components/relatorios-nav";
import {
  normalizarRelatorio,
  type RelatorioId,
} from "@/modules/financeiro/relatorios/relatorios";
import { SeletorFornecedor } from "@/modules/financeiro/relatorios/components/seletor-fornecedor";
import {
  aging,
  custoPorCentroCusto,
  custoPorGrupo,
  custoReceita,
  creditos,
  emprestimosPorContrato,
  dreGerencial,
  extratoPorFornecedor,
  fluxoCaixa,
  listarCentrosCustoParaFiltro,
  listarFornecedoresComLancamentos,
  mesCorrente,
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
  }>;
}

function primeiro(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

/** Faixa de cabeçalho de cada relatório: título e, opcionalmente, controles. */
function SecaoRelatorio({
  titulo,
  descricao,
  exportar,
  controles,
  children,
}: {
  titulo: string;
  descricao: string;
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
          <p className="text-detalhe text-muted-foreground">{descricao}</p>
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

function Painel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">{children}</div>
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
      <GradeKpis>
        <KPICard
          titulo="Entradas (a receber)"
          valor={<MoneyText valor={dados.totalEntradas} />}
          detalhe={
            <>
              Realizado <MoneyText valor={dados.totalRealizadoEntradas} />
              {fatiaReceita ? ` · ${fatiaReceita.toLowerCase()}` : ""}
            </>
          }
        />
        <KPICard
          titulo="Saídas (a pagar)"
          valor={<MoneyText valor={dados.totalSaidas} />}
          detalhe={
            <>
              Realizado <MoneyText valor={dados.totalRealizadoSaidas} />
              {fatiaCusto ? ` · ${fatiaCusto.toLowerCase()}` : ""}
            </>
          }
        />
        <KPICard
          titulo="Saldo projetado"
          valor={<MoneyText valor={dados.saldoProjetado} />}
          detalhe={
            // Os dois lados se escolhem separados, então o saldo pode estar
            // somando a fatia de uma obra com o total da empresa. Quem lê o
            // número precisa saber disso ANTES de decidir pagamento.
            (centrosCusto.length > 0) !== (centrosReceita.length > 0)
              ? "Entradas menos saídas — um dos lados está recortado por centro"
              : "Entradas menos saídas no período"
          }
        />
        <KPICard
          titulo="Meses com movimento"
          valor={dados.meses.length}
          detalhe={janelaDescrita}
        />
      </GradeKpis>
      <Painel>
        <FluxoCaixaGrafico
          meses={dados.meses}
          centrosCusto={centrosCusto}
          centrosReceita={centrosReceita}
          podeVerLancamentos={podeVerLancamentos}
        />
      </Painel>
    </>
  );
}

/**
 * O mês só está vazio se NENHUM dos três blocos do DRE tiver linha. Olhar só o
 * operacional mostraria "sem lançamentos no mês" num mês em que a conta girou
 * milhões em aplicação — o extrato teria movimento e a tela diria que não há.
 */
function temLancamentoNoDre(dre: DreGerencial): boolean {
  return [dre.operacional, dre.financeiro, dre.movimentacao].some(
    (bloco) => bloco.receitas.length > 0 || bloco.despesas.length > 0,
  );
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
  return (
    <>
      <GradeKpis>
        {/* Receita e despesa OPERACIONAIS: é o que a obra fez. A aplicação
            financeira da conta não entra, senão o cartão de receita mostraria a
            varredura noturna do banco como faturamento. */}
        <KPICard
          titulo="Receitas"
          valor={<MoneyText valor={dre.operacional.totalReceitas} />}
          detalhe="Lançamentos a receber no período"
        />
        <KPICard
          titulo="Despesas"
          valor={<MoneyText valor={dre.operacional.totalDespesas} />}
          detalhe="Lançamentos a pagar no período"
        />
        <KPICard
          titulo="Resultado"
          valor={<MoneyText valor={dre.resultado} />}
          detalhe={`${dre.resultado >= 0 ? "Superávit" : "Déficit"} · ${descricao}`}
        />
      </GradeKpis>
      {!temLancamentoNoDre(dre) ? (
        <EmptyState
          icone={BarChart3}
          titulo="Sem lançamentos no período"
          descricao="Não há receitas nem despesas com mês de referência neste recorte."
        />
      ) : (
        <DreTabela
          dre={dre}
          periodo={periodo}
          podeVerLancamentos={podeVerLancamentos}
        />
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
  return (
    <>
      <GradeKpis>
        <KPICard
          titulo="A pagar em aberto"
          valor={<MoneyText valor={dados.totalAPagar} />}
          detalhe={
            <>
              Vencido <MoneyText valor={dados.vencidoAPagar} />
            </>
          }
        />
        <KPICard
          titulo="A receber em aberto"
          valor={<MoneyText valor={dados.totalAReceber} />}
          detalhe={
            <>
              Vencido <MoneyText valor={dados.vencidoAReceber} />
            </>
          }
        />
      </GradeKpis>
      {semDados ? (
        <EmptyState
          icone={BarChart3}
          titulo="Sem parcelas em aberto"
          descricao="Não há parcelas pendentes ou aprovadas para envelhecer."
        />
      ) : (
        <>
          <Painel>
            <AgingGrafico
              aPagar={dados.aPagar}
              aReceber={dados.aReceber}
              podeVerLancamentos={podeVerLancamentos}
            />
          </Painel>
          <AgingTabela aging={dados} podeVerLancamentos={podeVerLancamentos} />
        </>
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
      <GradeKpis>
        {posicao.contas.map((conta) => (
          <KPICard
            key={conta.contaId}
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
      <PosicaoBancariaTabela
        posicao={posicao}
        podeVerLancamentos={podeVerLancamentos}
      />
    </>
  );
}

async function ConteudoCreditos({
  situacao,
  podeVerLancamentos,
}: {
  situacao: FiltrosCreditos["situacao"];
  podeVerLancamentos: boolean;
}) {
  // As duas leituras em paralelo: são independentes, e uma esperar a outra
  // dobraria o tempo da aba sem motivo.
  const [todos, contratos] = await Promise.all([
    creditos(),
    emprestimosPorContrato(),
  ]);

  // O filtro recorta a lista E os totais. Somar a carteira inteira embaixo de
  // uma tabela que mostra só os contratos em aberto seria dois números que não
  // se explicam — a regra do módulo é o cartão acompanhar o filtro da tabela.
  const dados = recortarCreditosPorSituacao(todos, situacao);

  if (todos.contratos.length === 0 && contratos.contratos.length === 0) {
    return (
      <EmptyState
        icone={BarChart3}
        titulo="Nenhum crédito marcado"
        descricao="Marque a caixinha “É empréstimo, financiamento ou consórcio” no lançamento para ele aparecer aqui."
      />
    );
  }
  const emAberto = dados.contratos.filter(
    (contrato) => contrato.proximoVencimento !== null,
  ).length;
  return (
    <>
      <GradeKpis>
        <KPICard
          titulo="Saldo devedor"
          valor={<MoneyText valor={dados.totalSaldo} />}
          detalhe="Soma das parcelas ainda não pagas"
        />
        <KPICard
          titulo="Vence em 12 meses"
          valor={<MoneyText valor={dados.totalProximosMeses} />}
          detalhe="O compromisso do próximo ano"
        />
        <KPICard
          titulo="Já pago"
          valor={<MoneyText valor={dados.totalPago} />}
          detalhe="Pelo líquido: o que saiu da conta"
        />
        <KPICard
          titulo="Contratos"
          valor={`${emAberto} de ${dados.contratos.length}`}
          detalhe="Em aberto, do total marcado como crédito"
        />
      </GradeKpis>

      {/* A análise do centro de custo de Empréstimos, um contrato por etapa.
          Vive AQUI por decisão dele em 27/08/2026: empréstimo não é receita de
          obra nem custo de obra, então saiu de todos os outros relatórios e a
          análise inteira passou a morar em Créditos.

          Vem antes da tabela por lançamento porque é a leitura mais alta: a de
          baixo lista TODO crédito marcado (inclusive os 10 financiamentos de
          equipamento, que ficaram no centro do bem), e esta é só o dinheiro
          emprestado. */}
      {contratos.contratos.length > 0 ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <h3 className="text-corpo font-medium text-foreground">
              Contratos do centro de Empréstimos
            </h3>
            <p className="text-legenda text-muted-foreground">
              Tomado e pago de cada contrato. As duas colunas ficam lado a lado
              porque não se comparam ainda: parte das prestações antigas está nos
              extratos e não foi lançada.
            </p>
          </div>
          <ContratosEmprestimoTabela contratos={contratos} />
        </div>
      ) : null}

      <CreditosTabela
        creditos={dados}
        podeVerLancamentos={podeVerLancamentos}
      />

      <div className="flex flex-col gap-3">
        <h3 className="text-corpo font-medium text-foreground">
          O que vence pela frente
        </h3>
        <Painel>
          <CreditosGrafico meses={dados.proximosMeses} />
        </Painel>
        <CreditosPorMesTabela
          meses={dados.proximosMeses}
          total={dados.totalProximosMeses}
        />
      </div>
    </>
  );
}

async function ConteudoCustoCc({
  filtros,
  centroIds,
  erroDoModo,
  podeVerLancamentos,
}: {
  filtros: FiltrosCustoCc;
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
      ? await primeirosMesesDosCentros(centroIds)
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
  };

  const comparar = filtros.comparar && comparacaoPermitida(filtros.modo);
  const anterior = comparar ? periodoAnterior(periodo) : null;

  const [custo, custoAnterior, series] = await Promise.all([
    custoPorCentroCusto(filtrosDaRpc),
    anterior
      ? custoPorCentroCusto({ ...filtrosDaRpc, ...pontasDaRpc(anterior) })
      : Promise.resolve(null),
    filtros.modo === "vida" && centroIds.length > 0
      ? serieDosCentros(centroIds, filtrosDaRpc)
      : Promise.resolve(null),
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

  const maior = custo.centros[0];

  // Variação por centro, em centavos: somar reais em ponto flutuante sobre dezenas
  // de centros acumula resto, e o total da coluna deixaria de bater com as linhas.
  const variacao = custoAnterior
    ? new Map(
        custo.centros.map((centro) => {
          const antes =
            custoAnterior.centros.find(
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
        custo.centros
          .filter((centro) => centro.centroCustoId)
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
      <GradeKpis>
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
          valor={custo.centros.length}
          detalhe="Com custo no período"
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
        <Painel>
          <CustoCcSerie
            series={series}
            filtros={filtrosDoDrill}
            podeVerLancamentos={podeVerLancamentos}
          />
        </Painel>
      ) : (
        <Painel>
          <CustoCcGrafico centros={custo.centros} destinos={destinos} />
        </Painel>
      )}

      <CustoCcTabela
        custo={custo}
        periodo={periodo}
        filtros={filtrosDoDrill}
        podeVerLancamentos={podeVerLancamentos}
        variacao={variacao}
      />
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

  const linhas = await custoReceita({
    meses,
    centrosCusto,
    centrosReceita,
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
      <GradeKpis>
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
          Empréstimos vive no relatório de Créditos, e a faixa passou a mostrar só
          resíduo: um pagamento de empréstimo de R$ 37.300,00 parado no Escritório
          Central, que o corte por centro financeiro não pegava. Hoje a RPC só
          devolve categoria operacional, então não há o que mostrar. */}

      <Painel>
        <CustoReceitaGrafico meses={porMesDoRelatorio} />
      </Painel>

      {/* Lado a lado no desktop, empilhado no mobile: as duas tabelas são de
          dinheiros opostos e se leem em par. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <CustoReceitaTabela
          linhas={custos}
          lado="custo"
          meses={meses}
          podeVerLancamentos={podeVerLancamentos}
        />
        <CustoReceitaTabela
          linhas={receitas}
          lado="receita"
          meses={meses}
          podeVerLancamentos={podeVerLancamentos}
        />
      </div>
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
      <GradeKpis>
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
      <CustoGrupoTabela
        custo={custo}
        periodo={periodo}
        recorte={recorte}
        podeVerLancamentos={podeVerLancamentos}
      />
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
  // Créditos: a situação do contrato (em aberto x quitado). Leitura pura, feita
  // sempre, e o recorte é aplicado dentro de `ConteudoCreditos`.
  const filtrosCreditos = lerFiltrosCreditos(params);

  const periodoDre = lerPeriodoDaUrl(params, mesCorrente());
  const filtrosCustoGrupo = lerFiltrosCustoGrupo(params, mesCorrente());

  // O relatório de centro de custo tem contrato de URL próprio (4 modos de
  // período + filtros de análise), lido pelo mesmo padrão do de lançamentos.
  const { filtros: filtrosCustoCc, erroDoModo } = lerFiltrosCustoCc(
    params,
    mesCorrente(),
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
  const {
    filtros: filtrosCustoReceita,
    mesesEfetivos: mesesCustoReceita,
    periodoDesabilitado,
  } = lerFiltrosCustoReceita(params, mesesDisponiveis);

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

      <RelatoriosNav ativo={relatorio} />

      {relatorio === "fluxo-caixa" ? (
        <SecaoRelatorio
          exportar={relatorio}
          titulo="Fluxo de caixa"
          descricao="Regime de CAIXA: entradas e saídas pelo mês de pagamento (realizado) e de vencimento (projetado). Não usa o mês de referência. A janela padrão é o ano para trás e o ano para frente, porque as prestações dos financiamentos vão até 2031. Com centro escolhido, cada barra passa a somar a FATIA do rateio daquele centro — um lançamento dividido entre duas obras entra em cada uma pela parte dela."
        >
          <FiltrosFluxoCaixaBarra
            filtros={filtrosFluxo}
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
            }}
            podeVerLancamentos={podeVerLancamentos}
          />
        </SecaoRelatorio>
      ) : null}

      {relatorio === "aging" ? (
        <SecaoRelatorio
          exportar={relatorio}
          titulo="Aging de vencimentos"
          descricao="Regime de CAIXA: parcelas em aberto por faixa de vencimento, a pagar e a receber."
        >
          <ConteudoAging podeVerLancamentos={podeVerLancamentos} />
        </SecaoRelatorio>
      ) : null}

      {relatorio === "posicao-bancaria" ? (
        <SecaoRelatorio
          exportar={relatorio}
          titulo="Posição bancária"
          descricao="Saldo por conta: saldo inicial mais o efeito das parcelas pagas."
        >
          <ConteudoPosicaoBancaria podeVerLancamentos={podeVerLancamentos} />
        </SecaoRelatorio>
      ) : null}

      {relatorio === "creditos" ? (
        <SecaoRelatorio
          exportar={relatorio}
          titulo="Créditos"
          descricao="Empréstimos, financiamentos e consórcios tomados pela empresa: quanto se deve hoje e quanto vence pela frente. É uma dimensão à parte da categoria e do centro de custo — o financiamento de uma máquina continua sendo custo de equipamento."
        >
          <FiltrosCreditosBarra filtros={filtrosCreditos} />
          <ConteudoCreditos
            situacao={filtrosCreditos.situacao}
            podeVerLancamentos={podeVerLancamentos}
          />
        </SecaoRelatorio>
      ) : null}

      {relatorio === "custo-cc" && opcoesCustoCc ? (
        <SecaoRelatorio
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
            erroDoModo={erroDoModo}
            podeVerLancamentos={podeVerLancamentos}
          />
        </SecaoRelatorio>
      ) : null}

      {relatorio === "custo-receita" && centrosParaCustoReceita ? (
        <SecaoRelatorio
          exportar={relatorio}
          titulo="Custo x receita por centro de custo"
          descricao="Regime de COMPETÊNCIA, pelo MÊS DE REFERÊNCIA do lançamento. Os centros do custo e os da receita são escolhidos separadamente: é o custo de um conjunto contra a receita de outro. Conta só categoria de natureza operacional, e a receita é a líquida (a retenção aparece ao lado)."
        >
          <FiltrosCustoReceitaBarra
            filtros={filtrosCustoReceita}
            mesesDisponiveis={mesesDisponiveis}
            centrosCusto={centrosParaCustoReceita}
            periodoDesabilitado={periodoDesabilitado}
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
