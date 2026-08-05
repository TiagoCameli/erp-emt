import { z } from "zod";

import { idSchemaCom } from "@/lib/id";

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

/**
 * Rótulo do parentesco com fallback pra dado legado sem parentesco definido
 * (ver comentário de `listarDependentes` em `dependentes.ts`). Usado na UI
 * (seção de dependentes do form e ficha) em vez de indexar `ROTULO_PARENTESCO`
 * direto, porque `Dependente.parentesco` é tipado como `string`, não como
 * `Parentesco`.
 */
export function rotuloParentesco(parentesco: string): string {
  return (
    (ROTULO_PARENTESCO as Record<string, string>)[parentesco] ||
    "Não informado"
  );
}

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
  id: idSchemaCom("Dependente inválido").optional(),
  colaboradorId: idSchemaCom("Colaborador inválido"),
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
