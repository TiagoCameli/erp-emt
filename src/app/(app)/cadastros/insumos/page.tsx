import { notFound } from "next/navigation";

import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { InsumosTabela } from "@/modules/cadastros/insumos/components/insumos-tabela";
import {
  listar,
  listarCategorias,
  listarUnidades,
} from "@/modules/cadastros/insumos/queries";

export default async function PaginaInsumos() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "cadastros.insumos", "ver")) {
    notFound();
  }

  const [insumos, categorias, unidades] = await Promise.all([
    listar(),
    listarCategorias(),
    listarUnidades(),
  ]);

  return (
    <InsumosTabela
      insumos={insumos}
      categorias={categorias}
      unidades={unidades}
      podeCriar={temPermissao(usuario, "cadastros.insumos", "criar")}
      podeEditar={temPermissao(usuario, "cadastros.insumos", "editar")}
      podeExcluir={temPermissao(usuario, "cadastros.insumos", "excluir")}
    />
  );
}
