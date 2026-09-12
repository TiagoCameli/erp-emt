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
 * Cabeçalho de seção canônico. Um único tratamento de título
 * (h2 text-secao font-semibold) para a hierarquia de seção ficar consistente
 * em todo o app.
 *
 * Nasceu em `compras/_shared` e foi promovido em 12/09/2026: metade dos
 * consumidores já era de fora de Compras (ficha do colaborador, painel de
 * alertas do RH), e importar componente de um módulo dentro de outro é o
 * caminho para a duplicação que a regra 9 do CLAUDE.md proíbe.
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
