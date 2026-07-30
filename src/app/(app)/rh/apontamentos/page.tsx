import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarColaboradores, listarObras } from "@/modules/rh/_shared/queries";
import { AcoesCabecalho } from "@/modules/rh/apontamentos/components/acoes-cabecalho";
import { PontosTabela } from "@/modules/rh/apontamentos/components/pontos-tabela";
import {
  dataParam,
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
  const encarregadoId = uuidParam(params.encarregado);
  // Período invertido é trocado de lado: senão a lista volta vazia e o usuário
  // não tem como saber por quê.
  let de = dataParam(params.de);
  let ate = dataParam(params.ate);
  if (de && ate && de > ate) [de, ate] = [ate, de];

  // Colaboradores são carregados sempre: alimentam o form de ponto (quando há
  // permissão de criar) e as opções do filtro de encarregado, que todo mundo vê.
  const [{ itens, total }, obras, colaboradores] = await Promise.all([
    listarPontos({ pagina, tamanho, obraId, status, de, ate, encarregadoId }),
    listarObras(),
    listarColaboradores(),
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
        de={de ?? ""}
        ate={ate ?? ""}
        encarregadoId={encarregadoId ?? ""}
        obras={obras}
        colaboradores={colaboradores}
      />
    </>
  );
}
