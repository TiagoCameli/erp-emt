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

interface ContasReceberPageProps {
  searchParams: Promise<{
    pagina?: string | string[];
    tamanho?: string | string[];
    status?: string | string[];
  }>;
}

function primeiro(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
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

  const [resultado, contas, categorias] = await Promise.all([
    listarContasReceber({ pagina: pagina - 1, tamanho, status }),
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
      contas={contas}
      categorias={categorias}
      podeCriar={podeCriar}
      podeBaixar={podeBaixar}
    />
  );
}
