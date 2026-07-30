import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import {
  lerParametrosLista,
  parametroUuid,
  parametroValido,
} from "@/modules/compras/_shared/lista";
import {
  CotacoesAcoesCabecalho,
  CotacoesTabela,
} from "@/modules/compras/cotacoes/components/cotacoes-tabela";
import {
  listarCategoriasCusto,
  listarCotacoes,
  listarFornecedores,
  listarInsumos,
} from "@/modules/compras/cotacoes/queries";
import {
  AUTORIA_COTACAO,
  OC_GERADA_COTACAO,
  STATUS_COTACAO,
} from "@/modules/compras/cotacoes/schemas";

export default async function PaginaCotacoes({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "compras.cotacoes", "ver")) {
    notFound();
  }

  const params = await searchParams;
  const { pagina, tamanho, busca, fornecedorId, de, ate } =
    lerParametrosLista(params);
  const status = parametroValido(params.status, STATUS_COTACAO);
  const categoriaId = parametroUuid(params.categoria);
  const vencedorId = parametroUuid(params.vencedor);
  const insumoId = parametroUuid(params.insumo);
  const autoria = parametroValido(params.autor, AUTORIA_COTACAO);
  // Sem permissão de ver OC o filtro nem aparece na tela, então o parâmetro é
  // descartado aqui também: URL colada na mão não vira lista errada.
  const podeVerOrdens = temPermissao(usuario, "compras.ordens", "ver");
  const ocGerada = podeVerOrdens
    ? parametroValido(params.oc, OC_GERADA_COTACAO)
    : undefined;

  const [{ itens, total }, categorias, fornecedores, insumos] =
    await Promise.all([
      listarCotacoes({
        pagina,
        tamanho,
        status,
        busca,
        de,
        ate,
        categoriaId,
        fornecedorId,
        vencedorId,
        insumoId,
        ocGerada,
        autoria,
        usuarioId: usuario.id,
      }),
      listarCategoriasCusto(),
      listarFornecedores(),
      listarInsumos(),
    ]);

  const podeCriar = temPermissao(usuario, "compras.cotacoes", "criar");

  return (
    <>
      <PageHeader
        titulo="Cotações"
        descricao="Compare preços de fornecedores e escolha o vencedor"
        acoes={
          <CotacoesAcoesCabecalho
            podeCriar={podeCriar}
            categorias={categorias}
          />
        }
      />
      <CotacoesTabela
        cotacoes={itens}
        total={total}
        pagina={pagina}
        tamanho={tamanho}
        status={status ?? ""}
        busca={busca ?? ""}
        de={de ?? ""}
        ate={ate ?? ""}
        categoriaId={categoriaId ?? ""}
        fornecedorId={fornecedorId ?? ""}
        vencedorId={vencedorId ?? ""}
        insumoId={insumoId ?? ""}
        ocGerada={ocGerada ?? ""}
        autoria={autoria ?? ""}
        podeCriar={podeCriar}
        podeVerOrdens={podeVerOrdens}
        categorias={categorias}
        fornecedores={fornecedores}
        insumos={insumos}
        idUsuario={usuario.id}
      />
    </>
  );
}
