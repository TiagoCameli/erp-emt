import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { PedidosAcoesCabecalho } from "@/modules/frete/pedidos-material/components/pedidos-acoes-cabecalho";
import { PedidosTabela } from "@/modules/frete/pedidos-material/components/pedidos-tabela";
import {
  listarFornecedoresAtivos,
  listarInsumosAtivos,
  listarPedidos,
  type InsumoOpcao,
  type PedidoLinha,
} from "@/modules/frete/pedidos-material/queries";

const RECURSO = "frete.pedidos-material" as const;

// O export (exceljs) e a importação (uma RPC por pedido) rodam na função desta página: o
// teto padrão da Vercel (10 a 15s) não cobre (ver src/app/max-duration-de-quem-exporta.test.ts).
export const maxDuration = 60;

export default async function PaginaPedidosMaterial() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, RECURSO, "criar");
  const podeEditar = temPermissao(usuario, RECURSO, "editar");
  const podeExcluir = temPermissao(usuario, RECURSO, "excluir");
  const carregaFormulario = podeCriar || podeEditar;
  const podeRestaurar = temPermissao(usuario, "administracao.lixeira", "editar") && podeExcluir;

  const [pedidos, excluidos, fornecedores, insumos] = await Promise.all([
    listarPedidos(),
    podeRestaurar ? listarPedidos(true) : Promise.resolve<PedidoLinha[]>([]),
    listarFornecedoresAtivos(),
    carregaFormulario ? listarInsumosAtivos() : Promise.resolve<InsumoOpcao[]>([]),
  ]);

  return (
    <>
      <PageHeader
        modulo="Frete"
        titulo="Pedidos de material"
        descricao="Material comprado nas pedreiras. É a base do saldo na pedreira (pedido menos transportado)"
        acoes={<PedidosAcoesCabecalho podeCriar={podeCriar} fornecedores={fornecedores} insumos={insumos} />}
      />
      <PedidosTabela
        pedidos={pedidos}
        excluidos={excluidos}
        podeRestaurar={podeRestaurar}
        fornecedores={fornecedores}
        insumos={insumos}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
      />
    </>
  );
}
