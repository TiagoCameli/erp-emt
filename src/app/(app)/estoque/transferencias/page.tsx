import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { TransferenciasAcoesCabecalho } from "@/modules/estoque/transferencias/components/transferencias-acoes-cabecalho";
import { TransferenciasTabela } from "@/modules/estoque/transferencias/components/transferencias-tabela";
import { lerParamsMovimentos } from "@/modules/estoque/_shared/params";
import {
  listarDepositos,
  listarInsumos,
  listarMovimentos,
} from "@/modules/estoque/_shared/queries";

export default async function PaginaTransferencias({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "estoque.transferencias", "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, "estoque.transferencias", "criar");
  const { pagina, tamanho, insumoId, depositoId } = lerParamsMovimentos(
    await searchParams,
  );

  const [{ itens, total }, insumos, depositos] = await Promise.all([
    listarMovimentos({
      tipos: ["transferencia"],
      pagina,
      tamanho,
      insumoId,
      depositoId,
    }),
    listarInsumos(),
    listarDepositos(),
  ]);

  return (
    <>
      <PageHeader
        titulo="Transferências"
        descricao="Movimentação de material entre depósitos. O custo segue o material."
        acoes={
          podeCriar ? (
            <TransferenciasAcoesCabecalho
              insumos={insumos}
              depositos={depositos}
            />
          ) : undefined
        }
      />
      <TransferenciasTabela
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
