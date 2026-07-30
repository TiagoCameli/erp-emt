import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { competenciaParaMes } from "@/lib/formatadores";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { ROTULO_STATUS_OC, type StatusOC } from "@/modules/compras/_shared/formato";
import { listarFormasPagamento } from "@/modules/compras/_shared/pagamento";
import {
  lerParametrosLista,
  parametroValido,
} from "@/modules/compras/_shared/lista";
import {
  BotaoNovaOrdem,
  NovaOrdemProvider,
} from "@/modules/compras/ordens/components/nova-ordem-provider";
import { OrdensTabela } from "@/modules/compras/ordens/components/ordens-tabela";
import {
  listarCategoriasCusto,
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

  const params = await searchParams;
  const { pagina, tamanho, busca, fornecedorId, de, ate, mesCompetencia } =
    lerParametrosLista(params);
  const status = parametroValido(params.status, STATUS_VALIDOS);

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
      mesCompetencia,
    }),
    listarFornecedores(),
    listarInsumos(),
    listarCentrosCusto(),
    listarCondicoesPagamento(),
    listarFormasPagamento(),
    listarCategoriasCusto(),
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
      categorias={categorias}
      prefill={prefill}
    >
      <PageHeader
        titulo="Ordens de compra"
        descricao="Emita a OC, envie para aprovação e gere o lançamento financeiro previsto"
        acoes={<BotaoNovaOrdem />}
      />
      <OrdensTabela
        ordens={itens}
        total={total}
        pagina={pagina}
        tamanho={tamanho}
        status={status ?? ""}
        busca={busca ?? ""}
        fornecedorId={fornecedorId ?? ""}
        de={de ?? ""}
        ate={ate ?? ""}
        mes={competenciaParaMes(mesCompetencia ?? "")}
        fornecedores={fornecedores}
        idUsuario={usuario.id}
      />
    </NovaOrdemProvider>
  );
}
