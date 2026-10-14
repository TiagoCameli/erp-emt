/**
 * Busca universal do ERP: a mesma regra em toda caixa "Buscar" do sistema.
 *
 * A pessoa digita o que tem na cabeça — "posto ipiranga março 1.500" — e a
 * linha aparece se TODAS as palavras baterem em ALGUM lugar dela: número do
 * documento, fornecedor, insumo, centro de custo, valor, data, mês. Antes cada
 * tela buscava em duas ou três colunas escolhidas à mão, e "Buscar por número
 * ou fornecedor" não achava a OC pelo insumo nem pelo valor.
 *
 * Como funciona: cada linha vira um TEXTO PESQUISÁVEL (minúsculo, sem acento),
 * e cada palavra da busca precisa ser um pedaço desse texto. Valor e data entram
 * no texto em todas as formas que alguém digitaria, então a comparação continua
 * sendo "contém", sem adivinhar se "03/2026" é mês ou "1.500" é valor:
 *
 * - valor 1500 → "1500,00 1.500,00" (casa "1500", "1.500", "1500,00", "R$ 1.500")
 * - data 2026-03-15 → "15/03/2026 2026-03-15 marco/2026 mar/26 03/26"
 * - mês 2026-03-01 → "03/2026 2026-03 marco/2026 mar/26 03/26"
 *
 * As telas que buscam NO BANCO usam o mesmo contrato: a função SQL `busca(...)`
 * (migration `*_busca_universal`) monta o texto com as MESMAS formas, e
 * `aplicarBusca` põe um `like` por palavra na consulta. Mudar uma forma
 * aqui exige mudar lá, e vice-versa — o teste de contrato fica em `busca.test.ts`.
 *
 * Módulo puro, sem React e sem Supabase: roda no client e no servidor.
 */

/** Os nomes dos meses, sem acento, na ordem (índice 0 = janeiro). */
export const MESES_BUSCA = [
  "janeiro",
  "fevereiro",
  "marco",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
] as const;

/** Minúsculo, sem acento e com espaços colapsados. */
export function normalizarBusca(texto: string | null | undefined): string {
  if (!texto) return "";
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Uma palavra da busca, no formato em que ela é procurada no texto.
 *
 * - "R$" na frente sai: "R$1.500" procura "1.500".
 * - Ponto como decimal ("1500.50", hábito do teclado numérico) vira vírgula. Só
 *   com 1 ou 2 casas depois do ponto: "1.500" é milhar e fica como está.
 * - Curingas do `like` (`%`, `_`, `*`) e a barra invertida saem, para a
 *   palavra ser sempre literal.
 */
function normalizarPalavra(palavra: string): string {
  let p = palavra.replace(/^r\$/, "").replace(/[%_*\\"'()]/g, "");
  if (/^\d+\.\d{1,2}$/.test(p)) p = p.replace(".", ",");
  return p;
}

/** As palavras da busca, normalizadas. Busca vazia devolve lista vazia. */
export function palavrasDaBusca(busca: string | null | undefined): string[] {
  return normalizarBusca(busca)
    .split(" ")
    .map(normalizarPalavra)
    .filter((p) => p !== "" && p !== "r$");
}

/** "1500,00 1.500,00" — as duas grafias de um valor em reais. */
export function textoDeValor(
  valor: number | string | null | undefined,
): string {
  if (valor === null || valor === undefined || valor === "") return "";
  const numero = Math.abs(typeof valor === "string" ? Number(valor) : valor);
  if (!Number.isFinite(numero)) return "";
  const [inteiro, decimal] = numero.toFixed(2).split(".");
  const agrupado = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${inteiro},${decimal} ${agrupado},${decimal}`;
}

/** As formas de um mês (ano e mês já separados). */
function formasDoMes(ano: string, mes: string): string[] {
  const nome = MESES_BUSCA[Number(mes) - 1];
  if (!nome) return [];
  const ano2 = ano.slice(2);
  return [
    `${mes}/${ano}`,
    `${ano}-${mes}`,
    `${nome}/${ano}`,
    `${nome.slice(0, 3)}/${ano2}`,
    `${mes}/${ano2}`,
  ];
}

/**
 * Data (`yyyy-MM-dd`, ou o começo de um timestamp) em todas as grafias.
 * Só lê a parte da data da string, sem fuso: quem tem timestamptz converte
 * para o dia local antes (`dataLocalISO`).
 */
export function textoDeData(data: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(data ?? "");
  if (!m) return "";
  const [, ano, mes, dia] = m;
  return [
    `${dia}/${mes}/${ano}`,
    `${ano}-${mes}-${dia}`,
    ...formasDoMes(ano, mes),
  ].join(" ");
}

/** Mês de competência (`yyyy-MM` ou `yyyy-MM-01`) em todas as grafias. */
export function textoDeMes(mes: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})/.exec(mes ?? "");
  if (!m) return "";
  return formasDoMes(m[1], m[2]).join(" ");
}

/** Um pedaço do texto pesquisável de uma linha. */
export type CampoBusca =
  | string
  | number
  | null
  | undefined
  | false
  | { valor: number | string | null | undefined }
  | { data: string | null | undefined }
  | { mes: string | null | undefined }
  | { documento: string | null | undefined }
  | CampoBusca[];

function textoDoCampo(campo: CampoBusca): string {
  if (campo === null || campo === undefined || campo === false) return "";
  if (Array.isArray(campo)) return campo.map(textoDoCampo).join(" ");
  if (typeof campo === "number") return String(campo);
  if (typeof campo === "string") return normalizarBusca(campo);
  if ("valor" in campo) return textoDeValor(campo.valor);
  if ("data" in campo) return textoDeData(campo.data);
  if ("documento" in campo) return textoDeDocumento(campo.documento);
  return textoDeMes(campo.mes);
}

/**
 * CNPJ/CPF com e sem pontuação: quem copia do boleto cola "34.274.233/0097-46",
 * quem digita escreve "34274233". O banco grava as mesmas duas formas.
 */
export function textoDeDocumento(documento: string | null | undefined): string {
  if (!documento) return "";
  const digitos = documento.replace(/\D/g, "");
  return digitos === documento ? digitos : `${normalizarBusca(documento)} ${digitos}`;
}

/**
 * O texto pesquisável de uma linha. Texto entra normalizado; `{ valor }`,
 * `{ data }` e `{ mes }` entram em todas as grafias. Listas são achatadas (os
 * itens de uma OC, por exemplo).
 */
export function textoPesquisavel(...campos: CampoBusca[]): string {
  return campos
    .map(textoDoCampo)
    .filter((t) => t !== "")
    .join(" ");
}

/** Todas as palavras da busca aparecem no texto? Busca vazia casa tudo. */
export function casaBusca(
  texto: string,
  busca: string | null | undefined,
): boolean {
  const palavras = palavrasDaBusca(busca);
  return palavras.every((p) => texto.includes(p));
}

/**
 * Filtra uma lista em memória pela busca universal. `campos` diz o que de cada
 * linha entra na busca — ponha TUDO o que a linha mostra ou carrega.
 */
export function filtrarPorBusca<T>(
  linhas: readonly T[],
  busca: string | null | undefined,
  campos: (linha: T) => CampoBusca[],
): T[] {
  if (palavrasDaBusca(busca).length === 0) return [...linhas];
  return linhas.filter((linha) =>
    casaBusca(textoPesquisavel(...campos(linha)), busca),
  );
}

/** O pedaço do builder do PostgREST que a busca no banco usa. */
export interface ConsultaComLike<T> {
  like: (coluna: string, padrao: string) => T;
}

/**
 * Aplica a busca universal numa consulta do PostgREST: um `like` por palavra
 * sobre a coluna computada `busca` (função SQL `busca(<tabela>)`), todos em E.
 *
 * `like` e não `ilike`: o texto gravado e as palavras já são minúsculos e sem
 * acento, e o `ilike` pagava a troca de caixa linha a linha à toa (medido em
 * 14/10/2026: 179 → 124 ms nos 7.145 lançamentos).
 */
export function aplicarBusca<T extends ConsultaComLike<T>>(
  consulta: T,
  busca: string | null | undefined,
  coluna = "busca",
): T {
  let resultado = consulta;
  for (const palavra of palavrasDaBusca(busca)) {
    resultado = resultado.like(coluna, `%${palavra}%`);
  }
  return resultado;
}
