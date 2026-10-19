/**
 * Relatório "Sócios e ligadas" (PR 2 do controle total, D3 e D4 de 09/10/2026;
 * repaginado em 15/10/2026).
 *
 * EMPRESA LIGADA: o saldo do mútuo, o que a EMT mandou menos o que voltou. É
 * um direito da EMT, não uma despesa.
 *
 * Os centros de SÓCIO (distribuição de lucro) saíram dos relatórios em
 * 19/10/2026, a pedido do Tiago: as funções do banco ainda os devolvem, e é
 * aqui que eles são descartados, antes de chegar à tela ou à planilha.
 *
 * O cálculo mora no banco (`fn_rel_socios_ligadas` para os centros e o total,
 * `fn_rel_socios_ligadas_mensal` para o mês e o em aberto); aqui só se junta e
 * se soma em centavos.
 */
export interface SocioLigadaLinha {
  centroId: string;
  centro: string;
  /**
   * Tipo do centro raiz. Empresa ligada sempre aparece; outro tipo (uma obra)
   * só aparece quando tem rateio de mútuo. Sócio é descartado.
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

export interface SociosLigadasRelatorio {
  ano: number;
  ligadas: CentroSocioLigada[];
  totalLigadas: { ano: ValoresSocioLigada; acumulado: ValoresSocioLigada };
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

/**
 * Junta os centros (com o total da função de origem) e a série mensal, sem os
 * centros de sócio.
 *
 * `centros` vem de `fn_rel_socios_ligadas` sem corte de período: é quem diz
 * QUAIS centros aparecem (ligada ativa aparece mesmo sem movimento).
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
  const linhas: CentroSocioLigada[] = centros.filter((c) => c.tipo !== "socio").map((c) => {
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

  // Maior saldo devedor primeiro: é a pergunta do relatório.
  const ligadas = linhas.sort((a, b) => b.acumulado.saldo - a.acumulado.saldo);

  return {
    ano,
    ligadas,
    totalLigadas: {
      ano: somarValores(ligadas.map((s) => s.ano)),
      acumulado: somarValores(ligadas.map((s) => s.acumulado)),
    },
    divergentes,
  };
}
