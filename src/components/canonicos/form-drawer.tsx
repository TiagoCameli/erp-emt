'use client';

import type { ReactNode } from 'react';

import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
    <Sheet open={aberto} onOpenChange={onAbertoChange}>
      <SheetContent
        side="right"
        className={cn('flex w-full flex-col gap-0 p-0', larguraClassName ?? 'sm:max-w-xl')}
        {...(descricao ? {} : { 'aria-describedby': undefined })}
      >
        <SheetHeader className="gap-1 border-b border-border px-6 py-4">
          <SheetTitle className="text-secao font-semibold">{titulo}</SheetTitle>
          {descricao ? (
            <SheetDescription className="text-detalhe text-muted-foreground">
              {descricao}
            </SheetDescription>
          ) : null}
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="px-6 py-5">{children}</div>
        </ScrollArea>

        {rodape ? (
          <div className="flex items-center justify-end gap-2 border-t border-border bg-surface px-6 py-4">
            {rodape}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
