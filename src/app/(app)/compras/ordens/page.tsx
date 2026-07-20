import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { ROTULO_STATUS_OC, type StatusOC } from "@/modules/compras/_shared/formato";
import {
  lerParametrosLista,
  parametroValido,
} from "@/modules/compras/_shared/lista";
import { OrdensAcoesCabecalho } from "@/modules/compras/ordens/components/ordens-acoes-cabecalho";
import { OrdensTabela } from "@/modules/compras/ordens/components/ordens-tabela";
import {
  listarCentrosCusto,
  listarCotacoesFinalizadas,
  listarFornecedores,
  listarInsumos,
  listarOrdens,
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
  const { pagina, tamanho, busca } = lerParametrosLista(params);
  const status = parametroValido(params.status, STATUS_VALIDOS);

  const [
    { itens, total },
    fornecedores,
    insumos,
    centrosCusto,
    cotacoes,
  ] = await Promise.all([
    listarOrdens({ pagina, tamanho, status, busca }),
    listarFornecedores(),
    listarInsumos(),
    listarCentrosCusto(),
    listarCotacoesFinalizadas(),
  ]);

  return (
    <>
      <PageHeader
        titulo="Ordens de compra"
        descricao="Emita a OC, envie para aprovação e gere o lançamento financeiro previsto"
        acoes={
          <OrdensAcoesCabecalho
            podeCriar={podeCriar}
            fornecedores={fornecedores}
            insumos={insumos}
            centrosCusto={centrosCusto}
            cotacoes={cotacoes}
          />
        }
      />
      <OrdensTabela
        ordens={itens}
        total={total}
        pagina={pagina}
        tamanho={tamanho}
        status={status ?? ""}
        busca={busca ?? ""}
      />
    </>
  );
}
