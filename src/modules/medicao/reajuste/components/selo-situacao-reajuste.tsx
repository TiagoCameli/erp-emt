import { StatusBadge } from "@/components/canonicos";
import { rotuloSituacaoReajuste } from "@/modules/medicao/reajuste/formato";

/** Situação dos índices do relatório: provisório em pendente, definitivo em verde. */
const COR_SITUACAO: Record<string, string> = { provisorio: "pendente_aprovacao", definitivo: "aprovado" };

export function SeloSituacaoReajuste({ situacao }: { situacao: string }) {
  return <StatusBadge status={COR_SITUACAO[situacao] ?? situacao} rotulo={rotuloSituacaoReajuste(situacao)} />;
}
