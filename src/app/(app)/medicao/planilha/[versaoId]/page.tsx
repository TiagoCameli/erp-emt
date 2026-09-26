import { notFound } from "next/navigation";

import { idSchema } from "@/lib/id";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { VersaoDetalhe } from "@/modules/medicao/planilha/components/versao-detalhe";
import { carregarVersao, xlsxImportadoDaVersao } from "@/modules/medicao/planilha/queries";

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
  // Versão na lixeira, ou de contrato na lixeira: só quem pode excluir abre (a existência não vaza).
  if ((dados.versao.excluidoEm !== null || dados.contrato.excluidoEm !== null) && !podeExcluir) notFound();

  // O xlsx para baixar: o anexo cujo conteúdo (SHA-256) é o que foi importado.
  const xlsx = await xlsxImportadoDaVersao(versaoId, dados.versao.arquivoHash);

  return (
    <VersaoDetalhe
      dados={dados}
      xlsx={xlsx}
      podeCriar={temPermissao(usuario, RECURSO, "criar")}
      podeAprovar={temPermissao(usuario, RECURSO, "aprovar")}
      podeDesaprovar={temPermissao(usuario, RECURSO, "desaprovar")}
      podeExcluir={podeExcluir}
    />
  );
}
