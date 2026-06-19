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
  const podeConciliar = temPermissao(usuario, "financeiro.conciliacao", "criar");
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
        titulo="Conciliação bancária"
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
