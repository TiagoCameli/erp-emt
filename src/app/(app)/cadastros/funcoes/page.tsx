import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { FuncoesAcoesCabecalho } from "@/modules/cadastros/funcoes/components/funcoes-acoes-cabecalho";
import { FuncoesLista } from "@/modules/cadastros/funcoes/components/funcoes-lista";
import { listarFuncoes } from "@/modules/cadastros/funcoes/queries";

export default async function PaginaFuncoes() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "cadastros.funcoes", "ver")) {
    notFound();
  }

  const funcoes = await listarFuncoes();

  const podeCriar = temPermissao(usuario, "cadastros.funcoes", "criar");
  const podeEditar = temPermissao(usuario, "cadastros.funcoes", "editar");
  const podeExcluir = temPermissao(usuario, "cadastros.funcoes", "excluir");

  return (
    <>
      <PageHeader
        titulo="Funções"
        descricao="Cargos usados no cadastro de colaboradores, com salário base e CBO"
        acoes={<FuncoesAcoesCabecalho podeCriar={podeCriar} />}
      />
      <FuncoesLista
        funcoes={funcoes}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
      />
    </>
  );
}
