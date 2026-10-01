import { notFound } from "next/navigation";

import { idSchema } from "@/lib/id";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { rotuloRevisao } from "@/modules/medicao/_shared/rotulos";
import { linhasDaRevisao, rotulosDosItens } from "@/modules/medicao/medicoes/aprovacao";
import { passosDaMedicao } from "@/modules/medicao/medicoes/ciclo";
import { BotaoAprovar } from "@/modules/medicao/medicoes/components/aprovar-drawer";
import { MedicaoDetalhe } from "@/modules/medicao/medicoes/components/medicao-detalhe";
import { carregarMedicao, revisaoItens } from "@/modules/medicao/medicoes/detalhe-queries";

const RECURSO = "medicao.medicoes" as const;

/**
 * Detalhe da medição (Fase 5): status, passos do ciclo, itens, ajuste, aprovação com glosa,
 * revisões (com a comparação) e trilha. Os passos saem do status, da revisão corrente e das
 * permissões lidas aqui no servidor; as RPCs conferem tudo de novo.
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

  const { congelados, extras } = await revisaoItens(
    id,
    medicao.itens.map((i) => i.itemId),
  );

  // Aprovar: o drawer recebe os itens congelados da revisão enviada (a corrente).
  const corrente = medicao.revisaoCorrente;
  const botaoAprovar =
    passos.includes("aprovar") && corrente?.status === "enviada" ? (
      <BotaoAprovar
        medicaoId={medicao.id}
        revisaoRotulo={rotuloRevisao(corrente.numero)}
        linhas={linhasDaRevisao(congelados, corrente.id, rotulosDosItens(medicao.itens, extras))}
      />
    ) : undefined;

  return (
    <MedicaoDetalhe
      medicao={medicao}
      passos={passos}
      podeVerLancamentos={temPermissao(usuario, "medicao.lancamentos", "ver")}
      botaoAprovar={botaoAprovar}
      congelados={congelados}
      rotulosExtras={extras}
    />
  );
}
