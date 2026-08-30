/**
 * A tradução entre a barra de faixa de valor e o filtro que vai para a URL.
 *
 * Módulo puro. O que ele resolve é uma coisa só, e é a que estraga filtro de
 * dinheiro quando fica implícita: **a ponta encostada na borda da barra
 * significa SEM LIMITE, não "até o teto"**.
 *
 * O teto da barra é o maior valor da lista que está na tela (escolha do Tiago em
 * 29/08/2026), e a lista muda com os outros filtros. Se a alça no fim quisesse
 * dizer "até R$ 154.700,00", trocar de página ou mexer noutro filtro passaria a
 * esconder tudo que fosse maior que o teto de antes — um filtro que a pessoa
 * nunca pediu, escondendo justamente as compras grandes.
 */

/** O que a barra mostra, em centavos-livres: sempre dois números entre 0 e teto. */
export interface PosicaoDaBarra {
  de: number;
  ate: number;
}

/**
 * Um teto redondo, um pouco acima do maior valor da lista.
 *
 * Arredondar para cima serve para a alça direita não nascer colada na borda
 * quando existe um valor exatamente igual ao maior: colada, ela pareceria "sem
 * limite" (que é o que a borda significa) quando na verdade é o maior valor.
 */
export function tetoDaBarra(maiorValor: number): number {
  if (!Number.isFinite(maiorValor) || maiorValor <= 0) return 1000;
  const magnitude = 10 ** Math.floor(Math.log10(maiorValor));
  return Math.ceil(maiorValor / magnitude) * magnitude;
}

/**
 * De quanto em quanto a alça anda.
 *
 * Cerca de 200 paradas ao longo da barra, arredondadas para uma unidade que se
 * lê em voz alta (1, 5, 10, 50, 100, ...). Passo de R$ 1 num teto de R$ 154 mil
 * daria 154 mil paradas: o arraste ficaria nervoso e o número embaixo da alça
 * mudaria a cada pixel.
 */
export function passoDaBarra(teto: number): number {
  const bruto = Math.max(teto / 200, 1);
  const magnitude = 10 ** Math.floor(Math.log10(bruto));
  const escala = bruto / magnitude;
  // 1, 2, 5 ou 10 vezes a magnitude: são os passos que alguém diz em voz alta
  // ("de 20 em 20 reais"). Incluir 2,5 dava passo de R$ 25, que se lê pior e não
  // ajuda a acertar valor nenhum.
  const arredondado = escala <= 1 ? 1 : escala <= 2 ? 2 : escala <= 5 ? 5 : 10;
  return arredondado * magnitude;
}

/** Texto do campo ("1.234,56" ou "1234.56") para número. Vazio vira `null`. */
export function paraNumeroDoFiltro(texto: string): number | null {
  const limpo = (texto ?? "").trim();
  if (limpo === "") return null;
  // Aceita os dois jeitos que o valor chega: digitado com vírgula pela pessoa e
  // com ponto pela URL.
  const normalizado = limpo.includes(",")
    ? limpo.replace(/\./g, "").replace(",", ".")
    : limpo;
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? numero : null;
}

/** Onde as duas alças ficam, dadas as pontas do filtro. */
export function posicaoDasAlcas(
  de: string,
  ate: string,
  teto: number,
): PosicaoDaBarra {
  const inicio = paraNumeroDoFiltro(de);
  const fim = paraNumeroDoFiltro(ate);
  return {
    de: inicio === null ? 0 : Math.min(Math.max(inicio, 0), teto),
    // Ponta aberta encosta na borda: é o mesmo desenho da leitura ("da borda
    // para fora, não há limite").
    ate: fim === null ? teto : Math.min(Math.max(fim, 0), teto),
  };
}

/**
 * As pontas do filtro a partir de onde as alças pararam.
 *
 * Alça em 0 e alça no teto viram ponta VAZIA, que é o que a URL entende como
 * "sem limite". É aqui que a promessa do cabeçalho deste arquivo se cumpre.
 */
export function filtroDasAlcas(
  posicao: PosicaoDaBarra,
  teto: number,
): { de: string; ate: string } {
  return {
    de: posicao.de <= 0 ? "" : String(posicao.de),
    ate: posicao.ate >= teto ? "" : String(posicao.ate),
  };
}

/**
 * O resumo da faixa, do jeito que a pessoa leria.
 *
 * "R$ 1.000,00 a R$ 50.000,00", "acima de R$ 1.000,00", "até R$ 50.000,00".
 * A frase importa: um botão que diz "1000 - " deixa a pessoa em dúvida sobre se
 * o campo de cima está vazio ou se o filtro está quebrado.
 */
export function resumoDaFaixa(
  de: string,
  ate: string,
  formatar: (valor: number) => string,
): string {
  const inicio = paraNumeroDoFiltro(de);
  const fim = paraNumeroDoFiltro(ate);
  if (inicio === null && fim === null) return "";
  if (inicio !== null && fim === null) return `acima de ${formatar(inicio)}`;
  if (inicio === null && fim !== null) return `até ${formatar(fim)}`;
  if (inicio === fim) return formatar(inicio!);
  return `${formatar(inicio!)} a ${formatar(fim!)}`;
}
