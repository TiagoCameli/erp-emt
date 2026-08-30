/**
 * A matemática da régua de tempo dos filtros de período.
 *
 * Módulo puro: nada de React e nada de fuso. Toda data aqui é `yyyy-MM-dd`, e a
 * aritmética é feita em UTC (`T00:00:00Z`), pelo mesmo motivo de `diasAtras` em
 * `lib/formatadores`: data sem hora comparada no fuso local pula um dia à noite
 * em Rio Branco, e um filtro que pula um dia é um filtro que esconde lançamento.
 */

/** Em que tamanho de bloco a régua trabalha. */
export const GRANULARIDADES = [
  "ano",
  "trimestre",
  "mes",
  "semana",
  "dia",
] as const;

export type Granularidade = (typeof GRANULARIDADES)[number];

export const ROTULO_GRANULARIDADE: Record<Granularidade, string> = {
  ano: "Anos",
  trimestre: "Trimestres",
  mes: "Meses",
  semana: "Semanas",
  dia: "Dias",
};

/** Um bloco clicável da régua. `inicio` e `fim` são inclusivos. */
export interface BlocoDaRegua {
  inicio: string;
  fim: string;
  /** O que aparece dentro do bloco: "JAN", "1º tri", "2026", "15". */
  rotulo: string;
  /** O que o leitor de tela e o title dizem: "janeiro de 2026". */
  descricao: string;
}

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const UM_DIA = 24 * 60 * 60 * 1000;

const MESES_CURTOS = [
  "JAN",
  "FEV",
  "MAR",
  "ABR",
  "MAI",
  "JUN",
  "JUL",
  "AGO",
  "SET",
  "OUT",
  "NOV",
  "DEZ",
];

const MESES_LONGOS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** A data é um `yyyy-MM-dd` que existe no calendário? */
export function ehDataISO(valor: string): boolean {
  if (!DATA_ISO.test(valor)) return false;
  // `Date.UTC` aceita 31/02 e devolve 03/03: a volta pela formatação é o que
  // separa "data escrita certo" de "data que existe".
  const [ano, mes, dia] = valor.split("-").map(Number) as [
    number,
    number,
    number,
  ];
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  return paraISO(d) === valor;
}

function paraISO(data: Date): string {
  const ano = String(data.getUTCFullYear()).padStart(4, "0");
  const mes = String(data.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(data.getUTCDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function paraData(iso: string): Date {
  return new Date(Date.parse(`${iso}T00:00:00Z`));
}

/** Primeiro dia do mês de uma data. */
function primeiroDoMes(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** Último dia do mês de uma data. O dia 0 do mês seguinte é o último deste. */
function ultimoDoMes(iso: string): string {
  const [ano, mes] = iso.split("-").map(Number) as [number, number];
  return paraISO(new Date(Date.UTC(ano, mes, 0)));
}

function somarDias(iso: string, dias: number): string {
  return paraISO(new Date(paraData(iso).getTime() + dias * UM_DIA));
}

/** Soma meses preservando o DIA 1: só é usado sobre início de mês. */
function somarMeses(iso: string, meses: number): string {
  const [ano, mes] = iso.split("-").map(Number) as [number, number];
  const total = ano * 12 + (mes - 1) + meses;
  const novoAno = Math.floor(total / 12);
  const novoMes = (total % 12) + 1;
  return `${String(novoAno).padStart(4, "0")}-${String(novoMes).padStart(2, "0")}-01`;
}

/** Segunda-feira da semana de uma data. Semana começa na segunda, como o DNIT. */
function segundaDaSemana(iso: string): string {
  const diaDaSemana = paraData(iso).getUTCDay(); // 0 = domingo
  const recuo = diaDaSemana === 0 ? 6 : diaDaSemana - 1;
  return somarDias(iso, -recuo);
}

/**
 * Quantos blocos a régua mostra de uma vez, por granularidade.
 *
 * O número é o que cabe numa linha legível dentro do popover, e é ele que define
 * o passo do ◀ ▶: navegar é sempre "a mesma janela, deslocada por inteiro", e
 * não meio bloco.
 */
const BLOCOS_POR_JANELA: Record<Granularidade, number> = {
  ano: 12,
  trimestre: 8,
  mes: 12,
  // Semanas e dias variam com o mês (4 a 6 semanas, 28 a 31 dias): quem manda é
  // o mês da âncora, e estes números só servem para o cálculo da janela.
  semana: 6,
  dia: 31,
};

/**
 * O início da JANELA que contém uma data, por granularidade.
 *
 * É o que faz o ◀ ▶ andar em passos inteiros e previsíveis: em meses a janela é
 * o ano; em dias e semanas, o mês; em trimestres, um par de anos ancorado em ano
 * par; em anos, uma dúzia ancorada em múltiplo de 12.
 */
export function inicioDaJanela(
  ancora: string,
  granularidade: Granularidade,
): string {
  const ano = Number(ancora.slice(0, 4));
  switch (granularidade) {
    case "ano": {
      // Dúzias fixas (2016, 2028, ...): sem âncora fixa, o ◀ ▶ mostraria uma
      // faixa diferente conforme por onde a pessoa entrou.
      const base = Math.floor(ano / 12) * 12;
      return `${String(base).padStart(4, "0")}-01-01`;
    }
    case "trimestre": {
      const base = Math.floor(ano / 2) * 2;
      return `${String(base).padStart(4, "0")}-01-01`;
    }
    case "mes":
      return `${String(ano).padStart(4, "0")}-01-01`;
    case "semana":
    case "dia":
      return primeiroDoMes(ancora);
  }
}

/** A janela seguinte (`passo` 1) ou anterior (-1). */
export function janelaVizinha(
  inicioJanela: string,
  granularidade: Granularidade,
  passo: number,
): string {
  switch (granularidade) {
    case "ano":
      return somarMeses(inicioJanela, 12 * BLOCOS_POR_JANELA.ano * passo);
    case "trimestre":
      return somarMeses(inicioJanela, 24 * passo);
    case "mes":
      return somarMeses(inicioJanela, 12 * passo);
    case "semana":
    case "dia":
      return somarMeses(inicioJanela, passo);
  }
}

/** O título da janela: "2026", "2026 e 2027", "agosto de 2026". */
export function tituloDaJanela(
  inicioJanela: string,
  granularidade: Granularidade,
): string {
  const ano = inicioJanela.slice(0, 4);
  switch (granularidade) {
    case "ano": {
      const fim = Number(ano) + BLOCOS_POR_JANELA.ano - 1;
      return `${ano} a ${fim}`;
    }
    case "trimestre":
      return `${ano} e ${Number(ano) + 1}`;
    case "mes":
      return ano;
    case "semana":
    case "dia":
      return `${MESES_LONGOS[Number(inicioJanela.slice(5, 7)) - 1]} de ${ano}`;
  }
}

/**
 * Os blocos de uma janela.
 *
 * Em semanas, a lista traz as semanas que TOCAM o mês, então a primeira pode
 * começar no mês anterior e a última terminar no seguinte. É o comportamento
 * certo: semana é semana, e cortá-la no dia 1 criaria um bloco de dois dias que
 * não corresponde a nada que alguém pergunte.
 */
export function blocosDaJanela(
  inicioJanela: string,
  granularidade: Granularidade,
): BlocoDaRegua[] {
  switch (granularidade) {
    case "ano":
      return Array.from({ length: BLOCOS_POR_JANELA.ano }, (_, i) => {
        const ano = Number(inicioJanela.slice(0, 4)) + i;
        const texto = String(ano).padStart(4, "0");
        return {
          inicio: `${texto}-01-01`,
          fim: `${texto}-12-31`,
          rotulo: texto,
          descricao: `ano de ${texto}`,
        };
      });

    case "trimestre":
      return Array.from({ length: BLOCOS_POR_JANELA.trimestre }, (_, i) => {
        const inicio = somarMeses(inicioJanela, i * 3);
        const numero = Math.floor(Number(inicio.slice(5, 7)) / 3) + 1;
        const ano = inicio.slice(0, 4);
        return {
          inicio,
          fim: ultimoDoMes(somarMeses(inicio, 2)),
          rotulo: `${numero}º tri`,
          descricao: `${numero}º trimestre de ${ano}`,
        };
      });

    case "mes":
      return Array.from({ length: BLOCOS_POR_JANELA.mes }, (_, i) => {
        const inicio = somarMeses(inicioJanela, i);
        const indice = Number(inicio.slice(5, 7)) - 1;
        return {
          inicio,
          fim: ultimoDoMes(inicio),
          rotulo: MESES_CURTOS[indice]!,
          descricao: `${MESES_LONGOS[indice]} de ${inicio.slice(0, 4)}`,
        };
      });

    case "semana": {
      const fimDoMes = ultimoDoMes(inicioJanela);
      const blocos: BlocoDaRegua[] = [];
      let cursor = segundaDaSemana(inicioJanela);
      let numero = 1;
      while (cursor <= fimDoMes) {
        const fim = somarDias(cursor, 6);
        blocos.push({
          inicio: cursor,
          fim,
          rotulo: `S${numero}`,
          descricao: `semana de ${diaEMes(cursor)} a ${diaEMes(fim)}`,
        });
        cursor = somarDias(cursor, 7);
        numero += 1;
      }
      return blocos;
    }

    case "dia": {
      const fimDoMes = ultimoDoMes(inicioJanela);
      const quantos = Number(fimDoMes.slice(8, 10));
      return Array.from({ length: quantos }, (_, i) => {
        const dia = somarDias(inicioJanela, i);
        return {
          inicio: dia,
          fim: dia,
          rotulo: String(i + 1),
          descricao: `${diaEMes(dia)} de ${dia.slice(0, 4)}`,
        };
      });
    }
  }
}

/** "15 de agosto", para as descrições. */
function diaEMes(iso: string): string {
  const dia = Number(iso.slice(8, 10));
  return `${dia} de ${MESES_LONGOS[Number(iso.slice(5, 7)) - 1]}`;
}

/**
 * O intervalo que dois blocos formam, em qualquer ordem de clique.
 *
 * Arrastar da direita para a esquerda é tão natural quanto o contrário, e sem
 * esta normalização o período sairia invertido (de 31/08 até 01/01), que o banco
 * traduz como "nenhuma linha".
 */
export function intervaloEntre(
  a: BlocoDaRegua,
  b: BlocoDaRegua,
): {
  de: string;
  ate: string;
} {
  return a.inicio <= b.inicio
    ? { de: a.inicio, ate: b.fim }
    : { de: b.inicio, ate: a.fim };
}

/**
 * Quais blocos da janela estão dentro do período escolhido.
 *
 * Um bloco conta como selecionado quando ENCOSTA no período, não quando está
 * inteiro dentro dele: um período de 05/08 a 20/08 pinta AGO na régua de meses,
 * porque é isso que a pessoa quer ver ("estou olhando agosto"). Pintar só o que
 * cabe inteiro deixaria a régua de meses apagada em quase todo filtro de dias.
 */
export function blocosNoPeriodo(
  blocos: BlocoDaRegua[],
  de: string,
  ate: string,
): boolean[] {
  if (de === "" && ate === "") return blocos.map(() => false);
  const inicio = de === "" ? "0000-01-01" : de;
  const fim = ate === "" ? "9999-12-31" : ate;
  return blocos.map((bloco) => bloco.inicio <= fim && bloco.fim >= inicio);
}

/**
 * O resumo do período, do jeito que a pessoa leria em voz alta.
 *
 * "jan - ago de 2026" quando o período é um punhado de meses inteiros do mesmo
 * ano; "01/01/2026 - 15/08/2026" quando não fecha em mês. A diferença importa:
 * resumo que diz "01/08/2026 - 31/08/2026" para o mês de agosto faz a pessoa
 * conferir dois números para concluir o que "agosto de 2026" já dizia.
 */
export function resumoDoPeriodo(de: string, ate: string): string {
  if (de === "" && ate === "") return "";
  if (de !== "" && ate === "") return `a partir de ${formatarBr(de)}`;
  if (de === "" && ate !== "") return `até ${formatarBr(ate)}`;

  const inicioDeMes = de === primeiroDoMes(de);
  const fimDeMes = ate === ultimoDoMes(ate);

  if (inicioDeMes && fimDeMes) {
    const mesDe = MESES_CURTOS[Number(de.slice(5, 7)) - 1]!.toLowerCase();
    const mesAte = MESES_CURTOS[Number(ate.slice(5, 7)) - 1]!.toLowerCase();
    const anoDe = de.slice(0, 4);
    const anoAte = ate.slice(0, 4);

    // O ano inteiro tem nome próprio, e é o filtro mais comum de fechamento.
    if (de === `${anoDe}-01-01` && ate === `${anoDe}-12-31`) return anoDe;

    if (anoDe === anoAte) {
      return mesDe === mesAte
        ? `${mesDe} de ${anoDe}`
        : `${mesDe} - ${mesAte} de ${anoDe}`;
    }
    return `${mesDe} de ${anoDe} - ${mesAte} de ${anoAte}`;
  }

  return de === ate ? formatarBr(de) : `${formatarBr(de)} - ${formatarBr(ate)}`;
}

/** yyyy-MM-dd -> dd/MM/yyyy, sem passar por Date (nada de fuso). */
function formatarBr(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}

/**
 * Onde a régua deve abrir.
 *
 * No período escolhido quando existe um; no mês de hoje quando não existe. Abrir
 * sempre em hoje faria quem tem "março de 2026" filtrado abrir a régua em agosto
 * e não ver a própria seleção.
 */
export function ancoraInicial(de: string, ate: string, hoje: string): string {
  if (ehDataISO(de)) return de;
  if (ehDataISO(ate)) return ate;
  return hoje;
}

/**
 * A granularidade que o período escolhido sugere.
 *
 * Manda a BORDA, não a duração: um período que começa no dia 1 e termina no
 * último dia do mês é um MÊS, e a régua tem que reabrir em meses — foi assim que
 * a pessoa escolheu, e é assim que ela vai escolher o próximo. Julgar só pelo
 * tamanho fazia "agosto de 2026" (31 dias) reabrir na régua de dias, com os 31
 * blocos pintados e nenhum mês à vista para trocar.
 *
 * A duração entra depois, como desempate para o período que não fecha em borda
 * nenhuma (05/08 a 20/09, por exemplo).
 */
export function granularidadeDoPeriodo(
  de: string,
  ate: string,
): Granularidade | null {
  if (!ehDataISO(de) || !ehDataISO(ate)) return null;

  const comecaEmMes = de === primeiroDoMes(de);
  const terminaEmMes = ate === ultimoDoMes(ate);

  if (comecaEmMes && terminaEmMes) {
    const mesDe = Number(de.slice(5, 7));
    const mesAte = Number(ate.slice(5, 7));
    if (mesDe === 1 && mesAte === 12) return "ano";
    // Trimestre fecha em jan/abr/jul/out e termina em mar/jun/set/dez.
    if (mesDe % 3 === 1 && mesAte % 3 === 0) return "trimestre";
    return "mes";
  }

  // Segunda a domingo é semana, mesmo atravessando o mês.
  if (
    de === segundaDaSemana(de) &&
    ate === somarDias(segundaDaSemana(ate), 6)
  ) {
    return "semana";
  }

  const dias =
    Math.round((paraData(ate).getTime() - paraData(de).getTime()) / UM_DIA) + 1;
  if (dias <= 31) return "dia";
  if (dias <= 92) return "semana";
  if (dias <= 366) return "mes";
  if (dias <= 366 * 2) return "trimestre";
  return "ano";
}
