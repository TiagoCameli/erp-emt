import { StatusBadge } from "@/components/canonicos";
import { ROTULO_STATUS_MEDICAO, type StatusMedicao } from "@/modules/medicao/_shared/rotulos";

/** Cor do selo pelo status da medição: só a aprovada é verde; em trânsito, pendente. */
const COR_STATUS: Record<StatusMedicao, string> = {
  aberta: "rascunho",
  em_conferencia: "pendente_aprovacao",
  enviada: "pendente_aprovacao",
  aprovada: "aprovado",
};

/**
 * Selo de status da medição, usado no Boletim (cartão da corrente) e no Painel
 * (coluna "Medição corrente"): as duas telas mostram o mesmo dado do mesmo jeito.
 */
export function SeloMedicao({ status }: { status: string }) {
  const conhecido = status in ROTULO_STATUS_MEDICAO ? (status as StatusMedicao) : null;
  return (
    <StatusBadge
      status={conhecido ? COR_STATUS[conhecido] : status}
      rotulo={conhecido ? ROTULO_STATUS_MEDICAO[conhecido] : status}
    />
  );
}
