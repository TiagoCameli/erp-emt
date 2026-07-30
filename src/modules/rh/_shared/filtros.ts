/**
 * Predicados dos filtros das listagens de RH que carregam tudo e filtram em
 * memória (diárias, adiantamentos, férias, documentos, EPI, ocorrências, banco
 * de horas, folha). Ficam aqui, e não em cada tela, porque a regra da ponta
 * vazia é a mesma em todas: ponta em branco significa "sem limite daquele
 * lado", nunca "zero".
 */

/**
 * Data (yyyy-MM-dd) dentro do período de/até. Registro sem data fica de fora
 * quando o usuário preencheu alguma ponta: se ele pediu um período, um registro
 * sem data não é resposta.
 */
export function noPeriodo(
  data: string | null,
  de: string,
  ate: string,
): boolean {
  if (de === "" && ate === "") return true;
  if (data === null || data === "") return false;
  if (de !== "" && data < de) return false;
  if (ate !== "" && data > ate) return false;
  return true;
}

/**
 * Número (dinheiro, horas, quantidade) dentro da faixa de/até. Ponta vazia ou
 * não numérica não limita nada: o usuário digitando "1" no mínimo não pode
 * fazer a linha de R$ 0,50 desaparecer antes de ele terminar de digitar.
 */
export function naFaixa(valor: number, de: string, ate: string): boolean {
  const minimo = Number(de);
  if (de.trim() !== "" && Number.isFinite(minimo) && valor < minimo) {
    return false;
  }
  const maximo = Number(ate);
  if (ate.trim() !== "" && Number.isFinite(maximo) && valor > maximo) {
    return false;
  }
  return true;
}
