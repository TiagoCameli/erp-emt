import { notFound } from "next/navigation";

import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { FolhaDetalheView } from "@/modules/rh/folha/components/folha-detalhe";
import {
  buscarFolha,
  resumoPorCentroCusto,
} from "@/modules/rh/folha/queries";

export default async function PaginaFolhaDetalhe({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "rh.folha", "ver")) {
    notFound();
  }

  const { id } = await params;
  const folha = await buscarFolha(id);
  if (!folha) notFound();

  const custosPorCentro = await resumoPorCentroCusto(id);

  const podeCriar = temPermissao(usuario, "rh.folha", "criar");
  const podeEditar = temPermissao(usuario, "rh.folha", "editar");

  return (
    <FolhaDetalheView
      folha={folha}
      custosPorCentro={custosPorCentro}
      podeCriar={podeCriar}
      podeEditar={podeEditar}
    />
  );
}
