"use client";

import * as React from "react";
import { MessageSquareText } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface SeloObservacoesProps {
  /** O texto da observação. Vazio (ou só branco) não desenha nada. */
  observacoes: string | null | undefined;
}

/**
 * Quantos caracteres da observação cabem no tooltip antes de ele virar um bloco
 * de texto que ninguém lê em pé na frente da tela.
 *
 * 600 escolhido contra o dado real: em 20/08/2026 a maior observação de OC no
 * banco tinha 241 caracteres e a média 115, nenhuma passava de 300. Ou seja, o
 * corte não morde nada hoje — ele existe para o dia em que alguém colar um
 * contrato inteiro no campo (o schema aceita 2000).
 */
const TETO_TOOLTIP = 600;

/**
 * Balão ao lado do número do documento, na listagem, quando ele tem observação.
 *
 * Existe porque quem paga varre uma fila de dezenas de linhas e não abre o
 * detalhe de cada uma. A observação da OC carrega chave PIX, CNPJ, data
 * combinada de pagamento e avisos que Compras escreveu PARA quem paga: sem o
 * selo, essa informação só aparece para quem já desconfiava que ela existia.
 *
 * Diferente do `SeloAnexos`, aqui o CONTEÚDO importa, não só a existência —
 * por isso o texto sai num tooltip de verdade, com as quebras de linha
 * preservadas (`whitespace-pre-line`), e não num `title`. A observação real vem
 * com CNPJ e chave PIX em linhas separadas; achatar tudo numa linha a torna
 * ilegível justamente onde ela precisa ser lida.
 *
 * Documento sem observação não desenha NADA (nem um espaço reservado): um balão
 * apagado em cada linha vira ruído e a coluna deixa de ser lida de relance.
 *
 * Traz o próprio `TooltipProvider` para poder ser largado em qualquer tabela sem
 * a tela hospedeira ter de lembrar de montar um. Provider aninhado é suportado
 * pelo Radix, e o de fora continua valendo para os irmãos.
 */
export function SeloObservacoes({ observacoes }: SeloObservacoesProps) {
  const texto = observacoes?.trim();
  if (!texto) return null;

  const cortado = texto.length > TETO_TOOLTIP;
  // O corte é ANUNCIADO. Tooltip que termina no meio de uma frase sem dizer que
  // terminou faz quem paga acreditar que leu a observação inteira.
  const exibido = cortado
    ? `${texto.slice(0, TETO_TOOLTIP)}…\n\n(observação cortada aqui — abra o documento para ler o restante)`
    : texto;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="inline-flex shrink-0 cursor-help items-center text-muted-foreground"
            aria-label={`Tem observação: ${texto}`}
            role="img"
          >
            <MessageSquareText className="size-3.5" aria-hidden="true" />
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm text-left whitespace-pre-line">
          {exibido}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
