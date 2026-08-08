import { notFound } from "next/navigation";

import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import {
  agruparLancamentosDaFolha,
  resumoPorCentroCusto,
  resumoPorEncargo,
} from "@/modules/rh/folha/calculo";
import { FolhaDetalheView } from "@/modules/rh/folha/components/folha-detalhe";
import {
  buscarFolha,
  listarLancamentosDaFolha,
  trilhaFolha,
} from "@/modules/rh/folha/queries";
import { buscarParametros } from "@/modules/rh/parametros-folha/queries";

export default async function PaginaFolhaDetalhe({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "rh.folha", "ver")) {
    notFound();
  }

  const { id } = await params;
  // Única leitura da folha (Bloco 6, Task 4 — fix de performance): os
  // resumos abaixo são derivados em memória de `folha.itens`, sem re-fetch.
  const folha = await buscarFolha(id);
  if (!folha) notFound();

  const custosPorCentro = resumoPorCentroCusto(folha);
  const resumoEncargos = resumoPorEncargo(folha);
  // FGTS informativo do holerite: % vem dos parâmetros da folha (0 se ainda
  // não cadastrados). Só leitura, não afeta os valores já fechados na folha.
  // Lançamentos gerados (Task 7): leitura própria (não há como derivar de
  // `folha.itens` em memória, os lançamentos vivem em outra tabela), separada
  // em salários/guias pela função pura de calculo.ts.
  const [parametros, trilha, lancamentosDaFolha] = await Promise.all([
    buscarParametros(),
    trilhaFolha(id),
    listarLancamentosDaFolha(id),
  ]);
  const lancamentos = agruparLancamentosDaFolha(lancamentosDaFolha);

  const podeCriar = temPermissao(usuario, "rh.folha", "criar");
  const podeEditar = temPermissao(usuario, "rh.folha", "editar");
  const podeAprovar = temPermissao(usuario, "rh.folha", "aprovar");
  const podeDesaprovar = temPermissao(usuario, "rh.folha", "desaprovar");
  const podeVerLancamento = temPermissao(usuario, "financeiro.lancamentos", "ver");

  return (
    <FolhaDetalheView
      folha={folha}
      custosPorCentro={custosPorCentro}
      resumoEncargos={resumoEncargos}
      lancamentos={lancamentos}
      fgtsPercentual={parametros?.fgtsPercentual ?? 0}
      trilha={trilha}
      podeCriar={podeCriar}
      podeEditar={podeEditar}
      podeAprovar={podeAprovar}
      podeDesaprovar={podeDesaprovar}
      podeVerLancamento={podeVerLancamento}
    />
  );
}
