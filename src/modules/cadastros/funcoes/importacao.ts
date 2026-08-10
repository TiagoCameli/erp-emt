import type { ColunaImportacao } from "@/lib/importacao";

/** Forma de uma linha lida da planilha de importação de funções. */
export interface FuncaoImportacao {
  nome: string;
  salarioBase: number | null;
  cbo: string | null;
  ativo: boolean;
}

function textoOuNull(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim();
  return texto.length > 0 ? texto : null;
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

const VALORES_ATIVO_NAO = ["nao", "não", "n", "false", "0", "inativo"];

/**
 * Colunas da planilha de importação de funções. Os exemplos e rótulos
 * batem com o modelo gerado no route handler (modelo/route.ts).
 */
export const COLUNAS_FUNCAO: ColunaImportacao<FuncaoImportacao>[] = [
  {
    chave: "nome",
    rotulo: "Nome",
    obrigatoria: true,
    exemplo: "Pedreiro",
    transformar: (valor) => String(valor).trim(),
    validar: (valor) =>
      typeof valor === "string" && valor.trim().length >= 2
        ? null
        : "O nome precisa ter pelo menos 2 caracteres",
  },
  {
    chave: "salarioBase",
    rotulo: "Salário base",
    exemplo: "2.500,00",
    transformar: (valor) => {
      if (typeof valor === "number") return valor;
      const texto = String(valor).trim();
      if (texto === "") return null;
      const numero = paraNumero(texto);
      if (!Number.isFinite(numero)) {
        throw new Error("valor inválido");
      }
      return numero;
    },
    validar: (valor) => {
      if (valor === null || valor === undefined) return null;
      const numero = valor as number;
      if (numero < 0) return "O salário base não pode ser negativo";
      if (casasDecimais(numero) > 2) {
        return "O salário base aceita no máximo 2 casas decimais";
      }
      return null;
    },
  },
  {
    chave: "cbo",
    rotulo: "CBO",
    exemplo: "7152-10",
    transformar: textoOuNull,
  },
  {
    chave: "ativo",
    rotulo: "Ativo",
    exemplo: "sim",
    // Célula vazia não passa por transformar: a chamada quem resolve o
    // default (true) é a Server Action, ao montar a linha para inserir.
    transformar: (valor) => {
      const texto = String(valor).trim().toLowerCase();
      return !VALORES_ATIVO_NAO.includes(texto);
    },
  },
];
