/** Função enxuta o suficiente para calcular o salário sugerido. */
export interface FuncaoParaSalario {
  id: string;
  salarioBase: number | null;
}

/**
 * Salário sugerido ao trocar a função do colaborador no formulário (Bloco 3,
 * Task 3). Pura: sem I/O, sem estado — o form-drawer chama isso só na troca
 * ativa do Combobox (`onValorChange`), nunca no load/reset do formulário.
 *
 * Regra: só sugere quando a função realmente mudou (`funcaoIdNova !==
 * funcaoIdAnterior`) e a função nova tem `salarioBase` cadastrado. Em
 * qualquer outro caso (mesma função, sem função escolhida, função sem
 * salário base, função não encontrada na lista) devolve `null` — o chamador
 * não deve mexer no campo de salário.
 */
export function salarioSugerido(
  funcaoIdAnterior: string | null,
  funcaoIdNova: string | null,
  funcoes: FuncaoParaSalario[],
): number | null {
  if (funcaoIdNova === null) return null;
  if (funcaoIdNova === funcaoIdAnterior) return null;

  const funcao = funcoes.find((f) => f.id === funcaoIdNova);
  return funcao?.salarioBase ?? null;
}
