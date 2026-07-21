import { notFound } from "next/navigation";

import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarCondicoesPagamento } from "@/modules/compras/condicoes-pagamento/queries";
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
    condicoesPagamento,
  ] = await Promise.all([
    trilhaOrdem(id),
    listarFornecedores(),
    listarInsumos(),
    listarCentrosCusto(),
    listarCotacoesFinalizadas(),
    listarCondicoesPagamento(),
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
      condicoesPagamento={condicoesPagamento}
      podeEditar={podeEditar}
      podeAprovar={podeAprovar}
      podeDesaprovar={podeDesaprovar}
    />
  );
}
