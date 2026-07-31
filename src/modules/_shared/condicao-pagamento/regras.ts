/**
 * Condição de pagamento: o catálogo é um só, para todo o app.
 *
 * OC, cotação e lançamento avulso escolhem da MESMA lista e criam na MESMA
 * tabela. Três consultas iguais copiadas em três módulos garantiam isso só
 * enquanto ninguém mexesse: bastava alguém filtrar diferente num lugar para a
 * lista da OC e a do lançamento divergirem sem ninguém perceber. Uma leitura só.
 *
 * Sem 'use server': é regra pura, importável por Server e Client Components, e
 * testável sem subir Supabase.
 */

/** Opção de condição de pagamento para os selects de OC, cotação e lançamento. */
export interface CondicaoPagamentoOpcao {
  id: string;
  descricao: string;
}

/**
 * Uma parcela da condição: quantos dias depois da compra e quanto do total.
 *
 * `type` e não `interface` de propósito: só o type alias ganha index signature
 * implícita, e sem ela isso não passa como `Json` no argumento da RPC.
 */
export type ParcelaDaCondicao = {
  dias_offset: number;
  percentual: number;
};

/**
 * Interpreta o nome digitado em parcelas {dias_offset, percentual}:
 * "à vista" -> [0/100]; "15 dias" -> [15/100]; "30/60 dias" -> [30/50, 60/50];
 * "30/60/90" -> 3 parcelas. Sem número reconhecido, cai em à vista.
 *
 * A última parcela absorve a sobra do arredondamento porque `salvar_condicao`
 * exige soma exata de 100: com 3 parcelas, 33,33 + 33,33 + 33,34.
 */
export function parcelasDoNome(nome: string): ParcelaDaCondicao[] {
  const texto = nome.trim().toLowerCase();
  const nums = (texto.match(/\d+/g) ?? [])
    .map((n) => Number.parseInt(n, 10))
    .filter((n) => !Number.isNaN(n));
  if (nums.length === 0) return [{ dias_offset: 0, percentual: 100 }];
  const k = nums.length;
  const base = Math.floor((100 / k) * 100) / 100;
  return nums.map((dias, i) => ({
    dias_offset: dias,
    percentual: i === k - 1 ? Number((100 - base * (k - 1)).toFixed(2)) : base,
  }));
}
