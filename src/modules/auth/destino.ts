/** Nome do parâmetro que carrega a rota pretendida até o login e de volta. */
export const PARAM_DESTINO = "destino";

/** Para onde vai quem entra sem destino pretendido. */
const HOME = "/";

/**
 * Rota interna para onde mandar o usuário depois de entrar, ou a home.
 *
 * Existe porque o middleware manda todo mundo sem sessão para `/login` e o
 * `entrar()` sempre redirecionava para `/`: quem recebia um link de uma tela
 * específica (o link de aprovação de pagamento, por exemplo) logava e caía na
 * home sem saber mais para onde ia.
 *
 * É a única entrada não confiável que a feature cria, então a validação é lista
 * de permissão, não lista de bloqueio: só passa o que começa com uma barra e
 * segue com caractere de caminho. Qualquer outra coisa vira a home, calada.
 *
 * O que cada recusa evita:
 * - `//evil.com` e `/\evil.com`: o navegador resolve as duas como OUTRO host, e
 *   `redirect()` com elas tira o usuário do domínio depois de autenticar. É o
 *   open redirect clássico, e é o motivo de existir esta função.
 * - `https://evil.com`, `javascript:`: URL absoluta e esquema executável.
 * - tab, quebra de linha e espaço: o navegador remove esses caracteres da URL
 *   antes de resolver, então `/\n/evil.com` navegaria para `//evil.com`. A
 *   limpeza vem ANTES da checagem justamente por isso.
 * - `/login`: não é ataque, é laço. Voltar para o login depois de logar deixaria
 *   a pessoa presa na tela de onde acabou de sair.
 */
export function destinoSeguro(destino: string | null | undefined): string {
  if (!destino) return HOME;

  // Tira espaço e caractere de controle (tudo até 0x20) antes de checar. Sem
  // isso a checagem valida um texto que não é o que vai ser navegado, porque o
  // navegador remove tab e quebra de linha por conta própria.
  //
  // Por code point, e não por regex: a classe equivalente precisaria de escape
  // de controle no fonte, e é fácil ela virar byte cru no arquivo (o que quebra
  // grep, diff e review sem quebrar o teste).
  const limpo = [...destino]
    .filter((caractere) => (caractere.codePointAt(0) ?? 0) > 0x20)
    .join("");
  if (limpo === "") return HOME;

  // Uma barra, e a próxima posição não pode ser outra barra nem contrabarra.
  if (!/^\/(?![/\\])/.test(limpo)) return HOME;

  const rota = limpo.split(/[?#]/)[0];
  if (rota === "/login") return HOME;

  return limpo;
}
