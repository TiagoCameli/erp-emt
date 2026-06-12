'use client';

import { useId, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export interface ConfirmDialogProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  titulo: string;
  descricao: string;
  textoConfirmar: string;
  variante?: 'padrao' | 'destrutivo';
  exigeMotivo?: boolean;
  onConfirmar: (motivo?: string) => void | Promise<void>;
}

export function ConfirmDialog({
  aberto,
  onAbertoChange,
  titulo,
  descricao,
  textoConfirmar,
  variante = 'padrao',
  exigeMotivo = false,
  onConfirmar,
}: ConfirmDialogProps) {
  const [motivo, setMotivo] = useState('');
  const [carregando, setCarregando] = useState(false);
  const motivoId = useId();

  const motivoValido = !exigeMotivo || motivo.trim().length > 0;

  function trocarAberto(novoAberto: boolean) {
    if (carregando) return;
    if (!novoAberto) setMotivo('');
    onAbertoChange(novoAberto);
  }

  async function confirmar() {
    if (!motivoValido || carregando) return;
    setCarregando(true);
    try {
      await onConfirmar(exigeMotivo ? motivo.trim() : undefined);
      setMotivo('');
      onAbertoChange(false);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={trocarAberto}>
      <DialogContent showCloseButton={false} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription className="text-detalhe text-muted-foreground">
            {descricao}
          </DialogDescription>
        </DialogHeader>

        {exigeMotivo ? (
          <div className="grid gap-2">
            <Label htmlFor={motivoId}>Motivo</Label>
            <Textarea
              id={motivoId}
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
              placeholder="Descreva o motivo"
              rows={3}
              disabled={carregando}
              autoFocus
            />
          </div>
        ) : null}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={carregando}
            onClick={() => trocarAberto(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            variant={variante === 'destrutivo' ? 'destructive' : 'default'}
            disabled={carregando || !motivoValido}
            onClick={confirmar}
          >
            {carregando ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                {textoConfirmar}
              </>
            ) : (
              textoConfirmar
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
