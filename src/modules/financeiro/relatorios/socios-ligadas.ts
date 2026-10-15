/**
 * Relatório "Sócios e ligadas" (PR 2 do controle total, D3 e D4 de 09/10/2026;
 * repaginado em 15/10/2026).
 *
 * Duas histórias que não se somam, e por isso moram em blocos separados:
 *
 * - SÓCIO: quanto cada um retirou (distribuição), no ano e desde o início, e
 *   quanto disso ainda não saiu do caixa. Sócio não devolve: a coluna
 *   "devolvido" era sempre zero.
 * - EMPRESA LIGADA: o saldo do mútuo, o que a EMT mandou menos o que voltou. É
 *   um direito da EMT, não uma despesa.
 *
 * Somar distribuição com saldo de mútuo (a linha Total da versão anterior) não
 * dá número nenhum. O cálculo mora no banco (`fn_rel_socios_ligadas` para os
 * centros e o total, `fn_rel_socios_ligadas_mensal` para o mês e o em aberto);
 * aqui só se junta e se soma em centavos.
 */
export interface SocioLigadaLinha {
  centroId: string;
  centro: string;
  /**
   * Tipo do centro raiz. Sócio e empresa ligada sempre aparecem; outro tipo
   * (uma obra) só aparece quando tem rateio de distribuição ou mútuo.
   */
  tipo: string;
  ativo: boolean;
  enviado: number;
  devolvido: number;
  saldo: number;
}

/** Um mês de um centro, já com a parte que ainda não foi paga (ou recebida). */
export interface SocioLigadaMes {
  centroId: string;
  /** yyyy-MM */
  mes: string;
  enviado: number;
  enviadoAberto: number;
  devolvido: number;
  devolvidoAberto: number;
}

export const ROTULO_TIPO_SOCIO_LIGADA: Record<string, string> = {
  socio: "Sócio",
  empresa_ligada: "Empresa ligada",
};

export function rotuloTipoSocioLigada(tipo: string): string {
  return ROTULO_TIPO_SOCIO_LIGADA[tipo] ?? "Outro centro (rateio de sócio ou mútuo)";
}

/** Valores de um centro num recorte (o ano ou o acumulado). */
export interface ValoresSocioLigada {
  enviado: number;
  /** Parte do enviado cujas parcelas ainda não foram pagas. */
  enviadoAberto: number;
  /** enviado - enviadoAberto: o que já saiu do caixa. */
  enviadoPago: number;
  devolvido: number;
  devolvidoAberto: number;
  /** enviado - devolvido. */
  saldo: number;
}

export interface CentroSocioLigada {
  centroId: string;
  centro: string;
  tipo: string;
  ativo: boolean;
  ano: ValoresSocioLigada;
  acumulado: ValoresSocioLigada;
}

export interface MesDaSerie {
  /** yyyy-MM */
  mes: string;
  /** Valor enviado no mês, por centro (só os que tiveram movimento). */
  porCentro: Record<string, number>;
  total: number;
}

export interface SociosLigadasRelatorio {
  ano: number;
  socios: CentroSocioLigada[];
  ligadas: CentroSocioLigada[];
  totalSocios: { ano: ValoresSocioLigada; acumulado: ValoresSocioLigada };
  totalLigadas: { ano: ValoresSocioLigada; acumulado: ValoresSocioLigada };
  /** Janeiro até o mês corrente do ano, um item por mês, mesmo sem movimento. */
  serieSocios: MesDaSerie[];
  /**
   * Centros cuja soma mensal não fechou com o total da função de origem. Vazio
   * sempre que as duas funções concordam; a tela avisa se não estiver.
   */
  divergentes: string[];
}

const centavos = (v: number) => Math.round(v * 100);

function valores(c: {
  enviado: number;
  enviadoAberto: number;
  devolvido: number;
  devolvidoAberto: number;
}): ValoresSocioLigada {
  return {
    enviado: c.enviado / 100,
    enviadoAberto: c.enviadoAberto / 100,
    enviadoPago: (c.enviado - c.enviadoAberto) / 100,
    devolvido: c.devolvido / 100,
    devolvidoAberto: c.devolvidoAberto / 100,
    saldo: (c.enviado - c.devolvido) / 100,
  };
}

type Acumulador = { enviado: number; enviadoAberto: number; devolvido: number; devolvidoAberto: number };
const zerado = (): Acumulador => ({ enviado: 0, enviadoAberto: 0, devolvido: 0, devolvidoAberto: 0 });

function somarMes(acc: Acumulador, m: SocioLigadaMes): void {
  acc.enviado += centavos(m.enviado);
  acc.enviadoAberto += centavos(m.enviadoAberto);
  acc.devolvido += centavos(m.devolvido);
  acc.devolvidoAberto += centavos(m.devolvidoAberto);
}

function somarValores(lista: ValoresSocioLigada[]): ValoresSocioLigada {
  const acc = zerado();
  for (const v of lista) {
    acc.enviado += centavos(v.enviado);
    acc.enviadoAberto += centavos(v.enviadoAberto);
    acc.devolvido += centavos(v.devolvido);
    acc.devolvidoAberto += centavos(v.devolvidoAberto);
  }
  return valores(acc);
}

/** "2026-10" -> ["2026-01", ..., "2026-10"]. */
export function mesesDoAnoAte(mesCorrente: string): string[] {
  const ano = mesCorrente.slice(0, 4);
  const ate = Number(mesCorrente.slice(5, 7));
  return Array.from({ length: ate }, (_, i) => `${ano}-${String(i + 1).padStart(2, "0")}`);
}

/**
 * Junta os centros (com o total da função de origem) e a série mensal.
 *
 * `centros` vem de `fn_rel_socios_ligadas` sem corte de período: é quem diz
 * QUAIS centros aparecem (sócio e ligada ativos aparecem mesmo sem movimento).
 * O acumulado sai da série, e a soma é conferida contra o total do centro.
 */
export function montarSociosLigadas(
  centros: SocioLigadaLinha[],
  meses: SocioLigadaMes[],
  mesCorrente: string,
): SociosLigadasRelatorio {
  const ano = Number(mesCorrente.slice(0, 4));
  const prefixoAno = `${ano}-`;

  const acumulado = new Map<string, Acumulador>();
  const doAno = new Map<string, Acumulador>();
  for (const m of meses) {
    if (!acumulado.has(m.centroId)) acumulado.set(m.centroId, zerado());
    somarMes(acumulado.get(m.centroId)!, m);
    if (m.mes.startsWith(prefixoAno)) {
      if (!doAno.has(m.centroId)) doAno.set(m.centroId, zerado());
      somarMes(doAno.get(m.centroId)!, m);
    }
  }

  const divergentes: string[] = [];
  const linhas: CentroSocioLigada[] = centros.map((c) => {
    const acc = acumulado.get(c.centroId) ?? zerado();
    if (acc.enviado !== centavos(c.enviado) || acc.devolvido !== centavos(c.devolvido)) {
      divergentes.push(c.centro);
    }
    return {
      centroId: c.centroId,
      centro: c.centro,
      tipo: c.tipo,
      ativo: c.ativo,
      ano: valores(doAno.get(c.centroId) ?? zerado()),
      acumulado: valores(acc),
    };
  });

  // Maior retirada do ano primeiro; empate (ninguém retirou) cai no acumulado.
  const socios = linhas
    .filter((l) => l.tipo === "socio")
    .sort((a, b) => b.ano.enviado - a.ano.enviado || b.acumulado.enviado - a.acumulado.enviado);
  // Maior saldo devedor primeiro: é a pergunta do bloco.
  const ligadas = linhas
    .filter((l) => l.tipo !== "socio")
    .sort((a, b) => b.acumulado.saldo - a.acumulado.saldo);

  const idsSocios = new Set(socios.map((s) => s.centroId));
  const serieSocios: MesDaSerie[] = mesesDoAnoAte(mesCorrente).map((mes) => {
    const porCentroCentavos: Record<string, number> = {};
    let total = 0;
    for (const m of meses) {
      if (m.mes !== mes || !idsSocios.has(m.centroId) || m.enviado === 0) continue;
      porCentroCentavos[m.centroId] = (porCentroCentavos[m.centroId] ?? 0) + centavos(m.enviado);
      total += centavos(m.enviado);
    }
    const porCentro = Object.fromEntries(
      Object.entries(porCentroCentavos).map(([id, c]) => [id, c / 100]),
    );
    return { mes, porCentro, total: total / 100 };
  });

  return {
    ano,
    socios,
    ligadas,
    totalSocios: {
      ano: somarValores(socios.map((s) => s.ano)),
      acumulado: somarValores(socios.map((s) => s.acumulado)),
    },
    totalLigadas: {
      ano: somarValores(ligadas.map((s) => s.ano)),
      acumulado: somarValores(ligadas.map((s) => s.acumulado)),
    },
    serieSocios,
    divergentes,
  };
}
