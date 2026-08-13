/**
 * Regra pura do lote de conta bancária. Nada de banco, nada de React.
 *
 * O lote existe porque a carga do Mais Controle deixou milhares de lançamentos
 * sem conta bancária, e a conta é o portão da aprovação: parcela sem conta não
 * entra na fila de pagamento. Definir uma por uma, abrindo o detalhe de cada
 * lançamento, é o atrito que isto remove.
 */

/**
 * Estado de revisão de uma LINHA da listagem.
 *
 * Não confundir com o `FiltroRevisao` de `schemas.ts`: são duas enumerações
 * diferentes de propósito, e escrevem diferente. A do filtro usa underscore
 * (`sem_conta`) e tem `em_revisao` e `nao_revisado`; a da linha usa hífen
 * (`sem-conta`) e tem `nao-se-aplica`. Trocar uma pela outra compila em nenhum
 * lugar, e foi o TypeScript que pegou isso aqui.
 */
export type RevisaoDaLinha =
  | "sem-conta"
  | "parcial"
  | "revisado"
  | "nao-se-aplica";

/**
 * Rótulo pt-BR do estado de revisão da linha.
 *
 * `nao-se-aplica` é string vazia de propósito: na tabela a célula mostra "-"
 * (traço cinza de "não vale a pergunta"), e numa planilha o mesmo significado se
 * escreve com a célula em branco, não com um traço que atrapalha filtro e
 * tabela dinâmica. Quem exibe decide o desenho; o rótulo é um só.
 */
export const ROTULO_REVISAO_DA_LINHA: Record<RevisaoDaLinha, string> = {
  "sem-conta": "Sem conta",
  parcial: "Conta parcial",
  revisado: "Revisado",
  "nao-se-aplica": "",
};

/**
 * Teto de lançamentos por chamada.
 *
 * É o MESMO número que a `fn_definir_conta_lancamentos_lote` recusa passar, e
 * existe um teste amarrando os dois: se divergirem, o usuário recebe erro cru do
 * banco em vez do aviso da tela.
 *
 * O motivo do teto não é a rede, é o lock: sem ele um clique vira `update` em
 * milhares de parcelas dentro de uma transação, segurando a tabela que o resto da
 * empresa está usando.
 */
export const LIMITE_LOTE = 500;

/** O que a função do banco devolve, já em camelCase. */
export interface ResumoLote {
  definidos: number;
  puladosComConta: number;
  puladosSemParcelaPendente: number;
  naoEncontrados: number;
}

/**
 * Lançamento em que o lote tem o que fazer.
 *
 * `parcial` entra: é um estado quebrado (a conta deveria ser a mesma em todas as
 * parcelas pendentes) e o lote completa as vazias sem tocar na que já tem conta.
 *
 * `nao-se-aplica` não entra: é lançamento a receber, ou sem parcela nenhuma. Não
 * há conta de pagamento para definir.
 */
export function ehElegivelParaLote(linha: {
  revisao: RevisaoDaLinha;
}): boolean {
  return linha.revisao === "sem-conta" || linha.revisao === "parcial";
}

function plural(n: number, singular: string, plural_: string): string {
  return `${n} ${n === 1 ? singular : plural_}`;
}

/**
 * Frase do toast depois do lote.
 *
 * Diz o que foi feito E o que não foi. Toast que só diz "pronto" depois de uma
 * ação em massa esconde justamente o que o usuário precisa saber: que 12 ficaram
 * de fora, e por quê.
 */
export function textoResumoLote(resumo: ResumoLote): string {
  const feito =
    resumo.definidos === 0
      ? "Nenhuma conta definida"
      : `Conta definida em ${plural(resumo.definidos, "lançamento", "lançamentos")}`;

  const ressalvas: string[] = [];
  if (resumo.puladosComConta > 0) {
    ressalvas.push(`${resumo.puladosComConta} já tinham conta`);
  }
  if (resumo.puladosSemParcelaPendente > 0) {
    ressalvas.push(
      `${resumo.puladosSemParcelaPendente} não tinham parcela em aberto`,
    );
  }

  const partes = [feito];
  if (ressalvas.length > 0) {
    partes.push(`${ressalvas.join(" e ")}: pulados`);
  }
  if (resumo.naoEncontrados > 0) {
    partes.push(
      `${resumo.naoEncontrados} não foram encontrados: a lista estava velha, recarregue a tela`,
    );
  }
  return partes.join(". ");
}
