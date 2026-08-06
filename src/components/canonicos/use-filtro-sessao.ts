"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

import {
  assinarFiltrosSessao,
  lerFiltroSessao,
  salvarFiltroSessao,
} from "@/components/canonicos/filtros-sessao";

/**
 * Filtro de texto livre ou de valor solto: o par é `[string, (v: string) => void]`.
 *
 * Esta sobrecarga existe para a inferência NÃO estreitar no literal do valor
 * inicial. Com uma assinatura genérica única, `useFiltroSessao("busca", "")`
 * inferia `T = ""` e a tela não conseguia mais escrever nenhum outro texto no
 * filtro.
 */
export function useFiltroSessao(
  nome: string,
  inicial: string,
): [string, (valor: string) => void];

/**
 * Filtro de união de literais (ex. `"ativos" | "inativos" | "todos"`). Exige a
 * lista do que é válido, porque o valor vem do armazenamento do navegador e
 * precisa ser conferido antes de chegar na tela.
 */
export function useFiltroSessao<T extends string>(
  nome: string,
  inicial: T,
  valoresValidos: readonly T[],
): [T, (valor: T) => void];

/**
 * `useState` de filtro que lembra a escolha enquanto o usuário trabalha.
 *
 * Troca direta pelo `React.useState("")` das listagens que guardam filtro em
 * estado local: mesma assinatura, mesmo par [valor, setValor]. O valor volta ao
 * entrar num registro e voltar, e ao circular pelo menu lateral; morre quando a
 * aba fecha. Ver `filtros-sessao.ts` para o porquê de sessão e não banco.
 *
 * NÃO existe estado local aqui, de propósito: o `sessionStorage` é a fonte, lida
 * por `useSyncExternalStore`. Duas alternativas foram descartadas. Ler o
 * armazenamento no inicializador do `useState` quebra a hidratação, porque todo
 * componente cliente do Next renderiza primeiro no servidor, onde
 * `sessionStorage` não existe: o servidor devolveria o padrão, o cliente o valor
 * lembrado, e o React descartaria a árvore. Copiar para estado local dentro de um
 * efeito resolve a hidratação mas chama `setState` em efeito, o que dispara
 * render em cascata (e o lint do projeto barra, com razão).
 *
 * `useSyncExternalStore` resolve os dois: o `getServerSnapshot` devolve null no
 * servidor e na hidratação, então o primeiro quadro casa; depois o React troca
 * para o valor do cliente sozinho. De brinde, duas telas lendo o mesmo filtro
 * ficam sempre coerentes.
 */
export function useFiltroSessao<T extends string>(
  nome: string,
  inicial: T,
  valoresValidos?: readonly T[],
): [T, (valor: T) => void] {
  const rota = usePathname();

  const lerCliente = React.useCallback(
    () => lerFiltroSessao(rota, nome),
    [rota, nome],
  );

  // Servidor e primeiro quadro do cliente: nada lembrado, cai no padrão da tela.
  const lerServidor = React.useCallback(() => null, []);

  const guardado = React.useSyncExternalStore(
    assinarFiltrosSessao,
    lerCliente,
    lerServidor,
  );

  /**
   * Valor guardado quando serve, padrão da tela quando não.
   *
   * A conferência contra `valoresValidos` é o que impede o pior caso do filtro
   * tipado: o armazenamento é editável pelo usuário e guarda valor de versão
   * anterior da tela, e um valor fora da união não casaria com nenhuma
   * comparação, deixando a listagem VAZIA. Lista vazia num app de dinheiro lê
   * como "sumiu registro".
   */
  const valor =
    guardado !== null &&
    (!valoresValidos || valoresValidos.includes(guardado as T))
      ? (guardado as T)
      : inicial;

  const definir = React.useCallback(
    (novo: T) => {
      salvarFiltroSessao(rota, nome, novo);
    },
    [rota, nome],
  );

  return [valor, definir];
}
