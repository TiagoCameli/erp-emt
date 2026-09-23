import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { dataHojeISO } from "@/lib/formatadores";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { opcoesDeEquipamento } from "@/modules/combustivel/anomalias/base";
import { carregarBaseCombustivel } from "@/modules/combustivel/anomalias/queries";
import { RelatoriosCombustivel } from "@/modules/combustivel/relatorios/components/relatorios-combustivel";
import { mesAnterior, ultimosDias } from "@/modules/combustivel/relatorios/periodo";

/**
 * A exportação roda nesta função: ler todas as saídas página por página (as anomalias
 * de cada relatório olham o banco inteiro, como na origem) e montar o arquivo na
 * memória passa do teto padrão da Vercel (10 a 15s).
 */
export const maxDuration = 60;

/** Os quatro relatórios da origem, em Excel. */
export default async function PaginaRelatoriosCombustivel() {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "combustivel.relatorios", "ver")) notFound();

  const hoje = dataHojeISO();
  const base = await carregarBaseCombustivel();

  // Obras que têm saída (a origem lista as não concluídas e as que têm saída).
  const obrasComSaida = new Set(base.saidas.map((s) => s.obraId).filter((id): id is string => id !== null));
  const obras = [...obrasComSaida]
    .map((id) => ({ valor: id, rotulo: base.obraNome.get(id) ?? "Obra não encontrada" }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));

  return (
    <>
      <PageHeader
        modulo="Combustível"
        titulo="Relatórios"
        descricao="Mensal consolidado, por obra, por equipamento e o export cru, em Excel"
      />
      <RelatoriosCombustivel
        mesPadrao={mesAnterior(hoje)}
        periodoEquipamento={ultimosDias(hoje, 90)}
        periodo30={ultimosDias(hoje, 30)}
        obras={obras}
        equipamentos={opcoesDeEquipamento(base.equipamentos)}
      />
    </>
  );
}
