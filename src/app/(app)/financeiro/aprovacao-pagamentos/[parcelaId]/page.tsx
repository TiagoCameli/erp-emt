import { notFound } from "next/navigation";

import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarAnexosDoDocumento } from "@/modules/_shared/anexos/queries";
import { buscarOrdem } from "@/modules/compras/ordens/queries";
import { PagamentoDetalheView } from "@/modules/financeiro/aprovacao-pagamentos/components/pagamento-detalhe";
import { lancamentoDaParcela } from "@/modules/financeiro/aprovacao-pagamentos/queries";
import {
  buscarLancamento,
  trilhaLancamento,
} from "@/modules/financeiro/lancamentos/queries";
import { listarContasBancarias } from "@/modules/financeiro/pagamentos/queries";

/**
 * Tela inteira de um pagamento que precisa de aprovação.
 *
 * O portão é `financeiro.aprovacao-pagamentos:ver`, e NÃO `financeiro.lancamentos:ver`.
 * Isto é o que separa esta página da tela de lançamento que já existe em
 * `/financeiro/lancamentos/[id]`: quem aprova pagamento não necessariamente pode
 * ver (nem editar) o cadastro de lançamentos, e cairia em 404 lá. Quem pode ler o
 * lançamento por dentro daqui é a RLS, a mesma que já deixa a fila fazer o join.
 *
 * É também o destino do link de aprovação que se manda no WhatsApp, então ela
 * precisa se explicar sozinha para quem chega sem contexto: a view mostra o que
 * aconteceu com a parcela quando ela não é mais aprovável, em vez de sumir com o
 * botão.
 */
export default async function PaginaPagamentoAprovacao({
  params,
}: {
  params: Promise<{ parcelaId: string }>;
}) {
  const usuario = await getUsuarioLogado();
  if (
    !usuario ||
    !temPermissao(usuario, "financeiro.aprovacao-pagamentos", "ver")
  ) {
    notFound();
  }

  const { parcelaId } = await params;
  const lancamentoId = await lancamentoDaParcela(parcelaId);
  if (!lancamentoId) notFound();

  const lancamento = await buscarLancamento(lancamentoId);
  if (!lancamento) notFound();

  const parcela = lancamento.parcelas.find((linha) => linha.id === parcelaId);
  // A parcela existe (lancamentoDaParcela achou) mas não veio no lançamento:
  // só acontece com leitura parcial da RLS. 404 em vez de tela pela metade.
  if (!parcela) notFound();

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

  const [anexos, trilha, ordem, contas] = await Promise.all([
    listarAnexosDoDocumento("lancamento", lancamento.id),
    trilhaLancamento(lancamento.id),
    lancamento.origem === "oc" && lancamento.origemId
      ? buscarOrdem(lancamento.origemId)
      : Promise.resolve(null),
    listarContasBancarias(),
  ]);

  return (
    <PagamentoDetalheView
      lancamento={lancamento}
      parcela={parcela}
      anexos={anexos}
      trilha={trilha}
      itensOrigem={ordem?.itens ?? []}
      contas={contas}
      podeAprovar={podeAprovar}
      podeRevisar={podeRevisar}
      podeEditarLancamento={podeEditarLancamento}
      // Mesma regra da coluna "Sem nota" da fila: só a OC de origem tem nota, e
      // a ausência dela avisa sem bloquear.
      semNota={lancamento.origem === "oc" && !lancamento.notaRegistrada}
    />
  );
}
