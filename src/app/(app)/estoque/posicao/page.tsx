import { notFound } from "next/navigation";

import { KPICard, MoneyText, PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { PosicaoTabela } from "@/modules/estoque/posicao/components/posicao-tabela";
import { resumoPosicao } from "@/modules/estoque/posicao/queries";
import { lerParamsMovimentos } from "@/modules/estoque/_shared/params";
import { listarDepositos, listarSaldos } from "@/modules/estoque/_shared/queries";

export default async function PaginaPosicao({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "estoque.posicao", "ver")) {
    notFound();
  }

  const params = await searchParams;
  const { pagina, tamanho, depositoId } = lerParamsMovimentos(params);
  const busca = typeof params.busca === "string" ? params.busca.trim() : "";

  const [{ itens, total }, resumo, depositos] = await Promise.all([
    listarSaldos({
      pagina,
      tamanho,
      depositoId,
      busca: busca === "" ? undefined : busca,
    }),
    resumoPosicao(),
    listarDepositos(),
  ]);

  return (
    <>
      <PageHeader
        titulo="Posição de estoque"
        descricao="Saldo e valor de cada insumo por depósito, custeado por PEPS."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <KPICard
          titulo="Valor em estoque"
          valor={<MoneyText valor={resumo.valorTotal} />}
        />
        <KPICard titulo="Itens com saldo" valor={resumo.qtdItens} />
        <KPICard titulo="Depósitos" valor={resumo.qtdDepositos} />
      </div>

      <PosicaoTabela
        saldos={itens}
        total={total}
        pagina={pagina}
        tamanho={tamanho}
        busca={busca}
        depositoId={depositoId ?? ""}
        depositos={depositos}
      />
    </>
  );
}
