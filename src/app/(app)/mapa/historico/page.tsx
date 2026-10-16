import { notFound } from "next/navigation";
import { TriangleAlert } from "lucide-react";

import { EmptyState, PageHeader } from "@/components/canonicos";
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
      descricao="Cada transferência, ajuste de posição e mudança de estado feita no mapa, com quem fez e quando. A última de cada máquina pode ser desfeita."
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
      />
    </>
  );
}
