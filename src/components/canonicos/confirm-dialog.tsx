'use client';

import { useId, useState, type ReactNode } from 'react';
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

import { comAvisoDeFalha } from './acao-sem-silencio';

export interface ConfirmDialogProps {
  aberto: boolean;
  onAbertoChange: (aberto: boolean) => void;
  titulo: string;
  descricao: string;
  textoConfirmar: string;
  variante?: 'padrao' | 'destrutivo';
  exigeMotivo?: boolean;
  /**
   * O que exatamente vai acontecer, quando uma frase não dá conta: a lista dos
   * registros afetados, o de/para de uma reclassificação, a contagem do
   * impacto. Fica entre a descrição e os botões, com teto de altura e rolagem
   * própria — sem o teto, uma lista de trinta linhas empurra os botões para
   * fora da tela e o diálogo fica sem saída.
   */
  conteudo?: ReactNode;
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
  conteudo,
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

  /**
   * Fecha o diálogo SÓ quando a ação passou.
   *
   * O `comAvisoDeFalha` está aqui porque o `await` pode REJEITAR sem a action
   * ter rodado (rede, 504, id de action de um build antigo). Antes dele a
   * rejeição morria calada: o diálogo ficava aberto sem dizer por quê, e quem
   * clicou não tinha como saber se confirmou ou não. Ver acao-sem-silencio.ts.
   *
   * Quando falha, o motivo digitado FICA e o diálogo continua aberto de
   * propósito: a pessoa recarrega e tenta de novo sem redigitar.
   */
  async function confirmar() {
    if (!motivoValido || carregando) return;
    setCarregando(true);
    let passou = false;
    try {
      await comAvisoDeFalha('canonicos.confirmDialog.confirmar', async () => {
        await onConfirmar(exigeMotivo ? motivo.trim() : undefined);
        passou = true;
      });
      if (passou) {
        setMotivo('');
        onAbertoChange(false);
      }
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

        {conteudo ? (
          <div className="max-h-[50vh] overflow-y-auto">{conteudo}</div>
        ) : null}

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

        {/*
          `max-sm:h-11` no celular: o `DialogFooter` do shadcn já empilha os
          botões em tela estreita, mas os 36 px de altura do botão padrão são
          menos que o alvo de toque mínimo de 44 px — e este é o botão que
          confirma aprovação, rejeição e exclusão. `max-sm:` em vez de um par
          `h-11 sm:h-9` de propósito: assim o desktop não é tocado, e o dia que
          a altura padrão do botão mudar isto não fica mentindo.
        */}
        <DialogFooter className="max-sm:[&>button]:h-11">
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
