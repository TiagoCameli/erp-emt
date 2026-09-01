/**
 * Os predicados dos filtros de listagem: faixa de valor, período, mês de
 * referência e as opções montadas a partir dos dados da tela.
 *
 * ## Por que estes moram longe do `usePaginacaoCliente`
 *
 * Eles nasceram em `filtros-cliente.ts`, junto da paginação controlada — que é
 * um hook e por isso obriga o arquivo inteiro a ser `"use client"`. Só que
 * `"use client"` não é uma etiqueta: Next transforma cada export do módulo numa
 * REFERÊNCIA, e chamar a referência no servidor estoura em runtime com
 * "Attempted to call X() from the server but X is on the client".
 *
 * Foi o que derrubou a exportação de Pagamentos em 01/09/2026: o filtro da fila
 * é compartilhado entre a tela e a Server Action da planilha (para o arquivo sair
 * com o MESMO recorte da tela), e ele chamava `dentroDoPeriodo` daqui. Na tela
 * funcionava; na action, não — e nada pegava isso antes do clique em produção,
 * porque nem o `tsc`, nem o `vitest`, nem o `next build` conhecem essa fronteira.
 *
 * **Estes são puros e não têm dono:** servem à tela e ao servidor. Nada de React,
 * nada de navegador. Quem precisa de hook continua em `filtros-cliente.ts`, que
 * reexporta tudo daqui para os componentes não mudarem de porta.
 *
 * Guardado por `servidor-nao-chama-cliente.test.ts`.
 */

import { mesParaCompetencia } from "@/lib/formatadores";

/**
 * Valor dentro da faixa escolhida. Ponta vazia (ou não numérica) significa sem
 * limite naquele lado, igual ao FiltroValor canônico.
 */
export function dentroDaFaixaValor(
  valor: number,
  de: string,
  ate: string,
): boolean {
  const minimo = Number(de);
  const maximo = Number(ate);
  if (de.trim() !== "" && Number.isFinite(minimo) && valor < minimo) {
    return false;
  }
  if (ate.trim() !== "" && Number.isFinite(maximo) && valor > maximo) {
    return false;
  }
  return true;
}

/**
 * Data "YYYY-MM-DD" dentro do período escolhido. Ponta vazia significa sem
 * limite naquele lado.
 *
 * Registro sem data fica de fora quando alguma ponta está preenchida: dizer que
 * ele cabe no período pedido seria mentira.
 */
export function dentroDoPeriodo(
  data: string | null,
  de: string,
  ate: string,
): boolean {
  const inicio = de.trim();
  const fim = ate.trim();
  if (inicio === "" && fim === "") return true;
  if (!data) return false;
  if (inicio !== "" && data < inicio) return false;
  if (fim !== "" && data > fim) return false;
  return true;
}

/**
 * Mês de referência do registro (yyyy-MM-01, como o banco guarda) igual ao mês
 * escolhido no FiltroMes (yyyy-MM). Mês vazio significa todos os meses.
 */
export function mesmoMesReferencia(
  competencia: string | null,
  mes: string,
): boolean {
  if (mes.trim() === "") return true;
  return competencia !== null && competencia === mesParaCompetencia(mes);
}

/**
 * Opções de select montadas a partir dos próprios dados da tela, em ordem
 * alfabética pt-BR. Filtro que oferece opção sem nenhuma linha só devolve lista
 * vazia, então as opções saem do que está na tela, não do cadastro inteiro.
 */
export function opcoesDeNomes(nomes: (string | null)[]) {
  const unicos = new Set<string>();
  for (const nome of nomes) {
    if (nome !== null && nome.trim() !== "") unicos.add(nome);
  }
  return [...unicos]
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .map((nome) => ({ valor: nome, rotulo: nome }));
}
