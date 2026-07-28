"use client";

import { Columns3, RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Uma coluna que o usuário pode mostrar ou esconder. */
export interface ColunaAlternavel {
  id: string;
  rotulo: string;
  visivel: boolean;
  onAlternar: (visivel: boolean) => void;
}

export interface MenuColunasProps {
  colunas: ColunaAlternavel[];
  /** Volta colunas, ordem e larguras ao padrão da tela. */
  onRestaurarPadrao: () => void;
  /** Habilita o "Restaurar padrão" só quando há algo fora do padrão. */
  foraDoPadrao: boolean;
}

/**
 * Menu "Colunas" da barra da tabela: liga e desliga coluna por checkbox e
 * restaura o padrão da tela. Só some a coluna da vista, nunca muda o dado.
 * Não deixa desligar a última coluna visível (tabela sem coluna não existe).
 */
export function MenuColunas({
  colunas,
  onRestaurarPadrao,
  foraDoPadrao,
}: MenuColunasProps) {
  const visiveis = colunas.filter((coluna) => coluna.visivel).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Columns3 />
          Colunas
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-legenda text-muted-foreground">
          Mostrar colunas
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {colunas.map((coluna) => (
          <DropdownMenuCheckboxItem
            key={coluna.id}
            checked={coluna.visivel}
            disabled={coluna.visivel && visiveis === 1}
            onCheckedChange={(marcado) => coluna.onAlternar(marcado)}
            onSelect={(evento) => evento.preventDefault()}
            className="text-detalhe"
          >
            {coluna.rotulo}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={!foraDoPadrao}
          onSelect={() => onRestaurarPadrao()}
          className="text-detalhe"
        >
          <RotateCcw />
          Restaurar padrão
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
