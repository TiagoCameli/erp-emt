import { notFound } from "next/navigation";
import { BarChart3 } from "lucide-react";

import {
  EmptyState,
  GradeKpis,
  KPICard,
  MoneyText,
  PageHeader,
} from "@/components/canonicos";
import {
  formatarBRL,
  formatarData,
  formatarPercentual,
} from "@/lib/formatadores";
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
} from "@/modules/financeiro/relatorios/drill";
import {
  comparacaoPermitida,
  lerFiltrosCustoCc,
  periodoAnterior,
  periodoDoModo,
  type FiltrosCustoCc,
} from "@/modules/financeiro/relatorios/filtros-custo-cc";
import {
  lerFiltrosCustoReceita,
  type FiltrosCustoReceita,
} from "@/modules/financeiro/relatorios/filtros-custo-receita";
import {
  porCentro,
  porMes,
  totais,
} from "@/modules/financeiro/relatorios/custo-receita";
import { CustoCcSerie } from "@/modules/financeiro/relatorios/components/custo-cc-serie";
import { FiltrosCustoCcBarra } from "@/modules/financeiro/relatorios/components/filtros-custo-cc-barra";
import { FiltrosCustoReceitaBarra } from "@/modules/financeiro/relatorios/components/filtros-custo-receita-barra";
import { CustoReceitaGrafico } from "@/modules/financeiro/relatorios/components/custo-receita-grafico";
import { CustoReceitaTabela } from "@/modules/financeiro/relatorios/components/custo-receita-tabela";
import { AgingGrafico } from "@/modules/financeiro/relatorios/components/aging-grafico";
import { AgingTabela } from "@/modules/financeiro/relatorios/components/aging-tabela";
import { proximoMes } from "@/modules/financeiro/relatorios/calculo";
import { CustoCcGrafico } from "@/modules/financeiro/relatorios/components/custo-cc-grafico";
import { CustoGrupoTabela } from "@/modules/financeiro/relatorios/components/custo-grupo-tabela";
import { CustoCcTabela } from "@/modules/financeiro/relatorios/components/custo-cc-tabela";
import { DreTabela } from "@/modules/financeiro/relatorios/components/dre-tabela";
import { ExtratoFornecedorTabela } from "@/modules/financeiro/relatorios/components/extrato-fornecedor-tabela";
import { lerFornecedoresDaUrl } from "@/modules/financeiro/relatorios/extrato-filtros";
import { FluxoCaixaGrafico } from "@/modules/financeiro/relatorios/components/fluxo-caixa-grafico";
import { CreditosGrafico } from "@/modules/financeiro/relatorios/components/creditos-grafico";
import {
  CreditosPorMesTabela,
  CreditosTabela,
} from "@/modules/financeiro/relatorios/components/creditos-tabela";
import { PosicaoBancariaTabela } from "@/modules/financeiro/relatorios/components/posicao-bancaria-tabela";
import { RelatoriosNav } from "@/modules/financeiro/relatorios/components/relatorios-nav";
import {
  normalizarRelatorio,
  type RelatorioId,
} from "@/modules/financeiro/relatorios/relatorios";
import { SeletorFornecedor } from "@/modules/financeiro/relatorios/components/seletor-fornecedor";
import { SeletorMes } from "@/modules/financeiro/relatorios/components/seletor-mes";
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
  listarCentrosCustoRaiz,
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

const MES_VALIDO = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Faixa de cabeçalho de cada relatório: título e, opcionalmente, controles. */
function SecaoRelatorio({
  titulo,
  descricao,
  controles,
  children,
}: {
  titulo: string;
  descricao: string;
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
        {controles ? <div className="shrink-0">{controles}</div> : null}
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
  podeVerLancamentos,
}: {
  podeVerLancamentos: boolean;
}) {
  const dados = await fluxoCaixa();
  if (dados.meses.length === 0) {
    return (
      <EmptyState
        icone={BarChart3}
        titulo="Sem movimentação de caixa"
        descricao="Assim que houver parcelas com vencimento lançadas, o fluxo aparece aqui."
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
            </>
          }
        />
        <KPICard
          titulo="Saídas (a pagar)"
          valor={<MoneyText valor={dados.totalSaidas} />}
          detalhe={
            <>
              Realizado <MoneyText valor={dados.totalRealizadoSaidas} />
            </>
          }
        />
        <KPICard
          titulo="Saldo projetado"
          valor={<MoneyText valor={dados.saldoProjetado} />}
          detalhe="Entradas menos saídas no período"
        />
        <KPICard
          titulo="Meses com movimento"
          valor={dados.meses.length}
          detalhe="Por mês de vencimento"
        />
      </GradeKpis>
      <Painel>
        <FluxoCaixaGrafico
          meses={dados.meses}
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
  mes,
  podeVerLancamentos,
}: {
  mes: string;
  podeVerLancamentos: boolean;
}) {
  const dre = await dreGerencial({ mes });
  return (
    <>
      <GradeKpis>
        {/* Receita e despesa OPERACIONAIS: é o que a obra fez. A aplicação
            financeira da conta não entra, senão o cartão de receita mostraria a
            varredura noturna do banco como faturamento. */}
        <KPICard
          titulo="Receitas"
          valor={<MoneyText valor={dre.operacional.totalReceitas} />}
          detalhe="Lançamentos a receber no mês"
        />
        <KPICard
          titulo="Despesas"
          valor={<MoneyText valor={dre.operacional.totalDespesas} />}
          detalhe="Lançamentos a pagar no mês"
        />
        <KPICard
          titulo="Resultado"
          valor={<MoneyText valor={dre.resultado} />}
          detalhe={dre.resultado >= 0 ? "Superávit" : "Déficit"}
        />
      </GradeKpis>
      {!temLancamentoNoDre(dre) ? (
        <EmptyState
          icone={BarChart3}
          titulo="Sem lançamentos no mês"
          descricao="Não há receitas nem despesas com competência neste mês."
        />
      ) : (
        <DreTabela
          dre={dre}
          mes={mes}
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
    return (
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
          detalhe="Somando todas as contas ativas"
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
  podeVerLancamentos,
}: {
  podeVerLancamentos: boolean;
}) {
  // As duas leituras em paralelo: são independentes, e uma esperar a outra
  // dobraria o tempo da aba sem motivo.
  const [dados, contratos] = await Promise.all([
    creditos(),
    emprestimosPorContrato(),
  ]);
  if (dados.contratos.length === 0 && contratos.contratos.length === 0) {
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
          <Painel>
            <div className="overflow-x-auto">
              <table className="w-full text-detalhe">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-2 py-2 text-left font-medium">Contrato</th>
                    <th className="px-2 py-2 text-right font-medium">Tomado</th>
                    <th className="px-2 py-2 text-right font-medium">Pago</th>
                    <th className="px-2 py-2 text-right font-medium">A pagar</th>
                    <th className="px-2 py-2 text-right font-medium">Parcelas</th>
                    <th className="px-2 py-2 text-right font-medium">Próxima</th>
                  </tr>
                </thead>
                <tbody>
                  {contratos.contratos.map((contrato) => (
                    <tr
                      key={contrato.centroCustoId}
                      className="border-b border-border last:border-0"
                    >
                      <td className="px-2 py-2">{contrato.contrato}</td>
                      <td className="px-2 py-2 text-right">
                        <MoneyText valor={contrato.tomado} />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <MoneyText valor={contrato.pago} />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <MoneyText valor={contrato.aPagar} />
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {contrato.parcelas === 0
                          ? "—"
                          : `${contrato.parcelasPagas}/${contrato.parcelas}`}
                      </td>
                      <td className="px-2 py-2 text-right tabular-nums">
                        {contrato.proximoVencimento
                          ? formatarData(contrato.proximoVencimento)
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border font-medium">
                    <td className="px-2 py-2">Total</td>
                    <td className="px-2 py-2 text-right">
                      <MoneyText valor={contratos.totalTomado} />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <MoneyText valor={contratos.totalPago} />
                    </td>
                    <td className="px-2 py-2 text-right">
                      <MoneyText valor={contratos.totalAPagar} />
                    </td>
                    <td className="px-2 py-2" colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </Painel>
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

/**
 * Traduz o período do relatório para as pontas que a RPC entende.
 *
 * A RPC usa `[inicio, fim)` — fim EXCLUSIVO —, então a ponta de cima é o primeiro
 * dia do mês SEGUINTE ao último mês pedido. Fechar no primeiro dia do próprio mês
 * deixaria o último mês inteiro de fora, que é o tipo de erro que some do olho
 * porque o relatório continua mostrando número.
 */
function pontasDaRpc(periodo: PeriodoCompetencia): {
  inicio?: string;
  fim?: string;
} {
  if (periodo.mes) {
    return { inicio: `${periodo.mes}-01`, fim: proximoMes(periodo.mes) };
  }
  return {
    inicio: periodo.de ? `${periodo.de}-01` : undefined,
    fim: periodo.ate ? proximoMes(periodo.ate) : undefined,
  };
}

/** Descreve o período em pt-BR, para o detalhe dos cartões. */
function descreverPeriodo(
  periodo: PeriodoCompetencia,
  modo: FiltrosCustoCc["modo"],
): string {
  if (modo === "total") return "Todo o período, sem limite de data";
  if (periodo.mes) return `Mês de referência ${rotuloMes(periodo.mes)}`;
  if (periodo.de && periodo.ate) {
    return periodo.de === periodo.ate
      ? `Mês de referência ${rotuloMes(periodo.de)}`
      : `De ${rotuloMes(periodo.de)} a ${rotuloMes(periodo.ate)}`;
  }
  if (periodo.de) return `De ${rotuloMes(periodo.de)} em diante`;
  if (periodo.ate) return `Até ${rotuloMes(periodo.ate)}`;
  return "Todo o período";
}

async function ConteudoCustoCc({
  filtros,
  erroDoModo,
  podeVerLancamentos,
}: {
  filtros: FiltrosCustoCc;
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
    filtros.modo === "vida" && filtros.centroIds.length > 0
      ? await primeirosMesesDosCentros(filtros.centroIds)
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
          filtros.centroIds.length > 1
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
    centroIds: filtros.centroIds,
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
    filtros.modo === "vida" && filtros.centroIds.length > 0
      ? serieDosCentros(filtros.centroIds, filtrosDaRpc)
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
                  filtros.centroIds.length > 1
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
  filtros,
  meses,
  podeVerLancamentos,
}: {
  filtros: FiltrosCustoReceita;
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
    centrosCusto: filtros.centrosCusto,
    centrosReceita: filtros.centrosReceita,
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

      {/* Empréstimo tomado, e o outro lado da movimentação. Só aparece quando
          existe: uma faixa de zeros em todo relatório de obra seria ruído, e a
          maioria dos centros não tem dívida.

          FORA dos quatro cartões de propósito. Dinheiro que entrou e tem de ser
          devolvido não é receita, e somá-lo faria o centro Empréstimos parecer
          lucrativo. Antes de 27/08/2026 ele não aparecia em lugar nenhum deste
          relatório: o centro mostrava custo de R$ 2,84 milhões e receita zero. */}
      {total.movimentacaoEntrada > 0 || total.movimentacaoSaida > 0 ? (
        <Painel>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-0.5">
              <h3 className="text-detalhe font-medium">
                Movimentação de dívida
              </h3>
              <p className="text-legenda text-muted-foreground">
                Empréstimo tomado e devolvido no recorte. Não entra na receita,
                no resultado nem na margem: é dinheiro que precisa voltar.
              </p>
            </div>
            <div className="flex flex-wrap gap-x-10 gap-y-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-legenda text-muted-foreground uppercase">
                  Tomado
                </span>
                <MoneyText valor={total.movimentacaoEntrada} />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-legenda text-muted-foreground uppercase">
                  Devolvido
                </span>
                <MoneyText valor={total.movimentacaoSaida} />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-legenda text-muted-foreground uppercase">
                  Em aberto
                </span>
                <MoneyText
                  valor={total.movimentacaoEntrada - total.movimentacaoSaida}
                />
              </div>
            </div>
          </div>
        </Painel>
      ) : null}

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
  mes,
  podeVerLancamentos,
}: {
  mes: string;
  podeVerLancamentos: boolean;
}) {
  const custo = await custoPorGrupo({
    inicio: `${mes}-01`,
    fim: proximoMes(mes),
  });

  if (custo.grupos.length === 0) {
    return (
      <EmptyState
        icone={BarChart3}
        titulo="Sem custo neste mês de referência"
        descricao="Nenhum lançamento a pagar tem este mês de referência."
      />
    );
  }

  const maior = [...custo.grupos].sort((a, b) => b.valor - a.valor)[0];

  return (
    <>
      <GradeKpis>
        <KPICard
          titulo="Custo total do mês"
          valor={<MoneyText valor={custo.total} />}
          detalhe="Soma dos 4 grupos, igual ao custo por centro de custo"
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
        mes={mes}
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

  const mesParam = primeiro(params.mes);
  const mes = mesParam && MES_VALIDO.test(mesParam) ? mesParam : mesCorrente();

  // Lista, com uuid validado, deduplicada e no teto do filtro `in`. Regra e teto
  // moram em extrato-filtros.ts, que o seletor também usa para escrever.
  const fornecedorIds = lerFornecedoresDaUrl(params.fornecedor);

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
          listarCentrosCustoRaiz(),
          listarCategorias(),
          listarFornecedores(),
          listarFormasPagamento(),
        ])
      : null;

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
    relatorio === "custo-receita" ? await listarCentrosCustoRaiz() : null;
  const {
    filtros: filtrosCustoReceita,
    mesesEfetivos: mesesCustoReceita,
    periodoDesabilitado,
  } = lerFiltrosCustoReceita(params, mesesDisponiveis);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        modulo="Financeiro"
        titulo="Relatórios"
        descricao="Como está o caixa: fluxo, DRE, aging, posição bancária, créditos, custo por centro de custo e extrato por fornecedor."
      />

      <RelatoriosNav ativo={relatorio} />

      {relatorio === "fluxo-caixa" ? (
        <SecaoRelatorio
          titulo="Fluxo de caixa"
          descricao="Regime de CAIXA: entradas e saídas pelo mês de pagamento (realizado) e de vencimento (projetado). Não usa o mês de referência."
        >
          <ConteudoFluxoCaixa podeVerLancamentos={podeVerLancamentos} />
        </SecaoRelatorio>
      ) : null}

      {relatorio === "dre" ? (
        <SecaoRelatorio
          titulo="DRE gerencial"
          descricao="Regime de COMPETÊNCIA: receitas e despesas por categoria no MÊS DE REFERÊNCIA do lançamento, com o resultado."
          controles={<SeletorMes valor={mes} />}
        >
          <ConteudoDre mes={mes} podeVerLancamentos={podeVerLancamentos} />
        </SecaoRelatorio>
      ) : null}

      {relatorio === "custo-grupo" ? (
        <SecaoRelatorio
          titulo="Custo por grupo de insumo"
          descricao="Regime de COMPETÊNCIA: Material, Mão de obra, Equipamentos e Outros pelo MÊS DE REFERÊNCIA. Abra o grupo para chegar na subcategoria e no insumo."
          controles={<SeletorMes valor={mes} />}
        >
          <ConteudoCustoGrupo
            mes={mes}
            podeVerLancamentos={podeVerLancamentos}
          />
        </SecaoRelatorio>
      ) : null}

      {relatorio === "aging" ? (
        <SecaoRelatorio
          titulo="Aging de vencimentos"
          descricao="Regime de CAIXA: parcelas em aberto por faixa de vencimento, a pagar e a receber."
        >
          <ConteudoAging podeVerLancamentos={podeVerLancamentos} />
        </SecaoRelatorio>
      ) : null}

      {relatorio === "posicao-bancaria" ? (
        <SecaoRelatorio
          titulo="Posição bancária"
          descricao="Saldo por conta: saldo inicial mais o efeito das parcelas pagas."
        >
          <ConteudoPosicaoBancaria podeVerLancamentos={podeVerLancamentos} />
        </SecaoRelatorio>
      ) : null}

      {relatorio === "creditos" ? (
        <SecaoRelatorio
          titulo="Créditos"
          descricao="Empréstimos, financiamentos e consórcios tomados pela empresa: quanto se deve hoje e quanto vence pela frente. É uma dimensão à parte da categoria e do centro de custo — o financiamento de uma máquina continua sendo custo de equipamento."
        >
          <ConteudoCreditos podeVerLancamentos={podeVerLancamentos} />
        </SecaoRelatorio>
      ) : null}

      {relatorio === "custo-cc" && opcoesCustoCc ? (
        <SecaoRelatorio
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
            erroDoModo={erroDoModo}
            podeVerLancamentos={podeVerLancamentos}
          />
        </SecaoRelatorio>
      ) : null}

      {relatorio === "custo-receita" && centrosParaCustoReceita ? (
        <SecaoRelatorio
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
            filtros={filtrosCustoReceita}
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
