"use client";

import * as React from "react";
import { SearchIcon } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * "Localizar" do mapa (17/10/2026, análise do módulo): digita o código, a placa, o nome da pessoa,
 * da obra ou do local, e o mapa vai até ele e abre a ficha. A busca da barra de filtros só recorta
 * a lista; esta leva até o objeto. Atalho "/" foca o campo de qualquer lugar da tela.
 */

export type TipoLocalizavel = "equipamento" | "pessoa" | "obra" | "local";

export interface ItemLocalizavel {
  tipo: TipoLocalizavel;
  id: string;
  rotulo: string;
  detalhe: string;
  /** Texto já normalizado (sem acento, minúsculo) em que a busca procura. */
  busca: string;
}

const ROTULO_TIPO: Record<TipoLocalizavel, string> = {
  equipamento: "Máquina",
  pessoa: "Pessoa",
  obra: "Obra",
  local: "Local",
};

/** Quantos resultados a lista mostra (o resto pede um termo mais específico). */
const MAXIMO_RESULTADOS = 12;

export function normalizarBusca(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Resultados em ordem de relevância: começa com o termo antes de contém, e todas as palavras do
 * termo precisam aparecer ("cb 001" acha "CB-001").
 */
export function procurar(
  itens: readonly ItemLocalizavel[],
  termo: string,
  maximo = MAXIMO_RESULTADOS,
): ItemLocalizavel[] {
  const t = normalizarBusca(termo.trim());
  if (!t) return [];
  const palavras = t.split(/[\s\-·]+/).filter(Boolean);
  const comeca: ItemLocalizavel[] = [];
  const contem: ItemLocalizavel[] = [];
  for (const item of itens) {
    const alvo = item.busca.replace(/-/g, " ");
    if (!palavras.every((p) => alvo.includes(p) || item.busca.includes(p)))
      continue;
    if (item.busca.startsWith(t) || alvo.startsWith(palavras[0]))
      comeca.push(item);
    else contem.push(item);
  }
  return [...comeca, ...contem].slice(0, maximo);
}

export interface LocalizarNoMapaProps {
  itens: readonly ItemLocalizavel[];
  onEscolher: (item: ItemLocalizavel) => void;
  className?: string;
}

export function LocalizarNoMapa({
  itens,
  onEscolher,
  className,
}: LocalizarNoMapaProps) {
  const [termo, setTermo] = React.useState("");
  const [aberto, setAberto] = React.useState(false);
  const [ativo, setAtivo] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const idLista = React.useId();

  const resultados = React.useMemo(
    () => procurar(itens, termo),
    [itens, termo],
  );

  // "/" em qualquer lugar (fora de campo de texto) foca a busca.
  React.useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      const alvo = e.target as HTMLElement | null;
      if (
        alvo &&
        (alvo.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName))
      )
        return;
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  const escolher = (item: ItemLocalizavel) => {
    onEscolher(item);
    setTermo("");
    setAberto(false);
    inputRef.current?.blur();
  };

  const mostrarLista = aberto && termo.trim() !== "";

  return (
    <div className={cn("relative w-full sm:w-72", className)}>
      <SearchIcon
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        ref={inputRef}
        type="search"
        value={termo}
        placeholder="Localizar máquina, pessoa, obra ou local"
        aria-label="Localizar no mapa"
        aria-expanded={mostrarLista}
        aria-controls={idLista}
        aria-autocomplete="list"
        role="combobox"
        className="h-8 pr-8 pl-8"
        onChange={(e) => {
          setTermo(e.target.value);
          setAtivo(0);
          setAberto(true);
        }}
        onFocus={() => setAberto(true)}
        // Espera o clique no resultado chegar antes de fechar.
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setAtivo((i) => Math.min(i + 1, resultados.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setAtivo((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            const item = resultados[ativo] ?? resultados[0];
            if (item) {
              e.preventDefault();
              escolher(item);
            }
          } else if (e.key === "Escape") {
            setTermo("");
            setAberto(false);
          }
        }}
      />
      <kbd
        aria-hidden
        className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded border border-border px-1 text-legenda text-muted-foreground max-sm:hidden"
      >
        /
      </kbd>
      {mostrarLista ? (
        <ul
          id={idLista}
          role="listbox"
          className="absolute top-full right-0 left-0 z-30 mt-1 max-h-80 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {resultados.length === 0 ? (
            <li className="px-2 py-1.5 text-detalhe text-muted-foreground">
              Nada encontrado com esse termo
            </li>
          ) : (
            resultados.map((item, i) => (
              <li
                key={`${item.tipo}:${item.id}`}
                role="option"
                aria-selected={i === ativo}
              >
                <button
                  type="button"
                  className={cn(
                    "flex w-full flex-col items-start rounded-sm px-2 py-1.5 text-left",
                    i === ativo ? "bg-accent text-accent-foreground" : "",
                  )}
                  onMouseEnter={() => setAtivo(i)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => escolher(item)}
                >
                  <span className="text-detalhe font-medium">
                    {item.rotulo}
                  </span>
                  <span className="text-legenda text-muted-foreground">
                    {ROTULO_TIPO[item.tipo]}
                    {item.detalhe ? ` · ${item.detalhe}` : ""}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
