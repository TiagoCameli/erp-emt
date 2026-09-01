import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { dataHojeISO } from "@/lib/formatadores";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarAnexosPorDocumento } from "@/modules/_shared/anexos/queries";
import {
  listarCategorias,
  listarCentrosCusto,
  listarFormasPagamento,
  listarFornecedores,
} from "@/modules/financeiro/lancamentos/queries";
import { BotaoExportarPagamentos } from "@/modules/financeiro/pagamentos/components/botao-exportar-pagamentos";
import { PagamentosCliente } from "@/modules/financeiro/pagamentos/components/pagamentos-cliente";
import { STATUS_PARCELA_ABERTA } from "@/modules/financeiro/_shared/formato";
import {
  lerCatalogoDaUrl,
  lerUuidsDaUrl,
} from "@/modules/financeiro/_shared/listas-na-url";
import {
  listarContasBancarias,
  listarParcelasAPagar,
  listarParcelasPagas,
  somaDasParcelasPagas,
} from "@/modules/financeiro/pagamentos/queries";

/**
 * A Server Action de exportar roda na função DESTA página, não numa função
 * própria. Exportar Pagamentos é ler a fila inteira mais o histórico em páginas
 * e montar o .xlsx na memória. Com o teto padrão da Vercel (10 a 15s) isso morre
 * no meio e devolve erro no lugar do arquivo — foi o que aconteceu na primeira
 * vez que o botão foi usado, em 01/09/2026, e não havia log de aplicação para
 * apontar a causa (a Vercel aqui é plano hobby). 60s é o máximo que vale em
 * qualquer plano. Mesma razão do `maxDuration` de /financeiro/lancamentos, e
 * `max-duration-de-quem-exporta.test.ts` cobra isto de toda página que exporta.
 */
export const maxDuration = 60;

const TAMANHO_PAGINA = 25;

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Teto do filtro de valor: o mesmo da coluna NUMERIC(14,2). */
const VALOR_MAXIMO = 999999999999.99;
/** Tamanho máximo do termo de busca aceito (o mesmo da action). */
const MAX_BUSCA = 120;

type Parametro = string | string[] | undefined;

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Mês de referência da URL (yyyy-MM) para o primeiro dia (yyyy-MM-01), que é o
 * que a coluna `mes_competencia` guarda.
 */
function parametroMes(valor: Parametro): string | undefined {
  return typeof valor === "string" && MES.test(valor) ? `${valor}-01` : undefined;
}

/** Origem do lançamento aceita no filtro. Lista fechada: o resto é lixo de URL. */
const ORIGENS = new Set([
  "manual",
  "oc",
  "folha",
  "folha_guia",
  "diaria",
  "adiantamento",
]);

function parametroOrigem(valor: Parametro): string | undefined {
  return typeof valor === "string" && ORIGENS.has(valor) ? valor : undefined;
}

/** Uuid vindo da URL, ou undefined. Evita mandar lixo pro filtro do PostgREST. */
function parametroUuid(valor: Parametro): string | undefined {
  return typeof valor === "string" && UUID.test(valor) ? valor : undefined;
}

/** Data yyyy-MM-dd vinda da URL, ou undefined se não for uma data. */
function parametroData(valor: Parametro): string | undefined {
  if (typeof valor !== "string" || !DATA_ISO.test(valor)) return undefined;
  return Number.isNaN(new Date(valor).getTime()) ? undefined : valor;
}

/** Valor monetário vindo da URL (não negativo, dentro da coluna do banco). */
function parametroValor(valor: Parametro): number | undefined {
  if (typeof valor !== "string" || valor.trim() === "") return undefined;
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < 0 || numero > VALOR_MAXIMO) {
    return undefined;
  }
  return numero;
}

/** Termo de busca vindo da URL, aparado no limite que a action aceita. */
/**
 * Situações da parcela vindas da URL, restritas às de fila aberta e na ordem do
 * catálogo. Aceita uma (`?situacao=aprovado`, que é como o cartão "Vence em até
 * 7 dias" do Painel chega) ou várias (`?situacao=aprovado,pendente`).
 */
function parametroSituacoes(valor: Parametro): string[] {
  return lerCatalogoDaUrl(valor, STATUS_PARCELA_ABERTA);
}

/** Aba que abre primeiro. O cartão "Pago no mês" do Painel chega com `aba=pagas`. */
function parametroAba(valor: Parametro): "a-pagar" | "pagas" {
  return valor === "pagas" ? "pagas" : "a-pagar";
}

function parametroBusca(valor: Parametro): string | undefined {
  if (typeof valor !== "string") return undefined;
  const termo = valor.trim().slice(0, MAX_BUSCA);
  return termo === "" ? undefined : termo;
}

/**
 * Período com as duas pontas na ordem certa. Período invertido (de > ate) é
 * trocado de lado, senão a lista vem vazia sem explicação nenhuma.
 */
function periodo(
  inicio: Parametro,
  fim: Parametro,
): { de?: string; ate?: string } {
  let de = parametroData(inicio);
  let ate = parametroData(fim);
  if (de && ate && de > ate) [de, ate] = [ate, de];
  return { de, ate };
}

/** Faixa de valor com as pontas na ordem certa, pelo mesmo motivo do período. */
function faixaValor(
  inicio: Parametro,
  fim: Parametro,
): { de?: number; ate?: number } {
  let de = parametroValor(inicio);
  let ate = parametroValor(fim);
  if (de !== undefined && ate !== undefined && de > ate) [de, ate] = [ate, de];
  return { de, ate };
}

/** Texto do filtro para a tela, só quando o parâmetro passou na validação. */
function texto(valor: string | number | undefined): string {
  return valor === undefined ? "" : String(valor);
}

export default async function PaginaPagamentos({
  searchParams,
}: {
  searchParams: Promise<Record<string, Parametro>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "financeiro.pagamentos", "ver")) {
    notFound();
  }

  const podePagar = temPermissao(usuario, "financeiro.pagamentos", "criar");
  const podeEstornar = temPermissao(usuario, "financeiro.pagamentos", "excluir");
  /**
   * Devolver uma parcela aprovada para a fila de aprovação é ação de QUEM
   * APROVA, então a permissão é a do outro recurso (`desaprovar` em
   * aprovacao-pagamentos) e não uma do módulo de pagamentos: quem só paga não
   * pode desfazer a autorização que recebeu.
   */
  const podeDesaprovar = temPermissao(
    usuario,
    "financeiro.aprovacao-pagamentos",
    "desaprovar",
  );

  // As duas abas têm filtros próprios, em parâmetros próprios (o histórico usa
  // o prefixo h_): compartilhar os mesmos parâmetros faria filtrar uma aba
  // filtrar a outra por trás, com o filtro escondido na aba de lá.
  const params = await searchParams;

  const valorAPagar = faixaValor(params.valor_de, params.valor_ate);
  const vencAPagar = periodo(params.venc_de, params.venc_ate);
  const progAPagar = periodo(params.prog_de, params.prog_ate);
  const compraAPagar = periodo(params.compra_de, params.compra_ate);
  const aPagar = {
    busca: typeof params.busca === "string" ? params.busca : "",
    // Só situação de parcela EM ABERTO: `pago` e `cancelado` na fila a pagar
    // trariam uma lista vazia sem explicar por quê.
    situacoes: parametroSituacoes(params.situacao),
    fornecedorIds: lerUuidsDaUrl(params.fornecedor),
    contaIds: lerUuidsDaUrl(params.conta),
    valorDe: texto(valorAPagar.de),
    valorAte: texto(valorAPagar.ate),
    vencDe: texto(vencAPagar.de),
    vencAte: texto(vencAPagar.ate),
    progDe: texto(progAPagar.de),
    progAte: texto(progAPagar.ate),
    // Dimensões do lançamento. Esta aba filtra em memória (carrega tudo), então
    // aqui só o texto do campo importa -- quem compara é o cliente.
    categoriaIds: lerUuidsDaUrl(params.categoria),
    centroIds: lerUuidsDaUrl(params.centro),
    formaIds: lerUuidsDaUrl(params.forma),
    mes: typeof params.mes === "string" && MES.test(params.mes) ? params.mes : "",
    origem: parametroOrigem(params.origem) ?? "",
    compraDe: texto(compraAPagar.de),
    compraAte: texto(compraAPagar.ate),
  };

  const valorPagas = faixaValor(params.h_valor_de, params.h_valor_ate);
  const vencPagas = periodo(params.h_venc_de, params.h_venc_ate);
  const progPagas = periodo(params.h_prog_de, params.h_prog_ate);
  const pagoPagas = periodo(params.h_pago_de, params.h_pago_ate);
  const compraPagas = periodo(params.h_compra_de, params.h_compra_ate);
  const filtrosPagas = {
    busca: parametroBusca(params.h_busca),
    fornecedorIds: lerUuidsDaUrl(params.h_fornecedor),
    contaBancariaIds: lerUuidsDaUrl(params.h_conta),
    valorDe: valorPagas.de,
    valorAte: valorPagas.ate,
    vencimentoDe: vencPagas.de,
    vencimentoAte: vencPagas.ate,
    programadaDe: progPagas.de,
    programadaAte: progPagas.ate,
    pagamentoDe: pagoPagas.de,
    pagamentoAte: pagoPagas.ate,
    categoriaIds: lerUuidsDaUrl(params.h_categoria),
    centroCustoIds: lerUuidsDaUrl(params.h_centro),
    formaPagamentoIds: lerUuidsDaUrl(params.h_forma),
    mesCompetencia: parametroMes(params.h_mes),
    origem: parametroOrigem(params.h_origem),
    compraDe: compraPagas.de,
    compraAte: compraPagas.ate,
  };

  const [
    aprovadas,
    pagas,
    somaPagas,
    contas,
    fornecedores,
    categorias,
    centrosCusto,
    formasPagamento,
  ] = await Promise.all([
    // A fila traz aprovadas E as que ainda aguardam aprovação: quem paga
    // precisa enxergar o que vem pela frente. Só as aprovadas ganham o botão.
    listarParcelasAPagar(),
    listarParcelasPagas({
      pagina: 0,
      tamanho: TAMANHO_PAGINA,
      filtros: filtrosPagas,
    }),
    // Soma do recorte inteiro, não da página: é ela que tem que bater com o
    // cartão "Pago no mês" do Painel quando se chega aqui clicando nele.
    somaDasParcelasPagas(filtrosPagas),
    listarContasBancarias(),
    listarFornecedores(),
    listarCategorias(),
    listarCentrosCusto(),
    listarFormasPagamento(),
  ]);

  // Anexos das parcelas a pagar numa consulta só (o pagamento é a parcela).
  const anexosPorParcela = await listarAnexosPorDocumento(
    "pagamento",
    aprovadas.map((parcela: { id: string }) => parcela.id),
  );

  return (
    <>
      <PageHeader
        modulo="Financeiro"
        titulo="Pagamentos"
        descricao="Veja tudo que há a pagar, aprovado ou aguardando aprovação, pague em lote e acompanhe o histórico"
        // Os dois recortes vão para o botão exatamente como as duas listas
        // acima os receberam: é a página que interpreta a URL, e a planilha sai
        // do mesmo objeto que montou a tela. Um segundo lugar lendo a URL
        // divergiria no primeiro filtro novo.
        acoes={
          <BotaoExportarPagamentos
            valoresAPagar={aPagar}
            filtrosPagas={filtrosPagas}
          />
        }
      />
      <PagamentosCliente
        hoje={dataHojeISO()}
        aprovadas={aprovadas}
        pagas={pagas.itens}
        totalPagas={pagas.total}
        somaPagas={somaPagas}
        abaInicial={parametroAba(params.aba)}
        contas={contas}
        fornecedores={fornecedores}
        categorias={categorias}
        centrosCusto={centrosCusto}
        formasPagamento={formasPagamento}
        podePagar={podePagar}
        podeEstornar={podeEstornar}
        podeDesaprovar={podeDesaprovar}
        anexosPorParcela={anexosPorParcela}
        valoresAPagar={aPagar}
        // Vai o texto para os campos e o objeto já validado para a action que
        // pagina o histórico: a página é a única a interpretar a URL.
        valoresPagas={{
          busca: filtrosPagas.busca ?? "",
          fornecedorIds: filtrosPagas.fornecedorIds,
          contaIds: filtrosPagas.contaBancariaIds,
          valorDe: texto(filtrosPagas.valorDe),
          valorAte: texto(filtrosPagas.valorAte),
          vencDe: texto(filtrosPagas.vencimentoDe),
          vencAte: texto(filtrosPagas.vencimentoAte),
          progDe: texto(filtrosPagas.programadaDe),
          progAte: texto(filtrosPagas.programadaAte),
          pagoDe: texto(filtrosPagas.pagamentoDe),
          pagoAte: texto(filtrosPagas.pagamentoAte),
          categoriaIds: filtrosPagas.categoriaIds,
          centroIds: filtrosPagas.centroCustoIds,
          formaIds: filtrosPagas.formaPagamentoIds,
          // O campo da tela é yyyy-MM; o filtro do banco é o primeiro dia.
          mes: filtrosPagas.mesCompetencia?.slice(0, 7) ?? "",
          origem: filtrosPagas.origem ?? "",
          compraDe: texto(filtrosPagas.compraDe),
          compraAte: texto(filtrosPagas.compraAte),
        }}
        filtrosPagas={filtrosPagas}
      />
    </>
  );
}
