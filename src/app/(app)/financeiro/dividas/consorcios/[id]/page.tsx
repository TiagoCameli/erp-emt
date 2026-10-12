import { notFound } from "next/navigation";

import { idSchema } from "@/lib/id";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarAnexosDoDocumento } from "@/modules/_shared/anexos/queries";
import { listarCentrosCusto } from "@/modules/_shared/centro-custo/queries";
import { centrosImobilizado } from "@/modules/financeiro/dividas/calculo";
import { CotaDetalhe } from "@/modules/financeiro/dividas/components/cota-detalhe";
import { carregarCota, relatorioConsorcios } from "@/modules/financeiro/dividas/queries";

const RECURSO = "financeiro.dividas" as const;

export default async function PaginaCotaConsorcio({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) notFound();

  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();

  const podeEditar = temPermissao(usuario, RECURSO, "editar");
  const [detalhe, relatorio, anexos, centros] = await Promise.all([
    carregarCota(id),
    relatorioConsorcios(),
    listarAnexosDoDocumento("consorcio_cota", id),
    podeEditar ? listarCentrosCusto() : Promise.resolve([]),
  ]);
  if (!detalhe) notFound();

  return (
    <CotaDetalhe
      detalhe={detalhe}
      resumo={relatorio.find((r) => r.cotaId === id) ?? null}
      centros={centros}
      centrosBem={centrosImobilizado(centros)}
      anexos={anexos}
      podeEditar={podeEditar}
      podeVerLancamentos={temPermissao(usuario, "financeiro.lancamentos", "ver")}
    />
  );
}
