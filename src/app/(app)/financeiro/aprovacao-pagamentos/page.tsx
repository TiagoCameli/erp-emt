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

  const [parcelas, incompletas, emRevisao, aguardandoData, aguardandoConta] =
    await Promise.all([
      listarParcelasPendentes(),
      contarParcelasIncompletas(),
      contarEmRevisao(),
      contarAguardandoData(),
      contarAguardandoConta(),
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
        podeAprovar={podeAprovar}
        podeRevisar={podeRevisar}
        podeEditarLancamento={podeEditarLancamento}
        idUsuario={usuario.id}
      />
    </>
  );
}
