import { z } from "zod";

/** Tipos de depósito. Tanques exigem insumo; os demais não podem ter insumo. */
export const TIPOS_DEPOSITO = [
  "central",
  "obra",
  "almoxarifado_mecanica",
  "tanque_combustivel",
  "tanque_betuminoso",
] as const;

export type TipoDeposito = (typeof TIPOS_DEPOSITO)[number];

/** Rótulos amigáveis dos tipos, para selects e exibição. */
export const ROTULO_TIPO_DEPOSITO: Record<TipoDeposito, string> = {
  central: "Depósito central",
  obra: "Depósito de obra",
  almoxarifado_mecanica: "Almoxarifado de mecânica",
  tanque_combustivel: "Tanque de combustível",
  tanque_betuminoso: "Tanque de betuminoso",
};

/** Tipos que são tanque e, portanto, exigem insumo. */
export const TIPOS_TANQUE: readonly TipoDeposito[] = [
  "tanque_combustivel",
  "tanque_betuminoso",
];

/** Diz se um tipo é tanque (exige insumo). */
export function ehTanque(tipo: string): boolean {
  return TIPOS_TANQUE.includes(tipo as TipoDeposito);
}

export const depositoSchema = z
  .object({
    nome: z
      .string()
      .trim()
      .min(1, "Informe o nome do depósito")
      .max(120, "O nome deve ter no máximo 120 caracteres"),
    tipo: z.enum(TIPOS_DEPOSITO, { message: "Selecione o tipo" }),
    obraId: z.uuid("Selecione uma obra válida").nullable(),
    insumoId: z.uuid("Selecione um insumo válido").nullable(),
    ativo: z.boolean(),
  })
  .superRefine((dados, ctx) => {
    if (ehTanque(dados.tipo)) {
      if (!dados.insumoId) {
        ctx.addIssue({
          code: "custom",
          path: ["insumoId"],
          message: "Tanque exige um insumo. Selecione o insumo armazenado",
        });
      }
    } else if (dados.insumoId) {
      ctx.addIssue({
        code: "custom",
        path: ["insumoId"],
        message: "Só tanque pode ter insumo. Deixe o insumo em branco",
      });
    }
  });

export type DepositoInput = z.infer<typeof depositoSchema>;
