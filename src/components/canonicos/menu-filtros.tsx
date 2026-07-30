"use client";

import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** Um filtro que o usuário pode mostrar ou esconder na barra da tabela. */
export interface FiltroAlternavel {
  id: string;
  rotulo: string;
  visivel: boolean;
  /** Filtro que a tela não deixa esconder (ex. a busca principal). */
  fixo?: boolean;
}

export interface MenuFiltrosProps {
  filtros: FiltroAlternavel[];
  onAlternar: (id: string) => void;
}

/**
 * Menu "Filtros" da barra da tabela: cada pessoa escolhe quais filtros quer ver,
 * e a escolha fica salva junto das colunas, por usuário.
 *
 * Esconder um filtro que está preenchido LIMPA o valor dele (quem chama cuida
 * disso). Filtro ativo e invisível é a pior combinação possível: a tabela mostra
 * uma lista filtrada e ninguém vê por quê.
 */
export function MenuFiltros({ filtros, onAlternar }: MenuFiltrosProps) {
  const escondidos = filtros.filter((filtro) => !filtro.visivel).length;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <SlidersHorizontal />
          Filtros
          {escondidos > 0 ? (
            <span className="text-legenda text-muted-foreground tabular-nums">
              {filtros.length - escondidos}/{filtros.length}
            </span>
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Mostrar filtros</DropdownMenuLabel>
        {filtros.map((filtro) => (
          <DropdownMenuCheckboxItem
            key={filtro.id}
            checked={filtro.visivel}
            disabled={filtro.fixo}
            onSelect={(evento) => evento.preventDefault()}
            onCheckedChange={() => onAlternar(filtro.id)}
          >
            {filtro.rotulo}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <p className="px-2 py-1.5 text-legenda text-muted-foreground">
          Esconder um filtro preenchido limpa o valor dele.
        </p>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
