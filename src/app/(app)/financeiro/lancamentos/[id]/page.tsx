import { notFound } from "next/navigation";

import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { LancamentoDetalheView } from "@/modules/financeiro/lancamentos/components/lancamento-detalhe";
import {
  buscarLancamento,
  listarCategorias,
  listarCentrosCusto,
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

  const [trilha, categorias, fornecedores, centrosCusto] = await Promise.all([
    trilhaLancamento(id),
    listarCategorias(),
    listarFornecedores(),
    listarCentrosCusto(),
  ]);

  const podeEditar = temPermissao(usuario, "financeiro.lancamentos", "editar");

  return (
    <LancamentoDetalheView
      lancamento={lancamento}
      trilha={trilha}
      categorias={categorias}
      fornecedores={fornecedores}
      centrosCusto={centrosCusto}
      podeEditar={podeEditar}
    />
  );
}
