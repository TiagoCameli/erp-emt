import { notFound } from "next/navigation";

import { KPICard, MoneyText, PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { FrotaTabela } from "@/modules/manutencao/painel/components/frota-tabela";
import { listarFrota, resumirFrota } from "@/modules/manutencao/painel/queries";

export default async function PaginaPainelFrota() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "manutencao.painel", "ver")) {
    notFound();
  }

  const frota = await listarFrota();
  const resumo = resumirFrota(frota);

  return (
    <>
      <PageHeader
        titulo="Painel de frota"
        descricao="Status, custo de manutenção e combustível e R$/hora por equipamento."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <KPICard titulo="Equipamentos" valor={resumo.totalEquipamentos} />
        <KPICard titulo="Em manutenção" valor={resumo.emManutencao} />
        <KPICard
          titulo="Custo total da frota"
          valor={<MoneyText valor={resumo.custoTotalFrota} />}
        />
      </div>

      <FrotaTabela frota={frota} />
    </>
  );
}
