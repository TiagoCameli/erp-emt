import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { AprovacaoCliente } from "@/modules/financeiro/aprovacao-pagamentos/components/aprovacao-cliente";
import {
  contarAguardandoConta,
  contarAguardandoData,
  contarEmRevisao,
  contarParcelasIncompletas,
  listarPagamentosDiretos,
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
  const podeVerLancamento = temPermissao(
    usuario,
    "financeiro.lancamentos",
    "ver",
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
    diretos,
  ] = await Promise.all([
    listarParcelasPendentes(),
    contarParcelasIncompletas(),
    contarEmRevisao(),
    contarAguardandoData(),
    contarAguardandoConta(),
    listarContasBancarias(),
    listarPagamentosDiretos(),
  ]);

  return (
    <>
      <PageHeader
        modulo="Financeiro"
        titulo="Aprovação de pagamentos"
        descricao="Aprovar autoriza o pagamento para uma data. O que precisa de ajuste vai para revisão, sem cancelar nada. Dinheiro e cartão não passam por aqui: ficam na aba ao lado, só para conferência."
      />
      <AprovacaoCliente
        fila={{
          parcelas,
          incompletas,
          emRevisao,
          aguardandoData,
          aguardandoConta,
          contas,
          podeAprovar,
          podeRevisar,
          podeEditarLancamento,
          idUsuario: usuario.id,
        }}
        diretos={{
          pagamentos: diretos,
          // A mesma permissão de aprovar pagamento: é a mesma pessoa e a mesma
          // responsabilidade. A action e o banco recusam de novo. Nome diferente
          // do podeRevisar da fila (que é desaprovar) porque é outra coisa:
          // aqui é carimbar conferência, lá é devolver para ajuste.
          podeConferir: podeAprovar,
          podeVerLancamento,
        }}
      />
    </>
  );
}
