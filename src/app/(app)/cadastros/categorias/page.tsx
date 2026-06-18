import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import {
  importar,
  validarImport,
} from "@/modules/cadastros/categorias/actions";
import { CategoriasAcoesCabecalho } from "@/modules/cadastros/categorias/components/categorias-acoes-cabecalho";
import { CategoriasTabela } from "@/modules/cadastros/categorias/components/categorias-tabela";
import { listar } from "@/modules/cadastros/categorias/queries";
import { ImportarCadastro } from "@/modules/cadastros/_shared/importar-cadastro";

export default async function PaginaCategorias() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "cadastros.categorias", "ver")) {
    notFound();
  }

  const categorias = await listar();

  const podeCriar = temPermissao(usuario, "cadastros.categorias", "criar");
  const podeEditar = temPermissao(usuario, "cadastros.categorias", "editar");
  const podeExcluir = temPermissao(usuario, "cadastros.categorias", "excluir");

  return (
    <>
      <PageHeader
        titulo="Categorias"
        descricao="Categorias de insumo para agrupar materiais, peças e serviços"
        acoes={
          podeCriar ? (
            <>
              <ImportarCadastro
                titulo="Importar categorias"
                modeloHref="/cadastros/categorias/modelo"
                validarAction={validarImport}
                importarAction={importar}
              />
              <CategoriasAcoesCabecalho />
            </>
          ) : undefined
        }
      />
      <CategoriasTabela
        categorias={categorias}
        podeCriar={podeCriar}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
      />
    </>
  );
}
