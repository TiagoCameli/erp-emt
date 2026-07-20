import * as React from "react";

export interface SecaoDetalheProps {
  /** Título da seção, exibido como h2 na escala text-secao. */
  titulo: string;
  /** Ação opcional alinhada à direita do título (ex: botão). */
  acao?: React.ReactNode;
  /** Variante em card (borda + superfície), usada no detalhe da OC. */
  card?: boolean;
  children: React.ReactNode;
}

/**
 * Cabeçalho de seção dos detalhes de Compras. Um único tratamento de título
 * (h2 text-secao font-semibold) compartilhado por OC e cotação, para a
 * hierarquia de seção ficar consistente entre as telas.
 * Com card, envolve numa superfície com borda (layout do detalhe da OC).
 */
export function SecaoDetalhe({ titulo, acao, card, children }: SecaoDetalheProps) {
  if (card) {
    return (
      <section className="rounded-md border border-border bg-surface p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="text-secao font-semibold">{titulo}</h2>
          {acao}
        </div>
        {children}
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-secao font-semibold">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  );
}
