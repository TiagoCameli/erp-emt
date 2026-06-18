import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { UnidadesAcoesCabecalho } from "@/modules/cadastros/unidades/components/unidades-acoes-cabecalho";
import { UnidadesLista } from "@/modules/cadastros/unidades/components/unidades-lista";
import { listar } from "@/modules/cadastros/unidades/queries";

export default async function PaginaUnidades() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "cadastros.unidades", "ver")) {
    notFound();
  }

  const unidades = await listar();

  const podeCriar = temPermissao(usuario, "cadastros.unidades", "criar");
  const podeEditar = temPermissao(usuario, "cadastros.unidades", "editar");
  const podeExcluir = temPermissao(usuario, "cadastros.unidades", "excluir");

  return (
    <>
      <PageHeader
        titulo="Unidades de medida"
        descricao="Unidades usadas em insumos, medições e movimentações"
        acoes={<UnidadesAcoesCabecalho podeCriar={podeCriar} />}
      />
      <UnidadesLista
        unidades={unidades}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
      />
    </>
  );
}
