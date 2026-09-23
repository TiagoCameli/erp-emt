import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { TiposOleoAcoesCabecalho } from "@/modules/manutencao/tipos-oleo/components/tipos-oleo-acoes-cabecalho";
import { TiposOleoLista } from "@/modules/manutencao/tipos-oleo/components/tipos-oleo-lista";
import { listar } from "@/modules/manutencao/tipos-oleo/queries";

export default async function PaginaTiposOleo() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "manutencao.tipos-oleo", "ver")) {
    notFound();
  }

  const tipos = await listar();

  const podeCriar = temPermissao(usuario, "manutencao.tipos-oleo", "criar");
  const podeEditar = temPermissao(usuario, "manutencao.tipos-oleo", "editar");
  const podeExcluir = temPermissao(usuario, "manutencao.tipos-oleo", "excluir");

  return (
    <>
      <PageHeader
        modulo="Manutenção"
        titulo="Tipos de óleo"
        descricao="Óleos e graxas usados na manutenção, com a aplicação e o intervalo de troca"
        acoes={<TiposOleoAcoesCabecalho podeCriar={podeCriar} />}
      />
      <TiposOleoLista tipos={tipos} podeEditar={podeEditar} podeExcluir={podeExcluir} />
    </>
  );
}
