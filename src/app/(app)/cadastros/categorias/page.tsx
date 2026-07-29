import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import {
  importar,
  validarImport,
} from "@/modules/cadastros/categorias/actions";
import { CategoriasTabela } from "@/modules/cadastros/categorias/components/categorias-tabela";
import {
  listarGrupos,
  listarPorGrupo,
} from "@/modules/cadastros/categorias/queries";
import { ImportarCadastro } from "@/modules/cadastros/_shared/importar-cadastro";

export default async function PaginaCategorias() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "cadastros.categorias", "ver")) {
    notFound();
  }

  const [grupos, opcoesGrupo] = await Promise.all([
    listarPorGrupo(),
    listarGrupos(),
  ]);

  const podeCriar = temPermissao(usuario, "cadastros.categorias", "criar");
  const podeEditar = temPermissao(usuario, "cadastros.categorias", "editar");
  const podeExcluir = temPermissao(usuario, "cadastros.categorias", "excluir");

  return (
    <>
      <PageHeader
        titulo="Categorias"
        descricao="Dois níveis: 4 grupos fixos (Material, Mão de obra, Equipamentos, Outros) e as subcategorias dentro de cada um. O insumo aponta para a subcategoria."
        acoes={
          podeCriar ? (
            <>
              <ImportarCadastro
                titulo="Importar subcategorias"
                modeloHref="/cadastros/categorias/modelo"
                validarAction={validarImport}
                importarAction={importar}
              />
            </>
          ) : undefined
        }
      />
      <CategoriasTabela
        grupos={grupos}
        opcoesGrupo={opcoesGrupo}
        podeCriar={podeCriar}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
      />
    </>
  );
}
