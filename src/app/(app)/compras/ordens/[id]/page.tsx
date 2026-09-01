import { notFound } from "next/navigation";

import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarAnexosDoDocumento } from "@/modules/_shared/anexos/queries";
import { listarCartoesAtivos } from "@/modules/cadastros/cartoes/queries";
import { listarFormasPagamento } from "@/modules/compras/_shared/pagamento";
import { OrdemDetalheView } from "@/modules/compras/ordens/components/ordem-detalhe";
import {
  buscarOrdem,
  listarSubcategorias,
  listarCentrosCusto,
  listarCondicoesPagamento,
  listarFornecedores,
  listarInsumos,
  listarParcelasCondicao,
  trilhaOrdem,
} from "@/modules/compras/ordens/queries";

/**
 * Aprovar a OC roda na função desta página e escreve em transação: lançamento,
 * parcelas da condição de pagamento, rateios por centro de custo e recebimento.
 * Com o teto padrão da Vercel (10 a 15s) uma OC grande morre no meio — e a
 * action não devolve nada, nem `{ erro }`, então a tela não consegue dizer por
 * quê. Mesma razão do `maxDuration` de /rh/folha/[id].
 */
export const maxDuration = 60;

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
    subcategorias,
    cartoes,
    parcelasCondicao,
    anexosIniciais,
  ] = await Promise.all([
    trilhaOrdem(id),
    listarFornecedores(),
    listarInsumos(),
    listarCentrosCusto(),
    listarCondicoesPagamento(),
    listarFormasPagamento(),
    listarSubcategorias(),
    listarCartoesAtivos(),
    ordem.condicaoPagamentoId
      ? listarParcelasCondicao(ordem.condicaoPagamentoId)
      : Promise.resolve([]),
    listarAnexosDoDocumento("ordem_compra", id),
  ]);

  const podeEditar = temPermissao(usuario, "compras.ordens", "editar");
  const podeAprovar = temPermissao(usuario, "compras.ordens", "aprovar");
  const podeDesaprovar = temPermissao(usuario, "compras.ordens", "desaprovar");
  const podeExcluir = temPermissao(usuario, "compras.ordens", "excluir");
  const podeVerLancamento = temPermissao(
    usuario,
    "financeiro.lancamentos",
    "ver",
  );
  const podeReceber = podeAprovar;

  return (
    <OrdemDetalheView
      podeVerLancamento={podeVerLancamento}
      ordem={ordem}
      trilha={trilha}
      fornecedores={fornecedores}
      insumos={insumos}
      centrosCusto={centrosCusto}
      condicoesPagamento={condicoesPagamento}
      formasPagamento={formasPagamento}
      subcategorias={subcategorias}
      cartoes={cartoes}
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
