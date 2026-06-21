import { notFound } from "next/navigation";

import { EmptyState, KPICard, MoneyText, PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { painelPorObra } from "@/modules/gestao/_shared/agregacao";
import { AgingGrafico } from "@/modules/financeiro/relatorios/components/aging-grafico";
import { FluxoCaixaGrafico } from "@/modules/financeiro/relatorios/components/fluxo-caixa-grafico";
import {
  aging,
  fluxoCaixa,
  mesCorrente,
  posicaoBancaria,
  dreGerencial,
} from "@/modules/financeiro/relatorios/queries";
import { MargemObraLista } from "@/modules/gestao/painel-empresa/components/margem-obra-lista";

function GradeKpis({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {children}
    </div>
  );
}

function Painel({
  titulo,
  children,
}: {
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h2 className="mb-3 text-secao font-semibold text-foreground">{titulo}</h2>
      {children}
    </div>
  );
}

/**
 * Painel da empresa (somente leitura): visão consolidada do caixa e do
 * resultado. Reaproveita as queries dos relatórios financeiros (posição
 * bancária, aging, fluxo de caixa e DRE do mês) e cruza com a margem por obra.
 */
export default async function PainelEmpresaPage() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "gestao.painel-empresa", "ver")) {
    notFound();
  }

  const mes = mesCorrente();
  const [posicao, vencimentos, obras, fluxo, dre] = await Promise.all([
    posicaoBancaria(),
    aging(),
    painelPorObra(),
    fluxoCaixa(),
    dreGerencial({ mes }),
  ]);

  const resultadoPositivo = dre.resultado >= 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        titulo="Painel da empresa"
        descricao="Visão consolidada: caixa, contas a pagar e a receber, resultado do mês e margem por obra."
      />

      <GradeKpis>
        <KPICard
          titulo="Caixa"
          valor={<MoneyText valor={posicao.totalSaldoAtual} />}
          detalhe="Saldo consolidado das contas ativas"
          href="/financeiro/relatorios?rel=posicao-bancaria"
        />
        <KPICard
          titulo="A pagar"
          valor={<MoneyText valor={vencimentos.totalAPagar} />}
          detalhe={
            <>
              Vencido <MoneyText valor={vencimentos.vencidoAPagar} />
            </>
          }
          href="/financeiro/relatorios?rel=aging"
        />
        <KPICard
          titulo="A receber"
          valor={<MoneyText valor={vencimentos.totalAReceber} />}
          detalhe={
            <>
              Vencido <MoneyText valor={vencimentos.vencidoAReceber} />
            </>
          }
          href="/financeiro/relatorios?rel=aging"
        />
        <KPICard
          titulo="Resultado do mês"
          valor={
            <MoneyText
              valor={dre.resultado}
              className={
                resultadoPositivo
                  ? "text-status-aprovado"
                  : "text-status-rejeitado"
              }
            />
          }
          detalhe={resultadoPositivo ? "Superávit" : "Déficit"}
          href="/financeiro/relatorios?rel=dre"
        />
      </GradeKpis>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Painel titulo="Fluxo de caixa">
          {fluxo.meses.length === 0 ? (
            <EmptyState
              titulo="Sem movimentação de caixa"
              descricao="Assim que houver parcelas com vencimento lançadas, o fluxo aparece aqui."
              className="border-none bg-transparent"
            />
          ) : (
            <FluxoCaixaGrafico meses={fluxo.meses} />
          )}
        </Painel>
        <Painel titulo="A pagar x a receber por faixa">
          {vencimentos.totalAPagar === 0 && vencimentos.totalAReceber === 0 ? (
            <EmptyState
              titulo="Sem parcelas em aberto"
              descricao="Não há parcelas pendentes ou aprovadas para envelhecer."
              className="border-none bg-transparent"
            />
          ) : (
            <AgingGrafico
              aPagar={vencimentos.aPagar}
              aReceber={vencimentos.aReceber}
            />
          )}
        </Painel>
      </div>

      <Painel titulo="Margem por obra">
        <MargemObraLista obras={obras} />
      </Painel>
    </div>
  );
}
