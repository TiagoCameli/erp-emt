"use client";

import { Combobox } from "@/components/canonicos/combobox";

export interface ComboboxCriavelProps {
  valor: string;
  onValorChange: (valor: string) => void;
  /** Opções em texto puro (valor === rótulo). */
  opcoes: string[];
  onCriar?: (texto: string) => Promise<string | null>;
  placeholder?: string;
  buscaPlaceholder?: string;
  vazioTexto?: string;
  disabled?: boolean;
  id?: string;
}

/**
 * Combobox de opções em texto puro (valor === rótulo), com criação inline e
 * "limpar". Wrapper fino sobre Combobox para os campos que guardam o próprio
 * texto (ex: condição de pagamento).
 */
export function ComboboxCriavel({
  opcoes,
  buscaPlaceholder = "Buscar ou digitar para criar",
  ...props
}: ComboboxCriavelProps) {
  return (
    <Combobox
      {...props}
      buscaPlaceholder={buscaPlaceholder}
      opcoes={opcoes.map((opcao) => ({ valor: opcao, rotulo: opcao }))}
      limpavel
    />
  );
}
