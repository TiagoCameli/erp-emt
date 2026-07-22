"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Plus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface ComboboxOpcao {
  valor: string;
  rotulo: string;
}

export interface ComboboxProps {
  /** Valor atual (o `valor` da opção selecionada). "" quando nada selecionado. */
  valor: string;
  onValorChange: (valor: string) => void;
  opcoes: ComboboxOpcao[];
  /**
   * Quando presente, permite criar uma opção a partir do texto digitado que não
   * existe na lista. Retorna o `valor` criado (para selecionar) ou null se falhou.
   */
  onCriar?: (texto: string) => Promise<string | null>;
  /** Mostra "Limpar seleção" quando há valor (campos opcionais). */
  limpavel?: boolean;
  placeholder?: string;
  buscaPlaceholder?: string;
  vazioTexto?: string;
  disabled?: boolean;
  id?: string;
  size?: "sm" | "default";
  /** Classe extra no gatilho (ex: largura compacta em filtros). */
  className?: string;
  /** Rótulo acessível quando o gatilho não tem um <label> associado. */
  ariaLabel?: string;
}

/**
 * Combobox canônico: dropdown com busca por texto sobre opções {valor, rótulo}.
 * Lista com altura limitada e rolagem (via CommandList). Filtro feito à mão
 * (shouldFilter=false) para conviver com "Criar" e "Limpar". O valor atual
 * sempre aparece na lista mesmo que não esteja em `opcoes` (preserva textos
 * livres antigos e ids órfãos).
 */
export function Combobox({
  valor,
  onValorChange,
  opcoes,
  onCriar,
  limpavel = false,
  placeholder = "Selecione",
  buscaPlaceholder = "Buscar ou digitar",
  vazioTexto = "Nada encontrado",
  disabled,
  id,
  size = "default",
  className,
  ariaLabel,
}: ComboboxProps) {
  const [aberto, setAberto] = React.useState(false);
  const [busca, setBusca] = React.useState("");
  const [criando, setCriando] = React.useState(false);

  const termo = busca.trim().toLowerCase();

  // Garante que o valor atual apareça na lista mesmo se não estiver em `opcoes`.
  const todasOpcoes = React.useMemo(() => {
    if (valor && !opcoes.some((o) => o.valor === valor)) {
      return [{ valor, rotulo: valor }, ...opcoes];
    }
    return opcoes;
  }, [valor, opcoes]);

  const opcoesFiltradas = React.useMemo(
    () => todasOpcoes.filter((o) => o.rotulo.toLowerCase().includes(termo)),
    [todasOpcoes, termo],
  );

  const rotuloSelecionado =
    todasOpcoes.find((o) => o.valor === valor)?.rotulo ?? "";

  const buscaLimpa = busca.trim();
  const existeExata = todasOpcoes.some(
    (o) => o.rotulo.toLowerCase() === termo,
  );
  const podeCriar = Boolean(onCriar) && buscaLimpa.length > 0 && !existeExata;
  const semResultado = opcoesFiltradas.length === 0 && !podeCriar;

  const selecionar = React.useCallback(
    (novoValor: string) => {
      onValorChange(novoValor);
      setAberto(false);
      setBusca("");
    },
    [onValorChange],
  );

  const criar = React.useCallback(async () => {
    if (!onCriar || criando) return;
    setCriando(true);
    try {
      const criado = await onCriar(buscaLimpa);
      if (criado) selecionar(criado);
    } finally {
      setCriando(false);
    }
  }, [onCriar, criando, buscaLimpa, selecionar]);

  return (
    <Popover
      open={aberto}
      onOpenChange={(estado) => {
        setAberto(estado);
        if (!estado) setBusca("");
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size={size === "sm" ? "sm" : "default"}
          role="combobox"
          aria-expanded={aberto}
          aria-label={ariaLabel}
          disabled={disabled}
          id={id}
          className={cn("w-full justify-between font-normal", className)}
        >
          <span
            className={cn("truncate", !rotuloSelecionado && "text-muted-foreground")}
          >
            {rotuloSelecionado || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) min-w-[12rem] p-0"
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={buscaPlaceholder}
            value={busca}
            onValueChange={setBusca}
          />
          <CommandList>
            {semResultado ? (
              <div className="py-6 text-center text-detalhe text-muted-foreground">
                {vazioTexto}
              </div>
            ) : null}

            {opcoesFiltradas.length > 0 ? (
              <CommandGroup>
                {opcoesFiltradas.map((opcao) => (
                  <CommandItem
                    key={opcao.valor}
                    value={opcao.valor}
                    onSelect={() => selecionar(opcao.valor)}
                  >
                    <Check
                      className={cn(
                        "mr-2 size-4",
                        valor === opcao.valor ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {opcao.rotulo}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}

            {podeCriar ? (
              <CommandGroup>
                <CommandItem
                  value={`__criar__${buscaLimpa}`}
                  disabled={criando}
                  onSelect={() => void criar()}
                >
                  <Plus className="mr-2 size-4" />
                  {`Criar "${buscaLimpa}"`}
                </CommandItem>
              </CommandGroup>
            ) : null}

            {onCriar && buscaLimpa.length === 0 ? (
              <div className="flex items-center gap-2 border-t border-border px-3 py-2 text-legenda text-muted-foreground">
                <Plus className="size-3.5 shrink-0" />
                Digite um nome novo e toque em &quot;Criar&quot; para adicionar.
              </div>
            ) : null}

            {limpavel && valor ? (
              <CommandGroup>
                <CommandItem value="__limpar__" onSelect={() => selecionar("")}>
                  <X className="mr-2 size-4 opacity-50" />
                  Limpar seleção
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
