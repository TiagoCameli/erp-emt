import { notFound } from "next/navigation";

import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { resumoPorCentroCusto, resumoPorEncargo } from "@/modules/rh/folha/calculo";
import { FolhaDetalheView } from "@/modules/rh/folha/components/folha-detalhe";
import { buscarFolha } from "@/modules/rh/folha/queries";

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
  // Única leitura da folha (Bloco 6, Task 4 — fix de performance): os
  // resumos abaixo são derivados em memória de `folha.itens`, sem re-fetch.
  const folha = await buscarFolha(id);
  if (!folha) notFound();

  const custosPorCentro = resumoPorCentroCusto(folha);
  const resumoEncargos = resumoPorEncargo(folha);

  const podeCriar = temPermissao(usuario, "rh.folha", "criar");
  const podeEditar = temPermissao(usuario, "rh.folha", "editar");

  return (
    <FolhaDetalheView
      folha={folha}
      custosPorCentro={custosPorCentro}
      resumoEncargos={resumoEncargos}
      podeCriar={podeCriar}
      podeEditar={podeEditar}
    />
  );
}
