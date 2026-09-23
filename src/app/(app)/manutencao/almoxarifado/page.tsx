import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { NavegacaoAlmoxarifado } from "@/modules/manutencao/almoxarifado/components/navegacao-almoxarifado";
import { SaldosTabela } from "@/modules/manutencao/almoxarifado/components/saldos-tabela";
import { listarDepositos, listarSaldos } from "@/modules/manutencao/almoxarifado/queries";

export default async function PaginaAlmoxarifado() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "manutencao.almoxarifado", "ver")) {
    notFound();
  }

  const [saldos, depositos] = await Promise.all([listarSaldos(), listarDepositos()]);

  return (
    <>
      <PageHeader
        modulo="Manutenção"
        titulo="Almoxarifado de peças"
        descricao="Saldo e custo médio de cada peça por depósito, mantidos pelas entradas e pelas OS"
        acoes={<NavegacaoAlmoxarifado atual="saldos" />}
      />
      <SaldosTabela
        saldos={saldos}
        depositos={depositos.map((deposito) => ({ id: deposito.id, nome: deposito.nome }))}
      />
    </>
  );
}
