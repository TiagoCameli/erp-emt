import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { InventarioAcoesCabecalho } from "@/modules/estoque/inventario/components/inventario-acoes-cabecalho";
import { InventarioTabela } from "@/modules/estoque/inventario/components/inventario-tabela";
import { lerParamsMovimentos } from "@/modules/estoque/_shared/params";
import {
  listarDepositos,
  listarInsumos,
  listarMovimentos,
  listarSaldos,
} from "@/modules/estoque/_shared/queries";

export default async function PaginaInventario({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "estoque.inventario", "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, "estoque.inventario", "criar");
  const { pagina, tamanho, insumoId, depositoId } = lerParamsMovimentos(
    await searchParams,
  );

  const [{ itens, total }, insumos, depositos, { itens: saldos }] =
    await Promise.all([
      listarMovimentos({
        tipos: ["ajuste_positivo", "ajuste_negativo"],
        pagina,
        tamanho,
        insumoId,
        depositoId,
      }),
      listarInsumos(),
      listarDepositos(),
      listarSaldos({ incluirZerados: true }),
    ]);

  return (
    <>
      <PageHeader
        titulo="Inventário e ajustes"
        descricao="Acerte o saldo do sistema contra a contagem física, com motivo auditado."
        acoes={
          podeCriar ? (
            <InventarioAcoesCabecalho
              insumos={insumos}
              depositos={depositos}
              saldos={saldos}
            />
          ) : undefined
        }
      />
      <InventarioTabela
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
