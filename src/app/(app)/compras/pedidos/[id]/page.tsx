import { notFound } from "next/navigation";

import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { PedidoDetalhe } from "@/modules/compras/pedidos/components/pedido-detalhe";
import {
  buscarPedido,
  listarCentrosCusto,
  listarDepositos,
  listarInsumos,
  trilhaPedido,
} from "@/modules/compras/pedidos/queries";

export default async function PaginaPedidoDetalhe({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "compras.pedidos", "ver")) {
    notFound();
  }

  const pedido = await buscarPedido(id);
  if (!pedido) notFound();

  const [eventos, insumos, centrosCusto, depositos] = await Promise.all([
    trilhaPedido(id),
    listarInsumos(),
    listarCentrosCusto(),
    listarDepositos(),
  ]);

  const podeEditar = temPermissao(usuario, "compras.pedidos", "editar");
  const podeAprovar = temPermissao(usuario, "compras.pedidos", "aprovar");
  const podeDesaprovar = temPermissao(usuario, "compras.pedidos", "desaprovar");

  return (
    <PedidoDetalhe
      pedido={pedido}
      eventos={eventos}
      insumos={insumos}
      centrosCusto={centrosCusto}
      depositos={depositos}
      podeEditar={podeEditar}
      podeAprovar={podeAprovar}
      podeDesaprovar={podeDesaprovar}
    />
  );
}
