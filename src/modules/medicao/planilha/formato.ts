/**
 * Exibe o texto de um numeric no formato brasileiro SEM passar por Number: "17057.717" vira
 * "17.057,717" e "580.8642996" vira "580,8642996". Todas as casas ficam, porque a casa escondida
 * do xlsx é exatamente o que a tela precisa mostrar (spec 6.1). Texto que não é número volta como
 * veio.
 */
export function decimalPtBr(texto: string | null): string {
  if (texto === null) return "";
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(texto.trim());
  if (!m) return texto;
  const [, sinal, inteiro, fracao] = m;
  const agrupado = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${sinal}${agrupado}${fracao ? `,${fracao}` : ""}`;
}
