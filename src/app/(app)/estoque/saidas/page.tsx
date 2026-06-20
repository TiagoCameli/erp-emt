import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { SaidasAcoesCabecalho } from "@/modules/estoque/saidas/components/saidas-acoes-cabecalho";
import { SaidasTabela } from "@/modules/estoque/saidas/components/saidas-tabela";
import { lerParamsMovimentos } from "@/modules/estoque/_shared/params";
import {
  listarCentrosCusto,
  listarDepositos,
  listarInsumos,
  listarMovimentos,
} from "@/modules/estoque/_shared/queries";

export default async function PaginaSaidas({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "estoque.saidas", "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, "estoque.saidas", "criar");
  const { pagina, tamanho, insumoId, depositoId } = lerParamsMovimentos(
    await searchParams,
  );

  const [{ itens, total }, insumos, depositos, centrosCusto] =
    await Promise.all([
      listarMovimentos({
        tipos: ["consumo", "saida"],
        pagina,
        tamanho,
        insumoId,
        depositoId,
      }),
      listarInsumos(),
      listarDepositos(),
      listarCentrosCusto(),
    ]);

  return (
    <>
      <PageHeader
        titulo="Saídas e consumos"
        descricao="Consumo e baixa de material. O custo sai pelo PEPS (camadas mais antigas primeiro)."
        acoes={
          podeCriar ? (
            <SaidasAcoesCabecalho
              insumos={insumos}
              depositos={depositos}
              centrosCusto={centrosCusto}
            />
          ) : undefined
        }
      />
      <SaidasTabela
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
