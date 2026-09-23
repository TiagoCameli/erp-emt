import { z } from "zod";

import { idSchemaCom } from "@/lib/id";
import { dataHoraLocalParaIso } from "@/modules/combustivel/_shared/rotulos";
import {
  dataHoraIso,
  dataHoraTexto,
  litrosNumero,
  litrosTexto,
  paraLitros,
} from "@/modules/combustivel/transferencias/schemas";

/**
 * Esvaziamento de tanque: tira litros do nível sem consumir camada do PEPS
 * (igual à origem). Motivo obrigatório, porque é perda ou descarte e alguém vai
 * perguntar depois. Não tem edição: erra, exclui com motivo e registra de novo.
 */

const motivoSchema = z
  .string()
  .trim()
  .min(1, { error: "Informe o motivo do esvaziamento" })
  .max(500, { error: "O motivo pode ter no máximo 500 caracteres" });

export const esvaziamentoFormSchema = z.object({
  tanqueId: idSchemaCom("Selecione o tanque"),
  litros: litrosTexto(),
  motivo: motivoSchema,
  dataHora: dataHoraTexto(),
});

export type EsvaziamentoFormInput = z.infer<typeof esvaziamentoFormSchema>;

export const esvaziamentoSchema = z.object({
  tanqueId: idSchemaCom("Selecione o tanque"),
  litros: litrosNumero,
  motivo: motivoSchema,
  dataHora: dataHoraIso,
});

export type EsvaziamentoInput = z.infer<typeof esvaziamentoSchema>;

/** Formulário validado para o contrato da action. */
export function esvaziamentoDoForm(form: EsvaziamentoFormInput): EsvaziamentoInput {
  return {
    tanqueId: form.tanqueId,
    litros: paraLitros(form.litros) ?? Number.NaN,
    motivo: form.motivo.trim(),
    dataHora: dataHoraLocalParaIso(form.dataHora) ?? "",
  };
}
