import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { AprovacaoCliente } from "@/modules/financeiro/aprovacao-pagamentos/components/aprovacao-cliente";
import {
  PARAM_LINK_APROVACAO,
  lerParcelasDoLink,
} from "@/modules/financeiro/aprovacao-pagamentos/link-aprovacao";
import {
  contarAguardandoConta,
  contarAguardandoData,
  contarEmRevisao,
  contarParcelasIncompletas,
  listarPagamentosDiretos,
  listarParcelasPendentes,
  statusDasParcelas,
} from "@/modules/financeiro/aprovacao-pagamentos/queries";
import { listarContasBancarias } from "@/modules/financeiro/pagamentos/queries";

export default async function PaginaAprovacaoPagamentos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
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

  // Parcelas apontadas por um link de aprovação (o que se manda no WhatsApp).
  // Id inválido é descartado aqui, então o resto da página nunca vê lixo.
  const { [PARAM_LINK_APROVACAO]: doLink } = await searchParams;
  const parcelasDoLink = lerParcelasDoLink(doLink);

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

  /**
   * Parcelas do link que não estão na fila, com o motivo. Só consulta o que
   * realmente faltou: link recente cai todo na fila e não gasta consulta.
   *
   * A lista completa (não só o que faltou) permitiria dizer "3 de 5 já
   * aprovados"; aqui basta explicar o que a pessoa não está vendo.
   */
  const idsNaFila = new Set(parcelas.map((parcela) => parcela.id));
  const foraDaFila = await statusDasParcelas(
    parcelasDoLink.filter((id) => !idsNaFila.has(id)),
  );

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
          parcelasDoLink,
          foraDaFila,
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
