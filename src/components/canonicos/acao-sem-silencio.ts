import { toast } from './toast';

/**
 * Roda a ação de um botão e AVISA se ela falhar, em vez de falhar calado.
 *
 * O contrato das Server Actions daqui é devolver `{ erro }`, e as telas já
 * tratam isso com toast. Existe porém um caminho em que nada disso roda: a
 * action nem chega a executar. O POST dela pode falhar por rede caída, por 504
 * do servidor, ou — o caso real que motivou isto — porque produção mudou de
 * build depois de a página ter sido aberta, e o id da Server Action que o
 * cliente antigo manda não existe mais no build novo.
 *
 * Nesses casos o `await` REJEITA. Sem este `catch` a rejeição morre como
 * unhandled rejection (não há handler global de `unhandledrejection` no app, e
 * error boundary do React não pega rejeição de handler de evento): nenhum
 * toast, nenhum estado muda, e nenhum pedido chega ao banco. Do lado de quem
 * clicou, o botão pisca e o mundo fica igual.
 *
 * Foi o que travou a aprovação da folha de 08/2026: a pessoa clicava em
 * Aprovar, a `fn_aprovar_folha` não aparecia UMA vez nos logs do banco, e ela
 * não tinha como saber que não tinha aprovado R$ 173 mil.
 *
 * A mensagem manda recarregar de propósito: é o que resolve id de action velho,
 * é inofensivo em qualquer outro caso, e é a única saída na mão de quem clicou.
 *
 * Vive na camada canônica porque o silêncio era de todas as telas que apertam
 * um botão de fluxo — aprovar, rejeitar, desaprovar, confirmar. Mesma doutrina
 * que a folha já escreve no `aoCopiarMensagem`: avisar é melhor que o silêncio
 * de um botão que parece ter funcionado.
 */
export async function comAvisoDeFalha(
  contexto: string,
  executar: () => void | Promise<void>,
): Promise<void> {
  try {
    await executar();
  } catch (erro) {
    console.error(`[erp-emt] ${contexto}`, erro);
    /*
     * "PODE não ter sido concluída", e "confira" antes de "tente de novo".
     *
     * As Server Actions daqui não lançam mais: elas devolvem `{ erro }` até
     * para falha inesperada (`semLancar`, em src/lib/erros.ts). Então chegar
     * neste catch significa que a INVOCAÇÃO morreu — timeout da função, queda
     * de rede, deploy no meio do clique. E invocação morta não é o mesmo que
     * nada aconteceu: o lote de aprovação de pagamentos, por exemplo, é uma
     * transação por parcela, então parte dele pode estar aprovada e commitada.
     *
     * Dizer "não foi concluída, tente de novo" nesse cenário convida a pessoa
     * a aprovar o mesmo dinheiro duas vezes. O certo é mandar conferir.
     */
    toast.error(
      'A ação pode não ter sido concluída. Recarregue a página e confira antes de tentar de novo',
    );
  }
}
