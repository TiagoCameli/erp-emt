/**
 * Onde um rateio caiu na árvore de centros de custo: qual é o CENTRO DE CUSTO e
 * qual é a ETAPA.
 *
 * Existe separado da consulta porque é a regra que a planilha errou na primeira
 * versão, e regra errada precisa de teste. No vocabulário do ERP, centro de
 * custo e etapa são coisas diferentes: "001 - Carretas EMT" é o centro de custo,
 * e "Caminhão Cavalo XF 530 FTT SQU9C94 - 03" é uma etapa dele. O rateio grava
 * UM id, que pode ser qualquer um dos dois níveis, e é aqui que esse id vira o
 * par que a planilha mostra em duas colunas.
 *
 * Sem React, sem Supabase: recebe a árvore pronta.
 */

/** Um centro de custo do cadastro, do jeito que a árvore precisa dele. */
export interface CentroNaArvore {
  nome: string;
  /** Null na raiz. */
  paiId: string | null;
}

/** O par que a planilha mostra: o centro de custo e, se houver, a etapa. */
export interface CentroEEtapa {
  /** Sempre a raiz da árvore. */
  raizNome: string;
  /** Null quando o rateio foi gravado direto na raiz. */
  etapaNome: string | null;
}

/**
 * Quantos níveis o laço sobe antes de desistir.
 *
 * `pai_id` é auto-referência e o banco não garante que a árvore seja acíclica.
 * Um ciclo no cadastro travaria a exportação num laço infinito, e o sintoma
 * seria a tela pensando para sempre — sem erro, sem log, sem nada para
 * investigar. A árvore real tem dois níveis; 16 é folga de sobra e um teto que
 * transforma o ciclo num nome errado em vez de num travamento.
 */
const TETO_DE_NIVEIS = 16;

/**
 * Sobe do centro gravado até a raiz.
 *
 * A etapa devolvida é o nível GRAVADO, não um nível intermediário: é o grão que
 * o rateio conhece e o que a tela do lançamento mostra. Se um dia a árvore tiver
 * três níveis, um rateio no terceiro sai com o nome dele na coluna Etapa e a
 * raiz na coluna Centro de custo, que continua sendo a leitura certa das duas.
 *
 * Centro que não está na árvore (cadastro apagado no meio da exportação) cai no
 * nome que veio junto do rateio, sem etapa: melhor a planilha trazer o nome que
 * ela tem do que uma célula vazia sem explicação.
 */
export function centroEEtapaDoRateio(
  centroId: string,
  nomeDoCentro: string,
  arvore: ReadonlyMap<string, CentroNaArvore>,
): CentroEEtapa {
  const gravado = arvore.get(centroId);
  if (!gravado) return { raizNome: nomeDoCentro, etapaNome: null };
  if (!gravado.paiId) return { raizNome: gravado.nome, etapaNome: null };

  let atual = gravado;
  for (let passos = 0; passos < TETO_DE_NIVEIS && atual.paiId; passos += 1) {
    const pai = arvore.get(atual.paiId);
    if (!pai) break;
    atual = pai;
  }

  return { raizNome: atual.nome, etapaNome: gravado.nome };
}

/**
 * O ID da raiz de um rateio, para agrupar por CENTRO DE CUSTO sem depender de
 * nome.
 *
 * Existe separado de `centroEEtapaDoRateio` porque quem mostra precisa do nome e
 * quem AGRUPA precisa do id, e são coisas diferentes: dois cadastros com o mesmo
 * nome são dois centros, e juntá-los numa linha só moveria dinheiro de uma obra
 * para outra sem erro nenhum no arquivo. É a mesma razão pela qual a planilha
 * por rateio já junta as partes por `centroId`.
 *
 * `null` quando o centro não está na árvore (cadastro apagado no meio da
 * exportação). Quem chama trata isso como "cada parte na sua linha", que é o
 * mesmo que a planilha por rateio faz com o rateio órfão: sem id não dá para
 * afirmar que duas partes são do mesmo lugar.
 *
 * Mesmo teto de níveis do passeio de `centroEEtapaDoRateio`, e pelo mesmo
 * motivo: `pai_id` é auto-referência e o banco não garante aciclia.
 */
export function raizIdDoRateio(
  centroId: string,
  arvore: ReadonlyMap<string, CentroNaArvore>,
): string | null {
  const gravado = arvore.get(centroId);
  if (!gravado) return null;

  let atualId = centroId;
  let atual = gravado;
  for (let passos = 0; passos < TETO_DE_NIVEIS && atual.paiId; passos += 1) {
    const pai = arvore.get(atual.paiId);
    if (!pai) break;
    atualId = atual.paiId;
    atual = pai;
  }
  return atualId;
}
