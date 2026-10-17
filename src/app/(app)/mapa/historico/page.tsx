import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarDays, TriangleAlert } from "lucide-react";

import { EmptyState, PageHeader } from "@/components/canonicos";
import { Button } from "@/components/ui/button";
import { idSchema } from "@/lib/id";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { HistoricoTabela } from "@/modules/mapa/components/historico-tabela";
import {
  carregarHistorico,
  listarMaquinasDoHistorico,
} from "@/modules/mapa/historico-queries";

/**
 * Histórico do Mapa: quem moveu o quê, quando, de onde e para onde (mapa_movimentacoes). A ficha
 * da máquina no mapa abre aqui já filtrada nela (`?equipamento=`).
 */
export default async function PaginaHistoricoMapa({
  searchParams,
}: {
  searchParams: Promise<{ equipamento?: string }>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "mapa.historico", "ver")) notFound();

  const { equipamento } = await searchParams;
  const maquinaInicial = idSchema.safeParse(equipamento).success
    ? (equipamento ?? "")
    : "";

  const cabecalho = (
    <PageHeader
      modulo="Mapa"
      titulo="Histórico"
      descricao="Cada transferência e mudança de estado feita no mapa (ajuste de posição não entra), com quem fez e quando. A última de cada máquina pode ser desfeita, e qualquer linha lançada errada pode ser excluída."
      acoes={
        <>
          <Button asChild variant="outline" size="sm">
            <Link href="/mapa/dias-por-centro">
              <CalendarDays />
              Dias por centro
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/mapa/dias-de-pessoa">
              <CalendarDays />
              Dias de pessoa
            </Link>
          </Button>
        </>
      }
    />
  );

  const [{ linhas, erro }, maquinas] = await Promise.all([
    carregarHistorico({}),
    listarMaquinasDoHistorico(),
  ]);
  if (erro) {
    return (
      <>
        {cabecalho}
        <EmptyState
          icone={TriangleAlert}
          titulo="Não foi possível carregar o histórico"
          descricao={erro}
        />
      </>
    );
  }

  return (
    <>
      {cabecalho}
      <HistoricoTabela
        linhas={linhas}
        maquinas={maquinas}
        maquinaInicial={maquinaInicial}
        noTeto={linhas.length >= 2000}
        podeDesfazer={temPermissao(usuario, "mapa.mapa", "editar")}
        podeExcluir={temPermissao(usuario, "mapa.mapa", "excluir")}
      />
    </>
  );
}
