import { notFound } from "next/navigation";

import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarColaboradores } from "@/modules/rh/_shared/queries";
import { PontoDetalheView } from "@/modules/rh/apontamentos/components/ponto-detalhe";
import { buscarPonto } from "@/modules/rh/apontamentos/queries";

export default async function PaginaPontoDetalhe({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "rh.apontamentos", "ver")) {
    notFound();
  }

  const { id } = await params;
  const ponto = await buscarPonto(id);
  if (!ponto) notFound();

  const colaboradores = await listarColaboradores();

  const podeEditar = temPermissao(usuario, "rh.apontamentos", "editar");
  const podeAprovar = temPermissao(usuario, "rh.apontamentos", "aprovar");

  return (
    <PontoDetalheView
      ponto={ponto}
      colaboradores={colaboradores}
      podeEditar={podeEditar}
      podeAprovar={podeAprovar}
    />
  );
}
