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
import { listarCentrosCusto } from "@/modules/_shared/centro-custo/queries";

/**
 * As Server Actions desta página rodam na função DELA, e aqui moram as três
 * coisas mais caras do app: aprovar a folha (que numa folha de 47 pessoas cria
 * 47 lançamentos, 47 parcelas, 47 rateios, os eventos de parcela e as guias por
 * grupo de recolhimento, tudo numa transação), gerar o PDF do resumo e gerar a
 * planilha. Com o teto padrão da Vercel (10 a 15s) a invocação morre no meio —
 * e quando ela morre a action não devolve NADA: nem `{ erro }`, nem sucesso. O
 * `await` do cliente rejeita, e a tela só consegue dizer "a ação não foi
 * concluída", sem saber por quê. Foi o que apareceu ao aprovar a folha de
 * 08/2026.
 *
 * 60s é o máximo que vale em qualquer plano. Mesma razão do
 * `maxDuration` de /financeiro/lancamentos.
 */
export const maxDuration = 60;

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
  // `listarCentrosCusto` entra no mesmo Promise.all: o editor de linha precisa
  // das raízes e etapas para o seletor de centro de custo, e buscá-las só ao
  // abrir o drawer deixaria o campo piscando vazio na hora de escolher.
  const [parametros, trilha, lancamentosDaFolha, centrosCusto] =
    await Promise.all([
      buscarParametros(),
      trilhaFolha(id),
      listarLancamentosDaFolha(id, idsLancamentoSalario),
      listarCentrosCusto(),
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
      centrosCusto={centrosCusto}
      podeCriar={podeCriar}
      podeEditar={podeEditar}
      podeAprovar={podeAprovar}
      podeDesaprovar={podeDesaprovar}
      podeVerLancamento={podeVerLancamento}
    />
  );
}
