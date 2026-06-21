import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { EmptyState, KPICard, PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { BlocoDocumentos } from "@/modules/gestao/alertas/components/bloco-documentos";
import { BlocoEstoque } from "@/modules/gestao/alertas/components/bloco-estoque";
import { BlocoFaturas } from "@/modules/gestao/alertas/components/bloco-faturas";
import { BlocoFerias } from "@/modules/gestao/alertas/components/bloco-ferias";
import { BlocoOrdens } from "@/modules/gestao/alertas/components/bloco-ordens";
import {
  documentosVencendo,
  estoqueCritico,
  faturasVencidas,
  feriasVencendo,
  ordensAbertas,
} from "@/modules/gestao/alertas/queries";

function GradeKpis({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {children}
    </div>
  );
}

/**
 * Painel de Alertas da Gestão (somente leitura): junta os alertas acionáveis da
 * empresa de cinco fontes. KPIs com a contagem de cada categoria no topo e, em
 * seguida, um bloco por categoria com a tabela curta e o link de drill-down.
 */
export default async function PaginaAlertas() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "gestao.alertas", "ver")) {
    notFound();
  }

  const [estoque, documentos, ferias, faturas, ordens] = await Promise.all([
    estoqueCritico(),
    documentosVencendo(),
    feriasVencendo(),
    faturasVencidas(),
    ordensAbertas(),
  ]);

  const totalAlertas =
    estoque.total +
    documentos.total +
    ferias.total +
    faturas.total +
    ordens.total;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        titulo="Alertas"
        descricao="Tudo que precisa de atenção, num lugar só: estoque crítico, documentos e férias vencendo, faturas vencidas e ordens de serviço abertas."
      />

      <GradeKpis>
        <KPICard
          titulo="Estoque crítico"
          valor={estoque.total}
          detalhe="Itens abaixo do mínimo"
          href="/estoque/alertas"
        />
        <KPICard
          titulo="Documentos vencidos"
          valor={documentos.total}
          detalhe="Vencidos ou a vencer em 30 dias"
          href="/rh/documentos"
        />
        <KPICard
          titulo="Férias vencidas"
          valor={ferias.total}
          detalhe="Vencidas ou a vencer em 60 dias"
          href="/rh/ferias"
        />
        <KPICard
          titulo="Faturas vencidas"
          valor={faturas.total}
          detalhe="Parcelas a receber em atraso"
          href="/financeiro/contas-receber"
        />
        <KPICard
          titulo="OS abertas"
          valor={ordens.total}
          detalhe="Abertas ou em execução"
          href="/manutencao/ordens-servico"
        />
      </GradeKpis>

      {totalAlertas === 0 ? (
        <EmptyState
          icone={ShieldCheck}
          titulo="Nada crítico no momento"
          descricao="Estoque dentro do mínimo, documentos e férias em dia, nada vencido a receber e nenhuma OS aberta. Tudo sob controle."
        />
      ) : (
        <div className="flex flex-col gap-6">
          <BlocoEstoque itens={estoque.itens} total={estoque.total} />
          <BlocoDocumentos itens={documentos.itens} total={documentos.total} />
          <BlocoFerias itens={ferias.itens} total={ferias.total} />
          <BlocoFaturas itens={faturas.itens} total={faturas.total} />
          <BlocoOrdens itens={ordens.itens} total={ordens.total} />
        </div>
      )}
    </div>
  );
}
