import { z } from "zod";

/** Parentesco do dependente do colaborador (RH, Bloco 2). */
export const PARENTESCOS = [
  "conjuge",
  "companheiro",
  "filho",
  "enteado",
  "tutelado",
  "pai",
  "mae",
  "outro",
] as const;
export type Parentesco = (typeof PARENTESCOS)[number];

export const ROTULO_PARENTESCO: Record<Parentesco, string> = {
  conjuge: "Cônjuge",
  companheiro: "Companheiro(a)",
  filho: "Filho(a)",
  enteado: "Enteado(a)",
  tutelado: "Tutelado(a)",
  pai: "Pai",
  mae: "Mãe",
  outro: "Outro",
};

/** Normaliza string vazia para null (campos opcionais do formulário). */
const textoOpcional = z
  .string()
  .trim()
  .transform((valor) => (valor === "" ? null : valor))
  .nullable();

/**
 * Schema do dependente do colaborador (criar e editar). `id` ausente = criar,
 * presente = editar (mesmo padrão de decisão usado em `salvarDependente`).
 * Não guarda nenhuma regra fiscal: só o cadastro e as flags que o eSocial/
 * folha vão consumir depois (dependenteIrrf, dependenteSalarioFamilia).
 */
export const dependenteSchema = z.object({
  id: z.uuid({ error: "Dependente inválido" }).optional(),
  colaboradorId: z.uuid({ error: "Colaborador inválido" }),
  nome: z
    .string()
    .trim()
    .min(2, { error: "O nome precisa ter pelo menos 2 caracteres" }),
  dataNascimento: textoOpcional,
  parentesco: z.enum(PARENTESCOS, { error: "Selecione o parentesco" }),
  cpf: textoOpcional,
  dependenteIrrf: z.boolean().default(false),
  dependenteSalarioFamilia: z.boolean().default(false),
});

export type DependenteInput = z.infer<typeof dependenteSchema>;
