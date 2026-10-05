import { z } from "zod";

/**
 * Histórico de importações de extrato (Bloco G, 03/10/2026) e a cobertura
 * por mês que responde "o que falta importar". Módulo puro: schema do Zod e
 * funções, usado pela página no servidor e pela tela no cliente.
 */

const numero = z.coerce.number();

/**
 * Primeiro mês em que a conciliação bancária é exigida (Tiago, 05/10/2026):
 * de setembro de 2026 em diante. Antes disso o app não cobra extrato,
 * pendência nem fechamento.
 */
export const INICIO_DA_CONCILIACAO = "2026-09";

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
  /** Primeiro mês exigido ("YYYY-MM"): antes dele não entra na cobertura. */
  desde?: string,
): MesCobertura[] {
  const meses: MesCobertura[] = [];
  for (let i = quantidade - 1; i >= 0; i -= 1) {
    const mes = deslocarMes(ateMes, -i);
    if (desde && mes < desde) continue;
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

/** O mínimo de uma conta para descobrir de qual conta é um OFX. */
export interface ContaParaArquivo {
  id: string;
  nome: string;
  /** Número como cadastrado ("102.124-9"). */
  numero: string | null;
  ativo: boolean;
  tipo: string;
  contaPaiId: string | null;
}

export type ContaDoArquivo =
  | { conta: ContaParaArquivo }
  | { erro: string; candidatas: ContaParaArquivo[] };

/**
 * A conta de um OFX pelos dígitos do ACCTID (Bloco M), com a mesma regra de
 * `contaDoArquivoConfere`: um termina com o outro, porque o banco às vezes
 * põe a agência na frente. Só contas ativas, corrente ou caixa, que não são
 * subconta. Nenhuma ou mais de uma: recusa e diz quais.
 */
export function resolverContaDoArquivo(
  digitos: string,
  contas: readonly ContaParaArquivo[],
): ContaDoArquivo {
  if (!digitos) {
    return { erro: "O arquivo não diz de qual conta é: escolha a conta", candidatas: [] };
  }
  const elegiveis = contas.filter(
    (c) => c.ativo && (c.tipo === "corrente" || c.tipo === "caixa") && !c.contaPaiId,
  );
  const candidatas = elegiveis.filter((c) => {
    const doCadastro = (c.numero ?? "").replace(/\D/g, "");
    return doCadastro !== "" && (digitos.endsWith(doCadastro) || doCadastro.endsWith(digitos));
  });
  if (candidatas.length === 1) return { conta: candidatas[0] };
  if (candidatas.length === 0) {
    return { erro: `Nenhuma conta cadastrada termina com ${digitos}: escolha a conta`, candidatas };
  }
  return {
    erro: `Mais de uma conta combina com ${digitos} (${candidatas.map((c) => c.nome).join(", ")}): escolha a conta`,
    candidatas,
  };
}
