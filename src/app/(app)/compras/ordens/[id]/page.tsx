import { notFound } from "next/navigation";

import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarAnexosDoDocumento } from "@/modules/_shared/anexos/queries";
import { listarFormasPagamento } from "@/modules/compras/_shared/pagamento";
import { OrdemDetalheView } from "@/modules/compras/ordens/components/ordem-detalhe";
import {
  buscarOrdem,
  listarCentrosCusto,
  listarCondicoesPagamento,
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
    condicoesPagamento,
    formasPagamento,
    parcelasCondicao,
    anexosIniciais,
  ] = await Promise.all([
    trilhaOrdem(id),
    listarFornecedores(),
    listarInsumos(),
    listarCentrosCusto(),
    listarCondicoesPagamento(),
    listarFormasPagamento(),
    ordem.condicaoPagamentoId
      ? listarParcelasCondicao(ordem.condicaoPagamentoId)
      : Promise.resolve([]),
    listarAnexosDoDocumento("ordem_compra", id),
  ]);

  const podeEditar = temPermissao(usuario, "compras.ordens", "editar");
  const podeAprovar = temPermissao(usuario, "compras.ordens", "aprovar");
  const podeDesaprovar = temPermissao(usuario, "compras.ordens", "desaprovar");
  const podeExcluir = temPermissao(usuario, "compras.ordens", "excluir");
  const podeReceber = podeAprovar;

  return (
    <OrdemDetalheView
      ordem={ordem}
      trilha={trilha}
      fornecedores={fornecedores}
      insumos={insumos}
      centrosCusto={centrosCusto}
      condicoesPagamento={condicoesPagamento}
      formasPagamento={formasPagamento}
      parcelasCondicao={parcelasCondicao}
      anexosIniciais={anexosIniciais}
      podeEditar={podeEditar}
      podeAprovar={podeAprovar}
      podeDesaprovar={podeDesaprovar}
      podeExcluir={podeExcluir}
      podeReceber={podeReceber}
    />
  );
}
