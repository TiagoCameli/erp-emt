'use client';

import { useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

import { comAvisoDeFalha } from './acao-sem-silencio';
import { ConfirmDialog } from './confirm-dialog';
import { StatusBadge } from './status-badge';

export interface ApprovalBarProps {
  status: string;
  /**
   * Rótulo custom do badge de status, repassado ao `StatusBadge` interno.
   * Sem isso, o badge cai no rótulo default do mapa (`StatusBadge`), que é
   * masculino ("Aprovado") — sobrescreva quando a entidade for feminina
   * ("Aprovada") e a tela já mostrar esse rótulo em outro lugar (cabeçalho,
   * por exemplo): sem o mesmo rótulo nos dois, a tela mostra duas grafias do
   * mesmo status ao mesmo tempo.
   */
  rotulo?: string;
  podeAprovar: boolean;
  podeDesaprovar: boolean;
  onAprovar: () => void | Promise<void>;
  onRejeitar: (motivo: string) => void | Promise<void>;
  onDesaprovar: (motivo: string) => void | Promise<void>;
  desabilitarDesaprovar?: boolean;
  motivoBloqueioDesaprovar?: string;
  /**
   * Renomeia a devolução ao autor, para a tela em que "rejeitar" é duro demais.
   *
   * O efeito é o mesmo em toda entidade (volta ao autor com motivo registrado),
   * mas a palavra não é: na folha, "Rejeitar" faz parecer que o trabalho foi
   * recusado, quando o que acontece é devolver para ajuste. Só o texto muda —
   * quem devolve continua precisando do motivo, aqui e no banco.
   */
  textosRejeitar?: {
    botao: string;
    titulo: string;
    descricao: string;
    confirmar: string;
  };
  /**
   * Ações da própria tela, à esquerda das de aprovação.
   *
   * Existe porque a barra é o lugar onde o usuário procura o que fazer com o
   * documento, e ação de fluxo pendurada em outro canto da tela não é achada.
   * Quem passa decide quando mostrar: a barra não sabe as regras da entidade.
   */
  acoesExtras?: ReactNode;
}

export function ApprovalBar({
  status,
  rotulo,
  podeAprovar,
  podeDesaprovar,
  onAprovar,
  onRejeitar,
  onDesaprovar,
  desabilitarDesaprovar = false,
  motivoBloqueioDesaprovar,
  textosRejeitar,
  acoesExtras,
}: ApprovalBarProps) {
  const rejeitar = textosRejeitar ?? {
    botao: 'Rejeitar',
    titulo: 'Rejeitar registro',
    descricao: 'Informe o motivo da rejeição. Ele fica registrado na auditoria.',
    confirmar: 'Rejeitar',
  };
  const [aprovando, setAprovando] = useState(false);
  const [dialogRejeitar, setDialogRejeitar] = useState(false);
  const [dialogDesaprovar, setDialogDesaprovar] = useState(false);

  const mostrarAprovacao = status === 'pendente_aprovacao' && podeAprovar;
  const mostrarDesaprovacao = status === 'aprovado' && podeDesaprovar;

  async function aprovar() {
    if (aprovando) return;
    setAprovando(true);
    try {
      // `comAvisoDeFalha` existe porque este `await` pode REJEITAR (a action
      // nem rodar), e a rejeição calada faz o botão de aprovar dinheiro parecer
      // que funcionou. Ver o comentário em acao-sem-silencio.ts.
      await comAvisoDeFalha('canonicos.approvalBar.aprovar', onAprovar);
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
    /*
     * No celular a barra EMPILHA, e no desktop volta a ser uma linha só.
     *
     * Medido na folha de 08/2026, em produção: a versão de uma linha só exigia
     * 816 px de largura (badge 154 + quatro botões 590 + vãos + recuo), com
     * `flex-nowrap` nos dois níveis. Num telefone de 390-414 px o "Aprovar",
     * que é o último da fila, ficava uns 400 px FORA da tela — sem jeito de
     * tocar nele, na ação mais importante do app, justamente na tela que chega
     * por link de WhatsApp e é aberta no celular.
     *
     * `items-stretch` no empilhado, para o botão ocupar a largura toda: alvo de
     * toque grande é o que separa aprovar de errar o dedo.
     */
    <div className="flex flex-col items-stretch gap-3 rounded-md border border-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="flex items-center">
        <StatusBadge status={status} rotulo={rotulo} />
      </div>

      {/*
       * `flex-wrap` em TODA largura, sem `sm:flex-nowrap`.
       *
       * Medido: com `flex-nowrap` a partir de `sm` (640 px), a barra voltava a
       * uma linha só que exige 816 px — então entre 640 e 816 px dois botões
       * saíam da tela de novo, e um deles era o Aprovar. Essa faixa é tablet,
       * notebook pequeno e telefone deitado. Desligar a quebra de linha num
       * ponto fixo é chutar onde a fila cabe; deixar quebrando sempre não
       * precisa de chute, e no desktop largo a fila cabe numa linha de
       * qualquer jeito, então nada muda visualmente lá.
       *
       * No celular cada botão cresce até caber dois por linha (`min-w` de
       * 9rem) e ganha 44 px de altura, o mínimo de alvo de toque.
       */}
      <div className="flex flex-wrap items-center gap-2 sm:justify-end max-sm:[&>button]:h-11 max-sm:[&>button]:min-w-36 max-sm:[&>button]:flex-1">
        {acoesExtras}
        {mostrarAprovacao ? (
          <>
            <Button
              type="button"
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={aprovando}
              onClick={() => setDialogRejeitar(true)}
            >
              {rejeitar.botao}
            </Button>
            {/*
              `basis-full` só no celular: com o `flex-wrap` do container isso dá
              LINHA PRÓPRIA ao Aprovar, embaixo de todo o resto. É de propósito
              que ele não divida linha com "Mandar para revisão": dois botões
              lado a lado num telefone, um deles aprovando dinheiro, é convite a
              erro de dedo. No desktop segue na fila, do tamanho natural.
            */}
            <Button
              type="button"
              className="max-sm:basis-full"
              disabled={aprovando}
              onClick={aprovar}
            >
              {aprovando ? 'Aprovando...' : 'Aprovar'}
            </Button>
          </>
        ) : null}

        {mostrarDesaprovacao ? (
          desabilitarDesaprovar && motivoBloqueioDesaprovar ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  {/* `flex-1` e `[&>button]` repetidos aqui porque este span
                      fica ENTRE o container e o botão: sem isso o Desaprovar
                      bloqueado seria o único que não cresce no celular. */}
                  <span
                    className="inline-flex max-sm:flex-1 max-sm:[&>button]:h-11 max-sm:[&>button]:w-full"
                    tabIndex={0}
                  >
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
        titulo={rejeitar.titulo}
        descricao={rejeitar.descricao}
        textoConfirmar={rejeitar.confirmar}
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
