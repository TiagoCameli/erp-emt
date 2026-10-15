/**
 * O que a tela do Mapa recebe de `fn_mapa_estado()` (uma chamada, tudo que o mapa desenha) e o
 * vocabulário do módulo. Posição é sempre [lng, lat], a ordem do GeoJSON e do deck.gl.
 *
 * Espelha a especificação `docs/modulos/mapa.md` (v1.3) e as views da migration
 * `supabase/migrations/20261014120000_modulo_mapa_v1.sql`.
 */

export type Posicao = [number, number];

/** Estados que a pessoa escolhe (os do banco, `mapa_equipamentos.estado`). */
export const ESTADOS_MAQUINA = [
  "operando",
  "parado",
  "em_rota",
  "quebrado_obra",
  "conserto",
] as const;
export type EstadoMaquina = (typeof ESTADOS_MAQUINA)[number];

/** O que a view devolve em `estado_efetivo`: os cinco acima mais os dois que o cadastro impõe. */
export type EstadoEfetivo =
  | EstadoMaquina
  | "sem_posicao"
  | "fora_funcionamento";

export const ROTULO_ESTADO: Record<EstadoEfetivo, string> = {
  operando: "Operando",
  parado: "Parado",
  em_rota: "Em rota",
  quebrado_obra: "Quebrado na obra",
  conserto: "Em conserto",
  sem_posicao: "Sem posição",
  fora_funcionamento: "Fora de funcionamento",
};

export type Propriedade = "propria" | "colorado" | "alugada";

export const ROTULO_PROPRIEDADE: Record<Propriedade, string> = {
  propria: "Própria",
  colorado: "Colorado",
  alugada: "Alugada",
};

export const TIPOS_ALUGUEL = ["hora", "dia", "mes"] as const;
export type TipoAluguel = (typeof TIPOS_ALUGUEL)[number];
export const ROTULO_TIPO_ALUGUEL: Record<TipoAluguel, string> = {
  hora: "Por hora",
  dia: "Por dia",
  mes: "Por mês",
};

export interface LocacaoMapa {
  id: string;
  locadorId: string | null;
  locadorNome: string;
  tipoAluguel: TipoAluguel | null;
  valorUnitario: number;
  inicio: string | null;
  fimPrevisto: string | null;
  custoEstimado: number | null;
}

export interface EquipamentoMapa {
  id: string;
  codigo: string;
  descricao: string;
  tipo: string;
  marca: string;
  modelo: string;
  placa: string;
  propriedade: Propriedade;
  /** Chave em `mapa_modelos_3d` (vibroacabadora, caminhao_pipa...). */
  modelo3d: string;
  /** Null enquanto ninguém posicionou (estado `sem_posicao`). */
  pos: Posicao | null;
  /** Graus a partir do norte, sentido horário. */
  heading: number;
  fontePosicao: "manual" | "gps";
  estado: EstadoEfetivo;
  estadoDesde: string | null;
  diasNoEstado: number | null;
  obraId: string | null;
  obraNome: string;
  trechoId: string | null;
  trechoNome: string;
  frenteId: string | null;
  frenteNome: string;
  areaId: string | null;
  areaNome: string;
  localidadeId: string | null;
  localidadeNome: string;
  km: number | null;
  operadorId: string | null;
  operadorNome: string;
  deslocamento: Record<string, unknown> | null;
  quebraDescricao: string;
  observacao: string;
  consertoMotivo: string;
  consertoPrevisao: string | null;
  consertoDesde: string | null;
  osAbertas: number;
  ultimoAbastecimento: string | null;
  ultimaMedicao: number | null;
  locacao: LocacaoMapa | null;
}

/** Colorado e alugadas fora do mapa: candidatas a "Adicionar máquina alugada". */
export interface EquipamentoForaDoMapa {
  id: string;
  codigo: string;
  descricao: string;
  tipo: string;
  marca: string;
  modelo: string;
  propriedade: Propriedade;
  modelo3d: string;
}

export interface PessoaMapa {
  id: string;
  nome: string;
  funcao: string;
  vinculo: string;
  equipeId: string | null;
  equipeNome: string;
  obraId: string | null;
  frenteId: string | null;
  equipamentoId: string | null;
  areaId: string | null;
  localidadeId: string | null;
  pos: Posicao | null;
  posicaoManual: boolean;
}

export interface TrechoMapa {
  id: string;
  obraId: string;
  obraNome: string;
  trechoPaiId: string | null;
  nome: string;
  rodovia: string;
  kmInicial: number;
  kmFinal: number;
  /** Hex (#rrggbb) ou vazio. */
  cor: string;
  ordem: number;
  /** Traçado em [lng, lat]; MultiLineString vira os pedaços emendados na ordem. */
  pontos: Posicao[];
}

export const TIPOS_AREA = [
  "patio_obra",
  "zona_patio_central",
  "zona_oficina",
  "terreno",
  "jazida",
  "canteiro",
  "edificacao",
] as const;
export type TipoArea = (typeof TIPOS_AREA)[number] | (string & {});

export const ROTULO_TIPO_AREA: Record<string, string> = {
  patio_obra: "Pátio de obra",
  zona_patio_central: "Pátio central",
  zona_oficina: "Oficina",
  terreno: "Terreno",
  jazida: "Jazida",
  canteiro: "Canteiro",
  edificacao: "Edificação",
};

export interface AreaMapa {
  id: string;
  nome: string;
  tipo: TipoArea;
  obraId: string | null;
  obraNome: string;
  localidadeId: string | null;
  atributos: Record<string, unknown>;
  /** Anéis do polígono (o primeiro é o contorno); MultiPolygon vira vários polígonos. */
  poligonos: Posicao[][][];
  centro: Posicao | null;
}

export interface LocalidadeMapa {
  id: string;
  nome: string;
  tipo: string;
  obraId: string | null;
  fornecedorId: string | null;
  pos: Posicao;
}

export interface FrenteHoje {
  id: string;
  obraId: string | null;
  trechoId: string | null;
  areaId: string | null;
  data: string;
  nome: string;
  servico: string;
  kmInicial: number | null;
  kmFinal: number | null;
  observacao: string;
}

export interface Modelo3d {
  chave: string;
  nome: string;
  /** Caminho do GLB servido pelo app (/mapa-modelos/<chave>.glb) ou vazio. */
  arquivo: string;
  escala: number;
  versao: number;
}

export interface FornecedorOpcao {
  id: string;
  nome: string;
}

export interface ConfigMapa {
  snapTracadoM: number;
  snapLocalM: number;
  fornecedorColorado: string | null;
  tiposForaDoMapa: string[];
}

export interface EstadoMapa {
  geradoEm: string;
  hoje: string;
  config: ConfigMapa;
  modelos: Modelo3d[];
  equipamentos: EquipamentoMapa[];
  foraDoMapa: EquipamentoForaDoMapa[];
  pessoas: PessoaMapa[];
  trechos: TrechoMapa[];
  areas: AreaMapa[];
  localidades: LocalidadeMapa[];
  frentesHoje: FrenteHoje[];
  fornecedores: FornecedorOpcao[];
}

/** O que a pessoa pode fazer na tela, decidido no servidor pelo catálogo de permissões. */
export interface PermissoesMapa {
  editar: boolean;
  criar: boolean;
}

/** Chave da configuração do Google Maps que chega ao cliente (as duas são NEXT_PUBLIC). */
export interface ConfigGoogle {
  chave: string;
  mapId: string;
}
