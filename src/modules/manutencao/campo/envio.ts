import { z } from "zod";

import { idSchemaCom } from "@/lib/id";
import { registrarMedicaoSchema } from "@/modules/manutencao/medicoes/schemas";
import { osSalvarSchema } from "@/modules/manutencao/servicos/schemas";

/**
 * Abastecimento pelo celular: só com sinal, como na origem (a saída depende do estoque do
 * tanque naquele instante). NÃO entra na fila com reenvio automático: a saída não tem
 * id_cliente no banco, e reenviar depois de um timeout lançaria o diesel duas vezes. A tela
 * manda uma vez e mostra o resultado.
 */
export const abastecimentoCampoSchema = z.strictObject({
  equipamentoId: idSchemaCom("Escolha o equipamento"),
  tanqueId: idSchemaCom("Escolha o tanque"),
  litros: z
    .number({ error: "Informe os litros" })
    .positive({ error: "Informe os litros" })
    .max(9999999999.9999)
    .refine((v) => Math.round(v * 1e4) / 1e4 === v, { error: "Litros com até 4 casas" }),
  data: z.iso.datetime({ offset: true, error: "Data inválida" }),
  medicao: z.number().nonnegative({ error: "Leitura inválida" }).nullable(),
  /** Obra do abastecimento, sempre obrigatória (a origem pede obra e etapa; vai a 100%). */
  centroCustoId: idSchemaCom("Escolha a obra"),
  observacoes: z.string().trim().max(500),
});
export type AbastecimentoCampo = z.infer<typeof abastecimentoCampoSchema>;

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
  z.strictObject({
    tipo: z.literal("abastecimento"),
    idCliente: idSchemaCom("Envio sem identificador"),
    dados: abastecimentoCampoSchema,
  }),
]);

/** Tipos que a fila reenvia sozinha: só os que o banco deduplica por id_cliente. */
export const TIPOS_DA_FILA = ["medicao", "os"] as const;

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
  abastecimento: "Abastecimento",
};
