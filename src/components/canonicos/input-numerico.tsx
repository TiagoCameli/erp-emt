"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import {
  formatarNumeroDigitado,
  normalizarNumeroDigitado,
} from "@/lib/numero-digitado";
import { cn } from "@/lib/utils";

/** Casas decimais das colunas do banco: dinheiro (14,2) e quantidade (14,3). */
const CASAS_DINHEIRO = 2;
const CASAS_QUANTIDADE = 3;

interface InputNumericoBaseProps {
  /** Valor cru do formulário ("1234,56"). É o que vai para o servidor. */
  valor: string;
  onValorChange: (valor: string) => void;
  id?: string;
  ariaLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  onBlur?: () => void;
}

interface InputNumericoProps extends InputNumericoBaseProps {
  casas: number;
  /** Obriga as casas decimais na exibição (dinheiro sempre mostra 2). */
  casasFixas?: number;
}

/**
 * Campo numérico pt-BR com formatação ao sair do campo.
 *
 * O formulário continua guardando o valor CRU no formato canônico ("1234,56"):
 * é ele que a validação da tela e a conversão do envio já entendem. O que muda
 * é só a exibição, que ao perder o foco vira "1.234,56". Ao focar de novo, o
 * campo volta ao valor cru para a pessoa editar sem lutar com a máscara.
 *
 * Efeito colateral desejado: quem digita "1234.56" (ponto como decimal) tem o
 * texto normalizado para "1234,56" ao sair do campo, então o valor exibido é o
 * valor gravado. Sem isso o ponto era lido como milhar no envio.
 */
function InputNumerico({
  valor,
  onValorChange,
  casas,
  casasFixas,
  id,
  ariaLabel,
  placeholder,
  disabled,
  className,
  onBlur,
}: InputNumericoProps) {
  const [focado, setFocado] = React.useState(false);

  const exibido = focado ? valor : formatarNumeroDigitado(valor, casas, casasFixas);

  return (
    <Input
      id={id}
      aria-label={ariaLabel}
      inputMode="decimal"
      autoComplete="off"
      placeholder={placeholder}
      disabled={disabled}
      value={exibido}
      onFocus={() => setFocado(true)}
      onChange={(evento) => onValorChange(evento.target.value)}
      onBlur={() => {
        setFocado(false);
        const normalizado = normalizarNumeroDigitado(valor, casas);
        if (normalizado !== null && normalizado !== valor) {
          onValorChange(normalizado);
        }
        onBlur?.();
      }}
      className={cn("text-right tabular-nums", className)}
    />
  );
}

/** Campo de dinheiro: exibe 1.234,56 ao sair do campo. */
export function InputMoeda(props: InputNumericoBaseProps) {
  return (
    <InputNumerico
      {...props}
      casas={CASAS_DINHEIRO}
      casasFixas={CASAS_DINHEIRO}
      placeholder={props.placeholder ?? "0,00"}
    />
  );
}

/** Campo de quantidade: até 3 casas, exibe só o que foi digitado. */
export function InputQuantidade(props: InputNumericoBaseProps) {
  return (
    <InputNumerico
      {...props}
      casas={CASAS_QUANTIDADE}
      placeholder={props.placeholder ?? "0,000"}
    />
  );
}
