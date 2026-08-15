import { notFound } from "next/navigation";
import { BarChart3 } from "lucide-react";

import {
  EmptyState,
  GradeKpis,
  KPICard,
  MoneyText,
  PageHeader,
} from "@/components/canonicos";
import { formatarBRL } from "@/lib/formatadores";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import {
  listarCategorias,
  listarCentrosCusto,
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
import { CustoCcSerie } from "@/modules/financeiro/relatorios/components/custo-cc-serie";
import { FiltrosCustoCcBarra } from "@/modules/financeiro/relatorios/components/filtros-custo-cc-barra";
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
  dreGerencial,
  extratoPorFornecedor,
  fluxoCaixa,
  listarFornecedoresComLancamentos,
  mesCorrente,
  posicaoBancaria,
  primeiroMesDoCentro,
  serieDoCentro,
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
        <KPICard
          titulo="Receitas"
          valor={<MoneyText valor={dre.totalReceitas} />}
          detalhe="Lançamentos a receber no mês"
        />
        <KPICard
          titulo="Despesas"
          valor={<MoneyText valor={dre.totalDespesas} />}
          detalhe="Lançamentos a pagar no mês"
        />
        <KPICard
          titulo="Resultado"
          valor={<MoneyText valor={dre.resultado} />}
          detalhe={dre.resultado >= 0 ? "Superávit" : "Déficit"}
        />
      </GradeKpis>
      {dre.receitas.length === 0 && dre.despesas.length === 0 ? (
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

  // No modo vida o período NASCE do centro: primeiro descobre quando ele começou.
  const primeiroMes =
    filtros.modo === "vida" && filtros.centroId
      ? await primeiroMesDoCentro(filtros.centroId)
      : undefined;

  if (filtros.modo === "vida" && primeiroMes === null) {
    return (
      <EmptyState
        icone={BarChart3}
        titulo="Este centro de custo ainda não tem custo"
        descricao="Nenhum lançamento a pagar foi rateado neste centro, então ele ainda não tem uma vida para mostrar."
      />
    );
  }

  const periodo = periodoDoModo(filtros, primeiroMes ?? undefined);
  const pontas = pontasDaRpc(periodo);

  const filtrosDoDrill: FiltrosDoRelatorioDeCusto = {
    categoriaId: filtros.categoriaId,
    fornecedorId: filtros.fornecedorId,
    excluirPrevisto: filtros.excluirPrevisto,
  };

  const filtrosDaRpc = {
    ...pontas,
    // No modo vida o relatório é de UM centro: filtrar aqui é o que faz a tabela
    // e os cartões falarem só dele, e não de todos no período dele.
    centroCustoId: filtros.modo === "vida" ? filtros.centroId : filtros.centroId,
    categoriaId: filtros.categoriaId,
    fornecedorId: filtros.fornecedorId,
    excluirPrevisto: filtros.excluirPrevisto,
    tipoCentro: filtros.tipoCentro,
  };

  const comparar = filtros.comparar && comparacaoPermitida(filtros.modo);
  const anterior = comparar ? periodoAnterior(periodo) : null;

  const [custo, custoAnterior, serie] = await Promise.all([
    custoPorCentroCusto(filtrosDaRpc),
    anterior
      ? custoPorCentroCusto({ ...filtrosDaRpc, ...pontasDaRpc(anterior) })
      : Promise.resolve(null),
    filtros.modo === "vida" && filtros.centroId
      ? serieDoCentro(filtros.centroId, pontas)
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
              centroCustoId: centro.centroCustoId,
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
              ? `Desde ${rotuloMes(primeiroMes)}, o primeiro lançamento deste centro`
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

      {serie && filtros.centroId ? (
        <Painel>
          <CustoCcSerie
            serie={serie}
            centroCustoId={filtros.centroId}
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
  // precisam de centro, categoria nem fornecedor, e três consultas em toda
  // navegação de relatório seriam trabalho jogado fora.
  const opcoesCustoCc =
    relatorio === "custo-cc"
      ? await Promise.all([
          listarCentrosCusto(),
          listarCategorias(),
          listarFornecedores(),
        ])
      : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        modulo="Financeiro"
        titulo="Relatórios"
        descricao="Como está o caixa: fluxo, DRE, aging, posição bancária, custo por centro de custo e extrato por fornecedor."
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
          />
          <ConteudoCustoCc
            filtros={filtrosCustoCc}
            erroDoModo={erroDoModo}
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
