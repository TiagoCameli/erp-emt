import { formatarBRL } from "@/lib/formatadores";
import { cn } from "@/lib/utils";

interface MoneyTextProps {
  valor: number | string | null | undefined;
  className?: string;
}

/**
 * Exibição canônica de dinheiro: R$ 1.234,56, tabular-nums,
 * alinhado à direita. Único jeito permitido de mostrar valor no app.
 */
export function MoneyText({ valor, className }: MoneyTextProps) {
  return (
    <span className={cn("tabular-nums text-right", className)}>
      {formatarBRL(valor)}
    </span>
  );
}
