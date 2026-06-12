"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Sentinela interna do Radix Select para a opção "todos" (valor vazio é proibido). */
const VALOR_TODOS = "__todos__";

interface FilterBarProps {
  children: React.ReactNode;
  className?: string;
}

/** Contêiner horizontal de filtros persistentes de uma listagem. */
export function FilterBar({ children, className }: FilterBarProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 py-2", className)}>
      {children}
    </div>
  );
}

interface FiltroBuscaProps {
  valor: string;
  onValorChange: (valor: string) => void;
  placeholder?: string;
}

/** Campo de busca textual compacto com ícone. */
export function FiltroBusca({
  valor,
  onValorChange,
  placeholder = "Buscar",
}: FiltroBuscaProps) {
  return (
    <div className="relative w-64">
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        value={valor}
        onChange={(evento) => onValorChange(evento.target.value)}
        placeholder={placeholder}
        className="h-8 pl-8 text-detalhe"
      />
    </div>
  );
}

export interface OpcaoFiltro {
  valor: string;
  rotulo: string;
}

interface FiltroSelectProps {
  valor: string;
  onValorChange: (valor: string) => void;
  opcoes: OpcaoFiltro[];
  placeholder?: string;
  todosRotulo?: string;
}

/**
 * Select compacto de filtro com opção "todos" no topo.
 * Valor vazio ("") representa "todos".
 */
export function FiltroSelect({
  valor,
  onValorChange,
  opcoes,
  placeholder,
  todosRotulo = "Todos",
}: FiltroSelectProps) {
  return (
    <Select
      value={valor === "" ? VALOR_TODOS : valor}
      onValueChange={(novoValor) =>
        onValorChange(novoValor === VALOR_TODOS ? "" : novoValor)
      }
    >
      <SelectTrigger size="sm" className="h-8 w-fit gap-1.5 text-detalhe">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={VALOR_TODOS}>{todosRotulo}</SelectItem>
        {opcoes.map((opcao) => (
          <SelectItem key={opcao.valor} value={opcao.valor}>
            {opcao.rotulo}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Lê e escreve filtros nos searchParams da URL (replace, sem scroll).
 * `set(chave, null)` ou valor vazio remove o parâmetro.
 */
export function useFiltrosUrl() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const get = React.useCallback(
    (chave: string): string | null => searchParams.get(chave),
    [searchParams],
  );

  const set = React.useCallback(
    (chave: string, valor: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (valor === null || valor === "") {
        params.delete(chave);
      } else {
        params.set(chave, valor);
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [router, pathname, searchParams],
  );

  return { get, set };
}
