import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { dataHojeISO } from "@/lib/formatadores";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { RelatoriosCombustivel } from "@/modules/combustivel/relatorios/components/relatorios-combustivel";
import { periodoDaUrl } from "@/modules/combustivel/relatorios/periodo";

/**
 * A exportação roda nesta função: ler milhares de saídas página por página e
 * montar o arquivo na memória passa do teto padrão da Vercel (10 a 15s).
 */
export const maxDuration = 60;

/** Relatórios do Combustível em Excel. Padrão: do dia 1 do mês até hoje. */
export default async function PaginaRelatoriosCombustivel({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "combustivel.relatorios", "ver")) notFound();

  const params = await searchParams;
  const hoje = dataHojeISO();
  const periodo = periodoDaUrl(params.de, params.ate, { de: `${hoje.slice(0, 7)}-01`, ate: hoje });

  return (
    <>
      <PageHeader
        modulo="Combustível"
        titulo="Relatórios"
        descricao="Consumo e custo do combustível em Excel, pelo período escolhido"
      />
      <RelatoriosCombustivel de={periodo.de} ate={periodo.ate} />
    </>
  );
}
