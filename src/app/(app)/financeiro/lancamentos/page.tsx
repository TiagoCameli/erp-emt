import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { LancamentosAcoesCabecalho } from "@/modules/financeiro/lancamentos/components/lancamentos-acoes-cabecalho";
import { LancamentosTabela } from "@/modules/financeiro/lancamentos/components/lancamentos-tabela";
import {
  listarCategorias,
  listarCentrosCusto,
  listarFornecedores,
  listarLancamentos,
} from "@/modules/financeiro/lancamentos/queries";
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

  const params = await searchParams;
  const tipo = parametroValido(params.tipo, TIPOS_VALIDOS);
  const status = parametroValido(params.status, STATUS_VALIDOS);

  const paginaParam = Number(params.pagina);
  const pagina =
    Number.isInteger(paginaParam) && paginaParam > 0 ? paginaParam - 1 : 0;
  const tamanhoParam = Number(params.tamanho);
  const tamanho =
    Number.isInteger(tamanhoParam) && tamanhoParam > 0
      ? tamanhoParam
      : TAMANHO_PADRAO;

  const [{ itens, total }, categorias, fornecedores, centrosCusto] =
    await Promise.all([
      listarLancamentos({ pagina, tamanho, tipo, status }),
      listarCategorias(),
      listarFornecedores(),
      listarCentrosCusto(),
    ]);

  return (
    <>
      <PageHeader
        titulo="Lançamentos"
        descricao="Registre lançamentos a pagar e a receber, com parcelas e rateio por centro de custo"
        acoes={
          <LancamentosAcoesCabecalho
            podeCriar={podeCriar}
            categorias={categorias}
            fornecedores={fornecedores}
            centrosCusto={centrosCusto}
          />
        }
      />
      <LancamentosTabela
        lancamentos={itens}
        total={total}
        pagina={pagina}
        tamanho={tamanho}
        tipo={tipo ?? ""}
        status={status ?? ""}
      />
    </>
  );
}
