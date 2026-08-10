import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { mesParaCompetencia } from "@/lib/formatadores";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { LancamentosAcoesCabecalho } from "@/modules/financeiro/lancamentos/components/lancamentos-acoes-cabecalho";
import { LancamentosTabela } from "@/modules/financeiro/lancamentos/components/lancamentos-tabela";
import {
  listarCategorias,
  listarCentrosCusto,
  listarCondicoesPagamento,
  listarFormasPagamento,
  listarFornecedores,
  listarLancamentos,
} from "@/modules/financeiro/lancamentos/queries";
import {
  FILTROS_REVISAO,
  ORIGENS_LANCAMENTO,
} from "@/modules/financeiro/lancamentos/schemas";
import { listarContasBancarias } from "@/modules/financeiro/pagamentos/queries";
import type {
  StatusLancamento,
  TipoLancamento,
} from "@/modules/financeiro/_shared/formato";

const TIPOS_VALIDOS: TipoLancamento[] = ["a_pagar", "a_receber"];
const STATUS_VALIDOS: StatusLancamento[] = [
  "previsto",
  "a_pagar",
  "aprovado",
  "pago",
  "cancelado",
];
const TAMANHO_PADRAO = 25;

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Teto do filtro de valor: o mesmo da coluna NUMERIC(14,2). */
const VALOR_MAXIMO = 999999999999.99;

/** Lê e valida um parâmetro de filtro contra a lista de valores aceitos. */
function parametroValido<T extends string>(
  valor: string | string[] | undefined,
  validos: readonly T[],
): T | undefined {
  if (typeof valor !== "string") return undefined;
  return (validos as readonly string[]).includes(valor)
    ? (valor as T)
    : undefined;
}

/** Uuid vindo da URL, ou undefined. Evita mandar lixo pro filtro do PostgREST. */
function parametroUuid(
  valor: string | string[] | undefined,
): string | undefined {
  return typeof valor === "string" && UUID.test(valor) ? valor : undefined;
}

/** Data yyyy-MM-dd vinda da URL, ou undefined se não for uma data. */
function parametroData(
  valor: string | string[] | undefined,
): string | undefined {
  if (typeof valor !== "string" || !DATA_ISO.test(valor)) return undefined;
  return Number.isNaN(new Date(valor).getTime()) ? undefined : valor;
}

/** Valor monetário vindo da URL (não negativo, dentro da coluna do banco). */
function parametroValor(
  valor: string | string[] | undefined,
): number | undefined {
  if (typeof valor !== "string" || valor.trim() === "") return undefined;
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < 0 || numero > VALOR_MAXIMO) {
    return undefined;
  }
  return numero;
}

/**
 * Período com as duas pontas na ordem certa. Período invertido (de > ate) é
 * trocado de lado, senão a lista vem vazia sem explicação nenhuma.
 */
function periodo(
  inicio: string | string[] | undefined,
  fim: string | string[] | undefined,
): { de?: string; ate?: string } {
  let de = parametroData(inicio);
  let ate = parametroData(fim);
  if (de && ate && de > ate) [de, ate] = [ate, de];
  return { de, ate };
}

/** Faixa de valor com as pontas na ordem certa, pelo mesmo motivo do período. */
function faixaValor(
  inicio: string | string[] | undefined,
  fim: string | string[] | undefined,
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

export default async function PaginaLancamentos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "financeiro.lancamentos", "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, "financeiro.lancamentos", "criar");
  const podeExcluir = temPermissao(usuario, "financeiro.lancamentos", "excluir");

  const params = await searchParams;
  const tipo = parametroValido(params.tipo, TIPOS_VALIDOS);
  const status = parametroValido(params.status, STATUS_VALIDOS);
  const revisao = parametroValido(params.revisao, FILTROS_REVISAO);
  const origem = parametroValido(params.origem, ORIGENS_LANCAMENTO);
  const busca = typeof params.busca === "string" ? params.busca : "";
  const mes = typeof params.mes === "string" ? params.mes : "";
  const mesCompetencia = mesParaCompetencia(mes);
  const fornecedorId = parametroUuid(params.fornecedor);
  const categoriaId = parametroUuid(params.categoria);
  const centroCustoId = parametroUuid(params.centro);
  const contaBancariaId = parametroUuid(params.conta);
  const formaPagamentoId = parametroUuid(params.forma);
  const valor = faixaValor(params.valor_de, params.valor_ate);
  const vencimento = periodo(params.venc_de, params.venc_ate);
  const compra = periodo(params.compra_de, params.compra_ate);
  const criado = periodo(params.criado_de, params.criado_ate);

  const paginaParam = Number(params.pagina);
  const pagina =
    Number.isInteger(paginaParam) && paginaParam > 0 ? paginaParam - 1 : 0;
  const tamanhoParam = Number(params.tamanho);
  const tamanho =
    Number.isInteger(tamanhoParam) && tamanhoParam > 0
      ? tamanhoParam
      : TAMANHO_PADRAO;

  const [
    { itens, total, valorTotal },
    categorias,
    fornecedores,
    centrosCusto,
    formasPagamento,
    condicoesPagamento,
    contas,
  ] = await Promise.all([
    listarLancamentos({
      pagina,
      tamanho,
      tipo,
      status,
      busca,
      mesCompetencia: mesCompetencia === "" ? undefined : mesCompetencia,
      fornecedorId,
      categoriaId,
      centroCustoId,
      contaBancariaId,
      formaPagamentoId,
      origem,
      valorDe: valor.de,
      valorAte: valor.ate,
      vencimentoDe: vencimento.de,
      vencimentoAte: vencimento.ate,
      compraDe: compra.de,
      compraAte: compra.ate,
      criadoDe: criado.de,
      criadoAte: criado.ate,
      revisao,
    }),
    listarCategorias(),
    listarFornecedores(),
    listarCentrosCusto(),
    listarFormasPagamento(),
    listarCondicoesPagamento(),
    listarContasBancarias(),
  ]);

  return (
    <>
      <PageHeader
        modulo="Financeiro"
        titulo="Lançamentos"
        descricao="Registre lançamentos a pagar e a receber, com parcelas e rateio por centro de custo"
        acoes={
          <LancamentosAcoesCabecalho
            podeCriar={podeCriar}
            categorias={categorias}
            fornecedores={fornecedores}
            centrosCusto={centrosCusto}
            formasPagamento={formasPagamento}
            condicoesPagamento={condicoesPagamento}
          />
        }
      />
      <LancamentosTabela
        podeExcluir={podeExcluir}
        lancamentos={itens}
        total={total}
        valorTotal={valorTotal}
        pagina={pagina}
        tamanho={tamanho}
        // Só o que passou na validação chega na tela: filtro inválido na URL não
        // pode aparecer preenchido na barra como se estivesse valendo.
        valores={{
          busca,
          tipo: tipo ?? "",
          status: status ?? "",
          mes: mesCompetencia === "" ? "" : mes,
          revisao: revisao ?? "",
          origem: origem ?? "",
          fornecedor: fornecedorId ?? "",
          categoria: categoriaId ?? "",
          centro: centroCustoId ?? "",
          conta: contaBancariaId ?? "",
          forma: formaPagamentoId ?? "",
          valorDe: texto(valor.de),
          valorAte: texto(valor.ate),
          vencDe: texto(vencimento.de),
          vencAte: texto(vencimento.ate),
          compraDe: texto(compra.de),
          compraAte: texto(compra.ate),
          criadoDe: texto(criado.de),
          criadoAte: texto(criado.ate),
        }}
        categorias={categorias}
        fornecedores={fornecedores}
        centrosCusto={centrosCusto}
        formasPagamento={formasPagamento}
        contas={contas}
      />
    </>
  );
}
