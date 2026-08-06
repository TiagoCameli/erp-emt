import { toast as sonner } from "sonner";

/**
 * Quanto tempo cada tipo de aviso fica na tela, em ms.
 *
 * Sucesso é curto porque é confirmação de coisa que deu certo, e quem trabalha em
 * lote vê centenas por dia: o Tiago reportou isso em 06/08/2026, com print de um
 * "Conta bancária definida" atravessando a tela enquanto ele definia conta de
 * lançamento em lançamento.
 *
 * Erro fica bem mais tempo. Em app de dinheiro, mensagem de erro que some antes de
 * ser lida é pior do que mensagem nenhuma: o usuário fica sabendo que algo falhou
 * e não sabendo o quê.
 *
 * Este módulo existe porque o sonner só tem duração GLOBAL, não por tipo. Um
 * número no `<Toaster>` encurtaria o erro junto com o sucesso.
 */
export const DURACAO_TOAST = {
  sucesso: 2000,
  info: 3000,
  aviso: 5000,
  erro: 6000,
} as const;

type Opcoes = Parameters<typeof sonner.success>[1];

/**
 * Mesma superfície do `toast` do sonner, com a duração certa por tipo.
 *
 * Importe daqui, não de "sonner": é o que mantém a duração num lugar só, em vez
 * de num número repetido nas 300 chamadas do app. Quem precisar de outra duração
 * numa chamada específica passa `{ duration }` e ganha.
 */
export const toast = {
  success: (mensagem: string, opcoes?: Opcoes) =>
    sonner.success(mensagem, { duration: DURACAO_TOAST.sucesso, ...opcoes }),
  error: (mensagem: string, opcoes?: Opcoes) =>
    sonner.error(mensagem, { duration: DURACAO_TOAST.erro, ...opcoes }),
  warning: (mensagem: string, opcoes?: Opcoes) =>
    sonner.warning(mensagem, { duration: DURACAO_TOAST.aviso, ...opcoes }),
  info: (mensagem: string, opcoes?: Opcoes) =>
    sonner.info(mensagem, { duration: DURACAO_TOAST.info, ...opcoes }),
};
