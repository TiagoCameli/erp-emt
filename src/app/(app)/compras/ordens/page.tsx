import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { ROTULO_STATUS_OC, type StatusOC } from "@/modules/compras/_shared/formato";
import { listarCartoesAtivos } from "@/modules/cadastros/cartoes/queries";
import { listarFormasPagamento } from "@/modules/compras/_shared/pagamento";
import {
  lerParametrosLista,
  parametroData,
  parametroUuid,
  parametroValido,
} from "@/modules/compras/_shared/lista";
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
  const {
    pagina,
    tamanho,
    busca,
    fornecedorId,
    de,
    ate,
    competenciaDe,
    competenciaAte,
  } = lerParametrosLista(params);
  const status = parametroValido(params.status, STATUS_VALIDOS);

  // Filtros só desta tela. Parâmetro inválido é ignorado, nunca vai pro banco.
  const categoriaId = parametroUuid(params.categoria);
  const formaPagamentoId = parametroUuid(params.forma);
  const condicaoPagamentoId = parametroUuid(params.condicao);
  const centroCustoId = parametroUuid(params.centro);
  const insumoId = parametroUuid(params.insumo);
  const nota = parametroValido(params.nota, VALORES_NOTA_OC);
  const origem = parametroValido(params.origem, VALORES_ORIGEM_OC);
  const autoria = parametroValido(params.autoria, VALORES_AUTORIA_OC);
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

  const [
    { itens, total },
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
    listarOrdens({
      pagina,
      tamanho,
      status,
      busca,
      fornecedorId,
      de,
      ate,
      competenciaDe,
      competenciaAte,
      categoriaId,
      formaPagamentoId,
      condicaoPagamentoId,
      valorDe: faixaValor.valorDe,
      valorAte: faixaValor.valorAte,
      criadaDe,
      criadaAte,
      centroCustoId,
      insumoId,
      nota,
      origem,
      autoria,
      usuarioLogadoId: usuario.id,
    }),
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
        status={status ?? ""}
        busca={busca ?? ""}
        fornecedorId={fornecedorId ?? ""}
        de={de ?? ""}
        ate={ate ?? ""}
        competenciaDe={competenciaDe ?? ""}
        competenciaAte={competenciaAte ?? ""}
        categoriaId={categoriaId ?? ""}
        formaPagamentoId={formaPagamentoId ?? ""}
        condicaoPagamentoId={condicaoPagamentoId ?? ""}
        criadaDe={criadaDe ?? ""}
        criadaAte={criadaAte ?? ""}
        centroCustoId={centroCustoId ?? ""}
        insumoId={insumoId ?? ""}
        nota={nota ?? ""}
        origem={origem ?? ""}
        autoria={autoria ?? ""}
        fornecedores={fornecedores}
        categorias={categorias}
        formasPagamento={formasPagamento}
        condicoesPagamento={condicoesPagamento}
        centrosCusto={centrosCusto}
        insumos={insumos}
        idUsuario={usuario.id}
      />
    </NovaOrdemProvider>
  );
}
