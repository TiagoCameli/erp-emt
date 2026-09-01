import { lerUuidsDaUrl } from "@/modules/financeiro/_shared/listas-na-url";
import { rotuloMes } from "@/modules/financeiro/relatorios/calculo";
import {
  lerMesDaUrl,
  lerOpcaoDaUrl,
  type ParametrosUrl,
} from "@/modules/financeiro/relatorios/filtros-periodo";

/**
 * Contrato da URL do relatório de Fluxo de caixa: a janela de meses que o gráfico
 * desenha e os cartões somam, e os centros de cada lado do caixa.
 *
 * ## Por que este relatório precisava de janela
 *
 * Ele não tinha filtro nenhum, e `fn_rel_fluxo_caixa()` devolve TODO mês em que
 * existe parcela — pelo vencimento, então o financiamento de 57 parcelas empurra
 * o eixo até 05/2031. Medido em 29/08/2026: 78 meses no gráfico. Setenta e oito
 * colunas não se leem, e o cartão "Meses com movimento" contava as 78 como se
 * fossem informação sobre o caixa da empresa.
 *
 * ## Por que o corte é por MÊS e no servidor
 *
 * A RPC devolve agregado (uma linha por mês, tipo e realizado: 98 linhas em
 * 29/08/2026), então cortar no servidor antes de somar custa um `filter` e resolve
 * a tela inteira de uma vez: os quatro cartões, o gráfico e a contagem de meses
 * passam a falar da MESMA janela. Cortar só no componente do gráfico deixaria os
 * cartões somando 2031 embaixo de um gráfico que para em 2027, que é a divergência
 * que este módulo existe para não ter.
 *
 * A janela continua sendo `filter` em TS mesmo depois de a RPC ganhar parâmetros
 * (01/09/2026, os centros): a linha agregada já traz o mês, então cortá-la aqui
 * não perde nada. O centro é o oposto e por isso desceu ao banco — o rateio é do
 * LANÇAMENTO e o dinheiro é da PARCELA, e a fatia de um centro só se calcula
 * antes de agregar.
 *
 * Regime de CAIXA: o mês aqui é o do pagamento (realizado) ou o do vencimento
 * (projetado), nunca o mês de referência — por isso os parâmetros NÃO se chamam
 * `modo`/`mes`/`de`/`ate` como nos relatórios de competência. Trocar de relatório
 * na barra de cima não pode arrastar uma janela de competência para cá vestida de
 * janela de caixa: são dimensões diferentes com a mesma cara.
 *
 * ## O centro, ao contrário do tempo, é a MESMA dimensão dos outros relatórios
 *
 * Por isso os parâmetros de centro **são** os do Custo x receita
 * (`centro_custo`, `etapa_custo`, `centro_receita`, `etapa_receita`), e não uns
 * `fluxo_centro` próprios. Tempo aqui quer dizer outra coisa (caixa x
 * competência) e herdar a janela do vizinho filtraria uma dimensão pela outra em
 * silêncio; "obra 009" quer dizer obra 009 nos dois, então trocar de relatório
 * na barra de cima mantendo a obra escolhida é o comportamento certo — e é o que
 * `filtros-periodo.ts` já faz de propósito com `modo`/`mes`/`de`/`ate` entre os
 * três relatórios de competência.
 *
 * O mapeamento dos dois lados é direto: **saída é a_pagar** (o centro de CUSTO)
 * e **entrada é a_receber** (o centro de RECEITA), exatamente os dois lados que
 * `fn_rel_custo_receita` já separa.
 *
 * Cada lado escolhe em DOIS campos, a raiz e a etapa dela, e a tradução dos dois
 * numa lista só para o banco é de `_shared/centro-custo/filtro.ts` — a etapa
 * escolhida SUBSTITUI a raiz. Aqui só se garante que são uuids: a quem cada
 * etapa pertence depende do cadastro, e esta leitura é pura.
 *
 * Módulo puro: nada de banco, nada de React.
 */

/** De que jeito a janela do fluxo é escolhida. */
export type ModoFluxo = "janela" | "periodo" | "total";

export const MODOS_FLUXO: readonly ModoFluxo[] = ["janela", "periodo", "total"];

/**
 * Quantos meses a janela padrão enxerga para cada lado do mês corrente.
 *
 * Doze para trás é o histórico que se compara com o ano; doze para frente é o
 * compromisso já lançado. Fora disso o eixo vira uma reta rasteira de parcelas de
 * financiamento em 2031, que não é o caixa que alguém administra hoje.
 */
export const MESES_PARA_TRAS = 12;
export const MESES_PARA_FRENTE = 12;

export interface FiltrosFluxoCaixa {
  modo: ModoFluxo;
  /** Pontas da janela (yyyy-MM) no modo `periodo`. Vazio = ponta aberta. */
  de: string;
  ate: string;
  /**
   * Centros-raiz cujas SAÍDAS (a_pagar) entram. Vazio = todas.
   *
   * Cada um vale pela subárvore, e o que a RPC soma é a FATIA do rateio daquele
   * centro — não a parcela inteira. Ver `fn_rel_fluxo_caixa`.
   */
  centrosCusto: string[];
  /** Etapas escolhidas dentro dos centros do custo. Vazio = o centro inteiro. */
  etapasCusto: string[];
  /** Centros-raiz cujas ENTRADAS (a_receber) entram. Vazio = todas. */
  centrosReceita: string[];
  /** Etapas escolhidas dentro dos centros da receita. Vazio = o centro inteiro. */
  etapasReceita: string[];
}

/** A janela que vai ao servidor. Ponta ausente = sem limite daquele lado. */
export interface JanelaFluxo {
  de?: string;
  ate?: string;
}

/** Soma (ou subtrai) meses em `yyyy-MM`. Aritmética inteira, sem `Date`. */
function somarMeses(mes: string, quantos: number): string {
  const [ano, mesNumero] = mes.split("-").map(Number);
  const zeroBase = ano * 12 + (mesNumero - 1) + quantos;
  const anoNovo = Math.floor(zeroBase / 12);
  const mesNovo = (zeroBase % 12) + 1;
  return `${anoNovo}-${String(mesNovo).padStart(2, "0")}`;
}

/** Lê e valida a URL do fluxo de caixa. Sem parâmetro nenhum, vale a janela. */
export function lerFiltrosFluxoCaixa(params: ParametrosUrl): FiltrosFluxoCaixa {
  const modo = lerOpcaoDaUrl(params.fluxo_modo, MODOS_FLUXO) ?? "janela";

  let de = lerMesDaUrl(params.fluxo_de);
  let ate = lerMesDaUrl(params.fluxo_ate);
  // Janela invertida troca de lado em vez de devolver o relatório em branco: é
  // erro de digitação, e a mesma regra dos outros filtros de período do módulo.
  if (de && ate && de > ate) [de, ate] = [ate, de];

  return {
    modo,
    de,
    ate,
    centrosCusto: lerUuidsDaUrl(params.centro_custo),
    etapasCusto: lerUuidsDaUrl(params.etapa_custo),
    centrosReceita: lerUuidsDaUrl(params.centro_receita),
    etapasReceita: lerUuidsDaUrl(params.etapa_receita),
  };
}

/** A janela que vale, dado o modo. */
export function janelaDoFluxo(
  filtros: FiltrosFluxoCaixa,
  mesCorrente: string,
): JanelaFluxo {
  switch (filtros.modo) {
    case "janela":
      return {
        de: somarMeses(mesCorrente, -MESES_PARA_TRAS),
        ate: somarMeses(mesCorrente, MESES_PARA_FRENTE),
      };
    case "periodo": {
      const janela: JanelaFluxo = {};
      if (filtros.de) janela.de = filtros.de;
      if (filtros.ate) janela.ate = filtros.ate;
      return janela;
    }
    case "total":
      return {};
  }
}

/**
 * O mês (yyyy-MM) está dentro da janela?
 *
 * Comparação de string porque `yyyy-MM` ordena igual à data que representa, e é
 * exatamente o formato que a RPC devolve — converter para `Date` só criaria uma
 * chance de fuso horário mudar o mês de uma linha na virada.
 */
export function dentroDaJanela(mes: string, janela: JanelaFluxo): boolean {
  if (janela.de && mes < janela.de) return false;
  if (janela.ate && mes > janela.ate) return false;
  return true;
}

/**
 * Diz, em pt-BR, que o número daquele lado é FATIA e não total. Vazio quando o
 * lado não está filtrado.
 *
 * Existe porque os dois lados se escolhem separados: recortar só as saídas
 * deixaria o cartão de saídas mostrando a fatia de uma obra e o de entradas o
 * total da empresa, com o "Saldo projetado" somando os dois — dois números de
 * unidades diferentes com a mesma cara. Escrever a fatia no cartão é mais barato
 * que travar a escolha, e travar seria pior: comparar o custo de uma obra mais o
 * das máquinas que a servem contra a receita dela é a pergunta real.
 */
export function descreverFatia(quantosCentros: number): string {
  if (quantosCentros <= 0) return "";
  return quantosCentros === 1
    ? "Fatia de 1 centro escolhido"
    : `Fatia de ${quantosCentros} centros escolhidos`;
}

/** Descreve a janela em pt-BR, para o detalhe dos cartões. */
export function descreverJanela(janela: JanelaFluxo): string {
  if (janela.de && janela.ate) {
    return janela.de === janela.ate
      ? `Só ${rotuloMes(janela.de)}`
      : `De ${rotuloMes(janela.de)} a ${rotuloMes(janela.ate)}`;
  }
  if (janela.de) return `De ${rotuloMes(janela.de)} em diante`;
  if (janela.ate) return `Até ${rotuloMes(janela.ate)}`;
  return "Todos os meses com movimento";
}
