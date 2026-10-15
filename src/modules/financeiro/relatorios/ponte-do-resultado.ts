import {
  paraCentavos,
  paraReais,
  type BlocoDre,
  type DrePorNatureza,
} from "@/modules/financeiro/relatorios/calculo";

/**
 * Um degrau da ponte do resultado. `total` é um patamar que sai do zero
 * (receita bruta, resultado operacional); `entrada` e `saida` são o que sobe e
 * desce a partir do patamar anterior.
 */
export interface DegrauPonte {
  id: string;
  rotulo: string;
  /** Com sinal: saída é negativa, entrada positiva, total é o próprio patamar. */
  valor: number;
  tipo: "total" | "entrada" | "saida";
  /** Onde a barra começa e termina, em reais, na escala comum da ponte. */
  de: number;
  ate: number;
  /** Fração da receita líquida operacional (0,25 = 25%); null sem receita. */
  daReceita: number | null;
}

export interface PonteDoResultado {
  /** Da receita bruta ao resultado do período: é o que o DRE soma. */
  resultado: DegrauPonte[];
  /**
   * Do resultado ao que sobrou depois de investir, distribuir aos sócios e
   * emprestar às ligadas. Vazio quando nenhum dos três teve lançamento.
   */
  destino: DegrauPonte[];
  /** A mesma régua para as duas partes, para as barras se compararem. */
  escala: { min: number; max: number };
  /** Resultado do período sobre a receita líquida; null sem receita. */
  margem: number | null;
}

/**
 * Quantas despesas operacionais ganham degrau próprio. O resto vira "Demais
 * despesas": a ponte conta a história, a tabela abaixo tem todas as linhas.
 */
export const DESPESAS_COM_DEGRAU = 5;

/** Saída líquida de um bloco fora do resultado (o que foi menos o que voltou). */
function saidaLiquida(bloco: BlocoDre): number {
  return paraCentavos(bloco.totalDespesas) - paraCentavos(bloco.totalReceitas);
}

/**
 * Monta a ponte do resultado a partir do MESMO agrupamento da tabela e dos
 * cartões, em centavos, para os degraus fecharem ao centavo com o que a tabela
 * mostra: receita líquida - despesas + resultado financeiro = resultado.
 */
export function ponteDoResultado(dre: DrePorNatureza): PonteDoResultado {
  const liquida = paraCentavos(dre.operacional.totalReceitas);
  const retencao = paraCentavos(dre.operacional.retencaoReceitas);
  const fracao = (centavos: number) => (liquida > 0 ? centavos / liquida : null);

  /** O degrau ainda em centavos, antes de virar reais. */
  type Bruto = Omit<DegrauPonte, "daReceita">;
  const crus: Bruto[] = [];
  let nivel = 0;
  const total = (id: string, rotulo: string, centavos: number) => {
    nivel = centavos;
    crus.push({ id, rotulo, tipo: "total", valor: centavos, de: 0, ate: centavos });
  };
  const passo = (id: string, rotulo: string, centavos: number) => {
    const de = nivel;
    nivel += centavos;
    crus.push({
      id,
      rotulo,
      tipo: centavos >= 0 ? "entrada" : "saida",
      valor: centavos,
      de,
      ate: nivel,
    });
  };

  if (retencao > 0) {
    total("receita-bruta", "Receita bruta", liquida + retencao);
    passo("retencoes", "Retenções na fonte", -retencao);
  }
  total("receita-liquida", "Receita líquida", liquida);

  const despesas = dre.operacional.despesas;
  for (const [i, linha] of despesas.slice(0, DESPESAS_COM_DEGRAU).entries()) {
    passo(`despesa-${linha.categoriaId ?? i}`, linha.categoria, -paraCentavos(linha.valor));
  }
  const demais = despesas.slice(DESPESAS_COM_DEGRAU);
  if (demais.length > 0) {
    const soma = demais.reduce((s, linha) => s + paraCentavos(linha.valor), 0);
    passo(
      "demais-despesas",
      `Demais despesas (${demais.length} categorias)`,
      -soma,
    );
  }

  const temFinanceiro =
    dre.financeiro.receitas.length > 0 || dre.financeiro.despesas.length > 0;
  if (temFinanceiro) {
    total("resultado-operacional", "Resultado operacional", nivel);
    passo(
      "resultado-financeiro",
      "Resultado financeiro",
      paraCentavos(dre.financeiro.totalReceitas) -
        paraCentavos(dre.financeiro.totalDespesas),
    );
  }
  const resultadoCentavos = nivel;
  total("resultado-periodo", "Resultado do período", resultadoCentavos);
  const fimDoResultado = crus.length;

  const investimento = saidaLiquida(dre.investimento);
  const distribuicao = saidaLiquida(dre.distribuicao);
  const mutuo = saidaLiquida(dre.mutuo);
  if (investimento !== 0 || distribuicao !== 0 || mutuo !== 0) {
    // O destino começa do resultado, sem repetir o patamar: o último degrau da
    // primeira parte já é ele.
    if (investimento !== 0) passo("investimentos", "Investimentos (máquinas e terreno)", -investimento);
    if (distribuicao !== 0) passo("distribuicoes", "Distribuições a sócios", -distribuicao);
    if (mutuo !== 0) passo("mutuo", "Mútuo líquido com empresas ligadas", -mutuo);
    total("sobra", "Sobra depois de investir e retirar", nivel);
  }

  const pontas = crus.flatMap((d) => [d.de, d.ate]);
  const degraus = crus.map<DegrauPonte>((d) => ({
    ...d,
    valor: paraReais(d.valor),
    de: paraReais(d.de),
    ate: paraReais(d.ate),
    daReceita: fracao(Math.abs(d.valor)),
  }));

  return {
    resultado: degraus.slice(0, fimDoResultado),
    destino: degraus.slice(fimDoResultado),
    escala: {
      min: paraReais(Math.min(0, ...pontas)),
      max: paraReais(Math.max(0, ...pontas)),
    },
    margem: fracao(resultadoCentavos),
  };
}

/**
 * A história da ponte em duas frases, com os números dela. A primeira diz para
 * onde foi cada real recebido; a segunda, o que aconteceu com o resultado.
 * Sem receita líquida não há "de cada real", e a primeira frase não sai.
 */
export function frasesDaPonte(
  ponte: PonteDoResultado,
  formatarBRL: (valor: number) => string,
  formatarPercentual: (valor: number) => string,
): { resultado: string | null; destino: string | null } {
  const achar = (id: string) =>
    [...ponte.resultado, ...ponte.destino].find((d) => d.id === id);
  const pct = (fracao: number | null) => formatarPercentual((fracao ?? 0) * 100);

  let resultado: string | null = null;
  const liquida = achar("receita-liquida");
  if (liquida && liquida.valor > 0 && ponte.margem !== null) {
    const despesas = ponte.resultado
      .filter((d) => d.id.startsWith("despesa-") || d.id === "demais-despesas")
      .reduce((s, d) => s - d.valor, 0);
    const financeiro = achar("resultado-financeiro");
    const custoObra = `a obra consumiu ${pct(despesas / liquida.valor)}`;
    const parteFinanceira =
      financeiro && financeiro.valor < 0
        ? `, juros e tarifas levaram ${pct(-financeiro.valor / liquida.valor)}`
        : financeiro && financeiro.valor > 0
          ? `, as aplicações renderam mais ${pct(financeiro.valor / liquida.valor)}`
          : "";
    const verbo = ponte.margem >= 0 ? "ficou de resultado" : "faltou para fechar";
    resultado =
      `Da receita líquida de ${formatarBRL(liquida.valor)}, ${custoObra}` +
      `${parteFinanceira} e ${pct(Math.abs(ponte.margem))} ${verbo}.`;
  }

  let destino: string | null = null;
  const sobra = achar("sobra");
  const fim = ponte.resultado.at(-1);
  if (sobra && fim) {
    const partes = [
      ["investimentos", "foi para máquinas e terreno"],
      ["distribuicoes", "para os sócios"],
      ["mutuo", "para as empresas ligadas"],
    ]
      .map(([id, texto]) => {
        const degrau = achar(id);
        return degrau ? `${formatarBRL(Math.abs(degrau.valor))} ${texto}` : null;
      })
      .filter((p): p is string => p !== null);
    const lista =
      partes.length > 1
        ? `${partes.slice(0, -1).join(", ")} e ${partes.at(-1)}`
        : (partes[0] ?? "");
    const final =
      sobra.valor >= 0
        ? `sobraram ${formatarBRL(sobra.valor)}`
        : `faltaram ${formatarBRL(-sobra.valor)}, cobertos por caixa ou empréstimo`;
    destino = `Do resultado de ${formatarBRL(fim.valor)}, ${lista}; ${final}.`;
  }

  return { resultado, destino };
}
