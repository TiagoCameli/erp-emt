import type { ColunaImportacao } from "@/lib/importacao";

/** Forma de uma linha lida da planilha de importação de encargos. */
export interface EncargoImportacao {
  nome: string;
  percentual: number;
  ativo: boolean;
}

/** Converte texto pt-BR (ponto = milhar, vírgula = decimal) em número. */
function paraNumero(texto: string): number {
  const limpo = texto.trim().replace(/\./g, "").replace(",", ".");
  return Number(limpo);
}

/** Quantas casas decimais um número tem, pela representação decimal. */
function casasDecimais(valor: number): number {
  const texto = valor.toString();
  const ponto = texto.indexOf(".");
  return ponto === -1 ? 0 : texto.length - ponto - 1;
}

const PERCENTUAL_MAX = 100;

/** Converte o valor bruto da célula de percentual (número ou texto pt-BR) em número. */
function paraNumeroPercentual(valor: unknown): number {
  if (typeof valor === "number") return valor;
  const numero = paraNumero(String(valor));
  if (!Number.isFinite(numero)) {
    throw new Error("percentual inválido");
  }
  return numero;
}

/** Valida o percentual convertido: 0..100, no máximo 3 casas decimais. */
function validarPercentual(valor: unknown): string | null {
  const numero = valor as number;
  if (numero < 0) return "O percentual não pode ser negativo";
  if (numero > PERCENTUAL_MAX) return "O percentual vai de 0 a 100";
  if (casasDecimais(numero) > 3) {
    return "O percentual aceita no máximo 3 casas decimais";
  }
  return null;
}

const VALORES_ATIVO_NAO = ["nao", "não", "n", "false", "0", "inativo"];

/**
 * Colunas da planilha de importação de encargos. Os exemplos e rótulos
 * batem com o modelo gerado no route handler (modelo/route.ts).
 */
export const COLUNAS_ENCARGO: ColunaImportacao<EncargoImportacao>[] = [
  {
    chave: "nome",
    rotulo: "Nome",
    obrigatoria: true,
    exemplo: "INSS patronal",
    transformar: (valor) => String(valor).trim(),
    validar: (valor) =>
      typeof valor === "string" && valor.trim().length >= 2
        ? null
        : "O nome precisa ter pelo menos 2 caracteres",
  },
  {
    chave: "percentual",
    rotulo: "Percentual",
    obrigatoria: true,
    exemplo: "20",
    transformar: paraNumeroPercentual,
    validar: validarPercentual,
  },
  {
    chave: "ativo",
    rotulo: "Ativo",
    exemplo: "sim",
    // Célula vazia não passa por transformar: quem resolve o default (true)
    // é a Server Action, ao montar a linha para inserir/importar.
    transformar: (valor) => {
      const texto = String(valor).trim().toLowerCase();
      return !VALORES_ATIVO_NAO.includes(texto);
    },
  },
];
