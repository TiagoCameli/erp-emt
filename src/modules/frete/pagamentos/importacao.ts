import { CASAS_VALOR_OPERACIONAL } from "@/lib/casas-decimais";
import { normalizarNumeroDigitado } from "@/lib/numero-digitado";
import { ehMetodoPagamento, type DadosPagamento, type MetodoPagamento } from "@/modules/frete/pagamentos/regras";

/**
 * Importação de pagamentos de frete por planilha, igual à da origem
 * (PagamentoFreteForm, "Importar do Excel", template_pagamentos_frete.xlsx, aba
 * "Pagamentos"). Módulo puro: a action lê o .xlsx e passa as células cruas para cá.
 *
 * O que muda por necessidade:
 * - a transportadora é casada pelo nome com o cadastro (fornecedor marcado como
 *   transportadora ou dono de tanque), porque o ERP grava o id; a origem gravava o texto;
 * - o mês referência precisa ser um mês de verdade ("AAAA-MM"), porque o banco guarda
 *   data; a origem aceitava qualquer texto;
 * - "Pago por" é obrigatório (o banco exige; a origem aceitava vazio);
 * - método combustível recusa a linha: o modelo não tem coluna de litros e o banco exige
 *   litros > 0 (a origem gravava 0 litros);
 * - o número lê o formato brasileiro ("1.234,56"); a origem trocava só a primeira vírgula
 *   e lia 1,234.
 */

/** Célula já normalizada pelo `lerEValidarXlsx`. */
export type Celula = string | number | boolean | Date | null | undefined;

export function textoDaCelula(valor: Celula): string {
  if (valor === null || valor === undefined) return "";
  if (valor instanceof Date) return dataDaCelula(valor) ?? "";
  return String(valor).trim();
}

function doisDigitos(n: number): string {
  return String(n).padStart(2, "0");
}

/** Número de série do Excel (dias desde 30/12/1899) para "AAAA-MM-DD". */
function serialParaDia(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1) return null;
  const ms = Math.round(serial) * 86_400_000 + Date.UTC(1899, 11, 30);
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${doisDigitos(d.getUTCMonth() + 1)}-${doisDigitos(d.getUTCDate())}`;
}

function diaValido(ano: number, mes: number, dia: number): string | null {
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return `${ano}-${doisDigitos(mes)}-${doisDigitos(dia)}`;
}

/**
 * O `parseData` da origem: data do Excel, número de série, "AAAA-M-D" ou "D/M/AAAA".
 * Nulo quando não é data (a origem devolvia o texto cru e o banco recusava depois).
 */
export function dataDaCelula(valor: Celula): string | null {
  if (valor === null || valor === undefined || valor === "") return null;
  // O exceljs entrega a data da célula como meia-noite UTC.
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    return `${valor.getUTCFullYear()}-${doisDigitos(valor.getUTCMonth() + 1)}-${doisDigitos(valor.getUTCDate())}`;
  }
  if (typeof valor === "number") return serialParaDia(valor);
  const texto = String(valor).trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(texto);
  if (iso) return diaValido(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto);
  if (br) return diaValido(Number(br[3]), Number(br[2]), Number(br[1]));
  return null;
}

/** Mês referência: "AAAA-MM" (o do modelo), "MM/AAAA", ou uma data (vale o mês dela). */
export function mesDaCelula(valor: Celula): string | null {
  if (valor === null || valor === undefined || valor === "") return null;
  if (valor instanceof Date || typeof valor === "number") return dataDaCelula(valor)?.slice(0, 7) ?? null;
  const texto = String(valor).trim();
  const iso = /^(\d{4})-(\d{1,2})$/.exec(texto);
  if (iso && Number(iso[2]) >= 1 && Number(iso[2]) <= 12) return `${iso[1]}-${doisDigitos(Number(iso[2]))}`;
  const br = /^(\d{1,2})\/(\d{4})$/.exec(texto);
  if (br && Number(br[1]) >= 1 && Number(br[1]) <= 12) return `${br[2]}-${doisDigitos(Number(br[1]))}`;
  return dataDaCelula(texto)?.slice(0, 7) ?? null;
}

export type NumeroLido = { numero: number } | { erro: "vazio" | "invalido" };

/** Número da célula com até `casas` casas. Texto lê o formato brasileiro. */
export function numeroDaCelula(valor: Celula, casas: number): NumeroLido {
  if (valor === null || valor === undefined || valor === "") return { erro: "vazio" };
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) return { erro: "invalido" };
    const escala = 10 ** casas;
    if (Math.abs(Math.round(valor * escala) - valor * escala) > 1e-6) return { erro: "invalido" };
    return { numero: valor };
  }
  if (typeof valor !== "string") return { erro: "invalido" };
  const texto = valor.trim().replace(/^R\$\s*/i, "");
  if (texto === "") return { erro: "vazio" };
  const normalizado = normalizarNumeroDigitado(texto, casas);
  if (normalizado === null) return { erro: "invalido" };
  return { numero: Number(normalizado.replace(",", ".")) };
}

/** Nome para casar: minúsculas, sem acento, espaço único. */
export function normalizarNome(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export interface CadastroCasavel {
  id: string;
  /** Todos os nomes pelos quais o registro é conhecido (fantasia, razão social). */
  nomes: string[];
}

export type Casamento = { id: string } | { erro: "nao_encontrado" | "ambiguo" };

/** Casa o nome exato (sem acento e sem caixa) com um registro só. */
export function casarPorNome(nome: string, cadastro: readonly CadastroCasavel[]): Casamento {
  const alvo = normalizarNome(nome);
  const achados = cadastro.filter((c) => c.nomes.some((n) => normalizarNome(n) === alvo));
  if (achados.length === 0) return { erro: "nao_encontrado" };
  const ids = new Set(achados.map((a) => a.id));
  if (ids.size > 1) return { erro: "ambiguo" };
  return { id: achados[0].id };
}

// ---------------------------------------------------------------------------
// Modelo e linha
// ---------------------------------------------------------------------------

/** Colunas do template_pagamentos_frete.xlsx da origem, na mesma ordem. */
export const COLUNAS_PAGAMENTOS = [
  { chave: "data", rotulo: "Data", exemplo: "2026-01-15" },
  { chave: "transportadora", rotulo: "Transportadora", exemplo: "Transportes ABC" },
  { chave: "mesReferencia", rotulo: "Mês Referência", exemplo: "2026-01" },
  { chave: "valor", rotulo: "Valor", exemplo: "5000" },
  { chave: "metodo", rotulo: "Método", exemplo: "pix" },
  { chave: "responsavel", rotulo: "Responsavel", exemplo: "Carlos Silva" },
  { chave: "nf", rotulo: "NF", exemplo: "NF-001" },
  { chave: "pagoPor", rotulo: "Pago Por", exemplo: "EMT Construtora" },
  { chave: "observacoes", rotulo: "Observações", exemplo: "" },
] as const;

export type ChaveColunaPagamento = (typeof COLUNAS_PAGAMENTOS)[number]["chave"];
export type LinhaCruaPagamento = Partial<Record<ChaveColunaPagamento, Celula>>;

export type LinhaPagamentoLida = { dados: DadosPagamento; erros: [] } | { dados: null; erros: string[] };

function metodoDaCelula(valor: Celula): { metodo: MetodoPagamento } | { erro: string } {
  const bruto = textoDaCelula(valor).toLowerCase();
  if (bruto === "") return { metodo: "pix" };
  const semAcento = normalizarNome(bruto);
  return ehMetodoPagamento(semAcento) ? { metodo: semAcento } : { erro: `Método "${bruto}" inválido` };
}

/**
 * Valida uma linha da planilha com as mensagens da origem ("Falta data", "Falta
 * transportadora", "Falta mês referência", "Falta valor", `Método "x" inválido`, "Falta
 * responsável") e as travas que o banco do ERP exige.
 */
export function lerLinhaPagamento(linha: LinhaCruaPagamento, transportadoras: readonly CadastroCasavel[]): LinhaPagamentoLida {
  const erros: string[] = [];

  const data = dataDaCelula(linha.data);
  if (textoDaCelula(linha.data) === "") erros.push("Falta data");
  else if (!data) erros.push(`Data "${textoDaCelula(linha.data)}" inválida`);

  const nomeTransportadora = textoDaCelula(linha.transportadora);
  let transportadoraId = "";
  if (!nomeTransportadora) erros.push("Falta transportadora");
  else {
    const casado = casarPorNome(nomeTransportadora, transportadoras);
    if ("id" in casado) transportadoraId = casado.id;
    else if (casado.erro === "ambiguo")
      erros.push(`Transportadora "${nomeTransportadora}" tem mais de um cadastro com esse nome`);
    else erros.push(`Transportadora "${nomeTransportadora}" não encontrada`);
  }

  const mes = mesDaCelula(linha.mesReferencia);
  if (textoDaCelula(linha.mesReferencia) === "") erros.push("Falta mês referência");
  else if (!mes) erros.push(`Mês referência "${textoDaCelula(linha.mesReferencia)}" inválido (use AAAA-MM)`);

  const valor = numeroDaCelula(linha.valor, CASAS_VALOR_OPERACIONAL);
  if ("erro" in valor) {
    erros.push(valor.erro === "vazio" ? "Falta valor" : `Valor inválido (até ${CASAS_VALOR_OPERACIONAL} casas)`);
  } else if (!(valor.numero > 0)) erros.push("Valor deve ser > 0");

  const metodo = metodoDaCelula(linha.metodo);
  if ("erro" in metodo) erros.push(metodo.erro);
  else if (metodo.metodo === "combustivel")
    erros.push("Quantidade obrigatória para pagamento em combustível (lance pelo formulário)");

  const responsavel = textoDaCelula(linha.responsavel);
  if (!responsavel) erros.push("Falta responsável");

  const pagoPor = textoDaCelula(linha.pagoPor);
  if (!pagoPor) erros.push("Falta pago por");

  const nf = textoDaCelula(linha.nf);
  if (nf.length > 60) erros.push("NF com mais de 60 caracteres");
  const observacoes = textoDaCelula(linha.observacoes);
  if (observacoes.length > 500) erros.push("Observações com mais de 500 caracteres");

  if (erros.length > 0 || !data || !mes || "erro" in valor || "erro" in metodo) {
    return { dados: null, erros };
  }
  return {
    erros: [],
    dados: {
      data,
      transportadoraId,
      mesReferencia: mes,
      valor: valor.numero,
      metodo: metodo.metodo,
      quantidadeCombustivel: 0,
      responsavel,
      notaFiscal: nf || null,
      pagoPor,
      observacoes: observacoes || null,
    },
  };
}

