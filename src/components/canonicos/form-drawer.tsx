'use client';

import type { ReactNode } from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export interface FormDrawerProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  titulo: string;
  descricao?: string;
  children: ReactNode;
  rodape?: ReactNode;
  larguraClassName?: string;
}

/**
 * Modal de formulário canônico: abre CENTRALIZADO na tela. Cabeçalho fixo,
 * corpo rolável (o modal não passa de 90vh) e rodapé fixo com as ações.
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
  return (
    <Dialog open={aberto} onOpenChange={onAbertoChange}>
      <DialogContent
        className={cn(
          'flex max-h-[90vh] w-full flex-col gap-0 overflow-hidden p-0',
          larguraClassName ?? 'sm:max-w-xl',
        )}
        {...(descricao ? {} : { 'aria-describedby': undefined })}
      >
        <DialogHeader className="gap-1 space-y-0 border-b border-border px-6 py-4 text-left">
          <DialogTitle className="text-secao font-semibold">{titulo}</DialogTitle>
          {descricao ? (
            <DialogDescription className="text-detalhe text-muted-foreground">
              {descricao}
            </DialogDescription>
          ) : null}
        </DialogHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="px-6 py-5">{children}</div>
        </ScrollArea>

        {rodape ? (
          <div className="flex items-center justify-end gap-2 border-t border-border bg-surface px-6 py-4">
            {rodape}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
