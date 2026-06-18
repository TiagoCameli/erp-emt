import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { OrdensAcoesCabecalho } from "@/modules/compras/ordens/components/ordens-acoes-cabecalho";
import { OrdensTabela } from "@/modules/compras/ordens/components/ordens-tabela";
import {
  listarCentrosCusto,
  listarCotacoesFinalizadas,
  listarDepositos,
  listarFornecedores,
  listarInsumos,
  listarOrdens,
  listarPedidosAprovados,
} from "@/modules/compras/ordens/queries";

export default async function PaginaOrdens() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "compras.ordens", "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, "compras.ordens", "criar");

  const [
    ordens,
    fornecedores,
    insumos,
    centrosCusto,
    depositos,
    pedidos,
    cotacoes,
  ] = await Promise.all([
    listarOrdens(),
    listarFornecedores(),
    listarInsumos(),
    listarCentrosCusto(),
    listarDepositos(),
    listarPedidosAprovados(),
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
            depositos={depositos}
            pedidos={pedidos}
            cotacoes={cotacoes}
          />
        }
      />
      <OrdensTabela ordens={ordens} />
    </>
  );
}
