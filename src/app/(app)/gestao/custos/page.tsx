import { notFound } from "next/navigation";

import { KPICard, MoneyText, PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { CustosCliente } from "@/modules/gestao/custos/components/custos-cliente";
import { painelCustos } from "@/modules/gestao/custos/queries";

function GradeKpis({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {children}
    </div>
  );
}

/**
 * Painel de custos (somente leitura): para onde está indo o dinheiro? Custo
 * total e por grupo no topo, custo por obra e orçado x realizado abaixo.
 */
export default async function GestaoCustosPage() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "gestao.custos", "ver")) {
    notFound();
  }

  const { obras, resumo, orcamentos } = await painelCustos();
  const { porGrupo } = resumo;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        titulo="Painel de custos"
        descricao="Para onde está indo o dinheiro? Custo por obra, por grupo e orçado x realizado."
      />

      <GradeKpis>
        <KPICard
          titulo="Custo total"
          valor={<MoneyText valor={resumo.total} />}
          detalhe="Todas as obras ativas"
        />
        <KPICard titulo="Material" valor={<MoneyText valor={porGrupo.material} />} />
        <KPICard
          titulo="Combustível"
          valor={<MoneyText valor={porGrupo.combustivel} />}
        />
        <KPICard
          titulo="Manutenção"
          valor={<MoneyText valor={porGrupo.manutencao} />}
        />
        <KPICard titulo="Folha" valor={<MoneyText valor={porGrupo.folha} />} />
        <KPICard titulo="Serviços" valor={<MoneyText valor={porGrupo.servicos} />} />
      </GradeKpis>

      <CustosCliente obras={obras} orcamentos={orcamentos} />
    </div>
  );
}
