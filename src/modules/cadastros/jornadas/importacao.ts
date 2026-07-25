import type { ColunaImportacao } from "@/lib/importacao";
import { DIAS_SEMANA } from "@/modules/cadastros/jornadas/formato";

/** Forma de uma linha lida da planilha de importação de jornadas. */
export interface JornadaImportacao {
  nome: string;
  horasSegunda: number;
  horasTerca: number;
  horasQuarta: number;
  horasQuinta: number;
  horasSexta: number;
  horasSabado: number;
  horasDomingo: number;
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

const HORAS_MAX = 24;

/** Converte o valor bruto da célula de horas (número ou texto pt-BR) em número. */
function paraNumeroHoras(valor: unknown): number {
  if (typeof valor === "number") return valor;
  const numero = paraNumero(String(valor));
  if (!Number.isFinite(numero)) {
    throw new Error("hora inválida");
  }
  return numero;
}

/** Valida a hora convertida: 0..24, no máximo 2 casas decimais. */
function validarHoras(valor: unknown): string | null {
  const numero = valor as number;
  if (numero < 0) return "As horas não podem ser negativas";
  if (numero > HORAS_MAX) return "As horas vão de 0 a 24";
  if (casasDecimais(numero) > 2) {
    return "As horas aceitam no máximo 2 casas decimais";
  }
  return null;
}

/** Uma coluna por dia da semana, na mesma ordem de DIAS_SEMANA (segunda a domingo). */
const COLUNAS_HORAS: ColunaImportacao<JornadaImportacao>[] = DIAS_SEMANA.map(
  (dia): ColunaImportacao<JornadaImportacao> => ({
    chave: dia.chave,
    rotulo: dia.rotulo,
    exemplo: "8",
    transformar: paraNumeroHoras,
    validar: validarHoras,
  }),
);

const VALORES_ATIVO_NAO = ["nao", "não", "n", "false", "0", "inativo"];

/**
 * Colunas da planilha de importação de jornadas. Os exemplos e rótulos
 * batem com o modelo gerado no route handler (modelo/route.ts).
 */
export const COLUNAS_JORNADA: ColunaImportacao<JornadaImportacao>[] = [
  {
    chave: "nome",
    rotulo: "Nome",
    obrigatoria: true,
    exemplo: "Padrão EMT",
    transformar: (valor) => String(valor).trim(),
    validar: (valor) =>
      typeof valor === "string" && valor.trim().length >= 2
        ? null
        : "O nome precisa ter pelo menos 2 caracteres",
  },
  ...COLUNAS_HORAS,
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
