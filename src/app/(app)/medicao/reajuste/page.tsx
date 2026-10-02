import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { idSchema } from "@/lib/id";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarContratos } from "@/modules/medicao/contratos/queries";
import { ReajustesFiltros } from "@/modules/medicao/reajuste/components/reajustes-filtros";
import { ReajustesTabela } from "@/modules/medicao/reajuste/components/reajustes-tabela";
import { situacaoFiltroReajuste } from "@/modules/medicao/reajuste/formato";
import { listarReajustes } from "@/modules/medicao/reajuste/queries";

const RECURSO = "medicao.reajuste" as const;

function primeiro(valor: string | string[] | undefined): string {
  return (Array.isArray(valor) ? valor[0] : valor)?.trim() ?? "";
}

/**
 * Aba Reajuste: as medições enviadas e aprovadas de todos os contratos visíveis, com o reajuste do
 * DNIT que vale em cada uma. Guarda `medicao.reajuste/ver` aqui, no servidor: a RLS da medição
 * sozinha deixaria ver o reajuste quem vê a medição sem ter a permissão do reajuste.
 */
export default async function PaginaReajuste({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) notFound();

  const params = await searchParams;
  const contratoParam = primeiro(params.contrato);
  const contratoId = idSchema.safeParse(contratoParam).success ? contratoParam : "";
  const situacao = situacaoFiltroReajuste(primeiro(params.situacao));

  const [contratos, linhas] = await Promise.all([
    listarContratos({}),
    listarReajustes({ contratoId: contratoId || undefined, situacao }),
  ]);

  return (
    <>
      <PageHeader
        modulo="Medição"
        titulo="Reajuste"
        descricao="O reajuste do DNIT em cada medição enviada ou aprovada: relatório que vale, situação dos índices e diferença para o anterior"
      />
      <ReajustesFiltros
        contratos={contratos.map((c) => ({ id: c.id, codigo: c.codigo, nomeObra: c.nomeObra }))}
        contratoId={contratoId}
        situacao={situacao ?? ""}
      />
      <ReajustesTabela linhas={linhas} />
    </>
  );
}
