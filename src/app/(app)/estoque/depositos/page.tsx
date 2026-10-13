import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { DepositosAcoesCabecalho } from "@/modules/manutencao/almoxarifado/components/depositos-acoes-cabecalho";
import { DepositosTabela } from "@/modules/manutencao/almoxarifado/components/depositos-tabela";
import { listarDepositos } from "@/modules/manutencao/almoxarifado/queries";

const RECURSO = "estoque.depositos" as const;

/**
 * Cadastro dos depósitos. O mesmo depósito guarda materiais (entradas do Estoque) e peças
 * (entradas do almoxarifado da Manutenção); cada módulo movimenta só o que é dele.
 */
export default async function PaginaDepositosEstoque() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) {
    notFound();
  }

  const depositos = await listarDepositos();

  return (
    <>
      <PageHeader
        modulo="Estoque"
        titulo="Depósitos"
        descricao="Onde os materiais e as peças ficam guardados"
        acoes={<DepositosAcoesCabecalho podeCriar={temPermissao(usuario, RECURSO, "criar")} />}
      />
      <DepositosTabela
        depositos={depositos}
        podeEditar={temPermissao(usuario, RECURSO, "editar")}
        podeExcluir={temPermissao(usuario, RECURSO, "excluir")}
      />
    </>
  );
}
