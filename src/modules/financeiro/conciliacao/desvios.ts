import { formatarBRL } from "@/lib/formatadores";

/**
 * Mês conciliado e fechado cujo saldo do app no último dia mudou depois do
 * fechamento (`fn_conciliacao_desvios`). As travas do PR 1 impedem o caminho
 * normal; o que sobra é mudança feita fora das RPCs (carga, migration, ajuste
 * direto no banco), e é exatamente o que ninguém veria sem este aviso.
 */
export interface DesvioDoFechamento {
  mes: string;
  saldoFechamento: number;
  saldoAgora: number;
  diferenca: number;
}

const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

export function textoDesvio(d: DesvioDoFechamento): string {
  const [ano, mes] = d.mes.split("-");
  const sinal = d.diferenca < 0 ? "-" : "+";
  return `${MESES[Number(mes) - 1]}/${ano}: o saldo do app no fim do mês mudou ${sinal}${formatarBRL(Math.abs(d.diferenca))} depois do fechamento`;
}
