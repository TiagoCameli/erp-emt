/**
 * Opções e leitura dos filtros da listagem de ordens de compra que não saem de
 * um cadastro: nota fiscal, origem, autoria e faixa de valor.
 *
 * Vive fora de `queries.ts` porque a tabela é client component e `queries.ts` é
 * `server-only`. Aqui só há constante e função pura, então a página (servidor) e
 * a tabela (navegador) importam do mesmo lugar, sem arrastar o Supabase para o
 * bundle do cliente e sem duplicar rótulo nenhum.
 */

/** Recorte por nota fiscal: a OC já tem recebimento registrado ou ainda não. */
export type FiltroNotaOC = "com" | "sem";

export const OPCOES_NOTA_OC: { valor: FiltroNotaOC; rotulo: string }[] = [
  { valor: "com", rotulo: "Com nota registrada" },
  { valor: "sem", rotulo: "Sem nota registrada" },
];

export const VALORES_NOTA_OC: readonly FiltroNotaOC[] = OPCOES_NOTA_OC.map(
  (opcao) => opcao.valor,
);

/** Origem da OC: gerada de uma cotação finalizada ou emitida direto. */
export type FiltroOrigemOC = "cotacao" | "direta";

export const OPCOES_ORIGEM_OC: { valor: FiltroOrigemOC; rotulo: string }[] = [
  { valor: "cotacao", rotulo: "Gerada de cotação" },
  { valor: "direta", rotulo: "Compra direta" },
];

export const VALORES_ORIGEM_OC: readonly FiltroOrigemOC[] = OPCOES_ORIGEM_OC.map(
  (opcao) => opcao.valor,
);

/**
 * Autoria. Só existe "minhas" porque a tabela `usuarios` não é legível por quem
 * tem apenas permissão de Compras: não há como montar a lista de autores para
 * escolher outra pessoa. "Criadas por mim" resolve a pergunta real ("quais eu
 * emiti") sem depender disso.
 */
export type FiltroAutoriaOC = "minhas";

export const OPCOES_AUTORIA_OC: { valor: FiltroAutoriaOC; rotulo: string }[] = [
  { valor: "minhas", rotulo: "Criadas por mim" },
];

export const VALORES_AUTORIA_OC: readonly FiltroAutoriaOC[] =
  OPCOES_AUTORIA_OC.map((opcao) => opcao.valor);

/** Faixa de valor total da OC, em reais. Ponta ausente é "sem limite". */
export interface FaixaValor {
  /** Para a consulta: número >= 0. Pontas invertidas já trocadas de lado. */
  valorDe?: number;
  valorAte?: number;
  /** Para o input: o texto exato que está na URL. */
  textoDe: string;
  textoAte: string;
}

/** Número >= 0 vindo da URL, ou undefined quando não dá para aproveitar. */
function numeroNaoNegativo(
  valor: string | string[] | undefined,
): number | undefined {
  if (typeof valor !== "string" || valor.trim() === "") return undefined;
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < 0) return undefined;
  return numero;
}

/** O próprio texto da URL, se ele é um valor aproveitável; senão vazio. */
function textoAproveitavel(valor: string | string[] | undefined): string {
  if (typeof valor !== "string") return "";
  return numeroNaoNegativo(valor) === undefined ? "" : valor;
}

/**
 * Faixa de valor lida dos parâmetros da URL, em duas formas: número para a
 * consulta e texto para o input.
 *
 * Pontas invertidas (de > até) são trocadas de lado só na consulta, senão a
 * lista viria vazia sem explicação nenhuma para o usuário. O texto sai EXATO
 * como está na URL, sem normalizar e sem trocar de lado: quem alimenta o input
 * é o `useFaixaUrl` (estado local com espera, porque o valor é digitado dígito a
 * dígito), e devolver "1000.5" para quem digitou "1000.50" deixaria a tela
 * renavegando para sempre, tentando casar dois textos que nunca vão bater.
 */
export function lerFaixaValor(
  de: string | string[] | undefined,
  ate: string | string[] | undefined,
): FaixaValor {
  const numeroDe = numeroNaoNegativo(de);
  const numeroAte = numeroNaoNegativo(ate);
  const invertida =
    numeroDe !== undefined && numeroAte !== undefined && numeroDe > numeroAte;

  return {
    valorDe: invertida ? numeroAte : numeroDe,
    valorAte: invertida ? numeroDe : numeroAte,
    textoDe: textoAproveitavel(de),
    textoAte: textoAproveitavel(ate),
  };
}
