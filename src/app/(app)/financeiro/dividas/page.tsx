import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarCentrosCusto } from "@/modules/_shared/centro-custo/queries";
import { etapasDeDivida } from "@/modules/financeiro/dividas/calculo";
import { DividasPainel } from "@/modules/financeiro/dividas/components/dividas-painel";
import { relatorioConsorcios, relatorioContratos } from "@/modules/financeiro/dividas/queries";

const RECURSO = "financeiro.dividas" as const;

export default async function PaginaDividas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) notFound();
  const podeEditar = temPermissao(usuario, RECURSO, "editar");

  const params = await searchParams;
  const aba = params.aba === "consorcios" ? "consorcios" : "contratos";

  // Os centros só servem aos drawers de cadastro: quem só vê não carrega.
  const [contratos, cotas, centros] = await Promise.all([
    relatorioContratos(),
    relatorioConsorcios(),
    podeEditar ? listarCentrosCusto() : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        modulo="Financeiro"
        titulo="Dívidas"
        descricao="Contratos de dívida com o cronograma (principal e juros de cada parcela) e cotas de consórcio. As parcelas continuam no lançamento; daqui saem o saldo devedor, os juros do DRE e o CET"
      />
      <DividasPainel
        abaInicial={aba}
        contratos={contratos}
        cotas={cotas}
        etapas={etapasDeDivida(centros)}
        centros={centros}
        podeEditar={podeEditar}
      />
    </>
  );
}
