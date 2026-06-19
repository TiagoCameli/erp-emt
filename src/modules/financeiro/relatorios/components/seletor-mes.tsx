"use client";

import { useFiltrosUrl } from "@/components/canonicos";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SeletorMesProps {
  /** Mês atual no formato "YYYY-MM". */
  valor: string;
}

/**
 * Seletor de mês do DRE. Escreve o mês escolhido no parâmetro `mes` da URL,
 * o que dispara o re-fetch do Server Component. Mantém o relatório ativo.
 */
export function SeletorMes({ valor }: SeletorMesProps) {
  const { set } = useFiltrosUrl();

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="dre-mes" className="text-detalhe text-muted-foreground">
        Mês
      </Label>
      <Input
        id="dre-mes"
        type="month"
        value={valor}
        onChange={(evento) => {
          const novo = evento.target.value;
          if (novo) set("mes", novo);
        }}
        className="h-8 w-40 text-detalhe"
      />
    </div>
  );
}
