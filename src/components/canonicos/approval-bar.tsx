'use client';

import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { ConfirmDialog } from './confirm-dialog';
import { StatusBadge } from './status-badge';

export interface ApprovalBarProps {
  status: string;
  podeAprovar: boolean;
  podeDesaprovar: boolean;
  onAprovar: () => void | Promise<void>;
  onRejeitar: (motivo: string) => void | Promise<void>;
  onDesaprovar: (motivo: string) => void | Promise<void>;
  desabilitarDesaprovar?: boolean;
  motivoBloqueioDesaprovar?: string;
}

export function ApprovalBar({
  status,
  podeAprovar,
  podeDesaprovar,
  onAprovar,
  onRejeitar,
  onDesaprovar,
  desabilitarDesaprovar = false,
  motivoBloqueioDesaprovar,
}: ApprovalBarProps) {
  const [aprovando, setAprovando] = useState(false);
  const [dialogRejeitar, setDialogRejeitar] = useState(false);
  const [dialogDesaprovar, setDialogDesaprovar] = useState(false);

  const mostrarAprovacao = status === 'pendente_aprovacao' && podeAprovar;
  const mostrarDesaprovacao = status === 'aprovado' && podeDesaprovar;

  async function aprovar() {
    if (aprovando) return;
    setAprovando(true);
    try {
      await onAprovar();
    } finally {
      setAprovando(false);
    }
  }

  const botaoDesaprovar = (
    <Button
      type="button"
      variant="outline"
      disabled={desabilitarDesaprovar}
      onClick={() => setDialogDesaprovar(true)}
    >
      Desaprovar
    </Button>
  );

  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-surface px-4 py-3">
      <StatusBadge status={status} />

      <div className="flex items-center gap-2">
        {mostrarAprovacao ? (
          <>
            <Button
              type="button"
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={aprovando}
              onClick={() => setDialogRejeitar(true)}
            >
              Rejeitar
            </Button>
            <Button type="button" disabled={aprovando} onClick={aprovar}>
              {aprovando ? 'Aguarde...' : 'Aprovar'}
            </Button>
          </>
        ) : null}

        {mostrarDesaprovacao ? (
          desabilitarDesaprovar && motivoBloqueioDesaprovar ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex" tabIndex={0}>
                    {botaoDesaprovar}
                  </span>
                </TooltipTrigger>
                <TooltipContent>{motivoBloqueioDesaprovar}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            botaoDesaprovar
          )
        ) : null}
      </div>

      <ConfirmDialog
        aberto={dialogRejeitar}
        onAbertoChange={setDialogRejeitar}
        titulo="Rejeitar registro"
        descricao="Informe o motivo da rejeição. Ele fica registrado na auditoria."
        textoConfirmar="Rejeitar"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={(motivo) => onRejeitar(motivo ?? '')}
      />

      <ConfirmDialog
        aberto={dialogDesaprovar}
        onAbertoChange={setDialogDesaprovar}
        titulo="Desaprovar registro"
        descricao="Informe o motivo da desaprovação. Ele fica registrado na auditoria."
        textoConfirmar="Desaprovar"
        variante="destrutivo"
        exigeMotivo
        onConfirmar={(motivo) => onDesaprovar(motivo ?? '')}
      />
    </div>
  );
}
