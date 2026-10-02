import { notFound } from "next/navigation";

import { idSchema } from "@/lib/id";
import { getUsuarioLogado, temPermissao } from "@/lib/permissoes";
import { listarAnexosDoDocumento } from "@/modules/_shared/anexos/queries";
import { rotuloRevisao } from "@/modules/medicao/_shared/rotulos";
import { linhasDaRevisao, rotulosDosItens } from "@/modules/medicao/medicoes/aprovacao";
import { passosDaMedicao } from "@/modules/medicao/medicoes/ciclo";
import { BotaoAprovar } from "@/modules/medicao/medicoes/components/aprovar-drawer";
import { MedicaoDetalhe } from "@/modules/medicao/medicoes/components/medicao-detalhe";
import { carregarMedicao, revisaoItens } from "@/modules/medicao/medicoes/detalhe-queries";
import { SecaoReajuste } from "@/modules/medicao/reajuste/components/secao-reajuste";
import { medicaoRecebeReajuste } from "@/modules/medicao/reajuste/formato";
import { carregarReajusteMedicao, pdfsPendentes } from "@/modules/medicao/reajuste/queries";

const RECURSO = "medicao.medicoes" as const;
const RECURSO_REAJUSTE = "medicao.reajuste" as const;

/**
 * Detalhe da medição (Fase 5): status, passos do ciclo, itens, ajuste, aprovação com glosa,
 * revisões (com a comparação), reajuste (Fase 6) e trilha. Os passos saem do status, da revisão corrente e das
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

  // Reajuste (Fase 6): a seção e os dados dela só para quem tem `medicao.reajuste/ver` (a RLS das
  // tabelas olha só a medição, não basta). Importar e lançar: editar E medição enviada ou aprovada;
  // excluir: editar. As RPCs conferem tudo de novo.
  const verReajuste = temPermissao(usuario, RECURSO_REAJUSTE, "ver");
  const podeEditarReajuste = temPermissao(usuario, RECURSO_REAJUSTE, "editar");
  const [{ congelados, extras }, dadosReajuste] = await Promise.all([
    revisaoItens(
      id,
      medicao.itens.map((i) => i.itemId),
    ),
    verReajuste
      ? Promise.all([carregarReajusteMedicao(id), pdfsPendentes(id), listarAnexosDoDocumento("mc_reajuste", id)])
      : Promise.resolve(null),
  ]);

  const secaoReajuste = dadosReajuste ? (
    <SecaoReajuste
      medicaoId={medicao.id}
      numero={medicao.numero}
      valorMedicao={medicao.valor}
      reajuste={dadosReajuste[0]}
      pendentes={dadosReajuste[1]}
      anexos={dadosReajuste[2]}
      podeEditar={podeEditarReajuste}
      podeLancar={podeEditarReajuste && medicaoRecebeReajuste(medicao.status)}
    />
  ) : undefined;

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
      secaoReajuste={secaoReajuste}
    />
  );
}
