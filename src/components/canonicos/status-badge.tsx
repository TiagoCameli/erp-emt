import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** Status machine padrão do ERP (CLAUDE.md, regra 8). */
export type StatusPadrao =
  | "rascunho"
  | "pendente_aprovacao"
  | "aprovado"
  | "rejeitado"
  | "cancelado"
  | "recebido"
  | "pago"
  | "faturado"
  | "executado";

const CLASSES_RASCUNHO = "bg-status-rascunho/10 text-status-rascunho";
const CLASSES_PENDENTE = "bg-status-pendente/10 text-status-pendente";
const CLASSES_APROVADO = "bg-status-aprovado/10 text-status-aprovado";
const CLASSES_REJEITADO = "bg-status-rejeitado/10 text-status-rejeitado";
const CLASSES_EFEITO = "bg-status-efeito/10 text-status-efeito";

const MAPA_STATUS: Record<StatusPadrao, { rotulo: string; classes: string }> = {
  rascunho: { rotulo: "Rascunho", classes: CLASSES_RASCUNHO },
  pendente_aprovacao: {
    rotulo: "Pendente de aprovação",
    classes: CLASSES_PENDENTE,
  },
  aprovado: { rotulo: "Aprovado", classes: CLASSES_APROVADO },
  rejeitado: { rotulo: "Rejeitado", classes: CLASSES_REJEITADO },
  cancelado: { rotulo: "Cancelado", classes: CLASSES_REJEITADO },
  recebido: { rotulo: "Recebido", classes: CLASSES_EFEITO },
  pago: { rotulo: "Pago", classes: CLASSES_EFEITO },
  faturado: { rotulo: "Faturado", classes: CLASSES_EFEITO },
  executado: { rotulo: "Executado", classes: CLASSES_EFEITO },
};

function ehStatusPadrao(status: string): status is StatusPadrao {
  return status in MAPA_STATUS;
}

interface StatusBadgeProps {
  /** Status padrão com autocomplete, ou qualquer string para status custom. */
  status: StatusPadrao | (string & NonNullable<unknown>);
  /** Rótulo custom: sobrepõe o rótulo do mapa. Obrigatório na prática para status fora do padrão. */
  rotulo?: string;
  /**
   * Selo SECUNDÁRIO, que qualifica o principal ao lado dele.
   *
   * Existe para o caso "A pagar · aprovado": o selo principal diz a situação do
   * dinheiro e este diz a etapa já vencida. Dois selos do mesmo peso lado a lado
   * competem, e o olho não sabe qual responde "e daí?". Continua sendo texto +
   * cor (nunca só cor), só com menos ênfase.
   */
  discreto?: boolean;
  className?: string;
}

/**
 * Badge canônico de status: sempre texto + cor, nunca só cor.
 * Status fora do padrão cai no visual neutro (cinza) com o rótulo informado.
 */
export function StatusBadge({
  status,
  rotulo,
  discreto,
  className,
}: StatusBadgeProps) {
  const config = ehStatusPadrao(status)
    ? MAPA_STATUS[status]
    : { rotulo: status, classes: CLASSES_RASCUNHO };

  return (
    <Badge
      variant="secondary"
      className={cn(
        "border-transparent",
        config.classes,
        discreto && "bg-transparent px-1.5 py-0 text-legenda opacity-80",
        className,
      )}
    >
      {rotulo ?? config.rotulo}
    </Badge>
  );
}
