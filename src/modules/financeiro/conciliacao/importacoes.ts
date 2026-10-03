import { z } from "zod";

/**
 * Histórico de importações de extrato (Bloco G, 03/10/2026) e a cobertura
 * por mês que responde "o que falta importar". Módulo puro: schema do Zod e
 * funções, usado pela página no servidor e pela tela no cliente.
 */

const numero = z.coerce.number();

export const importacaoSchema = z.object({
  id: z.string(),
  contaId: z.string(),
  contaNome: z.string(),
  arquivo: z.string().nullable(),
  periodoInicio: z.string().nullable(),
  periodoFim: z.string().nullable(),
  /** Null para quem não vê saldo da conta, ou quando o arquivo não trouxe. */
  saldoFinal: numero.nullable(),
  temSaldo: z.boolean(),
  importadoEm: z.string(),
  importadoPor: z.string().nullable(),
  inseridas: numero,
  ignoradas: numero,
  conciliados: numero,
  pendentes: numero,
  mesFechado: z.boolean(),
});

export const importacoesSchema = z.array(importacaoSchema);

export type Importacao = z.infer<typeof importacaoSchema>;

/** Situação de um mês na fileira de cobertura da conta. */
export type SituacaoCobertura = "cheio" | "parcial" | "sem";

export interface MesCobertura {
  mes: string;
  situacao: SituacaoCobertura;
}

function diasNoMes(mes: string): number {
  const [ano, m] = mes.split("-").map(Number);
  return new Date(Date.UTC(ano, m, 0)).getUTCDate();
}

/** "2026-09" deslocado n meses (n negativo volta). */
export function deslocarMes(mes: string, n: number): string {
  const [ano, m] = mes.split("-").map(Number);
  const total = ano * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/**
 * Os últimos `quantidade` meses até `ateMes`, cada um "cheio" (os extratos,
 * somados, cobrem do dia 1 ao último dia), "parcial" (cobrem só parte) ou
 * "sem" (nenhum extrato). Dois arquivos que juntos cobrem o mês contam como
 * cheio; o BB de 30/12 a 31/01 deixa dezembro parcial e janeiro cheio.
 */
export function coberturaMeses(
  extratos: readonly {
    periodoInicio: string | null;
    periodoFim: string | null;
  }[],
  ateMes: string,
  quantidade = 12,
): MesCobertura[] {
  const meses: MesCobertura[] = [];
  for (let i = quantidade - 1; i >= 0; i -= 1) {
    const mes = deslocarMes(ateMes, -i);
    const ultimo = diasNoMes(mes);
    const cobertos = new Set<number>();
    for (const e of extratos) {
      if (!e.periodoInicio || !e.periodoFim) continue;
      const inicio =
        e.periodoInicio > `${mes}-01` ? e.periodoInicio : `${mes}-01`;
      const fimMes = `${mes}-${String(ultimo).padStart(2, "0")}`;
      const fim = e.periodoFim < fimMes ? e.periodoFim : fimMes;
      if (inicio > fim) continue;
      for (
        let d = Number(inicio.slice(8, 10));
        d <= Number(fim.slice(8, 10));
        d += 1
      ) {
        cobertos.add(d);
      }
    }
    meses.push({
      mes,
      situacao:
        cobertos.size === 0
          ? "sem"
          : cobertos.size === ultimo
            ? "cheio"
            : "parcial",
    });
  }
  return meses;
}
