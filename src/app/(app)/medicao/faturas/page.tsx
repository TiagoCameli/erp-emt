import { notFound } from "next/navigation";

import { KPICard, MoneyText, PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { FaturasTabela } from "@/modules/medicao/faturas/components/faturas-tabela";
import { listarFaturas, resumirFaturas } from "@/modules/medicao/faturas/queries";

export default async function PaginaFaturas() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "medicao.faturas", "ver")) {
    notFound();
  }

  const faturas = await listarFaturas();
  const resumo = resumirFaturas(faturas);

  return (
    <>
      <PageHeader
        titulo="Faturas geradas"
        descricao="Faturas das medições aprovadas. Cada fatura é um lançamento a receber no financeiro."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <KPICard titulo="Faturas" valor={resumo.total} />
        <KPICard titulo="Em aberto" valor={resumo.emAberto} />
        <KPICard
          titulo="Total faturado"
          valor={<MoneyText valor={resumo.totalFaturadoAberto} />}
        />
      </div>

      <FaturasTabela faturas={faturas} />
    </>
  );
}
