import { z } from "zod";

/** Tipos válidos da unidade de medida (espelham o default e os valores da tabela). */
export const TIPOS_UNIDADE = [
  "massa",
  "volume",
  "comprimento",
  "area",
  "unidade",
  "tempo",
  "outro",
] as const;

export type TipoUnidade = (typeof TIPOS_UNIDADE)[number];

/** Rótulos em pt-BR para exibição do tipo na UI. */
export const ROTULO_TIPO_UNIDADE: Record<TipoUnidade, string> = {
  massa: "Massa",
  volume: "Volume",
  comprimento: "Comprimento",
  area: "Área",
  unidade: "Unidade",
  tempo: "Tempo",
  outro: "Outro",
};

/** Schema do formulário de unidade de medida. */
export const unidadeSchema = z.object({
  sigla: z
    .string()
    .trim()
    .min(1, { error: "Informe a sigla" })
    .max(16, { error: "A sigla pode ter no máximo 16 caracteres" }),
  nome: z
    .string()
    .trim()
    .min(2, { error: "O nome precisa ter pelo menos 2 caracteres" }),
  tipo: z.enum(TIPOS_UNIDADE, { error: "Selecione um tipo" }),
  ativo: z.boolean().default(true),
});

/** Saída validada (ativo já resolvido para boolean): use nas server actions. */
export type UnidadeInput = z.infer<typeof unidadeSchema>;

/** Entrada do formulário (ativo opcional por causa do default): use no react-hook-form. */
export type UnidadeFormInput = z.input<typeof unidadeSchema>;
