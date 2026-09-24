import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { dataHojeISO } from "@/lib/formatadores";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { FretesAcoesCabecalho } from "@/modules/frete/fretes/components/fretes-acoes-cabecalho";
import { FretesTabela } from "@/modules/frete/fretes/components/fretes-tabela";
import { lerFiltrosFretes } from "@/modules/frete/fretes/filtros";
import { listarFretes, listarOpcoesFrete } from "@/modules/frete/fretes/queries";
import type { FreteLinha, OpcoesFrete } from "@/modules/frete/fretes/tipos";

const RECURSO = "frete.fretes" as const;

/**
 * A exportação e a importação por planilha rodam nesta função: ler todos os fretes
 * página por página e montar (ou ler) o arquivo na memória passa do teto padrão da
 * Vercel (10 a 15s).
 */
export const maxDuration = 60;

const OPCOES_VAZIAS: OpcoesFrete = { localidades: [], transportadoras: [], insumos: [], obras: [] };

export default async function PaginaFretes({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) {
    notFound();
  }

  const podeCriar = temPermissao(usuario, RECURSO, "criar");
  const podeEditar = temPermissao(usuario, RECURSO, "editar");
  const podeExcluir = temPermissao(usuario, RECURSO, "excluir");
  // Restaurar é a Lixeira da origem: pede editar a Lixeira e excluir na aba (a
  // fn_frete_restaurar confere as duas de novo). Sem isso, "excluidos" na URL é ignorado.
  const podeRestaurar = temPermissao(usuario, "administracao.lixeira", "editar") && podeExcluir;

  const lidos = lerFiltrosFretes(await searchParams);
  const filtros = { ...lidos, excluidos: podeRestaurar && lidos.excluidos };

  const [fretes, excluidos, opcoes] = await Promise.all([
    listarFretes(),
    podeRestaurar ? listarFretes(true) : Promise.resolve<FreteLinha[]>([]),
    podeCriar || podeEditar ? listarOpcoesFrete() : Promise.resolve(OPCOES_VAZIAS),
  ]);

  return (
    <>
      <PageHeader
        modulo="Frete"
        titulo="Fretes"
        descricao="Fretes de material das pedreiras e transferências entre obras. Cada frete credita a transportadora na conta corrente"
        acoes={<FretesAcoesCabecalho podeCriar={podeCriar} opcoes={opcoes} />}
      />
      <FretesTabela
        fretes={fretes}
        excluidos={excluidos}
        filtros={filtros}
        hoje={dataHojeISO()}
        opcoes={opcoes}
        podeEditar={podeEditar}
        podeExcluir={podeExcluir}
        podeRestaurar={podeRestaurar}
      />
    </>
  );
}
