import { notFound, redirect } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { idSchema } from "@/lib/id";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarAnexosDoDocumento } from "@/modules/_shared/anexos/queries";
import { carregarContrato } from "@/modules/medicao/contratos/queries";
import { ImportarPlanilha } from "@/modules/medicao/planilha/components/importar-planilha";
import { arquivoDaVersao, carregarVersaoParaImportar } from "@/modules/medicao/planilha/queries";

const RECURSO = "medicao.planilha" as const;

export default async function PaginaImportarPlanilha({ params }: { params: Promise<{ versaoId: string }> }) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "criar")) notFound();

  const { versaoId } = await params;
  if (!idSchema.safeParse(versaoId).success) notFound();

  // Fora da lista do contrato a RLS devolve null: 404.
  const versao = await carregarVersaoParaImportar(versaoId);
  if (!versao) notFound();
  // Versão vigente é imutável: a importação só existe no rascunho.
  if (versao.status !== "rascunho") redirect(`/medicao/planilha/${versaoId}`);

  const [contrato, anexos, arquivo] = await Promise.all([
    carregarContrato(versao.contratoId),
    listarAnexosDoDocumento("mc_planilha_versao", versaoId),
    arquivoDaVersao(versaoId),
  ]);
  if (!contrato) notFound();
  // Contrato na lixeira: a planilha dele fica só para consulta.
  if (contrato.excluido_em !== null) redirect(`/medicao/planilha/${versaoId}`);

  return (
    <>
      <PageHeader
        modulo="Medição"
        titulo={`Importar planilha v${versao.numero}`}
        descricao={`${contrato.codigo} · ${contrato.nome_obra}`}
        voltarPara={{ rota: `/medicao/planilha/${versaoId}`, rotulo: "Voltar para a versão" }}
      />
      <ImportarPlanilha versaoId={versaoId} numeroVersao={versao.numero} anexos={anexos} arquivoAtual={arquivo?.nome ?? null} />
    </>
  );
}
