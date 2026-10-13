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
        descricao="Onde as peças e os óleos ficam guardados. Os depósitos são criados e editados no módulo Estoque"
        acoes={
          <>
            <NavegacaoAlmoxarifado atual="depositos" />
            {/* Desde 13/10/2026 o depósito é criado no Estoque (`estoque.depositos`). */}
            <DepositosAcoesCabecalho podeCriar={false} />
          </>
        }
      />
      <DepositosTabela
        depositos={depositos}
        podeEditar={false}
        podeExcluir={false}
      />
    </>
  );
}
