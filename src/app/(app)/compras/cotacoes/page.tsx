import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import {
  CotacoesAcoesCabecalho,
  CotacoesTabela,
} from "@/modules/compras/cotacoes/components/cotacoes-tabela";
import {
  listarCotacoes,
  listarPedidosAprovados,
} from "@/modules/compras/cotacoes/queries";

export default async function PaginaCotacoes() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "compras.cotacoes", "ver")) {
    notFound();
  }

  const [cotacoes, pedidos] = await Promise.all([
    listarCotacoes(),
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
        cotacoes={cotacoes}
        pedidos={pedidos}
        podeCriar={podeCriar}
      />
    </>
  );
}
