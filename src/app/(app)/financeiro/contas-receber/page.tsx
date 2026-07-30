import { notFound } from "next/navigation";

import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import type { StatusParcela } from "@/modules/financeiro/_shared/formato";
import { ContasReceberCliente } from "@/modules/financeiro/contas-receber/components/contas-receber-cliente";
import {
  listarCategorias,
  listarContasBancarias,
  listarContasReceber,
} from "@/modules/financeiro/contas-receber/queries";
import { TAMANHO_PAGINA_PADRAO } from "@/modules/financeiro/contas-receber/schemas";

const TAMANHOS_VALIDOS = [10, 25, 50, 100];
const STATUS_VALIDOS: readonly StatusParcela[] = [
  "pendente",
  "aprovado",
  "pago",
  "cancelado",
];

const DATA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;
const MES_VALIDO = /^\d{4}-(0[1-9]|1[0-2])$/;
const UUID_VALIDO =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ContasReceberPageProps {
  searchParams: Promise<{
    pagina?: string | string[];
    tamanho?: string | string[];
    status?: string | string[];
    busca?: string | string[];
    categoria?: string | string[];
    mes?: string | string[];
    conta?: string | string[];
    valorDe?: string | string[];
    valorAte?: string | string[];
    vencDe?: string | string[];
    vencAte?: string | string[];
    recDe?: string | string[];
    recAte?: string | string[];
  }>;
}

function primeiro(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

/** Só devolve a data quando ela está no formato do banco (yyyy-MM-dd). */
function data(valor: string | string[] | undefined): string | undefined {
  const bruto = primeiro(valor)?.trim();
  return bruto && DATA_VALIDA.test(bruto) ? bruto : undefined;
}

/** Só devolve o id quando ele tem cara de uuid: evita erro cru do PostgREST. */
function id(valor: string | string[] | undefined): string | undefined {
  const bruto = primeiro(valor)?.trim();
  return bruto && UUID_VALIDO.test(bruto) ? bruto : undefined;
}

/** Dinheiro do filtro: número finito e não negativo, senão sem limite. */
function dinheiro(valor: string | string[] | undefined): number | undefined {
  const bruto = primeiro(valor)?.trim();
  if (!bruto) return undefined;
  const numero = Number(bruto.replace(",", "."));
  return Number.isFinite(numero) && numero >= 0 ? numero : undefined;
}

export default async function ContasReceberPage({
  searchParams,
}: ContasReceberPageProps) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "financeiro.contas-receber", "ver")) {
    notFound();
  }

  const params = await searchParams;

  const pagina = Math.max(1, Math.trunc(Number(primeiro(params.pagina))) || 1);
  const tamanhoBruto = Number(primeiro(params.tamanho));
  const tamanho = TAMANHOS_VALIDOS.includes(tamanhoBruto)
    ? tamanhoBruto
    : TAMANHO_PAGINA_PADRAO;
  const statusBruto = primeiro(params.status);
  const status = STATUS_VALIDOS.find((opcao) => opcao === statusBruto);

  const busca = primeiro(params.busca)?.trim() || undefined;
  const categoriaId = id(params.categoria);
  const contaBancariaId = id(params.conta);
  const mesBruto = primeiro(params.mes)?.trim();
  const mes = mesBruto && MES_VALIDO.test(mesBruto) ? mesBruto : undefined;
  const valorDe = dinheiro(params.valorDe);
  const valorAte = dinheiro(params.valorAte);
  const vencimentoDe = data(params.vencDe);
  const vencimentoAte = data(params.vencAte);
  const recebimentoDe = data(params.recDe);
  const recebimentoAte = data(params.recAte);

  const [resultado, contas, categorias] = await Promise.all([
    listarContasReceber({
      pagina: pagina - 1,
      tamanho,
      status,
      busca,
      categoriaId,
      // O banco guarda o mês de referência como DATE no dia 1.
      mesCompetencia: mes ? `${mes}-01` : undefined,
      contaBancariaId,
      valorDe,
      valorAte,
      vencimentoDe,
      vencimentoAte,
      recebimentoDe,
      recebimentoAte,
    }),
    listarContasBancarias(),
    listarCategorias(),
  ]);

  const podeCriar = temPermissao(usuario, "financeiro.contas-receber", "criar");
  const podeBaixar = temPermissao(
    usuario,
    "financeiro.contas-receber",
    "editar",
  );

  return (
    <ContasReceberCliente
      linhas={resultado.linhas}
      total={resultado.total}
      totalEmAberto={resultado.totalEmAberto}
      pagina={pagina - 1}
      tamanho={tamanho}
      statusFiltro={status ?? ""}
      buscaFiltro={busca ?? ""}
      categoriaFiltro={categoriaId ?? ""}
      mesFiltro={mes ?? ""}
      contaFiltro={contaBancariaId ?? ""}
      valorDeFiltro={valorDe === undefined ? "" : String(valorDe)}
      valorAteFiltro={valorAte === undefined ? "" : String(valorAte)}
      vencimentoDeFiltro={vencimentoDe ?? ""}
      vencimentoAteFiltro={vencimentoAte ?? ""}
      recebimentoDeFiltro={recebimentoDe ?? ""}
      recebimentoAteFiltro={recebimentoAte ?? ""}
      contas={contas}
      categorias={categorias}
      podeCriar={podeCriar}
      podeBaixar={podeBaixar}
    />
  );
}
