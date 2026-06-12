import type { ColunaImportacao } from "@/lib/importacao";
import { TIPOS_FORNECEDOR } from "@/modules/cadastros/fornecedores/schemas";

/** Forma de uma linha lida da planilha de fornecedores. */
export interface FornecedorImportacao {
  tipo: string;
  razaoSocial: string;
  cnpjCpf: string | null;
  cidade: string | null;
  uf: string | null;
}

function textoOuNull(valor: unknown): string | null {
  if (valor === null || valor === undefined) return null;
  const texto = String(valor).trim();
  return texto.length > 0 ? texto : null;
}

/**
 * Colunas da planilha de importação de fornecedores. Os exemplos e rótulos
 * batem com o modelo gerado no route handler. Usadas tanto na validação
 * quanto na inserção em massa.
 */
export const COLUNAS_FORNECEDOR: ColunaImportacao<FornecedorImportacao>[] = [
  {
    chave: "tipo",
    rotulo: "Tipo",
    exemplo: "pj",
    transformar: (valor) => String(valor).trim().toLowerCase(),
    validar: (valor) =>
      (TIPOS_FORNECEDOR as readonly string[]).includes(valor as string)
        ? null
        : "Tipo deve ser pf ou pj",
  },
  {
    chave: "razaoSocial",
    rotulo: "Razao social",
    obrigatoria: true,
    exemplo: "Brita Acre LTDA",
    transformar: (valor) => String(valor).trim(),
  },
  {
    chave: "cnpjCpf",
    rotulo: "CNPJ/CPF",
    exemplo: "00.000.000/0001-00",
    transformar: textoOuNull,
  },
  {
    chave: "cidade",
    rotulo: "Cidade",
    exemplo: "Cruzeiro do Sul",
    transformar: textoOuNull,
  },
  {
    chave: "uf",
    rotulo: "UF",
    exemplo: "AC",
    transformar: (valor) => {
      const texto = textoOuNull(valor);
      return texto ? texto.toUpperCase() : null;
    },
    validar: (valor) =>
      valor === null || String(valor).length === 2
        ? null
        : "UF deve ter 2 letras",
  },
];
