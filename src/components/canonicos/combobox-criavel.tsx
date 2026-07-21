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

export interface ComboboxCriavelProps {
  /** Valor atual (o texto selecionado). String vazia quando nada selecionado. */
  valor: string;
  onValorChange: (valor: string) => void;
  /** Opções disponíveis (textos). */
  opcoes: string[];
  /**
   * Quando presente, permite criar uma opção a partir do texto digitado que
   * não existe na lista. Retorna o valor criado (para selecionar) ou null se
   * falhou. Sem esta prop, o combobox só seleciona opções existentes.
   */
  onCriar?: (texto: string) => Promise<string | null>;
  placeholder?: string;
  buscaPlaceholder?: string;
  vazioTexto?: string;
  disabled?: boolean;
  id?: string;
}

/**
 * Combobox canônico com busca por texto e criação de opção nova (opcional).
 * Base: Popover + Command (cmdk). Filtro feito à mão (shouldFilter=false) para
 * conviver com os itens de "Criar" e "Limpar". O valor atual sempre aparece na
 * lista mesmo que não esteja em `opcoes` (preserva textos livres antigos).
 */
export function ComboboxCriavel({
  valor,
  onValorChange,
  opcoes,
  onCriar,
  placeholder = "Selecione",
  buscaPlaceholder = "Buscar ou digitar",
  vazioTexto = "Nada encontrado",
  disabled,
  id,
}: ComboboxCriavelProps) {
  const [aberto, setAberto] = React.useState(false);
  const [busca, setBusca] = React.useState("");
  const [criando, setCriando] = React.useState(false);

  const termo = busca.trim().toLowerCase();

  // Garante que o valor atual apareça na lista mesmo se for um texto antigo
  // que não está entre as opções cadastradas.
  const todasOpcoes = React.useMemo(() => {
    if (valor && !opcoes.includes(valor)) return [valor, ...opcoes];
    return opcoes;
  }, [valor, opcoes]);

  const opcoesFiltradas = React.useMemo(
    () => todasOpcoes.filter((o) => o.toLowerCase().includes(termo)),
    [todasOpcoes, termo],
  );

  const buscaLimpa = busca.trim();
  const existeExata = todasOpcoes.some((o) => o.toLowerCase() === termo);
  const podeCriar = Boolean(onCriar) && buscaLimpa.length > 0 && !existeExata;
  const semResultado = opcoesFiltradas.length === 0 && !podeCriar;

  const selecionar = React.useCallback(
    (opcao: string) => {
      onValorChange(opcao);
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
          role="combobox"
          aria-expanded={aberto}
          disabled={disabled}
          id={id}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", !valor && "text-muted-foreground")}>
            {valor || placeholder}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) p-0"
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

            {valor ? (
              <CommandGroup>
                <CommandItem value="__limpar__" onSelect={() => selecionar("")}>
                  <X className="mr-2 size-4 opacity-50" />
                  Limpar seleção
                </CommandItem>
              </CommandGroup>
            ) : null}

            {opcoesFiltradas.length > 0 ? (
              <CommandGroup>
                {opcoesFiltradas.map((opcao) => (
                  <CommandItem
                    key={opcao}
                    value={opcao}
                    onSelect={() => selecionar(opcao)}
                  >
                    <Check
                      className={cn(
                        "mr-2 size-4",
                        valor === opcao ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {opcao}
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
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
