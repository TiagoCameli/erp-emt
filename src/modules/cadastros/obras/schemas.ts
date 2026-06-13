import { z } from "zod";

/** Status possíveis de uma obra. Igual ao default/check do banco. */
export const STATUS_OBRA = [
  "planejamento",
  "em_andamento",
  "paralisada",
  "concluida",
] as const;

export type StatusObra = (typeof STATUS_OBRA)[number];

/** Rótulo e cor de cada status, para o StatusBadge custom da tabela. */
export const STATUS_OBRA_CONFIG: Record<
  StatusObra,
  { rotulo: string; classes: string }
> = {
  planejamento: {
    rotulo: "Planejamento",
    classes: "bg-status-rascunho/10 text-status-rascunho",
  },
  em_andamento: {
    rotulo: "Em andamento",
    classes: "bg-status-aprovado/10 text-status-aprovado",
  },
  paralisada: {
    rotulo: "Paralisada",
    classes: "bg-status-pendente/10 text-status-pendente",
  },
  concluida: {
    rotulo: "Concluída",
    classes: "bg-status-efeito/10 text-status-efeito",
  },
};

/** UF em duas letras maiúsculas (opcional). */
const ufSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, { error: "Informe a UF com 2 letras, ex: AC" });

/** Texto opcional: vazio vira undefined para não gravar string em branco. */
function textoOpcional(maximo: number) {
  return z
    .string()
    .trim()
    .max(maximo, { error: `Máximo de ${maximo} caracteres` })
    .optional()
    .transform((valor) => (valor === "" ? undefined : valor));
}

/**
 * Data ISO (yyyy-MM-dd) do input type=date, opcional. Normaliza vazio para
 * undefined ANTES de validar o formato: o input manda "" quando em branco, e
 * validar o regex direto rejeitaria a data opcional não preenchida com
 * "Data inválida".
 */
const dataOpcional = z.preprocess(
  (valor) =>
    typeof valor === "string" && valor.trim() === "" ? undefined : valor,
  z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Data inválida" })
    .optional(),
);

/** Schema base de obra, compartilhado entre criar e editar. */
export const obraSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, { error: "O nome precisa ter pelo menos 2 caracteres" })
    .max(200, { error: "Máximo de 200 caracteres" }),
  numeroContrato: textoOpcional(60),
  clienteId: z.uuid({ error: "Cliente inválido" }).optional(),
  rodovia: textoOpcional(40),
  lote: textoOpcional(20),
  uf: ufSchema.optional().or(z.literal("").transform(() => undefined)),
  extensaoKm: z
    .number({ error: "Extensão inválida" })
    .min(0, { error: "A extensão não pode ser negativa" })
    .max(99999999.999, { error: "Extensão acima do permitido" })
    .optional(),
  dataInicio: dataOpcional,
  dataFimPrevista: dataOpcional,
  status: z.enum(STATUS_OBRA, { error: "Status inválido" }),
  observacoes: textoOpcional(2000),
  ativo: z.boolean(),
});

export type ObraInput = z.infer<typeof obraSchema>;

/**
 * Schema do formulário (client). Campos texto continuam como string (sem
 * transform) para casar input e output do react-hook-form. A coerção real
 * (vazio para null, número, etc) acontece no servidor com obraSchema.
 */
export const obraFormSchema = z.object({
  nome: z
    .string()
    .trim()
    .min(2, { error: "O nome precisa ter pelo menos 2 caracteres" })
    .max(200, { error: "Máximo de 200 caracteres" }),
  numeroContrato: z.string().trim().max(60, { error: "Máximo de 60 caracteres" }),
  clienteId: z.uuid({ error: "Cliente inválido" }).optional(),
  rodovia: z.string().trim().max(40, { error: "Máximo de 40 caracteres" }),
  lote: z.string().trim().max(20, { error: "Máximo de 20 caracteres" }),
  uf: z
    .string()
    .trim()
    .refine((valor) => valor === "" || /^[A-Za-z]{2}$/.test(valor), {
      error: "Informe a UF com 2 letras, ex: AC",
    }),
  extensaoKm: z
    .string()
    .trim()
    .refine(
      (valor) => valor === "" || !Number.isNaN(Number(valor.replace(",", "."))),
      { error: "Informe um número, ex: 12,500" },
    ),
  dataInicio: z.string().trim(),
  dataFimPrevista: z.string().trim(),
  status: z.enum(STATUS_OBRA, { error: "Status inválido" }),
  observacoes: z.string().trim().max(2000, { error: "Máximo de 2000 caracteres" }),
  ativo: z.boolean(),
});

export type ObraFormInput = z.infer<typeof obraFormSchema>;
