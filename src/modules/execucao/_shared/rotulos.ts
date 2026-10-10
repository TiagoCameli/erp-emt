/** Rótulos da Execução. Os valores são os mesmos dos CHECKs do banco (migration 20261012100000). */

export const TIPOS_OBRA = ["edificacao", "rodovia", "pequena"] as const;
export type TipoObra = (typeof TIPOS_OBRA)[number];
export const ROTULO_TIPO_OBRA: Record<TipoObra, string> = {
  edificacao: "Edificação",
  rodovia: "Rodovia",
  pequena: "Obra pequena",
};

export const STATUS_CRONOGRAMA = ["rascunho", "ativo", "concluido", "arquivado"] as const;
export type StatusCronograma = (typeof STATUS_CRONOGRAMA)[number];
export const ROTULO_STATUS_CRONOGRAMA: Record<StatusCronograma, string> = {
  rascunho: "Rascunho",
  ativo: "Ativo",
  concluido: "Concluído",
  arquivado: "Arquivado",
};

export const TIPOS_LOCAL = ["bloco", "pavimento", "ambiente", "peca", "segmento", "outro"] as const;
export type TipoLocal = (typeof TIPOS_LOCAL)[number];
export const ROTULO_TIPO_LOCAL: Record<TipoLocal, string> = {
  bloco: "Bloco",
  pavimento: "Pavimento",
  ambiente: "Ambiente",
  peca: "Peça",
  segmento: "Segmento",
  outro: "Outro",
};

export const TIPOS_ATIVIDADE = ["resumo", "atividade", "marco"] as const;
export type TipoAtividade = (typeof TIPOS_ATIVIDADE)[number];
export const ROTULO_TIPO_ATIVIDADE: Record<TipoAtividade, string> = {
  resumo: "Resumo",
  atividade: "Atividade",
  marco: "Marco",
};

export const TIPOS_VINCULO = ["TI", "II", "TT", "IT"] as const;
export type TipoVinculo = (typeof TIPOS_VINCULO)[number];
export const ROTULO_TIPO_VINCULO: Record<TipoVinculo, string> = {
  TI: "Término a início",
  II: "Início a início",
  TT: "Término a término",
  IT: "Início a término",
};

export const CRITERIOS_PESO = ["duracao", "valor", "homem_hora", "manual"] as const;
export type CriterioPeso = (typeof CRITERIOS_PESO)[number];
export const ROTULO_CRITERIO_PESO: Record<CriterioPeso, string> = {
  duracao: "Duração",
  valor: "Valor orçado",
  homem_hora: "Homem-hora",
  manual: "Peso manual",
};

export const LADOS = ["LD", "LE", "eixo", "ambos"] as const;
export type Lado = (typeof LADOS)[number];
export const ROTULO_LADO: Record<Lado, string> = { LD: "Lado direito", LE: "Lado esquerdo", eixo: "Eixo", ambos: "Ambos" };
