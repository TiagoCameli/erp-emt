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

const SIGNIFICATIVOS = 15;

/**
 * Preço e quantidade para a TELA: 15 algarismos significativos, como o Excel mostra. Tira o ruído
 * de double que veio do xlsx (102.34700000000001 vira 102,347) e mantém a casa escondida
 * (580,8643). Nunca passa por Number; o dado no banco continua com todas as casas.
 */
export function numeroExibicao(texto: string | null): string {
  if (texto === null) return "";
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(texto.trim());
  if (!m) return texto;
  const [, sinal, inteiro, fracao = ""] = m;
  let valor = BigInt(inteiro + fracao);
  let casas = fracao.length;
  const corte = valor.toString().length - SIGNIFICATIVOS;
  if (corte > 0) {
    const fator = BigInt(10) ** BigInt(corte);
    const resto = valor % fator;
    valor = valor / fator + (resto * BigInt(2) >= fator ? BigInt(1) : BigInt(0));
    casas -= corte;
  }
  let s = valor.toString();
  if (casas < 0) {
    s += "0".repeat(-casas);
    casas = 0;
  }
  s = s.padStart(casas + 1, "0");
  const parteInteira = s.slice(0, s.length - casas);
  const parteFracao = s.slice(s.length - casas).replace(/0+$/, "");
  const negativo = sinal === "-" && valor !== BigInt(0);
  return decimalPtBr(`${negativo ? "-" : ""}${parteInteira}${parteFracao ? `.${parteFracao}` : ""}`);
}
