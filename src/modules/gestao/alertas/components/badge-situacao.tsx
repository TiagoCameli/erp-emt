import { StatusBadge } from "@/components/canonicos";
import type { SituacaoVencimento } from "@/modules/gestao/alertas/queries";

/**
 * Badge da situação de vencimento dos alertas: vencido usa o vermelho de
 * "rejeitado", a vencer usa o âmbar de "pendente". Texto + cor, nunca só cor.
 */
export function BadgeSituacao({ situacao }: { situacao: SituacaoVencimento }) {
  if (situacao === "vencido") {
    return <StatusBadge status="rejeitado" rotulo="Vencido" />;
  }
  return <StatusBadge status="pendente_aprovacao" rotulo="A vencer" />;
}
