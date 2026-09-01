'use client';

import { useEffect } from 'react';

import { toast } from './toast';

/**
 * Rede de segurança: nenhuma ação do app pode falhar em silêncio.
 *
 * O contrato das Server Actions daqui é devolver `{ erro }`, e os handlers
 * tratam com `toast.error`. Mas existe o caminho em que a action NÃO RODA: o
 * POST dela falha por rede, por 504, ou porque produção mudou de build depois
 * de a página ter sido aberta e o id da Server Action que o cliente antigo
 * manda não existe mais no build novo. Aí o `await` REJEITA, o
 * `if ("erro" in resultado)` nunca é alcançado, e a rejeição não tem para onde
 * ir: error boundary do React não pega rejeição de handler de evento, e sem
 * este listener o navegador só escreve no console. O botão pisca e o mundo fica
 * igual.
 *
 * Foi o que travou a aprovação da folha de 08/2026 (R$ 173 mil): a pessoa
 * clicava em Aprovar e a `fn_aprovar_folha` não aparecia UMA vez nos logs do
 * banco. Ninguém tinha erro para reportar.
 *
 * Por que uma rede global, e não só `catch` em cada botão: a varredura achou 20
 * `try/finally` sem `catch` no app, e mais handlers que dão `await` numa action
 * sem `try` nenhum. Consertar um por um deixa o próximo botão que alguém
 * escrever descoberto de novo. Os fluxos de aprovação continuam ganhando
 * `comAvisoDeFalha` por cima disso (mensagem melhor e estado de diálogo certo);
 * esta rede é o piso, para que o silêncio deixe de ser possível.
 *
 * Vive no layout de `(app)`, então cobre toda tela autenticada.
 */

/** Rejeições que NÃO são falha de verdade e não merecem toast. */
function ehRuido(motivo: unknown): boolean {
  if (motivo === null || motivo === undefined) return true;

  const nome = (motivo as { name?: unknown } | null)?.name;
  // Requisição cancelada de propósito: navegação, componente desmontado,
  // AbortController de busca com debounce. Cancelar não é falhar.
  if (nome === 'AbortError' || nome === 'CanceledError') return true;

  const texto = String(
    (motivo as { message?: unknown } | null)?.message ?? motivo,
  );
  // O Next rejeita com estes ao navegar/redirecionar no meio de uma ação. São
  // controle de fluxo do framework, não erro.
  if (texto.includes('NEXT_REDIRECT') || texto.includes('NEXT_NOT_FOUND')) {
    return true;
  }
  return false;
}

export function RedeDeFalhaSilenciosa() {
  useEffect(() => {
    // Mesma falha em rajada (um lote que dispara N chamadas) daria N toasts em
    // cima do outro. Um aviso por janela curta basta: a pessoa precisa saber
    // que falhou, não quantas vezes.
    let ultimoAviso = 0;

    function avisar(motivo: unknown) {
      if (ehRuido(motivo)) return;

      const agora = Date.now();
      if (agora - ultimoAviso < 3000) return;
      ultimoAviso = agora;

      console.error('[erp-emt] falha nao tratada', motivo);
      // "PODE não ter sido concluída" e "confira": mesma razão do
      // comAvisoDeFalha — invocação morta não é o mesmo que nada aconteceu, e
      // mandar tentar de novo convida a aprovar o mesmo dinheiro duas vezes.
      toast.error(
        'A ação pode não ter sido concluída. Recarregue a página e confira antes de tentar de novo',
      );
    }

    function aoRejeitar(evento: PromiseRejectionEvent) {
      avisar(evento.reason);
    }

    window.addEventListener('unhandledrejection', aoRejeitar);
    return () => window.removeEventListener('unhandledrejection', aoRejeitar);
  }, []);

  return null;
}
