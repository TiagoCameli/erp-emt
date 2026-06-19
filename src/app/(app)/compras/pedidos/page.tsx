import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { PedidosTabela } from "@/modules/compras/pedidos/components/pedidos-tabela";
import {
  listarCentrosCusto,
  listarDepositos,
  listarInsumos,
  listarPedidos,
} from "@/modules/compras/pedidos/queries";

export default async function PaginaPedidos() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "compras.pedidos", "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, "compras.pedidos", "criar");

  const [pedidos, insumos, centrosCusto, depositos] = await Promise.all([
    listarPedidos(),
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
        pedidos={pedidos}
        insumos={insumos}
        centrosCusto={centrosCusto}
        depositos={depositos}
        podeCriar={podeCriar}
      />
    </>
  );
}
