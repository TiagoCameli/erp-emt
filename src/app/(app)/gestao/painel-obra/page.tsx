import { notFound } from "next/navigation";

import { KPICard, MoneyText, PageHeader } from "@/components/canonicos";
import { formatarPercentual } from "@/lib/formatadores";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { painelPorObra } from "@/modules/gestao/_shared/agregacao";
import { PainelObraCliente } from "@/modules/gestao/painel-obra/components/painel-obra-cliente";

function GradeKpis({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {children}
    </div>
  );
}

/**
 * Painel por obra (somente leitura): responde "as obras estão dando lucro?".
 * KPIs consolidados no topo e o resultado de cada obra logo abaixo.
 */
export default async function PainelObraPage() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "gestao.painel-obra", "ver")) {
    notFound();
  }

  const obras = await painelPorObra();

  const medidoTotal = obras.reduce((soma, o) => soma + o.medido, 0);
  const custoTotal = obras.reduce((soma, o) => soma + o.custoTotal, 0);
  const margemTotal = obras.reduce((soma, o) => soma + o.margem, 0);
  // Margem % média ponderada pelo medido: margem total sobre medido total.
  const margemPctMedia = medidoTotal > 0 ? (margemTotal / medidoTotal) * 100 : 0;
  const margemPositiva = margemTotal >= 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        titulo="Painel por obra"
        descricao="As obras estão dando lucro? Medição, faturamento, custo e margem de cada obra ativa."
      />

      <GradeKpis>
        <KPICard
          titulo="Medido total"
          valor={<MoneyText valor={medidoTotal} />}
          detalhe="Medições aprovadas de todas as obras"
        />
        <KPICard
          titulo="Custo total"
          valor={<MoneyText valor={custoTotal} />}
          detalhe="Consumo, folha e serviços rateados"
        />
        <KPICard
          titulo="Margem total"
          valor={
            <MoneyText
              valor={margemTotal}
              className={
                margemPositiva ? "text-status-aprovado" : "text-status-rejeitado"
              }
            />
          }
          detalhe={margemPositiva ? "No azul" : "No vermelho"}
        />
        <KPICard
          titulo="Margem % média"
          valor={
            <span
              className={
                margemPositiva ? "text-status-aprovado" : "text-status-rejeitado"
              }
            >
              {formatarPercentual(margemPctMedia)}
            </span>
          }
          detalhe="Ponderada pelo medido"
        />
      </GradeKpis>

      <PainelObraCliente obras={obras} />
    </div>
  );
}
