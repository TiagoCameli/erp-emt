import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { FilaAprovacao } from "@/modules/financeiro/aprovacao-pagamentos/components/fila-aprovacao";
import {
  contarAguardandoConta,
  contarAguardandoData,
  contarEmRevisao,
  contarParcelasIncompletas,
  listarParcelasPendentes,
} from "@/modules/financeiro/aprovacao-pagamentos/queries";
import { listarContasBancarias } from "@/modules/financeiro/pagamentos/queries";

export default async function PaginaAprovacaoPagamentos() {
  const usuario = await getUsuarioLogado();
  if (
    !usuario ||
    !temPermissao(usuario, "financeiro.aprovacao-pagamentos", "ver")
  ) {
    notFound();
  }

  const podeAprovar = temPermissao(
    usuario,
    "financeiro.aprovacao-pagamentos",
    "aprovar",
  );
  const podeRevisar = temPermissao(
    usuario,
    "financeiro.aprovacao-pagamentos",
    "desaprovar",
  );
  const podeEditarLancamento = temPermissao(
    usuario,
    "financeiro.lancamentos",
    "editar",
  );

  // As contas vêm junto porque a aprovação pode trocar a conta da parcela: é
  // exceção, mas quando acontece o modal precisa da lista já na mão.
  const [
    parcelas,
    incompletas,
    emRevisao,
    aguardandoData,
    aguardandoConta,
    contas,
  ] = await Promise.all([
    listarParcelasPendentes(),
    contarParcelasIncompletas(),
    contarEmRevisao(),
    contarAguardandoData(),
    contarAguardandoConta(),
    listarContasBancarias(),
  ]);

  return (
    <>
      <PageHeader
        titulo="Aprovação de pagamentos"
        descricao="Aprovar autoriza o pagamento para uma data. O que precisa de ajuste vai para revisão, sem cancelar nada."
      />
      <FilaAprovacao
        parcelas={parcelas}
        incompletas={incompletas}
        emRevisao={emRevisao}
        aguardandoData={aguardandoData}
        aguardandoConta={aguardandoConta}
        contas={contas}
        podeAprovar={podeAprovar}
        podeRevisar={podeRevisar}
        podeEditarLancamento={podeEditarLancamento}
        idUsuario={usuario.id}
      />
    </>
  );
}
