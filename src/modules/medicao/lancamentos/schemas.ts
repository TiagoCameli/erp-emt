import { z } from "zod";

import { idSchemaCom } from "@/lib/id";

/**
 * Validação do formulário de Lançamento. Confere só FORMATO e presença (data no formato do
 * `type="date"`, km obrigatório em rodovia): as regras de negócio (data que já chegou, dentro de
 * medição aberta, quantidade > 0, excesso sobre o previsto) são do banco (`fn_mc_lancamento_salvar`,
 * spec 8) — o zod aqui só evita uma ida ao servidor com o formulário obviamente incompleto.
 *
 * Todos os campos de texto são strings simples (sem `.optional()`/`.transform()`): o formulário
 * sempre inicializa com "" em vez de `undefined`, o que mantém o tipo de entrada e saída do zod
 * idênticos e o `useForm` sem generics duplicados. Números continuam no formato canônico de
 * digitação (vírgula decimal, ver `@/lib/numero-digitado`); a conversão para o texto com ponto que
 * a RPC espera acontece em `actions.ts` (D7: este módulo não arredonda nem converte para `Number`).
 */

export const lancamentoFormBaseSchema = z.object({
  contratoId: idSchemaCom("Contrato inválido"),
  itemId: idSchemaCom("Escolha o serviço"),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe a data"),
  quantidade: z.string().min(1, "Informe a quantidade"),
  kmInicial: z.string(),
  kmFinal: z.string(),
  estaca: z.string(),
  localTexto: z.string(),
  observacao: z.string(),
  /** Reenviado sempre (mesmo vazio): editar sem repetir o motivo apagaria um excesso já aceito. */
  motivoExcesso: z.string(),
});

export type LancamentoFormInput = z.infer<typeof lancamentoFormBaseSchema>;

export const LANCAMENTO_FORM_VAZIO: LancamentoFormInput = {
  contratoId: "",
  itemId: "",
  data: "",
  quantidade: "",
  kmInicial: "",
  kmFinal: "",
  estaca: "",
  localTexto: "",
  observacao: "",
  motivoExcesso: "",
};

/**
 * Contrato de rodovia exige km inicial e km final (spec, decisão do Tiago de 28/09/2026).
 *
 * `exigirMotivoExcesso`: true só quando o alerta de excesso está na tela (o banco acabou de
 * recusar por `MCEXC`) — exige pelo menos 3 letras antes de deixar reenviar, para não gastar uma
 * ida ao servidor com o campo vazio. O banco continua sendo quem de fato impede gravar sem motivo
 * (este check é só para poupar a chamada); editar um lançamento que já tinha motivo aceito, sem
 * excesso novo, não cai aqui (reenvia o texto existente sem exigir nada).
 */
export function lancamentoFormSchema(tipoLocalizacao: "rodovia" | "texto", exigirMotivoExcesso = false) {
  return lancamentoFormBaseSchema.superRefine((valores, ctx) => {
    if (tipoLocalizacao === "rodovia") {
      if (valores.kmInicial.trim() === "") {
        ctx.addIssue({ code: "custom", path: ["kmInicial"], message: "Informe o km inicial" });
      }
      if (valores.kmFinal.trim() === "") {
        ctx.addIssue({ code: "custom", path: ["kmFinal"], message: "Informe o km final" });
      }
    }
    if (exigirMotivoExcesso && valores.motivoExcesso.trim().length < 3) {
      ctx.addIssue({
        code: "custom",
        path: ["motivoExcesso"],
        message: "Informe o motivo do excesso (pelo menos 3 letras)",
      });
    }
  });
}
