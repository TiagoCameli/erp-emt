import { notFound } from "next/navigation";

import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { OrdemDetalheView } from "@/modules/compras/ordens/components/ordem-detalhe";
import {
  buscarOrdem,
  listarCentrosCusto,
  listarCotacoesFinalizadas,
  listarFornecedores,
  listarInsumos,
  trilhaOrdem,
} from "@/modules/compras/ordens/queries";

export default async function PaginaOrdemDetalhe({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "compras.ordens", "ver")) {
    notFound();
  }

  const { id } = await params;
  const ordem = await buscarOrdem(id);
  if (!ordem) notFound();

  const [
    trilha,
    fornecedores,
    insumos,
    centrosCusto,
    cotacoes,
  ] = await Promise.all([
    trilhaOrdem(id),
    listarFornecedores(),
    listarInsumos(),
    listarCentrosCusto(),
    listarCotacoesFinalizadas(),
  ]);

  const podeEditar = temPermissao(usuario, "compras.ordens", "editar");
  const podeAprovar = temPermissao(usuario, "compras.ordens", "aprovar");
  const podeDesaprovar = temPermissao(usuario, "compras.ordens", "desaprovar");

  return (
    <OrdemDetalheView
      ordem={ordem}
      trilha={trilha}
      fornecedores={fornecedores}
      insumos={insumos}
      centrosCusto={centrosCusto}
      cotacoes={cotacoes}
      podeEditar={podeEditar}
      podeAprovar={podeAprovar}
      podeDesaprovar={podeDesaprovar}
    />
  );
}
