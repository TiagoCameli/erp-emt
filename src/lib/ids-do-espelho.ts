import { idSchema } from "@/lib/id";

/**
 * Quantos documentos cabem em um trabalho de impressão.
 *
 * Botão de ajuste, não lei: 50 protege o navegador de montar uma página
 * gigante e ainda cobre o caso que o Tiago citou (as OCs de um mês). Acima
 * disto a página RECUSA em vez de imprimir 50 e calar sobre o resto, porque
 * truncar em silêncio faz o papel parecer completo quando não é.
 */
export const MAX_ESPELHOS = 50;

export interface IdsDoEspelho {
  /** Ids válidos, sem repetição, na ordem em que apareceram. */
  ids: string[];
  /** Quantos pedaços do parâmetro não eram id. Vira aviso na página. */
  invalidos: number;
  /** true quando passou de MAX_ESPELHOS. Quem chama recusa. */
  excedeu: boolean;
}

/**
 * Lê o `?ids=` da rota de espelho.
 *
 * Valida por `idSchema` (`z.guid()`), e não pelo `uuid()` do Zod: ver o
 * comentário de `@/lib/id`. Id de tamanho errado, texto solto e tentativa de
 * injeção caem aqui; quem garante que o id existe e que o usuário pode ver a
 * linha é a FK e a RLS.
 */
export function lerIdsDoEspelho(bruto: string | undefined): IdsDoEspelho {
  const pedacos = (bruto ?? "")
    .split(",")
    .map((pedaco) => pedaco.trim())
    .filter((pedaco) => pedaco.length > 0);

  const ids: string[] = [];
  let invalidos = 0;

  for (const pedaco of pedacos) {
    if (!idSchema.safeParse(pedaco).success) {
      invalidos += 1;
      continue;
    }
    if (!ids.includes(pedaco)) ids.push(pedaco);
  }

  return { ids, invalidos, excedeu: ids.length > MAX_ESPELHOS };
}
