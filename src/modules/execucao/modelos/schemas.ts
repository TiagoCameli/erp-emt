import { z } from "zod";

import { idSchema } from "@/lib/id";
import { lerNumeroColado } from "@/modules/execucao/_shared/numero";

/** yyyy-mm-dd que existe no calendário (recusa 2026-13-01 e 2026-02-30). */
export function dataValida(t: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
  const [a, m, d] = t.split("-").map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

const numero = (casas = 4) =>
  z
    .string()
    .optional()
    .transform((t, ctx) => {
      const lido = lerNumeroColado(t ?? "", casas);
      if (!lido.ok) {
        ctx.addIssue({ code: "custom", message: lido.erro });
        return z.NEVER;
      }
      return lido.valor;
    });
const horas = numero(2).refine((h) => h === null || (Number(h) >= 0 && Number(h) <= 24), "Horas de 0 a 24");

export const servicoSchema = z.object({
  codigo: z.string().trim().min(1, "Informe o código").max(30),
  nome: z.string().trim().min(2, "Informe o nome").max(200),
  unidadeId: idSchema.optional(),
  produtividadePadrao: numero().refine((p) => p === null || Number(p) > 0, "Produtividade maior que zero"),
  ceuAberto: z.boolean(),
  ativo: z.boolean(),
  observacoes: z.string().trim().max(2000).optional(),
});
export type ServicoInput = z.input<typeof servicoSchema>;
export function payloadDoServico(d: z.output<typeof servicoSchema>) {
  return {
    codigo: d.codigo,
    nome: d.nome,
    unidade_id: d.unidadeId ?? null,
    produtividade_padrao: d.produtividadePadrao,
    ceu_aberto: d.ceuAberto,
    ativo: d.ativo,
    observacoes: d.observacoes || null,
  };
}

const DIAS = ["horasSeg", "horasTer", "horasQua", "horasQui", "horasSex", "horasSab", "horasDom"] as const;

export const calendarioSchema = z
  .object({
    nome: z.string().trim().min(2, "Informe o nome").max(120),
    horasSeg: horas, horasTer: horas, horasQua: horas, horasQui: horas, horasSex: horas, horasSab: horas, horasDom: horas,
    feriadosAbrangencia: z.array(z.enum(["nacional", "AC", "municipal"])),
    municipio: z.string().trim().max(120).optional(),
    chuvosoInicioMes: z.number().int().min(1).max(12).optional(),
    chuvosoFimMes: z.number().int().min(1).max(12).optional(),
    padraoEmpresa: z.boolean(),
    observacoes: z.string().trim().max(2000).optional(),
  })
  .refine((d) => DIAS.some((dia) => Number(d[dia] ?? 0) > 0), { message: "Ao menos um dia da semana precisa ter horas", path: ["horasSeg"] })
  .refine((d) => (d.chuvosoInicioMes === undefined) === (d.chuvosoFimMes === undefined), {
    message: "Informe início e fim do período chuvoso juntos",
    path: ["chuvosoFimMes"],
  })
  .refine((d) => !d.feriadosAbrangencia.includes("municipal") || (d.municipio ?? "") !== "", {
    message: "Informe o município para usar feriados municipais",
    path: ["municipio"],
  });
export type CalendarioInput = z.input<typeof calendarioSchema>;
export function payloadDoCalendario(d: z.output<typeof calendarioSchema>) {
  return {
    nome: d.nome,
    horas_seg: d.horasSeg ?? "0", horas_ter: d.horasTer ?? "0", horas_qua: d.horasQua ?? "0", horas_qui: d.horasQui ?? "0",
    horas_sex: d.horasSex ?? "0", horas_sab: d.horasSab ?? "0", horas_dom: d.horasDom ?? "0",
    feriados_abrangencia: d.feriadosAbrangencia,
    municipio: d.municipio || null,
    chuvoso_inicio_mes: d.chuvosoInicioMes ?? null,
    chuvoso_fim_mes: d.chuvosoFimMes ?? null,
    padrao_empresa: d.padraoEmpresa,
    observacoes: d.observacoes || null,
  };
}

export const excecaoSchema = z.object({
  data: z.string().refine(dataValida, "Data inválida"),
  horas: horas.refine((h) => h !== null, "Informe as horas (0 para dia parado)"),
  tipo: z.enum(["feriado", "paralisacao", "extra"]),
  descricao: z.string().trim().min(1, "Descreva a exceção").max(200),
});
export type ExcecaoInput = z.input<typeof excecaoSchema>;

export const feriadoSchema = z
  .object({
    data: z.string().refine(dataValida, "Data inválida"),
    nome: z.string().trim().min(2, "Informe o nome").max(120),
    abrangencia: z.enum(["nacional", "AC", "municipal"]),
    municipio: z.string().trim().max(120).optional(),
  })
  .refine((d) => d.abrangencia !== "municipal" || (d.municipio ?? "") !== "", { message: "Informe o município", path: ["municipio"] });
export type FeriadoInput = z.input<typeof feriadoSchema>;
export function payloadDoFeriado(d: z.output<typeof feriadoSchema>) {
  return {
    data: d.data,
    nome: d.nome,
    abrangencia: d.abrangencia,
    municipio: d.abrangencia === "municipal" ? d.municipio || null : null,
  };
}
