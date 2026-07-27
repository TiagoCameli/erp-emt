import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { EncargosAcoesCabecalho } from "@/modules/rh/encargos/components/encargos-acoes-cabecalho";
import { EncargosLista } from "@/modules/rh/encargos/components/encargos-lista";
import { listarEncargos } from "@/modules/rh/encargos/queries";

export default async function PaginaEncargos() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "rh.encargos", "ver")) {
    notFound();
  }

  const encargos = await listarEncargos();

  const podeCriar = temPermissao(usuario, "rh.encargos", "criar");
  const podeEditar = temPermissao(usuario, "rh.encargos", "editar");
  const podeExcluir = temPermissao(usuario, "rh.encargos", "excluir");

  return (
    <>
      <PageHeader
        titulo="Encargos da folha"
        descricao="Encargos e alíquotas usados no cálculo da folha de pagamento"
        acoes={<EncargosAcoesCabecalho podeCriar={podeCriar} />}
      />
      <EncargosLista
        encargos={encargos}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
      />
    </>
  );
}
