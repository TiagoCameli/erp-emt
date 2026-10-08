import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { ROTULO_STATUS_OC, type StatusOC } from "@/modules/compras/_shared/formato";
import { listarCartoesAtivos } from "@/modules/cadastros/cartoes/queries";
import { listarFormasPagamento } from "@/modules/compras/_shared/pagamento";
import {
  lerParametrosLista,
  parametroData,
} from "@/modules/compras/_shared/lista";
import {
  lerCatalogoDaUrl,
  lerUuidsDaUrl,
} from "@/modules/financeiro/_shared/listas-na-url";
import {
  lerFaixaValor,
  VALORES_AUTORIA_OC,
  VALORES_NOTA_OC,
  VALORES_ORIGEM_OC,
} from "@/modules/compras/ordens/filtros";
import {
  BotaoNovaOrdem,
  NovaOrdemProvider,
} from "@/modules/compras/ordens/components/nova-ordem-provider";
import { OrdensTabela } from "@/modules/compras/ordens/components/ordens-tabela";
import {
  listarCategoriasCusto,
  listarSubcategorias,
  listarCentrosCusto,
  listarCondicoesPagamento,
  listarFornecedores,
  listarInsumos,
  listarOrdens,
  facetasOrdens,
  montarPrefillDaCotacao,
} from "@/modules/compras/ordens/queries";

const STATUS_VALIDOS = Object.keys(ROTULO_STATUS_OC) as StatusOC[];

export default async function PaginaOrdens({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "compras.ordens", "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, "compras.ordens", "criar");
  // Governa o botão de exclusão em lote da barra de seleção. A Server Action e a
  // RPC checam de novo: aqui a permissão só esconde o que a pessoa não pode.
  const podeExcluir = temPermissao(usuario, "compras.ordens", "excluir");

  const params = await searchParams;
  const { pagina, tamanho, busca, de, ate, competenciaDe, competenciaAte } =
    lerParametrosLista(params);

  // Todo filtro de seleção é lista (`?fornecedor=id1,id2`), no formato de
  // `listas-na-url`. Link antigo com um valor só continua valendo: é uma lista
  // de um. Parâmetro inválido é descartado, nunca vai pro banco.
  const status = lerCatalogoDaUrl(params.status, STATUS_VALIDOS);
  const fornecedorIds = lerUuidsDaUrl(params.fornecedor);
  const categoriaIds = lerUuidsDaUrl(params.categoria);
  const formaPagamentoIds = lerUuidsDaUrl(params.forma);
  const condicaoPagamentoIds = lerUuidsDaUrl(params.condicao);
  const centroCustoIds = lerUuidsDaUrl(params.centro);
  const insumoIds = lerUuidsDaUrl(params.insumo);
  const nota = lerCatalogoDaUrl(params.nota, VALORES_NOTA_OC);
  const origem = lerCatalogoDaUrl(params.origem, VALORES_ORIGEM_OC);
  const autoria = lerCatalogoDaUrl(params.autoria, VALORES_AUTORIA_OC);
  const faixaValor = lerFaixaValor(params.valorDe, params.valorAte);
  let criadaDe = parametroData(params.criadaDe);
  let criadaAte = parametroData(params.criadaAte);
  // Período invertido é trocado de lado, senão a lista vem vazia sem explicação.
  if (criadaDe && criadaAte && criadaDe > criadaAte) {
    [criadaDe, criadaAte] = [criadaAte, criadaDe];
  }

  // "Gerar OC" numa cotação finalizada manda o usuário para cá com
  // ?gerar=<cotacaoId>; montamos o prefill (fornecedor vencedor, condição/
  // forma e itens) para o drawer abrir preenchido. Só com permissão de criar.
  const gerarCotacaoId =
    typeof params.gerar === "string" ? params.gerar : undefined;

  const filtrosLista = {
    status,
    busca,
    fornecedorIds,
    de,
    ate,
    competenciaDe,
    competenciaAte,
    categoriaIds,
    formaPagamentoIds,
    condicaoPagamentoIds,
    valorDe: faixaValor.valorDe,
    valorAte: faixaValor.valorAte,
    criadaDe,
    criadaAte,
    centroCustoIds,
    insumoIds,
    nota,
    origem,
    autoria,
    usuarioLogadoId: usuario.id,
  };

  const [
    { itens, total },
    facetas,
    fornecedores,
    insumos,
    centrosCusto,
    condicoesPagamento,
    formasPagamento,
    categorias,
    subcategorias,
    cartoes,
    prefill,
  ] = await Promise.all([
    listarOrdens({ pagina, tamanho, ...filtrosLista }),
    facetasOrdens(filtrosLista),
    listarFornecedores(),
    listarInsumos(),
    listarCentrosCusto(),
    listarCondicoesPagamento(),
    listarFormasPagamento(),
    listarCategoriasCusto(),
    listarSubcategorias(),
    listarCartoesAtivos(),
    gerarCotacaoId && podeCriar
      ? montarPrefillDaCotacao(gerarCotacaoId)
      : Promise.resolve(null),
  ]);

  return (
    <NovaOrdemProvider
      podeCriar={podeCriar}
      fornecedores={fornecedores}
      insumos={insumos}
      centrosCusto={centrosCusto}
      condicoesPagamento={condicoesPagamento}
      formasPagamento={formasPagamento}
      subcategorias={subcategorias}
      cartoes={cartoes}
      prefill={prefill}
    >
      <PageHeader
        modulo="Compras"
        titulo="Ordens de compra"
        descricao="Emita a OC, envie para aprovação e gere o lançamento financeiro previsto"
        acoes={<BotaoNovaOrdem />}
      />
      <OrdensTabela
        podeExcluir={podeExcluir}
        ordens={itens}
        total={total}
        pagina={pagina}
        tamanho={tamanho}
        status={status}
        busca={busca ?? ""}
        fornecedorIds={fornecedorIds}
        de={de ?? ""}
        ate={ate ?? ""}
        competenciaDe={competenciaDe ?? ""}
        competenciaAte={competenciaAte ?? ""}
        categoriaIds={categoriaIds}
        formaPagamentoIds={formaPagamentoIds}
        condicaoPagamentoIds={condicaoPagamentoIds}
        criadaDe={criadaDe ?? ""}
        criadaAte={criadaAte ?? ""}
        centroCustoIds={centroCustoIds}
        insumoIds={insumoIds}
        nota={nota}
        origem={origem}
        autoria={autoria}
        fornecedores={fornecedores}
        categorias={categorias}
        formasPagamento={formasPagamento}
        condicoesPagamento={condicoesPagamento}
        centrosCusto={centrosCusto}
        insumos={insumos}
        idUsuario={usuario.id}
        facetas={facetas}
      />
    </NovaOrdemProvider>
  );
}
