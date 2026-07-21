import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TriangleAlert } from "lucide-react";

import { EmptyState, KPICard, MoneyText, PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import {
  comprasResumo,
  financeiroResumo,
  rhResumo,
  type ResumoCompras,
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

  const [compras, financeiro, rh] = await Promise.allSettled([
    comprasResumo(),
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
              detalhe={d.folha.competencia ?? "sem folha lançada"}
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
