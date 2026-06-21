import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { AdiantamentosAcoesCabecalho } from "@/modules/rh/adiantamentos/components/adiantamentos-acoes-cabecalho";
import { AdiantamentosTabela } from "@/modules/rh/adiantamentos/components/adiantamentos-tabela";
import { listarAdiantamentos } from "@/modules/rh/adiantamentos/queries";
import { listarColaboradores } from "@/modules/rh/_shared/queries";

export default async function PaginaAdiantamentos() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "rh.adiantamentos", "ver")) {
    notFound();
  }

  const [adiantamentos, colaboradores] = await Promise.all([
    listarAdiantamentos(),
    listarColaboradores(),
  ]);

  const podeCriar = temPermissao(usuario, "rh.adiantamentos", "criar");
  const podeEditar = temPermissao(usuario, "rh.adiantamentos", "editar");
  const podeExcluir = temPermissao(usuario, "rh.adiantamentos", "excluir");

  return (
    <>
      <PageHeader
        titulo="Adiantamentos"
        descricao="Adiantamentos por colaborador e competência, descontados na folha gerencial"
        acoes={
          podeCriar ? (
            <AdiantamentosAcoesCabecalho colaboradores={colaboradores} />
          ) : undefined
        }
      />
      <AdiantamentosTabela
        adiantamentos={adiantamentos}
        colaboradores={colaboradores}
        podeCriar={podeCriar}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
      />
    </>
  );
}
