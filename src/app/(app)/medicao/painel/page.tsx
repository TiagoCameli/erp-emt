import { notFound } from "next/navigation";
import { CircleAlert } from "lucide-react";

import { EmptyState, GradeKpis, KPICard, MoneyText, PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { lerCatalogoDaUrl } from "@/modules/financeiro/_shared/listas-na-url";
import { percentualExibicao } from "@/modules/medicao/boletim/formato";
import { PainelFiltros } from "@/modules/medicao/painel/components/painel-filtros";
import { PainelTabela } from "@/modules/medicao/painel/components/painel-tabela";
import { carregarPainel } from "@/modules/medicao/painel/queries";
import { STATUS_CONTRATO, TIPOS_CONTRATANTE } from "@/modules/medicao/_shared/rotulos";

const RECURSO = "medicao.painel" as const;
const TITULO = "Painel de contratos";
const DESCRICAO = "Uma linha por contrato que você acompanha, com o total consolidado";

export default async function PaginaPainel({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) notFound();

  const params = await searchParams;
  const status = lerCatalogoDaUrl(params.status, STATUS_CONTRATO);
  const tipos = lerCatalogoDaUrl(params.tipo, TIPOS_CONTRATANTE);

  const { painel, erro } = await carregarPainel({ status, tipos });

  if (!painel) {
    return (
      <>
        <PageHeader modulo="Medição" titulo={TITULO} descricao={DESCRICAO} />
        <PainelFiltros status={status} tipos={tipos} />
        <EmptyState icone={CircleAlert} titulo="Não foi possível montar o painel" descricao={erro ?? undefined} />
      </>
    );
  }

  const t = painel.total;
  const pctExecutado = percentualExibicao(t.pct_executado);

  return (
    <>
      <PageHeader modulo="Medição" titulo={TITULO} descricao={DESCRICAO} />
      <PainelFiltros status={status} tipos={tipos} />
      <GradeKpis className="mb-4">
        <KPICard titulo="Previsto" valor={<MoneyText valor={t.previsto} />} />
        <KPICard titulo="Acumulado" valor={<MoneyText valor={t.acumulado} />} />
        <KPICard
          titulo="% executado"
          valor={pctExecutado === "" ? <span className="text-muted-foreground">Sem valor</span> : <span className="tabular-nums">{pctExecutado}</span>}
        />
        <KPICard titulo="Saldo" valor={<MoneyText valor={t.saldo} />} />
        <KPICard
          titulo="Medição corrente"
          valor={<MoneyText valor={t.corrente} />}
          detalhe="Soma da medição corrente de cada contrato"
        />
      </GradeKpis>
      <PainelTabela painel={painel} podeAbrirBoletim={temPermissao(usuario, "medicao.boletim", "ver")} />
    </>
  );
}
