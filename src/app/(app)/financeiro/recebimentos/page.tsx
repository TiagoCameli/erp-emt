import { notFound } from "next/navigation";

import { dataHojeISO } from "@/lib/formatadores";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import {
  listarCategorias,
  listarCentrosCusto,
  listarClientes,
  listarCondicoesPagamento,
  listarFormasPagamento,
  listarFornecedores,
} from "@/modules/financeiro/lancamentos/queries";
import { listarContasBancarias } from "@/modules/financeiro/pagamentos/queries";
import { RecebimentosCliente } from "@/modules/financeiro/recebimentos/components/recebimentos-cliente";
import {
  listarCategoriasReceita,
  listarParcelasAReceber,
  listarParcelasRecebidas,
  somarRecebidoNoPeriodo,
} from "@/modules/financeiro/recebimentos/queries";

const TAMANHO_PAGINA = 25;

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Teto do filtro de valor: o mesmo da coluna NUMERIC(14,2). */
const VALOR_MAXIMO = 999999999999.99;
/** Tamanho máximo do termo de busca aceito. */
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

/** Termo de busca vindo da URL, aparado no limite aceito. */
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

/** Primeiro e último dia do mês da data ISO informada. */
function limitesDoMes(hoje: string): { primeiro: string; ultimo: string } {
  const [ano, mes] = hoje.split("-").map(Number);
  const primeiro = `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-01`;
  // Dia 0 do mês seguinte é o último dia deste mês, e o Date resolve virada de
  // ano e ano bissexto sozinho.
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const ultimo = `${String(ano).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(ultimoDia).padStart(2, "0")}`;
  return { primeiro, ultimo };
}

const MESES = [
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

/** "agosto de 2026", para o detalhe do card de recebido no mês. */
function rotuloDoMes(hoje: string): string {
  const [ano, mes] = hoje.split("-").map(Number);
  return `${MESES[mes - 1] ?? ""} de ${ano}`;
}

export default async function PaginaRecebimentos({
  searchParams,
}: {
  searchParams: Promise<Record<string, Parametro>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "financeiro.recebimentos", "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, "financeiro.recebimentos", "criar");
  const podeReceber = temPermissao(
    usuario,
    "financeiro.recebimentos",
    "editar",
  );

  // As duas abas têm filtros próprios, em parâmetros próprios (o histórico usa o
  // prefixo h_): compartilhar os mesmos parâmetros faria filtrar uma aba filtrar
  // a outra por trás, com o filtro escondido na aba de lá.
  const params = await searchParams;

  const valorAReceber = faixaValor(params.valor_de, params.valor_ate);
  const vencAReceber = periodo(params.venc_de, params.venc_ate);
  const aReceberFiltros = {
    busca: typeof params.busca === "string" ? params.busca : "",
    cliente: parametroUuid(params.cliente) ?? "",
    conta: parametroUuid(params.conta) ?? "",
    valorDe: texto(valorAReceber.de),
    valorAte: texto(valorAReceber.ate),
    vencDe: texto(vencAReceber.de),
    vencAte: texto(vencAReceber.ate),
  };

  const valorRecebidos = faixaValor(params.h_valor_de, params.h_valor_ate);
  const vencRecebidos = periodo(params.h_venc_de, params.h_venc_ate);
  const recRecebidos = periodo(params.h_rec_de, params.h_rec_ate);
  const filtrosRecebidas = {
    busca: parametroBusca(params.h_busca),
    clienteId: parametroUuid(params.h_cliente),
    contaBancariaId: parametroUuid(params.h_conta),
    categoriaId: parametroUuid(params.h_categoria),
    valorDe: valorRecebidos.de,
    valorAte: valorRecebidos.ate,
    vencimentoDe: vencRecebidos.de,
    vencimentoAte: vencRecebidos.ate,
    recebimentoDe: recRecebidos.de,
    recebimentoAte: recRecebidos.ate,
  };

  const hoje = dataHojeISO();
  const { primeiro, ultimo } = limitesDoMes(hoje);

  const [
    aReceber,
    recebidas,
    recebidoNoMes,
    contas,
    clientes,
    categoriasReceita,
    categorias,
    fornecedores,
    centrosCusto,
    formasPagamento,
    condicoesPagamento,
  ] = await Promise.all([
    listarParcelasAReceber(),
    listarParcelasRecebidas({
      pagina: 0,
      tamanho: TAMANHO_PAGINA,
      filtros: filtrosRecebidas,
    }),
    somarRecebidoNoPeriodo(primeiro, ultimo),
    listarContasBancarias(),
    listarClientes(),
    listarCategoriasReceita(),
    // Catálogos do formulário de lançamento, que é o mesmo usado aqui com o
    // tipo travado em "A receber".
    listarCategorias(),
    listarFornecedores(),
    listarCentrosCusto(),
    listarFormasPagamento(),
    listarCondicoesPagamento(),
  ]);

  return (
    <RecebimentosCliente
      hoje={hoje}
      aReceber={aReceber}
      recebidas={recebidas.itens}
      totalRecebidas={recebidas.total}
      recebidoNoMes={recebidoNoMes}
      rotuloMes={rotuloDoMes(hoje)}
      contas={contas}
      clientes={clientes}
      categoriasReceita={categoriasReceita}
      podeCriar={podeCriar}
      podeReceber={podeReceber}
      valoresAReceber={aReceberFiltros}
      // Vai o texto para os campos e o objeto já validado para a action que
      // pagina o histórico: a página é a única a interpretar a URL.
      valoresRecebidos={{
        busca: filtrosRecebidas.busca ?? "",
        cliente: filtrosRecebidas.clienteId ?? "",
        conta: filtrosRecebidas.contaBancariaId ?? "",
        categoria: filtrosRecebidas.categoriaId ?? "",
        valorDe: texto(filtrosRecebidas.valorDe),
        valorAte: texto(filtrosRecebidas.valorAte),
        vencDe: texto(filtrosRecebidas.vencimentoDe),
        vencAte: texto(filtrosRecebidas.vencimentoAte),
        recDe: texto(filtrosRecebidas.recebimentoDe),
        recAte: texto(filtrosRecebidas.recebimentoAte),
      }}
      filtrosRecebidas={filtrosRecebidas}
      categorias={categorias}
      fornecedores={fornecedores}
      centrosCusto={centrosCusto}
      formasPagamento={formasPagamento}
      condicoesPagamento={condicoesPagamento}
    />
  );
}
