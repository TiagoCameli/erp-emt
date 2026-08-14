import { notFound } from "next/navigation";

import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import {
  agruparLancamentosDaFolha,
  resumoPorCentroCusto,
  resumoPorEncargo,
  resumoPorProvisao,
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
  const resumoProvisoes = resumoPorProvisao(folha);
  // Ids dos lançamentos de salário: já vêm em `folha.itens` (buscarFolha leu
  // `folha_itens` mais acima nesta mesma requisição). listarLancamentosDaFolha
  // só faz a leitura própria de `folha_guias` (que não é carregada em
  // nenhum outro lugar da página) — fix round 1 da Task 7, mesma disciplina
  // de não reler o que a página já tem na mão.
  const idsLancamentoSalario = folha.itens
    .map((item) => item.lancamentoId)
    .filter((idLancamento): idLancamento is string => idLancamento !== null);
  // FGTS informativo do holerite: % vem dos parâmetros da folha (0 se ainda
  // não cadastrados). Só leitura, não afeta os valores já fechados na folha.
  // A mesma leitura serve ao aviso de retido sem grupo de recolhimento (onda de
  // correção do review do Bloco 8a): nenhuma consulta nova.
  const [parametros, trilha, lancamentosDaFolha] = await Promise.all([
    buscarParametros(),
    trilhaFolha(id),
    listarLancamentosDaFolha(id, idsLancamentoSalario),
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
      resumoProvisoes={resumoProvisoes}
      lancamentos={lancamentos}
      fgtsPercentual={parametros?.fgtsPercentual ?? 0}
      gruposRetido={
        parametros
          ? {
              grupoRecolhimentoInss: parametros.grupoRecolhimentoInss,
              grupoRecolhimentoIrrf: parametros.grupoRecolhimentoIrrf,
            }
          : null
      }
      trilha={trilha}
      podeCriar={podeCriar}
      podeEditar={podeEditar}
      podeAprovar={podeAprovar}
      podeDesaprovar={podeDesaprovar}
      podeVerLancamento={podeVerLancamento}
    />
  );
}
