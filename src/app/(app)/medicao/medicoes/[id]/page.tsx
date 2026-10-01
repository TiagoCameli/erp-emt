import { notFound } from "next/navigation";

import { idSchema } from "@/lib/id";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { passosDaMedicao } from "@/modules/medicao/medicoes/ciclo";
import { MedicaoDetalhe } from "@/modules/medicao/medicoes/components/medicao-detalhe";
import { carregarMedicao } from "@/modules/medicao/medicoes/detalhe-queries";

const RECURSO = "medicao.medicoes" as const;

/**
 * Detalhe da medição (Fase 5): status, passos do ciclo, itens, ajuste e trilha. Os passos saem do
 * status, da revisão corrente e das permissões lidas aqui no servidor; as RPCs conferem tudo de novo.
 */
export default async function PaginaMedicao({ params }: { params: Promise<{ id: string }> }) {
  const usuario = await getUsuarioLogado();
  if (!usuario || !temPermissao(usuario, RECURSO, "ver")) notFound();

  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();

  // A RLS esconde a medição de contrato fora da lista de acesso (D3): fora da lista é 404.
  const medicao = await carregarMedicao(id);
  if (!medicao) notFound();

  const passos = passosDaMedicao(medicao.status, medicao.revisaoCorrente, {
    editar: temPermissao(usuario, RECURSO, "editar"),
    aprovar: temPermissao(usuario, RECURSO, "aprovar"),
    desaprovar: temPermissao(usuario, RECURSO, "desaprovar"),
  });

  return (
    <MedicaoDetalhe
      medicao={medicao}
      passos={passos}
      podeVerLancamentos={temPermissao(usuario, "medicao.lancamentos", "ver")}
    />
  );
}
