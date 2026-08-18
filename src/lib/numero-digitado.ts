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

/**
 * Troca o separador decimal digitado por VÍRGULA, na hora da digitação.
 *
 * No teclado numérico a tecla decimal emite PONTO, e o ERP guarda o valor com
 * vírgula. Quem digitava "2194.56" via um ponto na tela e gravava outra coisa: o
 * ponto era lido como milhar e o valor saía 100x maior. Aqui os dois caminhos —
 * ponto e vírgula — chegam no mesmo lugar, e o que a pessoa vê já é o que vai ser
 * gravado.
 *
 * Regra de mais de um separador: **o último vence**. Quem digita "1.234.567,89"
 * quer 1234567,89, e é assim que sai — cada separador novo empurra o anterior para
 * a parte inteira. Nada de adivinhar milhar no meio da digitação: enquanto a
 * pessoa digita, só existe um decimal, e é o último que ela marcou.
 *
 * Não valida nada. Texto que não é número passa igual, para a pessoa poder apagar
 * e corrigir sem o campo lutar contra ela; quem reprova é
 * `normalizarNumeroDigitado` na saída do campo, e o schema no envio.
 */
export function paraVirgulaDecimal(texto: string): string {
  const comVirgula = texto.replace(/\./g, ",");
  const ultima = comVirgula.lastIndexOf(",");
  if (ultima === -1) return comVirgula;
  return (
    comVirgula.slice(0, ultima).replace(/,/g, "") + comVirgula.slice(ultima)
  );
}

/** Só dígitos, com parte decimal opcional de até `casas` dígitos. */
function padraoNormalizado(casas: number): RegExp {
  return new RegExp(`^\\d+(,\\d{1,${casas}})?$`);
}

/**
 * A vírgula é separador de MILHAR disfarçado de decimal?
 *
 * Vale quando o grupo depois dela tem exatamente 3 dígitos e o campo não aceita
 * 3 casas — em dinheiro (2 casas) "1,500" não pode ser um decimal, porque real
 * não tem três centavos. Então é mil e quinhentos.
 *
 * Existe porque a digitação passou a trocar ponto por vírgula: quem digita
 * "1.500" (hábito brasileiro de milhar) agora vê "1,500", e antes disto o valor
 * era recusado. O caminho do PONTO já resolvia esse caso do mesmo jeito
 * ("1.500" -> 1500); isto deixa os dois consistentes, não afrouxa nada novo.
 *
 * Duas fronteiras deliberadas:
 *
 * - Parte inteira começando em zero NÃO conta. "0,500" em dinheiro seria 0500,
 *   que não é grupo de milhar nenhum — é valor inválido, e vai ser recusado para
 *   a pessoa corrigir.
 * - Quantidade (3 casas) fica de fora: ali "1,234" é um decimal legítimo, e a
 *   ambiguidade com 1234 não tem como ser resolvida sem chutar. Quantidade em
 *   milhar se digita sem separador.
 */
function ehMilharDisfarcado(
  inteiro: string,
  decimal: string | undefined,
  casas: number,
): boolean {
  return (
    casas < 3 &&
    decimal !== undefined &&
    decimal.length === 3 &&
    /^\d+$/.test(decimal) &&
    inteiro !== "" &&
    !inteiro.startsWith("0")
  );
}

/**
 * Normaliza o texto digitado para o formato canônico do formulário
 * ("1234,56"). Devolve null quando o texto não é um número reconhecível: nesse
 * caso o campo fica como está e a validação da tela mostra o erro.
 *
 * Regras de separador, na ordem:
 * 1. Tem vírgula: vírgula é o decimal, pontos são milhar. Exceção em
 *    `ehMilharDisfarcado`: grupo de exatamente 3 dígitos num campo de 2 casas é
 *    milhar ("1,500" em dinheiro vira 1500).
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
    if (ehMilharDisfarcado(inteiro, decimal, casas)) {
      normalizado = `${inteiro}${decimal}`;
    } else {
      normalizado =
        decimal === undefined || decimal === ""
          ? inteiro
          : `${inteiro},${decimal}`;
    }
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
