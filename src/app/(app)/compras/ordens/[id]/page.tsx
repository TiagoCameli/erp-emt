import { notFound } from "next/navigation";

import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { OrdemDetalheView } from "@/modules/compras/ordens/components/ordem-detalhe";
import {
  buscarOrdem,
  listarCentrosCusto,
  listarCondicoesPagamento,
  listarCotacoesFinalizadas,
  listarFornecedores,
  listarInsumos,
  listarParcelasCondicao,
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
    parcelasCondicao,
  ] = await Promise.all([
    trilhaOrdem(id),
    listarFornecedores(),
    listarInsumos(),
    listarCentrosCusto(),
    listarCotacoesFinalizadas(),
    listarCondicoesPagamento(),
    ordem.condicaoPagamentoId
      ? listarParcelasCondicao(ordem.condicaoPagamentoId)
      : Promise.resolve([]),
  ]);

  const podeEditar = temPermissao(usuario, "compras.ordens", "editar");
  const podeAprovar = temPermissao(usuario, "compras.ordens", "aprovar");
  const podeDesaprovar = temPermissao(usuario, "compras.ordens", "desaprovar");
  const podeReceber = podeAprovar;

  return (
    <OrdemDetalheView
      ordem={ordem}
      trilha={trilha}
      fornecedores={fornecedores}
      insumos={insumos}
      centrosCusto={centrosCusto}
      cotacoes={cotacoes}
      condicoesPagamento={condicoesPagamento}
      parcelasCondicao={parcelasCondicao}
      podeEditar={podeEditar}
      podeAprovar={podeAprovar}
      podeDesaprovar={podeDesaprovar}
      podeReceber={podeReceber}
    />
  );
}
