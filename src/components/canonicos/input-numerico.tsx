"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import {
  formatarNumeroDigitado,
  normalizarNumeroDigitado,
  paraVirgulaDecimal,
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
 * O separador é trocado por vírgula A CADA TECLA (`paraVirgulaDecimal`): quem
 * aperta o ponto do teclado numérico vê uma vírgula aparecer. Antes a troca só
 * acontecia ao sair do campo, então a pessoa digitava "2194.56", via o ponto na
 * tela, e podia enviar o formulário com Enter sem nunca sair do campo — e aí o
 * ponto era lido como milhar e o valor ia 100x maior.
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

  const exibido = focado
    ? valor
    : formatarNumeroDigitado(valor, casas, casasFixas);

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
      onChange={(evento) =>
        onValorChange(paraVirgulaDecimal(evento.target.value))
      }
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

/**
 * Escreve um valor no input de um jeito que o React (e o react-hook-form) veja.
 *
 * Mexer em `input.value` direto não avisa ninguém: o React guarda o valor
 * anterior e engole a mudança. O setter do protótipo mais um evento `input`
 * fazem o caminho normal acontecer, como se a pessoa tivesse digitado.
 */
function escreverValor(input: HTMLInputElement, valor: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )?.set;
  setter?.call(input, valor);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

export interface InputDecimalProps extends Omit<
  React.ComponentProps<typeof Input>,
  "inputMode"
> {
  /**
   * Casas decimais que o campo aceita, para decidir o que é milhar.
   *
   * 2 é dinheiro e hora, e é o padrão. Passe 3 em percentual (`numeric(6,3)`) e
   * em extensão em km: lá "1,500" é 1,5 de verdade, e ler como 1500 seria virar
   * 1,5% em 1500% — do tipo de erro que nenhum refine pega, porque 1500 é um
   * número perfeitamente válido.
   */
  casas?: number;
}

/**
 * `<Input>` de valor decimal que troca PONTO por VÍRGULA a cada tecla.
 *
 * Existe para os campos que usam `form.register` e por isso não podem virar
 * `InputMoeda` sem reescrever a tela: aqui o input segue não-controlado, e a
 * troca acontece reescrevendo o valor ANTES de o onChange do react-hook-form
 * rodar. Assim o que a pessoa vê é o que o formulário guarda.
 *
 * Por que importa em todo campo, e não só nos de dinheiro: os schemas do ERP
 * convertem com `replace(/\./g, "")`, ou seja, leem ponto como separador de
 * milhar. Quem digitava "7.5" numa jornada gravava 75, e "2194.56" num
 * lançamento gravava 219456.
 *
 * ## Por que normalizar de novo ao sair do campo e no Enter
 *
 * Trocar ponto por vírgula na tecla resolve o que a pessoa VÊ, mas deixaria o
 * texto "1,500" para o schema — que leria 1,5 em vez de 1500, porque para ele
 * a vírgula é sempre decimal. Então ao sair do campo o valor é normalizado para
 * a forma canônica (sem milhar, uma vírgula só), que TODOS os `paraNumero` do
 * app já leem certo.
 *
 * O Enter tem tratamento próprio porque ele ENVIA o formulário sem disparar
 * blur: sem isso, quem digitasse e apertasse Enter mandaria o texto não
 * normalizado. Era o furo que existia antes, com a normalização só no blur.
 *
 * Texto que não dá para interpretar fica exatamente como está, para a validação
 * da tela poder reclamar em cima do que a pessoa escreveu.
 */
export function InputDecimal({
  casas = 2,
  onChange,
  onBlur,
  onKeyDown,
  ...resto
}: InputDecimalProps) {
  const normalizar = (input: HTMLInputElement) => {
    const canonico = normalizarNumeroDigitado(input.value, casas);
    if (canonico !== null && canonico !== input.value) {
      escreverValor(input, canonico);
    }
  };

  return (
    <Input
      inputMode="decimal"
      autoComplete="off"
      {...resto}
      onChange={(evento) => {
        const trocado = paraVirgulaDecimal(evento.target.value);
        if (trocado !== evento.target.value) evento.target.value = trocado;
        onChange?.(evento);
      }}
      onKeyDown={(evento) => {
        if (evento.key === "Enter") normalizar(evento.currentTarget);
        onKeyDown?.(evento);
      }}
      onBlur={(evento) => {
        normalizar(evento.currentTarget);
        onBlur?.(evento);
      }}
    />
  );
}
