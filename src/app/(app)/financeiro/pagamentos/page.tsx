import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { dataHojeISO } from "@/lib/formatadores";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarAnexosPorDocumento } from "@/modules/_shared/anexos/queries";
import { listarFornecedores } from "@/modules/financeiro/lancamentos/queries";
import { PagamentosCliente } from "@/modules/financeiro/pagamentos/components/pagamentos-cliente";
import {
  listarContasBancarias,
  listarParcelasAprovadas,
  listarParcelasPagas,
} from "@/modules/financeiro/pagamentos/queries";

const TAMANHO_PAGINA = 25;

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Teto do filtro de valor: o mesmo da coluna NUMERIC(14,2). */
const VALOR_MAXIMO = 999999999999.99;
/** Tamanho máximo do termo de busca aceito (o mesmo da action). */
const MAX_BUSCA = 120;

type Parametro = string | string[] | undefined;

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

  // As duas abas têm filtros próprios, em parâmetros próprios (o histórico usa
  // o prefixo h_): compartilhar os mesmos parâmetros faria filtrar uma aba
  // filtrar a outra por trás, com o filtro escondido na aba de lá.
  const params = await searchParams;

  const valorAPagar = faixaValor(params.valor_de, params.valor_ate);
  const vencAPagar = periodo(params.venc_de, params.venc_ate);
  const progAPagar = periodo(params.prog_de, params.prog_ate);
  const aPagar = {
    busca: typeof params.busca === "string" ? params.busca : "",
    fornecedor: parametroUuid(params.fornecedor) ?? "",
    conta: parametroUuid(params.conta) ?? "",
    valorDe: texto(valorAPagar.de),
    valorAte: texto(valorAPagar.ate),
    vencDe: texto(vencAPagar.de),
    vencAte: texto(vencAPagar.ate),
    progDe: texto(progAPagar.de),
    progAte: texto(progAPagar.ate),
  };

  const valorPagas = faixaValor(params.h_valor_de, params.h_valor_ate);
  const vencPagas = periodo(params.h_venc_de, params.h_venc_ate);
  const progPagas = periodo(params.h_prog_de, params.h_prog_ate);
  const pagoPagas = periodo(params.h_pago_de, params.h_pago_ate);
  const filtrosPagas = {
    busca: parametroBusca(params.h_busca),
    fornecedorId: parametroUuid(params.h_fornecedor),
    contaBancariaId: parametroUuid(params.h_conta),
    valorDe: valorPagas.de,
    valorAte: valorPagas.ate,
    vencimentoDe: vencPagas.de,
    vencimentoAte: vencPagas.ate,
    programadaDe: progPagas.de,
    programadaAte: progPagas.ate,
    pagamentoDe: pagoPagas.de,
    pagamentoAte: pagoPagas.ate,
  };

  const [aprovadas, pagas, contas, fornecedores] = await Promise.all([
    listarParcelasAprovadas(),
    listarParcelasPagas({
      pagina: 0,
      tamanho: TAMANHO_PAGINA,
      filtros: filtrosPagas,
    }),
    listarContasBancarias(),
    listarFornecedores(),
  ]);

  // Anexos das parcelas a pagar numa consulta só (o pagamento é a parcela).
  const anexosPorParcela = await listarAnexosPorDocumento(
    "pagamento",
    aprovadas.map((parcela) => parcela.id),
  );

  return (
    <>
      <PageHeader
        titulo="Pagamentos"
        descricao="Pague as parcelas já aprovadas e acompanhe o histórico de pagamentos"
      />
      <PagamentosCliente
        hoje={dataHojeISO()}
        aprovadas={aprovadas}
        pagas={pagas.itens}
        totalPagas={pagas.total}
        contas={contas}
        fornecedores={fornecedores}
        podePagar={podePagar}
        podeEstornar={podeEstornar}
        anexosPorParcela={anexosPorParcela}
        valoresAPagar={aPagar}
        // Vai o texto para os campos e o objeto já validado para a action que
        // pagina o histórico: a página é a única a interpretar a URL.
        valoresPagas={{
          busca: filtrosPagas.busca ?? "",
          fornecedor: filtrosPagas.fornecedorId ?? "",
          conta: filtrosPagas.contaBancariaId ?? "",
          valorDe: texto(filtrosPagas.valorDe),
          valorAte: texto(filtrosPagas.valorAte),
          vencDe: texto(filtrosPagas.vencimentoDe),
          vencAte: texto(filtrosPagas.vencimentoAte),
          progDe: texto(filtrosPagas.programadaDe),
          progAte: texto(filtrosPagas.programadaAte),
          pagoDe: texto(filtrosPagas.pagamentoDe),
          pagoAte: texto(filtrosPagas.pagamentoAte),
        }}
        filtrosPagas={filtrosPagas}
      />
    </>
  );
}
