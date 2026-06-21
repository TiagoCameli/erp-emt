import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { FolhaAcoesCabecalho } from "@/modules/rh/folha/components/folha-acoes-cabecalho";
import { FolhasTabela } from "@/modules/rh/folha/components/folhas-tabela";
import { listarFolhas } from "@/modules/rh/folha/queries";

export default async function PaginaFolha() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "rh.folha", "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, "rh.folha", "criar");

  const folhas = await listarFolhas();

  return (
    <>
      <PageHeader
        titulo="Folha gerencial"
        descricao="Folha mensal de gestão: consolida ponto, adiantamentos e encargos por colaborador, com custo alocado por centro de custo. Não é a folha oficial."
        acoes={podeCriar ? <FolhaAcoesCabecalho /> : undefined}
      />
      <FolhasTabela folhas={folhas} podeCriar={podeCriar} />
    </>
  );
}
