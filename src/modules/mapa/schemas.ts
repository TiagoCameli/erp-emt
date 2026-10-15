import { z } from "zod";

import { CASAS_DINHEIRO } from "@/lib/casas-decimais";
import { idSchema, idSchemaCom } from "@/lib/id";
import {
  ESTADOS_MAQUINA,
  TIPOS_ALUGUEL,
  TIPOS_LOCAL,
} from "@/modules/mapa/tipos";

/**
 * O que as Server Actions do Mapa aceitam. Toda regra de negócio (zona, estado imposto, quem
 * pode entrar no mapa, locação em curso) mora nas RPCs do banco; aqui só se barra lixo antes
 * de chegar lá: coordenada fora da Terra, estado inventado, texto gigante, id torto.
 */

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const TEXTO_CURTO = 300;
const TEXTO_LONGO = 2000;

export const dataSchema = z
  .string()
  .regex(DATA_ISO, { error: "Data inválida" });
const dataOpcional = z.union([dataSchema, z.literal(""), z.null()]).optional();

export const longitudeSchema = z
  .number({ error: "Coordenada inválida" })
  .finite()
  .min(-180)
  .max(180);
export const latitudeSchema = z
  .number({ error: "Coordenada inválida" })
  .finite()
  .min(-90)
  .max(90);

export const estadoMaquinaSchema = z.enum(ESTADOS_MAQUINA, {
  error: "Estado inválido",
});

const motivoOpcional = z
  .string()
  .trim()
  .max(TEXTO_CURTO, { error: "Motivo longo demais" })
  .optional();

/** Trajeto do "em rota": de onde para onde, com o que (prancha própria ou terceiro). Texto livre. */
export const deslocamentoSchema = z
  .strictObject({
    origem: z.string().trim().max(TEXTO_CURTO).optional(),
    destino: z.string().trim().max(TEXTO_CURTO).optional(),
    transporte: z.string().trim().max(TEXTO_CURTO).optional(),
    previsao: dataOpcional,
  })
  .optional();

/**
 * Um item do arraste: para onde cada máquina foi. Só lng/lat são obrigatórios: o banco resolve
 * área/trecho/local de novo. `estado` só é exigido quando o ponto caiu fora de qualquer zona (a
 * tela resolve antes e pergunta; a RPC recusa sem ele).
 */
export const itemMovidoSchema = z.strictObject({
  id: idSchemaCom("Equipamento inválido"),
  lng: longitudeSchema,
  lat: latitudeSchema,
  estado: estadoMaquinaSchema.optional(),
});
export type ItemMovidoInput = z.infer<typeof itemMovidoSchema>;

/** Cada máquina vai para o próprio ponto (arrastar três juntas não as empilha num só). */
export const moverEquipamentosSchema = z.strictObject({
  itens: z
    .array(itemMovidoSchema)
    .min(1, { error: "Nenhum equipamento selecionado" })
    .max(200),
  data: dataSchema,
  motivo: motivoOpcional,
  /** Só corrige o ponto no mapa: não é transferência (estado, obra e frente ficam). */
  ajuste: z.boolean().optional(),
  deslocamento: deslocamentoSchema,
  conserto_motivo: z.string().trim().max(TEXTO_CURTO).optional(),
  conserto_previsao: dataOpcional,
});
export type MoverEquipamentosInput = z.infer<typeof moverEquipamentosSchema>;

export const marcarEstadoSchema = z.strictObject({
  id: idSchemaCom("Equipamento inválido"),
  estado: estadoMaquinaSchema,
  motivo: motivoOpcional,
  descricao: z
    .string()
    .trim()
    .max(TEXTO_LONGO, { error: "Descrição longa demais" })
    .optional(),
  deslocamento: deslocamentoSchema,
  previsao: dataOpcional,
});
export type MarcarEstadoInput = z.infer<typeof marcarEstadoSchema>;

export const assinalarOperadorSchema = z.strictObject({
  equipamentoId: idSchemaCom("Equipamento inválido"),
  /** null tira o operador. */
  colaboradorId: idSchemaCom("Colaborador inválido").nullable(),
  motivo: motivoOpcional,
});
export type AssinalarOperadorInput = z.infer<typeof assinalarOperadorSchema>;

export const moverPessoasSchema = z.strictObject({
  ids: z
    .array(idSchemaCom("Colaborador inválido"))
    .min(1, { error: "Nenhuma pessoa selecionada" })
    .max(200),
  destino: z.strictObject({
    lng: longitudeSchema.optional(),
    lat: latitudeSchema.optional(),
    frente_id: idSchema.optional(),
    obra_id: idSchema.optional(),
    equipe_id: idSchema.optional(),
    equipamento_id: idSchema.optional(),
    area_id: idSchema.optional(),
    localidade_id: idSchema.optional(),
  }),
  data: dataSchema,
  motivo: motivoOpcional,
});
export type MoverPessoasInput = z.infer<typeof moverPessoasSchema>;

function temCasasDemais(valor: number, casas: number): boolean {
  const escala = 10 ** casas;
  return Math.abs(Math.round(valor * escala) - valor * escala) > 1e-6;
}

/** Valor do aluguel: dinheiro (NUMERIC(12,2) em `mapa_locacoes.valor_unitario`). */
export const valorAluguelSchema = z
  .number({ error: "Informe o valor do aluguel" })
  .finite({ error: "Valor inválido" })
  .min(0, { error: "Valor não pode ser negativo" })
  .max(9_999_999_999.99, { error: "Valor acima do permitido" })
  .refine((v) => !temCasasDemais(v, CASAS_DINHEIRO), {
    error: "Use no máximo 2 casas decimais",
  });

/**
 * Início de locação. Ou `equipamentoId` (Colorado/alugada já cadastrada, fora do mapa) ou
 * `novo` (máquina de terceiro que ainda não existe no cadastro; a RPC a cria como alugada).
 */
export const iniciarLocacaoSchema = z
  .strictObject({
    equipamentoId: idSchemaCom("Equipamento inválido").nullable(),
    fornecedorId: idSchemaCom("Selecione o fornecedor"),
    tipoAluguel: z.enum(TIPOS_ALUGUEL, { error: "Escolha hora, dia ou mês" }),
    valorUnitario: valorAluguelSchema,
    inicio: dataOpcional,
    fimPrevisto: dataOpcional,
    medicaoInicio: z.number().finite().min(0).nullable().optional(),
    observacao: z.string().trim().max(TEXTO_LONGO).optional(),
    novo: z
      .strictObject({
        descricao: z
          .string()
          .trim()
          .min(1, { error: "Informe a descrição" })
          .max(TEXTO_CURTO),
        tipo: z
          .string()
          .trim()
          .min(1, { error: "Informe o tipo de máquina" })
          .max(100),
        marca: z.string().trim().max(100).optional(),
        modelo: z.string().trim().max(100).optional(),
        placa: z.string().trim().max(20).optional(),
      })
      .nullable()
      .optional(),
  })
  .refine(
    (v) =>
      v.equipamentoId !== null || (v.novo !== null && v.novo !== undefined),
    {
      error: "Escolha a máquina ou cadastre uma nova",
      path: ["equipamentoId"],
    },
  )
  .refine((v) => !v.inicio || !v.fimPrevisto || v.fimPrevisto >= v.inicio, {
    error: "Fim previsto anterior ao início",
    path: ["fimPrevisto"],
  });
export type IniciarLocacaoInput = z.infer<typeof iniciarLocacaoSchema>;

export const encerrarLocacaoSchema = z.strictObject({
  equipamentoId: idSchemaCom("Equipamento inválido"),
  fim: dataOpcional,
  medicaoFim: z.number().finite().min(0).nullable().optional(),
  motivo: motivoOpcional,
});
export type EncerrarLocacaoInput = z.infer<typeof encerrarLocacaoSchema>;

/**
 * Formulário de locação (texto nos campos numéricos, como os demais formulários do app). O
 * servidor valida de novo com `iniciarLocacaoSchema`, já em número.
 */
export const locacaoFormSchema = z.strictObject({
  origem: z.enum(["existente", "nova"]),
  equipamentoId: z.string(),
  fornecedorId: z.string().min(1, { error: "Selecione o fornecedor" }),
  tipoAluguel: z.enum(TIPOS_ALUGUEL, { error: "Escolha hora, dia ou mês" }),
  valorUnitario: z
    .string()
    .trim()
    .min(1, { error: "Informe o valor do aluguel" }),
  inicio: dataSchema,
  fimPrevisto: z.union([dataSchema, z.literal("")]),
  medicaoInicio: z.string().trim(),
  observacao: z.string().trim().max(TEXTO_LONGO),
  novaDescricao: z.string().trim().max(TEXTO_CURTO),
  novoTipo: z.string().trim().max(100),
  novaMarca: z.string().trim().max(100),
  novoModelo: z.string().trim().max(100),
  novaPlaca: z.string().trim().max(20),
});
export type LocacaoFormInput = z.infer<typeof locacaoFormSchema>;

/** Põe uma obra ativa do cadastro num ponto do mapa (o Mapa não cria obra). */
export const posicionarObraSchema = z.strictObject({
  obraId: idSchemaCom("Obra inválida"),
  lng: longitudeSchema,
  lat: latitudeSchema,
});
export type PosicionarObraInput = z.infer<typeof posicionarObraSchema>;

/**
 * Local no ponto tocado: `localidadeId` dá ponto a um local que já existe; sem ele, cria um
 * local novo (nome e tipo). `vincular` liga um tanque ou depósito do Estoque a esse local.
 */
export const colocarLocalSchema = z
  .strictObject({
    localidadeId: idSchemaCom("Local inválido").optional(),
    nome: z.string().trim().max(TEXTO_CURTO).optional(),
    tipo: z.enum(TIPOS_LOCAL, { error: "Tipo de local inválido" }).optional(),
    lng: longitudeSchema,
    lat: latitudeSchema,
    vincular: z
      .strictObject({
        alvo: z.enum(["tanque", "deposito"]),
        id: idSchemaCom("Cadastro inválido"),
      })
      .optional(),
  })
  .refine((v) => v.localidadeId || (v.nome && v.tipo), {
    error: "Informe o nome e o tipo do local",
  });
export type ColocarLocalInput = z.infer<typeof colocarLocalSchema>;

/** Liga um tanque ou depósito a um local que já está no mapa (sem tocar no mapa). */
export const vincularLocalSchema = z.strictObject({
  alvo: z.enum(["tanque", "deposito"]),
  id: idSchemaCom("Cadastro inválido"),
  localidadeId: idSchemaCom("Local inválido"),
});
export type VincularLocalInput = z.infer<typeof vincularLocalSchema>;
