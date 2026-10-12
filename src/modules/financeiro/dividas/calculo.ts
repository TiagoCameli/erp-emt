/**
 * Contas puras de Dívidas. O dinheiro do cronograma (Price, SAC, saldo, juros)
 * sai do banco; aqui fica só o que é LEITURA do que o banco devolveu: o CET
 * pelo fluxo do contrato, a leitura do cronograma colado do PDF do banco e as
 * opções de etapa. Sem servidor, para testar sem mock.
 */

/** Uma ponta do fluxo do contrato: positivo entra (liberação), negativo sai. */
export interface PontoFluxo {
  data: string;
  valor: number;
}

export interface Cet {
  /** Em fração ao mês (0,02 = 2% a.m.). */
  mensal: number;
  /** Em fração ao ano, composto: (1 + mensal)^12 - 1. */
  anual: number;
}

const DATA_ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Meses entre duas datas, contando o calendário: do dia 15 ao dia 15 do mês
 * seguinte é 1, não 31/30. Os dias que sobram valem 1/30 de mês (convenção
 * do mercado brasileiro para juro mensal). Com isso um Price de vencimento no
 * mesmo dia do mês dá o CET igual à taxa do contrato, sem o ruído de fevereiro.
 */
export function mesesEntre(de: string, ate: string): number {
  const a = DATA_ISO.exec(de);
  const b = DATA_ISO.exec(ate);
  if (!a || !b) return Number.NaN;
  const meses = (Number(b[1]) - Number(a[1])) * 12 + (Number(b[2]) - Number(a[2]));
  return meses + (Number(b[3]) - Number(a[3])) / 30;
}

/** Valor presente do fluxo, na data do primeiro ponto, à taxa mensal `i`. */
function valorPresente(fluxo: { t: number; valor: number }[], i: number): number {
  let soma = 0;
  for (const p of fluxo) soma += p.valor / Math.pow(1 + i, p.t);
  return soma;
}

/**
 * CET (custo efetivo total) do contrato: a taxa que zera o valor presente do
 * fluxo (a TIR), com o tempo em meses (ver `mesesEntre`). A anual é a mensal
 * composta em 12 meses.
 *
 * Null quando não há conta a fazer: fluxo sem entrada e sem saída (contrato
 * sem cronograma), datas inválidas ou sem taxa que zere o fluxo entre -99% e
 * 1000% a.m. Um CET inventado numa tabela de dívida seria pior que o traço.
 *
 * Bissecção, e não Newton: o fluxo de dívida tem uma troca de sinal só (entra
 * a liberação, saem as parcelas), então a raiz é única no intervalo e a
 * bissecção sempre chega; Newton diverge com chute ruim em contrato curto.
 */
export function calcularCet(pontos: readonly PontoFluxo[]): Cet | null {
  const validos = pontos.filter((p) => DATA_ISO.test(p.data) && Number.isFinite(p.valor) && p.valor !== 0);
  if (!validos.some((p) => p.valor > 0) || !validos.some((p) => p.valor < 0)) return null;

  const inicio = validos.reduce((menor, p) => (p.data < menor ? p.data : menor), validos[0].data);
  const fluxo = validos.map((p) => ({ t: mesesEntre(inicio, p.data), valor: p.valor }));

  let baixo = -0.99;
  let alto = 10;
  let vpBaixo = valorPresente(fluxo, baixo);
  const vpAlto = valorPresente(fluxo, alto);
  if (!Number.isFinite(vpBaixo) || !Number.isFinite(vpAlto) || Math.sign(vpBaixo) === Math.sign(vpAlto)) {
    return null;
  }
  for (let passo = 0; passo < 200 && alto - baixo > 1e-12; passo++) {
    const meio = (baixo + alto) / 2;
    const vpMeio = valorPresente(fluxo, meio);
    if (vpMeio === 0) {
      baixo = alto = meio;
      break;
    }
    if (Math.sign(vpMeio) === Math.sign(vpBaixo)) {
      baixo = meio;
      vpBaixo = vpMeio;
    } else {
      alto = meio;
    }
  }
  const mensal = (baixo + alto) / 2;
  return { mensal, anual: Math.pow(1 + mensal, 12) - 1 };
}

/** O fluxo do contrato como vem de `fn_rel_dividas_contratos` (jsonb). */
export function lerFluxo(json: unknown): PontoFluxo[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const { data, valor } = item as { data?: unknown; valor?: unknown };
    const numero = typeof valor === "string" ? Number(valor) : valor;
    return typeof data === "string" && typeof numero === "number" && Number.isFinite(numero)
      ? [{ data, valor: numero }]
      : [];
  });
}

// ---------- cronograma colado do PDF do banco ----------

/** Uma linha do cronograma digitado, como vai para `fn_salvar_cronograma_contrato`. */
export interface LinhaCronogramaDigitada {
  vencimento: string;
  principal: number;
  juros: number;
  encargos: number;
}

/** "15/01/2027" ou "2027-01-15" para ISO; null se não for data. */
export function lerDataBr(texto: string): string | null {
  const t = texto.trim();
  if (DATA_ISO.test(t)) return t;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (!m) return null;
  const iso = `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
}

/**
 * "1.234,56" (pt-BR), "1234.56" (planilha em inglês) ou "R$ 1.234,56" para
 * número. Vazio é zero (juros e encargos podem não vir). Null se não for número.
 */
export function lerValorBr(texto: string): number | null {
  const t = texto.replace(/R\$\s?/i, "").replace(/\s/g, "");
  if (t === "" || t === "-") return 0;
  let normal: string;
  if (t.includes(",")) normal = t.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) normal = t.replace(/\./g, "");
  else normal = t;
  if (!/^-?\d+(\.\d+)?$/.test(normal)) return null;
  return Math.round(Number(normal) * 100) / 100;
}

export interface LeituraColada {
  linhas: LinhaCronogramaDigitada[];
  /** "Linha 3: vencimento inválido". Linha com erro não entra em `linhas`. */
  erros: string[];
}

/**
 * Lê o cronograma colado de uma planilha ou do PDF do banco: uma parcela por
 * linha, colunas separadas por tab ou ponto e vírgula, na ordem vencimento,
 * principal, juros, encargos. Uma coluna a mais no começo com o número da
 * parcela é ignorada (o banco numera pela ordem de vencimento). Linha que não
 * começa por data (o cabeçalho, o total) é pulada sem erro.
 */
export function lerCronogramaColado(texto: string): LeituraColada {
  const linhas: LinhaCronogramaDigitada[] = [];
  const erros: string[] = [];
  texto.split(/\r?\n/).forEach((bruta, indice) => {
    if (bruta.trim() === "") return;
    let colunas = bruta.split(/\t|;/).map((c) => c.trim());
    if (colunas.length > 1 && /^\d{1,3}$/.test(colunas[0]) && lerDataBr(colunas[1]) !== null) {
      colunas = colunas.slice(1);
    }
    const vencimento = lerDataBr(colunas[0] ?? "");
    if (vencimento === null) return;
    const [principal, juros, encargos] = [1, 2, 3].map((i) => lerValorBr(colunas[i] ?? ""));
    if (principal === null || juros === null || encargos === null) {
      erros.push(`Linha ${indice + 1}: valor que não é número`);
      return;
    }
    if (principal < 0 || juros < 0 || encargos < 0) {
      erros.push(`Linha ${indice + 1}: valor negativo`);
      return;
    }
    linhas.push({ vencimento, principal, juros, encargos });
  });
  return { linhas, erros };
}

/** Soma em centavos inteiros: 0,1 + 0,2 não pode dar 0,30000000000000004 na conferência. */
export function somarCentavos(valores: readonly number[]): number {
  return valores.reduce((soma, v) => soma + Math.round(v * 100), 0) / 100;
}

// ---------- opções de etapa ----------

export interface CentroOpcao {
  id: string;
  nome: string;
  codigo: string | null;
  paiId: string | null;
  tipo: string | null;
}

export interface EtapaOpcao {
  id: string;
  /** "Empréstimos › BB 123" */
  rotulo: string;
}

function rotular(raiz: CentroOpcao, etapa: CentroOpcao): string {
  return `${raiz.nome} › ${etapa.nome}`;
}

/**
 * A etapa do contrato: nível 2, debaixo de uma raiz de tipo `financeiro`
 * (Empréstimos) ou `imobilizado` (o bem financiado). É a mesma regra que
 * `fn_salvar_contrato_divida` cobra; aqui só para não oferecer o que o banco
 * recusaria.
 */
export function etapasDeDivida(centros: readonly CentroOpcao[]): EtapaOpcao[] {
  const raizes = new Map(
    centros
      .filter((c) => c.paiId === null && (c.tipo === "financeiro" || c.tipo === "imobilizado"))
      .map((c) => [c.id, c]),
  );
  return centros
    .filter((c) => c.paiId !== null && raizes.has(c.paiId))
    .map((c) => ({ id: c.id, rotulo: rotular(raizes.get(c.paiId!)!, c) }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}

/**
 * Onde o bem da carta contemplada fica: uma raiz de imobilizado ou uma etapa
 * dela (`fn_contemplar_consorcio` aceita as duas).
 */
export function centrosImobilizado(centros: readonly CentroOpcao[]): EtapaOpcao[] {
  const raizes = new Map(
    centros.filter((c) => c.paiId === null && c.tipo === "imobilizado").map((c) => [c.id, c]),
  );
  return centros
    .filter((c) => raizes.has(c.id) || (c.paiId !== null && raizes.has(c.paiId)))
    .map((c) => ({ id: c.id, rotulo: c.paiId === null ? c.nome : rotular(raizes.get(c.paiId)!, c) }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
}

/**
 * Saldo devedor de principal numa data, lido do cronograma gravado: o
 * `saldo_apos` da última linha vencida até lá (sem nenhuma, o liberado). A
 * mesma leitura de `fn_contrato_saldo_devedor` (no mesmo dia, a linha do
 * evento, sem número, vale sobre a parcela), só para a tela mostrar o alvo
 * do evento antes de mandar; quem decide é o banco.
 */
export function saldoNaData(
  linhas: readonly { vencimento: string; numero: number | null; saldoApos: number }[],
  data: string,
  liberado: number,
): number {
  let escolhida: (typeof linhas)[number] | null = null;
  for (const l of linhas) {
    if (l.vencimento > data) continue;
    if (
      !escolhida ||
      l.vencimento > escolhida.vencimento ||
      (l.vencimento === escolhida.vencimento && (l.numero ?? Infinity) > (escolhida.numero ?? Infinity))
    ) {
      escolhida = l;
    }
  }
  return escolhida ? escolhida.saldoApos : liberado;
}
