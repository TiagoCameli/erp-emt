import { notFound } from "next/navigation";

import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { InsumosTabela } from "@/modules/cadastros/insumos/components/insumos-tabela";
import {
  listar,
  listarCategorias,
  listarUnidades,
} from "@/modules/cadastros/insumos/queries";

const STATUS_VALIDOS = ["ativos", "inativos", "todos"] as const;
const TAMANHO_PADRAO = 25;

type StatusFiltro = (typeof STATUS_VALIDOS)[number];

/** Lê o filtro de status da query string; ausente ou inválido vira "ativos". */
function statusValido(valor: string | string[] | undefined): StatusFiltro {
  if (typeof valor !== "string") return "ativos";
  return (STATUS_VALIDOS as readonly string[]).includes(valor)
    ? (valor as StatusFiltro)
    : "ativos";
}

export default async function PaginaInsumos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "cadastros.insumos", "ver")) {
    notFound();
  }

  const params = await searchParams;
  const status = statusValido(params.status);
  const busca = typeof params.busca === "string" ? params.busca.trim() : "";

  const paginaParam = Number(params.pagina);
  const pagina =
    Number.isInteger(paginaParam) && paginaParam > 0 ? paginaParam - 1 : 0;
  const tamanhoParam = Number(params.tamanho);
  const tamanho =
    Number.isInteger(tamanhoParam) && tamanhoParam > 0
      ? tamanhoParam
      : TAMANHO_PADRAO;

  const [{ itens, total }, categorias, unidades] = await Promise.all([
    listar({
      pagina,
      tamanho,
      busca: busca === "" ? undefined : busca,
      ativo: status === "todos" ? undefined : status === "ativos",
    }),
    listarCategorias(),
    listarUnidades(),
  ]);

  return (
    <InsumosTabela
      insumos={itens}
      total={total}
      pagina={pagina}
      tamanho={tamanho}
      busca={busca}
      status={status}
      categorias={categorias}
      unidades={unidades}
      podeCriar={temPermissao(usuario, "cadastros.insumos", "criar")}
      podeEditar={temPermissao(usuario, "cadastros.insumos", "editar")}
      podeExcluir={temPermissao(usuario, "cadastros.insumos", "excluir")}
    />
  );
}
