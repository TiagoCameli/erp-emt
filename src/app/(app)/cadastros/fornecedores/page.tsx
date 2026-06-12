import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { FornecedoresAcoesCabecalho } from "@/modules/cadastros/fornecedores/components/fornecedores-acoes-cabecalho";
import { FornecedoresTabela } from "@/modules/cadastros/fornecedores/components/fornecedores-tabela";
import { listar } from "@/modules/cadastros/fornecedores/queries";

export default async function PaginaFornecedores() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "cadastros.fornecedores", "ver")) {
    notFound();
  }

  const fornecedores = await listar();

  const podeCriar = temPermissao(usuario, "cadastros.fornecedores", "criar");
  const podeEditar = temPermissao(usuario, "cadastros.fornecedores", "editar");
  const podeExcluir = temPermissao(usuario, "cadastros.fornecedores", "excluir");

  return (
    <>
      <PageHeader
        titulo="Fornecedores"
        descricao="Fornecedores de materiais, peças, combustíveis, serviços e fretes"
        acoes={<FornecedoresAcoesCabecalho podeCriar={podeCriar} />}
      />
      <FornecedoresTabela
        fornecedores={fornecedores}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
      />
    </>
  );
}
