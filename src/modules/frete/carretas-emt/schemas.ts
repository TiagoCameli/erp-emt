import { z } from "zod";

import { idSchemaCom } from "@/lib/id";

/**
 * Pedido de conferência de um alerta de rota. O id do frete passa pelo id canônico (`z.guid()`),
 * e não pelo `uuid()` do Zod: os fretes que vieram da carga têm id derivado de md5, sem os bits de
 * versão do RFC (ex.: 38673fc5-c55a-c7be-8687-e9b1d3589ef1), e o `uuid()` estrito recusava o próprio
 * id que a tela acabou de ler ("Frete inválido", 01/10/2026). Ver `src/lib/id.ts`.
 */
export const conferirSchema = z.strictObject({
  regra: z.enum(["R1", "R2"]),
  freteIds: z.array(idSchemaCom("Frete inválido")).min(1, { error: "Nenhum frete no alerta" }).max(500),
  conferida: z.boolean(),
});
