import { notFound } from "next/navigation";

import { idSchema } from "@/lib/id";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarAnexosDoDocumento } from "@/modules/_shared/anexos/queries";
import { VersaoDetalhe } from "@/modules/medicao/planilha/components/versao-detalhe";
import { carregarVersao, ehXlsx } from "@/modules/medicao/planilha/queries";

const RECURSO = "medicao.planilha" as const;

export default async function PaginaVersao({ params }: { params: Promise<{ versaoId: string }> }) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) notFound();

  const { versaoId } = await params;
  if (!idSchema.safeParse(versaoId).success) notFound();

  // Fora da lista do contrato a RLS devolve null: 404, a existência não vaza.
  const dados = await carregarVersao(versaoId);
  if (!dados) notFound();

  const podeExcluir = temPermissao(usuario, RECURSO, "excluir");
  if (dados.versao.excluidoEm !== null && !podeExcluir) notFound();

  // O xlsx para baixar: o anexo mais recente com o nome que foi importado.
  const anexos = await listarAnexosDoDocumento("mc_planilha_versao", versaoId);
  const importado = [...anexos]
    .reverse()
    .find((a) => ehXlsx(a.nome) && (dados.versao.arquivoNome === null || a.nome === dados.versao.arquivoNome));

  return (
    <VersaoDetalhe
      dados={dados}
      xlsx={importado ? { vinculoId: importado.vinculoId, nome: importado.nome } : null}
      podeCriar={temPermissao(usuario, RECURSO, "criar")}
      podeAprovar={temPermissao(usuario, RECURSO, "aprovar")}
      podeDesaprovar={temPermissao(usuario, RECURSO, "desaprovar")}
      podeExcluir={podeExcluir}
    />
  );
}
