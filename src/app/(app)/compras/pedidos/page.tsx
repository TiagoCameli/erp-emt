import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import {
  lerParametrosLista,
  parametroValido,
} from "@/modules/compras/_shared/lista";
import { PedidosTabela } from "@/modules/compras/pedidos/components/pedidos-tabela";
import {
  listarCentrosCusto,
  listarDepositos,
  listarInsumos,
  listarPedidos,
} from "@/modules/compras/pedidos/queries";
import { STATUS_PEDIDO } from "@/modules/compras/pedidos/schemas";

export default async function PaginaPedidos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "compras.pedidos", "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, "compras.pedidos", "criar");

  const params = await searchParams;
  const { pagina, tamanho, busca } = lerParametrosLista(params);
  const status = parametroValido(params.status, STATUS_PEDIDO);

  const [{ itens, total }, insumos, centrosCusto, depositos] =
    await Promise.all([
      listarPedidos({ pagina, tamanho, status, busca }),
      listarInsumos(),
      listarCentrosCusto(),
      listarDepositos(),
    ]);

  return (
    <>
      <PageHeader
        titulo="Pedidos"
        descricao="Pedidos de compra. Monte o pedido, envie para aprovação e acompanhe o fluxo"
      />
      <PedidosTabela
        pedidos={itens}
        total={total}
        pagina={pagina}
        tamanho={tamanho}
        status={status ?? ""}
        busca={busca ?? ""}
        insumos={insumos}
        centrosCusto={centrosCusto}
        depositos={depositos}
        podeCriar={podeCriar}
      />
    </>
  );
}
