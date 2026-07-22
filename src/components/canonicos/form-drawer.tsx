'use client';

import type { ReactNode } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface FormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  titulo: string;
  descricao?: string;
  children: ReactNode;
  rodape?: ReactNode;
  /**
   * Largura máxima da COLUNA DE CONTEÚDO. O form abre sempre em tela cheia;
   * isto só limita a largura útil dos campos (cabeçalho, corpo e rodapé ficam
   * alinhados na mesma coluna centralizada) para não esticar demais em telas
   * largas. Default: leitura confortável. Forms com tabela de itens passam algo
   * mais largo (ex.: `sm:max-w-[95vw]`).
   */
  larguraClassName?: string;
}

/**
 * Formulário canônico em TELA CHEIA: abre ocupando a viewport inteira e funciona
 * como uma página. Cabeçalho fixo no topo, rodapé fixo embaixo (ações sempre
 * visíveis) e o miolo (os campos) rola com scroll nativo, pra cima e pra baixo.
 * Continua sendo um overlay (mantém foco e Esc); não é uma rota nova.
 * Mantém a API antiga (nome FormDrawer) para não mexer nos consumidores.
 */
export function FormDrawer({
  aberto,
  onAbertoChange,
  titulo,
  descricao,
  children,
  rodape,
  larguraClassName,
}: FormDrawerProps) {
  const larguraConteudo = larguraClassName ?? 'max-w-4xl';

  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent
        className={cn(
          // Tela cheia: sobrescreve o card centralizado do Dialog base.
          'fixed inset-0 z-50 flex max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 shadow-none sm:max-w-none',
        )}
        {...(descricao ? {} : { 'aria-describedby': undefined })}
      >
        <DialogHeader className="shrink-0 space-y-0 border-b border-border bg-background px-6 py-4 text-left">
          <div className={cn('mx-auto flex w-full flex-col gap-1', larguraConteudo)}>
            <DialogTitle className="text-secao font-semibold">{titulo}</DialogTitle>
            {descricao ? (
              <DialogDescription className="text-detalhe text-muted-foreground">
                {descricao}
              </DialogDescription>
            ) : null}
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className={cn('mx-auto w-full px-6 py-6', larguraConteudo)}>
            {children}
          </div>
        </div>

        {rodape ? (
          <div className="shrink-0 border-t border-border bg-surface">
            <div
              className={cn(
                'mx-auto flex w-full items-center justify-end gap-2 px-6 py-4',
                larguraConteudo,
              )}
            >
              {rodape}
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
