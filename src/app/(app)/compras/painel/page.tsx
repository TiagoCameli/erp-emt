import Link from "next/link";
import { notFound } from "next/navigation";

import { KPICard, PageHeader } from "@/components/canonicos";
import { formatarBRL } from "@/lib/formatadores";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { PedidosPendentes } from "@/modules/compras/painel/components/pedidos-pendentes";
import { UltimasOrdens } from "@/modules/compras/painel/components/ultimas-ordens";
import { painelCompras } from "@/modules/compras/painel/queries";

export default async function PaginaPainelCompras() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "compras.painel", "ver")) {
    notFound();
  }

  const painel = await painelCompras();

  return (
    <>
      <PageHeader
        titulo="Painel de compras"
        descricao="Visão geral do fluxo de compras: aprovações pendentes, valores comprometidos e recebimentos do mês"
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <KPICard
          titulo="Pedidos pendentes"
          valor={painel.pedidosPendentes}
          detalhe="Aguardando aprovação"
          href="/compras/pedidos"
        />
        <KPICard
          titulo="Ordens pendentes"
          valor={painel.ordensPendentes}
          detalhe="Aguardando aprovação"
          href="/compras/ordens"
        />
        <KPICard
          titulo="Recebimentos do mês"
          valor={painel.recebimentosMesQuantidade}
          detalhe={`${painel.ordensRecebidasMes} ordens recebidas`}
          href="/compras/recebimentos"
        />
        <KPICard
          titulo="Valor previsto"
          valor={formatarBRL(painel.valorPrevisto)}
          detalhe="Ordens aprovadas, ainda sem nota"
        />
        <KPICard
          titulo="Valor a pagar"
          valor={formatarBRL(painel.valorAPagar)}
          detalhe="Recebimentos confirmados"
        />
        <KPICard
          titulo="Recebido no mês"
          valor={formatarBRL(painel.recebimentosMesValor)}
          detalhe="Soma das notas do mês"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-corpo font-semibold">Últimas ordens de compra</h2>
            <Link
              href="/compras/ordens"
              className="text-detalhe text-primary hover:underline"
            >
              Ver todas
            </Link>
          </div>
          <UltimasOrdens ordens={painel.ultimasOrdens} />
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-corpo font-semibold">Pedidos pendentes</h2>
            <Link
              href="/compras/pedidos"
              className="text-detalhe text-primary hover:underline"
            >
              Ver todos
            </Link>
          </div>
          <PedidosPendentes pedidos={painel.pedidosPendentesLista} />
        </section>
      </div>
    </>
  );
}
