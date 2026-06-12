import { z } from "zod";

/** Vínculos aceitos no cadastro de colaboradores (RH completo vem na Fase 7). */
export const VINCULOS = ["clt", "diarista", "terceiro"] as const;
export type Vinculo = (typeof VINCULOS)[number];

export const ROTULO_VINCULO: Record<Vinculo, string> = {
  clt: "CLT",
  diarista: "Diarista",
  terceiro: "Terceiro",
};

/** Normaliza string vazia para null (campos opcionais do formulário). */
const textoOpcional = z
  .string()
  .trim()
  .transform((valor) => (valor === "" ? null : valor))
  .nullable();

/** Schema do formulário de colaborador (criar e editar). */
export const colaboradorSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, { error: "O nome precisa ter pelo menos 2 caracteres" }),
  cpf: textoOpcional,
  funcao: textoOpcional,
  vinculo: z.enum(VINCULOS, { error: "Selecione um vínculo" }),
  obraId: z.uuid({ error: "Obra inválida" }).nullable(),
  centroCustoId: z.uuid({ error: "Centro de custo inválido" }).nullable(),
  dataAdmissao: textoOpcional,
  telefone: textoOpcional,
  ativo: z.boolean().default(true),
});

export type ColaboradorInput = z.infer<typeof colaboradorSchema>;
