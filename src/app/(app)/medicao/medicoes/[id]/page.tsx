import { notFound } from "next/navigation";

import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { MedicaoDetalheView } from "@/modules/medicao/medicoes/components/medicao-detalhe";
import { buscarMedicao } from "@/modules/medicao/medicoes/queries";

export default async function PaginaMedicaoDetalhe({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "medicao.medicoes", "ver")) {
    notFound();
  }

  const { id } = await params;
  const medicao = await buscarMedicao(id);
  if (!medicao) notFound();

  const podeEditar = temPermissao(usuario, "medicao.medicoes", "editar");
  const podeAprovar = temPermissao(usuario, "medicao.medicoes", "aprovar");
  const podeDesaprovar = temPermissao(
    usuario,
    "medicao.medicoes",
    "desaprovar",
  );

  return (
    <MedicaoDetalheView
      medicao={medicao}
      podeEditar={podeEditar}
      podeAprovar={podeAprovar}
      podeDesaprovar={podeDesaprovar}
    />
  );
}
