/**
 * Vencimento de um lançamento da folha: o dia configurado, no mês seguinte à
 * competência. Dia que não existe no mês cai no último dia (31 em fevereiro
 * vira 28 ou 29). Sem dia configurado devolve null, e o Financeiro preenche.
 *
 * A mesma regra existe em SQL na fn_vencimento_folha: as duas têm que dar o
 * mesmo dia nos casos de borda (mesmo cuidado do Bloco 7 entre a lógica pura e
 * a fn_gerar_folha). Datas em UTC de propósito: são datas civis (yyyy-MM-dd),
 * sem hora, então fuso não entra na conta.
 */
export function vencimentoFolha(
  competencia: string,
  dia: number | null,
): string | null {
  if (dia === null) return null;

  const [ano, mes] = competencia.split("-").map(Number);
  // Date.UTC(ano, mes + 1, 0) = último dia do mês de índice `mes`, que é o mês
  // seguinte à competência (mes vem 1-based do ISO, e o índice é 0-based).
  const ultimoDiaDoMesSeguinte = new Date(
    Date.UTC(ano, mes + 1, 0),
  ).getUTCDate();
  const diaFinal = Math.min(dia, ultimoDiaDoMesSeguinte);

  return new Date(Date.UTC(ano, mes, diaFinal)).toISOString().slice(0, 10);
}
