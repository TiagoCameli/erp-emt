import { notFound } from "next/navigation";

import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarCartoesAtivos } from "@/modules/cadastros/cartoes/queries";
import { listarAnexosDoDocumento } from "@/modules/_shared/anexos/queries";
import {
  listarContasBancarias,
  trilhaParcelasDoLancamento,
} from "@/modules/financeiro/pagamentos/queries";
import { LancamentoDetalheView } from "@/modules/financeiro/lancamentos/components/lancamento-detalhe";
import {
  buscarLancamento,
  listarCategorias,
  listarCentrosCusto,
  listarClientes,
  listarCondicoesPagamento,
  listarFormasPagamento,
  listarFornecedores,
  trilhaLancamento,
} from "@/modules/financeiro/lancamentos/queries";

export default async function PaginaLancamentoDetalhe({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "financeiro.lancamentos", "ver")) {
    notFound();
  }

  const { id } = await params;
  const lancamento = await buscarLancamento(id);
  if (!lancamento) notFound();

  const [
    trilha,
    trilhaParcelas,
    categorias,
    fornecedores,
    clientes,
    centrosCusto,
    formasPagamento,
    cartoes,
    condicoesPagamento,
    anexos,
    contas,
  ] = await Promise.all([
    trilhaLancamento(id),
    trilhaParcelasDoLancamento(id),
    listarCategorias(),
    listarFornecedores(),
    listarClientes(),
    listarCentrosCusto(),
    listarFormasPagamento(),
    listarCartoesAtivos(),
    listarCondicoesPagamento(),
    listarAnexosDoDocumento("lancamento", id),
    listarContasBancarias(),
  ]);

  const podeEditar = temPermissao(usuario, "financeiro.lancamentos", "editar");
  const podeExcluir = temPermissao(
    usuario,
    "financeiro.lancamentos",
    "excluir",
  );

  return (
    <LancamentoDetalheView
      lancamento={lancamento}
      trilha={trilha}
      trilhaParcelas={trilhaParcelas}
      anexos={anexos}
      categorias={categorias}
      fornecedores={fornecedores}
      clientes={clientes}
      centrosCusto={centrosCusto}
      formasPagamento={formasPagamento}
      cartoes={cartoes}
      condicoesPagamento={condicoesPagamento}
      contas={contas}
      podeEditar={podeEditar}
      podeExcluir={podeExcluir}
    />
  );
}
