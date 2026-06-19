import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { CategoriasAcoesCabecalho } from "@/modules/financeiro/categorias/components/categorias-acoes-cabecalho";
import { CategoriasTabela } from "@/modules/financeiro/categorias/components/categorias-tabela";
import {
  listarCategorias,
  listarCategoriasPai,
} from "@/modules/financeiro/categorias/queries";

export default async function PaginaCategoriasFinanceiras() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "financeiro.categorias", "ver")) {
    notFound();
  }

  const [categorias, categoriasPai] = await Promise.all([
    listarCategorias(),
    listarCategoriasPai(),
  ]);

  const podeCriar = temPermissao(usuario, "financeiro.categorias", "criar");
  const podeEditar = temPermissao(usuario, "financeiro.categorias", "editar");

  return (
    <>
      <PageHeader
        titulo="Categorias"
        descricao="Plano de contas gerencial de receitas e despesas"
        acoes={
          podeCriar ? (
            <CategoriasAcoesCabecalho categoriasPai={categoriasPai} />
          ) : undefined
        }
      />
      <CategoriasTabela
        categorias={categorias}
        categoriasPai={categoriasPai}
        podeCriar={podeCriar}
        podeEditar={podeEditar}
      />
    </>
  );
}
