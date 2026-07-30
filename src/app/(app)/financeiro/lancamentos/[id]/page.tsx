import { notFound } from "next/navigation";

import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarAnexosDoDocumento } from "@/modules/_shared/anexos/queries";
import { listarContasBancarias } from "@/modules/financeiro/pagamentos/queries";
import { LancamentoDetalheView } from "@/modules/financeiro/lancamentos/components/lancamento-detalhe";
import {
  buscarLancamento,
  listarCategorias,
  listarCentrosCusto,
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
    categorias,
    fornecedores,
    centrosCusto,
    formasPagamento,
    anexos,
    contas,
  ] = await Promise.all([
    trilhaLancamento(id),
    listarCategorias(),
    listarFornecedores(),
    listarCentrosCusto(),
    listarFormasPagamento(),
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
      anexos={anexos}
      categorias={categorias}
      fornecedores={fornecedores}
      centrosCusto={centrosCusto}
      formasPagamento={formasPagamento}
      contas={contas}
      podeEditar={podeEditar}
      podeExcluir={podeExcluir}
    />
  );
}
