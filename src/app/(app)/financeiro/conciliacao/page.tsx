import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { ConciliacaoCliente } from "@/modules/financeiro/conciliacao/components/conciliacao-cliente";
import {
  listarContasBancarias,
  listarExtratos,
  listarTransacoes,
} from "@/modules/financeiro/conciliacao/queries";

export default async function PaginaConciliacao({
  searchParams,
}: {
  searchParams: Promise<{ conta?: string }>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "financeiro.conciliacao", "ver")) {
    notFound();
  }

  const podeImportar = temPermissao(usuario, "financeiro.conciliacao", "criar");
  // Conciliar pede `editar`, a mesma permissão que as RPCs de conciliar e
  // desconciliar exigem no banco. Com `criar` aqui, quem só tivesse `criar`
  // via o botão, clicava e levava a recusa crua do Postgres no fim.
  const podeConciliar = temPermissao(
    usuario,
    "financeiro.conciliacao",
    "editar",
  );
  const podeDesconciliar = temPermissao(
    usuario,
    "financeiro.conciliacao",
    "editar",
  );

  const { conta } = await searchParams;
  const contaId = conta ?? "";

  const [transacoes, extratos, contas] = await Promise.all([
    listarTransacoes(contaId ? { contaId } : {}),
    listarExtratos(),
    listarContasBancarias(),
  ]);

  return (
    <>
      <PageHeader
        modulo="Financeiro"
        titulo="Conciliação"
        descricao="Importe o extrato OFX e case cada transação com a parcela paga correspondente"
      />
      <ConciliacaoCliente
        transacoes={transacoes}
        extratos={extratos}
        contas={contas}
        contaId={contaId}
        podeImportar={podeImportar}
        podeConciliar={podeConciliar}
        podeDesconciliar={podeDesconciliar}
      />
    </>
  );
}
