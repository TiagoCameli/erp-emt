import * as React from "react";
import { Paperclip } from "lucide-react";

export interface SeloAnexosProps {
  /** Quantos anexos o documento tem. Zero (ou nulo) não desenha nada. */
  quantidade: number | null | undefined;
}

/**
 * Clipe ao lado do número do documento, na listagem, quando ele tem anexo.
 *
 * Existe porque a lista não diz hoje se a OC tem a nota digitalizada junto: só
 * abrindo o documento dá para saber, e quem confere cem linhas não abre cem
 * documentos. É sinal, não contagem — o número exato aparece no `title` e na
 * tela do documento.
 *
 * Documento sem anexo não desenha NADA (nem um espaço reservado): um clipe
 * apagado em cada linha vira ruído e a coluna deixa de ser lida de relance.
 */
export function SeloAnexos({ quantidade }: SeloAnexosProps) {
  if (!quantidade || quantidade < 1) return null;

  const rotulo = quantidade === 1 ? "1 anexo" : `${quantidade} anexos`;

  return (
    <span
      // O texto do title é o mesmo do aria-label: quem usa mouse e quem usa
      // leitor de tela recebem a mesma informação, não uma versão pior.
      title={rotulo}
      aria-label={rotulo}
      role="img"
      className="inline-flex shrink-0 items-center text-muted-foreground"
    >
      <Paperclip className="size-3.5" aria-hidden="true" />
    </span>
  );
}
