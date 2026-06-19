import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { FilaAprovacao } from "@/modules/financeiro/aprovacao-pagamentos/components/fila-aprovacao";
import { listarParcelasPendentes } from "@/modules/financeiro/aprovacao-pagamentos/queries";

export default async function PaginaAprovacaoPagamentos() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "financeiro.aprovacao-pagamentos", "ver")) {
    notFound();
  }

  const podeAprovar = temPermissao(
    usuario,
    "financeiro.aprovacao-pagamentos",
    "aprovar",
  );
  const podeRejeitar = temPermissao(
    usuario,
    "financeiro.aprovacao-pagamentos",
    "desaprovar",
  );

  const parcelas = await listarParcelasPendentes();

  return (
    <>
      <PageHeader
        titulo="Aprovação de pagamentos"
        descricao="Aprove ou rejeite as parcelas a pagar antes que sigam para pagamento"
      />
      <FilaAprovacao
        parcelas={parcelas}
        podeAprovar={podeAprovar}
        podeRejeitar={podeRejeitar}
      />
    </>
  );
}
