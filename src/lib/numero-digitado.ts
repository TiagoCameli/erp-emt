/**
 * Interpretação de número digitado à mão em campo de formulário (pt-BR).
 *
 * Existe para uma razão específica: o que o usuário vê tem que ser exatamente o
 * que o sistema grava. O ERP guarda quantidade e preço como STRING no
 * formulário e converte no envio tratando ponto como milhar e vírgula como
 * decimal. Quem digita "1234.56" no teclado numérico (ponto como decimal, hábito
 * comum) teria o ponto tratado como milhar e gravaria 123456. Aqui o texto é
 * normalizado quando o campo perde o foco, então o valor exibido e o valor
 * gravado passam a ser o mesmo.
 *
 * Módulo puro, sem React. A saída usa SEMPRE vírgula decimal e nunca separador
 * de milhar, que é o formato que o resto da cadeia (schemas Zod do formulário e
 * a conversão do envio) já aceita.
 */

/** Só dígitos, com parte decimal opcional de até `casas` dígitos. */
function padraoNormalizado(casas: number): RegExp {
  return new RegExp(`^\\d+(,\\d{1,${casas}})?$`);
}

/**
 * Normaliza o texto digitado para o formato canônico do formulário
 * ("1234,56"). Devolve null quando o texto não é um número reconhecível: nesse
 * caso o campo fica como está e a validação da tela mostra o erro.
 *
 * Regras de separador, na ordem:
 * 1. Tem vírgula: vírgula é o decimal, pontos são milhar.
 * 2. Só ponto, um único, com 1 ou 2 dígitos depois: ponto é decimal
 *    ("1234.5" vira "1234,5"). É o caso que gravava valor 100x maior.
 * 3. Qualquer outro ponto (vários, ou grupo de 3 dígitos): milhar, sai fora.
 */
export function normalizarNumeroDigitado(
  texto: string,
  casas: number,
): string | null {
  const limpo = texto.trim().replace(/\s/g, "");
  if (limpo === "") return null;
  if (/[^\d.,]/.test(limpo)) return null;

  let normalizado: string;

  if (limpo.includes(",")) {
    const partes = limpo.split(",");
    if (partes.length > 2) return null;
    const inteiro = partes[0].replace(/\./g, "");
    const decimal = partes[1];
    normalizado = decimal === undefined || decimal === "" ? inteiro : `${inteiro},${decimal}`;
  } else {
    const pontos = limpo.split(".");
    if (pontos.length === 2 && pontos[1].length > 0 && pontos[1].length <= 2) {
      normalizado = `${pontos[0]},${pontos[1]}`;
    } else {
      normalizado = limpo.replace(/\./g, "");
    }
  }

  // "," ou ",5" sem parte inteira: completa o zero para virar número válido.
  if (normalizado.startsWith(",")) normalizado = `0${normalizado}`;
  if (normalizado === "") return null;

  return padraoNormalizado(casas).test(normalizado) ? normalizado : null;
}

/**
 * Texto de exibição de um valor já normalizado: separador de milhar e vírgula
 * decimal ("1.234,56"). `casasFixas` obriga as casas decimais (dinheiro sempre
 * mostra 2); sem ela, mostra só o que foi digitado (quantidade).
 * Texto irreconhecível volta sem mudança, para não apagar o que a pessoa digitou.
 */
export function formatarNumeroDigitado(
  texto: string,
  casas: number,
  casasFixas?: number,
): string {
  const normalizado = normalizarNumeroDigitado(texto, casas);
  if (normalizado === null) return texto;

  const [inteiro, decimal = ""] = normalizado.split(",");
  const numeroInteiro = Number(inteiro);
  if (!Number.isFinite(numeroInteiro)) return texto;

  const inteiroFormatado = numeroInteiro.toLocaleString("pt-BR", {
    maximumFractionDigits: 0,
  });

  if (casasFixas !== undefined) {
    return `${inteiroFormatado},${decimal.padEnd(casasFixas, "0").slice(0, casasFixas)}`;
  }
  return decimal === "" ? inteiroFormatado : `${inteiroFormatado},${decimal}`;
}
