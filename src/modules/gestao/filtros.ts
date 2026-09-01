import { mesHojeISO } from "@/lib/formatadores";
import {
  janelaEntre,
  janelaPainel,
  MESES_PAINEL,
  somarMeses,
  type JanelaPainel,
} from "@/modules/gestao/calculo";
// Módulo PURO de formato de lista na URL, e não uma query do Financeiro: a
// alternativa era uma segunda implementação da vírgula, da deduplicação e do
// teto aqui dentro, que é exatamente o defeito contra o qual aquele arquivo foi
// escrito (duas implementações divergem no primeiro detalhe que alguém
// acrescenta de um lado, e a tela abre sem erro mostrando outro conjunto).
import { lerUuidsDaUrl } from "@/modules/financeiro/_shared/listas-na-url";

/**
 * Contrato da URL do painel de Gestão: centros de custo, período por mês de
 * referência e categorias financeiras.
 *
 * Mora num módulo só, e não dentro da página, pelo mesmo motivo do
 * `lancamentos/filtros.ts`: a página monta a tela e as consultas de custo leem os
 * mesmos filtros. Dois lugares interpretando a URL divergem no primeiro filtro
 * novo, e aí um cartão passa a somar um conjunto e o gráfico ao lado outro.
 *
 * ## Escolha MÚLTIPLA desde 01/09/2026
 *
 * `centro=` e `categoria=` deixaram de guardar um id e passaram a guardar uma
 * LISTA separada por vírgula, no formato de `listas-na-url.ts`, e nasceu o
 * `etapa=` ao lado — o mesmo par que o relatório de Custo por CC usa desde
 * 20/08/2026. O painel era a última tela de custo presa a um centro só.
 *
 * Link antigo continua valendo sem tradução nenhuma: `?centro=<uuid>` é uma lista
 * de um item. É por isso que a lista vazia significa "todos", e não "nenhum".
 *
 * Módulo puro: nada de banco, nada de React.
 */

/** searchParams do App Router, do jeito que chegam na página. */
export type ParametrosUrl = Record<string, string | string[] | undefined>;

const MES = /^\d{4}-\d{2}$/;

/** O que as consultas de custo recebem. */
export interface FiltrosPainel {
  /** Janela de competência: a mesma para todos os cortes de custo. */
  janela: JanelaPainel;
  /**
   * Raízes de centro de custo escolhidas, na ordem de escolha. Vazio = todas.
   *
   * Cada uma vale pela SUBÁRVORE dela (ver `fn_centro_custo_subarvore`):
   * escolher a obra traz as etapas dela.
   */
  centroIds: string[];
  /**
   * Etapas escolhidas dentro das raízes acima. Vazio = a raiz inteira.
   *
   * Parâmetro PRÓPRIO na URL, e não misturado no `centro`, porque as duas coisas
   * significam diferente: a raiz é o conjunto e a etapa é o recorte dentro dele.
   * Quem traduz o par no que vai ao banco é `_shared/centro-custo/filtro.ts`
   * (`centrosEfetivos`), que conhece o cadastro; esta leitura é pura e só garante
   * que são uuids.
   */
  etapaIds: string[];
  /** Categorias financeiras do lançamento, ou vazio para todas. */
  categoriaIds: string[];
}

/** O que a barra de filtros mostra de volta (lista vazia = sem filtro). */
export interface ValoresFiltrosPainel {
  centro: string[];
  etapa: string[];
  categoria: string[];
  /** Mês inicial no formato do input (yyyy-MM). */
  mesDe: string;
  mesAte: string;
}

export interface LeituraFiltrosPainel {
  filtros: FiltrosPainel;
  valores: ValoresFiltrosPainel;
  /**
   * Algum filtro de recorte está ativo? A tela usa para avisar, nos blocos que
   * não obedecem ao filtro, que o número ali é do total.
   */
  temRecorte: boolean;
  /** O período foi escolhido na tela (e não é a janela padrão de 6 meses)? */
  periodoEscolhido: boolean;
}

/** Mês yyyy-MM vindo da URL, ou undefined. */
function parametroMes(
  valor: string | string[] | undefined,
): string | undefined {
  if (typeof valor !== "string" || !MES.test(valor)) return undefined;
  const mes = Number(valor.slice(5, 7));
  return mes >= 1 && mes <= 12 ? valor : undefined;
}

/**
 * Decide a janela a partir do que veio na URL.
 *
 * Com as duas pontas, vale o intervalo. Com uma ponta só, a outra é completada
 * de um jeito previsível: início solto vai até o mês corrente, fim solto abre os
 * seis meses anteriores a ele. Sem nenhuma, é a janela padrão do painel, que é o
 * comportamento que a tela sempre teve.
 */
function janelaDosFiltros(
  mesDe: string | undefined,
  mesAte: string | undefined,
  mesHoje: string,
): { janela: JanelaPainel; escolhido: boolean } {
  if (mesDe !== undefined && mesAte !== undefined) {
    return { janela: janelaEntre(mesDe, mesAte), escolhido: true };
  }
  if (mesDe !== undefined) {
    return { janela: janelaEntre(mesDe, mesHoje), escolhido: true };
  }
  if (mesAte !== undefined) {
    const inicio = somarMeses(`${mesAte}-01`, -(MESES_PAINEL - 1)).slice(0, 7);
    return { janela: janelaEntre(inicio, mesAte), escolhido: true };
  }
  return { janela: janelaPainel(mesHoje), escolhido: false };
}

/**
 * Lê, valida e traduz a URL do painel.
 *
 * `mesHoje` entra por parâmetro (yyyy-MM no fuso de Rio Branco) para a função
 * ficar pura: assim o teste não muda de resultado no mês que vem.
 */
export function lerFiltrosPainel(
  params: ParametrosUrl,
  mesHoje: string = mesHojeISO(),
): LeituraFiltrosPainel {
  const centroIds = lerUuidsDaUrl(params.centro);
  const etapaIds = lerUuidsDaUrl(params.etapa);
  const categoriaIds = lerUuidsDaUrl(params.categoria);
  const mesDe = parametroMes(params.mes_de);
  const mesAte = parametroMes(params.mes_ate);

  const { janela, escolhido } = janelaDosFiltros(mesDe, mesAte, mesHoje);

  return {
    filtros: { janela, centroIds, etapaIds, categoriaIds },
    valores: {
      // Só o que passou na validação volta para a barra: parâmetro inválido na
      // URL não pode aparecer preenchido como se estivesse valendo.
      centro: centroIds,
      etapa: etapaIds,
      categoria: categoriaIds,
      mesDe: mesDe ?? "",
      mesAte: mesAte ?? "",
    },
    // Período não conta como recorte para o aviso: os blocos que ignoram o
    // filtro são fotos do momento (a pagar em aberto, OCs a aprovar), e "hoje"
    // não muda com o período escolhido. O que os deixa fora de conversa é o
    // recorte por centro de custo ou categoria.
    //
    // A etapa NÃO entra na conta de propósito: etapa órfã (a raiz saiu da
    // escolha) é descartada antes de chegar ao banco, então ela sozinha não
    // recorta nada e não pode acender um aviso de que recorta.
    temRecorte: centroIds.length > 0 || categoriaIds.length > 0,
    periodoEscolhido: escolhido,
  };
}
