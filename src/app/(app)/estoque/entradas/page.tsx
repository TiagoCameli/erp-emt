import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { EntradasAcoesCabecalho } from "@/modules/estoque/entradas/components/entradas-acoes-cabecalho";
import { EntradasTabela } from "@/modules/estoque/entradas/components/entradas-tabela";
import { lerParamsMovimentos } from "@/modules/estoque/_shared/params";
import {
  listarDepositos,
  listarInsumos,
  listarMovimentos,
} from "@/modules/estoque/_shared/queries";

export default async function PaginaEntradas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "estoque.entradas", "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, "estoque.entradas", "criar");
  const { pagina, tamanho, insumoId, depositoId } = lerParamsMovimentos(
    await searchParams,
  );

  const [{ itens, total }, insumos, depositos] = await Promise.all([
    listarMovimentos({
      tipos: ["entrada"],
      pagina,
      tamanho,
      insumoId,
      depositoId,
      // A entrada vinda de transferência aparece na aba Transferências, não aqui.
      excluirOrigens: ["transferencia"],
    }),
    listarInsumos(),
    listarDepositos(),
  ]);

  return (
    <>
      <PageHeader
        titulo="Entradas"
        descricao="Entradas de material no estoque. Cada entrada cria uma camada de custo (PEPS)."
        acoes={
          podeCriar ? (
            <EntradasAcoesCabecalho insumos={insumos} depositos={depositos} />
          ) : undefined
        }
      />
      <EntradasTabela
        movimentos={itens}
        total={total}
        pagina={pagina}
        tamanho={tamanho}
        insumoId={insumoId ?? ""}
        depositoId={depositoId ?? ""}
        insumos={insumos}
        depositos={depositos}
      />
    </>
  );
}
