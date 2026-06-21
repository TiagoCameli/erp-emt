import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarColaboradores, listarObras } from "@/modules/rh/_shared/queries";
import { AcoesCabecalho } from "@/modules/rh/apontamentos/components/acoes-cabecalho";
import { PontosTabela } from "@/modules/rh/apontamentos/components/pontos-tabela";
import {
  listarPontos,
  statusParam,
  TAMANHO_PADRAO,
  uuidParam,
} from "@/modules/rh/apontamentos/queries";

export default async function PaginaApontamentos({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "rh.apontamentos", "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, "rh.apontamentos", "criar");

  const params = await searchParams;
  const paginaParam = Number(params.pagina);
  const pagina =
    Number.isInteger(paginaParam) && paginaParam > 0 ? paginaParam - 1 : 0;
  const tamanhoParam = Number(params.tamanho);
  const tamanho =
    Number.isInteger(tamanhoParam) && tamanhoParam > 0
      ? tamanhoParam
      : TAMANHO_PADRAO;
  const obraId = uuidParam(params.obra);
  const status = statusParam(params.status);

  const [{ itens, total }, obras, colaboradores] = await Promise.all([
    listarPontos({ pagina, tamanho, obraId, status }),
    listarObras(),
    podeCriar ? listarColaboradores() : Promise.resolve([]),
  ]);

  return (
    <>
      <PageHeader
        titulo="Ponto e apontamentos"
        descricao="Ponto diário por obra: lance as horas da equipe e aprove o dia para travar os apontamentos."
        acoes={
          podeCriar ? (
            <AcoesCabecalho obras={obras} colaboradores={colaboradores} />
          ) : undefined
        }
      />
      <PontosTabela
        pontos={itens}
        total={total}
        pagina={pagina}
        tamanho={tamanho}
        obraId={obraId ?? ""}
        status={status ?? ""}
        obras={obras}
      />
    </>
  );
}
