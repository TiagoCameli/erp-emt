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
  /** Obra escolhida na confirmação; vence a obra da zona onde o ponto caiu. */
  obra_id: idSchemaCom("Obra inválida").optional(),
  /** "Sem obra" de propósito: a máquina sai da obra mesmo caindo numa zona de obra. */
  sem_obra: z.boolean().optional(),
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
  /** Desde quando vale o estado novo (v1.28). Hoje ou antes; o banco recusa depois de hoje. */
  data: dataSchema,
});
export type MarcarEstadoInput = z.infer<typeof marcarEstadoSchema>;

export const assinalarOperadorSchema = z.strictObject({
  equipamentoId: idSchemaCom("Equipamento inválido"),
  /** null tira o operador. */
  colaboradorId: idSchemaCom("Colaborador inválido").nullable(),
  motivo: motivoOpcional,
});
export type AssinalarOperadorInput = z.infer<typeof assinalarOperadorSchema>;

/** Centro de custo da pessoa no Mapa (não mexe no do cadastro nem na folha). */
export const centroCustoPessoaSchema = z.strictObject({
  colaboradorId: idSchemaCom("Colaborador inválido"),
  /** null tira o centro. */
  centroCustoId: idSchemaCom("Centro de custo inválido").nullable(),
});
export type CentroCustoPessoaInput = z.infer<typeof centroCustoPessoaSchema>;

/**
 * Um item do lote de alocação (fn_mapa_alocar). Campo ausente não mexe; null limpa. Local e obra
 * juntos: o local manda e a obra vai junto; só obra é "obra como local".
 */
const itemAlocacaoSchema = z.strictObject({
  colaboradorId: idSchemaCom("Colaborador inválido"),
  equipamentoId: idSchemaCom("Equipamento inválido").nullable().optional(),
  localidadeId: idSchemaCom("Local inválido").nullable().optional(),
  obraId: idSchemaCom("Obra inválida").nullable().optional(),
  centroCustoId: idSchemaCom("Centro de custo inválido").nullable().optional(),
});
export type ItemAlocacao = z.infer<typeof itemAlocacaoSchema>;

export const alocarSchema = z.strictObject({
  itens: z
    .array(itemAlocacaoSchema)
    .min(1, { error: "Nada para alocar" })
    .max(500, { error: "Lote grande demais" }),
  data: dataOpcional,
  motivo: motivoOpcional,
});
export type AlocarInput = z.infer<typeof alocarSchema>;

const destinoPessoaSchema = z.strictObject({
  lng: longitudeSchema.optional(),
  lat: latitudeSchema.optional(),
  frente_id: idSchema.optional(),
  obra_id: idSchema.optional(),
  equipe_id: idSchema.optional(),
  equipamento_id: idSchema.optional(),
  area_id: idSchema.optional(),
  localidade_id: idSchema.optional(),
});

export const moverPessoasSchema = z.strictObject({
  ids: z
    .array(idSchemaCom("Colaborador inválido"))
    .min(1, { error: "Nenhuma pessoa selecionada" })
    .max(200),
  destino: destinoPessoaSchema,
  data: dataSchema,
  motivo: motivoOpcional,
});
export type MoverPessoasInput = z.infer<typeof moverPessoasSchema>;

/**
 * Transferência em lote (seleção múltipla): cada pessoa com o próprio destino (o mesmo lugar, mas
 * cada uma num ponto, para os bonecos não se empilharem), a mesma data e o mesmo motivo.
 */
export const moverPessoasLoteSchema = z.strictObject({
  itens: z
    .array(
      z.strictObject({
        id: idSchemaCom("Colaborador inválido"),
        destino: destinoPessoaSchema,
      }),
    )
    .min(1, { error: "Nenhuma pessoa selecionada" })
    .max(200),
  data: dataSchema,
  motivo: motivoOpcional,
});
export type MoverPessoasLoteInput = z.infer<typeof moverPessoasLoteSchema>;

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
 * Jazida é de uma obra (Tiago, 16/10/2026): a máquina que opera nela trabalha para essa obra.
 * O banco recusa jazida ativa sem obra; aqui o aviso chega antes de tocar no mapa.
 */
export const ERRO_JAZIDA_SEM_OBRA = "Jazida precisa estar atrelada a uma obra";

/**
 * Local no ponto tocado: `localidadeId` dá ponto a um local que já existe; sem ele, cria um
 * local novo (nome e tipo). `vincular` liga um tanque ou depósito do Estoque a esse local.
 */
export const colocarLocalSchema = z
  .strictObject({
    localidadeId: idSchemaCom("Local inválido").optional(),
    nome: z.string().trim().max(TEXTO_CURTO).optional(),
    tipos: z
      .array(z.enum(TIPOS_LOCAL, { error: "Tipo de local inválido" }))
      .min(1, { error: "Escolha ao menos um tipo" })
      .optional(),
    lng: longitudeSchema,
    lat: latitudeSchema,
    /** Obra do local. Jazida nova tem de vir com ela (o banco também recusa). */
    obraId: idSchemaCom("Obra inválida").optional(),
    vincular: z
      .strictObject({
        alvo: z.enum(["tanque", "deposito"]),
        id: idSchemaCom("Cadastro inválido"),
      })
      .optional(),
  })
  .refine((v) => v.localidadeId || (v.nome && v.tipos), {
    error: "Informe o nome e o tipo do local",
  })
  .refine((v) => !v.tipos?.includes("jazida") || v.obraId, {
    error: ERRO_JAZIDA_SEM_OBRA,
  });
export type ColocarLocalInput = z.infer<typeof colocarLocalSchema>;

/** Liga um tanque ou depósito a um local que já está no mapa (sem tocar no mapa). */
export const vincularLocalSchema = z.strictObject({
  alvo: z.enum(["tanque", "deposito"]),
  id: idSchemaCom("Cadastro inválido"),
  localidadeId: idSchemaCom("Local inválido"),
});
export type VincularLocalInput = z.infer<typeof vincularLocalSchema>;

/** Raio da área do local, em metros; null volta ao padrão da configuração. */
export const raioLocalSchema = z.strictObject({
  localidadeId: idSchemaCom("Local inválido"),
  raioM: z
    .number({ error: "Raio inválido" })
    .min(10, { error: "Raio mínimo de 10 m" })
    .max(5000, { error: "Raio máximo de 5 km" })
    .nullable(),
});
export type RaioLocalInput = z.infer<typeof raioLocalSchema>;

/** Rumo da máquina em graus (qualquer valor; o banco normaliza para 0..360); null = segue a pista. */
export const girarEquipamentoSchema = z.strictObject({
  equipamentoId: idSchemaCom("Equipamento inválido"),
  rumo: z.number({ error: "Rumo inválido" }).finite().nullable(),
});
export type GirarEquipamentoInput = z.infer<typeof girarEquipamentoSchema>;

/** Pedreira da volta da carreta depois daquele frete; null volta à última de onde ela saiu. */
export const escolherPedreiraSchema = z.strictObject({
  equipamentoId: idSchemaCom("Equipamento inválido"),
  freteId: idSchemaCom("Frete inválido"),
  localidadeId: idSchemaCom("Pedreira inválida").nullable(),
});
export type EscolherPedreiraInput = z.infer<typeof escolherPedreiraSchema>;

/** Nome e tipos de um local (sem mexer no ponto). */
export const editarLocalSchema = z
  .strictObject({
    localidadeId: idSchemaCom("Local inválido"),
    nome: z
      .string()
      .trim()
      .min(1, { error: "Informe o nome do local" })
      .max(TEXTO_CURTO),
    tipos: z
      .array(z.enum(TIPOS_LOCAL, { error: "Tipo de local inválido" }))
      .min(1, { error: "Escolha ao menos um tipo" }),
    /** Obra do local; null não mexe na que ele tem. Jazida exige obra. */
    obraId: idSchemaCom("Obra inválida").nullable(),
  })
  .refine((v) => !v.tipos.includes("jazida") || v.obraId, {
    error: ERRO_JAZIDA_SEM_OBRA,
  });
export type EditarLocalInput = z.infer<typeof editarLocalSchema>;

/** Inativa o local: some do mapa e das listas; quem estava nele fica onde está. */
export const inativarLocalSchema = z.strictObject({
  localidadeId: idSchemaCom("Local inválido"),
});
export type InativarLocalInput = z.infer<typeof inativarLocalSchema>;

const coordenadaSchema = z.tuple([longitudeSchema, latitudeSchema]);

/**
 * Desenho da obra: pavimentação = linha (início, curvas, fim; km inicial e final obrigatórios no
 * banco) ou edificação = polígono com 4 cantos ou mais (o fechamento é montado aqui).
 */
export const desenharObraSchema = z.discriminatedUnion("forma", [
  z.strictObject({
    forma: z.literal("trecho"),
    obraId: idSchemaCom("Obra inválida"),
    pontos: z
      .array(coordenadaSchema)
      .min(2, { error: "Toque o ponto inicial e o final" })
      .max(5000),
    rodovia: z.string().trim().max(TEXTO_CURTO).optional(),
    kmInicial: z.number({ error: "Km inicial inválido" }).finite(),
    kmFinal: z.number({ error: "Km final inválido" }).finite(),
    substituir: z.boolean(),
  }),
  z.strictObject({
    forma: z.literal("area"),
    obraId: idSchemaCom("Obra inválida"),
    pontos: z
      .array(coordenadaSchema)
      .min(4, { error: "Toque ao menos 4 cantos" })
      .max(500),
    substituir: z.boolean(),
  }),
]);
export type DesenharObraInput = z.infer<typeof desenharObraSchema>;

export const tirarObraSchema = z.strictObject({
  obraId: idSchemaCom("Obra inválida"),
});

/** Põe ou move um tanque, pilha ou depósito do Estoque no mapa. */
export const posicionarObjetoSchema = z.strictObject({
  alvo: z.enum(["tanque", "pilha", "deposito"]),
  id: idSchemaCom("Cadastro inválido"),
  lng: longitudeSchema,
  lat: latitudeSchema,
});
export type PosicionarObjetoInput = z.infer<typeof posicionarObjetoSchema>;

/** Acopla o implemento no equipamento; equipamentoId null desacopla. */
export const acoplarImplementoSchema = z.strictObject({
  implementoId: idSchemaCom("Implemento inválido"),
  equipamentoId: idSchemaCom("Equipamento inválido").nullable(),
});
export type AcoplarImplementoInput = z.infer<typeof acoplarImplementoSchema>;

/** Marca "atende vários centros" da máquina (os dias dela vão para Equipamento Sem Alocação). */
export const variosCentrosSchema = z.strictObject({
  equipamentoId: idSchemaCom("Equipamento inválido"),
  valor: z.boolean({ error: "Informe se atende vários centros" }),
});
export type VariosCentrosInput = z.infer<typeof variosCentrosSchema>;

/** Trabalhando/parado da pessoa, marcado na ficha: parado manda os dias para Pessoal Sem Alocação. */
export const estadoPessoaSchema = z.strictObject({
  colaboradorId: idSchemaCom("Colaborador inválido"),
  estado: z.enum(["trabalhando", "parado"], {
    error: "Estado inválido: use trabalhando ou parado",
  }),
});
export type EstadoPessoaInput = z.infer<typeof estadoPessoaSchema>;

/** Tamanho do depósito no mapa, em metros (os mesmos limites do banco). */
export const tamanhoDepositoSchema = z.strictObject({
  id: idSchemaCom("Depósito inválido"),
  largura: z
    .number({ error: "Informe a largura" })
    .positive({ error: "A largura precisa ser maior que zero" })
    .max(500, { error: "Largura até 500 m" }),
  comprimento: z
    .number({ error: "Informe o comprimento" })
    .positive({ error: "O comprimento precisa ser maior que zero" })
    .max(500, { error: "Comprimento até 500 m" }),
  altura: z
    .number({ error: "Informe a altura" })
    .positive({ error: "A altura precisa ser maior que zero" })
    .max(100, { error: "Altura até 100 m" }),
});
export type TamanhoDepositoInput = z.infer<typeof tamanhoDepositoSchema>;

/** Rumo do depósito no mapa (graus; o banco normaliza para 0 a 360). */
export const rumoDepositoSchema = z.strictObject({
  id: idSchemaCom("Depósito inválido"),
  rumo: z
    .number({ error: "Informe o rumo" })
    .min(-360, { error: "Rumo inválido" })
    .max(720, { error: "Rumo inválido" }),
});
export type RumoDepositoInput = z.infer<typeof rumoDepositoSchema>;
