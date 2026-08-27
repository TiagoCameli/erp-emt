"use client";

import type { BaseSyntheticEvent } from "react";
import type {
  FieldValues,
  SubmitHandler,
  UseFormReturn,
} from "react-hook-form";

import { toast } from "@/components/canonicos/toast";

/**
 * Chaves internas do react-hook-form dentro de um nó de erro. `ref` guarda o
 * elemento do DOM e é cíclica: percorrer por dentro dela trava a varredura.
 */
const CHAVES_INTERNAS = new Set(["ref", "message", "type", "types"]);

/**
 * Todas as mensagens de erro da árvore de `formState.errors`, na ordem em que
 * aparecem. A árvore é aninhada (`parcelas.3.valor`, `centrosCusto.0.insumos.1`)
 * e cada nó pode ou não ter `message` — por isso a varredura é recursiva e não
 * um `Object.values`.
 */
export function mensagensDeErro(
  erros: unknown,
  saida: string[] = [],
): string[] {
  if (!erros || typeof erros !== "object") return saida;

  const no = erros as Record<string, unknown>;
  if (typeof no.message === "string" && no.message !== "") {
    saida.push(no.message);
  }

  for (const [chave, valor] of Object.entries(no)) {
    if (CHAVES_INTERNAS.has(chave)) continue;
    mensagensDeErro(valor, saida);
  }
  return saida;
}

/**
 * Rola até o primeiro erro DENTRO do formulário que foi enviado.
 *
 * Vai pelo DOM (`role="alert"`, que é o que CampoFormulario e TabelaItens usam)
 * em vez de pelo `ref` do react-hook-form porque a maioria dos controles daqui é
 * Combobox/InputMoeda escrito com `setValue`, sem `register`: eles não têm ref
 * registrada, e é justamente por isso que o `shouldFocusError` do próprio
 * react-hook-form não move nada nessas telas.
 *
 * O rAF duplo espera o React pintar as mensagens: no instante do `onInvalid` os
 * `role="alert"` ainda não existem no DOM.
 */
function rolarAteOPrimeiroErro(evento?: BaseSyntheticEvent): void {
  const formulario = evento?.target;
  if (!(formulario instanceof HTMLElement)) return;
  if (typeof window === "undefined") return;

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      const alvo = formulario.querySelector<HTMLElement>('[role="alert"]');
      // `scrollIntoView` não existe no jsdom, e este callback roda fora da pilha
      // do submit: sem a checagem, o que quebra é o processo do teste, não a
      // rolagem.
      if (typeof alvo?.scrollIntoView !== "function") return;
      alvo.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  });
}

/** "Faltam R$ 100,00 ... (e mais 2 campos a corrigir)" */
function textoDoAviso(mensagens: string[]): string {
  const primeira = mensagens[0];
  if (!primeira) {
    return "Revise os campos destacados em vermelho antes de salvar";
  }
  const resto = mensagens.length - 1;
  if (resto === 0) return primeira;
  return `${primeira} (e mais ${resto} ${resto === 1 ? "campo" : "campos"} a corrigir)`;
}

/**
 * `handleSubmit` que AVISA quando a validação recusa o envio.
 *
 * Use no lugar de `form.handleSubmit(aoEnviar)` em todo formulário do app.
 *
 * **Por que existe:** o `handleSubmit` do react-hook-form, com um argumento só,
 * apenas popula `formState.errors` quando a validação falha. Em formulário curto
 * isso basta, porque o campo vermelho está à vista. Nos formulários de tela
 * cheia — OC, lançamento, colaborador — o campo com erro fica seções abaixo do
 * rodapé fixo onde mora o botão: clicar em "Salvar" não muda UM PIXEL da tela.
 *
 * Foi exatamente o que o Tiago reportou em 27/08/2026 numa OC dividida entre PIX
 * e cartão: reproduzido na OC-2026-0026 mudando o preço do item de R$ 15.400,00
 * para R$ 15.500,00 e clicando em "Salvar ordem" — as duas mensagens ("Faltam
 * R$ 100,00" e "As parcelas não fecham com o total") nasceram a 600 px abaixo da
 * área visível, sem toast, sem rolagem e sem foco. O botão parecia morto.
 *
 * O que este envelope acrescenta: um toast com a primeira mensagem (e a contagem
 * do resto) e a rolagem até o primeiro erro. A validação em si não muda.
 */
export function submeterComAviso<
  TCampos extends FieldValues,
  TContexto = unknown,
  TSaida = TCampos,
>(
  /**
   * Os três parâmetros do `UseFormReturn` vêm até aqui de propósito: schema com
   * `.default()` tem entrada diferente da saída, e o form desses formulários é
   * `UseFormReturn<entrada, contexto, saída>`. Fixar só o primeiro fazia o tsc
   * recusar metade das telas do app.
   */
  form: UseFormReturn<TCampos, TContexto, TSaida>,
  aoEnviar: SubmitHandler<TSaida>,
): (evento?: BaseSyntheticEvent) => Promise<void> {
  return form.handleSubmit(aoEnviar, (erros, evento) => {
    toast.error(textoDoAviso(mensagensDeErro(erros)));
    rolarAteOPrimeiroErro(evento);
  });
}
