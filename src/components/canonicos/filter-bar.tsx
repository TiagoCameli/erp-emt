"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Combobox } from "@/components/canonicos/combobox";
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
  /** Classe extra no gatilho (ex.: limitar largura em lista de nome comprido). */
  className?: string;
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
  className,
}: FiltroSelectProps) {
  return (
    <Combobox
      valor={valor === "" ? VALOR_TODOS : valor}
      onValorChange={(novoValor) =>
        onValorChange(novoValor === VALOR_TODOS ? "" : novoValor)
      }
      opcoes={[{ valor: VALOR_TODOS, rotulo: todosRotulo }, ...opcoes]}
      placeholder={placeholder ?? todosRotulo}
      size="sm"
      className={cn("h-8 w-fit gap-1.5 text-detalhe", className)}
    />
  );
}

interface FiltroPeriodoProps {
  de: string;
  ate: string;
  /** Recebe as duas pontas juntas: uma navegação só, sem página intermediária. */
  onPeriodoChange: (de: string, ate: string) => void;
  /** Nome do que está sendo datado, ex. "Emissão". */
  rotulo?: string;
}

/**
 * Filtro de período com as duas pontas (de/até) em campos de data curtos.
 * Data vazia significa sem limite naquela ponta.
 */
export function FiltroPeriodo({
  de,
  ate,
  onPeriodoChange,
  rotulo = "Período",
}: FiltroPeriodoProps) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-detalhe text-muted-foreground">{rotulo}</span>
      <Input
        type="date"
        value={de}
        max={ate === "" ? undefined : ate}
        onChange={(evento) => onPeriodoChange(evento.target.value, ate)}
        aria-label={`${rotulo}: data inicial`}
        className="h-8 w-[8.75rem] text-detalhe tabular-nums"
      />
      <span className="text-detalhe text-muted-foreground">até</span>
      <Input
        type="date"
        value={ate}
        min={de === "" ? undefined : de}
        onChange={(evento) => onPeriodoChange(de, evento.target.value)}
        aria-label={`${rotulo}: data final`}
        className="h-8 w-[8.75rem] text-detalhe tabular-nums"
      />
    </div>
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

  // Várias chaves numa única navegação (ex: trocar filtro + zerar página).
  const setMuitos = React.useCallback(
    (mudancas: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [chave, valor] of Object.entries(mudancas)) {
        if (valor === null || valor === "") {
          params.delete(chave);
        } else {
          params.set(chave, valor);
        }
      }
      const query = params.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [router, pathname, searchParams],
  );

  const set = React.useCallback(
    (chave: string, valor: string | null) => {
      setMuitos({ [chave]: valor });
    },
    [setMuitos],
  );

  return { get, set, setMuitos };
}

/** Espera (ms) entre a digitação e a escrita da busca na URL. */
const DEBOUNCE_BUSCA_MS = 400;

/**
 * Estado local de busca textual sincronizado com a URL, com debounce, para
 * listagens com filtro server-side. Escrever a busca zera a página. Use o
 * `busca`/`setBusca` retornados direto no FiltroBusca.
 */
export function useBuscaUrl(buscaInicial: string, chave = "busca") {
  const { setMuitos } = useFiltrosUrl();
  const [busca, setBusca] = React.useState(buscaInicial);

  React.useEffect(() => {
    const termo = busca.trim();
    if (termo === buscaInicial.trim()) return;
    const timer = setTimeout(() => {
      setMuitos({ [chave]: termo === "" ? null : termo, pagina: "1" });
    }, DEBOUNCE_BUSCA_MS);
    return () => clearTimeout(timer);
  }, [busca, buscaInicial, chave, setMuitos]);

  return { busca, setBusca };
}
