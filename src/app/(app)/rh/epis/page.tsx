import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { EpisAcoesCabecalho } from "@/modules/rh/epis/components/epis-acoes-cabecalho";
import { EpisTabela } from "@/modules/rh/epis/components/epis-tabela";
import { listarEpis } from "@/modules/rh/epis/queries";
import { listarColaboradores } from "@/modules/rh/_shared/queries";

export default async function PaginaEpis() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "rh.epis", "ver")) {
    notFound();
  }

  const [epis, colaboradores] = await Promise.all([
    listarEpis(),
    listarColaboradores(),
  ]);

  const podeCriar = temPermissao(usuario, "rh.epis", "criar");
  const podeEditar = temPermissao(usuario, "rh.epis", "editar");
  const podeExcluir = temPermissao(usuario, "rh.epis", "excluir");

  return (
    <>
      <PageHeader
        titulo="EPI"
        descricao="Entrega de equipamentos de proteção individual por colaborador"
        acoes={
          podeCriar ? (
            <EpisAcoesCabecalho colaboradores={colaboradores} />
          ) : undefined
        }
      />
      <EpisTabela
        epis={epis}
        colaboradores={colaboradores}
        podeCriar={podeCriar}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
      />
    </>
  );
}
