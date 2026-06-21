import { notFound } from "next/navigation";

import { KPICard, MoneyText, PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { EquipamentosCliente } from "@/modules/gestao/equipamentos/components/equipamentos-cliente";
import { listarFrota } from "@/modules/manutencao/painel/queries";

function GradeKpis({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">{children}</div>
  );
}

/** R$/hora médio: total de custo sobre total de horímetro dos que controlam por hora. */
function custoPorHoraMedio(
  frota: Awaited<ReturnType<typeof listarFrota>>,
): number {
  let custo = 0;
  let horas = 0;
  for (const linha of frota) {
    if (linha.custoPorHora === null) continue;
    if (linha.ultimoHorimetro === null || linha.ultimoHorimetro <= 0) continue;
    custo += linha.custoTotal;
    horas += linha.ultimoHorimetro;
  }
  return horas > 0 ? custo / horas : 0;
}

/**
 * Painel de equipamentos (somente leitura): responde "qual máquina custa mais?".
 * Custo por equipamento e R$/hora, reaproveitando listarFrota() já agregada.
 */
export default async function GestaoEquipamentosPage() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "gestao.equipamentos", "ver")) {
    notFound();
  }

  const frota = await listarFrota();

  const custoTotalFrota = frota.reduce((soma, linha) => soma + linha.custoTotal, 0);
  const emManutencao = frota.filter(
    (linha) => linha.status === "em_manutencao",
  ).length;
  const rhMedio = custoPorHoraMedio(frota);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        titulo="Painel de equipamentos"
        descricao="Qual máquina custa mais? Manutenção, combustível e R$/hora por equipamento da frota."
      />

      <GradeKpis>
        <KPICard
          titulo="Custo total da frota"
          valor={<MoneyText valor={custoTotalFrota} />}
          detalhe="Manutenção concluída + combustível"
        />
        <KPICard
          titulo="Em manutenção"
          valor={emManutencao}
          detalhe="Equipamentos com OS aberta"
        />
        <KPICard
          titulo="R$/hora médio"
          valor={<MoneyText valor={rhMedio} />}
          detalhe="Custo sobre horímetro acumulado"
        />
      </GradeKpis>

      <EquipamentosCliente frota={frota} />
    </div>
  );
}
