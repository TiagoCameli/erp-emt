import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import {
  lerParametrosLista,
  parametroValido,
} from "@/modules/compras/_shared/lista";
import {
  CotacoesAcoesCabecalho,
  CotacoesTabela,
} from "@/modules/compras/cotacoes/components/cotacoes-tabela";
import {
  listarCotacoes,
  listarPedidosAprovados,
} from "@/modules/compras/cotacoes/queries";
import { STATUS_COTACAO } from "@/modules/compras/cotacoes/schemas";

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
  const { pagina, tamanho, busca } = lerParametrosLista(params);
  const status = parametroValido(params.status, STATUS_COTACAO);

  const [{ itens, total }, pedidos] = await Promise.all([
    listarCotacoes({ pagina, tamanho, status, busca }),
    listarPedidosAprovados(),
  ]);

  const podeCriar = temPermissao(usuario, "compras.cotacoes", "criar");

  return (
    <>
      <PageHeader
        titulo="Cotações"
        descricao="Compare preços de fornecedores e escolha o vencedor"
        acoes={
          <CotacoesAcoesCabecalho pedidos={pedidos} podeCriar={podeCriar} />
        }
      />
      <CotacoesTabela
        cotacoes={itens}
        total={total}
        pagina={pagina}
        tamanho={tamanho}
        status={status ?? ""}
        busca={busca ?? ""}
        pedidos={pedidos}
        podeCriar={podeCriar}
      />
    </>
  );
}
