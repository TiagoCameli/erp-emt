import { formatarBRL } from "@/lib/formatadores";
import { cn } from "@/lib/utils";

interface MoneyTextProps {
  valor: number | string | null | undefined;
  className?: string;
}

/**
 * Exibição canônica de dinheiro: R$ 1.234,56, tabular-nums. Único jeito
 * permitido de mostrar valor no app.
 *
 * O alinhamento NÃO vem daqui. Este span é inline: `text-align` nele não move o
 * próprio span, quem manda é o contêiner (na tabela, a célula, via
 * `meta.alinharDireita`). Dentro da tabela a classe era inerte; fora dela era
 * uma briga silenciosa com o alinhamento da tela. Quem precisar de dinheiro à
 * direita alinha o bloco em volta.
 */
export function MoneyText({ valor, className }: MoneyTextProps) {
  return (
    <span className={cn("tabular-nums", className)}>{formatarBRL(valor)}</span>
  );
}
