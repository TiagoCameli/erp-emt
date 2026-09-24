import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { LocalidadesAcoesCabecalho } from "@/modules/cadastros/localidades/components/localidades-acoes-cabecalho";
import { LocalidadesLista } from "@/modules/cadastros/localidades/components/localidades-lista";
import { listar, listarFornecedoresAtivos, type FornecedorOpcao } from "@/modules/cadastros/localidades/queries";

export default async function PaginaLocalidades() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "cadastros.localidades", "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, "cadastros.localidades", "criar");
  const podeEditar = temPermissao(usuario, "cadastros.localidades", "editar");
  const podeExcluir = temPermissao(usuario, "cadastros.localidades", "excluir");

  const [localidades, fornecedores] = await Promise.all([
    listar(),
    podeCriar || podeEditar ? listarFornecedoresAtivos() : Promise.resolve<FornecedorOpcao[]>([]),
  ]);

  return (
    <>
      <PageHeader
        modulo="Cadastros"
        titulo="Localidades"
        descricao="Origem e destino do frete: pedreira, usina, canteiro"
        acoes={<LocalidadesAcoesCabecalho podeCriar={podeCriar} fornecedores={fornecedores} />}
      />
      <LocalidadesLista
        localidades={localidades}
        fornecedores={fornecedores}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
      />
    </>
  );
}
