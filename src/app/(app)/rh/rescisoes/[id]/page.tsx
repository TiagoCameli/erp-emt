import { notFound } from "next/navigation";

import { PageHeader } from "@/components/canonicos";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { RescisaoDetalhe } from "@/modules/rh/rescisoes/components/rescisao-detalhe";
import {
  buscarRescisao,
  trilhaDaRescisao,
} from "@/modules/rh/rescisoes/queries";

/**
 * Aprovar a rescisão roda na função desta página e gera lançamento e parcelas
 * a partir dos itens calculados. Teto padrão da Vercel é 10 a 15s, e invocação
 * morta não devolve nem `{ erro }`. Mesma razão do `maxDuration` de
 * /rh/folha/[id].
 */
export const maxDuration = 60;

export default async function PaginaRescisao({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, "rh.rescisoes", "ver")) {
    notFound();
  }

  const { id } = await params;
  const [rescisao, trilha] = await Promise.all([
    buscarRescisao(id),
    trilhaDaRescisao(id),
  ]);

  if (!rescisao) notFound();

  return (
    <>
      <PageHeader
        modulo="RH"
        titulo={`Rescisão de ${rescisao.colaboradorNome}`}
        descricao="Todo valor pode ser editado enquanto a rescisão está em rascunho, e o Recalcular preserva o que foi digitado. Aprovar desliga o colaborador e gera a conta a pagar."
      />
      <RescisaoDetalhe
        rescisao={rescisao}
        trilha={trilha}
        podeEditar={temPermissao(usuario, "rh.rescisoes", "editar")}
        podeAprovar={temPermissao(usuario, "rh.rescisoes", "aprovar")}
        podeDesaprovar={temPermissao(usuario, "rh.rescisoes", "desaprovar")}
      />
    </>
  );
}
