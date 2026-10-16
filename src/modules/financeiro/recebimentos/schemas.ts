import { z } from "zod";

import { idSchema, idSchemaCom } from "@/lib/id";
import { MAX_ITENS_FILTRO } from "@/modules/financeiro/_shared/listas-na-url";

/** Tamanho padrão de página da aba "Recebidos". */
export const TAMANHO_PAGINA_PADRAO = 25;

/**
 * Schemas da aba Financeiro > Recebimentos.
 *
 * O LANÇAMENTO de um recebível não mora aqui: ele é o mesmo `lancamentos` com
 * `tipo = 'a_receber'`, e usa o formulário e o schema de
 * `financeiro/lancamentos`. Ter dois formulários para a mesma tabela foi o que
 * deixou o caminho do a receber quebrado por meses (o daqui nem mandava número de
 * documento, e o do lançamento não mandava conta de destino).
 *
 * O que sobra aqui é a única mutação própria da aba: dar um recebimento como
 * recebido.
 */

/** Schema do formulário de "dar como recebido" (client). */
export const darComoRecebidoFormSchema = z.object({
  contaId: idSchemaCom("Selecione a conta que recebeu"),
  dataRecebimento: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Informe a data do recebimento" }),
});

export type DarComoRecebidoFormInput = z.infer<
  typeof darComoRecebidoFormSchema
>;

/** Teto do filtro de valor: o mesmo da coluna NUMERIC(14,2). */
const VALOR_MAXIMO = 999999999999.99;

const valorFiltroSchema = z.number().min(0).max(VALOR_MAXIMO).optional();

/**
 * Filtros da aba "Recebidos" vindos do cliente, revalidados na action de
 * exportar (a mesma `FiltrosRecebidas` que a página monta da URL). Mesmo
 * desenho de `filtrosPagasSchema`: `strictObject`, e o teste confere as chaves
 * contra a interface.
 */
export const filtrosRecebidasSchema = z.strictObject({
  busca: z.string().trim().max(120).optional(),
  clienteId: idSchema.optional(),
  contaBancariaId: idSchema.optional(),
  categoriaId: idSchema.optional(),
  centroCustoIds: z.array(idSchema).max(MAX_ITENS_FILTRO).optional(),
  /** yyyy-MM-dd, primeiro dia do mês de referência. */
  mesCompetencia: z.iso.date().optional(),
  valorDe: valorFiltroSchema,
  valorAte: valorFiltroSchema,
  vencimentoDe: z.iso.date().optional(),
  vencimentoAte: z.iso.date().optional(),
  recebimentoDe: z.iso.date().optional(),
  recebimentoAte: z.iso.date().optional(),
});
