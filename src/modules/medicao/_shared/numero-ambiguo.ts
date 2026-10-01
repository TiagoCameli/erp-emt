/**
 * Número ambíguo: um ÚNICO ponto, exatamente 3 dígitos depois dele e nenhuma vírgula ("1.234").
 * Tanto pode ser 1234 (separador de milhar, sem casa decimal) quanto 1,234 (decimal escrito com
 * ponto). Interpretar sozinho arriscaria gravar um número 1000x maior ou menor sem ninguém perceber;
 * quem chama recusa e pede para escrever de um jeito só. Uma regra para todo o módulo: o colar de
 * lançamentos e a quantidade aprovada usam esta mesma função.
 *
 * Só conta quando o texto inteiro é numérico: "ab.234" é inválido, não ambíguo.
 */
export function ehNumeroAmbiguo(texto: string): boolean {
  return /^\d+\.\d{3}$/.test(texto.trim());
}
