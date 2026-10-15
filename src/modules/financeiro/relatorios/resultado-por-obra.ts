import { paraCentavos } from "@/modules/financeiro/relatorios/calculo";
import type { LinhaCustoReceita } from "@/modules/financeiro/relatorios/custo-receita";

/**
 * Relatório "Resultado por obra" (15/10/2026): Custo x receita e Margem por obra
 * viraram uma tela só, que responde "quais obras dão lucro e quanto".
 *
 * Três janelas, todas terminando no mesmo mês (o último fechado, por padrão):
 * o MÊS, o ANO até o mês e DESDE O INÍCIO até o mês. Nenhuma passa do mês
 * escolhido, então previsto de mês futuro nunca entra. A receita chega aos
 * saltos, por medição: a margem do mês sozinha não informa, e é por isso que as
 * duas janelas acumuladas ficam ao lado dela.
 *
 * As linhas são as de `fn_rel_custo_receita` (mês x centro raiz x tipo) e o
 * indireto é o de `fn_rateio_indireto_mes`, mês a mês. O custo dos centros
 * indiretos não aparece como linha: ele já está dentro do indireto das obras,
 * e o que nenhuma obra recebeu fica em "Indireto sem obra". Com isso a soma da
 * tela fecha com o total do custo x receita ao centavo (ver `conferencia`).
 *
 * Tudo em centavos inteiros. Módulo puro: nada de banco, nada de React.
 */

/** O papel do centro raiz no rateio (`centros_custo.papel_rateio`). */
export type PapelRateio = "indireto" | "fora";

/** Uma linha do rateio de um mês, como `fn_rel_rateio_indireto_meses` devolve. */
export interface LinhaRateioMes {
  /** yyyy-MM. */
  mes: string;
  /** Nulo na linha do mês sem obra para receber. */
  centroId: string | null;
  centro: string | null;
  custoDireto: number;
  indireto: number;
  status: string;
  naoRateado: number;
  custoIndiretoMes: number;
}

export interface Valores {
  receita: number;
  direto: number;
  indireto: number;
  resultado: number;
  /** Resultado sobre a receita, em pontos. `null` sem receita: não há margem. */
  margem: number | null;
}

export type Janela = "mes" | "ano" | "inicio";
export const JANELAS: readonly Janela[] = ["mes", "ano", "inicio"];

export interface LinhaObra {
  centroId: string;
  nome: string;
  mes: Valores;
  ano: Valores;
  inicio: Valores;
  /** O resultado de cada mês do ano até o mês escolhido (a matriz mês x obra). */
  porMesDoAno: number[];
}

export interface ResultadoPorObra {
  /** yyyy-MM escolhido. */
  mes: string;
  /** Janeiro do ano até o mês escolhido, yyyy-MM. */
  mesesDoAno: string[];
  /** Obras que recebem indireto, do maior resultado desde o início para o menor. */
  obras: LinhaObra[];
  /** Centros de unidade própria (001 Carretas EMT): não rateiam nem recebem. */
  foraDoRateio: LinhaObra[];
  /** Indireto que nenhuma obra recebeu (mês sem obra com custo). */
  naoRateado: Record<Janela, number>;
  /** Receita lançada direto num centro indireto (não vai para obra nenhuma). */
  receitaNosIndiretos: Record<Janela, number>;
  totalObras: Record<Janela, Valores>;
  /** Por mês do ano, o resultado de todas as obras somadas. */
  totalObrasPorMes: number[];
  /** Receita menos custo de tudo que o custo x receita traz, sem rateio. */
  totalGeral: Record<Janela, { receita: number; custo: number; resultado: number }>;
}

interface Acum {
  receita: number;
  direto: number;
  indireto: number;
}

const vazio = (): Acum => ({ receita: 0, direto: 0, indireto: 0 });

function valores(a: Acum): Valores {
  const resultado = a.receita - a.direto - a.indireto;
  return {
    receita: a.receita / 100,
    direto: a.direto / 100,
    indireto: a.indireto / 100,
    resultado: resultado / 100,
    margem: a.receita === 0 ? null : (resultado / a.receita) * 100,
  };
}

/** Os meses de janeiro do ano de `mes` até `mes`, yyyy-MM. */
export function mesesDoAnoAte(mes: string): string[] {
  const [ano, m] = mes.split("-").map(Number);
  return Array.from({ length: m }, (_, i) => `${ano}-${String(i + 1).padStart(2, "0")}`);
}

/** Em quais janelas um mês (yyyy-MM) entra, olhando o mês escolhido. */
function janelasDoMes(mesLinha: string, mes: string): Janela[] {
  if (mesLinha > mes) return [];
  const janelas: Janela[] = ["inicio"];
  if (mesLinha.slice(0, 4) === mes.slice(0, 4)) janelas.push("ano");
  if (mesLinha === mes) janelas.push("mes");
  return janelas;
}

export function resultadoPorObra({
  mes,
  linhas,
  rateio,
  papeis,
}: {
  mes: string;
  linhas: readonly LinhaCustoReceita[];
  rateio: readonly LinhaRateioMes[];
  /** Papel de cada centro raiz que tem um. Ausente = obra que recebe indireto. */
  papeis: ReadonlyMap<string, PapelRateio>;
}): ResultadoPorObra {
  const mesesDoAno = mesesDoAnoAte(mes);
  const indiceNoAno = new Map(mesesDoAno.map((m, i) => [m, i]));

  type Centro = { nome: string; janelas: Record<Janela, Acum>; porMes: number[] };
  const centros = new Map<string, Centro>();
  const centro = (id: string, nome: string): Centro => {
    let c = centros.get(id);
    if (!c) {
      c = {
        nome,
        janelas: { mes: vazio(), ano: vazio(), inicio: vazio() },
        porMes: mesesDoAno.map(() => 0),
      };
      centros.set(id, c);
    } else if (!c.nome && nome) c.nome = nome;
    return c;
  };

  const geral = { mes: vazio(), ano: vazio(), inicio: vazio() };
  const naoRateado = { mes: 0, ano: 0, inicio: 0 };
  const receitaNosIndiretos = { mes: 0, ano: 0, inicio: 0 };

  for (const l of linhas) {
    const janelas = janelasDoMes(l.mes, mes);
    if (janelas.length === 0) continue;
    const cent = paraCentavos(l.total);
    const ehReceita = l.tipo === "a_receber";
    for (const j of janelas) {
      if (ehReceita) geral[j].receita += cent;
      else geral[j].direto += cent;
    }
    if (papeis.get(l.centroCustoId) === "indireto") {
      // O custo do indireto entra pelo rateio; a receita dele não tem obra.
      if (ehReceita) for (const j of janelas) receitaNosIndiretos[j] += cent;
      continue;
    }
    const c = centro(l.centroCustoId, l.nome);
    for (const j of janelas) {
      if (ehReceita) c.janelas[j].receita += cent;
      else c.janelas[j].direto += cent;
    }
    const i = indiceNoAno.get(l.mes);
    if (i !== undefined) c.porMes[i] += ehReceita ? cent : -cent;
  }

  // O não rateado vem repetido em toda linha do mês: conta uma vez por mês.
  const naoRateadoDoMes = new Map<string, number>();
  for (const r of rateio) {
    const janelas = janelasDoMes(r.mes, mes);
    if (janelas.length === 0) continue;
    naoRateadoDoMes.set(r.mes, paraCentavos(r.naoRateado));
    if (r.centroId === null) continue;
    const cent = paraCentavos(r.indireto);
    if (cent === 0) continue;
    const c = centro(r.centroId, r.centro ?? "");
    for (const j of janelas) c.janelas[j].indireto += cent;
    const i = indiceNoAno.get(r.mes);
    if (i !== undefined) c.porMes[i] -= cent;
  }
  for (const [m, cent] of naoRateadoDoMes) {
    for (const j of janelasDoMes(m, mes)) naoRateado[j] += cent;
  }

  const paraLinha = ([centroId, c]: [string, Centro]): LinhaObra => ({
    centroId,
    nome: c.nome || "Centro sem nome",
    mes: valores(c.janelas.mes),
    ano: valores(c.janelas.ano),
    inicio: valores(c.janelas.inicio),
    porMesDoAno: c.porMes.map((v) => v / 100),
  });
  const ordem = (a: LinhaObra, b: LinhaObra) =>
    b.inicio.resultado - a.inicio.resultado || a.nome.localeCompare(b.nome, "pt-BR");

  const todas = [...centros.entries()];
  const obrasCru = todas.filter(([id]) => papeis.get(id) !== "fora");
  const obras = obrasCru.map(paraLinha).sort(ordem);
  const foraDoRateio = todas.filter(([id]) => papeis.get(id) === "fora").map(paraLinha).sort(ordem);

  const somaObras = (j: Janela): Valores =>
    valores(
      obrasCru.reduce((s, [, c]) => {
        s.receita += c.janelas[j].receita;
        s.direto += c.janelas[j].direto;
        s.indireto += c.janelas[j].indireto;
        return s;
      }, vazio()),
    );

  const reais = (r: Record<Janela, number>) => ({ mes: r.mes / 100, ano: r.ano / 100, inicio: r.inicio / 100 });
  const totalGeralDe = (j: Janela) => ({
    receita: geral[j].receita / 100,
    custo: geral[j].direto / 100,
    resultado: (geral[j].receita - geral[j].direto) / 100,
  });

  return {
    mes,
    mesesDoAno,
    obras,
    foraDoRateio,
    naoRateado: reais(naoRateado),
    receitaNosIndiretos: reais(receitaNosIndiretos),
    totalObras: { mes: somaObras("mes"), ano: somaObras("ano"), inicio: somaObras("inicio") },
    totalObrasPorMes: mesesDoAno.map(
      (_, i) => obrasCru.reduce((s, [, c]) => s + c.porMes[i], 0) / 100,
    ),
    totalGeral: { mes: totalGeralDe("mes"), ano: totalGeralDe("ano"), inicio: totalGeralDe("inicio") },
  };
}

/**
 * A soma da tela contra o total do custo x receita, por janela, em reais.
 *
 * obras + fora do rateio + receita nos indiretos - indireto sem obra = receita
 * menos custo de tudo. Diferente de zero quer dizer que o rateio do mês não
 * distribuiu exatamente o custo dos indiretos, e a tela avisa em vez de esconder.
 */
export function conferencia(r: ResultadoPorObra, j: Janela): number {
  const cent = (v: number) => paraCentavos(v);
  const soma =
    cent(r.totalObras[j].resultado) +
    r.foraDoRateio.reduce((s, l) => s + cent(l[j].resultado), 0) +
    cent(r.receitaNosIndiretos[j]) -
    cent(r.naoRateado[j]);
  return (cent(r.totalGeral[j].resultado) - soma) / 100;
}

/**
 * "009 - Manutenção da Rodovia..." vira "009"; nome sem código fica inteiro.
 * A frase do topo cita várias obras numa linha, e o nome do cadastro tem até
 * sessenta letras.
 */
export function nomeCurto(nome: string): string {
  const codigo = /^(\d{3}(?:\.\d+)?)\b/.exec(nome.trim());
  return codigo ? codigo[1] : nome.trim();
}

/** As obras que deram lucro e as que ficaram no vermelho numa janela. */
export function lucroEPrejuizo(
  obras: readonly LinhaObra[],
  j: Janela,
): { lucro: LinhaObra[]; prejuizo: LinhaObra[] } {
  const ordenadas = [...obras].sort((a, b) => b[j].resultado - a[j].resultado);
  return {
    lucro: ordenadas.filter((o) => paraCentavos(o[j].resultado) > 0),
    prejuizo: ordenadas.filter((o) => paraCentavos(o[j].resultado) < 0).reverse(),
  };
}

const MESES_POR_EXTENSO = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
] as const;

/** "2026-09" vira "setembro de 2026". */
export function mesPorExtenso(mes: string): string {
  const [ano, m] = mes.split("-").map(Number);
  return `${MESES_POR_EXTENSO[m - 1] ?? ""} de ${ano}`;
}

/** Como cada janela se chama na tela e na planilha. */
export function rotulosDasJanelas(mes: string): Record<Janela, string> {
  const [ano, m] = mes.split("-").map(Number);
  const nome = MESES_POR_EXTENSO[m - 1] ?? "";
  return {
    mes: `Só ${nome}`,
    ano: m === 1 ? `Janeiro de ${ano}` : `${ano} até ${nome}`,
    inicio: `Desde o início até ${nome}`,
  };
}

/**
 * A frase do topo: quais obras deram lucro e quais ficaram no vermelho no ano
 * até o mês, e como foi o mês. `formatar` vem de fora (o formatador BRL do app)
 * para o módulo continuar puro e o teste comparar com o mesmo texto da tela.
 */
export function frasesDoResultado(
  r: ResultadoPorObra,
  formatar: (valor: number) => string,
): string[] {
  const lista = (obras: LinhaObra[], j: Janela) =>
    obras.map((o) => `${nomeCurto(o.nome)} (${formatar(o[j].resultado)})`).join(", ");
  const anoTexto =
    r.mes.slice(5, 7) === "01" ? `Em ${mesPorExtenso(r.mes)}` : `De janeiro a ${mesPorExtenso(r.mes)}`;
  const { lucro, prejuizo } = lucroEPrejuizo(r.obras, "ano");
  const frases: string[] = [];
  if (lucro.length === 0 && prejuizo.length === 0) {
    frases.push(`${anoTexto}, nenhuma obra teve receita nem custo.`);
  } else {
    const partes: string[] = [];
    if (lucro.length > 0) {
      partes.push(
        `${lucro.length === 1 ? "1 obra deu lucro" : `${lucro.length} obras deram lucro`}: ${lista(lucro, "ano")}`,
      );
    }
    if (prejuizo.length > 0) {
      partes.push(
        `${prejuizo.length === 1 ? "1 ficou no vermelho" : `${prejuizo.length} ficaram no vermelho`}: ${lista(prejuizo, "ano")}`,
      );
    }
    frases.push(`${anoTexto}, ${partes.join("; ")}.`);
  }
  const doMes = r.totalObras.mes;
  const semMedicao = paraCentavos(doMes.receita) === 0 && paraCentavos(doMes.direto) !== 0;
  frases.push(
    `Em ${mesPorExtenso(r.mes)} as obras somaram ${formatar(doMes.resultado)} de resultado` +
      (semMedicao
        ? ", sem nenhuma medição no mês: o resultado do ano conta melhor."
        : doMes.margem === null
          ? "."
          : `, margem de ${doMes.margem.toFixed(1).replace(".", ",")}%.`),
  );
  return frases;
}
