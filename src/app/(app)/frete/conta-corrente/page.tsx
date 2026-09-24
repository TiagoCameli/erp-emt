import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { ContaCorrenteCards } from "@/modules/frete/conta-corrente/components/conta-corrente-cards";
import { listarSaldos } from "@/modules/frete/conta-corrente/queries";

export default async function PaginaContaCorrenteFrete() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "frete.conta-corrente", "ver")) notFound();

  const saldos = await listarSaldos();

  return (
    <>
      <PageHeader
        modulo="Frete"
        titulo="Conta corrente"
        descricao="Saldo de cada transportadora: fretes e abastecimentos no tanque dela creditam; pagamentos e combustível debitam. Positivo, a EMT deve"
      />
      <ContaCorrenteCards saldos={saldos} />
    </>
  );
}
