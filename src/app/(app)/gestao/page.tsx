import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TriangleAlert } from "lucide-react";

import { EmptyState, KPICard, MoneyText, PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { formatarCompetencia } from "@/modules/rh/_shared/formato";
import {
  comprasResumo,
  custoResumo,
  financeiroResumo,
  rhResumo,
  type ResumoCompras,
  type ResumoCusto,
  type ResumoFinanceiro,
  type ResumoRh,
} from "@/modules/gestao/queries";

export const metadata = {
  title: "Gestão",
};

function Secao<T>({
  titulo,
  rota,
  resultado,
  children,
  rotuloLink,
}: {
  titulo: string;
  rota: string;
  resultado: PromiseSettledResult<T>;
  children: (dados: T) => ReactNode;
  rotuloLink?: string;
}) {
  if (resultado.status === "rejected") {
    console.error(`[gestao] falha ao carregar a seção ${titulo}:`, resultado.reason);
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-corpo font-semibold">{titulo}</h2>
        <Link
          href={rota}
          className="text-detalhe text-muted-foreground hover:text-foreground hover:underline"
        >
          {rotuloLink ?? `Abrir ${titulo.toLowerCase()}`}
        </Link>
      </div>
      {resultado.status === "fulfilled" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {children(resultado.value)}
        </div>
      ) : (
        <EmptyState
          icone={TriangleAlert}
          titulo="Não foi possível carregar esta seção"
          descricao="Recarregue a página. Se continuar, avise o administrador."
          acao={<Link href="/gestao" className="text-detalhe text-muted-foreground hover:text-foreground hover:underline">Recarregar</Link>}
        />
      )}
    </section>
  );
}

export default async function GestaoPage() {
  const usuario = await getUsuarioLogado();
  if (!temPermissao(usuario, "gestao.painel", "ver")) {
    notFound();
  }

  const [compras, custo, financeiro, rh] = await Promise.allSettled([
    comprasResumo(),
    custoResumo(),
    financeiroResumo(),
    rhResumo(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        titulo="Gestão"
        descricao="Visão geral de Compras, Financeiro e RH"
      />

      <Secao<ResumoCompras> titulo="Compras" rota="/compras" resultado={compras}>
        {(d) => (
          <>
            <KPICard
              titulo="OCs a aprovar"
              valor={d.ocsAprovar.contagem}
              detalhe={<MoneyText valor={d.ocsAprovar.valor} />}
            />
            <KPICard
              titulo="OCs abertas"
              valor={<MoneyText valor={d.ocsAbertas.valor} />}
              detalhe={`${d.ocsAbertas.contagem} ordem(ns)`}
            />
            <KPICard titulo="Cotações em aberto" valor={d.cotacoesAbertas} />
          </>
        )}
      </Secao>

      {/* Custo por mês de REFERÊNCIA: é o gasto da obra no mês, não o que saiu
          do caixa. Vive antes do financeiro porque é a pergunta do dono. */}
      <Secao<ResumoCusto>
        titulo="Custo por mês de referência"
        rota="/financeiro/relatorios?rel=custo-cc"
        resultado={custo}
        rotuloLink="Abrir custo por centro de custo"
      >
        {(d) => (
          <>
            <KPICard
              titulo="Custo do mês atual"
              valor={<MoneyText valor={d.mesAtual?.total ?? 0} />}
              detalhe={`${d.mesAtual?.lancamentos ?? 0} lançamento(s) com este mês de referência`}
            />
            <KPICard
              titulo="Mês anterior"
              valor={<MoneyText valor={d.mesAnterior?.total ?? 0} />}
              detalhe={`${d.mesAnterior?.lancamentos ?? 0} lançamento(s)`}
            />
            <KPICard
              titulo="Acumulado (6 meses)"
              valor={
                <MoneyText
                  valor={d.meses.reduce((soma, m) => soma + m.total, 0)}
                />
              }
              detalhe="Regime de competência, não de caixa"
            />
          </>
        )}
      </Secao>

      <Secao<ResumoFinanceiro>
        titulo="Financeiro"
        rota="/financeiro"
        resultado={financeiro}
      >
        {(d) => (
          <>
            <KPICard
              titulo="A pagar (até 7 dias)"
              valor={<MoneyText valor={d.aPagar.valor} />}
              detalhe={`${d.aPagar.contagem} parcela(s), ${d.aPagar.vencidas} vencida(s)`}
            />
            <KPICard
              titulo="Pagamentos a aprovar"
              valor={d.aAprovar.contagem}
              detalhe={<MoneyText valor={d.aAprovar.valor} />}
            />
            <KPICard
              titulo="Pago no mês"
              valor={<MoneyText valor={d.pagoNoMes.valor} />}
              detalhe={`${d.pagoNoMes.contagem} pagamento(s)`}
            />
          </>
        )}
      </Secao>

      <Secao<ResumoRh> titulo="RH" rota="/rh" resultado={rh} rotuloLink="Abrir RH">
        {(d) => (
          <>
            <KPICard
              titulo="Colaboradores ativos"
              valor={d.colaboradoresAtivos}
            />
            <KPICard
              titulo="Custo da folha"
              valor={<MoneyText valor={d.folha.custoTotal} />}
              detalhe={
                d.folha.competencia
                  ? formatarCompetencia(d.folha.competencia)
                  : "sem folha lançada"
              }
            />
            <KPICard
              titulo="Apontamentos em aberto"
              valor={d.apontamentosAbertos}
            />
          </>
        )}
      </Secao>
    </div>
  );
}
