import { notFound } from "next/navigation";

import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { ExecucaoDetalheView } from "@/modules/manutencao/checklists/components/execucao-detalhe";
import { buscarExecucao } from "@/modules/manutencao/checklists/queries";

export default async function PaginaExecucaoChecklist({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "manutencao.checklists", "ver")) {
    notFound();
  }

  const { id } = await params;
  const execucao = await buscarExecucao(id);
  if (!execucao) notFound();

  return <ExecucaoDetalheView execucao={execucao} />;
}
