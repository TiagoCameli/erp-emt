import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { DepositosAcoesCabecalho } from "@/modules/manutencao/almoxarifado/components/depositos-acoes-cabecalho";
import { DepositosTabela } from "@/modules/manutencao/almoxarifado/components/depositos-tabela";
import { NavegacaoAlmoxarifado } from "@/modules/manutencao/almoxarifado/components/navegacao-almoxarifado";
import { listarDepositos } from "@/modules/manutencao/almoxarifado/queries";

export default async function PaginaDepositosAlmoxarifado() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "manutencao.almoxarifado", "ver")) {
    notFound();
  }

  const depositos = await listarDepositos();

  return (
    <>
      <PageHeader
        modulo="Manutenção"
        titulo="Depósitos de peças"
        descricao="Onde as peças e os óleos da manutenção ficam guardados"
        acoes={
          <>
            <NavegacaoAlmoxarifado atual="depositos" />
            <DepositosAcoesCabecalho
              podeCriar={temPermissao(usuario, "manutencao.almoxarifado", "criar")}
            />
          </>
        }
      />
      <DepositosTabela
        depositos={depositos}
        podeEditar={temPermissao(usuario, "manutencao.almoxarifado", "editar")}
        podeExcluir={temPermissao(usuario, "manutencao.almoxarifado", "excluir")}
      />
    </>
  );
}
