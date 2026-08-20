import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { CategoriasAcoesCabecalho } from "@/modules/cadastros/categorias-financeiras/components/categorias-acoes-cabecalho";
import { CategoriasTabela } from "@/modules/cadastros/categorias-financeiras/components/categorias-tabela";
import {
  listarCategorias,
  listarCategoriasPai,
} from "@/modules/cadastros/categorias-financeiras/queries";

export default async function PaginaCategoriasFinanceiras() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "cadastros.categorias-financeiras", "ver")) {
    notFound();
  }

  const [categorias, categoriasPai] = await Promise.all([
    listarCategorias(),
    listarCategoriasPai(),
  ]);

  const podeCriar = temPermissao(usuario, "cadastros.categorias-financeiras", "criar");
  const podeEditar = temPermissao(usuario, "cadastros.categorias-financeiras", "editar");

  return (
    <>
      <PageHeader
        modulo="Financeiro"
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
