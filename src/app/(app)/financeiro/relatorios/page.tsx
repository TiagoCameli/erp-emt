import { notFound } from "next/navigation";
import { BarChart3 } from "lucide-react";

import { EmptyState, KPICard, MoneyText, PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { AgingGrafico } from "@/modules/financeiro/relatorios/components/aging-grafico";
import { AgingTabela } from "@/modules/financeiro/relatorios/components/aging-tabela";
import { CustoCcGrafico } from "@/modules/financeiro/relatorios/components/custo-cc-grafico";
import { CustoCcTabela } from "@/modules/financeiro/relatorios/components/custo-cc-tabela";
import { DreTabela } from "@/modules/financeiro/relatorios/components/dre-tabela";
import { ExtratoFornecedorTabela } from "@/modules/financeiro/relatorios/components/extrato-fornecedor-tabela";
import { FluxoCaixaGrafico } from "@/modules/financeiro/relatorios/components/fluxo-caixa-grafico";
import { PosicaoBancariaTabela } from "@/modules/financeiro/relatorios/components/posicao-bancaria-tabela";
import {
  normalizarRelatorio,
  RelatoriosNav,
  type RelatorioId,
} from "@/modules/financeiro/relatorios/components/relatorios-nav";
import { SeletorFornecedor } from "@/modules/financeiro/relatorios/components/seletor-fornecedor";
import { SeletorMes } from "@/modules/financeiro/relatorios/components/seletor-mes";
import {
  aging,
  custoPorCentroCusto,
  dreGerencial,
  extratoPorFornecedor,
  fluxoCaixa,
  listarFornecedoresComLancamentos,
  mesCorrente,
  posicaoBancaria,
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

function GradeKpis({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {children}
    </div>
  );
}

function Painel({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">{children}</div>
  );
}

async function ConteudoFluxoCaixa() {
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
        <FluxoCaixaGrafico meses={dados.meses} />
      </Painel>
    </>
  );
}

async function ConteudoDre({ mes }: { mes: string }) {
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
        <DreTabela dre={dre} />
      )}
    </>
  );
}

async function ConteudoAging() {
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
            <AgingGrafico aPagar={dados.aPagar} aReceber={dados.aReceber} />
          </Painel>
          <AgingTabela aging={dados} />
        </>
      )}
    </>
  );
}

async function ConteudoPosicaoBancaria() {
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
      <PosicaoBancariaTabela posicao={posicao} />
    </>
  );
}

async function ConteudoCustoCc() {
  const custo = await custoPorCentroCusto();
  if (custo.centros.length === 0) {
    return (
      <EmptyState
        icone={BarChart3}
        titulo="Sem custos rateados"
        descricao="Os rateios dos lançamentos a pagar aparecem aqui por centro de custo."
      />
    );
  }
  const maior = custo.centros[0];
  return (
    <>
      <GradeKpis>
        <KPICard
          titulo="Custo total"
          valor={<MoneyText valor={custo.total} />}
          detalhe="Lançamentos a pagar rateados"
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
      </GradeKpis>
      <Painel>
        <CustoCcGrafico centros={custo.centros} />
      </Painel>
      <CustoCcTabela custo={custo} />
    </>
  );
}

async function ConteudoExtratoFornecedor({
  fornecedorId,
}: {
  fornecedorId?: string;
}) {
  const [fornecedores, extrato] = await Promise.all([
    listarFornecedoresComLancamentos(),
    extratoPorFornecedor({ fornecedorId }),
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
      descricao="Lançamentos a pagar do fornecedor selecionado, do mais recente ao mais antigo."
      controles={
        <SeletorFornecedor
          fornecedores={fornecedores}
          valor={fornecedorId ?? ""}
        />
      }
    >
      <GradeKpis>
        <KPICard
          titulo="Total a pagar"
          valor={<MoneyText valor={extrato.total} />}
          detalhe={
            fornecedorId
              ? "Do fornecedor selecionado"
              : "Todos os fornecedores"
          }
        />
        <KPICard
          titulo="Lançamentos"
          valor={extrato.lancamentos.length}
          detalhe="No extrato"
        />
      </GradeKpis>
      <ExtratoFornecedorTabela lancamentos={extrato.lancamentos} />
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

  const params = await searchParams;
  const relatorio: RelatorioId = normalizarRelatorio(primeiro(params.rel));

  const mesParam = primeiro(params.mes);
  const mes = mesParam && MES_VALIDO.test(mesParam) ? mesParam : mesCorrente();

  const fornecedorId = primeiro(params.fornecedor) || undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        titulo="Relatórios financeiros"
        descricao="Como está o caixa: fluxo, DRE, aging, posição bancária, custo por centro de custo e extrato por fornecedor."
      />

      <RelatoriosNav ativo={relatorio} />

      {relatorio === "fluxo-caixa" ? (
        <SecaoRelatorio
          titulo="Fluxo de caixa"
          descricao="Entradas e saídas por mês de vencimento, separando realizado de projetado."
        >
          <ConteudoFluxoCaixa />
        </SecaoRelatorio>
      ) : null}

      {relatorio === "dre" ? (
        <SecaoRelatorio
          titulo="DRE gerencial"
          descricao="Receitas e despesas por categoria no mês de competência, com o resultado."
          controles={<SeletorMes valor={mes} />}
        >
          <ConteudoDre mes={mes} />
        </SecaoRelatorio>
      ) : null}

      {relatorio === "aging" ? (
        <SecaoRelatorio
          titulo="Aging de vencimentos"
          descricao="Parcelas em aberto por faixa de vencimento, a pagar e a receber."
        >
          <ConteudoAging />
        </SecaoRelatorio>
      ) : null}

      {relatorio === "posicao-bancaria" ? (
        <SecaoRelatorio
          titulo="Posição bancária"
          descricao="Saldo por conta: saldo inicial mais o efeito das parcelas pagas."
        >
          <ConteudoPosicaoBancaria />
        </SecaoRelatorio>
      ) : null}

      {relatorio === "custo-cc" ? (
        <SecaoRelatorio
          titulo="Custo por centro de custo"
          descricao="Rateio dos lançamentos a pagar por centro de custo."
        >
          <ConteudoCustoCc />
        </SecaoRelatorio>
      ) : null}

      {relatorio === "extrato-fornecedor" ? (
        <ConteudoExtratoFornecedor fornecedorId={fornecedorId} />
      ) : null}
    </div>
  );
}
