import { notFound } from "next/navigation";

import { KPICard, MoneyText, PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { PosicaoTabela } from "@/modules/estoque/posicao/components/posicao-tabela";
import { listarSaldos } from "@/modules/estoque/_shared/queries";

export default async function PaginaPosicao() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "estoque.posicao", "ver")) {
    notFound();
  }

  const saldos = await listarSaldos();

  const valorTotalEstoque = saldos.reduce(
    (soma, saldo) => soma + saldo.valorTotal,
    0,
  );
  const qtdItens = saldos.length;
  const qtdDepositos = new Set(saldos.map((saldo) => saldo.depositoId)).size;

  const opcoesDeposito = Array.from(
    new Map(
      saldos.map((saldo) => [
        saldo.depositoId,
        { id: saldo.depositoId, nome: saldo.depositoNome },
      ]),
    ).values(),
  ).sort((a, b) => a.nome.localeCompare(b.nome));

  return (
    <>
      <PageHeader
        titulo="Posição de estoque"
        descricao="Saldo e valor de cada insumo por depósito, custeado por PEPS."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <KPICard
          titulo="Valor em estoque"
          valor={<MoneyText valor={valorTotalEstoque} />}
        />
        <KPICard titulo="Itens com saldo" valor={qtdItens} />
        <KPICard titulo="Depósitos" valor={qtdDepositos} />
      </div>

      <PosicaoTabela saldos={saldos} depositos={opcoesDeposito} />
    </>
  );
}
