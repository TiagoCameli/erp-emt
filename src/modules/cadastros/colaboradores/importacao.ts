import type { ColunaImportacao } from "@/lib/importacao";
import { VINCULOS, type Vinculo } from "@/modules/cadastros/colaboradores/schemas";

/** Formato da linha lida da planilha de importação de colaboradores. */
export interface LinhaImportacao {
  nome: string;
  cpf: string | null;
  funcao: string | null;
  vinculo: Vinculo;
  obra: string | null;
}

const VINCULOS_VALIDOS = VINCULOS.join(", ");

function paraTexto(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  return String(valor).trim();
}

/**
 * Colunas da planilha de colaboradores. A obra é resolvida pelo nome na
 * importação; o vínculo precisa ser um dos valores aceitos.
 */
export const colunasImportacao: ColunaImportacao<LinhaImportacao>[] = [
  {
    chave: "nome",
    rotulo: "Nome",
    obrigatoria: true,
    exemplo: "Jose da Silva",
    transformar: paraTexto,
  },
  {
    chave: "cpf",
    rotulo: "CPF",
    exemplo: "000.000.000-00",
    transformar: (valor) => paraTexto(valor) || null,
  },
  {
    chave: "funcao",
    rotulo: "Funcao",
    exemplo: "Operador",
    transformar: (valor) => paraTexto(valor) || null,
  },
  {
    chave: "vinculo",
    rotulo: "Vinculo",
    exemplo: "clt",
    transformar: (valor) => paraTexto(valor).toLowerCase(),
    validar: (valor) =>
      VINCULOS.includes(valor as Vinculo)
        ? null
        : `Vínculo inválido. Use um destes: ${VINCULOS_VALIDOS}`,
  },
  {
    chave: "obra",
    rotulo: "Obra",
    exemplo: "BR-364 Lote 09",
    transformar: (valor) => paraTexto(valor) || null,
  },
];
