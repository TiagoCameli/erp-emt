import { StatusBadge, type StatusPadrao } from "@/components/canonicos";
import {
  ROTULO_STATUS_CONTRATO,
  ROTULO_STATUS_COTA,
  rotulo,
} from "@/modules/financeiro/dividas/schemas";

/** Cor do status pelo que ele quer dizer: ativo corre, quitado está pago, renegociado pede atenção. */
const COR_CONTRATO: Record<string, StatusPadrao> = {
  ativo: "aprovado",
  quitado: "pago",
  renegociado: "pendente_aprovacao",
};
const COR_COTA: Record<string, StatusPadrao> = {
  ativa: "aprovado",
  contemplada: "executado",
  quitada: "pago",
};

export function SeloContrato({ status }: { status: string }) {
  return <StatusBadge status={COR_CONTRATO[status] ?? status} rotulo={rotulo(ROTULO_STATUS_CONTRATO, status)} />;
}

export function SeloCota({ status }: { status: string }) {
  return <StatusBadge status={COR_COTA[status] ?? status} rotulo={rotulo(ROTULO_STATUS_COTA, status)} />;
}
