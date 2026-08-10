/**
 * Colunas e parsers da importação de lançamentos por planilha.
 *
 * Uma linha = um lançamento. As parcelas saem da coluna Vencimento, que aceita
 * mais de uma data separada por ponto e vírgula ("10/07/2026; 10/08/2026"), e o
 * valor é dividido igualmente entre elas (a sobra de centavo vai na primeira,
 * regra que vive no banco, em fn_importar_lancamentos).
 *
 * A coluna Data de pagamento faz a mesma planilha carregar o histórico já pago:
 * cada data preenchida marca a parcela correspondente como aprovada e paga.
 * Duas datas de pagamento numa linha de três vencimentos = duas pagas, uma em
 * aberto. É o que permite carregar anos de histórico numa passada.
 *
 * Módulo puro: sem React, sem banco. Os parsers são testados em Vitest.
 */

/** Uma linha lida da planilha de lançamentos. */
export interface LinhaLancamento {
  tipo: string;
  dataLancamento: string;
  competencia: string;
  valor: number;
  fornecedor: string;
  documentoFornecedor: string | null;
  descricao: string | null;
  categoria: string;
  centroCusto: string;
  formaPagamento: string | null;
  vencimentos: string[];
  conta: string | null;
  pagamentos: string[];
  numeroDocumento: string | null;
  ordemCompra: string | null;
  planoContas: string | null;
  quemPaga: string | null;
  observacoes: string | null;
}

const TIPOS: Record<string, "a_pagar" | "a_receber"> = {
  "a pagar": "a_pagar",
  a_pagar: "a_pagar",
  pagar: "a_pagar",
  despesa: "a_pagar",
  "a receber": "a_receber",
  a_receber: "a_receber",
  receber: "a_receber",
  receita: "a_receber",
};

/**
 * Data em qualquer um dos três formatos que aparecem numa planilha real:
 * célula de data do Excel, serial numérico (quando a coluna perde o formato) e
 * texto dd/mm/aaaa. Devolve aaaa-mm-dd, que é o que o Postgres aceita direto.
 *
 * O serial do Excel conta dias desde 30/12/1899. Só tratamos a faixa 20000 a
 * 60000 (1954 a 2064) para não confundir um valor solto com data.
 */
export function parseData(valor: unknown): string | null {
  if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  if (typeof valor === "number" && valor > 20000 && valor < 60000) {
    return new Date(Date.UTC(1899, 11, 30) + valor * 86400000)
      .toISOString()
      .slice(0, 10);
  }
  const texto = String(valor ?? "").trim();
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(texto);
  if (br) {
    return `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(texto);
  if (iso) return iso[0];
  const serial = Number(texto);
  if (Number.isFinite(serial) && serial > 20000 && serial < 60000) {
    return new Date(Date.UTC(1899, 11, 30) + serial * 86400000)
      .toISOString()
      .slice(0, 10);
  }
  return null;
}

/**
 * Lista de datas de uma célula: aceita ponto e vírgula, barra vertical e quebra
 * de linha como separador. Vírgula NÃO separa, porque data brasileira não usa
 * vírgula e o separador de milhar apareceria por engano.
 */
export function parseListaDatas(valor: unknown): string[] {
  if (valor instanceof Date || typeof valor === "number") {
    const uma = parseData(valor);
    return uma ? [uma] : [];
  }
  const texto = String(valor ?? "").trim();
  if (texto === "" || texto === "-") return [];
  return texto
    .split(/[;|\n]/)
    .map((parte) => parseData(parte.trim()))
    .filter((d): d is string => d !== null);
}

/** Valor em reais, aceitando "1.234,56", "1234.56" e número puro. */
export function parseValor(valor: unknown): number {
  if (typeof valor === "number") return valor;
  const texto = String(valor ?? "").trim();
  // Com vírgula, o ponto é separador de milhar. Sem vírgula, o ponto é decimal.
  const normalizado = texto.includes(",")
    ? texto.replace(/\./g, "").replace(",", ".")
    : texto;
  const limpo = normalizado.replace(/[^\d.-]/g, "");
  // Sem isto, "abc" e "" virariam 0 (Number("") é 0) e a linha entraria como
  // zero em vez de acusar erro de digitação.
  if (limpo === "" || limpo === "-" || limpo === ".") return Number.NaN;
  const numero = Number(limpo);
  return Number.isFinite(numero) ? numero : Number.NaN;
}

/** Texto opcional: vazio, "-" e "—" viram null. */
function textoOuNull(valor: unknown): string | null {
  const texto = String(valor ?? "").trim();
  return texto === "" || texto === "-" || texto === "—" ? null : texto;
}

export const COLUNAS_LANCAMENTO = [
  {
    chave: "tipo" as const,
    rotulo: "Tipo",
    exemplo: "A pagar",
    transformar: (valor: unknown) => {
      const texto = String(valor ?? "").trim().toLowerCase();
      if (texto === "" || texto === "-") return "a_pagar";
      const tipo = TIPOS[texto];
      if (!tipo) throw new Error('use "A pagar" ou "A receber"');
      return tipo;
    },
  },
  {
    chave: "dataLancamento" as const,
    rotulo: "Data do lançamento",
    obrigatoria: true,
    exemplo: "07/08/2026",
    transformar: (valor: unknown) => {
      const data = parseData(valor);
      if (!data) throw new Error("informe uma data, ex: 07/08/2026");
      return data;
    },
  },
  {
    chave: "competencia" as const,
    rotulo: "Competência",
    obrigatoria: true,
    exemplo: "07/2026",
    transformar: (valor: unknown) => {
      const data = parseData(valor);
      if (data) return data;
      // Aceita mm/aaaa: competência é mês, o dia 1 é convenção do banco.
      const mes = /^(\d{1,2})\/(\d{4})$/.exec(String(valor ?? "").trim());
      if (mes) return `${mes[2]}-${mes[1].padStart(2, "0")}-01`;
      throw new Error("informe a competência, ex: 07/2026 ou 07/07/2026");
    },
  },
  {
    chave: "valor" as const,
    rotulo: "Valor",
    obrigatoria: true,
    exemplo: "1.500,00",
    transformar: (valor: unknown) => {
      const numero = parseValor(valor);
      if (Number.isNaN(numero)) throw new Error("informe um número, ex: 1500,00");
      if (numero <= 0) throw new Error("o valor precisa ser maior que zero");
      return Number(numero.toFixed(2));
    },
  },
  {
    chave: "fornecedor" as const,
    rotulo: "Pago a",
    obrigatoria: true,
    exemplo: "AGRO PARTS",
    transformar: (valor: unknown) => String(valor ?? "").trim(),
  },
  {
    chave: "documentoFornecedor" as const,
    rotulo: "CNPJ / CPF",
    exemplo: "49.049.295/0001-80",
    transformar: textoOuNull,
  },
  {
    chave: "descricao" as const,
    rotulo: "Descrição",
    exemplo: "Referente a peças para a patrol",
    transformar: textoOuNull,
  },
  {
    chave: "categoria" as const,
    rotulo: "Categoria",
    obrigatoria: true,
    exemplo: "Combustível",
    transformar: (valor: unknown) => String(valor ?? "").trim(),
  },
  {
    chave: "centroCusto" as const,
    rotulo: "Centro de custo",
    obrigatoria: true,
    exemplo: "009 - Manutenção da Rodovia BR-364/AC - Lote 09 & 10",
    transformar: (valor: unknown) => String(valor ?? "").trim(),
  },
  {
    chave: "formaPagamento" as const,
    rotulo: "Forma de pagamento",
    exemplo: "Pix",
    transformar: textoOuNull,
  },
  {
    chave: "vencimentos" as const,
    rotulo: "Vencimento",
    obrigatoria: true,
    exemplo: "10/08/2026; 10/09/2026",
    transformar: (valor: unknown) => {
      const datas = parseListaDatas(valor);
      if (datas.length === 0) {
        throw new Error(
          "informe pelo menos um vencimento; para parcelado, separe por ponto e vírgula",
        );
      }
      return datas;
    },
  },
  {
    chave: "conta" as const,
    rotulo: "Conta",
    exemplo: "BANCO DO BRASIL 102.124-9",
    transformar: textoOuNull,
  },
  {
    chave: "pagamentos" as const,
    rotulo: "Data de pagamento",
    exemplo: "10/08/2026",
    transformar: (valor: unknown) => parseListaDatas(valor),
    validar: (valor: unknown, linha: Partial<LinhaLancamento>) => {
      const pagos = (valor as string[]) ?? [];
      const vencs = linha.vencimentos ?? [];
      if (pagos.length > vencs.length) {
        return "mais datas de pagamento que de vencimento nesta linha";
      }
      if (pagos.length > 0 && !linha.conta) {
        return "linha com pagamento precisa da coluna Conta preenchida";
      }
      return null;
    },
  },
  {
    chave: "numeroDocumento" as const,
    rotulo: "Número do documento",
    exemplo: "NF 1234",
    transformar: textoOuNull,
  },
  {
    chave: "ordemCompra" as const,
    rotulo: "Ordem de compra",
    exemplo: "2547",
    transformar: textoOuNull,
  },
  {
    chave: "planoContas" as const,
    rotulo: "Plano de contas",
    exemplo: "Equipamentos",
    transformar: textoOuNull,
  },
  {
    chave: "quemPaga" as const,
    rotulo: "Quem paga",
    exemplo: "Empresa",
    transformar: textoOuNull,
  },
  {
    chave: "observacoes" as const,
    rotulo: "Observações",
    exemplo: "",
    transformar: textoOuNull,
  },
];
