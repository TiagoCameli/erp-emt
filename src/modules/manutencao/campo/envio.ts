import { z } from "zod";

import { idSchemaCom } from "@/lib/id";
import { registrarMedicaoSchema } from "@/modules/manutencao/medicoes/schemas";
import { osSalvarSchema } from "@/modules/manutencao/servicos/schemas";

/**
 * O que o celular manda para `/api/campo/envio`. Módulo puro: a fila (cliente), a rota
 * (servidor) e os testes leem o mesmo contrato.
 *
 * O `dados` é o MESMO schema da tela do computador: leitura e OS abertas pelo celular
 * passam pelas mesmas travas. O `idCliente` nasce no celular quando a pessoa aperta o
 * botão e vai para `p_id_cliente`: reenviar (sem sinal, timeout, aba recarregada) devolve
 * a linha que já existe, nunca uma segunda.
 */
export const envioCampoSchema = z.discriminatedUnion("tipo", [
  z.strictObject({
    tipo: z.literal("medicao"),
    idCliente: idSchemaCom("Envio sem identificador"),
    dados: registrarMedicaoSchema,
  }),
  z.strictObject({
    tipo: z.literal("os"),
    idCliente: idSchemaCom("Envio sem identificador"),
    dados: osSalvarSchema,
  }),
]);

export type EnvioCampo = z.infer<typeof envioCampoSchema>;
export type TipoEnvioCampo = EnvioCampo["tipo"];

/**
 * Resposta da rota. `definitivo` separa o erro que não passa com outra tentativa
 * (permissão, validação, trava do banco) do que passa (sem sinal, sessão vencida, falha
 * do servidor). A fila só reenvia o que não é definitivo; o definitivo fica na tela até a
 * pessoa descartar, com o motivo escrito.
 */
export type RespostaEnvioCampo =
  | { ok: true; id: string }
  | { ok: false; erro: string; definitivo: boolean; semSessao?: boolean };

export const ROTA_ENVIO_CAMPO = "/api/campo/envio";

export const ROTULO_ENVIO_CAMPO: Record<TipoEnvioCampo, string> = {
  medicao: "Leitura",
  os: "Ordem de serviço",
};
