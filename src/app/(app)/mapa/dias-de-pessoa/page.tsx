import { notFound } from "next/navigation";
import { TriangleAlert } from "lucide-react";

import { EmptyState, PageHeader } from "@/components/canonicos";
import { mesHojeISO } from "@/lib/formatadores";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { mesDoRelatorio, rotuloMes } from "@/modules/mapa/centros";
import { agruparRelatorioPessoas } from "@/modules/mapa/centros-pessoa";
import { carregarRelDiasPessoa } from "@/modules/mapa/centros-queries";
import { RelDiasPessoaTabela } from "@/modules/mapa/components/rel-dias-pessoa";

// Exportar monta a planilha na função desta página (src/app/max-duration-de-quem-exporta.test.ts).
export const maxDuration = 60;

/**
 * Dias de pessoa por centro de custo no mês (pedido do Tiago, 17/10/2026): em que centro cada
 * pessoa do mapa terminou cada dia e quantos dias trabalhou ou ficou parada. Não lê o RH. Os dias
 * fecham às 23:55 de Rio Branco; o de hoje entra ao vivo.
 */
export default async function PaginaDiasDePessoa({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string }>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "mapa.historico", "ver")) notFound();

  const params = await searchParams;
  const mesHoje = mesHojeISO();
  const mes = mesDoRelatorio(params.mes, mesHoje);

  const cabecalho = (
    <PageHeader
      modulo="Mapa"
      titulo="Dias de pessoa por centro"
      descricao={`Em que centro de custo cada pessoa do mapa terminou cada dia de ${rotuloMes(mes)}, e quantos dias trabalhou ou ficou parada. Parada, ou sem obra e sem centro escolhido na ficha, conta em Pessoal Sem Alocação.`}
    />
  );

  const { linhas, erro } = await carregarRelDiasPessoa(mes);
  if (erro) {
    return (
      <>
        {cabecalho}
        <EmptyState
          icone={TriangleAlert}
          titulo="Não foi possível carregar os dias das pessoas"
          descricao={erro}
        />
      </>
    );
  }

  return (
    <>
      {cabecalho}
      <RelDiasPessoaTabela
        relatorio={agruparRelatorioPessoas(linhas)}
        mes={mes}
        mesHoje={mesHoje}
      />
    </>
  );
}
